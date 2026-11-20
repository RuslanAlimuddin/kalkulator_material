const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const { DB_NAME, createStorage } = require("../assets/js/inventory-storage.js");

const now = "2026-11-18T13:00:00.000Z";
function remainder(id, condition) {
  return {
    id, materialId: "MAT-BATCH", widthCm: 45, heightCm: 32,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: condition || "good",
    status: "available", originJobId: "JOB-BATCH",
    sourceSheetId: "SHEET-" + id, createdAt: now,
    updatedAt: now, version: 1
  };
}
function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database uji masih digunakan."));
  });
}

async function main() {
  await deleteDatabase();
  const storage = createStorage({ allowUnsafeInventoryWrites: true });
  await storage.open();
  await storage.add("jobs", {
    id: "JOB-BATCH", name: "Pekerjaan Batch", status: "open",
    createdAt: now, closedAt: null
  });

  await storage.add("remainders", remainder("BATCH-OK-1"));
  await storage.add("remainders", remainder("BATCH-OK-2"));
  const reserved = await storage.reserveRemainders({
    remainderIds: ["BATCH-OK-1", "BATCH-OK-2"],
    jobId: "JOB-BATCH", timestamp: now
  });
  assert.equal(reserved.length, 2);
  for (const id of ["BATCH-OK-1", "BATCH-OK-2"]) {
    assert.equal((await storage.get("remainders", id)).status, "reserved");
    const reservations = await storage.getByIndex("reservations", "remainderId", id);
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].status, "active");
    const movements = await storage.getByIndex("movements", "remainderId", id);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].type, "reserved");
  }
  console.log("LULUS: reservasi massal mengunci seluruh stok dan mencatat riwayat.");

  await storage.add("remainders", remainder("BATCH-ROLLBACK-1"));
  await storage.add("remainders", remainder("BATCH-ROLLBACK-2", "damaged"));
  await assert.rejects(storage.reserveRemainders({
    remainderIds: ["BATCH-ROLLBACK-1", "BATCH-ROLLBACK-2"],
    jobId: "JOB-BATCH", timestamp: now
  }));
  assert.equal((await storage.get("remainders", "BATCH-ROLLBACK-1")).status, "available");
  assert.equal((await storage.get("remainders", "BATCH-ROLLBACK-2")).status, "available");
  assert.equal((await storage.getByIndex("reservations", "remainderId", "BATCH-ROLLBACK-1")).length, 0);
  assert.equal((await storage.getByIndex("movements", "remainderId", "BATCH-ROLLBACK-1")).length, 0);
  console.log("LULUS: kegagalan satu unit membatalkan seluruh reservasi dan riwayat.");

  await assert.rejects(storage.reserveRemainders({
    remainderIds: ["BATCH-OK-1", "BATCH-OK-1"], jobId: "JOB-BATCH"
  }), /unik/);
  console.log("LULUS: ID inventaris ganda ditolak.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian reservasi massal selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
