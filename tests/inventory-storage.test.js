const assert = require("node:assert/strict");
const {
  DB_NAME, STORE_NAMES, createStorage
} = require("../assets/js/inventory-storage.js");

if (!globalThis.indexedDB) {
  throw new Error(
    "Node.js ini belum menyediakan IndexedDB global. Gunakan Node.js 22.5 atau lebih baru, " +
    "atau jalankan pengujian browser setelah menyiapkan IndexedDB."
  );
}

const now = "2026-11-18T12:00:00.000Z";

function test(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    console.log("LULUS:", name);
  });
}

function bundle(suffix) {
  const materialId = "MAT-" + suffix;
  const jobId = "JOB-" + suffix;
  const remainderId = "REM-" + suffix;
  return {
    schemaVersion: 1,
    materials: {
      schemaVersion: 1,
      materials: [{
        id: materialId, name: "Keramik uji", category: "keramik",
        thicknessMm: 8, surface: "glossy", grainRequired: false,
        motif: "plain", rotationPolicy: "free", active: true
      }]
    },
    jobs: {
      schemaVersion: 1,
      jobs: [{
        id: jobId, name: "Pekerjaan " + suffix, status: "open",
        createdAt: now, closedAt: null
      }]
    },
    remainders: {
      schemaVersion: 1,
      remainders: [{
        id: remainderId, materialId, widthCm: 45, heightCm: 32,
        thicknessMm: 8, grainDirection: "none", motif: "plain",
        rotationAllowed: true, condition: "good", status: "available",
        originJobId: jobId, sourceSheetId: "SHEET-" + suffix,
        createdAt: now, updatedAt: now, version: 1
      }]
    },
    reservations: { schemaVersion: 1, reservations: [] },
    movements: { schemaVersion: 1, movements: [] }
  };
}

function deleteDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Penghapusan database uji terhalang."));
  });
}

async function main() {
  await deleteDatabase();
  const storage = createStorage();

  await test("database dibuat dengan enam object store", async () => {
    const db = await storage.open();
    assert.equal(db.name, DB_NAME);
    assert.deepEqual(
      Array.from(db.objectStoreNames).sort(),
      STORE_NAMES.slice().sort()
    );
    assert.equal(db.version, 1);
    const tx = db.transaction(["remainders", "reservations", "movements"], "readonly");
    assert.ok(tx.objectStore("remainders").indexNames.contains("status"));
    assert.ok(tx.objectStore("remainders").indexNames.contains("materialId"));
    assert.ok(tx.objectStore("remainders").indexNames.contains("originJobId"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("remainderId"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("jobId"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("status"));
    assert.ok(tx.objectStore("movements").indexNames.contains("timestamp"));
  });

  await test("CRUD menambah, membaca, memperbarui, dan menghapus record", async () => {
    const item = { id: "CRUD-1", name: "Record uji" };
    await storage.add("materials", item);
    assert.deepEqual(await storage.get("materials", item.id), item);
    await storage.put("materials", { ...item, name: "Diperbarui" });
    assert.equal((await storage.get("materials", item.id)).name, "Diperbarui");
    assert.equal(await storage.remove("materials", item.id), true);
    assert.equal(await storage.get("materials", item.id), null);
  });

  await test("CRUD mendukung meta dengan key sebagai primary key", async () => {
    await storage.put("meta", { key: "test-key", value: "aktif" });
    assert.deepEqual(await storage.get("meta", "test-key"), {
      key: "test-key", value: "aktif"
    });
    await storage.remove("meta", "test-key");
    assert.equal(await storage.get("meta", "test-key"), null);
  });

  await test("impor replace dan ekspor JSON mempertahankan lima paket data", async () => {
    const data = bundle("A");
    const result = await storage.importJSON(data, "replace");
    assert.equal(result.imported, 3);
    const exported = await storage.exportJSON();
    for (const name of ["materials", "jobs", "remainders", "reservations", "movements"]) {
      assert.equal(exported[name].schemaVersion, 1);
      assert.deepEqual(exported[name][name], data[name][name]);
    }
    assert.ok(Array.isArray(exported.meta));
    assert.ok(exported.exportedAt);
  });

  await test("index dapat mencari sisa berdasarkan material dan status", async () => {
    const data = await storage.getByIndex("remainders", "materialId", "MAT-A");
    assert.equal(data.length, 1);
    assert.equal(data[0].status, "available");
  });

  await test("reservasi atomik mengubah status, membuat reservasi dan movement", async () => {
    const result = await storage.reserveRemainder({
      remainderId: "REM-A", jobId: "JOB-A", timestamp: now
    });
    assert.equal(result.remainderId, "REM-A");
    assert.equal((await storage.get("remainders", "REM-A")).status, "reserved");
    const reservations = await storage.getByIndex("reservations", "remainderId", "REM-A");
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].status, "active");
    const movements = await storage.getByIndex("movements", "remainderId", "REM-A");
    assert.equal(movements.length, 1);
    assert.equal(movements[0].type, "reserved");
  });

  await test("satu sisa tidak dapat dipesan dua pekerjaan secara bersamaan", async () => {
    const attempts = await Promise.allSettled([
      storage.reserveRemainder({ remainderId: "REM-A", jobId: "JOB-A" }),
      storage.reserveRemainder({ remainderId: "REM-A", jobId: "JOB-B" })
    ]);
    const fulfilled = attempts.filter(item => item.status === "fulfilled");
    const rejected = attempts.filter(item => item.status === "rejected");
    assert.equal(fulfilled.length, 0);
    assert.equal(rejected.length, 2);
    const active = (await storage.getByIndex("reservations", "remainderId", "REM-A"))
      .filter(item => item.status === "active");
    assert.equal(active.length, 1);
  });

  await test("reservasi dapat dilepas dan stok kembali tersedia", async () => {
    const active = (await storage.getAll("reservations"))
      .find(item => item.remainderId === "REM-A" && item.status === "active");
    await storage.releaseReservation(active.id, { timestamp: now });
    assert.equal((await storage.get("remainders", "REM-A")).status, "available");
    assert.equal((await storage.get("reservations", active.id)).status, "released");
    const movements = await storage.getByIndex("movements", "remainderId", "REM-A");
    assert.ok(movements.some(item => item.type === "reservation_released"));
  });

  await test("sisa rusak atau tidak tersedia ditolak saat reservasi", async () => {
    const data = bundle("B");
    data.remainders.remainders[0].condition = "damaged";
    await storage.importJSON(data, "merge");
    await assert.rejects(
      storage.reserveRemainder({ remainderId: "REM-B", jobId: "JOB-B" })
    );
    assert.equal((await storage.get("remainders", "REM-B")).status, "available");
  });

  await test("impor merge dengan ID bentrok dibatalkan tanpa menyisipkan sebagian data", async () => {
    const conflict = bundle("C");
    conflict.materials.materials[0].id = "MAT-A";
    await assert.rejects(storage.importJSON(conflict, "merge"));
    assert.equal(await storage.get("jobs", "JOB-C"), null);
    assert.equal(await storage.get("remainders", "REM-C"), null);
  });

  await test("impor paket tidak valid ditolak sebelum transaksi", async () => {
    const invalid = bundle("D");
    invalid.remainders.remainders[0].widthCm = 0;
    await assert.rejects(storage.importJSON(invalid, "replace"), /tidak valid/);
    assert.notEqual(await storage.get("remainders", "REM-A"), null);
  });

  await test("ID fallback menghasilkan identitas yang berbeda", async () => {
    const { makeId } = require("../assets/js/inventory-storage.js");
    const first = makeId("TEST");
    const second = makeId("TEST");
    assert.notEqual(first, second);
  });

  await storage.close();
  console.log("Semua pengujian storage inventaris selesai.");
  await deleteDatabase();
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
