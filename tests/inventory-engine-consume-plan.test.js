const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const storageModule = require("../assets/js/inventory-storage.js");
const engineModule = require("../assets/js/inventory-engine.js");

const now = "2026-11-18T13:30:00.000Z";
function remainder(id) {
  return {
    id, materialId: "MAT-CONSUME", widthCm: 50, heightCm: 35,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-ORIGIN", sourceSheetId: "SHEET-" + id,
    createdAt: now, updatedAt: now, version: 1
  };
}
function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(storageModule.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database uji masih digunakan."));
  });
}

async function main() {
  await deleteDatabase();
  const storage = storageModule.createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  await storage.add("materials", {
    id: "MAT-CONSUME", name: "Material uji konsumsi", category: "uji",
    thicknessMm: 8, surface: "glossy", grainRequired: false,
    motif: "plain", rotationPolicy: "free", active: true
  });
  await storage.add("materials", {
    id: "MAT-NEW-ONLY", name: "Material lembar baru",
    category: "uji", thicknessMm: 8, surface: "glossy",
    grainRequired: false, motif: "plain",
    rotationPolicy: "fixed", active: true
  });
  for (const id of ["JOB-TARGET", "JOB-C", "JOB-NEW-ONLY", "JOB-EMPTY-PLAN"]) {
    await storage.add("jobs", {
      id, name: id, status: "open", createdAt: now, closedAt: null
    });
  }
  const engine = engineModule.createInventoryEngine({ storage });

  await storage.add("remainders", remainder("CONSUME-1"));
  await storage.add("remainders", remainder("CONSUME-2"));
  const plan = {
    inventoryUsage: [
      { remainderId: "CONSUME-1", placedCount: 2 },
      { remainderId: "CONSUME-2", placedCount: 1 }
    ],
    usableRemainders: [
      { sourceRemainderId: "CONSUME-1", width: 20, height: 10, source: "inventory", sheetId: "INVENTORY-0-CONSUME-1" },
      { sourceRemainderId: "CONSUME-2", width: 15, height: 8, source: "inventory", sheetId: "INVENTORY-1-CONSUME-2" },
      { width: 18, height: 9, source: "new", sheetId: 1 }
    ],
    sheets: [
      {
        id: "INVENTORY-0-CONSUME-1", source: "inventory",
        remainderId: "CONSUME-1", width: 50, height: 35
      },
      {
        id: "INVENTORY-1-CONSUME-2", source: "inventory",
        remainderId: "CONSUME-2", width: 50, height: 35
      },
      { id: 1, source: "new", width: 100, height: 100 }
    ],
    tooSmallRemainders: [
      { sourceRemainderId: "CONSUME-1", width: 2, height: 2 }
    ]
  };
  const reservedPlan = await engine.reservePlan({
    plan, jobId: "JOB-TARGET",
    material: { id: "MAT-CONSUME", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    grainDirection: "none",
    timestamp: now
  });
  const consumed = await engine.consumePlan({
    reservedPlan,
    sourceSheetIdPrefix: "JOB-TARGET-SHEET",
    timestamp: "2026-11-18T13:30:00.001Z"
  });
  assert.equal(consumed.consumedReservations.length, 2);
  assert.equal(consumed.createdRemainders.length, 3);
  assert.equal((await storage.get("remainders", "CONSUME-1")).status, "consumed");
  assert.equal((await storage.get("remainders", "CONSUME-2")).status, "consumed");
  for (const item of reservedPlan.reservations) {
    assert.equal((await storage.get("reservations", item.id)).status, "consumed");
  }
  const child1 = consumed.createdRemainders.find(item => item.sourceRemainderId === "CONSUME-1");
  const child2 = consumed.createdRemainders.find(item => item.sourceRemainderId === "CONSUME-2");
  assert.equal(child1.widthCm, 20);
  assert.equal(child1.heightCm, 10);
  assert.equal(child1.sourceSheetId, "JOB-TARGET-SHEET-1");
  assert.equal(child2.sourceSheetId, "JOB-TARGET-SHEET-2");
  const newSheetChild = consumed.createdRemainders.find(item => item.sourceType === "new");
  assert.ok(newSheetChild);
  assert.equal(newSheetChild.materialId, "MAT-CONSUME");
  assert.equal(newSheetChild.originJobId, "JOB-TARGET");
  assert.equal(newSheetChild.sourceSheetId, "JOB-TARGET-SHEET-NEW-1");
  assert.equal(newSheetChild.widthCm, 18);
  assert.equal(newSheetChild.heightCm, 9);
  assert.equal((await storage.getAll("remainders")).filter(item =>
    item.id.startsWith("REM-") && item.status === "available"
  ).length, 3);
  const childForC = await storage.get("remainders", child1.id);
  assert.equal(childForC.status, "available");
  const reservationForC = await storage.reserveRemainder({
    remainderId: childForC.id,
    jobId: "JOB-C",
    timestamp: "2026-11-18T13:30:00.002Z"
  });
  const consumedForC = await engine.consumeReservation({
    reservationId: reservationForC.id,
    sourceSheetId: "JOB-C-SHEET-1",
    timestamp: "2026-11-18T13:30:00.003Z",
    remainders: [{ widthCm: 8, heightCm: 6 }]
  });
  assert.equal((await storage.get("remainders", childForC.id)).status, "consumed");
  assert.equal(consumedForC.createdRemainders.length, 1);
  const childFromC = await storage.get("remainders", consumedForC.createdRemainders[0].id);
  assert.equal(childFromC.originJobId, "JOB-C");
  assert.equal(childFromC.status, "available");
  console.log("LULUS: sisa dari pemakaian multi-sumber pekerjaan B dapat dipakai kembali oleh pekerjaan C.");
  console.log("LULUS: beberapa reservasi dikonsumsi bersama dan sisa turunan tiap sumber tercatat.");

  // Snapshot geometri baru wajib menolak dua bidang leftovers yang bertumpuk
  // sebelum stok sumber dikunci melalui reservasi.
  await storage.add("remainders", remainder("CONSUME-GEOMETRY-OVERLAP"));
  await assert.rejects(engine.reservePlan({
    planId: "PLAN-GEOMETRY-OVERLAP",
    plan: {
      geometryVersion: 1,
      inventoryUsage: [{ remainderId: "CONSUME-GEOMETRY-OVERLAP" }],
      sheets: [{
        id: "INVENTORY-0-CONSUME-GEOMETRY-OVERLAP",
        source: "inventory", remainderId: "CONSUME-GEOMETRY-OVERLAP",
        width: 50, height: 35, placements: [],
        leftovers: [
          { x: 0, y: 0, width: 20, height: 20 },
          { x: 10, y: 10, width: 20, height: 20 }
        ]
      }],
      usableRemainders: [
        { sheetId: "INVENTORY-0-CONSUME-GEOMETRY-OVERLAP",
          source: "inventory", sourceRemainderId: "CONSUME-GEOMETRY-OVERLAP",
          x: 0, y: 0, width: 20, height: 20 },
        { sheetId: "INVENTORY-0-CONSUME-GEOMETRY-OVERLAP",
          source: "inventory", sourceRemainderId: "CONSUME-GEOMETRY-OVERLAP",
          x: 10, y: 10, width: 20, height: 20 }
      ]
    },
    jobId: "JOB-TARGET",
    material: { id: "MAT-CONSUME", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    grainDirection: "none",
    timestamp: "2026-11-18T13:30:00.004Z"
  }), /bertumpuk/);
  assert.equal((await storage.get("remainders", "CONSUME-GEOMETRY-OVERLAP")).status, "available");
  assert.equal((await storage.getByIndex("reservations", "remainderId", "CONSUME-GEOMETRY-OVERLAP")).length, 0);
  assert.equal(await storage.get("plans", "PLAN-GEOMETRY-OVERLAP"), null);
  console.log("LULUS: geometri sisa yang bertumpuk ditolak sebelum reservasi stok.");

  const newOnlyPlan = await engine.reservePlan({
    plan: {
      inventoryUsage: [],
      usableRemainders: [{ width: 25, height: 12, source: "new", sheetId: 4 }],
      sheets: [{ id: 4, source: "new" }]
    },
    jobId: "JOB-NEW-ONLY",
    material: {
      id: "MAT-NEW-ONLY", thicknessMm: 8, motif: "plain",
      rotationPolicy: "fixed", grainRequired: false
    },
    grainDirection: "none",
    timestamp: now
  });
  assert.equal(newOnlyPlan.reservations.length, 0);
  // Karena rencana lembar baru tidak memiliki reservasi inventaris, pekerjaan
  // dapat ditutup setelah pratinjau. Konsumsi rencana lama harus ditolak.
  await storage.update("jobs", "JOB-NEW-ONLY", { status: "closed" });
  await assert.rejects(engine.consumePlan({
    reservedPlan: newOnlyPlan,
    sourceSheetIdPrefix: "JOB-NEW-ONLY-SHEET",
    timestamp: now
  }));
  assert.equal(
    (await storage.getByIndex("remainders", "originJobId", "JOB-NEW-ONLY")).length,
    0
  );
  assert.equal((await storage.get("plans", newOnlyPlan.planId)).status, "reserved");
  // Buka kembali pekerjaan untuk melanjutkan skenario konsumsi normal.
  await storage.update("jobs", "JOB-NEW-ONLY", { status: "open" });
  const newOnlyResult = await engine.consumePlan({
    reservedPlan: newOnlyPlan,
    sourceSheetIdPrefix: "JOB-NEW-ONLY-SHEET",
    timestamp: now
  });
  assert.equal(newOnlyResult.consumedReservations.length, 0);
  assert.equal(newOnlyResult.createdRemainders.length, 1);
  const newOnlyRemainder = await storage.get("remainders", newOnlyResult.createdRemainders[0].id);
  assert.equal(newOnlyRemainder.status, "available");
  assert.equal(newOnlyRemainder.originJobId, "JOB-NEW-ONLY");
  assert.equal(newOnlyRemainder.rotationAllowed, false);
  console.log("LULUS: pekerjaan yang hanya memakai lembar baru tetap menyimpan sisa tanpa reservasi inventaris.");

  // Rencana tanpa stok dan tanpa sisa keluaran tetap tidak boleh diselesaikan
  // setelah pekerjaan ditutup. Jalur ini sebelumnya melewati pemeriksaan job.
  const emptyPlan = await engine.reservePlan({
    plan: { inventoryUsage: [], usableRemainders: [], sheets: [] },
    jobId: "JOB-EMPTY-PLAN",
    timestamp: now
  });
  await storage.update("jobs", "JOB-EMPTY-PLAN", { status: "closed" });
  await assert.rejects(engine.consumePlan({
    reservedPlan: emptyPlan,
    timestamp: "2026-11-18T13:30:00.001Z"
  }));
  assert.equal((await storage.get("plans", emptyPlan.planId)).status, "reserved");
  await storage.update("jobs", "JOB-EMPTY-PLAN", { status: "open" });
  const completedEmptyPlan = await engine.consumePlan({
    reservedPlan: emptyPlan,
    timestamp: "2026-11-18T13:30:00.002Z"
  });
  assert.equal(completedEmptyPlan.consumedReservations.length, 0);
  assert.equal((await storage.get("plans", emptyPlan.planId)).status, "completed");
  console.log("LULUS: rencana tanpa stok dan tanpa sisa keluaran hanya dapat diselesaikan saat pekerjaan masih open.");

  await storage.add("remainders", remainder("CONSUME-ROLLBACK-1"));
  await storage.add("remainders", remainder("CONSUME-ROLLBACK-2"));
  const rollbackPlan = await engine.reservePlan({
    plan: {
      inventoryUsage: [
        { remainderId: "CONSUME-ROLLBACK-1" },
        { remainderId: "CONSUME-ROLLBACK-2" }
      ],
      usableRemainders: [
        { sourceRemainderId: "CONSUME-ROLLBACK-1", width: 12, height: 8, source: "inventory" },
        { sourceRemainderId: "CONSUME-ROLLBACK-2", width: 10, height: 6, source: "inventory" },
        { width: 9, height: 7, source: "new", sheetId: 9 }
      ],
      sheets: [
        {
          id: "INVENTORY-0-CONSUME-ROLLBACK-1", source: "inventory",
          remainderId: "CONSUME-ROLLBACK-1", width: 50, height: 35
        },
        {
          id: "INVENTORY-1-CONSUME-ROLLBACK-2", source: "inventory",
          remainderId: "CONSUME-ROLLBACK-2", width: 50, height: 35
        },
        { id: 9, source: "new", width: 100, height: 100 }
      ]
    },
    jobId: "JOB-TARGET",
    material: { id: "MAT-CONSUME", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    grainDirection: "none",
    timestamp: now
  });
  rollbackPlan.inventoryUsage[1].reservationId = "RESERVATION-TIDAK-ADA";
  await assert.rejects(engine.consumePlan({
    reservedPlan: rollbackPlan,
    sourceSheetIdPrefix: "JOB-ROLLBACK",
    timestamp: now
  }));
  assert.equal((await storage.get("remainders", "CONSUME-ROLLBACK-1")).status, "reserved");
  assert.equal((await storage.get("remainders", "CONSUME-ROLLBACK-2")).status, "reserved");
  assert.equal(
    (await storage.get("reservations", rollbackPlan.inventoryUsage[0].reservationId)).status,
    "active"
  );
  assert.equal(
    (await storage.getByIndex("remainders", "originJobId", "JOB-TARGET"))
      .filter(item => item.sourceSheetId === "JOB-ROLLBACK-1").length,
    0
  );
  assert.equal(
    (await storage.getByIndex("remainders", "originJobId", "JOB-TARGET"))
      .some(item => item.sourceSheetId === "JOB-ROLLBACK-NEW-9"),
    false
  );
  console.log("LULUS: kegagalan satu konsumsi membatalkan perubahan sumber inventaris dan sisa lembar baru.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian konsumsi rencana multi-sumber selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
