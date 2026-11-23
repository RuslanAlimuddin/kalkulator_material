/* Kalkulator Material — perhitungan estimasi harga material.
 * Murni tanpa DOM agar aturan pembelian dapat diuji terpisah.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialPricingEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function calculatePricing(input) {
    if (!input || typeof input !== "object") throw new Error("Masukan harga tidak valid.");
    const totalSheets = Number(input.totalSheets);
    const areaMaterialM2 = Number(input.areaMaterialM2);
    const areaSurfaceM2 = Number(input.areaSurfaceM2);
    const price = Number(input.price);
    const per = input.per || "sheet";
    if (!Number.isInteger(totalSheets) || totalSheets < 0) throw new Error("Jumlah lembar harus bilangan bulat tidak negatif.");
    if (!Number.isFinite(areaMaterialM2) || areaMaterialM2 <= 0) throw new Error("Luas satu lembar harus lebih dari nol.");
    if (!Number.isFinite(areaSurfaceM2) || areaSurfaceM2 < 0) throw new Error("Luas bidang tidak boleh negatif.");
    if (!Number.isFinite(price) || price < 0) throw new Error("Harga tidak boleh negatif.");
    if (per !== "sheet" && per !== "package") throw new Error("Satuan harga tidak dikenal.");
    if (price === 0 || totalSheets === 0) return null;

    let packageSize = 1;
    if (per === "package") {
      packageSize = Number(input.packageSize);
      if (!Number.isInteger(packageSize) || packageSize < 1) {
        throw new Error("Isi kemasan harus bilangan bulat minimal 1 lembar.");
      }
    }
    const pricePerSheet = per === "package" ? price / packageSize : price;
    const packageCount = per === "package" ? Math.ceil(totalSheets / packageSize) : 0;
    const sheetsPurchased = per === "package" ? packageCount * packageSize : totalSheets;
    const totalPrice = per === "package" ? packageCount * price : totalSheets * pricePerSheet;
    return {
      price, per: per === "package" ? "kemasan" : "satuan",
      packageSize, pricePerSheet, pricePerM2: pricePerSheet / areaMaterialM2,
      packageCount, sheetsPurchased,
      unusedSheets: per === "package" ? sheetsPurchased - totalSheets : 0,
      totalPrice,
      costPerM2Surface: areaSurfaceM2 > 0 ? totalPrice / areaSurfaceM2 : 0
    };
  }

  return { calculatePricing };
});
