/* Matcher inventaris — menilai satu unit sisa fisik pada satu waktu.
 * Tidak mengubah stok. Reservasi tetap harus dikonfirmasi melalui storage.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryMatcher = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createInventoryMatcher(options) {
    const opts = options || {};
    const cutter = opts.cuttingEngine ||
      (typeof MaterialCuttingEngine !== "undefined" ? MaterialCuttingEngine : null);
    if (!cutter || typeof cutter.calculateCutting !== "function") {
      throw new Error("Mesin pemotongan wajib disediakan untuk matcher.");
    }

    function positive(value, label) {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) {
        throw new Error(label + " harus lebih dari 0.");
      }
      return number;
    }

    function compatible(remainder, input) {
      const material = input.material;
      if (remainder.status !== "available" || remainder.condition !== "good") return false;
      if (remainder.materialId !== material.id) return false;
      if (Number(remainder.thicknessMm) !== Number(material.thicknessMm)) return false;
      if (remainder.motif !== (input.motif == null ? material.motif : input.motif)) return false;
      if (input.grainDirection != null &&
          remainder.grainDirection !== input.grainDirection) return false;
      // Harus sama dengan aturan kompatibilitas pada storage: material tetap
      // tidak boleh memiliki sisa yang ditandai dapat diputar, begitu juga
      // material berarah serat. Jika tidak, planner memilih stok yang nantinya
      // pasti ditolak ketika reservasi dikonfirmasi.
      if (material.rotationPolicy === "fixed" && remainder.rotationAllowed === true) return false;
      if (material.grainRequired === true && remainder.rotationAllowed === true) return false;
      return true;
    }

    function canRotate(remainder, material, input) {
      return input.allowRotation === true &&
        remainder.rotationAllowed === true &&
        ["free", "quarter_turn"].includes(material.rotationPolicy) &&
        material.grainRequired !== true;
    }

    function findCandidates(input) {
      if (!input || !input.material || !Array.isArray(input.remainders) ||
          !Array.isArray(input.parts) || input.parts.length === 0) {
        throw new Error("Material, daftar sisa, dan daftar potongan wajib disediakan.");
      }
      if (!input.material.id) throw new Error("ID material wajib diisi.");
      if (input.material.active === false) throw new Error("Material tidak aktif tidak dapat dicocokkan.");
      if (!["free", "quarter_turn", "fixed"].includes(input.material.rotationPolicy)) {
        throw new Error("Kebijakan rotasi material tidak dikenal.");
      }
      if (input.material.grainRequired === true &&
          (typeof input.grainDirection !== "string" || !input.grainDirection.trim())) {
        throw new Error("Arah serat wajib ditentukan untuk material yang memiliki arah serat.");
      }
      const parts = input.parts.map((part, index) => ({
        id: String(part && part.id != null ? part.id : "PART-" + (index + 1)),
        width: positive(part && part.width, "Lebar potongan"),
        height: positive(part && part.height, "Tinggi potongan")
      }));
      if (new Set(parts.map(part => part.id)).size !== parts.length) {
        throw new Error("ID setiap potongan harus unik.");
      }
      const kerf = input.kerf == null ? 0 : Number(input.kerf);
      if (!Number.isFinite(kerf) || kerf < 0) throw new Error("Kerf tidak boleh negatif.");
      const minRemainderW = input.minRemainderW == null ? 0 : Number(input.minRemainderW);
      const minRemainderH = input.minRemainderH == null ? 0 : Number(input.minRemainderH);
      if (!Number.isFinite(minRemainderW) || minRemainderW < 0 ||
          !Number.isFinite(minRemainderH) || minRemainderH < 0) {
        throw new Error("Ukuran minimum sisa tidak boleh negatif.");
      }

      const matches = [];
      input.remainders.forEach(remainder => {
        if (!remainder || !compatible(remainder, input)) return;
        const sheetW = positive(remainder.widthCm, "Lebar sisa");
        const sheetH = positive(remainder.heightCm, "Tinggi sisa");
        const allowRotation = canRotate(remainder, input.material, input);
        // Saring potongan yang secara individual mustahil muat. Dengan begitu
        // satu potongan besar tidak menggugurkan kandidat yang masih berguna
        // untuk potongan lain pada pekerjaan yang sama.
        const individuallyFitting = parts.filter(part => {
          const normal = part.width <= sheetW && part.height <= sheetH;
          const rotated = allowRotation && part.height <= sheetW && part.width <= sheetH;
          return normal || rotated;
        });
        if (individuallyFitting.length === 0) return;
        let result;
        try {
          result = cutter.calculateCutting({
            sheetW, sheetH, kerf, allowRotation,
            minRemainderW, minRemainderH, parts: individuallyFitting
          });
        } catch (_) {
          return;
        }
        const sourceSheet = result.sheets[0];
        if (!sourceSheet || sourceSheet.placements.length === 0) return;
        const placedIds = sourceSheet.placements.map(item => item.sourceId);
        const placedArea = sourceSheet.placements.reduce(
          (sum, item) => sum + item.width * item.height, 0
        );
        const usableLeftovers = sourceSheet.leftovers.filter(rect =>
          rect.width + 0.000001 >= minRemainderW &&
          rect.height + 0.000001 >= minRemainderH
        );
        matches.push({
          remainderId: remainder.id,
          materialId: remainder.materialId,
          widthCm: sheetW,
          heightCm: sheetH,
          originJobId: remainder.originJobId,
          createdAt: remainder.createdAt,
          placedPartIds: placedIds,
          placements: sourceSheet.placements,
          placedCount: sourceSheet.placements.length,
          placedArea,
          leftoverArea: sourceSheet.leftovers.reduce(
            (sum, rect) => sum + rect.width * rect.height, 0
          ),
          usableLeftovers,
          tooSmallLeftovers: sourceSheet.leftovers.filter(rect => !usableLeftovers.includes(rect)),
          allowRotation,
          algorithm: result.algorithm,
          optimality: result.optimality
        });
      });

      // Prioritas: paling banyak potongan terpasang, luas terpakai terbesar,
      // limbah ruang terkecil, lalu stok yang lebih tua.
      matches.sort((a, b) =>
        b.placedCount - a.placedCount ||
        b.placedArea - a.placedArea ||
        a.leftoverArea - b.leftoverArea ||
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
        a.remainderId.localeCompare(b.remainderId)
      );
      return matches;
    }

    return { findCandidates };
  }

  return { createInventoryMatcher };
});
