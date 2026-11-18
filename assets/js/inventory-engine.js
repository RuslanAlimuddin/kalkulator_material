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
      if (remainderIds.some(id => typeof id !== "string" || !id.trim()) || new Set(remainderIds).size !== remainderIds.length) {
        throw new Error("Rencana berisi ID sisa inventaris yang kosong atau duplikat.");
      }
      const planId = input.planId || ("PLAN-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));
      if (typeof storage.reserveRemainders !== "function") {
        throw new Error("Storage belum mendukung penyimpanan snapshot dan reservasi rencana.");
      }
      const snapshot = {
        plan: input.plan, material: input.material || null,
        grainDirection: input.grainDirection || null, motif: input.motif || null,
        previewCreatedAt: input.previewCreatedAt || null
      };
      const reservations = await storage.reserveRemainders({
        remainderIds, jobId: input.jobId, timestamp: input.timestamp,
        planId, planSnapshot: snapshot
      });
      const reservationByRemainder = new Map(reservations.map(item => [item.remainderId, item.id]));
      return {
        planId, plan: input.plan, jobId: input.jobId,
        material: input.material || null,
        grainDirection: input.grainDirection || null, motif: input.motif || null,
        reservations,
        inventoryUsage: input.plan.inventoryUsage.map(item => ({
          ...item, reservationId: reservationByRemainder.get(item.remainderId)
        }))
      };
    }
    async function cancelPlan(input) {
      if (!input || !input.reservedPlan ||
          !Array.isArray(input.reservedPlan.reservations)) {
        throw new Error("Hasil reservePlan wajib disediakan untuk pembatalan.");
      }
      const reservedPlan = input.reservedPlan.planId
        ? await restorePlan(input.reservedPlan.planId)
        : input.reservedPlan;
      const reservations = reservedPlan.reservations;
      if (reservations.length === 0) {
        if (reservedPlan.planId && typeof storage.updatePlanStatus === "function") {
          await storage.updatePlanStatus({
            planId: reservedPlan.planId, status: "cancelled",
            timestamp: input.timestamp
          });
        }
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
        planId: reservedPlan.planId,
        timestamp: input.timestamp
      });
      return { releasedReservations };
    }

    async function consumePlan(input) {
      if (!input || !input.reservedPlan || !input.reservedPlan.plan ||
          !Array.isArray(input.reservedPlan.inventoryUsage)) {
        throw new Error("Hasil reservePlan wajib disediakan untuk konsumsi rencana.");
      }
      const reservedPlan = input.reservedPlan.planId
        ? await restorePlan(input.reservedPlan.planId)
        : input.reservedPlan;
      if (input.reservedPlan.planId) {
        const supplied = (input.reservedPlan.inventoryUsage || []).map(item =>
          [item.remainderId, item.reservationId]
        );
        const persisted = (reservedPlan.inventoryUsage || []).map(item =>
          [item.remainderId, item.reservationId]
        );
        if (JSON.stringify(supplied) !== JSON.stringify(persisted)) {
          throw new Error("Data reservasi pada pemanggil berbeda dari snapshot tersimpan; penyelesaian diblokir.");
        }
      }
      const plan = reservedPlan.plan;
      const usage = reservedPlan.inventoryUsage;
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

      const material = reservedPlan.material;
      const jobId = reservedPlan.jobId;
      const newSheetRemainders = plan.usableRemainders
        .filter(item => item.source === "new")
        .map(item => {
          if (!material || !material.id || !jobId) {
            throw new Error("Metadata material dan pekerjaan wajib tersedia untuk menyimpan sisa lembar baru.");
          }
          const sheet = plan.sheets.find(candidate =>
            String(candidate.id) === String(item.sheetId) && candidate.source === "new"
          );
          if (!sheet) throw new Error("Lembar baru asal sisa tidak ditemukan dalam rencana.");
          const rotationPolicy = material.rotationPolicy || "fixed";
          return {
            materialId: material.id,
            originJobId: jobId,
            sourceSheetId: input.sourceSheetIdPrefix
              ? input.sourceSheetIdPrefix + "-NEW-" + sheet.id
              : (input.sourceSheetId || ("JOB-" + jobId + "-NEW-" + sheet.id)),
            widthCm: Number(item.width),
            heightCm: Number(item.height),
            thicknessMm: Number(material.thicknessMm),
            grainDirection: input.grainDirection || reservedPlan.grainDirection || "none",
            motif: input.motif || reservedPlan.motif || material.motif || "plain",
            rotationAllowed: rotationPolicy !== "fixed"
          };
        });
      return storage.consumeReservations({
        reservations,
        newSheetRemainders,
        jobId,
        planId: reservedPlan.planId,
        timestamp: input.timestamp
      });
    }

    async function restorePlan(planId) {
      if (typeof planId !== "string" || !planId.trim()) {
        throw new Error("ID snapshot rencana wajib diisi.");
      }
      const saved = await storage.get("plans", planId);
      if (!saved || saved.status !== "reserved" || !saved.plan) {
        throw new Error("Snapshot rencana aktif tidak ditemukan atau merupakan reservasi lama tanpa snapshot.");
      }
      const reservations = await storage.getByIndex("reservations", "planId", planId);
      const active = reservations.filter(item => item.status === "active");
      const reservationByRemainder = new Map(active.map(item => [item.remainderId, item.id]));
      const inventoryUsage = (saved.plan.inventoryUsage || []).map(item => ({
        ...item, reservationId: reservationByRemainder.get(item.remainderId)
      }));
      if (inventoryUsage.some(item => !item.reservationId)) {
        throw new Error("Snapshot tidak cocok dengan reservasi aktif; penyelesaian diblokir demi keamanan stok.");
      }
      return {
        planId: saved.id, plan: saved.plan, jobId: saved.jobId,
        material: saved.material || null,
        grainDirection: saved.grainDirection || null,
        motif: saved.motif || null,
        reservations: active,
        inventoryUsage
      };
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

    return { reservePlan, restorePlan, cancelPlan, consumePlan, consumeReservation, consumeCuttingResult };
  }

  return { createInventoryEngine };
});
