const assert = require("node:assert/strict");
// Node.js tidak menyediakan IndexedDB global; fake-indexeddb menyiapkan
// implementasi in-memory untuk menguji API IndexedDB tanpa browser.
require("fake-indexeddb/auto");

const {
  DB_NAME, STORE_NAMES, createStorage
} = require("../assets/js/inventory-storage.js");

if (!globalThis.indexedDB) {
  throw new Error("fake-indexeddb gagal menyiapkan IndexedDB untuk pengujian.");
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
  const storage = createStorage({ allowUnsafeInventoryWrites: true });

  await test("database versi 2 dibuat dengan tujuh object store", async () => {
    const db = await storage.open();
    assert.equal(db.name, DB_NAME);
    assert.deepEqual(
      Array.from(db.objectStoreNames).sort(),
      STORE_NAMES.slice().sort()
    );
    assert.equal(db.version, 2);
    assert.equal((await storage.get("meta", "schemaVersion")).value, 2);
    const tx = db.transaction(["remainders", "reservations", "movements", "plans"], "readonly");
    assert.ok(tx.objectStore("remainders").indexNames.contains("status"));
    assert.ok(tx.objectStore("remainders").indexNames.contains("materialId"));
    assert.ok(tx.objectStore("remainders").indexNames.contains("originJobId"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("remainderId"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("jobId"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("status"));
    assert.ok(tx.objectStore("reservations").indexNames.contains("planId"));
    assert.ok(tx.objectStore("movements").indexNames.contains("timestamp"));
    assert.ok(tx.objectStore("plans").indexNames.contains("jobId"));
    assert.ok(tx.objectStore("plans").indexNames.contains("status"));
  });

  await test("CRUD menambah, membaca, memperbarui, dan menghapus record", async () => {
    const item = { id: "CRUD-1", name: "Record uji" };
    await storage.add("materials", item);
    assert.deepEqual(await storage.get("materials", item.id), item);
    await storage.put("materials", { ...item, name: "Diperbarui" });
    assert.equal((await storage.get("materials", item.id)).name, "Diperbarui");
    await storage.update("materials", item.id, { name: "Diubah melalui update" });
    assert.equal((await storage.get("materials", item.id)).name, "Diubah melalui update");
    assert.equal(await storage.remove("materials", item.id), true);
    assert.equal(await storage.get("materials", item.id), null);
  });

  await test("CRUD umum tidak boleh melewati transaksi bisnis inventaris", async () => {
    const guarded = createStorage();
    await assert.rejects(
      guarded.add("remainders", { id: "BYPASS-ADD" }),
      /Penulisan langsung ke remainders dibatasi/
    );
    await assert.rejects(
      guarded.put("reservations", { id: "BYPASS-PUT" }),
      /Penulisan langsung ke reservations dibatasi/
    );
    await assert.rejects(
      guarded.update("remainders", "REM-A", { status: "consumed" }),
      /Penulisan langsung ke remainders dibatasi/
    );
    await assert.rejects(
      guarded.remove("movements", "MOV-A"),
      /Penulisan langsung ke movements dibatasi/
    );
    await assert.rejects(
      guarded.clear("plans"),
      /Penulisan langsung ke plans dibatasi/
    );
    // Katalog dan pekerjaan tetap dapat dikelola melalui CRUD umum.
    await guarded.add("materials", {
      id: "GUARDED-MAT", name: "Material", category: "uji",
      thicknessMm: 8, grainRequired: false, motif: "plain",
      rotationPolicy: "free", active: true
    });
    assert.ok(await guarded.get("materials", "GUARDED-MAT"));
    await guarded.close();
  });

  await test("CRUD mendukung meta dengan key sebagai primary key", async () => {
    await storage.put("meta", { key: "test-key", value: "aktif" });
    assert.deepEqual(await storage.get("meta", "test-key"), {
      key: "test-key", value: "aktif"
    });
    await storage.remove("meta", "test-key");
    assert.equal(await storage.get("meta", "test-key"), null);
  });

  await test("impor versi 1 dan ekspor versi 2 mempertahankan paket data", async () => {
    const data = bundle("A");
    const result = await storage.importJSON(data, "replace");
    assert.equal(result.imported, 3);
    const exported = await storage.exportJSON();
    for (const name of ["materials", "jobs", "remainders", "reservations", "movements", "plans"]) {
      assert.equal(exported[name].schemaVersion, 2);
      const expected = data[name] ? data[name][name] : [];
      assert.deepEqual(exported[name][name], expected);
    }
    assert.ok(Array.isArray(exported.meta));
    assert.ok(exported.exportedAt);
    assert.ok(exported.meta.some(item => item.key === "lastExportAt"));
  });


  await test("perubahan ketebalan material ditolak jika sisa inventaris masih terhubung", async () => {
    await assert.rejects(storage.update("materials", "MAT-A", { thicknessMm: 10 }));
    const material = await storage.get("materials", "MAT-A");
    await assert.rejects(storage.put("materials", { ...material, thicknessMm: 10 }));
    assert.equal((await storage.get("materials", "MAT-A")).thicknessMm, 8);
    assert.equal((await storage.get("remainders", "REM-A")).thicknessMm, 8);
  });

  await test("penghapusan material dan pekerjaan ditolak jika masih dirujuk inventaris/riwayat", async () => {
    await assert.rejects(storage.remove("materials", "MAT-A"));
    await assert.rejects(storage.remove("jobs", "JOB-A"));
    await assert.rejects(storage.clear("materials"));
    await assert.rejects(storage.clear("jobs"));
    assert.ok(await storage.get("materials", "MAT-A"));
    assert.ok(await storage.get("jobs", "JOB-A"));
    assert.ok(await storage.get("remainders", "REM-A"));
  });

  await test("reservasi menolak pekerjaan yang tidak terdaftar tanpa mengubah stok", async () => {
    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-A", jobId: "JOB-TIDAK-ADA"
    }));
    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-A"], jobId: "JOB-TIDAK-ADA"
    }));
    assert.equal((await storage.get("remainders", "REM-A")).status, "available");
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-A"))
        .filter(item => item.status === "active").length,
      0
    );
  });

  await test("impor cadangan lama dengan reservasi aktif membentuk snapshot pemulihan", async () => {
    const legacy = bundle("LEGACY-ACTIVE");
    legacy.remainders.remainders[0].status = "reserved";
    legacy.reservations.reservations.push({
      id: "RSV-LEGACY-ACTIVE",
      remainderId: "REM-LEGACY-ACTIVE",
      jobId: "JOB-LEGACY-ACTIVE",
      status: "active",
      createdAt: now,
      releasedAt: null,
      consumedAt: null
    });
    await storage.importJSON(legacy, "merge");
    const reservation = await storage.get("reservations", "RSV-LEGACY-ACTIVE");
    assert.equal(reservation.planId, "LEGACY-RSV-LEGACY-ACTIVE");
    const plan = await storage.get("plans", reservation.planId);
    assert.equal(plan.status, "legacy_recovery");
    assert.equal(plan.legacy, true);
    assert.deepEqual(plan.reservationIds, ["RSV-LEGACY-ACTIVE"]);
    const exported = await storage.exportJSON();
    const exportedReservation = exported.reservations.reservations
      .find(item => item.id === "RSV-LEGACY-ACTIVE");
    assert.equal(exportedReservation.planId, reservation.planId);
  });

  await test("impor merge legacy tidak menimpa snapshot lokal saat ID pemulihan bentrok", async () => {
    const localPlan = {
      id: "LEGACY-RSV-LEGACY-COLLISION",
      jobId: "JOB-LOCAL",
      status: "completed",
      legacy: false,
      reservationIds: [],
      createdAt: now,
      completedAt: now,
      cancelledAt: null,
      schemaVersion: 1
    };
    await storage.add("plans", localPlan);

    const legacy = bundle("LEGACY-COLLISION");
    legacy.remainders.remainders[0].status = "reserved";
    legacy.reservations.reservations.push({
      id: "RSV-LEGACY-COLLISION",
      remainderId: "REM-LEGACY-COLLISION",
      jobId: "JOB-LEGACY-COLLISION",
      status: "active",
      createdAt: now,
      releasedAt: null,
      consumedAt: null
    });

    await assert.rejects(storage.importJSON(legacy, "merge"));
    assert.deepEqual(await storage.get("plans", localPlan.id), localPlan);
    assert.equal(await storage.get("materials", "MAT-LEGACY-COLLISION"), null);
    assert.equal(await storage.get("jobs", "JOB-LEGACY-COLLISION"), null);
    assert.equal(await storage.get("remainders", "REM-LEGACY-COLLISION"), null);
    assert.equal(await storage.get("reservations", "RSV-LEGACY-COLLISION"), null);
  });

  await test("index yang tidak ditemukan ditolak tanpa rejection transaksi tak tertangani", async () => {
    await assert.rejects(
      storage.getByIndex("remainders", "index-tidak-ada", "nilai"),
      /Index tidak ditemukan/
    );
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

  await test("reservasi massal mengunci semua unit dalam satu transaksi", async () => {
    await storage.importJSON(bundle("BATCH-1"), "merge");
    await storage.importJSON(bundle("BATCH-2"), "merge");
    const results = await storage.reserveRemainders({
      remainderIds: ["REM-BATCH-1", "REM-BATCH-2"],
      jobId: "JOB-A",
      timestamp: now
    });
    assert.equal(results.length, 2);
    assert.deepEqual(
      results.map(item => item.remainderId),
      ["REM-BATCH-1", "REM-BATCH-2"]
    );
    for (const id of ["REM-BATCH-1", "REM-BATCH-2"]) {
      assert.equal((await storage.get("remainders", id)).status, "reserved");
      const reservations = await storage.getByIndex("reservations", "remainderId", id);
      assert.equal(reservations.filter(item => item.status === "active").length, 1);
      const movements = await storage.getByIndex("movements", "remainderId", id);
      assert.equal(movements.filter(item => item.type === "reserved").length, 1);
    }
  });

  await test("reservasi massal gagal seluruhnya jika satu unit tidak layak", async () => {
    await storage.importJSON(bundle("BATCH-ROLLBACK-1"), "merge");
    await storage.importJSON(bundle("BATCH-ROLLBACK-2"), "merge");
    await storage.update("remainders", "REM-BATCH-ROLLBACK-2", {
      condition: "damaged"
    });

    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-BATCH-ROLLBACK-1", "REM-BATCH-ROLLBACK-2"],
      jobId: "JOB-A",
      timestamp: now
    }));

    assert.equal(
      (await storage.get("remainders", "REM-BATCH-ROLLBACK-1")).status,
      "available"
    );
    assert.equal(
      (await storage.get("remainders", "REM-BATCH-ROLLBACK-2")).status,
      "available"
    );
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-BATCH-ROLLBACK-1"))
        .filter(item => item.status === "active").length,
      0
    );
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-BATCH-ROLLBACK-1"))
        .filter(item => item.type === "reserved").length,
      0
    );
  });

  await test("reservasi massal menolak ID kosong atau duplikat sebelum transaksi", async () => {
    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-A", "REM-A"], jobId: "JOB-A"
    }), /unik/);
    await assert.rejects(storage.reserveRemainders({
      remainderIds: [""], jobId: "JOB-A"
    }), /valid/);
  });

  await test("dua pekerjaan yang bersaing hanya dapat memperoleh satu reservasi", async () => {
    await storage.importJSON(bundle("RACE"), "merge");
    const attempts = await Promise.allSettled([
      storage.reserveRemainder({ remainderId: "REM-RACE", jobId: "JOB-RACE" }),
      storage.reserveRemainder({ remainderId: "REM-RACE", jobId: "JOB-A" })
    ]);
    const fulfilled = attempts.filter(item => item.status === "fulfilled");
    const rejected = attempts.filter(item => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal((await storage.get("remainders", "REM-RACE")).status, "reserved");
    const active = (await storage.getByIndex("reservations", "remainderId", "REM-RACE"))
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


  await test("meta impor yang rusak ditolak tanpa menghapus data lokal", async () => {
    const invalid = bundle("META-INVALID");
    invalid.meta = { key: "schemaVersion", value: 2 };
    await assert.rejects(storage.importJSON(invalid, "replace"), /tidak valid/);
    assert.notEqual(await storage.get("remainders", "REM-A"), null);
    assert.equal(await storage.get("materials", "MAT-META-INVALID"), null);
  });


  await test("kegagalan penulisan di tengah impor replace membatalkan seluruh transaksi", async () => {
    const invalidAtStorage = bundle("CLONE-FAIL");
    // Fungsi lolos dari pemeriksaan bentuk record, tetapi tidak dapat disimpan
    // oleh structured clone IndexedDB. Ini mensimulasikan kegagalan saat transaksi.
    invalidAtStorage.materials.materials[0].unsupportedValue = function () {};
    await assert.rejects(storage.importJSON(invalidAtStorage, "replace"));
    assert.notEqual(await storage.get("remainders", "REM-A"), null);
    assert.equal(await storage.get("materials", "MAT-CLONE-FAIL"), null);
    assert.equal(await storage.get("jobs", "JOB-CLONE-FAIL"), null);
  });

  await test("impor replace menolak ID movement ganda tanpa menghapus data lokal", async () => {
    const invalid = bundle("DUP-MOVEMENT");
    invalid.movements.movements.push(
      {
        id: "MOV-DUPLICATE", remainderId: "REM-DUP-MOVEMENT",
        type: "created", timestamp: now, fromStatus: null, toStatus: "available"
      },
      {
        id: "MOV-DUPLICATE", remainderId: "REM-DUP-MOVEMENT",
        type: "created", timestamp: now, fromStatus: null, toStatus: "available"
      }
    );
    await assert.rejects(storage.importJSON(invalid, "replace"), /tidak valid/);
    assert.notEqual(await storage.get("remainders", "REM-A"), null);
    assert.equal(await storage.get("materials", "MAT-DUP-MOVEMENT"), null);
  });

  await test("ID fallback menghasilkan identitas yang berbeda", async () => {
    const { makeId } = require("../assets/js/inventory-storage.js");
    const first = makeId("TEST");
    const second = makeId("TEST");
    assert.notEqual(first, second);
  });

  await test("sisa lembar baru menolak material atau pekerjaan yang tidak terdaftar", async () => {
    const base = {
      materialId: "MAT-A", originJobId: "JOB-A", sourceSheetId: "SHEET-NEW-VALIDATION",
      widthCm: 20, heightCm: 15, thicknessMm: 8,
      grainDirection: "none", motif: "plain", rotationAllowed: true
    };
    console.log("DEBUG sisa baru: mulai cek pekerjaan hilang");
    await assert.rejects(storage.consumeReservations({
      reservations: [], newSheetRemainders: [{ ...base, id: "REM-NEW-MISSING-JOB", originJobId: "JOB-MISSING" }]
    }));
    console.log("DEBUG sisa baru: pekerjaan hilang ditolak");
    await assert.rejects(storage.consumeReservations({
      reservations: [], newSheetRemainders: [{ ...base, id: "REM-NEW-MISSING-MATERIAL", materialId: "MAT-MISSING" }]
    }));
    console.log("DEBUG sisa baru: material hilang ditolak");
    await assert.rejects(storage.consumeReservations({
      reservations: [], newSheetRemainders: [{ ...base, id: "REM-NEW-WRONG-THICKNESS", thicknessMm: 10 }]
    }));
    console.log("DEBUG sisa baru: ketebalan salah ditolak");
    assert.equal(await storage.get("remainders", "REM-NEW-MISSING-JOB"), null);
    assert.equal(await storage.get("remainders", "REM-NEW-MISSING-MATERIAL"), null);
    assert.equal(await storage.get("remainders", "REM-NEW-WRONG-THICKNESS"), null);
  });

  await test("sisa lembar baru yang referensinya valid dapat disimpan", async () => {
    const result = await storage.consumeReservations({
      reservations: [],
      newSheetRemainders: [{
        id: "REM-NEW-VALID", materialId: "MAT-A", originJobId: "JOB-A",
        sourceSheetId: "SHEET-NEW-VALID", widthCm: 20, heightCm: 15,
        thicknessMm: 8, grainDirection: "none", motif: "plain",
        rotationAllowed: true
      }]
    });
    assert.equal(result.createdRemainders.length, 1);
    assert.equal((await storage.get("remainders", "REM-NEW-VALID")).status, "available");
  });

  await storage.close();
  console.log("Semua pengujian storage inventaris selesai.");
  await deleteDatabase();
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
