const assert = require("node:assert/strict");
const { calculateCutting } = require("../assets/js/cutting-engine.js");
const { calculateMaterialSources } = require("../assets/js/cutting-adapter.js");
const { createInventoryMatcher } = require("../assets/js/inventory-matcher.js");
const { createInventoryPlanner } = require("../assets/js/inventory-planner.js");

const matcher = createInventoryMatcher({ cuttingEngine: { calculateCutting } });
const planner = createInventoryPlanner({
  matcher,
  cuttingAdapter: { calculateMaterialSources },
  cuttingEngine: { calculateCutting }
});
const material = {
  id: "MAT-A", thicknessMm: 8, motif: "plain",
  grainRequired: false, rotationPolicy: "free"
};
const base = {
  materialId: "MAT-A", thicknessMm: 8, grainDirection: "none",
  motif: "plain", rotationAllowed: true, condition: "good",
  status: "available", createdAt: "2026-01-01T00:00:00.000Z"
};
const geometry = { cells: [
  { xStart: 0, yStart: 0, width: 40, height: 30, cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0 },
  { xStart: 40, yStart: 0, width: 40, height: 30, cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0 },
  { xStart: 80, yStart: 0, width: 40, height: 30, cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0 }
] };
const common = {
  geometry, material, newSheet: { widthCm: 100, heightCm: 60 },
  mode: "ekonomis", allowRotation: false
};
function test(name, fn) {
  fn();
  console.log("LULUS:", name);
}

test("planner memakai sisa inventaris lebih dahulu lalu lembar baru untuk kekurangan", () => {
  const r = planner.calculate({
    ...common,
    remainders: [{ ...base, id: "REM-1", widthCm: 40, heightCm: 30 }]
  });
  assert.equal(r.inventorySheetCount, 1);
  assert.equal(r.newSheetCount, 1);
  assert.equal(r.sheetCount, 2);
  assert.equal(r.cells.filter(c => c.source === "inventory").length, 1);
  assert.equal(r.cells.filter(c => c.source === "new").length, 2);
  assert.equal(r.inventoryUsage[0].remainderId, "REM-1");
});

test("planner dapat memakai beberapa unit sisa secara berurutan", () => {
  const twoPartGeometry = { ...geometry, cells: geometry.cells.slice(0, 2) };
  const r = planner.calculate({
    ...common,
    geometry: twoPartGeometry,
    remainders: [
      { ...base, id: "REM-1", widthCm: 40, heightCm: 30 },
      { ...base, id: "REM-2", widthCm: 40, heightCm: 30, createdAt: "2026-01-02T00:00:00.000Z" }
    ]
  });
  assert.equal(r.inventorySheetCount, 2);
  assert.equal(r.newSheetCount, 0);
  assert.equal(r.cells.filter(c => c.source === "inventory").length, 2);
});

test("planner tidak mengubah data inventaris saat hanya menghitung rencana", () => {
  const remainder = { ...base, id: "REM-1", widthCm: 40, heightCm: 30 };
  const before = JSON.stringify(remainder);
  planner.calculate({ ...common, remainders: [remainder] });
  assert.equal(JSON.stringify(remainder), before);
  assert.equal(remainder.status, "available");
});

test("planner mempertahankan semua koordinat geometri dan setiap potongan mendapat sumber", () => {
  const r = planner.calculate({ ...common, remainders: [] });
  assert.equal(r.cells.length, geometry.cells.length);
  assert.deepEqual(
    r.cells.map(c => [c.xStart, c.yStart, c.width, c.height]),
    geometry.cells.map(c => [c.xStart, c.yStart, c.width, c.height])
  );
  assert.ok(r.cells.every(c => c.source === "new"));
});

test("planner menolak geometri dan ukuran lembar baru yang tidak valid", () => {
  assert.throws(() => planner.calculate({ ...common, newSheet: { widthCm: 0, heightCm: 60 }, remainders: [] }));
  assert.throws(() => planner.calculate({ ...common, geometry: { cells: [{ width: 0, height: 10 }] }, remainders: [] }));
});

console.log("Semua pengujian planner inventaris selesai.");
