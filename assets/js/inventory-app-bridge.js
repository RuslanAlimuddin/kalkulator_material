/* Jembatan parameter formulir kalkulator ke inventory-workflow.
 * Modul ini tidak membaca DOM dan tidak mengubah kalkulasi lama.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryAppBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPS = 0.05;

  function createInventoryAppBridge(options) {
    const opts = options || {};
    const geometryEngine = opts.geometryEngine ||
      (typeof MaterialEngine !== "undefined" ? MaterialEngine : null);
    const workflow = opts.workflow ||
      (typeof MaterialInventoryWorkflowInstance !== "undefined"
        ? MaterialInventoryWorkflowInstance
        : null);
    if (!geometryEngine || typeof geometryEngine.calculateGeometry !== "function") {
      throw new Error("Geometry engine wajib menyediakan calculateGeometry().");
    }
    if (!workflow || typeof workflow.preview !== "function" ||
        typeof workflow.confirmPreview !== "function" ||
        typeof workflow.cancel !== "function" ||
        typeof workflow.complete !== "function") {
      throw new Error("Inventory workflow wajib menyediakan preview, confirmPreview, cancel, dan complete.");
    }

    function positive(value, label) {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) {
        throw new Error(label + " harus lebih dari 0.");
      }
      return number;
    }

    function nonNegative(value, label) {
      const number = value == null || value === "" ? 0 : Number(value);
      if (!Number.isFinite(number) || number < 0) {
        throw new Error(label + " tidak boleh negatif.");
      }
      return number;
    }

    function buildPlannerInput(input) {
      if (!input || !input.material || !input.material.id) {
        throw new Error("Material terdaftar dengan ID wajib dipilih.");
      }
      const wallW = positive(input.wallWidthM, "Lebar bidang") * 100;
      const wallH = positive(input.wallHeightM, "Tinggi bidang") * 100;
      const rawL = positive(input.materialLengthCm, "Panjang material");
      const rawS = positive(input.materialWidthCm, "Lebar material");
      const orientation = String(input.orientation == null ? "0" : input.orientation);
      if (orientation !== "0" && orientation !== "1") {
        throw new Error("Orientasi material harus 0 (portrait) atau 1 (landscape).");
      }
      const matW = orientation === "1" ? rawL : rawS;
      const matH = orientation === "1" ? rawS : rawL;
      const gap = nonNegative(input.gapCm, "Jarak nat");
      const pattern = input.pattern || "stack";
      const direction = input.direction || "horizontal";
      const alignment = input.alignment || "BL";
      const geometry = geometryEngine.calculateGeometry({
        wallW, wallH, matW, matH, gap, pattern, direction, alignment
      });
      const mode = input.mode || "presisi";
      if (!["presisi", "ekonomis"].includes(mode)) {
        throw new Error("Mode kalkulasi tidak dikenal.");
      }
      const minRemainderW = nonNegative(input.minRemainderW, "Lebar minimum sisa");
      const minRemainderH = nonNegative(input.minRemainderH, "Tinggi minimum sisa");
      const autoStripReuse = orientation === "0" &&
        pattern === "stack" &&
        geometry.rows === 1 &&
        matH > wallH + EPS;

      return {
        geometry,
        material: input.material,
        newSheet: { widthCm: matW, heightCm: matH },
        mode,
        autoStripReuse,
        allowRotation: mode === "ekonomis",
        motif: input.motif == null ? input.material.motif : input.motif,
        grainDirection: input.grainDirection || "none",
        kerf: nonNegative(input.kerf, "Kerf"),
        minRemainderW,
        minRemainderH
      };
    }

    async function preview(input) {
      if (!input || typeof input.jobId !== "string" || !input.jobId.trim()) {
        throw new Error("ID pekerjaan wajib diisi untuk pratinjau inventaris.");
      }
      const plannerInput = buildPlannerInput(input);
      return workflow.preview({
        jobId: input.jobId,
        plannerInput,
        timestamp: input.timestamp,
        includeBaseline: input.includeBaseline === true
      });
    }

    async function confirm(previewPlan, optionsForConfirm) {
      return workflow.confirmPreview(previewPlan, optionsForConfirm);
    }

    async function cancel(reservedPlan, optionsForCancel) {
      return workflow.cancel(reservedPlan, optionsForCancel);
    }

    async function complete(reservedPlan, optionsForComplete) {
      return workflow.complete(reservedPlan, optionsForComplete);
    }

    return { buildPlannerInput, preview, confirm, cancel, complete };
  }

  return { createInventoryAppBridge };
});
