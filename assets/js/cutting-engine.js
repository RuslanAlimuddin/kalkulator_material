/* Kalkulator Material — mesin susun potongan pada lembar sumber
 * Satuan: cm. Algoritma guillotine best-fit (heuristik, bukan jaminan optimum global).
 * Tidak bergantung pada DOM; dapat dipakai di browser dan Node.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialCuttingEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPS = 0.000001;

  function positive(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(name + " harus lebih dari 0.");
    }
    return n;
  }

  function calculateCutting(input) {
    if (!input || typeof input !== "object") {
      throw new Error("Masukan pemotongan tidak valid.");
    }

    const sheetW = positive(input.sheetW, "Lebar lembar sumber");
    const sheetH = positive(input.sheetH, "Tinggi lembar sumber");
    const kerf = input.kerf == null ? 0 : Number(input.kerf);
    if (!Number.isFinite(kerf) || kerf < 0) {
      throw new Error("Kerf tidak boleh negatif.");
    }
    if (!Array.isArray(input.parts) || input.parts.length === 0) {
      throw new Error("Daftar potongan tidak boleh kosong.");
    }

    const allowRotation = input.allowRotation === true;
    const parts = [];
    input.parts.forEach((part, index) => {
      const width = positive(part && part.width, "Lebar potongan");
      const height = positive(part && part.height, "Tinggi potongan");
      const quantity = part.quantity == null ? 1 : Number(part.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error("Jumlah potongan harus bilangan bulat minimal 1.");
      }
      for (let i = 0; i < quantity; i++) {
        parts.push({
          id: String(part.id == null ? "P" + (index + 1) : part.id) + (quantity > 1 ? "-" + (i + 1) : ""),
          sourceId: part.id == null ? "P" + (index + 1) : String(part.id),
          width,
          height,
          area: width * height,
          order: parts.length
        });
      }
    });

    // Potongan besar ditempatkan lebih dahulu agar ruang lembar tidak cepat terpecah.
    parts.sort((a, b) =>
      b.area - a.area ||
      Math.max(b.width, b.height) - Math.max(a.width, a.height) ||
      b.height - a.height ||
      a.order - b.order
    );

    const sheets = [];

    function orientations(part) {
      const result = [{ width: part.width, height: part.height, rotated: false }];
      if (allowRotation && Math.abs(part.width - part.height) > EPS) {
        result.push({ width: part.height, height: part.width, rotated: true });
      }
      return result;
    }

    function findBest(part) {
      let best = null;
      sheets.forEach((sheet, sheetIndex) => {
        sheet.freeRects.forEach((free, freeIndex) => {
          orientations(part).forEach(orientation => {
            const extraW = free.width - orientation.width;
            const extraH = free.height - orientation.height;
            if (extraW < -EPS || extraH < -EPS) return;

            const shortSide = Math.min(Math.max(0, extraW), Math.max(0, extraH));
            const longSide = Math.max(Math.max(0, extraW), Math.max(0, extraH));
            const candidate = {
              sheetIndex, freeIndex, free, orientation,
              scoreShort: shortSide,
              scoreLong: longSide
            };
            if (!best ||
                candidate.scoreShort < best.scoreShort - EPS ||
                (Math.abs(candidate.scoreShort - best.scoreShort) <= EPS &&
                 candidate.scoreLong < best.scoreLong - EPS)) {
              best = candidate;
            }
          });
        });
      });
      return best;
    }

    function place(part, candidate, sheet) {
      const free = candidate.free;
      const o = candidate.orientation;
      const extraW = free.width - o.width;
      const extraH = free.height - o.height;
      // Ruang yang lebih kecil dari kerf (lebar mata potong) tidak dianggap sisa pakai.
      const rightGap = extraW > EPS ? Math.min(kerf, extraW) : 0;
      const bottomGap = extraH > EPS ? Math.min(kerf, extraH) : 0;
      const rightWidth = extraW - rightGap;
      const bottomHeight = extraH - bottomGap;

      sheet.freeRects.splice(candidate.freeIndex, 1);
      if (rightWidth > EPS) {
        sheet.freeRects.push({
          x: free.x + o.width + rightGap,
          y: free.y,
          width: rightWidth,
          height: free.height
        });
      }
      if (bottomHeight > EPS) {
        sheet.freeRects.push({
          x: free.x,
          y: free.y + o.height + bottomGap,
          width: o.width,
          height: bottomHeight
        });
      }

      sheet.placements.push({
        partId: part.id,
        sourceId: part.sourceId,
        x: free.x,
        y: free.y,
        width: o.width,
        height: o.height,
        rotated: o.rotated
      });
    }

    for (const part of parts) {
      let candidate = findBest(part);
      if (!candidate) {
        const sheet = {
          id: sheets.length + 1,
          width: sheetW,
          height: sheetH,
          placements: [],
          freeRects: [{ x: 0, y: 0, width: sheetW, height: sheetH }]
        };
        sheets.push(sheet);
        candidate = findBest(part);
      }
      if (!candidate) {
        throw new Error(
          "Potongan " + part.id + " (" + part.width + " × " + part.height +
          " cm) tidak muat pada lembar sumber " + sheetW + " × " + sheetH +
          " cm dengan aturan rotasi yang dipilih."
        );
      }
      place(part, candidate, sheets[candidate.sheetIndex]);
    }

    const totalPartArea = parts.reduce((sum, part) => sum + part.area, 0);
    const totalSheetArea = sheets.length * sheetW * sheetH;
    const reusableRemainders = sheets.flatMap(sheet =>
      sheet.freeRects.map(rect => ({
        sheetId: sheet.id,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        area: rect.width * rect.height
      }))
    );
    const reusableArea = reusableRemainders.reduce((sum, rect) => sum + rect.area, 0);

    return {
      algorithm: "guillotine-best-fit",
      optimality: "heuristic",
      sheetW,
      sheetH,
      kerf,
      allowRotation,
      partCount: parts.length,
      sheetCount: sheets.length,
      totalPartArea,
      totalSheetArea,
      reusableArea,
      unclassifiedArea: Math.max(0, totalSheetArea - totalPartArea - reusableArea),
      sheets: sheets.map(sheet => ({
        id: sheet.id,
        width: sheet.width,
        height: sheet.height,
        placements: sheet.placements,
        leftovers: sheet.freeRects
      })),
      reusableRemainders
    };
  }

  return { calculateCutting };
});
