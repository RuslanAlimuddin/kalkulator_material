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
  const DB_VERSION = 1;
  const STORE_NAMES = [
    "materials", "jobs", "remainders", "reservations", "movements", "meta"
  ];
  const BUNDLE_STORES = ["materials", "jobs", "remainders", "reservations", "movements"];
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
        let metaStore;
        if (!db.objectStoreNames.contains("meta")) {
          metaStore = db.createObjectStore("meta", { keyPath: "key" });
        } else {
          metaStore = request.transaction.objectStore("meta");
        }
        if (event.oldVersion < 1) {
          metaStore.put({ key: "schemaVersion", value: 1, updatedAt: new Date().toISOString() });
        }
        // event.oldVersion tersedia untuk migrasi mendatang.
        void event.oldVersion;
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
      const value = await requestResult(tx.objectStore(storeName).get(id));
      await done;
      return value === undefined ? null : value;
    }

    async function getAll(storeName) {
      ensureStore(storeName);
      const database = await db();
      const tx = database.transaction([storeName], "readonly");
      const done = transactionDone(tx);
      const values = await requestResult(tx.objectStore(storeName).getAll());
      await done;
      return values;
    }

    async function getByIndex(storeName, indexName, value) {
      ensureStore(storeName);
      const database = await db();
      const tx = database.transaction([storeName], "readonly");
      const done = transactionDone(tx);
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
      const key = storeName === "meta" ? record && record.key : record && record.id;
      if (!record || typeof record !== "object" || key == null || key === "") {
        throw new Error("Record harus memiliki " + (storeName === "meta" ? "key." : "id."));
      }
      const database = await db();
      return withTransaction(database, [storeName], "readwrite", tx =>
        requestResult(tx.objectStore(storeName).put(record))
      );
    }

    async function update(storeName, id, changes) {
      ensureStore(storeName);
      if (storeName === "meta") {
        throw new Error("Gunakan put() untuk memperbarui meta berdasarkan key.");
      }
      if (!id || !changes || typeof changes !== "object" || Array.isArray(changes)) {
        throw new Error("ID dan objek perubahan wajib diisi.");
      }
      const database = await db();
      return withTransaction(database, [storeName], "readwrite", tx => {
        const store = tx.objectStore(storeName);
        const request = store.get(id);
        request.onsuccess = () => {
          if (!request.result) {
            tx.abort();
            return;
          }
          store.put({ ...request.result, ...changes, id });
        };
        return id;
      });
    }

    async function remove(storeName, id) {
      ensureStore(storeName);
      const database = await db();
      return withTransaction(database, [storeName], "readwrite", tx =>
        requestResult(tx.objectStore(storeName).delete(id))
      ).then(() => true);
    }

    async function clear(storeName) {
      ensureStore(storeName);
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
      const timestamp = input.timestamp || new Date().toISOString();
      const reservationId = input.id || makeId("RSV");
      const movementId = makeId("MOV");

      return withTransaction(
        database, ["remainders", "reservations", "movements"], "readwrite",
        tx => {
          const remainders = tx.objectStore("remainders");
          const reservations = tx.objectStore("reservations");
          const movements = tx.objectStore("movements");
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
          return { reservationId, movementId };
        }
      ).then(() => ({ id: reservationId, remainderId: input.remainderId, jobId: input.jobId }));
    }

    async function reserveRemainders(input) {
      if (!input || !input.jobId || !Array.isArray(input.remainderIds) ||
          input.remainderIds.length === 0) {
        throw new Error("jobId dan daftar remainderIds wajib diisi untuk reservasi massal.");
      }
      const remainderIds = input.remainderIds.slice();
      if (remainderIds.some(id => typeof id !== "string" || !id.trim()) ||
          new Set(remainderIds).size !== remainderIds.length) {
        throw new Error("Daftar remainderIds harus berisi ID unik yang valid.");
      }

      const timestamp = input.timestamp || new Date().toISOString();
      const reservationsOut = remainderIds.map(remainderId => ({
        id: makeId("RSV"),
        movementId: makeId("MOV"),
        remainderId,
        jobId: input.jobId
      }));
      const database = await db();

      await withTransaction(
        database, ["remainders", "reservations", "movements"], "readwrite",
        tx => {
          const remainders = tx.objectStore("remainders");
          const reservations = tx.objectStore("reservations");
          const movements = tx.objectStore("movements");
          const checked = [];
          let cursor = 0;

          // Semua pemeriksaan dan penulisan dilakukan dalam satu transaksi.
          // Jika satu unit gagal, tx.abort() membatalkan seluruh reservasi.
          const checkNext = () => {
            if (cursor >= remainderIds.length) {
              reservationsOut.forEach((item, index) => {
                const remainder = checked[index];
                remainders.put({
                  ...remainder,
                  status: "reserved",
                  updatedAt: timestamp,
                  version: Number(remainder.version || 0) + 1
                });
                reservations.add({
                  id: item.id,
                  remainderId: item.remainderId,
                  jobId: item.jobId,
                  status: "active",
                  createdAt: timestamp,
                  releasedAt: null,
                  consumedAt: null
                });
                movements.add({
                  id: item.movementId,
                  remainderId: item.remainderId,
                  type: "reserved",
                  jobId: item.jobId,
                  timestamp,
                  fromStatus: "available",
                  toStatus: "reserved",
                  referenceId: item.id
                });
              });
              return;
            }

            const remainderId = remainderIds[cursor];
            const remainderRequest = remainders.get(remainderId);
            remainderRequest.onsuccess = () => {
              const remainder = remainderRequest.result;
              if (!remainder || remainder.status !== "available" ||
                  remainder.condition !== "good") {
                tx.abort();
                return;
              }

              const activeRequest = reservations.index("remainderId").getAll(remainderId);
              activeRequest.onsuccess = () => {
                if (activeRequest.result.some(item => item.status === "active")) {
                  tx.abort();
                  return;
                }
                checked.push(remainder);
                cursor += 1;
                checkNext();
              };
            };
          };

          checkNext();
        }
      );

      return reservationsOut.map(item => ({
        id: item.id,
        remainderId: item.remainderId,
        jobId: item.jobId
      }));
    }

    async function releaseReservation(reservationId, optionsForRelease) {
      const releaseOptions = optionsForRelease || {};
      const database = await db();
      const timestamp = releaseOptions.timestamp || new Date().toISOString();

      return withTransaction(
        database, ["remainders", "reservations", "movements"], "readwrite",
        tx => {
          const reservations = tx.objectStore("reservations");
          const remainders = tx.objectStore("remainders");
          const movements = tx.objectStore("movements");
          const reservationRequest = reservations.get(reservationId);

          reservationRequest.onsuccess = () => {
            const reservation = reservationRequest.result;
            if (!reservation || reservation.status !== "active") {
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
      const timestamp = input.timestamp || new Date().toISOString();
      const database = await db();

      await withTransaction(
        database, ["remainders", "reservations", "movements"], "readwrite",
        tx => {
          const reservations = tx.objectStore("reservations");
          const remainders = tx.objectStore("remainders");
          const movements = tx.objectStore("movements");
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
                reservations.put({
                  ...reservation,
                  status: "released",
                  releasedAt: timestamp
                });
                remainders.put({
                  ...remainder,
                  status: "available",
                  updatedAt: timestamp,
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
                  referenceId: reservation.id
                });
              });
              return;
            }

            const reservationRequest = reservations.get(reservationIds[cursor]);
            reservationRequest.onsuccess = () => {
              const reservation = reservationRequest.result;
              if (!reservation || reservation.status !== "active") {
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
                checked.push({ reservation, remainder });
                cursor += 1;
                checkNext();
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
      const timestamp = input.timestamp || new Date().toISOString();
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
          if (!reservation || reservation.status !== "active") { tx.abort(); return; }
          const sr = rs.get(reservation.remainderId);
          sr.onsuccess = () => {
            const source = sr.result;
            if (!source || source.status !== "reserved" || source.condition !== "good") { tx.abort(); return; }
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
      const timestamp = input.timestamp || new Date().toISOString();
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
        database, ["remainders", "reservations", "movements"], "readwrite",
        tx => {
          const remainders = tx.objectStore("remainders");
          const reservations = tx.objectStore("reservations");
          const movements = tx.objectStore("movements");
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
                sourceSheetId: draft.sourceSheetId,
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
              if (!reservation || reservation.status !== "active") {
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
                checked.push({ reservation, source });
                cursor += 1;
                checkNext();
              };
            };
          };
          checkNext();
        }
      );
      return { consumedReservations: reservationIds, createdRemainders };
    }

    async function exportJSON() {
      const database = await db();
      const names = BUNDLE_STORES.concat(["meta"]);
      const tx = database.transaction(names, "readwrite");
      const done = transactionDone(tx);
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
      const bundle = { schemaVersion: 1 };
      BUNDLE_STORES.forEach((name, index) => {
        bundle[name] = { schemaVersion: 1 };
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

      const database = await db();
      const storeNames = BUNDLE_STORES.concat(["meta"]);
      return withTransaction(database, storeNames, "readwrite", tx => {
        const stores = {};
        storeNames.forEach(name => { stores[name] = tx.objectStore(name); });

        if (importMode === "replace") {
          storeNames.forEach(name => stores[name].clear());
        }

        BUNDLE_STORES.forEach(name => {
          const records = bundle[name][name];
          records.forEach(record => {
            if (importMode === "merge") {
              // add() sengaja menolak ID bentrok agar tidak ada penimpaan diam-diam.
              stores[name].add(record);
            } else {
              stores[name].put(record);
            }
          });
        });

        (bundle.meta || []).forEach(record => stores.meta.put(record));
        stores.meta.put({
          key: "schemaVersion", value: 1, updatedAt: new Date().toISOString()
        });
        stores.meta.put({
          key: "lastImportAt", value: new Date().toISOString(), mode: importMode
        });
      }).then(() => ({
        imported: BUNDLE_STORES.reduce((sum, name) => sum + bundle[name][name].length, 0),
        mode: importMode,
        warnings: validation.warnings
      }));
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
