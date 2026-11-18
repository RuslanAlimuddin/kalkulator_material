const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const Storage = require("../assets/js/inventory-storage.js");
const Engine = require("../assets/js/inventory-engine.js");
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
      const tx = db.transaction(["remainders", "reservations"], "readwrite");
      tx.objectStore("remainders").put({
        ...remainder("LEGACY-REM"), status: "reserved"
      });
      tx.objectStore("reservations").put({
        id: "LEGACY-RSV", remainderId: "LEGACY-REM", jobId: "JOB-LEGACY",
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
  let storage = Storage.createStorage();
  await storage.open();
  const engine = Engine.createInventoryEngine({ storage });
  await storage.add("remainders", remainder("REC-REM-1"));

  const reserved = await engine.reservePlan({
    plan: {
      inventoryUsage: [{ remainderId: "REC-REM-1", placedCount: 1 }],
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
  assert.equal((await storage.get("remainders", "REC-REM-1")).status, "reserved");
  await storage.close();

  storage = Storage.createStorage();
  await storage.open();
  const recoveredEngine = Engine.createInventoryEngine({ storage });
  const recovered = await recoveredEngine.restorePlan(reserved.planId);
  assert.equal(recovered.planId, reserved.planId);
  assert.equal(recovered.reservations.length, 1);
  assert.equal(recovered.inventoryUsage[0].reservationId, reserved.reservations[0].id);
  await recoveredEngine.cancelPlan({ reservedPlan: recovered, timestamp: now });
  assert.equal((await storage.get("plans", reserved.planId)).status, "cancelled");
  assert.equal((await storage.get("remainders", "REC-REM-1")).status, "available");
  console.log("LULUS: snapshot dan reservasi dapat dipulihkan setelah storage ditutup dan dibuka kembali; pembatalan memperbarui stok dan snapshot.");

  const newOnly = await recoveredEngine.reservePlan({
    plan: { inventoryUsage: [], usableRemainders: [], sheets: [] },
    jobId: "JOB-NEW-ONLY", material: { id: "MAT-RECOVERY", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
    timestamp: now
  });
  await storage.close();
  storage = Storage.createStorage();
  await storage.open();
  const afterReloadEngine = Engine.createInventoryEngine({ storage });
  const newOnlyRestored = await afterReloadEngine.restorePlan(newOnly.planId);
  await afterReloadEngine.consumePlan({ reservedPlan: newOnlyRestored, timestamp: now });
  assert.equal((await storage.get("plans", newOnly.planId)).status, "completed");
  console.log("LULUS: rencana tanpa stok inventaris tetap tersimpan dan dapat diselesaikan setelah reload.");

  await storage.close();
  await deleteDatabase();
  await createVersionOneDatabase();
  storage = Storage.createStorage();
  await storage.open();
  const recoveryPlans = await storage.getRecoveryPlans();
  assert.equal(recoveryPlans.length, 1);
  assert.equal(recoveryPlans[0].status, "legacy_recovery");
  assert.equal(recoveryPlans[0].legacy, true);
  assert.equal((await storage.get("reservations", "LEGACY-RSV")).planId, recoveryPlans[0].id);
  await storage.releaseReservations({
    reservationIds: ["LEGACY-RSV"], planId: recoveryPlans[0].id, timestamp: now
  });
  assert.equal((await storage.get("plans", recoveryPlans[0].id)).status, "cancelled");
  assert.equal((await storage.get("remainders", "LEGACY-REM")).status, "available");
  console.log("LULUS: migrasi v1 mempertahankan reservasi aktif sebagai pemulihan legacy dan dapat dibatalkan dengan aman.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian pemulihan snapshot rencana selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
