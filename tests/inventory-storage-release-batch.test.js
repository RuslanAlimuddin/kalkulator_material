const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const storageModule = require("../assets/js/inventory-storage.js");
const now = "2026-11-18T14:00:00.000Z";

function item(id) {
  return {
    id, materialId: "MAT-RELEASE", widthCm: 40, heightCm: 25,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-SOURCE", sourceSheetId: "SHEET-" + id,
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

  await storage.add("remainders", item("RELEASE-1"));
  await storage.add("remainders", item("RELEASE-2"));
  const reserved = await storage.reserveRemainders({
    remainderIds: ["RELEASE-1", "RELEASE-2"],
    jobId: "JOB-TARGET",
    timestamp: now
  });
  const ids = reserved.map(record => record.id);

  const released = await storage.releaseReservations({
    reservationIds: ids,
    timestamp: now
  });
  assert.deepEqual(released, ids);
  for (const sourceId of ["RELEASE-1", "RELEASE-2"]) {
    assert.equal((await storage.get("remainders", sourceId)).status, "available");
    const reservation = (await storage.getByIndex("reservations", "remainderId", sourceId))[0];
    assert.equal(reservation.status, "released");
    assert.equal(reservation.releasedAt, now);
    const movements = await storage.getByIndex("movements", "remainderId", sourceId);
    assert.equal(movements.filter(move => move.type === "reservation_released").length, 1);
  }
  console.log("LULUS: pelepasan massal mengembalikan semua stok dan mencatat riwayat.");

  await storage.add("remainders", item("ROLLBACK-1"));
  await storage.add("remainders", item("ROLLBACK-2"));
  const rollbackReservations = await storage.reserveRemainders({
    remainderIds: ["ROLLBACK-1", "ROLLBACK-2"],
    jobId: "JOB-TARGET",
    timestamp: now
  });
  const first = rollbackReservations[0];
  const second = rollbackReservations[1];
  await storage.releaseReservation(second.id, { timestamp: now });

  await assert.rejects(storage.releaseReservations({
    reservationIds: [first.id, second.id],
    timestamp: now
  }));
  assert.equal((await storage.get("remainders", "ROLLBACK-1")).status, "reserved");
  assert.equal((await storage.get("remainders", "ROLLBACK-2")).status, "available");
  assert.equal((await storage.get("reservations", first.id)).status, "active");
  assert.equal((await storage.get("reservations", second.id)).status, "released");
  const firstMoves = await storage.getByIndex("movements", "remainderId", "ROLLBACK-1");
  assert.equal(firstMoves.filter(move => move.type === "reservation_released").length, 0);
  console.log("LULUS: satu reservasi tidak aktif membatalkan seluruh pelepasan massal.");

  await assert.rejects(storage.releaseReservations({
    reservationIds: [first.id, first.id]
  }), /unik/);
  await assert.rejects(storage.releaseReservations({
    reservationIds: [""]
  }), /valid/);
  console.log("LULUS: ID reservasi kosong atau duplikat ditolak.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian pelepasan massal selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
