/* Pengendali alur inventaris: hitung -> reservasi -> batal/selesaikan.
 * Modul ini mengatur urutan proses; geometri tetap menjadi tugas planner/adapter.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryWorkflow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createInventoryWorkflow(options) {
    const opts = options || {};
    const storage = opts.storage;
    const planner = opts.planner;
    const engine = opts.inventoryEngine;
    if (!storage || typeof storage.getByIndex !== "function") {
      throw new Error("Storage inventaris wajib menyediakan getByIndex().");
    }
    if (!planner || typeof planner.calculate !== "function") {
      throw new Error("Inventory planner wajib disediakan.");
    }
    if (!engine || typeof engine.reservePlan !== "function" ||
        typeof engine.cancelPlan !== "function" ||
        typeof engine.consumePlan !== "function") {
      throw new Error("Inventory engine wajib menyediakan reservePlan, cancelPlan, dan consumePlan.");
    }

    async function readAvailableRemainders() {
      const records = await storage.getByIndex("remainders", "status", "available");
      return records.filter(item => item && item.condition === "good");
    }

    async function calculateAndReserve(input) {
      if (!input || typeof input.jobId !== "string" || !input.jobId.trim()) {
        throw new Error("ID pekerjaan wajib diisi sebelum menghitung dan memesan stok.");
      }
      if (!input.plannerInput || typeof input.plannerInput !== "object") {
        throw new Error("plannerInput wajib disediakan.");
      }
      const maxAttempts = input.maxReservationAttempts == null
        ? 2
        : Number(input.maxReservationAttempts);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
        throw new Error("Jumlah percobaan reservasi harus berupa bilangan bulat 1 sampai 5.");
      }

      let lastError;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const remainders = await readAvailableRemainders();
        const plan = planner.calculate({
          ...input.plannerInput,
          remainders
        });
        try {
          const reservedPlan = await engine.reservePlan({
            plan,
            jobId: input.jobId,
            timestamp: input.timestamp
          });
          return {
            ...reservedPlan,
            attemptCount: attempt,
            inventorySnapshotCount: remainders.length
          };
        } catch (error) {
          lastError = error;
          if (attempt === maxAttempts) break;
          // Stok mungkin berubah setelah dibaca. Ulangi dari snapshot terbaru,
          // jangan memakai ulang hasil perencanaan yang gagal direservasi.
        }
      }
      throw lastError || new Error("Reservasi rencana inventaris gagal.");
    }

    async function cancel(reservedPlan, optionsForCancel) {
      return engine.cancelPlan({
        reservedPlan,
        timestamp: optionsForCancel && optionsForCancel.timestamp
      });
    }

    async function complete(reservedPlan, optionsForComplete) {
      return engine.consumePlan({
        reservedPlan,
        sourceSheetId: optionsForComplete && optionsForComplete.sourceSheetId,
        sourceSheetIdPrefix: optionsForComplete && optionsForComplete.sourceSheetIdPrefix,
        timestamp: optionsForComplete && optionsForComplete.timestamp
      });
    }

    return {
      readAvailableRemainders,
      calculateAndReserve,
      cancel,
      complete
    };
  }

  return { createInventoryWorkflow };
});
