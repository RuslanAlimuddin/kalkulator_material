/* Kalkulator Material Bangunan — mesin geometri murni
 * Satuan masukan/keluaran: cm. Tidak bergantung pada DOM.
 * Modul dapat dipakai di browser (window.MaterialEngine) dan Node.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPS = 0.0001;
  const ALIGNMENTS = {
    TL:[0,0], TC:[0.5,0], TR:[1,0],
    ML:[0,0.5], MC:[0.5,0.5], MR:[1,0.5],
    BL:[0,1], BC:[0.5,1], BR:[1,1]
  };

  function finitePositive(value, name) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) throw new Error(name + " harus lebih dari 0.");
    return n;
  }

  function axisStarts(span, size, gap, align) {
    const pitch = size + gap;
    const count = Math.max(1, Math.ceil((span + gap - EPS) / pitch));
    const occupied = count * size + (count - 1) * gap;
    const excess = Math.max(0, occupied - span);
    const first = -excess * align;
    const out = [];
    for (let i = 0; i < count; i++) out.push(first + i * pitch);
    return out;
  }

  function makeAxisStarts(span, size, gap, align, shift) {
    const pitch = size + gap;
    const base = axisStarts(span, size, gap, align);
    const first = base[0] + shift;
    const count = Math.ceil((span - first + EPS) / pitch) + 1;
    const out = [];
    for (let i = -1; i < count; i++) {
      const p = first + i * pitch;
      if (p < span - EPS && p + size > EPS) out.push(p);
    }
    return out;
  }

  function phase(index, reference, fraction, size, pitch) {
    const step = ((index - reference) % 3 + 3) % 3;
    return (step * size * fraction) % pitch;
  }

  function calculateGeometry(input) {
    const wallW = finitePositive(input.wallW, "Lebar bidang");
    const wallH = finitePositive(input.wallH, "Tinggi bidang");
    const matW = finitePositive(input.matW, "Lebar material");
    const matH = finitePositive(input.matH, "Tinggi material");
    const gap = Number(input.gap || 0);
    if (!Number.isFinite(gap) || gap < 0) throw new Error("Jarak nat tidak boleh negatif.");
    const pattern = input.pattern || "stack";
    const direction = input.direction || "horizontal";
    const alignment = input.alignment || "BL";
    if (!["stack","running","third"].includes(pattern)) throw new Error("Pola tidak dikenal.");
    if (!["horizontal","vertikal"].includes(direction)) throw new Error("Arah geser tidak dikenal.");
    if (!ALIGNMENTS[alignment]) throw new Error("Alignment tidak dikenal.");

    const [ax, ay] = ALIGNMENTS[alignment];
    const xBase = axisStarts(wallW, matW, gap, ax);
    const yBase = axisStarts(wallH, matH, gap, ay);
    const fraction = pattern === "running" ? 0.5 : pattern === "third" ? 1/3 : 0;
    const cells = [];

    if (pattern === "stack" || direction === "horizontal") {
      const ref = ay === 1 ? yBase.length - 1 : ay === 0.5 ? Math.floor((yBase.length - 1) / 2) : 0;
      yBase.forEach((y, r) => {
        const shift = pattern === "stack" ? 0 : phase(r, ref, fraction, matW, matW + gap);
        const xs = pattern === "stack" ? xBase : makeAxisStarts(wallW, matW, gap, ax, shift);
        xs.forEach(x => {
          const left = Math.max(0, x), top = Math.max(0, y);
          const right = Math.min(wallW, x + matW), bottom = Math.min(wallH, y + matH);
          if (right-left <= EPS || bottom-top <= EPS) return;
          cells.push({
            xStart:left, yStart:top, width:right-left, height:bottom-top,
            cutLeft:left-x, cutRight:x+matW-right,
            cutTop:top-y, cutBottom:y+matH-bottom,
            row:r, column:cells.length, sourceX:x, sourceY:y
          });
        });
      });
    } else {
      const ref = ax === 1 ? xBase.length - 1 : ax === 0.5 ? Math.floor((xBase.length - 1) / 2) : 0;
      xBase.forEach((x, c) => {
        const shift = phase(c, ref, fraction, matH, matH + gap);
        const ys = makeAxisStarts(wallH, matH, gap, ay, shift);
        ys.forEach(y => {
          const left = Math.max(0, x), top = Math.max(0, y);
          const right = Math.min(wallW, x + matW), bottom = Math.min(wallH, y + matH);
          if (right-left <= EPS || bottom-top <= EPS) return;
          cells.push({
            xStart:left, yStart:top, width:right-left, height:bottom-top,
            cutLeft:left-x, cutRight:x+matW-right,
            cutTop:top-y, cutBottom:y+matH-bottom,
            row:cells.length, column:c, sourceX:x, sourceY:y
          });
        });
      });
    }

    cells.sort((a,b) => a.yStart-b.yStart || a.xStart-b.xStart);
    const areaInstalled = cells.reduce((sum,c) => sum + c.width*c.height, 0);
    return {
      wallW, wallH, matW, matH, gap, pattern, direction, alignment,
      columns: xBase.length, rows: yBase.length, cells,
      areaInstalled, areaWall: wallW*wallH,
      // Gap area is intentionally not covered by panels.
      coverageRatio: areaInstalled/(wallW*wallH)
    };
  }

  return { calculateGeometry, ALIGNMENTS, EPS };
});
