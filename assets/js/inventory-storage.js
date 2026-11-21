/* Kalkulator Material — penyimpanan inventaris offline berbasis IndexedDB.
 * JSON hanya digunakan untuk impor/ekspor; IndexedDB adalah sumber data operasional.
 * Satuan dimensi mengikuti blueprint: cm dan ketebalan mm.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MaterialInventoryStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DB_NAME = "KalkulatorMaterialDB";
  const DB_VERSION = 2;
  const STORE_NAMES = [
    "materials", "jobs", "remainders", "reservations", "movements", "plans", "meta"
  ];
  const BUNDLE_STORES = ["materials", "jobs", "remainders", "reservations", "movements", "plans"];
  let fallbackCounter = 0;

  function makeId(prefix) {
    let randomPart;
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        randomPart = crypto.randomUUID();
      }
    } catch (_) { /* Gunakan fallback jika crypto tidak tersedia. */ }
    if (!randomPart) {
      fallbackCounter += 1;
      randomPart = Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2) + "-" + fallbackCounter.toString(36);
    }
    return (prefix || "ID") + "-" + randomPart;
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Operasi IndexedDB gagal."));
    });
  }

  // Seluruh operasi bisnis menggunakan format tanggal UTC yang sama dengan
  // validator paket agar timestamp tidak valid tidak pernah masuk ke riwayat.
  function resolveTimestamp(value) {
    const timestamp = value === undefined || value === null ? new Date().toISOString() : value;
    const match = typeof timestamp === "string"
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(timestamp)
      : null;
    const validIsoUtc = Boolean(match && (() => {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6]);
      const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      return month >= 1 && month <= 12 &&
        day >= 1 && day <= daysInMonth[month - 1] &&
        hour <= 23 && minute <= 59 && second <= 59;
    })());
    if (!validIsoUtc) {
      throw new Error("Timestamp harus berupa tanggal ISO 8601 UTC yang valid.");
    }
    return timestamp;
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("Transaksi dibatalkan."));
      transaction.onerror = () => reject(transaction.error || new Error("Transaksi IndexedDB gagal."));
    });
  }

  function openDatabase(options) {
    const opts = options || {};
    const idb = opts.indexedDB ||
      (typeof indexedDB !== "undefined" ? indexedDB : null);
    if (!idb || typeof idb.open !== "function") {
      return Promise.reject(new Error("IndexedDB tidak tersedia pada lingkungan ini."));
    }

    return new Promise((resolve, reject) => {
      const request = idb.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = request.result;
        if (!db.objectStoreNames.contains("materials")) {
          db.createObjectStore("materials", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("jobs")) {
          db.createObjectStore("jobs", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("remainders")) {
          const store = db.createObjectStore("remainders", { keyPath: "id" });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("materialId", "materialId", { unique: false });
          store.createIndex("originJobId", "originJobId", { unique: false });
        }
        if (!db.objectStoreNames.contains("reservations")) {
          const store = db.createObjectStore("reservations", { keyPath: "id" });
          store.createIndex("remainderId", "remainderId", { unique: false });
          store.createIndex("jobId", "jobId", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }
        if (!db.objectStoreNames.contains("movements")) {
          const store = db.createObjectStore("movements", { keyPath: "id" });
          store.createIndex("remainderId", "remainderId", { unique: false });
          store.createIndex("jobId", "jobId", { unique: false });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!db.objectStoreNames.contains("plans")) {
          const plans = db.createObjectStore("plans", { keyPath: "id" });
          plans.createIndex("jobId", "jobId", { unique: false });
          plans.createIndex("status", "status", { unique: false });
        }
        const reservationsStore = request.transaction.objectStore("reservations");
        if (!reservationsStore.indexNames.contains("planId")) {
          reservationsStore.createIndex("planId", "planId", { unique: false });
        }
        let metaStore;
        if (!db.objectStoreNames.contains("meta")) {
          metaStore = db.createObjectStore("meta", { keyPath: "key" });
        } else {
          metaStore = request.transaction.objectStore("meta");
        }
        if (event.oldVersion < 1) {
          metaStore.put({ key: "schemaVersion", value: 2, updatedAt: new Date().toISOString() });
        } else if (event.oldVersion < 2) {
          const reservations = request.transaction.objectStore("reservations");
          const cursorRequest = reservations.openCursor();
          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (!cursor) return;
            const reservation = cursor.value;
            if (reservation.status === "active" && !reservation.planId) {
              const planId = "LEGACY-" + reservation.id;
              reservation.planId = planId;
              cursor.update(reservation);
              request.transaction.objectStore("plans").put({
                id: planId, jobId: reservation.jobId, plan: null,
                material: null, grainDirection: null, motif: null,
                reservationIds: [reservation.id], status: "legacy_recovery",
                legacy: true,
                recoveryNote: "Reservasi versi 1 tidak memiliki snapshot rencana pemotongan.",
                createdAt: reservation.createdAt, completedAt: null,
                cancelledAt: null, schemaVersion: 1
              });
            }
            cursor.continue();
          };
          metaStore.put({ key: "schemaVersion", value: 2, updatedAt: new Date().toISOString() });
        }
      };
      request.onblocked = () => {
        if (typeof opts.onBlocked === "function") opts.onBlocked();
      };
      request.onerror = () => reject(request.error || new Error("Database inventaris gagal dibuka."));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          if (typeof opts.onVersionChange === "function") opts.onVersionChange();
        };
        resolve(db);
      };
    });
  }

  function ensureStore(storeName) {
    if (!STORE_NAMES.includes(storeName)) {
      throw new Error("Object store tidak dikenal: " + storeName);
    }
  }

  const BUSINESS_MANAGED_STORES = ["remainders", "reservations", "movements", "plans"];

  function ensureGenericWriteAllowed(storeName, options) {
    if (BUSINESS_MANAGED_STORES.includes(storeName) &&
        !(options && options.allowUnsafeInventoryWrites === true)) {
      throw new Error(
        "Penulisan langsung ke " + storeName +
        " dibatasi. Gunakan operasi inventaris khusus agar status, reservasi, dan riwayat tetap atomik."
      );
    }
  }

  function withTransaction(db, storeNames, mode, work) {
    return new Promise((resolve, reject) => {
      let tx;
      let result;
      try {
        tx = db.transaction(storeNames, mode);
      } catch (error) {
        reject(error);
        return;
      }
      const done = transactionDone(tx);
      // Tetap amankan rejection transaksi bila callback melempar error sinkron
      // sebelum handler penyelesaian transaksi dipasang di bawah.
      done.catch(() => {});
      try {
        result = work(tx);
      } catch (error) {
        try { tx.abort(); } catch (_) { /* Transaksi mungkin sudah selesai. */ }
        reject(error);
        return;
      }
      // Pasang handler penolakan pada hasil request sejak awal. Jika transaksi
      // abort, promise request juga dapat reject sebelum handler transaksi berjalan.
      const resultPromise = Promise.resolve(result);
      resultPromise.catch(() => {});
      done.then(() => resolve(resultPromise)).catch(reject);
    });
  }

  function createStorage(options) {
    const opts = options || {};
    let dbPromise = null;

    function db() {
      if (!dbPromise) {
        dbPromise = openDatabase(opts).catch(error => {
          dbPromise = null;
          throw error;
        });
      }
      return dbPromise;
    }

    async function get(storeName, id) {
      ensureStore(storeName);
      const database = await db();
      const tx = database.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      done.catch(() => {});
      const value = await requestResult(tx.objectStore(storeName).get(id));
      await done;
      return value === undefined ? null : value;
    }

    async function getAll(storeName) {
      ensureStore(storeName);
      const database = await db();
      const tx = database.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      done.catch(() => {});
      const values = await requestResult(tx.objectStore(storeName).getAll());
      await done;
      return values;
    }

    async function getByIndex(storeName, indexName, value) {
      ensureStore(storeName);
      const database = await db();
      const tx = database.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      done.catch(() => {});
      const store = tx.objectStore(storeName);
      if (!store.indexNames.contains(indexName)) {
        try { tx.abort(); } catch (_) {}
        throw new Error("Index tidak ditemukan: " + storeName + "." + indexName);
      }
      const values = await requestResult(store.index(indexName).getAll(value));
      await done;
      return values;
    }

    async function add(storeName, record) {
      ensureStore(storeName);
      ensureGenericWriteAllowed(storeName, opts);
      const key = storeName === "meta" ? record && record.key : record && record.id;
      if (!record || typeof record !== "object" || key == null || key === "") {
        throw new Error("Record harus memiliki " + (storeName === "meta" ? "key." : "id."));
      }
      const database = await db();
      return withTransaction(database, [storeName], "readwrite", tx =>
        requestResult(tx.objectStore(storeName).add(record))
      );
    }

    async function put(storeName, record) {
      ensureStore(storeName);
      ensureGenericWriteAllowed(storeName, opts);
      const key = storeName === "meta" ? record && record.key : record && record.id;
      if (!record || typeof record !== "object" || key == null || key === "") {
        throw new Error("Record harus memiliki " + (storeName === "meta" ? "key." : "id."));
      }
      const database = await db();
      if (storeName === "materials") {
        return withTransaction(database, ["materials", "remainders"], "readwrite", tx => {
          const references = tx.objectStore("remainders").index("materialId").getAll(record.id);
          references.onsuccess = () => {
            if (references.result.some(item => Number(item.thicknessMm) !== Number(record.thicknessMm))) {
              tx.abort();
              return;
            }
            tx.objectStore("materials").put(record);
          };
          return record.id;
        });
      }
      return withTransaction(database, [storeName], "readwrite", tx =>
        requestResult(tx.objectStore(storeName).put(record))
      );
    }

    async function update(storeName, id, changes) {
      ensureStore(storeName);
      ensureGenericWriteAllowed(storeName, opts);
      if (storeName === "meta") {
        throw new Error("Gunakan put() untuk memperbarui meta berdasarkan key.");
      }
      if (!id || !changes || typeof changes !== "object" || Array.isArray(changes)) {
        throw new Error("ID dan objek perubahan wajib diisi.");
      }
      const database = await db();
      const transactionStores = storeName === "materials"
        ? ["materials", "remainders"] : [storeName];
      return withTransaction(database, transactionStores, "readwrite", tx => {
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => {
          if (!request.result) {
            tx.abort();
            return;
          }
          const updated = { ...request.result, ...changes, id };
          if (storeName !== "materials") {
            store.put(updated);
            return;
          }
          const references = tx.objectStore("remainders").index("materialId").getAll(id);
          references.onsuccess = () => {
            if (references.result.some(item => Number(item.thicknessMm) !== Number(updated.thicknessMm))) {
              tx.abort();
              return;
            }
            store.put(updated);
          };
        };
        return id;
      });
    }

    // Katalog material dan pekerjaan adalah data induk. Penghapusan hanya
    // diizinkan bila tidak ada inventaris/riwayat yang masih merujuk kepadanya.
    async function removeCatalogRecordSafely(storeName, id) {
      const database = await db();
      const storeNames = storeName === "materials"
        ? ["materials", "remainders"]
        : ["jobs", "remainders", "reservations", "movements", "plans"];
      return withTransaction(database, storeNames, "readwrite", tx => {
        const checks = storeName === "materials"
          ? [tx.objectStore("remainders").index("materialId").getAll(id)]
          : [
              tx.objectStore("remainders").index("originJobId").getAll(id),
              tx.objectStore("reservations").index("jobId").getAll(id),
              tx.objectStore("movements").index("jobId").getAll(id),
              tx.objectStore("plans").index("jobId").getAll(id)
            ];
        let pending = checks.length;
        let referenced = false;
        checks.forEach(request => {
          request.onsuccess = () => {
            if (request.result.length) referenced = true;
            pending -= 1;
            if (pending !== 0) return;
            if (referenced) {
              tx.abort();
              return;
            }
            tx.objectStore(storeName).delete(id);
          };
        });
        return id;
      }).then(() => true);
    }

    async function clearCatalogSafely(storeName) {
      const database = await db();
      const storeNames = storeName === "materials"
        ? ["materials", "remainders"]
        : ["jobs", "remainders", "reservations", "movements", "plans"];
      return withTransaction(database, storeNames, "readwrite", tx => {
        const checks = storeName === "materials"
          ? [tx.objectStore("remainders").getAll()]
          : [
              tx.objectStore("remainders").getAll(),
              tx.objectStore("reservations").getAll(),
              tx.objectStore("movements").getAll(),
              tx.objectStore("plans").getAll()
            ];
        let pending = checks.length;
        let referenced = false;
        checks.forEach((request, index) => {
          request.onsuccess = () => {
            const records = request.result;
            if (storeName === "materials") {
              if (records.length) referenced = true;
            } else {
              const field = index === 0 ? "originJobId" : "jobId";
              if (records.some(record => record[field] != null)) referenced = true;
            }
            pending -= 1;
            if (pending !== 0) return;
            if (referenced) {
              tx.abort();
              return;
            }
            tx.objectStore(storeName).clear();
          };
        });
        return true;
      }).then(() => true);
    }

    async function remove(storeName, id) {
      ensureStore(storeName);
      ensureGenericWriteAllowed(storeName, opts);
      if (storeName === "materials" || storeName === "jobs") {
        return removeCatalogRecordSafely(storeName, id);
      }
      const database = await db();
      return withTransaction(database, [storeName], "readwrite", tx =>
        requestResult(tx.objectStore(storeName).delete(id))
      ).then(() => true);
    }

    async function clear(storeName) {
      ensureStore(storeName);
      ensureGenericWriteAllowed(storeName, opts);
      if (storeName === "materials" || storeName === "jobs") {
        return clearCatalogSafely(storeName);
      }
      const database = await db();
      return withTransaction(database, [storeName], "readwrite", tx =>
        requestResult(tx.objectStore(storeName).clear())
      ).then(() => true);
    }

    async function reserveRemainder(input) {
      if (!input || !input.remainderId || !input.jobId) {
        throw new Error("remainderId dan jobId wajib diisi untuk reservasi.");
      }
      const database = await db();
      const timestamp = resolveTimestamp(input.timestamp);
      const reservationId = input.id || makeId("RSV");
      const movementId = makeId("MOV");

      return withTransaction(
        database, ["jobs", "remainders", "reservations", "movements"], "readwrite",
        tx => {
          const jobs = tx.objectStore("jobs");
          const remainders = tx.objectStore("remainders");
          const reservations = tx.objectStore("reservations");
          const movements = tx.objectStore("movements");
          const jobRequest = jobs.get(input.jobId);
          jobRequest.onsuccess = () => {
            if (!jobRequest.result) { tx.abort(); return; }
            const remainderRequest = remainders.get(input.remainderId);
            remainderRequest.onsuccess = () => {
            const remainder = remainderRequest.result;
            if (!remainder) {
              tx.abort();
              return;
            }
            if (remainder.status !== "available") {
              tx.abort();
              return;
            }
            if (remainder.condition !== "good") {
              tx.abort();
              return;
            }

            const existingRequest = reservations.index("remainderId").getAll(input.remainderId);
            existingRequest.onsuccess = () => {
              const hasActive = existingRequest.result.some(item => item.status === "active");
              if (hasActive) {
                tx.abort();
                return;
              }
              const updated = {
                ...remainder,
                status: "reserved",
                updatedAt: timestamp,
                version: Number(remainder.version || 0) + 1
              };
              const reservation = {
                id: reservationId,
                remainderId: input.remainderId,
                jobId: input.jobId,
                status: "active",
                createdAt: timestamp,
                releasedAt: null,
                consumedAt: null
              };
              remainders.put(updated);
              reservations.add(reservation);
              movements.add({
                id: movementId,
                remainderId: input.remainderId,
                type: "reserved",
                jobId: input.jobId,
                timestamp,
                fromStatus: "available",
                toStatus: "reserved",
                referenceId: reservationId
              });
            };
            };
          };
          return { reservationId, movementId };
        }
      ).then(() => ({ id: reservationId, remainderId: input.remainderId, jobId: input.jobId }));
    }

    async function reserveRemainders(input) {
      if (!input || !input.jobId || !Array.isArray(input.remainderIds)) {
        throw new Error("jobId dan daftar remainderIds wajib diisi untuk reservasi massal.");
      }
      const remainderIds = input.remainderIds.slice();
      if (remainderIds.some(id => typeof id !== "string" || !id.trim()) || new Set(remainderIds).size !== remainderIds.length) {
        throw new Error("Daftar remainderIds harus berisi ID unik yang valid.");
      }
      const timestamp = resolveTimestamp(input.timestamp);
      const snapshot = input.planSnapshot || null;
      const snapshotCreatedAt = snapshot
        ? resolveTimestamp(snapshot.createdAt === undefined || snapshot.createdAt === null ? timestamp : snapshot.createdAt)
        : null;
      const planId = input.planId || (snapshot ? makeId("PLAN") : null);
      const out = remainderIds.map(remainderId => ({ id: makeId("RSV"), movementId: makeId("MOV"), remainderId, jobId: input.jobId, planId }));
      const database = await db();
      await withTransaction(database, ["jobs", "remainders", "reservations", "movements", "plans"], "readwrite", tx => {
        const js = tx.objectStore("jobs"), rs = tx.objectStore("remainders"), ss = tx.objectStore("reservations"), ms = tx.objectStore("movements"), ps = tx.objectStore("plans");
        const checked = []; let cursor = 0;
        const commit = () => {
          out.forEach((item, index) => {
            const source = checked[index];
            rs.put({ ...source, status: "reserved", updatedAt: timestamp, version: Number(source.version || 0) + 1 });
            ss.add({ id: item.id, remainderId: item.remainderId, jobId: item.jobId, planId: item.planId || null, status: "active", createdAt: timestamp, releasedAt: null, consumedAt: null });
            ms.add({ id: item.movementId, remainderId: item.remainderId, type: "reserved", jobId: item.jobId, timestamp, fromStatus: "available", toStatus: "reserved", referenceId: item.id });
          });
          if (snapshot) ps.add({ ...snapshot, id: planId, jobId: input.jobId, reservationIds: out.map(item => item.id), status: "reserved", legacy: false, createdAt: snapshotCreatedAt, completedAt: null, cancelledAt: null, schemaVersion: 1 });
        };
        const checkNext = () => {
          if (cursor >= remainderIds.length) { commit(); return; }
          const id = remainderIds[cursor], request = rs.get(id);
          request.onsuccess = () => {
            const source = request.result;
            if (!source || source.status !== "available" || source.condition !== "good") { tx.abort(); return; }
            const active = ss.index("remainderId").getAll(id);
            active.onsuccess = () => {
              if (active.result.some(item => item.status === "active")) { tx.abort(); return; }
              checked.push(source); cursor += 1; checkNext();
            };
          };
        };
        const jobRequest = js.get(input.jobId);
        jobRequest.onsuccess = () => {
          if (!jobRequest.result) { tx.abort(); return; }
          checkNext();
        };
      });
      return out.map(item => ({ id: item.id, remainderId: item.remainderId, jobId: item.jobId, planId: item.planId || null }));
    }
    async function releaseReservation(reservationId, optionsForRelease) {
      const releaseOptions = optionsForRelease || {};
      const database = await db();
      const timestamp = resolveTimestamp(releaseOptions.timestamp);

      return withTransaction(
        database, ["remainders", "reservations", "movements"], "readwrite",
        tx => {
          const reservations = tx.objectStore("reservations");
          const remainders = tx.objectStore("remainders");
          const movements = tx.objectStore("movements");
          const reservationRequest = reservations.get(reservationId);

          reservationRequest.onsuccess = () => {
            const reservation = reservationRequest.result;
            if (!reservation || reservation.status !== "active" || reservation.planId) {
              tx.abort();
              return;
            }
            const remainderRequest = remainders.get(reservation.remainderId);
            remainderRequest.onsuccess = () => {
              const remainder = remainderRequest.result;
              if (!remainder || remainder.status !== "reserved") {
                tx.abort();
                return;
              }
              // Jangan bebaskan stok fisik jika masih ada reservasi aktif lain.
              const activeRequest = reservations.index("remainderId").getAll(remainder.id);
              activeRequest.onsuccess = () => {
                const active = activeRequest.result.filter(item => item.status === "active");
                if (active.length !== 1 || active[0].id !== reservation.id) {
                  tx.abort();
                  return;
                }
                reservations.put({
                  ...reservation, status: "released", releasedAt: timestamp
                });
              remainders.put({
                ...remainder, status: "available", updatedAt: timestamp,
                version: Number(remainder.version || 0) + 1
              });
                movements.add({
                  id: makeId("MOV"),
                  remainderId: remainder.id,
                  type: "reservation_released",
                  jobId: reservation.jobId,
                  timestamp,
                  fromStatus: "reserved",
                  toStatus: "available",
                  referenceId: reservationId
                });
              };
            };
          };
          return reservationId;
        }
      );
    }

    async function releaseReservations(input) {
      if (!input || !Array.isArray(input.reservationIds) ||
          input.reservationIds.length === 0) {
        throw new Error("Daftar reservationIds wajib diisi untuk pelepasan massal.");
      }
      const reservationIds = input.reservationIds.slice();
      if (reservationIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(reservationIds).size !== reservationIds.length) {
        throw new Error("Daftar reservationIds harus berisi ID unik yang valid.");
      }
      const timestamp = resolveTimestamp(input.timestamp);
      const database = await db();

      await withTransaction(
        database, ["remainders", "reservations", "movements", "plans"], "readwrite",
        tx => {
          const reservations = tx.objectStore("reservations");
          const remainders = tx.objectStore("remainders");
          const movements = tx.objectStore("movements");
          const plans = tx.objectStore("plans");
          const checked = [];
          let cursor = 0;

          // Seluruh reservasi dan sumber diperiksa sebelum ada perubahan.
          // Jika satu saja tidak aktif/terkunci, seluruh transaksi dibatalkan.
          const checkNext = () => {
            if (cursor >= reservationIds.length) {
              const remainderIds = checked.map(item => item.remainder.id);
              if (new Set(remainderIds).size !== remainderIds.length) {
                tx.abort();
                return;
              }
              checked.forEach(({ reservation, remainder }) => {
                reservations.put({ ...reservation, status: "released", releasedAt: timestamp });
                remainders.put({ ...remainder, status: "available", updatedAt: timestamp, version: Number(remainder.version || 0) + 1 });
                movements.add({ id: makeId("MOV"), remainderId: remainder.id, type: "reservation_released", jobId: reservation.jobId, timestamp, fromStatus: "reserved", toStatus: "available", referenceId: reservation.id });
              });
              const planIds = Array.from(new Set(checked.map(item => item.reservation.planId).filter(Boolean).concat(input.planId ? [input.planId] : [])));
              planIds.forEach(planId => {
                const request = plans.get(planId);
                request.onsuccess = () => {
                  const plan = request.result;
                  if (!plan || !["reserved", "legacy_recovery"].includes(plan.status)) {
                    tx.abort();
                    return;
                  }
                  const planReservations = checked.filter(item => item.reservation.planId === planId);
                  const expectedIds = Array.isArray(plan.reservationIds) ? plan.reservationIds.slice().sort() : [];
                  const releasedIds = planReservations.map(item => item.reservation.id).sort();
                  const modernPlanMismatch = plan.status === "reserved" && plan.plan
                    ? planReservations.some(item => item.reservation.jobId !== plan.jobId) ||
                      !Array.isArray(plan.plan.inventoryUsage) ||
                      plan.plan.inventoryUsage.length !== planReservations.length ||
                      new Set(plan.plan.inventoryUsage.map(usage => usage && usage.remainderId)).size !==
                        plan.plan.inventoryUsage.length ||
                      plan.plan.inventoryUsage.some(usage =>
                        !usage || typeof usage.remainderId !== "string" ||
                        !planReservations.some(item => item.reservation.remainderId === usage.remainderId)
                      )
                    : false;
                  if (JSON.stringify(expectedIds) !== JSON.stringify(releasedIds) ||
                      modernPlanMismatch) {
                    tx.abort();
                    return;
                  }
                  plans.put({ ...plan, status: "cancelled", cancelledAt: timestamp });
                };
              });
              return;
            }

            const reservationRequest = reservations.get(reservationIds[cursor]);
            reservationRequest.onsuccess = () => {
              const reservation = reservationRequest.result;
              if (!reservation || reservation.status !== "active" ||
                  (input.planId && reservation.planId !== input.planId)) {
                tx.abort();
                return;
              }
              const remainderRequest = remainders.get(reservation.remainderId);
              remainderRequest.onsuccess = () => {
                const remainder = remainderRequest.result;
                if (!remainder || remainder.status !== "reserved") {
                  tx.abort();
                  return;
                }
                // Satu sumber fisik tidak boleh dibebaskan saat reservasi aktifnya ganda.
                const activeRequest = reservations.index("remainderId").getAll(remainder.id);
                activeRequest.onsuccess = () => {
                  const active = activeRequest.result.filter(item => item.status === "active");
                  if (active.length !== 1 || active[0].id !== reservation.id) {
                    tx.abort();
                    return;
                  }
                  checked.push({ reservation, remainder });
                  cursor += 1;
                  checkNext();
                };
              };
            };
          };

          checkNext();
        }
      );

      return reservationIds.slice();
    }

    async function consumeReservation(input) {
      if (!input || !input.reservationId || !Array.isArray(input.remainders)) {
        throw new Error("reservationId dan daftar sisa turunan wajib diisi.");
      }
      const database = await db();
      const timestamp = resolveTimestamp(input.timestamp);
      const drafts = input.remainders.map(item => {
        if (!item || !Number.isFinite(item.widthCm) || item.widthCm <= 0 ||
            !Number.isFinite(item.heightCm) || item.heightCm <= 0) {
          throw new Error("Ukuran setiap sisa turunan harus lebih dari 0 cm.");
        }
        return { id: item.id || makeId("REM"), widthCm: item.widthCm, heightCm: item.heightCm };
      });
      if (new Set(drafts.map(item => item.id)).size !== drafts.length) {
        throw new Error("ID sisa turunan tidak boleh duplikat.");
      }
      await withTransaction(database, ["remainders", "reservations", "movements"], "readwrite", tx => {
        const rs = tx.objectStore("remainders");
        const ss = tx.objectStore("reservations");
        const ms = tx.objectStore("movements");
        const rr = ss.get(input.reservationId);
        rr.onsuccess = () => {
          const reservation = rr.result;
          if (!reservation || reservation.status !== "active" || reservation.planId) { tx.abort(); return; }
          const sr = rs.get(reservation.remainderId);
          sr.onsuccess = () => {
            const source = sr.result;
            if (!source || source.status !== "reserved" || source.condition !== "good") { tx.abort(); return; }
            // Satu stok fisik hanya boleh memiliki satu reservasi aktif.
            // Tolak konsumsi jika data rusak menyisakan reservasi aktif lain.
            const activeRequest = ss.index("remainderId").getAll(source.id);
            activeRequest.onsuccess = () => {
              const active = activeRequest.result.filter(item => item.status === "active");
              if (active.length !== 1 || active[0].id !== reservation.id) {
                tx.abort();
                return;
              }
              ss.put({ ...reservation, status: "consumed", consumedAt: timestamp });
            rs.put({ ...source, status: "consumed", updatedAt: timestamp, version: Number(source.version || 0) + 1 });
            ms.add({
              id: makeId("MOV"), remainderId: source.id, type: "consumed",
              jobId: reservation.jobId, timestamp, fromStatus: "reserved",
              toStatus: "consumed", referenceId: reservation.id
            });
            drafts.forEach(draft => {
              const record = {
                id: draft.id, materialId: source.materialId,
                widthCm: draft.widthCm, heightCm: draft.heightCm,
                thicknessMm: source.thicknessMm, grainDirection: source.grainDirection,
                motif: source.motif, rotationAllowed: source.rotationAllowed,
                condition: "good", status: "available", originJobId: reservation.jobId,
                sourceSheetId: input.sourceSheetId || source.sourceSheetId,
                sourceType: "inventory", reservationId: reservation.id,
                sourceRemainderId: source.id,
                createdAt: timestamp, updatedAt: timestamp, version: 1
              };
              rs.add(record);
              ms.add({
                id: makeId("MOV"), remainderId: record.id, type: "remainder_created",
                jobId: reservation.jobId, timestamp, fromStatus: null,
                toStatus: "available", referenceId: source.id
              });
            });
            };
          };
        };
        return true;
      });
      return {
        reservationId: input.reservationId,
        createdRemainders: drafts.map(item => ({ ...item }))
      };
    }

    async function consumeReservations(input) {
      if (!input || !Array.isArray(input.reservations) ||
          !Array.isArray(input.newSheetRemainders)) {
        throw new Error("reservations dan newSheetRemainders harus berupa array.");
      }
      const timestamp = resolveTimestamp(input.timestamp);
      const batches = input.reservations.map((item, index) => {
        if (!item || typeof item.reservationId !== "string" ||
            !item.reservationId.trim() || !Array.isArray(item.remainders)) {
          throw new Error("Data konsumsi reservasi ke-" + (index + 1) + " tidak valid.");
        }
        const drafts = item.remainders.map(remainder => {
          if (!remainder || !Number.isFinite(remainder.widthCm) || remainder.widthCm <= 0 ||
              !Number.isFinite(remainder.heightCm) || remainder.heightCm <= 0) {
            throw new Error("Ukuran sisa turunan pada reservasi ke-" + (index + 1) + " tidak valid.");
          }
          return { id: remainder.id || makeId("REM"), widthCm: remainder.widthCm, heightCm: remainder.heightCm };
        });
        return { reservationId: item.reservationId, sourceSheetId: item.sourceSheetId || null, drafts };
      });
      const newSheetDrafts = input.newSheetRemainders.map((item, index) => {
        if (!item || typeof item.materialId !== "string" || !item.materialId.trim() ||
            typeof item.originJobId !== "string" || !item.originJobId.trim() ||
            typeof item.sourceSheetId !== "string" || !item.sourceSheetId.trim() ||
            !Number.isFinite(item.widthCm) || item.widthCm <= 0 ||
            !Number.isFinite(item.heightCm) || item.heightCm <= 0 ||
            !Number.isFinite(item.thicknessMm) || item.thicknessMm <= 0 ||
            typeof item.grainDirection !== "string" || !item.grainDirection.trim() ||
            typeof item.motif !== "string" || !item.motif.trim() ||
            typeof item.rotationAllowed !== "boolean") {
          throw new Error("Data sisa lembar baru ke-" + (index + 1) + " tidak lengkap atau tidak valid.");
        }
        return {
          id: item.id || makeId("REM"), materialId: item.materialId,
          originJobId: item.originJobId, sourceSheetId: item.sourceSheetId,
          widthCm: item.widthCm, heightCm: item.heightCm,
          thicknessMm: item.thicknessMm, grainDirection: item.grainDirection,
          motif: item.motif, rotationAllowed: item.rotationAllowed
        };
      });
      if (batches.length === 0 && newSheetDrafts.length === 0) {
        if (!input.planId) return { consumedReservations: [], createdRemainders: [] };
        await updatePlanStatus({
          planId: input.planId, status: "completed", timestamp
        });
        return { consumedReservations: [], createdRemainders: [] };
      }
      const reservationIds = batches.map(item => item.reservationId);
      const allCreatedIds = batches.flatMap(item => item.drafts.map(draft => draft.id))
        .concat(newSheetDrafts.map(item => item.id));
      if (new Set(reservationIds).size !== reservationIds.length) {
        throw new Error("ID reservasi untuk konsumsi massal tidak boleh duplikat.");
      }
      if (new Set(allCreatedIds).size !== allCreatedIds.length) {
        throw new Error("ID sisa turunan atau sisa lembar baru tidak boleh duplikat.");
      }

      const database = await db();
      const createdRemainders = [];
      await withTransaction(
        database, ["materials", "jobs", "remainders", "reservations", "movements", "plans"], "readwrite",
        tx => {
          const materials = tx.objectStore("materials");
          const jobs = tx.objectStore("jobs");
          const remainders = tx.objectStore("remainders");
          const reservations = tx.objectStore("reservations");
          const movements = tx.objectStore("movements");
          const plans = tx.objectStore("plans");
          const checked = [];
          let cursor = 0;

          const commitChanges = () => {
            const sourceIds = checked.map(item => item.source.id);
            if (new Set(sourceIds).size !== sourceIds.length) {
              tx.abort();
              return;
            }
            batches.forEach((batch, index) => {
              const { reservation, source } = checked[index];
              reservations.put({ ...reservation, status: "consumed", consumedAt: timestamp });
              remainders.put({
                ...source, status: "consumed", updatedAt: timestamp,
                version: Number(source.version || 0) + 1
              });
              movements.add({
                id: makeId("MOV"), remainderId: source.id, type: "consumed",
                jobId: reservation.jobId, timestamp, fromStatus: "reserved",
                toStatus: "consumed", referenceId: reservation.id
              });
              batch.drafts.forEach(draft => {
                const record = {
                  id: draft.id, materialId: source.materialId,
                  widthCm: draft.widthCm, heightCm: draft.heightCm,
                  thicknessMm: source.thicknessMm, grainDirection: source.grainDirection,
                  motif: source.motif, rotationAllowed: source.rotationAllowed,
                  condition: "good", status: "available", originJobId: reservation.jobId,
                  sourceSheetId: batch.sourceSheetId || source.sourceSheetId,
                  sourceType: "inventory", reservationId: reservation.id,
                  sourceRemainderId: source.id,
                  createdAt: timestamp, updatedAt: timestamp, version: 1
                };
                createdRemainders.push({
                  ...record, sourceType: "inventory",
                  reservationId: reservation.id, sourceRemainderId: source.id
                });
                remainders.add(record);
                movements.add({
                  id: makeId("MOV"), remainderId: record.id, type: "remainder_created",
                  jobId: reservation.jobId, timestamp, fromStatus: null,
                  toStatus: "available", referenceId: source.id
                });
              });
            });
            newSheetDrafts.forEach(draft => {
              const record = {
                id: draft.id, materialId: draft.materialId,
                widthCm: draft.widthCm, heightCm: draft.heightCm,
                thicknessMm: draft.thicknessMm, grainDirection: draft.grainDirection,
                motif: draft.motif, rotationAllowed: draft.rotationAllowed,
                condition: "good", status: "available", originJobId: draft.originJobId,
                sourceSheetId: draft.sourceSheetId, sourceType: "new",
                createdAt: timestamp, updatedAt: timestamp, version: 1
              };
              createdRemainders.push({ ...record, sourceType: "new" });
              remainders.add(record);
              movements.add({
                id: makeId("MOV"), remainderId: record.id, type: "remainder_created",
                jobId: draft.originJobId, timestamp, fromStatus: null,
                toStatus: "available", referenceId: draft.sourceSheetId
              });
            });
            if (input.planId) {
              const planRequest = plans.get(input.planId);
              planRequest.onsuccess = () => {
                const savedPlan = planRequest.result;
                if (!savedPlan || savedPlan.status !== "reserved") { tx.abort(); return; }
                const expectedIds = Array.isArray(savedPlan.reservationIds) ? savedPlan.reservationIds.slice().sort() : [];
                const consumedIds = checked.map(item => item.reservation.id).sort();
                const usage = savedPlan.plan && Array.isArray(savedPlan.plan.inventoryUsage)
                  ? savedPlan.plan.inventoryUsage : [];
                const usageIds = usage.map(item => item && item.remainderId);
                const reservationJobMismatch = checked.some(item =>
                  item.reservation.jobId !== savedPlan.jobId ||
                  (input.jobId && item.reservation.jobId !== input.jobId)
                );
                const sourceMismatch = usageIds.some(id => typeof id !== "string" || !id.trim()) ||
                  new Set(usageIds).size !== usageIds.length ||
                  usageIds.length !== checked.length ||
                  checked.some(item => !usageIds.includes(item.reservation.remainderId));
                if (JSON.stringify(expectedIds) !== JSON.stringify(consumedIds) ||
                    reservationJobMismatch || sourceMismatch) {
                  tx.abort();
                  return;
                }
                plans.put({ ...savedPlan, status: "completed", completedAt: timestamp });
              };
            }
          };

          const checkNext = () => {
            if (cursor >= batches.length) {
              commitChanges();
              return;
            }
            const batch = batches[cursor];
            const reservationRequest = reservations.get(batch.reservationId);
            reservationRequest.onsuccess = () => {
              const reservation = reservationRequest.result;
              if (!reservation || reservation.status !== "active" ||
                  ((reservation.planId || input.planId) && reservation.planId !== input.planId)) {
                tx.abort();
                return;
              }
              const sourceRequest = remainders.get(reservation.remainderId);
              sourceRequest.onsuccess = () => {
                const source = sourceRequest.result;
                if (!source || source.status !== "reserved" || source.condition !== "good") {
                  tx.abort();
                  return;
                }
                // Pastikan tidak ada reservasi aktif lain di luar batch ini
                // yang masih mengklaim sumber fisik yang sama.
                const activeRequest = reservations.index("remainderId").getAll(source.id);
                activeRequest.onsuccess = () => {
                  const active = activeRequest.result.filter(item => item.status === "active");
                  if (active.length !== 1 || active[0].id !== reservation.id) {
                    tx.abort();
                    return;
                  }
                  checked.push({ reservation, source });
                  cursor += 1;
                  checkNext();
                };
              };
            };
          };

          // Sisa dari lembar baru wajib menunjuk katalog material dan pekerjaan
          // yang benar-benar ada. Pemeriksaan berada di transaksi yang sama
          // dengan penulisan agar penghapusan katalog tidak dapat berlomba.
          let pendingReferences = newSheetDrafts.length * 2;
          const referencesReady = () => {
            pendingReferences -= 1;
            if (pendingReferences === 0) checkNext();
          };
          if (pendingReferences === 0) {
            checkNext();
          } else {
            newSheetDrafts.forEach(draft => {
              const materialRequest = materials.get(draft.materialId);
              materialRequest.onsuccess = () => {
                const material = materialRequest.result;
                if (!material || material.active === false ||
                    Number(material.thicknessMm) !== Number(draft.thicknessMm) ||
                    material.motif !== draft.motif ||
                    (material.rotationPolicy === "fixed" && draft.rotationAllowed) ||
                    (material.grainRequired === true && draft.rotationAllowed)) {
                  tx.abort();
                  return;
                }
                referencesReady();
              };
              const jobRequest = jobs.get(draft.originJobId);
              jobRequest.onsuccess = () => {
                if (!jobRequest.result) {
                  tx.abort();
                  return;
                }
                referencesReady();
              };
            });
          }
        }
      );
      return { consumedReservations: reservationIds, createdRemainders };
    }

    // Membuat unit sisa dan movement dalam satu transaksi agar tidak ada
    // stok yang tercatat tanpa riwayat (atau sebaliknya).
    async function createRemainder(record) {
      if (!record || typeof record !== "object") {
        throw new Error("Data sisa material wajib disediakan.");
      }
      // Jalur ini hanya untuk pencatatan sisa lembar secara langsung.
      // Sisa turunan inventaris harus dibuat bersama konsumsi reservasi agar
      // sumber, reservasi, status induk, dan movement tercatat atomik.
      if (record.sourceType != null || record.sourceRemainderId != null ||
          record.reservationId != null) {
        throw new Error(
          "Metadata asal-usul sisa turunan harus dibuat melalui consumeReservations()."
        );
      }
      const timestamp = resolveTimestamp(record.createdAt);
      const remainder = {
        ...record,
        id: record.id || makeId("REM"),
        condition: record.condition || "good",
        status: "available",
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1
      };
      const required = ["materialId", "originJobId", "sourceSheetId", "grainDirection", "motif"];
      if (required.some(key => typeof remainder[key] !== "string" || !remainder[key].trim()) ||
          !Number.isFinite(remainder.widthCm) || remainder.widthCm <= 0 ||
          !Number.isFinite(remainder.heightCm) || remainder.heightCm <= 0 ||
          !Number.isFinite(remainder.thicknessMm) || remainder.thicknessMm <= 0 ||
          typeof remainder.rotationAllowed !== "boolean" ||
          !["good", "damaged", "unknown"].includes(remainder.condition)) {
        throw new Error("Data sisa material tidak lengkap atau tidak valid.");
      }
      const database = await db();
      await withTransaction(database, ["materials", "jobs", "remainders", "movements"], "readwrite", tx => {
        const materials = tx.objectStore("materials");
        const jobs = tx.objectStore("jobs");
        const remainders = tx.objectStore("remainders");
        const movements = tx.objectStore("movements");
        const materialRequest = materials.get(remainder.materialId);
        materialRequest.onsuccess = () => {
          const material = materialRequest.result;
          if (!material || material.active === false ||
              Number(material.thicknessMm) !== Number(remainder.thicknessMm) ||
              material.motif !== remainder.motif ||
              (material.rotationPolicy === "fixed" && remainder.rotationAllowed) ||
              (material.grainRequired === true && remainder.rotationAllowed)) {
            tx.abort();
            return;
          }
          const jobRequest = jobs.get(remainder.originJobId);
          jobRequest.onsuccess = () => {
            if (!jobRequest.result) { tx.abort(); return; }
            remainders.add(remainder);
            movements.add({
              id: makeId("MOV"),
              remainderId: remainder.id,
              type: "created",
              jobId: remainder.originJobId,
              timestamp,
              fromStatus: null,
              toStatus: "available",
              referenceId: remainder.sourceSheetId
            });
          };
        };
      });
      return remainder;
    }

    // Mengubah kondisi atau membuang stok beserta riwayatnya secara atomik.
    // Unit yang sedang dipesan/dikonsumsi tidak dapat diubah dari layar pengelolaan.
    async function updateRemainderState(input) {
      if (!input || typeof input.id !== "string" || !input.id.trim()) {
        throw new Error("ID sisa material wajib diisi.");
      }
      const changes = input.changes || {};
      const allowed = {};
      if (changes.condition != null) {
        if (!["good", "damaged", "unknown"].includes(changes.condition)) {
          throw new Error("Kondisi material tidak dikenal.");
        }
        allowed.condition = changes.condition;
      }
      if (changes.status != null) {
        if (changes.status !== "discarded") {
          throw new Error("Perubahan status manual hanya boleh membuang stok.");
        }
        allowed.status = "discarded";
      }
      if (!Object.keys(allowed).length) throw new Error("Tidak ada perubahan status/kondisi.");
      const timestamp = resolveTimestamp(input.timestamp);
      const database = await db();
      let updated;
      await withTransaction(database, ["remainders", "reservations", "movements"], "readwrite", tx => {
        const remainders = tx.objectStore("remainders");
        const reservations = tx.objectStore("reservations");
        const movements = tx.objectStore("movements");
        const request = remainders.get(input.id);
        request.onsuccess = () => {
          const current = request.result;
          if (!current || current.status !== "available") { tx.abort(); return; }
          const activeRequest = reservations.index("remainderId").getAll(current.id);
          activeRequest.onsuccess = () => {
            if (activeRequest.result.some(item => item.status === "active")) {
              tx.abort();
              return;
            }
            updated = {
              ...current,
              ...allowed,
              updatedAt: timestamp,
              version: Number(current.version || 0) + 1
            };
            remainders.put(updated);
            const discarded = allowed.status === "discarded";
            movements.add({
              id: makeId("MOV"),
              remainderId: current.id,
              type: discarded ? "discarded" : "condition_changed",
              jobId: input.jobId || current.originJobId,
              timestamp,
              fromStatus: current.status,
              toStatus: updated.status,
              referenceId: input.referenceId || null
            });
          };
        };
      });
      return updated;
    }

    async function exportJSON() {
      const database = await db();
      const names = BUNDLE_STORES.concat(["meta"]);
      const tx = database.transaction(names, "readwrite");
      const done = transactionDone(tx);
      done.catch(() => {});
      const metaStore = tx.objectStore("meta");
      const exportedAt = new Date().toISOString();
      // Antrekan penulisan sebelum pembacaan agar semua pekerjaan tetap berada
      // dalam transaksi aktif dan snapshot ekspor memuat timestamp terbaru.
      metaStore.put({ key: "lastExportAt", value: exportedAt });
      const requests = BUNDLE_STORES.map(name =>
        requestResult(tx.objectStore(name).getAll())
      );
      const metaRequest = requestResult(metaStore.getAll());
      const values = await Promise.all(requests.concat([metaRequest]));
      await done;
      const bundle = { schemaVersion: 2 };
      BUNDLE_STORES.forEach((name, index) => {
        bundle[name] = { schemaVersion: 2 };
        bundle[name][name] = values[index];
      });
      bundle.exportedAt = exportedAt;
      bundle.meta = values[values.length - 1];
      return bundle;
    }

    async function importJSON(bundle, mode) {
      const importMode = mode || "merge";
      if (!["merge", "replace"].includes(importMode)) {
        throw new Error("Mode impor harus merge atau replace.");
      }
      const validator = opts.validator ||
        (typeof module !== "undefined" && module.exports
          ? require("./inventory-validator.js") : null) ||
        (typeof MaterialInventoryValidator !== "undefined" ? MaterialInventoryValidator : null);
      if (!validator || typeof validator.validateInventoryBundle !== "function") {
        throw new Error("Validator inventaris belum tersedia.");
      }
      const validation = validator.validateInventoryBundle(bundle);
      if (!validation.valid) {
        const error = new Error("Paket inventaris tidak valid; impor dibatalkan.");
        error.validation = validation;
        throw error;
      }

      // Reservasi legacy tanpa planId memperoleh ID snapshot sintetis.
      // Jangan biarkan ID tersebut diam-diam menunjuk snapshot lain yang
      // kebetulan memakai ID sama di dalam paket impor.
      const bundledPlanIds = new Set(
        bundle.plans && Array.isArray(bundle.plans.plans)
          ? bundle.plans.plans.map(plan => plan.id) : []
      );
      const legacyPlanCollisions = bundle.reservations.reservations
        .filter(record => record && record.status === "active" && !record.planId)
        .map(record => "LEGACY-" + record.id)
        .filter(planId => bundledPlanIds.has(planId));
      if (legacyPlanCollisions.length) {
        throw new Error(
          "ID snapshot legacy hasil impor bentrok dengan snapshot dalam paket: " +
          legacyPlanCollisions.join(", ")
        );
      }

      const database = await db();
      const storeNames = BUNDLE_STORES.concat(["meta"]);
      return withTransaction(database, storeNames, "readwrite", tx => {
        const stores = {};
        storeNames.forEach(name => { stores[name] = tx.objectStore(name); });

        if (importMode === "replace") {
          storeNames.forEach(name => stores[name].clear());
        }
        BUNDLE_STORES.forEach(name => {
          const records = bundle[name] && Array.isArray(bundle[name][name])
            ? bundle[name][name] : [];
          records.forEach(record => {
            const importedRecord = name === "reservations" && record.status === "active" && !record.planId
              ? { ...record, planId: "LEGACY-" + record.id }
              : record;
            if (importMode === "merge") {
              stores[name].add(importedRecord);
            } else {
              stores[name].put(importedRecord);
            }
            if (name === "reservations" && importedRecord.status === "active" && importedRecord.planId &&
                importedRecord.planId.indexOf("LEGACY-") === 0 && !bundledPlanIds.has(importedRecord.planId)) {
              const legacyPlan = {
                id: importedRecord.planId, jobId: importedRecord.jobId, plan: null,
                material: null, grainDirection: null, motif: null,
                reservationIds: [importedRecord.id], status: "legacy_recovery",
                legacy: true,
                recoveryNote: "Reservasi impor lama tidak memiliki snapshot rencana pemotongan.",
                createdAt: importedRecord.createdAt, completedAt: null,
                cancelledAt: null, schemaVersion: 1
              };
              // Mode merge tidak boleh menimpa snapshot lokal bila ID sintetis bentrok.
              if (importMode === "merge") stores.plans.add(legacyPlan);
              else stores.plans.put(legacyPlan);
            }
          });
        });

        (bundle.meta || []).forEach(record => stores.meta.put(record));
        stores.meta.put({
          key: "schemaVersion", value: 2, updatedAt: new Date().toISOString()
        });
        stores.meta.put({
          key: "lastImportAt", value: new Date().toISOString(), mode: importMode
        });
      }).then(() => ({
        imported: BUNDLE_STORES.reduce((sum, name) => {
          const records = bundle[name] && Array.isArray(bundle[name][name])
            ? bundle[name][name] : [];
          return sum + records.length;
        }, 0),
        mode: importMode,
        warnings: validation.warnings
      }));
    }

    async function getRecoveryPlans() {
      const plans = await getAll("plans");
      return plans.filter(plan => ["reserved", "legacy_recovery"].includes(plan.status));
    }

    // Membaca snapshot, reservasi terkait, dan sumber dalam satu transaksi readonly.
    async function getPlanRecoveryState(planId) {
      if (typeof planId !== "string" || !planId.trim()) {
        throw new Error("ID snapshot rencana wajib diisi.");
      }
      const database = await db();
      const tx = database.transaction(["plans", "reservations", "remainders"], "readonly");
      const done = transactionDone(tx);
      done.catch(() => {});
      const results = await Promise.all([
        requestResult(tx.objectStore("plans").get(planId)),
        requestResult(tx.objectStore("reservations").index("planId").getAll(planId)),
        requestResult(tx.objectStore("remainders").getAll())
      ]);
      await done;
      return { plan: results[0] || null, reservations: results[1], remainders: results[2] };
    }

    async function getRecoveryReport() {
      const database = await db();
      const tx = database.transaction(["plans", "reservations", "remainders", "jobs", "movements"], "readonly");
      const done = transactionDone(tx);
      done.catch(() => {});
      const results = await Promise.all([
        requestResult(tx.objectStore("plans").getAll()),
        requestResult(tx.objectStore("reservations").getAll()),
        requestResult(tx.objectStore("remainders").getAll()),
        requestResult(tx.objectStore("jobs").getAll()),
        requestResult(tx.objectStore("movements").getAll())
      ]);
      await done;
      const plans = results[0];
      const reservations = results[1];
      const remainders = results[2];
      const jobs = results[3];
      const movements = results[4];
      const jobIds = new Set(jobs.map(item => item.id));
      const plansWithoutJob = plans.filter(item => !jobIds.has(item.jobId));
      const movementHistoryIssues = [];
      const movementByRemainder = new Map();
      const movementRemainderById = new Map(remainders.map(item => [item.id, item]));
      const reservationById = new Map(reservations.map(item => [item.id, item]));
      movements.forEach((movement, index) => {
        if (!movementRemainderById.has(movement.remainderId)) {
          movementHistoryIssues.push({
            severity: "error", type: "missing_remainder",
            remainderId: movement.remainderId || null, movementId: movement.id || null,
            message: "Riwayat pergerakan merujuk sisa material yang tidak ditemukan."
          });
        }
        const list = movementByRemainder.get(movement.remainderId) || [];
        list.push({ ...movement, _sourceIndex: index });
        movementByRemainder.set(movement.remainderId, list);
        if (!Number.isFinite(Date.parse(movement.timestamp || ""))) {
          movementHistoryIssues.push({
            severity: "error", type: "invalid_timestamp",
            remainderId: movement.remainderId || null, movementId: movement.id || null,
            message: "Timestamp riwayat pergerakan tidak valid."
          });
        }
        if (["reserved", "reservation_released", "consumed"].includes(movement.type)) {
          const reservation = reservationById.get(movement.referenceId);
          if (!reservation) {
            movementHistoryIssues.push({
              severity: "error", type: "missing_reservation",
              remainderId: movement.remainderId || null, movementId: movement.id || null,
              message: "Riwayat reservasi merujuk ID reservasi yang tidak ditemukan."
            });
          } else {
            if (reservation.remainderId !== movement.remainderId) {
              movementHistoryIssues.push({
                severity: "error", type: "reservation_source_mismatch",
                remainderId: movement.remainderId || null, movementId: movement.id || null,
                message: "Sisa material pada riwayat tidak cocok dengan reservasi."
              });
            }
            if (reservation.jobId !== movement.jobId) {
              movementHistoryIssues.push({
                severity: "error", type: "reservation_job_mismatch",
                remainderId: movement.remainderId || null, movementId: movement.id || null,
                message: "Pekerjaan pada riwayat tidak cocok dengan reservasi."
              });
            }
            const expectedStatus = movement.type === "reservation_released" ? "released"
              : movement.type === "consumed" ? "consumed" : null;
            if (expectedStatus && reservation.status !== expectedStatus) {
              movementHistoryIssues.push({
                severity: "error", type: "reservation_status_mismatch",
                remainderId: movement.remainderId || null, movementId: movement.id || null,
                message: "Status reservasi tidak cocok dengan jenis movement terminal."
              });
            }
            const expectedTimestamp = movement.type === "reserved" ? reservation.createdAt
              : movement.type === "reservation_released" ? reservation.releasedAt
              : reservation.consumedAt;
            if (!Number.isFinite(Date.parse(expectedTimestamp || ""))) {
              movementHistoryIssues.push({
                severity: "error", type: "reservation_timestamp_invalid",
                remainderId: movement.remainderId || null, movementId: movement.id || null,
                message: "Timestamp siklus hidup reservasi tidak tersedia atau tidak valid."
              });
            } else if (Number.isFinite(Date.parse(movement.timestamp || "")) &&
                Date.parse(movement.timestamp) !== Date.parse(expectedTimestamp)) {
              movementHistoryIssues.push({
                severity: "error", type: "reservation_timestamp_mismatch",
                remainderId: movement.remainderId || null, movementId: movement.id || null,
                message: "Waktu movement tidak cocok dengan waktu siklus hidup reservasi."
              });
            }
          }
        }
      });
      const addMovementIssue = (severity, type, remainderId, message, movementIds) => {
        movementHistoryIssues.push({
          severity, type, remainderId,
          movementIds: (movementIds || []).filter(Boolean),
          message
        });
      };
      remainders.forEach(remainder => {
        const history = movementByRemainder.get(remainder.id) || [];
        if (!history.length) {
          addMovementIssue("warning", "missing_history", remainder.id,
            "Sisa material belum memiliki riwayat pergerakan; mungkin berasal dari data lama.");
          if (["inventory", "new"].includes(remainder.sourceType)) {
            addMovementIssue("error", "missing_origin", remainder.id,
              "Sisa material modern tidak memiliki riwayat pembuatan remainder_created.");
          }
          return;
        }
        const ordered = history
          .filter(item => Number.isFinite(Date.parse(item.timestamp || "")))
          .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a._sourceIndex - b._sourceIndex);
        const originEvents = ordered.filter(item => ["created", "remainder_created"].includes(item.type));
        const terminalEvents = ordered.filter(item => ["consumed", "discarded"].includes(item.type));
        const modernRemainder = ["inventory", "new"].includes(remainder.sourceType);
        const expectedOriginEvents = modernRemainder
          ? ordered.filter(item => item.type === "remainder_created")
          : originEvents;
        if (expectedOriginEvents.length === 0) {
          addMovementIssue(
            modernRemainder ? "error" : "warning",
            "missing_origin",
            remainder.id,
            modernRemainder
              ? "Sisa material modern tidak memiliki movement remainder_created."
              : "Movement awal tidak ditemukan; riwayat mungkin berasal dari data legacy yang belum lengkap."
          );
        }
        if (originEvents.length > 1) {
          addMovementIssue("error", "duplicate_origin", remainder.id,
            "Satu sisa material memiliki lebih dari satu riwayat awal.", originEvents.map(item => item.id));
        }
        if (terminalEvents.length > 1) {
          addMovementIssue("error", "duplicate_terminal", remainder.id,
            "Satu sisa material memiliki lebih dari satu riwayat terminal.", terminalEvents.map(item => item.id));
        }
        for (let i = 1; i < ordered.length; i += 1) {
          const previous = ordered[i - 1], current = ordered[i];
          const previousTime = Date.parse(previous.timestamp), currentTime = Date.parse(current.timestamp);
          if (previousTime === currentTime || previous.type === "imported" || current.type === "imported") continue;
          if (previous.toStatus !== current.fromStatus) {
            addMovementIssue("error", "broken_transition", remainder.id,
              "Urutan riwayat terputus: status tujuan catatan sebelumnya tidak cocok dengan status asal catatan berikutnya.",
              [previous.id, current.id]);
          }
        }
        if (ordered.length) {
          const latestTime = Date.parse(ordered[ordered.length - 1].timestamp);
          const latestAtSameTime = ordered.filter(item => Date.parse(item.timestamp) === latestTime);
          const updatedTime = Number.isFinite(Date.parse(remainder.updatedAt || "")) ? Date.parse(remainder.updatedAt) : null;
          if (updatedTime !== null && latestTime > updatedTime) {
            addMovementIssue("error", "movement_after_update", remainder.id,
              "Riwayat terakhir tercatat setelah waktu pembaruan sisa material.", latestAtSameTime.map(item => item.id));
          } else if (updatedTime !== null && latestTime === updatedTime) {
            const statuses = new Set(latestAtSameTime.map(item => item.toStatus));
            if (statuses.size === 1 && !statuses.has(remainder.status)) {
              addMovementIssue("error", "final_status_mismatch", remainder.id,
                "Status sisa material tidak cocok dengan status riwayat terakhir.", latestAtSameTime.map(item => item.id));
            } else if (statuses.size > 1) {
              addMovementIssue("warning", "ambiguous_latest_timestamp", remainder.id,
                "Beberapa riwayat terakhir memiliki waktu sama dan status tujuan berbeda; urutan akhirnya tidak dapat dipastikan.",
                latestAtSameTime.map(item => item.id));
            }
          } else if (updatedTime !== null && latestTime < updatedTime) {
            addMovementIssue("warning", "history_behind_update", remainder.id,
              "Riwayat terakhir lebih lama daripada pembaruan sisa material; riwayat mungkin tidak lengkap atau berasal dari data lama.",
              [ordered[ordered.length - 1].id]);
          }
        }
      });
      const activeReservations = reservations.filter(item => item.status === "active");
      // Riwayat dari database lama dapat tidak memiliki planId; tampilkan terpisah
      // termasuk reservasi terminal, yang bukan reservasi aktif yatim dan tidak diubah.
      const legacyReservationsWithoutPlan = reservations.filter(item => !item.planId);
      const activeByRemainder = new Map();
      activeReservations.forEach(item => {
        const list = activeByRemainder.get(item.remainderId) || [];
        list.push(item);
        activeByRemainder.set(item.remainderId, list);
      });
      const planById = new Map(plans.map(item => [item.id, item]));
      const activePlans = plans.filter(item => ["reserved", "legacy_recovery"].includes(item.status));
      const orphanedReservations = activeReservations.filter(item => {
        const plan = item.planId && planById.get(item.planId);
        return !plan || !Array.isArray(plan.reservationIds) || !plan.reservationIds.includes(item.id);
      });
      const orphanedRemainders = remainders.filter(item =>
        item.status === "reserved" && !activeByRemainder.has(item.id)
      );
      const multiplyReservedRemainders = Array.from(activeByRemainder.entries())
        .filter(([, items]) => items.length > 1)
        .map(([remainderId, items]) => ({ remainderId, reservationIds: items.map(item => item.id) }));
      const reservationsWithoutSource = activeReservations.filter(item =>
        !remainders.some(remainder => remainder.id === item.remainderId)
      );

      // Periksa seluruh siklus hidup, bukan hanya rencana yang masih aktif.
      // Reservasi harus mengikuti status akhir rencana yang menaunginya.
      const expectedReservationStatus = {
        reserved: "active",
        legacy_recovery: "active",
        cancelled: "released",
        completed: "consumed"
      };
      const remainderById = new Map(remainders.map(item => [item.id, item]));
      // Audit rantai asal-usul sisa di database lokal, termasuk data yang
      // mungkin masuk melalui pemulihan lama atau penulisan di luar jalur aman.
      const remainderLineageIssues = [];
      const lineageState = new Map();
      const visitRemainderLineage = remainderId => {
        const state = lineageState.get(remainderId) || 0;
        if (state === 2) return;
        if (state === 1) {
          remainderLineageIssues.push({
            severity: "error", type: "cyclic_lineage", remainderId,
            message: "Rantai asal-usul sisa material mengandung siklus."
          });
          return;
        }
        lineageState.set(remainderId, 1);
        const current = remainderById.get(remainderId);
        if (current && current.sourceType === "inventory") {
          const sourceId = current.sourceRemainderId;
          const source = remainderById.get(sourceId);
          if (typeof sourceId !== "string" || !source) {
            remainderLineageIssues.push({
              severity: "error", type: "missing_source", remainderId,
              sourceRemainderId: sourceId || null,
              message: "Sisa turunan merujuk sisa material sumber yang tidak ditemukan."
            });
          } else if (source.id === current.id) {
            remainderLineageIssues.push({
              severity: "error", type: "self_source", remainderId,
              sourceRemainderId: sourceId,
              message: "Sisa material tidak boleh menjadi sumber bagi dirinya sendiri."
            });
          } else {
            if (source.status !== "consumed") {
              remainderLineageIssues.push({
                severity: "error", type: "source_not_consumed", remainderId,
                sourceRemainderId: sourceId,
                message: "Sumber sisa turunan harus berstatus consumed."
              });
            }
            const sourceReservation = reservationById.get(current.reservationId);
            if (!sourceReservation) {
              remainderLineageIssues.push({
                severity: "error", type: "missing_reservation", remainderId,
                reservationId: current.reservationId || null,
                sourceRemainderId: sourceId,
                message: "Sisa turunan merujuk reservasi sumber yang tidak ditemukan."
              });
            } else {
              if (sourceReservation.remainderId !== sourceId) {
                remainderLineageIssues.push({
                  severity: "error", type: "reservation_source_mismatch", remainderId,
                  reservationId: sourceReservation.id, sourceRemainderId: sourceId,
                  message: "Reservasi asal sisa turunan tidak merujuk sisa material induknya."
                });
              }
              if (sourceReservation.status !== "consumed") {
                remainderLineageIssues.push({
                  severity: "error", type: "reservation_status_mismatch", remainderId,
                  reservationId: sourceReservation.id,
                  message: "Reservasi asal sisa turunan harus berstatus consumed."
                });
              }
              if (sourceReservation.jobId !== current.originJobId) {
                remainderLineageIssues.push({
                  severity: "error", type: "reservation_job_mismatch", remainderId,
                  reservationId: sourceReservation.id,
                  message: "Pekerjaan reservasi sumber tidak cocok dengan pekerjaan asal sisa turunan."
                });
              }
              if (!Number.isFinite(Date.parse(sourceReservation.consumedAt || ""))) {
                remainderLineageIssues.push({
                  severity: "error", type: "reservation_timestamp_invalid", remainderId,
                  reservationId: sourceReservation.id,
                  message: "Waktu konsumsi reservasi sumber tidak tersedia atau tidak valid."
                });
              } else if (Number.isFinite(Date.parse(current.createdAt || "")) &&
                  Date.parse(current.createdAt) < Date.parse(sourceReservation.consumedAt)) {
                remainderLineageIssues.push({
                  severity: "error", type: "child_created_before_consumption", remainderId,
                  reservationId: sourceReservation.id,
                  message: "Sisa turunan tercatat dibuat sebelum reservasi sumber dikonsumsi."
                });
              }
            }
            if (current.materialId !== source.materialId ||
                current.thicknessMm !== source.thicknessMm ||
                current.grainDirection !== source.grainDirection ||
                current.motif !== source.motif ||
                current.rotationAllowed !== source.rotationAllowed) {
              remainderLineageIssues.push({
                severity: "error", type: "source_attributes_mismatch", remainderId,
                sourceRemainderId: sourceId,
                message: "Identitas atau karakteristik material sisa turunan tidak cocok dengan sumbernya."
              });
            }
            visitRemainderLineage(sourceId);
          }
        }
        lineageState.set(remainderId, 2);
      };
      remainders.forEach(item => {
        if (item && typeof item.id === "string") visitRemainderLineage(item.id);
      });

      const reservationsByPlan = new Map();
      reservations.forEach(item => {
        if (!item.planId) return;
        const linked = reservationsByPlan.get(item.planId) || [];
        linked.push(item);
        reservationsByPlan.set(item.planId, linked);
      });
      const planHasMatchingSources = (plan, linked) => {
        // Snapshot legacy tidak menyimpan inventoryUsage; tautannya tetap
        // diperiksa melalui reservationIds dan status/jobId di bawah.
        if (!plan.plan) return plan.status === "legacy_recovery" || plan.legacy === true;
        if (!Array.isArray(plan.plan.inventoryUsage)) return false;
        const expectedSources = plan.plan.inventoryUsage.map(item => item && item.remainderId);
        const actualSources = linked.map(item => item.remainderId);
        if (expectedSources.some(id => typeof id !== "string" || !id.trim()) ||
            new Set(expectedSources).size !== expectedSources.length ||
            new Set(actualSources).size !== actualSources.length) return false;
        return JSON.stringify(expectedSources.slice().sort()) ===
          JSON.stringify(actualSources.slice().sort());
      };
      const reservationHasConsistentSource = item => {
        if (item.status !== "active") return true;
        const source = remainderById.get(item.remainderId);
        return !!source && source.status === "reserved";
      };
      const inconsistentReservations = reservations.filter(item => {
        if (!item.planId) return false; // Reservasi legacy tanpa tautan ditangani terpisah.
        const plan = planById.get(item.planId);
        if (!plan) return true; // Semua reservasi bertaut harus memiliki rencana induk.
        const expectedStatus = expectedReservationStatus[plan.status];
        if (!expectedStatus || item.status !== expectedStatus || item.jobId !== plan.jobId) return true;
        const linked = reservationsByPlan.get(plan.id) || [];
        return !planHasMatchingSources(plan, linked) || !reservationHasConsistentSource(item);
      });
      const inconsistentPlans = plans.filter(plan => {
        const expectedStatus = expectedReservationStatus[plan.status];
        const expected = Array.isArray(plan.reservationIds) ? plan.reservationIds.slice().sort() : [];
        const linked = reservationsByPlan.get(plan.id) || [];
        const actual = linked.map(item => item.id).sort();
        if (!expectedStatus || !jobIds.has(plan.jobId) ||
            JSON.stringify(expected) !== JSON.stringify(actual) ||
            !planHasMatchingSources(plan, linked)) return true;
        return linked.some(item => item.status !== expectedStatus ||
          item.jobId !== plan.jobId || !reservationHasConsistentSource(item));
      });
      return {
        activePlans,
        activeReservations,
        plansWithoutJob,
        legacyReservationsWithoutPlan,
        orphanedReservations,
        orphanedRemainders,
        multiplyReservedRemainders,
        reservationsWithoutSource,
        inconsistentPlans,
        inconsistentReservations,
        remainderLineageIssues,
        movementHistoryIssues
      };
    }

    async function updatePlanStatus(input) {
      if (!input || typeof input.planId !== "string" || !input.planId.trim() ||
          !["cancelled", "completed"].includes(input.status)) {
        throw new Error("planId dan status akhir rencana wajib valid.");
      }
      const timestamp = resolveTimestamp(input.timestamp);
      const database = await db();
      let updated = null;
      await withTransaction(database, ["plans", "reservations"], "readwrite", tx => {
        const plans = tx.objectStore("plans");
        const reservations = tx.objectStore("reservations");
        const request = plans.get(input.planId);
        request.onsuccess = () => {
          const current = request.result;
          if (!current || current.status !== "reserved") { tx.abort(); return; }

          // Perubahan status langsung hanya aman untuk rencana tanpa stok.
          // Rencana yang memakai inventaris harus diselesaikan melalui
          // releaseReservations() atau consumeReservations() agar stok,
          // reservasi, movement, dan status rencana berubah atomik.
          const reservationRequest = reservations.index("planId").getAll(input.planId);
          reservationRequest.onsuccess = () => {
            const linkedReservations = reservationRequest.result || [];
            const usage = current.plan && current.plan.inventoryUsage;
            if (linkedReservations.some(item => item.status === "active") ||
                (Array.isArray(current.reservationIds) && current.reservationIds.length > 0) ||
                (Array.isArray(usage) && usage.length > 0)) {
              tx.abort();
              return;
            }
            updated = {
              ...current, status: input.status,
              cancelledAt: input.status === "cancelled" ? timestamp : current.cancelledAt || null,
              completedAt: input.status === "completed" ? timestamp : current.completedAt || null
            };
            plans.put(updated);
          };
        };
      });
      return updated;
    }

    async function close() {
      if (!dbPromise) return;
      const database = await dbPromise;
      database.close();
      dbPromise = null;
    }

    return {
      open: db,
      close,
      get,
      getAll,
      getByIndex,
      add,
      put,
      update,
      remove,
      clear,
      reserveRemainder,
      reserveRemainders,
      releaseReservation,
      releaseReservations,
      consumeReservation,
      consumeReservations,
      getRecoveryPlans,
      getPlanRecoveryState,
      getRecoveryReport,
      updatePlanStatus,
      createRemainder,
      updateRemainderState,
      exportJSON,
      importJSON
    };
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORE_NAMES: STORE_NAMES.slice(),
    createStorage,
    openDatabase,
    makeId
  };
});
