const assert = require("node:assert/strict");
const { calculatePricing } = require("../assets/js/pricing-engine.js");

function test(name, fn) {
  fn();
  console.log("LULUS:", name);
}

test("harga per lembar dihitung berdasarkan jumlah lembar", () => {
  const r = calculatePricing({
    totalSheets: 5, areaMaterialM2: 2, areaSurfaceM2: 8,
    price: 100000, per: "sheet"
  });
  assert.equal(r.totalPrice, 500000);
  assert.equal(r.pricePerM2, 50000);
  assert.equal(r.costPerM2Surface, 62500);
  assert.equal(r.sheetsPurchased, 5);
});

test("pembelian kemasan dibulatkan ke kemasan utuh dan menghitung sisa lembar", () => {
  const r = calculatePricing({
    totalSheets: 7, areaMaterialM2: 2, areaSurfaceM2: 10,
    price: 240000, per: "package", packageSize: 4
  });
  assert.equal(r.packageCount, 2);
  assert.equal(r.sheetsPurchased, 8);
  assert.equal(r.unusedSheets, 1);
  assert.equal(r.pricePerSheet, 60000);
  assert.equal(r.totalPrice, 480000);
  assert.equal(r.costPerM2Surface, 48000);
});

test("kemasan tepat tanpa sisa lembar", () => {
  const r = calculatePricing({
    totalSheets: 8, areaMaterialM2: 1, areaSurfaceM2: 4,
    price: 100000, per: "package", packageSize: 4
  });
  assert.equal(r.packageCount, 2);
  assert.equal(r.unusedSheets, 0);
});

test("harga kosong atau kebutuhan nol tidak menampilkan estimasi", () => {
  assert.equal(calculatePricing({ totalSheets: 5, areaMaterialM2: 1, areaSurfaceM2: 2, price: 0 }), null);
  assert.equal(calculatePricing({ totalSheets: 0, areaMaterialM2: 1, areaSurfaceM2: 2, price: 100 }), null);
});

test("isi kemasan kosong, nol, negatif, dan pecahan ditolak", () => {
  for (const packageSize of [NaN, 0, -1, 1.5]) {
    assert.throws(() => calculatePricing({
      totalSheets: 3, areaMaterialM2: 1, areaSurfaceM2: 2,
      price: 100000, per: "package", packageSize
    }), /Isi kemasan harus bilangan bulat/);
  }
});

test("jumlah lembar pecahan dan harga negatif ditolak", () => {
  assert.throws(() => calculatePricing({
    totalSheets: 2.5, areaMaterialM2: 1, areaSurfaceM2: 2, price: 100
  }), /Jumlah lembar harus bilangan bulat/);
  assert.throws(() => calculatePricing({
    totalSheets: 2, areaMaterialM2: 1, areaSurfaceM2: 2, price: -1
  }), /Harga tidak boleh negatif/);
});

console.log("Semua pengujian mesin harga selesai.");
