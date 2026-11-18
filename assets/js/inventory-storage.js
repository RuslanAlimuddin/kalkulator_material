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
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
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
      done.then(() => resolve(result)).catch(reject);
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

    async function exportJSON() {
      const database = await db();
      const names = BUNDLE_STORES.concat(["meta"]);
      const tx = database.transaction(names, "readonly");
      const done = transactionDone(tx);
      const requests = BUNDLE_STORES.map(name =>
        requestResult(tx.objectStore(name).getAll())
      );
      const metaRequest = requestResult(tx.objectStore("meta").getAll());
      const values = await Promise.all(requests.concat([metaRequest]));
      await done;
      const bundle = { schemaVersion: 1 };
      BUNDLE_STORES.forEach((name, index) => {
        bundle[name] = { schemaVersion: 1 };
        bundle[name][name] = values[index];
      });
      bundle.exportedAt = new Date().toISOString();
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
      remove,
      clear,
      reserveRemainder,
      releaseReservation,
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
