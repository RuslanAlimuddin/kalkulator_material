/* Perencana sumber material: inventaris dipakai berurutan, kekurangan dipenuhi lembar baru.
 * Modul ini hanya menghitung rencana. Tidak melakukan reservasi atau mengubah stok.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createInventoryPlanner(options) {
    const opts = options || {};
    const matcher = opts.matcher ||
      (typeof MaterialInventoryMatcher !== "undefined" ? MaterialInventoryMatcher : null);
    const adapter = opts.cuttingAdapter ||
      (typeof MaterialCuttingAdapter !== "undefined" ? MaterialCuttingAdapter : null);
    const defaultCutter = opts.cuttingEngine ||
      (typeof MaterialCuttingEngine !== "undefined" ? MaterialCuttingEngine : null);
    if (!matcher || typeof matcher.findCandidates !== "function") {
      throw new Error("Matcher inventaris wajib disediakan.");
    }
    if (!adapter || typeof adapter.calculateMaterialSources !== "function") {
      throw new Error("Adapter pemotongan wajib disediakan.");
    }

    function calculate(input) {
      if (!input || !input.geometry || !Array.isArray(input.geometry.cells)) {
        throw new Error("Geometri pekerjaan tidak valid.");
      }
      if (!input.material) throw new Error("Spesifikasi material wajib disediakan.");
      if (!Array.isArray(input.remainders)) throw new Error("Daftar inventaris harus berupa array.");
      const newSheetW = Number(input.newSheet && input.newSheet.widthCm);
      const newSheetH = Number(input.newSheet && input.newSheet.heightCm);
      if (!Number.isFinite(newSheetW) || newSheetW <= 0 ||
          !Number.isFinite(newSheetH) || newSheetH <= 0) {
        throw new Error("Ukuran lembar material baru harus lebih dari 0.");
      }
      const remainderIds = input.remainders.map(item => item && item.id);
      if (remainderIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(remainderIds).size !== remainderIds.length) {
        throw new Error("Setiap unit inventaris harus memiliki ID unik.");
      }

      const originalCells = input.geometry.cells;
      if (originalCells.length === 0) {
        return {
          cells: [], sheets: [], sheetCount: 0, inventorySheetCount: 0,
          newSheetCount: 0, reuseCount: 0, inventoryUsage: [],
          usableRemainders: [], tooSmallRemainders: []
        };
      }

      const idPrefix = input.partIdPrefix || "INV-PART-";
      const remaining = originalCells.map((cell, index) => ({
        id: idPrefix + index,
        index,
        cell,
        width: Number(cell.width),
        height: Number(cell.height)
      }));
      remaining.forEach((part, index) => {
        if (!Number.isFinite(part.width) || part.width <= 0 ||
            !Number.isFinite(part.height) || part.height <= 0) {
          throw new Error("Ukuran geometri potongan ke-" + (index + 1) + " tidak valid.");
        }
      });

      const inventoryCells = new Map();
      const availableRemainders = input.remainders.slice();
      const inventorySheets = [];
      const inventoryUsage = [];
      const inventoryUsable = [];
      const inventoryTooSmall = [];
      let guard = 0;

      while (remaining.length && guard < originalCells.length) {
        guard += 1;
        const candidates = matcher.findCandidates({
          material: input.material,
          remainders: availableRemainders,
          parts: remaining.map(part => ({
            id: part.id, width: part.width, height: part.height
          })),
          motif: input.motif,
          grainDirection: input.grainDirection,
          allowRotation: input.allowRotation === true,
          kerf: input.kerf,
          minRemainderW: input.minRemainderW,
          minRemainderH: input.minRemainderH
        });
        if (!candidates.length) break;

        const chosen = candidates[0];
        const placed = new Set(chosen.placedPartIds);
        if (!placed.size) break;

        const sheetId = "INVENTORY-" + inventorySheets.length + "-" + chosen.remainderId;
        const selectedIndex = availableRemainders.findIndex(item => item && item.id === chosen.remainderId);
        if (selectedIndex < 0) throw new Error("Unit inventaris terpilih sudah digunakan.");
        availableRemainders.splice(selectedIndex, 1);
        const placements = chosen.placements.map(placement => {
          const part = remaining.find(item => item.id === placement.sourceId);
          if (!part) throw new Error("Penempatan inventaris merujuk potongan yang tidak dikenal.");
          inventoryCells.set(part.index, {
            source: "inventory",
            sourceType: "inventory",
            sheetSource: "inventory",
            sheetId,
            sourceRemainderId: chosen.remainderId,
            rotated: placement.rotated,
            cutX: placement.x,
            cutY: placement.y,
            cutWidth: placement.width,
            cutHeight: placement.height
          });
          return { ...placement };
        });
        const allLeftovers = chosen.usableLeftovers.concat(chosen.tooSmallLeftovers);
        inventorySheets.push({
          id: sheetId,
          source: "inventory",
          remainderId: chosen.remainderId,
          width: chosen.widthCm,
          height: chosen.heightCm,
          placements,
          leftovers: allLeftovers
        });
        inventoryUsage.push({
          remainderId: chosen.remainderId,
          placedPartIds: chosen.placedPartIds.slice(),
          placedCount: chosen.placedCount,
          placedArea: chosen.placedArea
        });
        chosen.usableLeftovers.forEach(rect => inventoryUsable.push({
          ...rect, sheetId, source: "inventory", sourceRemainderId: chosen.remainderId
        }));
        chosen.tooSmallLeftovers.forEach(rect => inventoryTooSmall.push({
          ...rect, sheetId, source: "inventory", sourceRemainderId: chosen.remainderId
        }));

        for (let i = remaining.length - 1; i >= 0; i -= 1) {
          if (placed.has(remaining[i].id)) remaining.splice(i, 1);
        }
      }

      let newResult = {
        cells: [], sheets: [], sheetCount: 0, reuseCount: 0,
        usableRemainders: [], tooSmallRemainders: [],
        usableRemainderArea: 0, tooSmallRemainderArea: 0,
        unclassifiedArea: 0, totalPartArea: 0, totalSheetArea: 0
      };
      if (remaining.length) {
        const fallbackGeometry = {
          ...input.geometry,
          cells: remaining.map(item => item.cell)
        };
        newResult = adapter.calculateMaterialSources({
          geometry: fallbackGeometry,
          sheetW: newSheetW,
          sheetH: newSheetH,
          mode: input.mode || "ekonomis",
          autoStripReuse: input.autoStripReuse === true,
          allowRotation: input.allowRotation === true,
          kerf: input.kerf,
          minRemainderW: input.minRemainderW,
          minRemainderH: input.minRemainderH,
          cuttingEngine: input.cuttingEngine || defaultCutter
        });
      }

      const newSheetOffset = inventorySheets.length;
      const cells = originalCells.map((cell, index) => {
        const inventory = inventoryCells.get(index);
        if (inventory) {
          return {
            xStart: cell.xStart, yStart: cell.yStart,
            width: cell.width, height: cell.height,
            nCuts: (cell.cutLeft > 0.000001 ? 1 : 0) +
              (cell.cutRight > 0.000001 ? 1 : 0) +
              (cell.cutTop > 0.000001 ? 1 : 0) +
              (cell.cutBottom > 0.000001 ? 1 : 0),
            ...inventory
          };
        }
        const remainingIndex = remaining.findIndex(item => item.index === index);
        if (remainingIndex < 0) throw new Error("Potongan belum memiliki sumber material.");
        const fallbackCell = newResult.cells[remainingIndex];
        return {
          ...fallbackCell,
          sheetId: fallbackCell.sheetId + newSheetOffset,
          source: fallbackCell.source || "new",
          sourceType: "new",
          sheetSource: "new"
        };
      });

      const newSheets = newResult.sheets.map(sheet => ({
        ...sheet, id: sheet.id + newSheetOffset, source: "new"
      }));
      const sheets = inventorySheets.concat(newSheets);
      const usableRemainders = inventoryUsable.concat(
        newResult.usableRemainders.map(item => ({
          ...item, sheetId: item.sheetId + newSheetOffset, source: "new"
        }))
      );
      const tooSmallRemainders = inventoryTooSmall.concat(
        newResult.tooSmallRemainders.map(item => ({
          ...item, sheetId: item.sheetId + newSheetOffset, source: "new"
        }))
      );

      return {
        geometryVersion: 1,
        cells,
        sheets,
        sheetCount: sheets.length,
        inventorySheetCount: inventorySheets.length,
        newSheetCount: newResult.sheetCount,
        reuseCount: cells.filter(cell => cell.source === "inventory" || cell.source === "reuse").length,
        inventoryUsage,
        reusableRemainders: usableRemainders.concat(tooSmallRemainders),
        usableRemainders,
        tooSmallRemainders,
        usableRemainderArea: usableRemainders.reduce((sum, item) => sum + item.width * item.height, 0),
        tooSmallRemainderArea: tooSmallRemainders.reduce((sum, item) => sum + item.width * item.height, 0),
        unclassifiedArea: newResult.unclassifiedArea,
        totalPartArea: originalCells.reduce((sum, cell) => sum + cell.width * cell.height, 0),
        totalSheetArea: inventorySheets.reduce((sum, sheet) => sum + sheet.width * sheet.height, 0) +
          newResult.totalSheetArea,
        kerf: input.kerf == null ? 0 : Number(input.kerf),
        algorithm: "inventory-first/" + (newResult.algorithm || "none"),
        optimality: "heuristic"
      };
    }

    return { calculate };
  }

  return { createInventoryPlanner };
});
