const assert = require("node:assert/strict");
const { calculateCutting } = require("../assets/js/cutting-engine.js");
const { createInventoryMatcher } = require("../assets/js/inventory-matcher.js");

const matcher = createInventoryMatcher({ cuttingEngine: { calculateCutting } });
const material = {
  id: "MAT-A", thicknessMm: 8, motif: "plain",
  grainRequired: false, rotationPolicy: "free"
};
const base = {
  materialId: "MAT-A", thicknessMm: 8, grainDirection: "none",
  motif: "plain", rotationAllowed: true, condition: "good",
  status: "available", originJobId: "JOB-A",
  createdAt: "2026-01-01T00:00:00.000Z"
};

function test(name, fn) {
  fn();
  console.log("LULUS:", name);
}

test("matcher menemukan sisa yang cukup dan mengembalikan penempatan", () => {
  const matches = matcher.findCandidates({
    material, remainders: [{ ...base, id: "REM-1", widthCm: 100, heightCm: 60 }],
    parts: [{ id: "P1", width: 50, height: 30 }]
  });
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].placedPartIds, ["P1"]);
  assert.equal(matches[0].remainderId, "REM-1");
});

test("material dan ketebalan yang berbeda tidak cocok", () => {
  const remainders = [
    { ...base, id: "WRONG-MAT", materialId: "MAT-B", widthCm: 100, heightCm: 60 },
    { ...base, id: "WRONG-THICK", thicknessMm: 9, widthCm: 100, heightCm: 60 }
  ];
  assert.equal(matcher.findCandidates({
    material, remainders, parts: [{ width: 20, height: 20 }]
  }).length, 0);
});

test("motif, arah serat, status, dan kondisi harus sesuai", () => {
  const remainders = [
    { ...base, id: "MOTIF", motif: "pattern", widthCm: 100, heightCm: 60 },
    { ...base, id: "GRAIN", grainDirection: "vertical", widthCm: 100, heightCm: 60 },
    { ...base, id: "RESERVED", status: "reserved", widthCm: 100, heightCm: 60 },
    { ...base, id: "DAMAGED", condition: "damaged", widthCm: 100, heightCm: 60 }
  ];
  assert.equal(matcher.findCandidates({
    material, grainDirection: "none", remainders,
    parts: [{ width: 20, height: 20 }]
  }).length, 0);
});

test("rotasi mengikuti kebijakan material dan unit sisa", () => {
  const remainder = { ...base, id: "ROT", widthCm: 50, heightCm: 100 };
  const parts = [{ width: 100, height: 50 }];
  assert.equal(matcher.findCandidates({
    material, remainders: [remainder], parts, allowRotation: false
  }).length, 0);
  const rotated = matcher.findCandidates({
    material, remainders: [remainder], parts, allowRotation: true
  });
  assert.equal(rotated.length, 1);
  assert.equal(rotated[0].placements[0].rotated, true);
  assert.equal(rotated[0].allowRotation, true);
});

test("rotasi ditolak jika material berarah atau unit melarang rotasi", () => {
  const remainder = { ...base, id: "ROT2", widthCm: 50, heightCm: 100 };
  const parts = [{ width: 100, height: 50 }];
  assert.equal(matcher.findCandidates({
    material: { ...material, grainRequired: true },
    grainDirection: "none", remainders: [remainder], parts, allowRotation: true
  }).length, 0);
  assert.equal(matcher.findCandidates({
    material, remainders: [{ ...remainder, rotationAllowed: false }],
    parts, allowRotation: true
  }).length, 0);
});

test("kandidat diurutkan berdasarkan jumlah potongan yang muat", () => {
  const remainders = [
    { ...base, id: "SMALL", widthCm: 50, heightCm: 30 },
    { ...base, id: "LARGE", widthCm: 100, heightCm: 60 }
  ];
  const matches = matcher.findCandidates({
    material, remainders,
    parts: [{ id: "P1", width: 50, height: 30 }, { id: "P2", width: 40, height: 20 }]
  });
  assert.equal(matches[0].remainderId, "LARGE");
});

test("kerf diperhitungkan dan ukuran input tidak valid ditolak", () => {
  assert.equal(matcher.findCandidates({
    material, remainders: [{ ...base, id: "KERF", widthCm: 99, heightCm: 50 }],
    parts: [{ width: 49, height: 50 }, { width: 49, height: 50 }], kerf: 2
  }).length, 0);
  assert.throws(() => matcher.findCandidates({
    material, remainders: [{ ...base, id: "BAD", widthCm: 100, heightCm: 60 }],
    parts: [{ width: 0, height: 10 }]
  }), /lebih dari 0/);
});

test("stok yang lebih tua menjadi pemecah seri", () => {
  const matches = matcher.findCandidates({
    material, remainders: [
      { ...base, id: "NEW", createdAt: "2026-02-01T00:00:00.000Z", widthCm: 50, heightCm: 30 },
      { ...base, id: "OLD", createdAt: "2026-01-01T00:00:00.000Z", widthCm: 50, heightCm: 30 }
    ],
    parts: [{ width: 40, height: 20 }]
  });
  assert.equal(matches[0].remainderId, "OLD");
});

console.log("Semua pengujian matcher inventaris selesai.");
