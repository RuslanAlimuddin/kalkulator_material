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
  const storage = storageModule.createStorage();
  await storage.open();
  const engine = engineModule.createInventoryEngine({ storage });

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
  const result = await engine.cancelPlan({ reservedPlan, timestamp: now });
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

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian pembatalan rencana selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
