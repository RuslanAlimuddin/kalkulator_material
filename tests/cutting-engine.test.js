const assert = require("node:assert/strict");
const { calculateCutting } = require("../assets/js/cutting-engine.js");

function test(name, fn) {
  fn();
  console.log("LULUS:", name);
}

test("30 potongan 20×100 pada lembar 20×600 memerlukan 5 lembar", () => {
  const r = calculateCutting({
    sheetW: 20, sheetH: 600,
    parts: [{ id: "strip", width: 20, height: 100, quantity: 30 }]
  });
  assert.equal(r.partCount, 30);
  assert.equal(r.sheetCount, 5);
  assert.ok(r.sheets.every(s => s.placements.length === 6));
});

test("satu potongan sama ukuran dengan lembar memakai satu lembar", () => {
  const r = calculateCutting({
    sheetW: 240, sheetH: 120,
    parts: [{ width: 240, height: 120 }]
  });
  assert.equal(r.sheetCount, 1);
  assert.equal(r.reusableRemainders.length, 0);
});

test("empat potongan 120×60 muat pada satu lembar 240×120", () => {
  const r = calculateCutting({
    sheetW: 240, sheetH: 120,
    parts: [{ width: 120, height: 60, quantity: 4 }]
  });
  assert.equal(r.sheetCount, 1);
  assert.equal(r.sheets[0].placements.length, 4);
});

test("rotasi hanya digunakan jika diizinkan", () => {
  const input = {
    sheetW: 100, sheetH: 200,
    parts: [{ width: 200, height: 100 }]
  };
  assert.throws(() => calculateCutting(input), /tidak muat/);
  const r = calculateCutting({ ...input, allowRotation: true });
  assert.equal(r.sheetCount, 1);
  assert.equal(r.sheets[0].placements[0].rotated, true);
});

test("ruang lebih kecil dari kerf tidak dicatat sebagai sisa pakai", () => {
  const r = calculateCutting({
    sheetW: 100, sheetH: 50, kerf: 2,
    parts: [{ width: 99, height: 50 }]
  });
  assert.equal(r.reusableRemainders.length, 0);
  assert.equal(r.unclassifiedArea, 50);
});

test("kerf menyisakan jarak antarpotongan", () => {
  const r = calculateCutting({
    sheetW: 99, sheetH: 50, kerf: 2,
    parts: [{ width: 49, height: 50, quantity: 2 }]
  });
  assert.equal(r.sheetCount, 2);
});

test("ukuran, jumlah, dan kerf tidak valid ditolak", () => {
  assert.throws(() => calculateCutting({ sheetW: 0, sheetH: 100, parts: [{ width: 1, height: 1 }] }));
  assert.throws(() => calculateCutting({ sheetW: 100, sheetH: 100, kerf: -1, parts: [{ width: 1, height: 1 }] }));
  assert.throws(() => calculateCutting({ sheetW: 100, sheetH: 100, parts: [{ width: 1, height: 1, quantity: 0 }] }));
});

console.log("Semua pengujian mesin pemotongan selesai.");
