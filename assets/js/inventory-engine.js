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

    async function reservePlan(input) {
      if (!input || !input.plan || !Array.isArray(input.plan.inventoryUsage)) {
        throw new Error("Rencana pemotongan dengan inventoryUsage wajib disediakan.");
      }
      if (typeof input.jobId !== "string" || !input.jobId.trim()) {
        throw new Error("ID pekerjaan wajib diisi untuk reservasi rencana.");
      }
      const remainderIds = input.plan.inventoryUsage.map(item => item && item.remainderId);
      if (remainderIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(remainderIds).size !== remainderIds.length) {
        throw new Error("Rencana berisi ID sisa inventaris yang kosong atau duplikat.");
      }
      if (remainderIds.length === 0) {
        return { plan: input.plan, reservations: [], inventoryUsage: [] };
      }
      if (typeof storage.reserveRemainders !== "function") {
        throw new Error("Storage belum mendukung reservasi inventaris massal.");
      }

      // Satu rencana dapat memakai beberapa lembar sisa. Semuanya harus
      // berhasil dikunci bersama atau tidak ada satu pun yang terkunci.
      const reservations = await storage.reserveRemainders({
        remainderIds,
        jobId: input.jobId,
        timestamp: input.timestamp
      });
      const reservationByRemainder = new Map(
        reservations.map(item => [item.remainderId, item.id])
      );
      return {
        plan: input.plan,
        reservations,
        inventoryUsage: input.plan.inventoryUsage.map(item => ({
          ...item,
          reservationId: reservationByRemainder.get(item.remainderId)
        }))
      };
    }

    async function cancelPlan(input) {
      if (!input || !input.reservedPlan ||
          !Array.isArray(input.reservedPlan.reservations)) {
        throw new Error("Hasil reservePlan wajib disediakan untuk pembatalan.");
      }
      const reservations = input.reservedPlan.reservations;
      if (reservations.length === 0) {
        return { releasedReservations: [] };
      }
      if (typeof storage.releaseReservations !== "function") {
        throw new Error("Storage belum mendukung pelepasan multi-reservasi atomik.");
      }
      const reservationIds = reservations.map(item => item && item.id);
      if (reservationIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(reservationIds).size !== reservationIds.length) {
        throw new Error("Rencana berisi ID reservasi kosong atau duplikat.");
      }
      const releasedReservations = await storage.releaseReservations({
        reservationIds,
        timestamp: input.timestamp
      });
      return { releasedReservations };
    }

    async function consumePlan(input) {
      if (!input || !input.reservedPlan || !input.reservedPlan.plan ||
          !Array.isArray(input.reservedPlan.inventoryUsage)) {
        throw new Error("Hasil reservePlan wajib disediakan untuk konsumsi rencana.");
      }
      const plan = input.reservedPlan.plan;
      const usage = input.reservedPlan.inventoryUsage;
      if (usage.length === 0) {
        return { consumedReservations: [], createdRemainders: [] };
      }
      if (typeof storage.consumeReservations !== "function") {
        throw new Error("Storage belum mendukung konsumsi multi-reservasi atomik.");
      }
      if (!Array.isArray(plan.usableRemainders)) {
        throw new Error("Rencana tidak memiliki daftar usableRemainders.");
      }

      const reservations = usage.map((item, index) => {
        if (!item || typeof item.remainderId !== "string" ||
            !item.remainderId.trim() || typeof item.reservationId !== "string" ||
            !item.reservationId.trim()) {
          throw new Error("Sumber inventaris ke-" + (index + 1) +
            " belum memiliki ID reservasi yang valid.");
        }
        const leftovers = plan.usableRemainders
          .filter(remainder => remainder.sourceRemainderId === item.remainderId)
          .map(remainder => ({
            widthCm: Number(remainder.width),
            heightCm: Number(remainder.height)
          }));
        const sourceSheetId = input.sourceSheetIdPrefix
          ? input.sourceSheetIdPrefix + "-" + (index + 1)
          : input.sourceSheetId;
        return {
          reservationId: item.reservationId,
          sourceSheetId,
          remainders: leftovers
        };
      });

      return storage.consumeReservations({
        reservations,
        timestamp: input.timestamp
      });
    }

    async function consumeCuttingResult(input) {
      if (!input || !input.cuttingResult ||
          !Array.isArray(input.cuttingResult.usableRemainders)) {
        throw new Error("Hasil pemotongan tidak memiliki daftar usableRemainders.");
      }
      // Satu reservasi mewakili satu lembar fisik. Cutting engine dapat
      // membuat beberapa lembar virtual saat semua potongan tidak muat;
      // hanya sisa pada lembar pertama (sumber yang benar-benar direservasi)
      // yang boleh diturunkan dari stok inventaris ini.
      const firstSourceSheetId = input.cuttingResult.sheets &&
        input.cuttingResult.sheets.length
        ? input.cuttingResult.sheets[0].id
        : null;
      const usable = input.cuttingResult.usableRemainders.filter(item =>
        firstSourceSheetId == null || item.sheetId === firstSourceSheetId
      );
      return consumeReservation({
        reservationId: input.reservationId,
        sourceSheetId: input.sourceSheetId,
        timestamp: input.timestamp,
        remainders: usable.map(item => ({
          widthCm: item.width,
          heightCm: item.height
        }))
      });
    }

    return { reservePlan, cancelPlan, consumePlan, consumeReservation, consumeCuttingResult };
  }

  return { createInventoryEngine };
});
