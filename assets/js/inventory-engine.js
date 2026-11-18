/* Kalkulator Material — alur bisnis pemakaian stok dan pembentukan sisa turunan.
 * Tidak mengubah geometri; hasil ukuran berasal dari cutting-engine/cutting-adapter.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createInventoryEngine(options) {
    const opts = options || {};
    const storage = opts.storage;
    if (!storage || typeof storage.consumeReservation !== "function") {
      throw new Error("Storage inventaris dengan consumeReservation wajib disediakan.");
    }

    async function consumeReservation(input) {
      if (!input || typeof input.reservationId !== "string" || !input.reservationId.trim()) {
        throw new Error("ID reservasi wajib diisi.");
      }
      if (!Array.isArray(input.remainders)) {
        throw new Error("Daftar sisa turunan harus berupa array.");
      }
      const remainders = input.remainders.map((item, index) => {
        const widthCm = Number(item && item.widthCm);
        const heightCm = Number(item && item.heightCm);
        if (!Number.isFinite(widthCm) || widthCm <= 0 ||
            !Number.isFinite(heightCm) || heightCm <= 0) {
          throw new Error("Ukuran sisa turunan ke-" + (index + 1) + " tidak valid.");
        }
        return { id: item.id, widthCm, heightCm };
      });
      return storage.consumeReservation({
        reservationId: input.reservationId,
        sourceSheetId: input.sourceSheetId,
        timestamp: input.timestamp,
        remainders
      });
    }

    async function consumeCuttingResult(input) {
      if (!input || !input.cuttingResult ||
          !Array.isArray(input.cuttingResult.usableRemainders)) {
        throw new Error("Hasil pemotongan tidak memiliki daftar usableRemainders.");
      }
      return consumeReservation({
        reservationId: input.reservationId,
        sourceSheetId: input.sourceSheetId,
        timestamp: input.timestamp,
        remainders: input.cuttingResult.usableRemainders.map(item => ({
          widthCm: item.width,
          heightCm: item.height
        }))
      });
    }

    return { consumeReservation, consumeCuttingResult };
  }

  return { createInventoryEngine };
});
