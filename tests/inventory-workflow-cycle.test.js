const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const storageModule = require("../assets/js/inventory-storage.js");
const cuttingEngine = require("../assets/js/cutting-engine.js");
const cuttingAdapter = require("../assets/js/cutting-adapter.js");
const matcherModule = require("../assets/js/inventory-matcher.js");
const plannerModule = require("../assets/js/inventory-planner.js");
const engineModule = require("../assets/js/inventory-engine.js");
const workflowModule = require("../assets/js/inventory-workflow.js");

const now = "2026-11-18T15:00:00.000Z";
function remainder(id) {
  return {
    id, materialId: "MAT-CYCLE", widthCm: 40, heightCm: 30,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-A", sourceSheetId: "JOB-A-SHEET-" + id,
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
  await storage.add("remainders", remainder("CYCLE-REM-1"));
  await storage.add("remainders", remainder("CYCLE-REM-2"));

  const matcher = matcherModule.createInventoryMatcher({ cuttingEngine });
  const planner = plannerModule.createInventoryPlanner({
    matcher,
    cuttingAdapter,
    cuttingEngine
  });
  const inventoryEngine = engineModule.createInventoryEngine({ storage });
  const workflow = workflowModule.createInventoryWorkflow({
    storage, planner, inventoryEngine
  });

  const material = {
    id: "MAT-CYCLE", name: "Papan uji", category: "board",
    thicknessMm: 8, grainRequired: false, motif: "plain",
    rotationPolicy: "free", active: true
  };
  const plannerInput = {
    geometry: {
      cells: [
        { xStart: 0, yStart: 0, width: 40, height: 30, cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0 },
        { xStart: 40, yStart: 0, width: 40, height: 30, cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0 },
        { xStart: 80, yStart: 0, width: 40, height: 30, cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0 }
      ]
    },
    material,
    newSheet: { widthCm: 100, heightCm: 60 },
    motif: "plain",
    grainDirection: "none",
    mode: "ekonomis",
    allowRotation: false,
    minRemainderW: 10,
    minRemainderH: 10,
    kerf: 0
  };

  const reservedPlan = await workflow.calculateAndReserve({
    jobId: "JOB-B",
    plannerInput,
    timestamp: now
  });
  assert.equal(reservedPlan.inventoryUsage.length, 2);
  assert.equal(reservedPlan.reservations.length, 2);
  assert.equal(reservedPlan.plan.inventorySheetCount, 2);
  assert.equal(reservedPlan.plan.newSheetCount, 1);
  assert.ok(reservedPlan.plan.usableRemainders.some(item => item.source === "new"));
  for (const reservation of reservedPlan.reservations) {
    assert.equal((await storage.get("remainders", reservation.remainderId)).status, "reserved");
  }
  console.log("LULUS: planner nyata memilih dua stok inventaris dan satu lembar baru, lalu reservasi mengunci kedua stok.");

  const completed = await workflow.complete(reservedPlan, {
    sourceSheetIdPrefix: "JOB-B-SHEET",
    timestamp: now
  });
  assert.equal(completed.consumedReservations.length, 2);
  assert.ok(completed.createdRemainders.some(item => item.sourceType === "new"));
  assert.equal(completed.createdRemainders.filter(item => item.sourceType === "new").length,
    reservedPlan.plan.usableRemainders.filter(item => item.source === "new").length);

  for (const reservation of reservedPlan.reservations) {
    assert.equal((await storage.get("remainders", reservation.remainderId)).status, "consumed");
    assert.equal((await storage.get("reservations", reservation.id)).status, "consumed");
  }
  const newSheetRemainders = completed.createdRemainders.filter(item => item.sourceType === "new");
  assert.ok(newSheetRemainders.length > 0);
  for (const item of newSheetRemainders) {
    const saved = await storage.get("remainders", item.id);
    assert.equal(saved.status, "available");
    assert.equal(saved.originJobId, "JOB-B");
    assert.equal(saved.materialId, "MAT-CYCLE");
    assert.ok(saved.sourceSheetId.includes("NEW-"));
  }
  console.log("LULUS: penyelesaian B mengonsumsi stok lama dan menyimpan sisa dari lembar baru dalam satu transaksi.");

  const nextStock = newSheetRemainders[0];
  const reservedC = await storage.reserveRemainder({
    remainderId: nextStock.id, jobId: "JOB-C", timestamp: now
  });
  const consumedC = await inventoryEngine.consumeReservation({
    reservationId: reservedC.id,
    sourceSheetId: "JOB-C-SHEET-1",
    timestamp: now,
    remainders: [{ widthCm: 8, heightCm: 6 }]
  });
  assert.equal((await storage.get("remainders", nextStock.id)).status, "consumed");
  assert.equal(consumedC.createdRemainders.length, 1);
  const childC = await storage.get("remainders", consumedC.createdRemainders[0].id);
  assert.equal(childC.originJobId, "JOB-C");
  assert.equal(childC.status, "available");
  console.log("LULUS: sisa lembar baru dari B dapat dipakai pekerjaan C dan menghasilkan sisa turunan baru.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian siklus planner → reservasi → konsumsi → pekerjaan berikutnya selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
