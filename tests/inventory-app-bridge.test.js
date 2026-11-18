const assert = require("node:assert/strict");
const geometryEngine = require("../assets/js/engine.js");
const bridgeModule = require("../assets/js/inventory-app-bridge.js");

const calls = { preview: 0, confirm: 0, cancel: 0, complete: 0, input: null };
const workflow = {
  async preview(input) {
    calls.preview += 1;
    calls.input = input;
    return { plan: { inventoryUsage: [] }, jobId: input.jobId };
  },
  async confirmPreview(plan, options) {
    calls.confirm += 1;
    return { ...plan, confirmed: true, options };
  },
  async cancel(plan, options) {
    calls.cancel += 1;
    return { canceled: true, plan, options };
  },
  async complete(plan, options) {
    calls.complete += 1;
    return { completed: true, plan, options };
  }
};
const bridge = bridgeModule.createInventoryAppBridge({ geometryEngine, workflow });
const material = {
  id: "MAT-BRIDGE", thicknessMm: 8, motif: "plain",
  grainRequired: false, rotationPolicy: "free", active: true
};

async function test(name, fn) {
  await fn();
  console.log("LULUS:", name);
}

async function main() {
  await test("jembatan membentuk geometri yang sama dengan mesin utama untuk orientasi portrait", async () => {
    const input = bridge.buildPlannerInput({
      wallWidthM: 6, wallHeightM: 3,
      materialLengthCm: 220, materialWidthCm: 110,
      orientation: "0", gapCm: 1,
      pattern: "running", direction: "horizontal", alignment: "BL",
      mode: "ekonomis", material,
      minRemainderW: 10, minRemainderH: 8
    });
    const expected = geometryEngine.calculateGeometry({
      wallW: 600, wallH: 300, matW: 110, matH: 220,
      gap: 1, pattern: "running", direction: "horizontal", alignment: "BL"
    });
    assert.deepEqual(input.geometry, expected);
    assert.deepEqual(input.newSheet, { widthCm: 110, heightCm: 220 });
    assert.equal(input.allowRotation, true);
    assert.equal(input.autoStripReuse, false);
  });

  await test("orientasi landscape dan aturan strip panjang mengikuti kalkulator lama", async () => {
    const landscape = bridge.buildPlannerInput({
      wallWidthM: 6, wallHeightM: 1.5,
      materialLengthCm: 220, materialWidthCm: 110,
      orientation: "1", pattern: "stack", alignment: "BL",
      mode: "presisi", material
    });
    assert.deepEqual(landscape.newSheet, { widthCm: 220, heightCm: 110 });
    const strip = bridge.buildPlannerInput({
      wallWidthM: 6, wallHeightM: 1.5,
      materialLengthCm: 220, materialWidthCm: 110,
      orientation: "0", pattern: "stack", alignment: "BL",
      mode: "presisi", material
    });
    assert.equal(strip.autoStripReuse, true);
  });

  await test("preview meneruskan input ke workflow tanpa mengonfirmasi reservasi", async () => {
    const preview = await bridge.preview({
      jobId: "JOB-BRIDGE",
      wallWidthM: 6, wallHeightM: 3,
      materialLengthCm: 220, materialWidthCm: 110,
      orientation: "0", pattern: "stack", alignment: "BL",
      mode: "ekonomis", material
    });
    assert.equal(preview.jobId, "JOB-BRIDGE");
    assert.equal(calls.preview, 1);
    assert.equal(calls.confirm, 0);
    assert.equal(calls.input.plannerInput.material.id, "MAT-BRIDGE");
  });

  await test("konfirmasi, pembatalan, dan penyelesaian diteruskan ke workflow", async () => {
    const preview = { plan: {}, jobId: "JOB-BRIDGE" };
    assert.equal((await bridge.confirm(preview)).confirmed, true);
    assert.equal((await bridge.cancel(preview)).canceled, true);
    assert.equal((await bridge.complete(preview)).completed, true);
    assert.equal(calls.confirm, 1);
    assert.equal(calls.cancel, 1);
    assert.equal(calls.complete, 1);
  });

  await test("input dimensi, orientasi, material, dan mode yang tidak valid ditolak", async () => {
    assert.throws(() => bridge.buildPlannerInput({
      wallWidthM: 0, wallHeightM: 3, materialLengthCm: 220,
      materialWidthCm: 110, material, orientation: "0"
    }));
    assert.throws(() => bridge.buildPlannerInput({
      wallWidthM: 6, wallHeightM: 3, materialLengthCm: 220,
      materialWidthCm: 110, material, orientation: "2"
    }));
    assert.throws(() => bridge.buildPlannerInput({
      wallWidthM: 6, wallHeightM: 3, materialLengthCm: 220,
      materialWidthCm: 110, material, mode: "unknown"
    }));
    assert.throws(() => bridge.buildPlannerInput({
      wallWidthM: 6, wallHeightM: 3, materialLengthCm: 220,
      materialWidthCm: 110
    }));
  });

  console.log("Semua pengujian jembatan aplikasi-inventaris selesai.");
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
