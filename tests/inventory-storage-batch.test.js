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

  // Rantai material harus tetap konsisten saat sisa turunan dipotong kembali.
  await storage.add("remainders", remainder("BATCH-LINEAGE-PARENT"));
  const parentReservation = await storage.reserveRemainders({
    remainderIds: ["BATCH-LINEAGE-PARENT"], jobId: "JOB-BATCH", timestamp: now
  });
  await storage.consumeReservations({
    timestamp: "2026-11-18T13:00:01.000Z",
    reservations: [{ reservationId: parentReservation[0].id,
      remainders: [{ id: "BATCH-LINEAGE-CHILD", widthCm: 30, heightCm: 20 }] }],
    newSheetRemainders: []
  });
  const childReservation = await storage.reserveRemainders({
    remainderIds: ["BATCH-LINEAGE-CHILD"], jobId: "JOB-BATCH",
    timestamp: "2026-11-18T13:00:02.000Z"
  });
  await storage.consumeReservations({
    timestamp: "2026-11-18T13:00:03.000Z",
    reservations: [{ reservationId: childReservation[0].id,
      remainders: [{ id: "BATCH-LINEAGE-GRANDCHILD", widthCm: 15, heightCm: 10 }] }],
    newSheetRemainders: []
  });
  assert.equal((await storage.get("remainders", "BATCH-LINEAGE-PARENT")).status, "consumed");
  assert.equal((await storage.get("remainders", "BATCH-LINEAGE-CHILD")).status, "consumed");
  assert.equal((await storage.get("remainders", "BATCH-LINEAGE-GRANDCHILD")).status, "available");
  assert.equal((await storage.get("remainders", "BATCH-LINEAGE-CHILD")).sourceRemainderId,
    "BATCH-LINEAGE-PARENT");
  assert.equal((await storage.get("remainders", "BATCH-LINEAGE-GRANDCHILD")).sourceRemainderId,
    "BATCH-LINEAGE-CHILD");
  const lineageReport = await storage.getRecoveryReport();
  assert.deepEqual(lineageReport.remainderLineageIssues, []);
  const beforeRepeatedRecovery = {
    remainders: await storage.getAll("remainders"),
    reservations: await storage.getAll("reservations"),
    movements: await storage.getAll("movements")
  };
  const repeatedRecoveryReport = await storage.getRecoveryReport();
  const afterRepeatedRecovery = {
    remainders: await storage.getAll("remainders"),
    reservations: await storage.getAll("reservations"),
    movements: await storage.getAll("movements")
  };
  assert.deepEqual(repeatedRecoveryReport, lineageReport);
  assert.deepEqual(afterRepeatedRecovery, beforeRepeatedRecovery);
  console.log("LULUS: pemulihan berulang bersifat read-only dan tidak menggandakan data.");
  console.log("LULUS: rantai sumber-induk, anak, dan cucu konsisten setelah konsumsi berulang.");

  // Impor merge bersamaan dengan ID yang sama harus menghasilkan satu paket utuh,
  // bukan dua salinan atau campuran data parsial.
  const importBundle = {
    schemaVersion: 1,
    materials: { schemaVersion: 1, materials: [{
      id: "BATCH-IMPORT-MAT", name: "Material impor uji", category: "uji",
      thicknessMm: 8, surface: "glossy", grainRequired: false, motif: "plain",
      rotationPolicy: "free", active: true
    }] },
    jobs: { schemaVersion: 1, jobs: [{
      id: "BATCH-IMPORT-JOB", name: "Pekerjaan impor uji", status: "open",
      createdAt: now, closedAt: null
    }] },
    remainders: { schemaVersion: 1, remainders: [{
      id: "BATCH-IMPORT-REM", materialId: "BATCH-IMPORT-MAT",
      widthCm: 45, heightCm: 32, thicknessMm: 8, grainDirection: "none",
      motif: "plain", rotationAllowed: true, condition: "good", status: "available",
      originJobId: "BATCH-IMPORT-JOB", sourceSheetId: "BATCH-IMPORT-SHEET",
      createdAt: now, updatedAt: now, version: 1
    }] },
    reservations: { schemaVersion: 1, reservations: [] },
    movements: { schemaVersion: 1, movements: [] }
  };
  const importResults = await Promise.allSettled([
    storage.importJSON(importBundle, "merge"),
    secondStorage.importJSON(importBundle, "merge")
  ]);
  assert.equal(importResults.filter(item => item.status === "fulfilled").length, 1);
  assert.equal(importResults.filter(item => item.status === "rejected").length, 1);
  assert.equal((await storage.getAll("materials")).filter(item => item.id === "BATCH-IMPORT-MAT").length, 1);
  assert.equal((await storage.getAll("jobs")).filter(item => item.id === "BATCH-IMPORT-JOB").length, 1);
  assert.equal((await storage.getAll("remainders")).filter(item => item.id === "BATCH-IMPORT-REM").length, 1);
  console.log("LULUS: impor merge bersamaan dengan ID sama hanya menyimpan satu paket utuh.");

  // Penghapusan pekerjaan tidak boleh berlomba dengan pembuatan stok yang merujuknya.
  await storage.add("materials", {
    id: "BATCH-DELETE-RACE-MAT", name: "Material race", category: "uji",
    thicknessMm: 8, surface: "glossy", grainRequired: false, motif: "plain",
    rotationPolicy: "free", active: true
  });
  await storage.add("jobs", {
    id: "BATCH-DELETE-RACE-JOB", name: "Pekerjaan race", status: "open",
    createdAt: now, closedAt: null
  });
  const catalogRace = await Promise.allSettled([
    storage.remove("jobs", "BATCH-DELETE-RACE-JOB"),
    secondStorage.createRemainder({
      id: "BATCH-DELETE-RACE-REM", materialId: "BATCH-DELETE-RACE-MAT",
      originJobId: "BATCH-DELETE-RACE-JOB", sourceSheetId: "BATCH-DELETE-RACE-SHEET",
      widthCm: 25, heightCm: 20, thicknessMm: 8, grainDirection: "none",
      motif: "plain", rotationAllowed: true, createdAt: "2026-11-18T13:00:04.000Z"
    })
  ]);
  assert.equal(catalogRace.filter(item => item.status === "fulfilled").length, 1);
  const raceJob = await storage.get("jobs", "BATCH-DELETE-RACE-JOB");
  const raceRemainder = await storage.get("remainders", "BATCH-DELETE-RACE-REM");
  if (raceRemainder) {
    assert.ok(raceJob, "Pekerjaan tidak boleh terhapus jika sisa material berhasil dibuat.");
    assert.equal(raceRemainder.originJobId, "BATCH-DELETE-RACE-JOB");
  } else {
    assert.equal(raceJob, null, "Jika pekerjaan terhapus lebih dulu, pembuatan sisa harus gagal.");
  }
  console.log("LULUS: penghapusan pekerjaan dan pembuatan stok tidak menghasilkan referensi yatim.");

  // Perubahan spesifikasi material tidak boleh berlomba dengan pembuatan stok lama.
  await storage.add("materials", {
    id: "BATCH-MATERIAL-RACE", name: "Material spesifikasi race", category: "uji",
    thicknessMm: 8, surface: "glossy", grainRequired: false, motif: "plain",
    rotationPolicy: "free", active: true
  });
  await storage.add("jobs", {
    id: "BATCH-MATERIAL-RACE-JOB", name: "Pekerjaan spesifikasi race", status: "open",
    createdAt: now, closedAt: null
  });
  const materialRace = await Promise.allSettled([
    storage.update("materials", "BATCH-MATERIAL-RACE", { thicknessMm: 10 }),
    secondStorage.createRemainder({
      id: "BATCH-MATERIAL-RACE-REM", materialId: "BATCH-MATERIAL-RACE",
      originJobId: "BATCH-MATERIAL-RACE-JOB", sourceSheetId: "BATCH-MATERIAL-RACE-SHEET",
      widthCm: 25, heightCm: 20, thicknessMm: 8, grainDirection: "none",
      motif: "plain", rotationAllowed: true, createdAt: "2026-11-18T13:00:05.000Z"
    })
  ]);
  assert.equal(materialRace.filter(item => item.status === "fulfilled").length, 1);
  const racedMaterial = await storage.get("materials", "BATCH-MATERIAL-RACE");
  const racedRemainder = await storage.get("remainders", "BATCH-MATERIAL-RACE-REM");
  if (racedRemainder) {
    assert.equal(racedMaterial.thicknessMm, 8, "Spesifikasi material tidak boleh berubah setelah stok dibuat.");
    assert.equal(racedRemainder.thicknessMm, racedMaterial.thicknessMm);
  } else {
    assert.equal(racedMaterial.thicknessMm, 10, "Jika spesifikasi berubah lebih dulu, stok lama harus gagal dibuat.");
  }
  console.log("LULUS: perubahan spesifikasi material dan pembuatan stok tetap konsisten saat bersamaan.");

  // Menutup pekerjaan dan mereservasi stoknya secara bersamaan harus terserialisasi.
  await storage.add("jobs", {
    id: "BATCH-CLOSE-RACE-JOB", name: "Pekerjaan tutup race", status: "open",
    createdAt: now, closedAt: null
  });
  await storage.add("remainders", remainder("BATCH-CLOSE-RACE-REM"));
  const closeRace = await Promise.allSettled([
    storage.update("jobs", "BATCH-CLOSE-RACE-JOB", {
      status: "closed", closedAt: "2026-11-18T13:00:06.000Z"
    }),
    secondStorage.reserveRemainders({
      remainderIds: ["BATCH-CLOSE-RACE-REM"], jobId: "BATCH-CLOSE-RACE-JOB",
      timestamp: "2026-11-18T13:00:06.000Z"
    })
  ]);
  assert.equal(closeRace.filter(item => item.status === "fulfilled").length, 1);
  const closeRaceJob = await storage.get("jobs", "BATCH-CLOSE-RACE-JOB");
  const closeRaceRemainder = await storage.get("remainders", "BATCH-CLOSE-RACE-REM");
  const closeRaceReservations = await storage.getByIndex(
    "reservations", "remainderId", "BATCH-CLOSE-RACE-REM"
  );
  if (closeRaceJob.status === "closed") {
    assert.equal(closeRaceRemainder.status, "available");
    assert.equal(closeRaceReservations.filter(item => item.status === "active").length, 0);
  } else {
    assert.equal(closeRaceJob.status, "open");
    assert.equal(closeRaceRemainder.status, "reserved");
    assert.equal(closeRaceReservations.filter(item => item.status === "active").length, 1);
  }
  console.log("LULUS: penutupan pekerjaan dan reservasi stok tidak dapat saling mendahului secara tidak konsisten.");

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
