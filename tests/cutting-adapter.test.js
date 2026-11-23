const assert = require("node:assert/strict");
const { calculateGeometry } = require("../assets/js/engine.js");
const { calculateCutting } = require("../assets/js/cutting-engine.js");
const { calculateMaterialSources } = require("../assets/js/cutting-adapter.js");

function test(name, fn) {
  fn();
  console.log("LULUS:", name);
}

const stripGeometry = calculateGeometry({
  wallW: 600, wallH: 100, matW: 20, matH: 600, gap: 0,
  pattern: "stack", direction: "horizontal", alignment: "BL"
});

test("mode presisi tetap memakai satu lembar per grid", () => {
  const r = calculateMaterialSources({
    geometry: stripGeometry, sheetW: 20, sheetH: 600, mode: "presisi",
    cuttingEngine: { calculateCutting }
  });
  assert.equal(r.cells.length, 30);
  assert.equal(r.sheetCount, 30);
  assert.equal(r.reuseCount, 0);
  assert.ok(r.cells.every(c => c.source === "new"));
});

test("mode presisi mempertahankan aturan khusus strip panjang", () => {
  const r = calculateMaterialSources({
    geometry: stripGeometry, sheetW: 20, sheetH: 600,
    mode: "presisi", autoStripReuse: true,
    cuttingEngine: { calculateCutting }
  });
  assert.equal(r.sheetCount, 5);
  assert.equal(r.reuseCount, 25);
  assert.equal(new Set(r.cells.map(c => c.sheetId)).size, 5);
});

test("mode ekonomis menyusun potongan berbeda pada lembar sumber yang sama", () => {
  const geometry = {
    cells: Array.from({ length: 4 }, (_, i) => ({
      xStart: (i % 2) * 120, yStart: Math.floor(i / 2) * 60,
      width: 120, height: 60,
      cutLeft: 0, cutRight: 0, cutTop: 0, cutBottom: 0
    }))
  };
  const r = calculateMaterialSources({
    geometry, sheetW: 240, sheetH: 120, mode: "ekonomis",
    allowRotation: true, cuttingEngine: { calculateCutting }
  });
  assert.equal(r.sheetCount, 1);
  assert.equal(r.reuseCount, 3);
  assert.ok(r.cells.every(c => c.sheetId === 1));
});

test("hasil adapter mempertahankan koordinat dan kategori potongan untuk UI", () => {
  const r = calculateMaterialSources({
    geometry: stripGeometry, sheetW: 20, sheetH: 600,
    mode: "presisi", autoStripReuse: true,
    cuttingEngine: { calculateCutting }
  });
  assert.deepEqual(
    r.cells.map(c => [c.xStart, c.yStart, c.width, c.height]),
    stripGeometry.cells.map(c => [c.xStart, c.yStart, c.width, c.height])
  );
  assert.ok(r.cells.every(c => Number.isInteger(c.nCuts) && c.nCuts >= 0));
  assert.ok(r.cells.every(c => Number.isInteger(c.sheetId) && c.sheetId > 0));
});

test("input ukuran lembar tidak valid ditolak", () => {
  assert.throws(() => calculateMaterialSources({
    geometry: stripGeometry, sheetW: 0, sheetH: 600, mode: "presisi",
    cuttingEngine: { calculateCutting }
  }), /lebih dari 0/);
});


test("adapter meneruskan batas minimum dan memisahkan sisa layak/tidak layak", () => {
  const geometry = { cells: [{
    xStart: 0, yStart: 0, width: 60, height: 100,
    cutLeft: 0, cutRight: 40, cutTop: 0, cutBottom: 0
  }] };
  const r = calculateMaterialSources({
    geometry, sheetW: 100, sheetH: 100, mode: "presisi",
    minRemainderW: 50, minRemainderH: 30,
    cuttingEngine: { calculateCutting }
  });
  assert.equal(r.reusableRemainders.length, 1);
  assert.equal(r.usableRemainders.length, 0);
  assert.equal(r.tooSmallRemainders.length, 1);
  assert.equal(r.tooSmallRemainderArea, 4000);
});

test("adapter menolak ukuran minimum sisa negatif", () => {
  assert.throws(() => calculateMaterialSources({
    geometry: stripGeometry, sheetW: 20, sheetH: 600, mode: "presisi",
    minRemainderW: -1, cuttingEngine: { calculateCutting }
  }), /tidak boleh negatif/);
});

test("adapter menolak mode yang tidak dikenal", () => {
  assert.throws(() => calculateMaterialSources({
    geometry: stripGeometry, sheetW: 20, sheetH: 600, mode: "unknown",
    cuttingEngine: { calculateCutting }
  }), /Mode pemotongan harus presisi atau ekonomis/);
});

test("parameter kerf dan batas sisa tetap divalidasi saat geometri kosong", () => {
  const emptyGeometry = { cells: [] };
  assert.throws(() => calculateMaterialSources({
    geometry: emptyGeometry, sheetW: 20, sheetH: 600, mode: "presisi",
    kerf: -1, cuttingEngine: { calculateCutting }
  }), /Kerf tidak boleh negatif/);
  assert.throws(() => calculateMaterialSources({
    geometry: emptyGeometry, sheetW: 20, sheetH: 600, mode: "presisi",
    minRemainderW: -1, cuttingEngine: { calculateCutting }
  }), /Ukuran minimum sisa tidak boleh negatif/);
});

console.log("Semua pengujian adapter pemotongan selesai.");
