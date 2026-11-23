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

    function validatePlanGeometry(plan) {
      // Snapshot lama tetap didukung; snapshot baru wajib menyertakan versi
      // dan seluruh geometri lembar yang lengkap.
      if (plan.geometryVersion == null) return;
      if (plan.geometryVersion !== 1) {
        throw new Error("Versi geometri snapshot rencana tidak didukung.");
      }
      if (!Array.isArray(plan.sheets)) {
        throw new Error("Geometri snapshot rencana tidak valid: daftar lembar bukan array.");
      }
      if (!Array.isArray(plan.usableRemainders)) {
        throw new Error("Geometri snapshot rencana tidak memiliki daftar sisa layak.");
      }
      const epsilon = 0.000001;
      const sheetById = new Map();
      const overlaps = (a, b) =>
        Math.min(a.x + a.width, b.x + b.width) >
          Math.max(a.x, b.x) + epsilon &&
        Math.min(a.y + a.height, b.y + b.height) >
          Math.max(a.y, b.y) + epsilon;

      for (const sheet of plan.sheets) {
        if (!sheet || sheet.id == null || String(sheet.id).trim() === "" ||
            sheetById.has(String(sheet.id)) ||
            !Number.isFinite(sheet.width) || sheet.width <= 0 ||
            !Number.isFinite(sheet.height) || sheet.height <= 0 ||
            !Array.isArray(sheet.placements) || !Array.isArray(sheet.leftovers)) {
          throw new Error("Geometri snapshot rencana memiliki lembar atau batas ukuran yang tidak valid.");
        }
        sheetById.set(String(sheet.id), sheet);
        const rectangles = [];
        for (const [kind, records] of [
          ["placements", sheet.placements], ["leftovers", sheet.leftovers]
        ]) {
          for (const rect of records) {
            if (!rect || ![rect.x, rect.y].every(value =>
                  Number.isFinite(value) && value >= 0) ||
                !Number.isFinite(rect.width) || rect.width <= 0 ||
                !Number.isFinite(rect.height) || rect.height <= 0 ||
                rect.x + rect.width > sheet.width + epsilon ||
                rect.y + rect.height > sheet.height + epsilon) {
              throw new Error("Geometri snapshot rencana memiliki bidang di luar batas lembar atau ukuran tidak valid.");
            }
            if (rectangles.some(previous => overlaps(previous, rect))) {
              throw new Error("Geometri snapshot rencana memiliki bidang potongan atau sisa yang saling bertumpuk.");
            }
            rectangles.push(rect);
          }
        }
      }

      if (Array.isArray(plan.usableRemainders)) {
        if (plan.usableRemainders.length > 0 && plan.sheets.length === 0) {
          throw new Error("Snapshot memiliki sisa layak tetapi tidak memiliki geometri lembar sumber.");
        }
        const claimedLeftovers = new Set();
        for (const remainder of plan.usableRemainders) {
          const sheetKey = remainder && String(remainder.sheetId);
          const sheet = sheetKey == null ? null : sheetById.get(sheetKey);
          const geometryKey = [sheetKey, remainder && remainder.x, remainder && remainder.y,
            remainder && remainder.width, remainder && remainder.height].join("|");
          if (claimedLeftovers.has(geometryKey)) {
            throw new Error("Satu bidang leftovers tidak boleh dicatat sebagai sisa layak lebih dari sekali.");
          }
          claimedLeftovers.add(geometryKey);
          if (!sheet || !Array.isArray(sheet.leftovers) ||
              sheet.leftovers.filter(rect =>
                rect.x === remainder.x && rect.y === remainder.y &&
                rect.width === remainder.width && rect.height === remainder.height
              ).length !== 1) {
            throw new Error("Geometri sisa layak tidak cocok dengan bidang leftovers pada lembar asal.");
          }
        }
      }
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
      validatePlanGeometry(input.plan);
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
      validatePlanGeometry(plan);
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
      if (typeof storage.getPlanRecoveryState !== "function") {
        throw new Error("Storage belum mendukung pemeriksaan pemulihan yang konsisten.");
      }
      const state = await storage.getPlanRecoveryState(planId);
      const saved = state.plan;
      if (!saved || saved.status !== "reserved" || !saved.plan) {
        throw new Error("Snapshot rencana aktif tidak ditemukan atau merupakan reservasi lama tanpa snapshot.");
      }
      validatePlanGeometry(saved.plan);
      if (!Array.isArray(saved.plan.inventoryUsage) || !Array.isArray(saved.reservationIds)) {
        throw new Error("Snapshot tidak memiliki daftar sumber dan reservasi yang valid.");
      }
      const usageIds = saved.plan.inventoryUsage.map(item => item && item.remainderId);
      if (usageIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(usageIds).size !== usageIds.length) {
        throw new Error("Snapshot memiliki ID sumber kosong atau duplikat.");
      }
      const active = state.reservations.filter(item => item.status === "active");
      const expectedIds = saved.reservationIds.slice().sort();
      const activeIds = active.map(item => item.id).sort();
      if (expectedIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(expectedIds).size !== expectedIds.length ||
          active.length !== saved.plan.inventoryUsage.length ||
          JSON.stringify(expectedIds) !== JSON.stringify(activeIds)) {
        throw new Error("Snapshot tidak cocok dengan seluruh reservasi aktif; pemulihan/penyelesaian diblokir demi keamanan stok.");
      }
      const reservationByRemainder = new Map();
      for (const reservation of active) {
        if (reservation.planId !== planId || reservation.jobId !== saved.jobId ||
            typeof reservation.remainderId !== "string" ||
            reservationByRemainder.has(reservation.remainderId)) {
          throw new Error("Hubungan reservasi, pekerjaan, atau sumber tidak cocok dengan snapshot.");
        }
        reservationByRemainder.set(reservation.remainderId, reservation);
      }
      const remainderById = new Map(state.remainders.map(item => [item.id, item]));
      const inventoryUsage = saved.plan.inventoryUsage.map(item => {
        const reservation = reservationByRemainder.get(item.remainderId);
        const source = remainderById.get(item.remainderId);
        if (!reservation || !source || source.status !== "reserved" || source.condition !== "good" ||
            (saved.material && saved.material.id && source.materialId !== saved.material.id)) {
          throw new Error("Sumber inventaris hilang atau status/identitasnya tidak sesuai; pemulihan diblokir demi keamanan stok.");
        }
        return { ...item, reservationId: reservation.id };
      });
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
