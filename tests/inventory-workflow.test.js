const assert = require("node:assert/strict");
require("fake-indexeddb/auto");

const storageModule = require("../assets/js/inventory-storage.js");
const workflowModule = require("../assets/js/inventory-workflow.js");
const now = "2026-11-18T14:30:00.000Z";

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
  await storage.add("remainders", {
    id: "WF-AVAILABLE", materialId: "MAT-WF", widthCm: 40, heightCm: 30,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-A", sourceSheetId: "SHEET-A",
    createdAt: now, updatedAt: now, version: 1
  });
  await storage.add("remainders", {
    id: "WF-DAMAGED", materialId: "MAT-WF", widthCm: 40, heightCm: 30,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "damaged", status: "available",
    originJobId: "JOB-A", sourceSheetId: "SHEET-B",
    createdAt: now, updatedAt: now, version: 1
  });
  await storage.add("remainders", {
    id: "WF-RESERVED", materialId: "MAT-WF", widthCm: 40, heightCm: 30,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "reserved",
    originJobId: "JOB-A", sourceSheetId: "SHEET-C",
    createdAt: now, updatedAt: now, version: 1
  });

  let plannerCalls = 0;
  let reserveCalls = 0;
  let cancelCalls = 0;
  let completeCalls = 0;
  let lastReserveInput = null;
  const planner = {
    calculate(input) {
      plannerCalls += 1;
      assert.deepEqual(input.remainders.map(item => item.id), ["WF-AVAILABLE"]);
      return {
        inventoryUsage: [{ remainderId: "WF-AVAILABLE" }],
        usableRemainders: [],
        attempt: plannerCalls
      };
    }
  };
  const engine = {
    async reservePlan(input) {
      lastReserveInput = input;
      reserveCalls += 1;
      if (reserveCalls === 1) throw new Error("Stok berubah saat reservasi.");
      return {
        plan: input.plan,
        reservations: [{ id: "RSV-WF", remainderId: "WF-AVAILABLE" }],
        inventoryUsage: [{
          remainderId: "WF-AVAILABLE",
          reservationId: "RSV-WF"
        }]
      };
    },
    async cancelPlan(input) {
      cancelCalls += 1;
      return { releasedReservations: input.reservedPlan.reservations.map(item => item.id) };
    },
    async consumePlan(input) {
      completeCalls += 1;
      return { consumedReservations: input.reservedPlan.reservations.map(item => item.id) };
    }
  };

  const workflow = workflowModule.createInventoryWorkflow({ storage, planner, inventoryEngine: engine });
  const available = await workflow.readAvailableRemainders();
  assert.deepEqual(available.map(item => item.id), ["WF-AVAILABLE"]);
  console.log("LULUS: workflow hanya membaca stok available dengan kondisi good.");

  const reservedPlan = await workflow.calculateAndReserve({
    jobId: "JOB-B",
    plannerInput: { geometry: { cells: [] }, material: { id: "MAT-WF" } },
    timestamp: now
  });
  assert.equal(reservedPlan.attemptCount, 2);
  assert.equal(reservedPlan.inventorySnapshotCount, 1);
  assert.equal(plannerCalls, 2);
  assert.equal(reserveCalls, 2);
  assert.equal(reservedPlan.plan.attempt, 2);
  console.log("LULUS: konflik reservasi memicu pembacaan ulang dan perencanaan ulang, bukan memakai rencana lama.");

  const reserveCallsBeforePreview = reserveCalls;
  const preview = await workflow.preview({
    jobId: "JOB-B-PREVIEW",
    plannerInput: { geometry: { cells: [] }, material: { id: "MAT-WF" } },
    timestamp: now
  });
  assert.equal(preview.plan.attempt, 3);
  assert.equal(plannerCalls, 3);
  assert.equal(reserveCalls, reserveCallsBeforePreview);
  console.log("LULUS: pratinjau menghitung rencana tanpa mengunci stok.");

  const plannerCallsBeforeConfirm = plannerCalls;
  const confirmedPreview = await workflow.confirmPreview(preview, { timestamp: now });
  assert.equal(confirmedPreview.plan, preview.plan);
  assert.equal(reserveCalls, reserveCallsBeforePreview + 1);
  assert.equal(plannerCalls, plannerCallsBeforeConfirm);
  assert.equal(lastReserveInput.previewCreatedAt, preview.previewCreatedAt);
  console.log("LULUS: konfirmasi memakai rencana yang ditampilkan tanpa menghitung ulang atau mengganti sumber diam-diam.");
  console.log("LULUS: waktu pembuatan pratinjau diteruskan ke snapshot reservasi.");

  const canceled = await workflow.cancel(reservedPlan, { timestamp: now });
  assert.deepEqual(canceled.releasedReservations, ["RSV-WF"]);
  assert.equal(cancelCalls, 1);
  const completed = await workflow.complete(reservedPlan, {
    sourceSheetIdPrefix: "JOB-B-SHEET",
    timestamp: now
  });
  assert.deepEqual(completed.consumedReservations, ["RSV-WF"]);
  assert.equal(completeCalls, 1);
  console.log("LULUS: workflow meneruskan pembatalan dan penyelesaian ke inventory engine.");

  await assert.rejects(workflow.calculateAndReserve({
    jobId: "",
    plannerInput: {}
  }), /ID pekerjaan/);
  await assert.rejects(workflow.calculateAndReserve({
    jobId: "JOB-B",
    plannerInput: {},
    maxReservationAttempts: 0
  }), /1 sampai 5/);
  console.log("LULUS: input pekerjaan dan batas percobaan divalidasi.");

  await storage.close();
  await deleteDatabase();
  console.log("Semua pengujian workflow inventaris selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
