const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const Storage = require("../assets/js/inventory-storage.js");
const Engine = require("../assets/js/inventory-engine.js");
const Validator = require("../assets/js/inventory-validator.js");
const now = "2026-11-18T14:20:00.000Z";

function remainder(id) {
  return {
    id, materialId: "MAT-RECOVERY", widthCm: 40, heightCm: 30,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-OLD", sourceSheetId: "SHEET-" + id,
    createdAt: now, updatedAt: now, version: 1
  };
}
function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(Storage.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database masih digunakan."));
  });
}
function createVersionOneDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(Storage.DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("materials", { keyPath: "id" });
      db.createObjectStore("jobs", { keyPath: "id" });
      const remainders = db.createObjectStore("remainders", { keyPath: "id" });
      remainders.createIndex("status", "status", { unique: false });
      remainders.createIndex("materialId", "materialId", { unique: false });
      remainders.createIndex("originJobId", "originJobId", { unique: false });
      const reservations = db.createObjectStore("reservations", { keyPath: "id" });
      reservations.createIndex("remainderId", "remainderId", { unique: false });
      reservations.createIndex("jobId", "jobId", { unique: false });
      reservations.createIndex("status", "status", { unique: false });
      const movements = db.createObjectStore("movements", { keyPath: "id" });
      movements.createIndex("remainderId", "remainderId", { unique: false });
      movements.createIndex("jobId", "jobId", { unique: false });
      movements.createIndex("timestamp", "timestamp", { unique: false });
      db.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["materials", "jobs", "remainders", "reservations"], "readwrite");
      tx.objectStore("materials").put({
        id: "MAT-RECOVERY", name: "Material Uji Legacy", category: "triplek",
        thicknessMm: 8, surface: null, grainRequired: false, motif: "plain",
        rotationPolicy: "free", active: true
      });
      tx.objectStore("jobs").put({
        id: "JOB-OLD", name: "Pekerjaan asal lama", status: "archived",
        createdAt: now, closedAt: now
      });
      tx.objectStore("jobs").put({
        id: "JOB-LEGACY", name: "Pekerjaan reservasi lama", status: "open",
        createdAt: now, closedAt: null
      });
      tx.objectStore("remainders").put({
        ...remainder("LEGACY-REM"), status: "reserved"
      });
      tx.objectStore("remainders").put({
        ...remainder("LEGACY-REM-2"), status: "reserved"
      });
      tx.objectStore("reservations").put({
        id: "LEGACY-RSV", remainderId: "LEGACY-REM", jobId: "JOB-LEGACY",
        status: "active", createdAt: now, releasedAt: null, consumedAt: null
      });
      tx.objectStore("reservations").put({
        id: "LEGACY-RSV-2", remainderId: "LEGACY-REM-2", jobId: "JOB-LEGACY",
        status: "active", createdAt: now, releasedAt: null, consumedAt: null
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function main() {
  await deleteDatabase();
  let storage = Storage.createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  const engine = Engine.createInventoryEngine({ storage });
  await storage.add("materials", {
    id: "MAT-RECOVERY", name: "Material Uji", category: "triplek",
    thicknessMm: 8, surface: null, grainRequired: false, motif: "plain",
    rotationPolicy: "free", active: true
  });
  for (const id of ["JOB-OLD", "JOB-RECOVERY", "JOB-NEW-ONLY", "JOB-STATUS-GUARD", "JOB-COMPLETE-RELOAD"]) {
    await storage.add("jobs", {
      id, name: id, status: "open", createdAt: now, closedAt: null
    });
  }
  await storage.add("remainders", remainder("REC-REM-1"));
  await storage.add("remainders", remainder("REC-REM-2"));

  const reserved = await engine.reservePlan({
    plan: {
      inventoryUsage: [
        { remainderId: "REC-REM-1", placedCount: 1 },
        { remainderId: "REC-REM-2", placedCount: 1 }
      ],
      usableRemainders: [], sheets: []
    },
    jobId: "JOB-RECOVERY",
    material: { id: "MAT-RECOVERY", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    grainDirection: "none", timestamp: now
  });
  assert.ok(reserved.planId);
  const saved = await storage.get("plans", reserved.planId);
  assert.equal(saved.status, "reserved");
  assert.deepEqual(saved.plan.inventoryUsage, reserved.plan.inventoryUsage);
  const exported = await storage.exportJSON();
  const validation = Validator.validateInventoryBundle(exported);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.ok(exported.plans.plans.some(item => item.id === reserved.planId));
  assert.equal((await storage.get("remainders", "REC-REM-1")).status, "reserved");
  assert.equal((await storage.get("remainders", "REC-REM-2")).status, "reserved");
  const reportBeforeReload = await storage.getRecoveryReport();
  assert.equal(reportBeforeReload.activePlans.length, 1);
  assert.equal(reportBeforeReload.activeReservations.length, 2);
  assert.deepEqual(reportBeforeReload.orphanedReservations, []);
  assert.deepEqual(reportBeforeReload.orphanedRemainders, []);
  assert.deepEqual(reportBeforeReload.multiplyReservedRemainders, []);
  assert.deepEqual(reportBeforeReload.reservationsWithoutSource, []);
  await assert.rejects(storage.releaseReservations({
    reservationIds: [reserved.reservations[0].id],
    planId: reserved.planId,
    timestamp: now
  }));
  assert.equal((await storage.get("remainders", "REC-REM-1")).status, "reserved");
  assert.equal((await storage.get("remainders", "REC-REM-2")).status, "reserved");
  assert.equal((await storage.get("plans", reserved.planId)).status, "reserved");
  await storage.close();

  storage = Storage.createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  const recoveredEngine = Engine.createInventoryEngine({ storage });
  // Pemulihan wajib menolak data sumber yang tidak lagi cocok dengan reservasi.
  const originalRemainder = await storage.get("remainders", "REC-REM-1");
  const originalReservation = await storage.get("reservations", reserved.reservations[0].id);
  await storage.update("remainders", "REC-REM-1", { status: "available" });
  await assert.rejects(recoveredEngine.restorePlan(reserved.planId), /Sumber inventaris/);
  await storage.put("remainders", originalRemainder);
  await storage.update("reservations", originalReservation.id, { jobId: "JOB-OLD" });
  await assert.rejects(recoveredEngine.restorePlan(reserved.planId), /Hubungan reservasi/);
  await storage.put("reservations", originalReservation);
  await storage.remove("remainders", "REC-REM-1");
  await assert.rejects(recoveredEngine.restorePlan(reserved.planId), /Sumber inventaris/);
  await storage.add("remainders", originalRemainder);
  console.log("LULUS: pemulihan menolak sumber hilang, status sumber salah, dan hubungan pekerjaan yang tidak cocok.");

  const recovered = await recoveredEngine.restorePlan(reserved.planId);
  assert.equal(recovered.planId, reserved.planId);
  assert.equal(recovered.reservations.length, 2);
  assert.equal(recovered.inventoryUsage[0].reservationId, reserved.reservations[0].id);

  // Laporan harus mendeteksi reservasi aktif yang tertinggal pada rencana batal.
  const originalPlan = await storage.get("plans", reserved.planId);
  await storage.put("plans", { ...originalPlan, status: "cancelled" });
  const inconsistentReport = await storage.getRecoveryReport();
  assert.ok(inconsistentReport.inconsistentPlans.some(item => item.id === reserved.planId));
  assert.ok(inconsistentReport.inconsistentReservations.some(item =>
    item.planId === reserved.planId && item.status === "active"
  ));
  await storage.put("plans", originalPlan);
  console.log("LULUS: laporan mendeteksi reservasi aktif yang tidak sesuai dengan rencana cancelled.");

  // Audit harus memeriksa hubungan pekerjaan, sumber, dan status sumber aktif.
  const auditReservation = await storage.get("reservations", reserved.reservations[0].id);
  await storage.update("reservations", auditReservation.id, { jobId: "JOB-WRONG" });
  const wrongJobReport = await storage.getRecoveryReport();
  assert.ok(wrongJobReport.inconsistentReservations.some(item => item.id === auditReservation.id));
  assert.ok(wrongJobReport.inconsistentPlans.some(item => item.id === reserved.planId));
  await storage.put("reservations", auditReservation);

  // Reservasi aktif legacy tanpa planId harus ditandai sebagai yatim, tetapi
  // tetap dicatat dalam kelompok riwayat tanpa tautan agar tidak dihapus.
  await storage.update("reservations", auditReservation.id, { planId: null });
  const activeLegacyLinkReport = await storage.getRecoveryReport();
  assert.ok(activeLegacyLinkReport.orphanedReservations.some(item => item.id === auditReservation.id));
  assert.ok(activeLegacyLinkReport.legacyReservationsWithoutPlan.some(item => item.id === auditReservation.id));
  await storage.put("reservations", auditReservation);

  // Laporan juga harus mendeteksi snapshot historis yang pekerjaan induknya hilang.
  const auditPlan = await storage.get("plans", reserved.planId);
  await storage.update("plans", auditPlan.id, { jobId: "JOB-MISSING-HISTORIC" });
  const missingPlanJobReport = await storage.getRecoveryReport();
  assert.ok(missingPlanJobReport.plansWithoutJob.some(item => item.id === auditPlan.id));
  assert.ok(missingPlanJobReport.inconsistentPlans.some(item => item.id === auditPlan.id));
  await storage.put("plans", auditPlan);

  await storage.update("reservations", auditReservation.id, { remainderId: "REC-REM-MISSING" });
  const wrongSourceReport = await storage.getRecoveryReport();
  assert.ok(wrongSourceReport.inconsistentReservations.some(item => item.id === auditReservation.id));
  assert.ok(wrongSourceReport.inconsistentPlans.some(item => item.id === reserved.planId));
  await storage.put("reservations", auditReservation);

  const auditRemainder = await storage.get("remainders", auditReservation.remainderId);
  await storage.update("remainders", auditRemainder.id, { status: "available" });
  const wrongSourceStatusReport = await storage.getRecoveryReport();
  assert.ok(wrongSourceStatusReport.inconsistentReservations.some(item => item.id === auditReservation.id));
  assert.ok(wrongSourceStatusReport.inconsistentPlans.some(item => item.id === reserved.planId));
  await storage.put("remainders", auditRemainder);
  console.log("LULUS: audit mendeteksi jobId, remainderId, dan status sumber yang tidak cocok.");

  // Audit riwayat pergerakan mendeteksi transisi yang terputus tanpa
  // mengubah stok atau riwayat yang sedang diperiksa.
  await storage.add("remainders", remainder("REC-REM-MOVEMENT-AUDIT"));
  await storage.add("movements", {
    id: "MOV-AUDIT-INITIAL", remainderId: "REC-REM-MOVEMENT-AUDIT",
    type: "created", jobId: "JOB-OLD", timestamp: now,
    fromStatus: null, toStatus: "available"
  });
  await storage.add("movements", {
    id: "MOV-AUDIT-BROKEN", remainderId: "REC-REM-MOVEMENT-AUDIT",
    type: "discarded", jobId: "JOB-OLD", timestamp: "2026-11-18T15:20:00.000Z",
    fromStatus: "reserved", toStatus: "discarded"
  });
  const movementAudit = await storage.getRecoveryReport();
  assert.ok(movementAudit.movementHistoryIssues.some(item =>
    item.remainderId === "REC-REM-MOVEMENT-AUDIT" &&
    item.type === "broken_transition" && item.severity === "error"
  ));
  assert.equal((await storage.get("remainders", "REC-REM-MOVEMENT-AUDIT")).status, "available");

  // Riwayat reservasi yang menunjuk ID reservasi yang tidak ada harus
  // terdeteksi oleh laporan pemulihan database lokal.
  await storage.add("remainders", remainder("REC-REM-MISSING-RESERVATION"));
  await storage.add("movements", {
    id: "MOV-MISSING-RESERVATION",
    remainderId: "REC-REM-MISSING-RESERVATION",
    type: "reserved", jobId: "JOB-OLD", timestamp: now,
    fromStatus: "available", toStatus: "reserved",
    referenceId: "RSV-DOES-NOT-EXIST"
  });
  const missingReservationMovementReport = await storage.getRecoveryReport();
  assert.ok(missingReservationMovementReport.movementHistoryIssues.some(item =>
    item.remainderId === "REC-REM-MISSING-RESERVATION" &&
    item.type === "missing_reservation" && item.severity === "error"
  ));
  // Setiap tautan movement ke reservasi diperiksa untuk sumber, pekerjaan,
  // status terminal, dan timestamp; bukan hanya keberadaan ID reservasi.
  const reservationMovementCases = [
    {
      remainderId: "REC-REM-RESV-SOURCE",
      reservationId: "RSV-AUDIT-SOURCE",
      reservationRemainderId: "REC-REM-RESV-SOURCE-OTHER",
      movementType: "reserved",
      movementJobId: "JOB-OLD",
      reservationJobId: "JOB-OLD",
      reservationStatus: "active",
      createdAt: now,
      movementTimestamp: now,
      expectedIssue: "reservation_source_mismatch"
    },
    {
      remainderId: "REC-REM-RESV-JOB",
      reservationId: "RSV-AUDIT-JOB",
      reservationRemainderId: "REC-REM-RESV-JOB",
      movementType: "reserved",
      movementJobId: "JOB-WRONG",
      reservationJobId: "JOB-OLD",
      reservationStatus: "active",
      createdAt: now,
      movementTimestamp: now,
      expectedIssue: "reservation_job_mismatch"
    },
    {
      remainderId: "REC-REM-RESV-STATUS",
      reservationId: "RSV-AUDIT-STATUS",
      reservationRemainderId: "REC-REM-RESV-STATUS",
      movementType: "reservation_released",
      movementJobId: "JOB-OLD",
      reservationJobId: "JOB-OLD",
      reservationStatus: "active",
      createdAt: now,
      movementTimestamp: now,
      expectedIssue: "reservation_status_mismatch"
    },
    {
      remainderId: "REC-REM-RESV-TIMESTAMP",
      reservationId: "RSV-AUDIT-TIMESTAMP",
      reservationRemainderId: "REC-REM-RESV-TIMESTAMP",
      movementType: "reserved",
      movementJobId: "JOB-OLD",
      reservationJobId: "JOB-OLD",
      reservationStatus: "active",
      createdAt: now,
      movementTimestamp: "2026-11-18T12:01:00.000Z",
      expectedIssue: "reservation_timestamp_mismatch"
    }
  ];
  for (const item of reservationMovementCases) {
    await storage.add("remainders", remainder(item.remainderId));
    if (item.reservationRemainderId !== item.remainderId) {
      await storage.add("remainders", remainder(item.reservationRemainderId));
    }
    await storage.add("reservations", {
      id: item.reservationId,
      remainderId: item.reservationRemainderId,
      jobId: item.reservationJobId,
      status: item.reservationStatus,
      createdAt: item.createdAt,
      releasedAt: null,
      consumedAt: null
    });
    await storage.add("movements", {
      id: "MOV-" + item.reservationId,
      remainderId: item.remainderId,
      type: item.movementType,
      jobId: item.movementJobId,
      timestamp: item.movementTimestamp,
      fromStatus: item.movementType === "reserved" ? "available" : "reserved",
      toStatus: item.movementType === "reserved" ? "reserved" : "available",
      referenceId: item.reservationId
    });
  }
  const reservationMovementAudit = await storage.getRecoveryReport();
  for (const item of reservationMovementCases) {
    assert.ok(reservationMovementAudit.movementHistoryIssues.some(issue =>
      issue.movementId === "MOV-" + item.reservationId &&
      issue.type === item.expectedIssue &&
      issue.severity === "error"
    ), "Harus mendeteksi " + item.expectedIssue);
  }
  console.log("LULUS: audit movement memeriksa kecocokan sumber, pekerjaan, status, dan timestamp reservasi.");

  // Riwayat aktivitas tanpa catatan awal harus terlihat, tetapi record legacy
  // tidak boleh langsung dianggap rusak fatal.
  await storage.add("remainders", remainder("REC-REM-MISSING-ORIGIN-LEGACY"));
  await storage.add("movements", {
    id: "MOV-MISSING-ORIGIN-LEGACY",
    remainderId: "REC-REM-MISSING-ORIGIN-LEGACY",
    type: "condition_changed", jobId: "JOB-OLD", timestamp: now,
    fromStatus: "available", toStatus: "available"
  });
  const missingLegacyOriginReport = await storage.getRecoveryReport();
  assert.ok(missingLegacyOriginReport.movementHistoryIssues.some(item =>
    item.remainderId === "REC-REM-MISSING-ORIGIN-LEGACY" &&
    item.type === "missing_origin" && item.severity === "warning"
  ));

  // Riwayat yang hilang seluruhnya pada sisa modern juga merupakan error,
  // bukan sekadar peringatan missing_history.
  const modernWithoutAnyHistory = remainder("REC-REM-MODERN-NO-HISTORY");
  modernWithoutAnyHistory.sourceType = "new";
  await storage.add("remainders", modernWithoutAnyHistory);
  const modernNoHistoryReport = await storage.getRecoveryReport();
  assert.ok(modernNoHistoryReport.movementHistoryIssues.some(item =>
    item.remainderId === "REC-REM-MODERN-NO-HISTORY" &&
    item.type === "missing_origin" && item.severity === "error"
  ));

  // Sisa dengan metadata modern wajib memiliki catatan pembuatan.
  const modernMissingOrigin = remainder("REC-REM-MISSING-ORIGIN-MODERN");
  modernMissingOrigin.sourceType = "new";
  await storage.add("remainders", modernMissingOrigin);
  await storage.add("movements", {
    id: "MOV-MISSING-ORIGIN-MODERN",
    remainderId: "REC-REM-MISSING-ORIGIN-MODERN",
    type: "condition_changed", jobId: "JOB-OLD", timestamp: now,
    fromStatus: "available", toStatus: "available"
  });
  const missingModernOriginReport = await storage.getRecoveryReport();
  assert.ok(missingModernOriginReport.movementHistoryIssues.some(item =>
    item.remainderId === "REC-REM-MISSING-ORIGIN-MODERN" &&
    item.type === "missing_origin" && item.severity === "error"
  ));
  console.log("LULUS: laporan audit mendeteksi riwayat terputus tanpa mengubah stok.");

  await recoveredEngine.cancelPlan({ reservedPlan: recovered, timestamp: now });
  assert.equal((await storage.get("plans", reserved.planId)).status, "cancelled");
  assert.equal((await storage.get("remainders", "REC-REM-1")).status, "available");
  assert.equal((await storage.get("remainders", "REC-REM-2")).status, "available");
  const reportAfterCancel = await storage.getRecoveryReport();
  assert.equal(reportAfterCancel.activePlans.length, 0);
  assert.equal(reportAfterCancel.activeReservations.length, 0);
  assert.deepEqual(reportAfterCancel.inconsistentPlans, []);
  assert.deepEqual(reportAfterCancel.inconsistentReservations, []);
  console.log("LULUS: pembatalan sah menghasilkan laporan tanpa ketidaksesuaian reservasi.");

  const newOnly = await recoveredEngine.reservePlan({
    plan: { inventoryUsage: [], usableRemainders: [], sheets: [] },
    jobId: "JOB-NEW-ONLY", material: { id: "MAT-RECOVERY", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    timestamp: now
  });
  await storage.close();
  storage = Storage.createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  const afterReloadEngine = Engine.createInventoryEngine({ storage });
  const newOnlyRestored = await afterReloadEngine.restorePlan(newOnly.planId);
  await afterReloadEngine.consumePlan({ reservedPlan: newOnlyRestored, timestamp: now });
  assert.equal((await storage.get("plans", newOnly.planId)).status, "completed");
  const reportAfterComplete = await storage.getRecoveryReport();
  assert.deepEqual(reportAfterComplete.inconsistentPlans, []);
  assert.deepEqual(reportAfterComplete.inconsistentReservations, []);
  console.log("LULUS: rencana tanpa stok inventaris selesai dan laporan tetap konsisten setelah reload.");
  // Status rencana berinventaris tidak boleh diubah tanpa melepas/mengonsumsi
  // reservasi dan memperbarui sumber stok dalam transaksi yang sama.
  await storage.add("remainders", remainder("REC-REM-STATUS-GUARD"));
  const guardedPlan = await afterReloadEngine.reservePlan({
    plan: {
      inventoryUsage: [{ remainderId: "REC-REM-STATUS-GUARD", placedCount: 1 }],
      usableRemainders: [], sheets: []
    },
    jobId: "JOB-STATUS-GUARD",
    material: { id: "MAT-RECOVERY", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    timestamp: now
  });
  await assert.rejects(storage.updatePlanStatus({
    planId: guardedPlan.planId, status: "cancelled", timestamp: now
  }));
  await assert.rejects(storage.updatePlanStatus({
    planId: guardedPlan.planId, status: "completed", timestamp: now
  }));
  await assert.rejects(storage.consumeReservations({
    reservations: [], newSheetRemainders: [], planId: guardedPlan.planId,
    timestamp: now
  }));
  await assert.rejects(storage.consumeReservations({
    reservations: [{ reservationId: guardedPlan.reservations[0].id, remainders: [] }],
    newSheetRemainders: [], timestamp: now
  }));
  assert.equal((await storage.get("plans", guardedPlan.planId)).status, "reserved");
  assert.equal((await storage.get("reservations", guardedPlan.reservations[0].id)).status, "active");
  assert.equal((await storage.get("remainders", "REC-REM-STATUS-GUARD")).status, "reserved");
  await afterReloadEngine.cancelPlan({ reservedPlan: guardedPlan, timestamp: now });
  assert.equal((await storage.get("plans", guardedPlan.planId)).status, "cancelled");
  assert.equal((await storage.get("reservations", guardedPlan.reservations[0].id)).status, "released");
  assert.equal((await storage.get("remainders", "REC-REM-STATUS-GUARD")).status, "available");
  console.log("LULUS: updatePlanStatus menolak perubahan langsung pada rencana yang masih memakai inventaris.");

  await storage.add("remainders", remainder("REC-REM-COMPLETE"));
  const inventoryPlan = await afterReloadEngine.reservePlan({
    plan: {
      inventoryUsage: [{ remainderId: "REC-REM-COMPLETE", placedCount: 1 }],
      usableRemainders: [], sheets: []
    },
    jobId: "JOB-COMPLETE-RELOAD",
    material: { id: "MAT-RECOVERY", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    timestamp: now
  });
  await storage.close();
  storage = Storage.createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  const completionEngine = Engine.createInventoryEngine({ storage });
  const restoredForCompletion = await completionEngine.restorePlan(inventoryPlan.planId);
  await completionEngine.consumePlan({ reservedPlan: restoredForCompletion, timestamp: now });
  assert.equal((await storage.get("plans", inventoryPlan.planId)).status, "completed");
  assert.equal((await storage.get("remainders", "REC-REM-COMPLETE")).status, "consumed");

  // Reservasi terminal yang masih menunjuk ke planId harus terdeteksi
  // walaupun rencana induknya hilang (kasus ini tidak masuk orphanedReservations
  // karena reservasinya bukan lagi active).
  const consumedReservation = await storage.get("reservations", inventoryPlan.reservations[0].id);
  await storage.update("reservations", consumedReservation.id, { planId: "PLAN-MISSING-PARENT" });
  const missingParentReport = await storage.getRecoveryReport();
  assert.ok(missingParentReport.inconsistentReservations.some(item =>
    item.id === consumedReservation.id && item.status === "consumed"
  ));
  assert.deepEqual(missingParentReport.orphanedReservations, []);
  await storage.put("reservations", consumedReservation);
  // Reservasi terminal tanpa planId tetap muncul sebagai riwayat legacy,
  // tetapi tidak salah dikategorikan sebagai reservasi aktif yatim.
  await storage.update("reservations", consumedReservation.id, { planId: null });
  const terminalLegacyReport = await storage.getRecoveryReport();
  assert.ok(terminalLegacyReport.legacyReservationsWithoutPlan.some(item =>
    item.id === consumedReservation.id && item.status === "consumed"
  ));
  assert.deepEqual(terminalLegacyReport.orphanedReservations, []);
  await storage.put("reservations", consumedReservation);
  const restoredParentReport = await storage.getRecoveryReport();
  assert.deepEqual(restoredParentReport.inconsistentPlans, []);
  assert.deepEqual(restoredParentReport.inconsistentReservations, []);
  // Laporan pemulihan harus menemukan siklus asal-usul yang sudah berada
  // di database lokal, bukan hanya menolak siklus saat impor.
  const cycleA = {
    ...remainder("REC-LINEAGE-A"), status: "consumed", sourceType: "inventory",
    sourceRemainderId: "REC-LINEAGE-B", reservationId: "RSV-LINEAGE-A"
  };
  const cycleB = {
    ...remainder("REC-LINEAGE-B"), status: "consumed", sourceType: "inventory",
    sourceRemainderId: "REC-LINEAGE-A", reservationId: "RSV-LINEAGE-B"
  };
  await storage.put("remainders", cycleA);
  await storage.put("remainders", cycleB);
  const cyclicLineageReport = await storage.getRecoveryReport();
  assert.ok(cyclicLineageReport.remainderLineageIssues.some(item => item.type === "cyclic_lineage"));
  await storage.remove("remainders", cycleA.id);
  await storage.remove("remainders", cycleB.id);
  const cleanLineageReport = await storage.getRecoveryReport();
  assert.deepEqual(cleanLineageReport.remainderLineageIssues, []);
  console.log("LULUS: laporan pemulihan mendeteksi siklus asal-usul lokal tanpa mengubah data.");

  console.log("LULUS: audit mendeteksi reservasi terminal yang kehilangan rencana induk.");

  console.log("LULUS: rencana multi-sumber dipulihkan dan diselesaikan dari snapshot setelah reload.");

  await storage.close();
  await deleteDatabase();
  await createVersionOneDatabase();
  storage = Storage.createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  const recoveryPlans = await storage.getRecoveryPlans();
  assert.equal(recoveryPlans.length, 2);
  const recoveryPlanByReservation = new Map(recoveryPlans.map(plan => [plan.reservationIds[0], plan]));
  for (const reservationId of ["LEGACY-RSV", "LEGACY-RSV-2"]) {
    const plan = recoveryPlanByReservation.get(reservationId);
    assert.ok(plan);
    assert.equal(plan.status, "legacy_recovery");
    assert.equal(plan.legacy, true);
    assert.equal((await storage.get("reservations", reservationId)).planId, plan.id);
  }
  assert.equal((await storage.get("meta", "schemaVersion")).value, 2);
  const migratedReport = await storage.getRecoveryReport();
  assert.deepEqual(migratedReport.plansWithoutJob, []);
  assert.deepEqual(migratedReport.inconsistentPlans, []);
  const migratedBundle = await storage.exportJSON();
  const migratedValidation = Validator.validateInventoryBundle(migratedBundle);
  assert.equal(migratedValidation.valid, true, JSON.stringify(migratedValidation.errors));
  await storage.releaseReservations({
    reservationIds: ["LEGACY-RSV"], planId: recoveryPlanByReservation.get("LEGACY-RSV").id, timestamp: now
  });
  await storage.releaseReservations({
    reservationIds: ["LEGACY-RSV-2"], planId: recoveryPlanByReservation.get("LEGACY-RSV-2").id, timestamp: now
  });
  for (const reservationId of ["LEGACY-RSV", "LEGACY-RSV-2"]) {
    const plan = recoveryPlanByReservation.get(reservationId);
    assert.equal((await storage.get("plans", plan.id)).status, "cancelled");
  }
  assert.equal((await storage.get("remainders", "LEGACY-REM")).status, "available");
  assert.equal((await storage.get("remainders", "LEGACY-REM-2")).status, "available");
  console.log("LULUS: migrasi v1 mempertahankan dua reservasi aktif, memperbarui metadata skema, menghasilkan cadangan valid, dan keduanya dapat dibatalkan.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian pemulihan snapshot rencana selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
