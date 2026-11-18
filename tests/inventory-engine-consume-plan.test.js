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
  const storage = storageModule.createStorage();
  await storage.open();
  const engine = engineModule.createInventoryEngine({ storage });

  await storage.add("remainders", remainder("CONSUME-1"));
  await storage.add("remainders", remainder("CONSUME-2"));
  const plan = {
    inventoryUsage: [
      { remainderId: "CONSUME-1", placedCount: 2 },
      { remainderId: "CONSUME-2", placedCount: 1 }
    ],
    usableRemainders: [
      { sourceRemainderId: "CONSUME-1", width: 20, height: 10 },
      { sourceRemainderId: "CONSUME-2", width: 15, height: 8 }
    ],
    tooSmallRemainders: [
      { sourceRemainderId: "CONSUME-1", width: 2, height: 2 }
    ]
  };
  const reservedPlan = await engine.reservePlan({
    plan, jobId: "JOB-TARGET", timestamp: now
  });
  const consumed = await engine.consumePlan({
    reservedPlan,
    sourceSheetIdPrefix: "JOB-TARGET-SHEET",
    timestamp: now
  });
  assert.equal(consumed.consumedReservations.length, 2);
  assert.equal(consumed.createdRemainders.length, 2);
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
  assert.equal((await storage.getAll("remainders")).filter(item =>
    item.id.startsWith("REM-") && item.status === "available"
  ).length, 2);
  console.log("LULUS: beberapa reservasi dikonsumsi bersama dan sisa turunan tiap sumber tercatat.");

  await storage.add("remainders", remainder("CONSUME-ROLLBACK-1"));
  await storage.add("remainders", remainder("CONSUME-ROLLBACK-2"));
  const rollbackPlan = await engine.reservePlan({
    plan: {
      inventoryUsage: [
        { remainderId: "CONSUME-ROLLBACK-1" },
        { remainderId: "CONSUME-ROLLBACK-2" }
      ],
      usableRemainders: [
        { sourceRemainderId: "CONSUME-ROLLBACK-1", width: 12, height: 8 },
        { sourceRemainderId: "CONSUME-ROLLBACK-2", width: 10, height: 6 }
      ]
    },
    jobId: "JOB-TARGET", timestamp: now
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
  console.log("LULUS: kegagalan satu konsumsi membatalkan seluruh perubahan multi-sumber.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian konsumsi rencana multi-sumber selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
