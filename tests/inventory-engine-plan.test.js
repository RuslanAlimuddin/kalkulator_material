const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const storageModule = require("../assets/js/inventory-storage.js");
const engineModule = require("../assets/js/inventory-engine.js");

const now = "2026-11-18T13:15:00.000Z";
function remainder(id, condition) {
  return {
    id, materialId: "MAT-PLAN", widthCm: 45, heightCm: 32,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: condition || "good",
    status: "available", originJobId: "JOB-ORIGIN",
    sourceSheetId: "SHEET-" + id, createdAt: now,
    updatedAt: now, version: 1
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
  await storage.add("jobs", {
    id: "JOB-TARGET", name: "Pekerjaan Target", status: "open",
    createdAt: now, closedAt: null
  });
  const engine = engineModule.createInventoryEngine({ storage });

  await storage.add("remainders", remainder("PLAN-REM-1"));
  await storage.add("remainders", remainder("PLAN-REM-2"));
  const plan = {
    inventoryUsage: [
      { remainderId: "PLAN-REM-1", placedCount: 2 },
      { remainderId: "PLAN-REM-2", placedCount: 1 }
    ],
    newSheetCount: 1
  };
  const result = await engine.reservePlan({
    plan, jobId: "JOB-TARGET", timestamp: now
  });
  assert.equal(result.plan, plan);
  assert.equal(result.reservations.length, 2);
  assert.equal(result.inventoryUsage.length, 2);
  assert.ok(result.inventoryUsage.every(item => item.reservationId));
  assert.equal((await storage.get("remainders", "PLAN-REM-1")).status, "reserved");
  assert.equal((await storage.get("remainders", "PLAN-REM-2")).status, "reserved");
  console.log("LULUS: reservePlan mengunci semua sumber inventaris dan mengembalikan ID reservasi per sumber.");

  await storage.add("remainders", remainder("PLAN-ROLLBACK-1"));
  await storage.add("remainders", remainder("PLAN-ROLLBACK-2", "damaged"));
  await assert.rejects(engine.reservePlan({
    plan: { inventoryUsage: [
      { remainderId: "PLAN-ROLLBACK-1" },
      { remainderId: "PLAN-ROLLBACK-2" }
    ] },
    jobId: "JOB-TARGET",
    timestamp: now
  }));
  assert.equal((await storage.get("remainders", "PLAN-ROLLBACK-1")).status, "available");
  assert.equal((await storage.get("remainders", "PLAN-ROLLBACK-2")).status, "available");
  assert.equal((await storage.getByIndex("reservations", "remainderId", "PLAN-ROLLBACK-1")).length, 0);
  console.log("LULUS: konflik salah satu sumber tidak meninggalkan reservasi parsial.");

  const empty = await engine.reservePlan({
    plan: { inventoryUsage: [], newSheetCount: 2 },
    jobId: "JOB-TARGET"
  });
  assert.equal(empty.reservations.length, 0);
  assert.equal(empty.inventoryUsage.length, 0);
  console.log("LULUS: rencana tanpa stok inventaris tidak membuat reservasi.");

  await assert.rejects(engine.reservePlan({
    plan: { inventoryUsage: [{ remainderId: "X" }, { remainderId: "X" }] },
    jobId: "JOB-TARGET"
  }), /duplikat/);
  console.log("LULUS: rencana dengan ID sumber ganda ditolak.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian penghubung planner-reservasi selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
