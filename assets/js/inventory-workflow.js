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

    async function preview(input) {
      if (!input || typeof input.jobId !== "string" || !input.jobId.trim()) {
        throw new Error("ID pekerjaan wajib diisi untuk membuat pratinjau.");
      }
      if (!input.plannerInput || typeof input.plannerInput !== "object") {
        throw new Error("plannerInput wajib disediakan.");
      }
      const remainders = await readAvailableRemainders();
      const plan = planner.calculate({
        ...input.plannerInput,
        remainders
      });
      return {
        plan,
        jobId: input.jobId,
        material: input.plannerInput.material || null,
        grainDirection: input.plannerInput.grainDirection || null,
        motif: input.plannerInput.motif || null,
        inventorySnapshotCount: remainders.length,
        previewCreatedAt: input.timestamp || new Date().toISOString()
      };
    }

    async function confirmPreview(previewPlan, optionsForConfirm) {
      if (!previewPlan || !previewPlan.plan ||
          typeof previewPlan.jobId !== "string" || !previewPlan.jobId.trim()) {
        throw new Error("Pratinjau rencana yang valid wajib disediakan.");
      }
      const options = optionsForConfirm || {};
      // Konfirmasi mengunci sumber yang benar-benar ditampilkan pada pratinjau.
      // Jika stok telah berubah, reservasi gagal; UI harus membuat pratinjau baru.
      const reservedPlan = await engine.reservePlan({
        plan: previewPlan.plan,
        jobId: previewPlan.jobId,
        material: previewPlan.material,
        grainDirection: previewPlan.grainDirection,
        motif: previewPlan.motif,
        previewCreatedAt: previewPlan.previewCreatedAt,
        timestamp: options.timestamp
      });
      return {
        ...reservedPlan,
        inventorySnapshotCount: previewPlan.inventorySnapshotCount,
        previewCreatedAt: previewPlan.previewCreatedAt
      };
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
            material: input.plannerInput.material,
            grainDirection: input.plannerInput.grainDirection,
            motif: input.plannerInput.motif,
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

    async function getRecoveryPlans() {
      if (typeof storage.getRecoveryPlans !== "function") {
        throw new Error("Storage belum menyediakan daftar pemulihan rencana.");
      }
      return storage.getRecoveryPlans();
    }

    async function getRecoveryReport() {
      if (typeof storage.getRecoveryReport !== "function") {
        throw new Error("Storage belum menyediakan audit pemulihan stok.");
      }
      return storage.getRecoveryReport();
    }

    async function restorePlan(planId) {
      if (typeof engine.restorePlan !== "function") {
        throw new Error("Inventory engine belum menyediakan pemulihan snapshot.");
      }
      return engine.restorePlan(planId);
    }

    async function cancelLegacyRecovery(planId, optionsForCancel) {
      const plan = await storage.get("plans", planId);
      if (!plan || plan.status !== "legacy_recovery" || !Array.isArray(plan.reservationIds)) {
        throw new Error("Catatan reservasi lama tidak ditemukan atau sudah diproses.");
      }
      if (typeof storage.releaseReservations !== "function") {
        throw new Error("Storage belum mendukung pelepasan reservasi lama.");
      }
      return storage.releaseReservations({
        reservationIds: plan.reservationIds,
        planId,
        timestamp: optionsForCancel && optionsForCancel.timestamp
      });
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
      getRecoveryPlans,
      getRecoveryReport,
      restorePlan,
      cancelLegacyRecovery,
      preview,
      confirmPreview,
      calculateAndReserve,
      cancel,
      complete
    };
  }

  return { createInventoryWorkflow };
});
