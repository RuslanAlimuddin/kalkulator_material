const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const storageModule = require("../assets/js/inventory-storage.js");
const engineModule = require("../assets/js/inventory-engine.js");
const now = "2026-11-18T14:10:00.000Z";

function item(id) {
  return {
    id, materialId: "MAT-CANCEL", widthCm: 42, heightCm: 28,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-OLD", sourceSheetId: "SHEET-" + id,
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
  const engine = engineModule.createInventoryEngine({ storage });

  await storage.add("materials", {
    id: "MAT-CANCEL", name: "Material pembatalan", category: "board",
    thicknessMm: 8, grainRequired: false, motif: "plain",
    rotationPolicy: "free", active: true
  });
  for (const id of ["JOB-OLD", "JOB-NEW"]) {
    await storage.add("jobs", {
      id, name: "Pekerjaan " + id, status: "open",
      createdAt: now, closedAt: null
    });
  }
  await storage.add("remainders", item("CANCEL-1"));
  await storage.add("remainders", item("CANCEL-2"));
  const reservedPlan = await engine.reservePlan({
    plan: {
      inventoryUsage: [
        { remainderId: "CANCEL-1" },
        { remainderId: "CANCEL-2" }
      ],
      usableRemainders: []
    },
    jobId: "JOB-NEW",
    timestamp: now
  });
  const result = await engine.cancelPlan({
    reservedPlan, timestamp: "2026-11-18T14:10:00.001Z"
  });
  assert.equal(result.releasedReservations.length, 2);
  for (const id of ["CANCEL-1", "CANCEL-2"]) {
    assert.equal((await storage.get("remainders", id)).status, "available");
  }
  for (const reservation of reservedPlan.reservations) {
    assert.equal((await storage.get("reservations", reservation.id)).status, "released");
  }
  console.log("LULUS: cancelPlan melepaskan seluruh sumber inventaris yang dipesan.");

  const noInventory = await engine.cancelPlan({
    reservedPlan: { reservations: [] }, timestamp: now
  });
  assert.deepEqual(noInventory.releasedReservations, []);
  console.log("LULUS: pembatalan rencana tanpa sumber inventaris tidak membuat perubahan.");

  // Snapshot yang tidak cocok dengan reservasi aktif harus gagal dipulihkan
  // tanpa melepaskan atau mengubah stok.
  await storage.add("remainders", item("CANCEL-RECOVERY-MISMATCH"));
  const mismatchPlan = await engine.reservePlan({
    plan: {
      inventoryUsage: [{ remainderId: "CANCEL-RECOVERY-MISMATCH" }],
      usableRemainders: []
    },
    jobId: "JOB-NEW",
    timestamp: "2026-11-18T14:10:00.010Z"
  });
  await storage.update("plans", mismatchPlan.planId, { reservationIds: [] });
  await assert.rejects(engine.restorePlan(mismatchPlan.planId), /tidak cocok/);
  await assert.rejects(engine.cancelPlan({
    reservedPlan: mismatchPlan, timestamp: "2026-11-18T14:10:00.011Z"
  }));
  assert.equal((await storage.get("plans", mismatchPlan.planId)).status, "reserved");
  assert.equal((await storage.get("remainders", "CANCEL-RECOVERY-MISMATCH")).status, "reserved");
  assert.equal(
    (await storage.get("reservations", mismatchPlan.reservations[0].id)).status,
    "active"
  );
  console.log("LULUS: snapshot dengan daftar ID reservasi tidak cocok ditolak tanpa mengubah stok.");

  // Sumber yang hilang atau tidak lagi berstatus reserved juga harus diblokir.
  await storage.add("remainders", item("CANCEL-RECOVERY-SOURCE-STATE"));
  const sourceStatePlan = await engine.reservePlan({
    plan: {
      inventoryUsage: [{ remainderId: "CANCEL-RECOVERY-SOURCE-STATE" }],
      usableRemainders: []
    },
    jobId: "JOB-NEW",
    timestamp: "2026-11-18T14:10:00.020Z"
  });
  await storage.update("remainders", "CANCEL-RECOVERY-SOURCE-STATE", {
    status: "available"
  });
  await assert.rejects(engine.restorePlan(sourceStatePlan.planId), /Sumber inventaris hilang/);
  await assert.rejects(engine.cancelPlan({
    reservedPlan: sourceStatePlan, timestamp: "2026-11-18T14:10:00.021Z"
  }));
  assert.equal((await storage.get("plans", sourceStatePlan.planId)).status, "reserved");
  assert.equal((await storage.get("remainders", "CANCEL-RECOVERY-SOURCE-STATE")).status, "available");
  assert.equal(
    (await storage.get("reservations", sourceStatePlan.reservations[0].id)).status,
    "active"
  );
  console.log("LULUS: sumber yang tidak lagi reserved memblokir pemulihan/pembatalan tanpa perubahan tambahan.");

  // Uji round-trip cadangan untuk rencana yang dibatalkan.
  const backup = await storage.exportJSON();
  const validator = require("../assets/js/inventory-validator.js");
  const beforeImport = validator.validateInventoryBundle(backup);
  assert.equal(beforeImport.valid, true, JSON.stringify(beforeImport.errors));
  await storage.importJSON(backup, "replace");
  const restoredPlan = await storage.get("plans", reservedPlan.planId);
  assert.equal(restoredPlan.status, "cancelled");
  for (const reservation of reservedPlan.reservations) {
    assert.equal((await storage.get("reservations", reservation.id)).status, "released");
    assert.ok((await storage.getAll("movements")).some(item =>
      item.referenceId === reservation.id && item.type === "reservation_released"
    ));
  }
  const afterImport = validator.validateInventoryBundle(await storage.exportJSON());
  assert.equal(afterImport.valid, true, JSON.stringify(afterImport.errors));
  console.log("LULUS: cadangan round-trip mempertahankan rencana cancelled, reservasi released, dan movement terminal.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian pembatalan rencana selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
