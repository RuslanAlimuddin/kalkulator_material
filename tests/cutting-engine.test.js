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

test("penempatan dan seluruh bidang sisa selalu di dalam lembar serta tidak bertumpuk", () => {
  const result = calculateCutting({
    sheetW: 100, sheetH: 80, kerf: 1, allowRotation: true,
    parts: [
      { id: "A", width: 35, height: 25, quantity: 3 },
      { id: "B", width: 20, height: 40, quantity: 2 },
      { id: "C", width: 15, height: 15, quantity: 4 }
    ]
  });
  const epsilon = 0.000001;
  const overlaps = (a, b) =>
    Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) + epsilon &&
    Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y) + epsilon;

  for (const sheet of result.sheets) {
    const rectangles = sheet.placements.concat(sheet.leftovers);
    for (let i = 0; i < rectangles.length; i += 1) {
      const rect = rectangles[i];
      assert.ok(rect.x >= 0 && rect.y >= 0);
      assert.ok(rect.width > 0 && rect.height > 0);
      assert.ok(rect.x + rect.width <= sheet.width + epsilon);
      assert.ok(rect.y + rect.height <= sheet.height + epsilon);
      for (let j = i + 1; j < rectangles.length; j += 1) {
        assert.equal(overlaps(rect, rectangles[j]), false,
          "Bidang pada lembar " + sheet.id + " tidak boleh saling bertumpuk");
      }
    }
  }
  const accountedArea = result.totalPartArea + result.reusableArea + result.unclassifiedArea;
  assert.ok(Math.abs(accountedArea - result.totalSheetArea) < 0.001);
});

test("ukuran, jumlah, dan kerf tidak valid ditolak", () => {
  assert.throws(() => calculateCutting({ sheetW: 0, sheetH: 100, parts: [{ width: 1, height: 1 }] }));
  assert.throws(() => calculateCutting({ sheetW: 100, sheetH: 100, kerf: -1, parts: [{ width: 1, height: 1 }] }));
  assert.throws(() => calculateCutting({ sheetW: 100, sheetH: 100, parts: [{ width: 1, height: 1, quantity: 0 }] }));
});


test("sisa diklasifikasikan jika lebar atau tinggi di bawah batas minimum", () => {
  const r = calculateCutting({
    sheetW: 100, sheetH: 100,
    minRemainderW: 50, minRemainderH: 30,
    parts: [{ width: 60, height: 100 }]
  });
  assert.equal(r.reusableRemainders.length, 1);
  assert.equal(r.usableRemainders.length, 0);
  assert.equal(r.tooSmallRemainders.length, 1);
  assert.equal(r.tooSmallRemainders[0].width, 40);
  assert.equal(r.tooSmallRemainders[0].height, 100);
  assert.equal(r.tooSmallRemainderArea, 4000);
  assert.equal(r.usableRemainderArea, 0);
});

test("sisa tepat pada batas minimum dinyatakan layak", () => {
  const r = calculateCutting({
    sheetW: 100, sheetH: 100,
    minRemainderW: 40, minRemainderH: 100,
    parts: [{ width: 60, height: 100 }]
  });
  assert.equal(r.usableRemainders.length, 1);
  assert.equal(r.tooSmallRemainders.length, 0);
});

test("ukuran minimum sisa negatif ditolak", () => {
  assert.throws(() => calculateCutting({
    sheetW: 100, sheetH: 100, minRemainderW: -1,
    parts: [{ width: 50, height: 50 }]
  }), /tidak boleh negatif/);
});

console.log("Semua pengujian mesin pemotongan selesai.");
