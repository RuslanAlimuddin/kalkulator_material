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

  // Dua tab/browser context yang berbeda tidak boleh berhasil memesan
  // sisa fisik yang sama secara bersamaan.
  await storage.add("remainders", remainder("BATCH-CONCURRENT"));
  const secondStorage = createStorage({ allowUnsafeInventoryWrites: true });
  await secondStorage.open();
  const concurrentResults = await Promise.allSettled([
    storage.reserveRemainders({
      remainderIds: ["BATCH-CONCURRENT"], jobId: "JOB-BATCH", timestamp: now
    }),
    secondStorage.reserveRemainders({
      remainderIds: ["BATCH-CONCURRENT"], jobId: "JOB-BATCH", timestamp: now
    })
  ]);
  assert.equal(concurrentResults.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(concurrentResults.filter(item => item.status === "rejected").length, 1);
  assert.equal((await storage.get("remainders", "BATCH-CONCURRENT")).status, "reserved");
  const concurrentReservations = await storage.getByIndex(
    "reservations", "remainderId", "BATCH-CONCURRENT"
  );
  assert.equal(concurrentReservations.length, 1);
  assert.equal(concurrentReservations.filter(item => item.status === "active").length, 1);
  const concurrentMovements = await storage.getByIndex(
    "movements", "remainderId", "BATCH-CONCURRENT"
  );
  assert.equal(concurrentMovements.length, 1);
  assert.equal(concurrentMovements[0].type, "reserved");
  // Dua instance tidak boleh mengonsumsi reservasi yang sama dua kali.
  await storage.add("remainders", remainder("BATCH-CONSUME-CONCURRENT"));
  const consumeReservation = await storage.reserveRemainders({
    remainderIds: ["BATCH-CONSUME-CONCURRENT"], jobId: "JOB-BATCH", timestamp: now
  });
  const consumeTimestamp = "2026-11-18T13:00:01.000Z";
  const consumeInput = {
    timestamp: consumeTimestamp,
    reservations: [{
      reservationId: consumeReservation[0].id,
      remainders: [{ id: "BATCH-CONSUME-CHILD", widthCm: 20, heightCm: 20 }]
    }],
    newSheetRemainders: []
  };
  const consumeResults = await Promise.allSettled([
    storage.consumeReservations(consumeInput),
    secondStorage.consumeReservations(consumeInput)
  ]);
  assert.equal(consumeResults.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(consumeResults.filter(item => item.status === "rejected").length, 1);
  assert.equal((await storage.get("remainders", "BATCH-CONSUME-CONCURRENT")).status, "consumed");
  assert.equal((await storage.get("reservations", consumeReservation[0].id)).status, "consumed");
  assert.ok(await storage.get("remainders", "BATCH-CONSUME-CHILD"));
  const sourceConsumeMovements = await storage.getByIndex(
    "movements", "remainderId", "BATCH-CONSUME-CONCURRENT"
  );
  assert.equal(sourceConsumeMovements.filter(item => item.type === "consumed").length, 1);
  const childCreateMovements = await storage.getByIndex(
    "movements", "remainderId", "BATCH-CONSUME-CHILD"
  );
  assert.equal(childCreateMovements.filter(item => item.type === "remainder_created").length, 1);
  assert.equal((await storage.getAll("remainders")).filter(item =>
    item.sourceRemainderId === "BATCH-CONSUME-CONCURRENT"
  ).length, 1);
  console.log("LULUS: konsumsi reservasi bersamaan dari dua instance hanya membuat satu turunan.");

  await secondStorage.close();
  console.log("LULUS: reservasi bersamaan dari dua instance hanya mengizinkan satu transaksi.");


  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian reservasi massal selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
