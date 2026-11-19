/* Validator paket inventaris material.
 * Tidak bergantung pada DOM atau IndexedDB agar dapat diuji di Node.js.
 * Satuan: dimensi sisa cm, ketebalan mm.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryValidator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUSES = ["available", "reserved", "consumed", "discarded"];
  const CONDITIONS = ["good", "damaged", "unknown"];
  const JOB_STATUSES = ["open", "completed", "archived"];
  const ROTATION_POLICIES = ["free", "quarter_turn", "fixed"];
  const RESERVATION_STATUSES = ["active", "released", "consumed"];
  const MOVEMENT_TYPES = [
    "created", "reserved", "reservation_released", "consumed",
    "remainder_created", "condition_changed", "discarded", "imported"
  ];

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
  }

  function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  function isIsoDate(value) {
    return typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value));
  }

  function validateInventoryBundle(bundle) {
    const errors = [];
    const warnings = [];

    function error(path, message) {
      errors.push({ path, message });
    }

    function requireObject(value, path) {
      if (!isObject(value)) {
        error(path, "Harus berupa objek.");
        return false;
      }
      return true;
    }

    function requireString(value, path) {
      if (!isNonEmptyString(value)) error(path, "Wajib berupa teks yang tidak kosong.");
    }

    function requireDate(value, path, nullable) {
      if (nullable && value === null) return;
      if (!isIsoDate(value)) error(path, "Harus berupa tanggal ISO 8601 UTC yang valid.");
    }

    function requireSchemaArray(value, path) {
      if (!isObject(value)) {
        error(path, "Paket harus berupa objek.");
        return null;
      }
      if (![1, 2].includes(value.schemaVersion)) {
        error(path + ".schemaVersion", "Versi skema yang didukung adalah 1 atau 2.");
      }
      if (!Array.isArray(value[path])) {
        error(path + "." + path, "Harus berupa array.");
        return null;
      }
      return value[path];
    }

    if (!requireObject(bundle, "bundle")) {
      return { valid: false, errors, warnings };
    }

    const materials = requireSchemaArray(bundle.materials, "materials");
    const jobs = requireSchemaArray(bundle.jobs, "jobs");
    const remainders = requireSchemaArray(bundle.remainders, "remainders");
    const reservations = requireSchemaArray(bundle.reservations, "reservations");
    const movements = requireSchemaArray(bundle.movements, "movements");
    const plans = bundle.plans == null ? [] : requireSchemaArray(bundle.plans, "plans");

    const materialById = new Map();
    const jobById = new Map();
    const remainderById = new Map();
    const reservationById = new Map();
    const activeReservationByRemainder = new Map();

    function indexUnique(records, path, map) {
      if (!records) return;
      records.forEach((record, index) => {
        const itemPath = path + "." + path + "[" + index + "]";
        if (!requireObject(record, itemPath)) return;
        if (!isNonEmptyString(record.id)) {
          error(itemPath + ".id", "ID wajib berupa teks yang tidak kosong.");
          return;
        }
        if (map.has(record.id)) {
          error(itemPath + ".id", "ID duplikat: " + record.id + ".");
        } else {
          map.set(record.id, record);
        }
      });
    }

    indexUnique(materials, "materials", materialById);
    indexUnique(jobs, "jobs", jobById);
    indexUnique(remainders, "remainders", remainderById);
    indexUnique(reservations, "reservations", reservationById);
    const planById = new Map();
    indexUnique(plans, "plans", planById);

    if (plans) plans.forEach((item, index) => {
      if (!isObject(item)) return;
      const p = "plans.plans[" + index + "]";
      requireString(item.jobId, p + ".jobId");
      if (!["reserved", "cancelled", "completed", "legacy_recovery"].includes(item.status)) {
        error(p + ".status", "Status snapshot rencana tidak dikenal.");
      }
      if (!Array.isArray(item.reservationIds)) {
        error(p + ".reservationIds", "Daftar ID reservasi harus berupa array.");
      } else {
        const seen = new Set();
        item.reservationIds.forEach((id, i) => {
          if (!isNonEmptyString(id)) error(p + ".reservationIds[" + i + "]", "ID reservasi wajib diisi.");
          else if (seen.has(id)) error(p + ".reservationIds[" + i + "]", "ID reservasi duplikat.");
          else seen.add(id);
        });
      }
      if (item.status === "reserved" && !item.legacy && !isObject(item.plan)) {
        error(p + ".plan", "Snapshot aktif wajib menyimpan objek rencana.");
      }
      if (!item.legacy && isObject(item.plan)) {
        if (!Array.isArray(item.plan.inventoryUsage)) {
          error(p + ".plan.inventoryUsage", "Snapshot rencana wajib memiliki daftar sumber inventaris.");
        } else {
          const usageIds = [];
          const seenUsageIds = new Set();
          item.plan.inventoryUsage.forEach((usage, usageIndex) => {
            const usagePath = p + ".plan.inventoryUsage[" + usageIndex + "].remainderId";
            const sourceId = usage && usage.remainderId;
            if (!isNonEmptyString(sourceId)) {
              error(usagePath, "ID sumber inventaris wajib berupa teks yang tidak kosong.");
            } else if (seenUsageIds.has(sourceId)) {
              error(usagePath, "Satu sumber inventaris tidak boleh tercantum lebih dari sekali.");
            } else {
              seenUsageIds.add(sourceId);
              usageIds.push(sourceId);
            }
          });
          if (Array.isArray(item.reservationIds)) {
            const linked = item.reservationIds
              .map(id => reservationById.get(id))
              .filter(Boolean);
            linked.forEach((reservation, linkedIndex) => {
              if (reservation.jobId !== item.jobId) {
                error(p + ".reservationIds", "Pekerjaan reservasi tidak cocok dengan pekerjaan snapshot.");
              }
            });
            if (linked.length === item.reservationIds.length) {
              const linkedSourceIds = linked.map(reservation => reservation.remainderId).sort();
              if (JSON.stringify(usageIds.slice().sort()) !== JSON.stringify(linkedSourceIds)) {
                error(p + ".plan.inventoryUsage", "Daftar sumber inventaris tidak cocok dengan sumber reservasi.");
              }
            }
          }
        }
      }
      if (item.legacy === true && item.status !== "legacy_recovery" && item.plan == null) {
        warnings.push({ path: p, message: "Reservasi lama tidak memiliki snapshot rencana." });
      }
      if (Array.isArray(item.reservationIds)) item.reservationIds.forEach((reservationId, i) => {
        const reservation = reservationById.get(reservationId);
        if (!reservation) {
          error(p + ".reservationIds[" + i + "]", "Reservasi yang dirujuk tidak ditemukan.");
        } else if (reservation.planId !== item.id) {
          error(p + ".reservationIds[" + i + "]", "Reservasi tidak terhubung kembali ke snapshot ini.");
        } else {
          const expectedStatus = item.status === "reserved" || item.status === "legacy_recovery"
            ? "active"
            : item.status === "cancelled" ? "released" : "consumed";
          if (reservation.status !== expectedStatus) {
            error(p + ".reservationIds[" + i + "]", "Status reservasi tidak sesuai dengan status snapshot.");
          }
        }
      });
    });

    if (materials) materials.forEach((item, index) => {
      if (!isObject(item)) return;
      const p = "materials.materials[" + index + "]";
      requireString(item.name, p + ".name");
      requireString(item.category, p + ".category");
      if (!isPositiveNumber(item.thicknessMm)) error(p + ".thicknessMm", "Ketebalan harus angka lebih dari 0 mm.");
      if (typeof item.grainRequired !== "boolean") error(p + ".grainRequired", "Harus bernilai true atau false.");
      requireString(item.motif, p + ".motif");
      if (!ROTATION_POLICIES.includes(item.rotationPolicy)) {
        error(p + ".rotationPolicy", "Kebijakan rotasi tidak dikenal.");
      }
      if (typeof item.active !== "boolean") error(p + ".active", "Harus bernilai true atau false.");
      if (item.surface != null && !isNonEmptyString(item.surface)) {
        error(p + ".surface", "Jika diisi, permukaan harus berupa teks.");
      }
    });

    if (jobs) jobs.forEach((item, index) => {
      if (!isObject(item)) return;
      const p = "jobs.jobs[" + index + "]";
      requireString(item.name, p + ".name");
      if (!JOB_STATUSES.includes(item.status)) error(p + ".status", "Status pekerjaan tidak dikenal.");
      requireDate(item.createdAt, p + ".createdAt", false);
      requireDate(item.closedAt, p + ".closedAt", true);
      if (item.status === "open" && item.closedAt !== null) {
        error(p + ".closedAt", "Pekerjaan berstatus open harus memiliki closedAt null.");
      }
      if (item.status !== "open" && item.closedAt === null) {
        warnings.push({ path: p + ".closedAt", message: "Pekerjaan selesai/arsip belum memiliki waktu penutupan." });
      }
    });

    if (remainders) remainders.forEach((item, index) => {
      if (!isObject(item)) return;
      const p = "remainders.remainders[" + index + "]";
      requireString(item.materialId, p + ".materialId");
      requireString(item.originJobId, p + ".originJobId");
      requireString(item.sourceSheetId, p + ".sourceSheetId");
      if (!isPositiveNumber(item.widthCm)) error(p + ".widthCm", "Lebar harus angka lebih dari 0 cm.");
      if (!isPositiveNumber(item.heightCm)) error(p + ".heightCm", "Tinggi harus angka lebih dari 0 cm.");
      if (!isPositiveNumber(item.thicknessMm)) error(p + ".thicknessMm", "Ketebalan harus angka lebih dari 0 mm.");
      requireString(item.grainDirection, p + ".grainDirection");
      requireString(item.motif, p + ".motif");
      if (typeof item.rotationAllowed !== "boolean") error(p + ".rotationAllowed", "Harus bernilai true atau false.");
      if (!CONDITIONS.includes(item.condition)) error(p + ".condition", "Kondisi fisik tidak dikenal.");
      if (!STATUSES.includes(item.status)) error(p + ".status", "Status stok tidak dikenal.");
      requireDate(item.createdAt, p + ".createdAt", false);
      requireDate(item.updatedAt, p + ".updatedAt", false);
      if (!Number.isInteger(item.version) || item.version < 1) error(p + ".version", "Versi record harus bilangan bulat minimal 1.");

      const material = materialById.get(item.materialId);
      if (!material) {
        error(p + ".materialId", "Material dengan ID " + item.materialId + " tidak ditemukan.");
      } else if (isPositiveNumber(item.thicknessMm) &&
          isPositiveNumber(material.thicknessMm) &&
          item.thicknessMm !== material.thicknessMm) {
        error(p + ".thicknessMm", "Ketebalan sisa harus sama dengan katalog material.");
      }
      if (!jobById.has(item.originJobId)) {
        error(p + ".originJobId", "Pekerjaan asal dengan ID " + item.originJobId + " tidak ditemukan.");
      }
      if (item.status === "available" && item.condition === "damaged") {
        warnings.push({ path: p, message: "Sisa rusak berstatus available; matcher tetap harus mengecualikannya." });
      }
    });

    if (reservations) reservations.forEach((item, index) => {
      if (!isObject(item)) return;
      const p = "reservations.reservations[" + index + "]";
      requireString(item.remainderId, p + ".remainderId");
      requireString(item.jobId, p + ".jobId");
      if (!RESERVATION_STATUSES.includes(item.status)) error(p + ".status", "Status reservasi tidak dikenal.");
      requireDate(item.createdAt, p + ".createdAt", false);
      requireDate(item.releasedAt, p + ".releasedAt", true);
      requireDate(item.consumedAt, p + ".consumedAt", true);
      if (!remainderById.has(item.remainderId)) {
        error(p + ".remainderId", "Sisa material yang dirujuk tidak ditemukan.");
      }
      if (!jobById.has(item.jobId)) {
        error(p + ".jobId", "Pekerjaan reservasi yang dirujuk tidak ditemukan.");
      }
      if (item.planId != null && !planById.has(item.planId)) {
        error(p + ".planId", "Snapshot rencana yang dirujuk tidak ditemukan.");
      }
      if (item.planId != null && planById.has(item.planId)) {
        const linkedPlan = planById.get(item.planId);
        if (!Array.isArray(linkedPlan.reservationIds) || !linkedPlan.reservationIds.includes(item.id)) {
          error(p + ".planId", "Snapshot tidak mencantumkan ID reservasi ini.");
        }
        const expectedStatus = linkedPlan.status === "reserved" || linkedPlan.status === "legacy_recovery"
          ? "active" : linkedPlan.status === "cancelled" ? "released" : "consumed";
        if (item.status !== expectedStatus) {
          error(p + ".status", "Status reservasi tidak sesuai dengan status snapshot.");
        }
      }
      if (item.status === "active") {
        if (activeReservationByRemainder.has(item.remainderId)) {
          error(p + ".remainderId", "Satu sisa material memiliki lebih dari satu reservasi aktif.");
        } else {
          activeReservationByRemainder.set(item.remainderId, item);
        }
        if (item.releasedAt !== null || item.consumedAt !== null) {
          error(p, "Reservasi aktif tidak boleh memiliki releasedAt atau consumedAt.");
        }
      }
      if (item.status === "released" && item.releasedAt === null) {
        error(p + ".releasedAt", "Reservasi released wajib memiliki waktu pelepasan.");
      }
      if (item.status === "consumed" && item.consumedAt === null) {
        error(p + ".consumedAt", "Reservasi consumed wajib memiliki waktu pemakaian.");
      }
    });

    if (remainders) remainders.forEach((item, index) => {
      if (!isObject(item) || !isNonEmptyString(item.id)) return;
      const p = "remainders.remainders[" + index + "]";
      const activeReservation = activeReservationByRemainder.get(item.id);
      if (item.status === "reserved" && !activeReservation) {
        error(p + ".status", "Status reserved harus memiliki satu reservasi aktif.");
      }
      if (item.status !== "reserved" && activeReservation) {
        error(p + ".status", "Reservasi aktif mengharuskan status sisa reserved.");
      }
    });

    if (movements) movements.forEach((item, index) => {
      if (!isObject(item)) return;
      const p = "movements.movements[" + index + "]";
      requireString(item.remainderId, p + ".remainderId");
      if (!MOVEMENT_TYPES.includes(item.type)) error(p + ".type", "Jenis pergerakan tidak dikenal.");
      requireDate(item.timestamp, p + ".timestamp", false);
      if (!remainderById.has(item.remainderId)) {
        error(p + ".remainderId", "Sisa material pada riwayat tidak ditemukan.");
      }
      if (item.jobId != null && !jobById.has(item.jobId)) {
        error(p + ".jobId", "Pekerjaan pada riwayat tidak ditemukan.");
      }
      if (item.fromStatus != null && !STATUSES.includes(item.fromStatus)) {
        error(p + ".fromStatus", "Status asal tidak dikenal.");
      }
      if (item.toStatus != null && !STATUSES.includes(item.toStatus)) {
        error(p + ".toStatus", "Status tujuan tidak dikenal.");
      }
      if (item.referenceId != null && !isNonEmptyString(item.referenceId)) {
        error(p + ".referenceId", "Referensi jika diisi harus berupa teks.");
      }
    });

    return { valid: errors.length === 0, errors, warnings };
  }

  return {
    validateInventoryBundle,
    constants: {
      STATUSES: STATUSES.slice(),
      CONDITIONS: CONDITIONS.slice(),
      JOB_STATUSES: JOB_STATUSES.slice(),
      ROTATION_POLICIES: ROTATION_POLICIES.slice(),
      RESERVATION_STATUSES: RESERVATION_STATUSES.slice(),
      MOVEMENT_TYPES: MOVEMENT_TYPES.slice()
    }
  };
});
