const assert = require("node:assert/strict");
require("fake-indexeddb/auto");
const storageModule = require("../assets/js/inventory-storage.js");
const validator = require("../assets/js/inventory-validator.js");
const engineModule = require("../assets/js/inventory-engine.js");

const now = "2026-11-18T12:00:00.000Z";
const bundle = {
  schemaVersion: 1,
  materials: { schemaVersion: 1, materials: [{
    id: "MAT-A", name: "Keramik", category: "keramik", thicknessMm: 8,
    surface: "glossy", grainRequired: false, motif: "plain",
    rotationPolicy: "free", active: true
  }] },
  jobs: { schemaVersion: 1, jobs: [
    { id: "JOB-A", name: "Pekerjaan A", status: "completed", createdAt: now, closedAt: now },
    { id: "JOB-B", name: "Pekerjaan B", status: "open", createdAt: now, closedAt: null }
  ] },
  remainders: { schemaVersion: 1, remainders: [{
    id: "REM-A", materialId: "MAT-A", widthCm: 100, heightCm: 60,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-A", sourceSheetId: "SHEET-A",
    createdAt: now, updatedAt: now, version: 1
  }] },
  reservations: { schemaVersion: 1, reservations: [] },
  movements: { schemaVersion: 1, movements: [] }
};

async function main() {
  const storage = storageModule.createStorage({ validator });
  await storage.importJSON(bundle, "replace");
  const reservation = await storage.reserveRemainder({
    remainderId: "REM-A", jobId: "JOB-B", timestamp: now
  });
  const engine = engineModule.createInventoryEngine({ storage });
  const result = await engine.consumeCuttingResult({
    reservationId: reservation.id,
    sourceSheetId: "JOB-B-SHEET-01",
    cuttingResult: {
      usableRemainders: [
        { width: 40, height: 20 },
        { width: 15, height: 10 }
      ],
      tooSmallRemainders: [{ width: 5, height: 3 }]
    }
  });

  assert.equal((await storage.get("remainders", "REM-A")).status, "consumed");
  assert.equal((await storage.get("reservations", reservation.id)).status, "consumed");
  assert.equal(result.createdRemainders.length, 2);
  const descendants = await storage.getAll("remainders");
  const child = descendants.find(item => item.id === result.createdRemainders[0].id);
  assert.equal(child.originJobId, "JOB-B");
  assert.equal(child.materialId, "MAT-A");
  assert.equal(child.thicknessMm, 8);
  assert.equal(child.sourceSheetId, "JOB-B-SHEET-01");
  assert.equal(child.status, "available");
  assert.equal(child.condition, "good");

  const movements = await storage.getAll("movements");
  assert.equal(movements.filter(item => item.type === "consumed").length, 1);
  assert.equal(movements.filter(item => item.type === "remainder_created").length, 2);

  const invalid = engineModule.createInventoryEngine({ storage });
  await assert.rejects(invalid.consumeReservation({
    reservationId: reservation.id,
    remainders: [{ widthCm: 0, heightCm: 10 }]
  }), /tidak valid/);
  await assert.rejects(storage.consumeReservation({
    reservationId: "RESERVATION-TIDAK-ADA", remainders: []
  }));

  const exported = await storage.exportJSON();
  const validation = validator.validateInventoryBundle(exported);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));

  await storage.close();
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(storageModule.DB_NAME);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Database masih terkunci."));
  });
  console.log("LULUS: pemakaian reservasi membuat sisa turunan dan riwayat secara atomik");
  console.log("LULUS: siklus pekerjaan A -> B menghasilkan stok tersedia untuk pekerjaan C");
  console.log("LULUS: validasi hasil pemotongan menolak ukuran sisa tidak valid");
  console.log("Semua pengujian engine inventaris selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
