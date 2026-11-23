/* Adapter geometri pemasangan -> mesin pemotongan lembar sumber.
 * Satuan ukuran: cm. Modul ini tidak bergantung pada DOM.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialCuttingAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function calculateMaterialSources(input) {
    if (!input || !input.geometry || !Array.isArray(input.geometry.cells)) {
      throw new Error("Data geometri pemasangan tidak valid.");
    }
    const cutter = input.cuttingEngine ||
      (typeof MaterialCuttingEngine !== "undefined" ? MaterialCuttingEngine : null);
    if (!cutter || typeof cutter.calculateCutting !== "function") {
      throw new Error("Mesin pemotongan belum tersedia.");
    }

    const geometry = input.geometry;
    if (!["presisi", "ekonomis"].includes(input.mode)) {
      throw new Error("Mode pemotongan harus presisi atau ekonomis.");
    }
    const sheetW = Number(input.sheetW);
    const sheetH = Number(input.sheetH);
    if (!Number.isFinite(sheetW) || sheetW <= 0 ||
        !Number.isFinite(sheetH) || sheetH <= 0) {
      throw new Error("Ukuran lembar sumber harus lebih dari 0.");
    }
    const kerf = input.kerf == null ? 0 : Number(input.kerf);
    if (!Number.isFinite(kerf) || kerf < 0) {
      throw new Error("Kerf tidak boleh negatif.");
    }

    const minRemainderW = input.minRemainderW == null ? 0 : Number(input.minRemainderW);
    const minRemainderH = input.minRemainderH == null ? 0 : Number(input.minRemainderH);
    if (!Number.isFinite(minRemainderW) || minRemainderW < 0 ||
        !Number.isFinite(minRemainderH) || minRemainderH < 0) {
      throw new Error("Ukuran minimum sisa tidak boleh negatif.");
    }

    if (geometry.cells.length === 0) {
      return {
        cells: [], sheetCount: 0, reuseCount: 0, sheets: [],
        reusableRemainders: [], usableRemainders: [], tooSmallRemainders: [],
        usableRemainderArea: 0, tooSmallRemainderArea: 0, unclassifiedArea: 0,
        totalPartArea: 0, totalSheetArea: 0
      };
    }

    const canReuse = input.mode === "ekonomis" || input.autoStripReuse === true;
    const allowRotation = input.mode === "ekonomis" && input.allowRotation === true;
    const sourceCells = geometry.cells.map((cell, index) => ({
      ...cell,
      id: "cell-" + index
    }));

    const placementsById = new Map();
    const sheets = [];
    let reusableRemainders = [];
    let usableRemainders = [];
    let tooSmallRemainders = [];
    let usableRemainderArea = 0;
    let tooSmallRemainderArea = 0;
    let unclassifiedArea = 0;
    let totalPartArea = 0;
    let totalSheetArea = 0;

    if (!canReuse) {
      // Mode presisi: satu grid memakai satu lembar sendiri, sama seperti perilaku lama.
      sourceCells.forEach(cell => {
        const result = cutter.calculateCutting({
          sheetW, sheetH, kerf, minRemainderW, minRemainderH,
          allowRotation: false,
          parts: [{
            id: cell.id,
            width: cell.width,
            height: cell.height,
            quantity: 1
          }]
        });
        const sourceSheet = result.sheets[0];
        const placement = sourceSheet.placements[0];
        placementsById.set(cell.id, {
          sheetId: sheets.length + 1,
          rotated: placement.rotated
        });
        sheets.push({
          id: sheets.length + 1,
          width: sheetW,
          height: sheetH,
          placements: [placement],
          leftovers: sourceSheet.leftovers
        });
        reusableRemainders.push(...result.reusableRemainders.map(r => ({
          ...r, sheetId: sheets.length
        })));
        usableRemainders.push(...result.usableRemainders.map(r => ({
          ...r, sheetId: sheets.length
        })));
        tooSmallRemainders.push(...result.tooSmallRemainders.map(r => ({
          ...r, sheetId: sheets.length
        })));
        usableRemainderArea += result.usableRemainderArea;
        tooSmallRemainderArea += result.tooSmallRemainderArea;
        unclassifiedArea += result.unclassifiedArea;
        totalPartArea += result.totalPartArea;
        totalSheetArea += result.totalSheetArea;
      });
    } else {
      const result = cutter.calculateCutting({
        sheetW, sheetH, kerf, minRemainderW, minRemainderH, allowRotation,
        parts: sourceCells.map(cell => ({
          id: cell.id,
          width: cell.width,
          height: cell.height,
          quantity: 1
        }))
      });

      result.sheets.forEach(sheet => {
        sheet.placements.forEach((placement, index) => {
          placementsById.set(placement.sourceId, {
            sheetId: sheet.id,
            rotated: placement.rotated,
            // Potongan pertama berasal dari lembar baru; sisanya memanfaatkan
            // bagian lain dari lembar sumber yang sama.
            source: index === 0 ? "new" : "reuse"
          });
        });
      });
      sheets.push(...result.sheets);
      reusableRemainders = result.reusableRemainders;
      usableRemainders = result.usableRemainders;
      tooSmallRemainders = result.tooSmallRemainders;
      usableRemainderArea = result.usableRemainderArea;
      tooSmallRemainderArea = result.tooSmallRemainderArea;
      unclassifiedArea = result.unclassifiedArea;
      totalPartArea = result.totalPartArea;
      totalSheetArea = result.totalSheetArea;
    }

    const cells = sourceCells.map(cell => {
      const placement = placementsById.get(cell.id);
      if (!placement) throw new Error("Hasil pemotongan tidak memuat " + cell.id + ".");
      return {
        xStart: cell.xStart,
        yStart: cell.yStart,
        width: cell.width,
        height: cell.height,
        nCuts: (cell.cutLeft > 0.000001 ? 1 : 0) +
          (cell.cutRight > 0.000001 ? 1 : 0) +
          (cell.cutTop > 0.000001 ? 1 : 0) +
          (cell.cutBottom > 0.000001 ? 1 : 0),
        source: placement.source || "new",
        sheetId: placement.sheetId,
        rotated: placement.rotated
      };
    });

    return {
      cells,
      sheetCount: sheets.length,
      reuseCount: cells.filter(cell => cell.source === "reuse").length,
      sheets,
      reusableRemainders,
      usableRemainders,
      tooSmallRemainders,
      usableRemainderArea,
      tooSmallRemainderArea,
      minRemainderW,
      minRemainderH,
      unclassifiedArea,
      totalPartArea,
      totalSheetArea,
      kerf,
      allowRotation,
      algorithm: "guillotine-best-fit",
      optimality: "heuristic"
    };
  }

  return { calculateMaterialSources };
});
