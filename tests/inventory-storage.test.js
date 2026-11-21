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

  await test("perubahan motif dan kebijakan material ditolak jika tidak cocok dengan sisa inventaris", async () => {
    const original = await storage.get("materials", "MAT-A");

    await assert.rejects(storage.update("materials", "MAT-A", {
      motif: "motif-baru"
    }));
    await assert.rejects(storage.put("materials", {
      ...original, motif: "motif-baru"
    }));
    await assert.rejects(storage.update("materials", "MAT-A", {
      rotationPolicy: "fixed"
    }));
    await assert.rejects(storage.put("materials", {
      ...original, grainRequired: true
    }));

    assert.deepEqual(await storage.get("materials", "MAT-A"), original);
    assert.equal((await storage.get("remainders", "REM-A")).motif, original.motif);
    assert.equal((await storage.get("remainders", "REM-A")).rotationAllowed, true);
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

  await test("reservasi hanya menerima pekerjaan open dan pekerjaan dengan reservasi aktif tidak dapat ditutup", async () => {
    const single = bundle("JOB-CLOSED-RESERVE-SINGLE");
    await storage.importJSON(single, "merge");
    await storage.update("jobs", "JOB-JOB-CLOSED-RESERVE-SINGLE", {
      status: "completed", closedAt: now
    });
    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-JOB-CLOSED-RESERVE-SINGLE",
      jobId: "JOB-JOB-CLOSED-RESERVE-SINGLE",
      timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-JOB-CLOSED-RESERVE-SINGLE")).status, "available");
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-JOB-CLOSED-RESERVE-SINGLE")).length,
      0
    );

    const bulk = bundle("JOB-CLOSED-RESERVE-BULK");
    await storage.importJSON(bulk, "merge");
    await storage.update("jobs", "JOB-JOB-CLOSED-RESERVE-BULK", {
      status: "archived", closedAt: now
    });
    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-JOB-CLOSED-RESERVE-BULK"],
      jobId: "JOB-JOB-CLOSED-RESERVE-BULK",
      timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-JOB-CLOSED-RESERVE-BULK")).status, "available");
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-JOB-CLOSED-RESERVE-BULK")).length,
      0
    );

    await storage.importJSON(bundle("JOB-ACTIVE-RESERVATION-CLOSE"), "merge");
    const active = await storage.reserveRemainder({
      remainderId: "REM-JOB-ACTIVE-RESERVATION-CLOSE",
      jobId: "JOB-JOB-ACTIVE-RESERVATION-CLOSE",
      timestamp: now
    });
    const originalJob = await storage.get("jobs", "JOB-JOB-ACTIVE-RESERVATION-CLOSE");
    const closedJob = { ...originalJob, status: "completed", closedAt: now };
    await assert.rejects(storage.update("jobs", originalJob.id, {
      status: "completed", closedAt: now
    }));
    await assert.rejects(storage.put("jobs", closedJob));
    assert.deepEqual(await storage.get("jobs", originalJob.id), originalJob);
    assert.equal((await storage.get("reservations", active.id)).status, "active");
    assert.equal((await storage.get("remainders", "REM-JOB-ACTIVE-RESERVATION-CLOSE")).status, "reserved");
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

  await test("sisa yang sudah dikonsumsi tidak dapat direservasi, dilepas, atau dikonsumsi ulang", async () => {
    await storage.importJSON(bundle("LIFECYCLE"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-LIFECYCLE", jobId: "JOB-LIFECYCLE", timestamp: now
    });
    await storage.consumeReservation({
      reservationId: reservation.id,
      timestamp: now,
      remainders: [{ widthCm: 20, heightCm: 10 }]
    });

    const source = await storage.get("remainders", "REM-LIFECYCLE");
    assert.equal(source.status, "consumed");
    const remainderCount = (await storage.getAll("remainders")).length;

    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-LIFECYCLE", jobId: "JOB-LIFECYCLE", timestamp: now
    }));
    await assert.rejects(storage.releaseReservation(reservation.id, { timestamp: now }));
    await assert.rejects(storage.consumeReservation({
      reservationId: reservation.id,
      timestamp: now,
      remainders: [{ widthCm: 8, heightCm: 6 }]
    }));

    assert.equal((await storage.get("remainders", "REM-LIFECYCLE")).status, "consumed");
    assert.equal((await storage.get("reservations", reservation.id)).status, "consumed");
    assert.equal((await storage.getAll("remainders")).length, remainderCount);
  });

  await test("pelepasan tunggal menolak sumber dengan reservasi aktif ganda", async () => {
    await storage.importJSON(bundle("RELEASE-DUP-SINGLE"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-RELEASE-DUP-SINGLE", jobId: "JOB-RELEASE-DUP-SINGLE", timestamp: now
    });
    await storage.put("reservations", {
      ...await storage.get("reservations", reservation.id),
      id: "RSV-RELEASE-DUP-SINGLE-SECOND"
    });

    await assert.rejects(storage.releaseReservation(reservation.id, { timestamp: now }));
    assert.equal((await storage.get("remainders", "REM-RELEASE-DUP-SINGLE")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    assert.equal((await storage.get("reservations", "RSV-RELEASE-DUP-SINGLE-SECOND")).status, "active");
  });

  await test("pelepasan massal menolak sumber dengan reservasi aktif di luar batch dan rollback", async () => {
    await storage.importJSON(bundle("RELEASE-DUP-BULK"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-RELEASE-DUP-BULK", jobId: "JOB-RELEASE-DUP-BULK", timestamp: now
    });
    await storage.put("reservations", {
      ...await storage.get("reservations", reservation.id),
      id: "RSV-RELEASE-DUP-BULK-SECOND"
    });

    await assert.rejects(storage.releaseReservations({
      reservationIds: [reservation.id], timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-RELEASE-DUP-BULK")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    assert.equal((await storage.get("reservations", "RSV-RELEASE-DUP-BULK-SECOND")).status, "active");
  });

  await test("pelepasan rencana menolak jobId reservasi yang berbeda dari snapshot", async () => {
    await storage.importJSON(bundle("RELEASE-PLAN-JOB-MISMATCH"), "merge");
    const reserved = await storage.reserveRemainders({
      remainderIds: ["REM-RELEASE-PLAN-JOB-MISMATCH"],
      jobId: "JOB-RELEASE-PLAN-JOB-MISMATCH",
      planId: "PLAN-RELEASE-PLAN-JOB-MISMATCH",
      planSnapshot: {
        plan: { inventoryUsage: [{ remainderId: "REM-RELEASE-PLAN-JOB-MISMATCH" }] }
      },
      timestamp: now
    });
    await storage.put("reservations", {
      ...await storage.get("reservations", reserved[0].id),
      jobId: "JOB-OTHER-RELEASE-PLAN-JOB-MISMATCH"
    });

    await assert.rejects(storage.releaseReservations({
      planId: "PLAN-RELEASE-PLAN-JOB-MISMATCH",
      reservationIds: [reserved[0].id],
      timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-RELEASE-PLAN-JOB-MISMATCH")).status, "reserved");
    assert.equal((await storage.get("reservations", reserved[0].id)).status, "active");
    assert.equal((await storage.get("plans", "PLAN-RELEASE-PLAN-JOB-MISMATCH")).status, "reserved");
  });

  await test("pelepasan rencana menolak inventoryUsage duplikat yang menggantikan sumber lain", async () => {
    const data = bundle("RELEASE-PLAN-DUP-USAGE");
    data.remainders.remainders.push({
      ...data.remainders.remainders[0],
      id: "REM-RELEASE-PLAN-DUP-USAGE-SECOND",
      sourceSheetId: "SHEET-RELEASE-PLAN-DUP-USAGE-SECOND"
    });
    await storage.importJSON(data, "merge");
    const reserved = await storage.reserveRemainders({
      remainderIds: [
        "REM-RELEASE-PLAN-DUP-USAGE",
        "REM-RELEASE-PLAN-DUP-USAGE-SECOND"
      ],
      jobId: "JOB-RELEASE-PLAN-DUP-USAGE",
      planId: "PLAN-RELEASE-PLAN-DUP-USAGE",
      planSnapshot: {
        plan: {
          inventoryUsage: [
            { remainderId: "REM-RELEASE-PLAN-DUP-USAGE" },
            { remainderId: "REM-RELEASE-PLAN-DUP-USAGE-SECOND" }
          ]
        }
      },
      timestamp: now
    });
    await storage.put("plans", {
      ...await storage.get("plans", "PLAN-RELEASE-PLAN-DUP-USAGE"),
      plan: {
        inventoryUsage: [
          { remainderId: "REM-RELEASE-PLAN-DUP-USAGE" },
          { remainderId: "REM-RELEASE-PLAN-DUP-USAGE" }
        ]
      }
    });

    await assert.rejects(storage.releaseReservations({
      planId: "PLAN-RELEASE-PLAN-DUP-USAGE",
      reservationIds: reserved.map(item => item.id),
      timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-RELEASE-PLAN-DUP-USAGE")).status, "reserved");
    assert.equal((await storage.get("remainders", "REM-RELEASE-PLAN-DUP-USAGE-SECOND")).status, "reserved");
    for (const item of reserved) {
      assert.equal((await storage.get("reservations", item.id)).status, "active");
    }
    assert.equal((await storage.get("plans", "PLAN-RELEASE-PLAN-DUP-USAGE")).status, "reserved");
  });

  await test("konsumsi rencana menolak jobId reservasi yang berbeda dari snapshot", async () => {
    await storage.importJSON(bundle("PLAN-JOB-MISMATCH"), "merge");
    const reserved = await storage.reserveRemainders({
      remainderIds: ["REM-PLAN-JOB-MISMATCH"],
      jobId: "JOB-PLAN-JOB-MISMATCH",
      planId: "PLAN-JOB-MISMATCH",
      planSnapshot: {
        plan: { inventoryUsage: [{ remainderId: "REM-PLAN-JOB-MISMATCH" }], usableRemainders: [] }
      },
      timestamp: now
    });
    await storage.put("reservations", {
      ...await storage.get("reservations", reserved[0].id),
      jobId: "JOB-OTHER-PLAN-JOB-MISMATCH"
    });

    await assert.rejects(storage.consumeReservations({
      planId: "PLAN-JOB-MISMATCH",
      reservations: [{ reservationId: reserved[0].id, remainders: [] }],
      newSheetRemainders: [],
      timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-PLAN-JOB-MISMATCH")).status, "reserved");
    assert.equal((await storage.get("reservations", reserved[0].id)).status, "active");
    assert.equal((await storage.get("plans", "PLAN-JOB-MISMATCH")).status, "reserved");
  });

  await test("konsumsi tunggal menolak sumber dengan reservasi aktif ganda dan menjaga stok", async () => {
    await storage.importJSON(bundle("CONSUME-DUP-SINGLE"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-CONSUME-DUP-SINGLE", jobId: "JOB-CONSUME-DUP-SINGLE", timestamp: now
    });
    await storage.put("reservations", {
      ...await storage.get("reservations", reservation.id),
      id: "RSV-CONSUME-DUP-SINGLE-SECOND"
    });

    await assert.rejects(storage.consumeReservation({
      reservationId: reservation.id, timestamp: now,
      remainders: [{ widthCm: 20, heightCm: 10 }]
    }));
    assert.equal((await storage.get("remainders", "REM-CONSUME-DUP-SINGLE")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    assert.equal((await storage.get("reservations", "RSV-CONSUME-DUP-SINGLE-SECOND")).status, "active");
    assert.equal(await storage.get("remainders", "REM-CONSUME-DUP-SINGLE-SECOND"), null);
    await storage.remove("reservations", "RSV-CONSUME-DUP-SINGLE-SECOND");
    await storage.consumeReservation({
      reservationId: reservation.id, timestamp: now,
      remainders: [{ widthCm: 20, heightCm: 10 }]
    });
    assert.equal((await storage.get("remainders", "REM-CONSUME-DUP-SINGLE")).status, "consumed");
  });

  await test("konsumsi massal menolak sumber dengan reservasi aktif di luar batch dan rollback", async () => {
    await storage.importJSON(bundle("CONSUME-DUP-BULK"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-CONSUME-DUP-BULK", jobId: "JOB-CONSUME-DUP-BULK", timestamp: now
    });
    await storage.put("reservations", {
      ...await storage.get("reservations", reservation.id),
      id: "RSV-CONSUME-DUP-BULK-SECOND"
    });

    await assert.rejects(storage.consumeReservations({
      reservations: [{
        reservationId: reservation.id,
        remainders: [{ widthCm: 20, heightCm: 10 }]
      }],
      newSheetRemainders: [],
      timestamp: now
    }));
    assert.equal((await storage.get("remainders", "REM-CONSUME-DUP-BULK")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    assert.equal((await storage.get("reservations", "RSV-CONSUME-DUP-BULK-SECOND")).status, "active");
    assert.equal(await storage.get("remainders", "REM-CONSUME-DUP-BULK-SECOND"), null);
    assert.equal((await storage.getByIndex("movements", "remainderId", "REM-CONSUME-DUP-BULK"))
      .some(item => item.type === "consumed"), false);
    await storage.remove("reservations", "RSV-CONSUME-DUP-BULK-SECOND");
    await storage.consumeReservations({
      reservations: [{
        reservationId: reservation.id,
        remainders: [{ widthCm: 20, heightCm: 10 }]
      }],
      newSheetRemainders: [],
      timestamp: now
    });
    assert.equal((await storage.get("remainders", "REM-CONSUME-DUP-BULK")).status, "consumed");
  });

  await test("sisa dengan reservasi aktif tidak dapat dibuang meskipun status stok tidak konsisten", async () => {
    await storage.importJSON(bundle("ACTIVE-DISCARD"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-ACTIVE-DISCARD", jobId: "JOB-ACTIVE-DISCARD", timestamp: now
    });

    // Simulasikan data tidak konsisten dari penulisan langsung yang tidak aman.
    await storage.update("remainders", "REM-ACTIVE-DISCARD", { status: "available" });
    await assert.rejects(storage.updateRemainderState({
      id: "REM-ACTIVE-DISCARD",
      changes: { status: "discarded" },
      timestamp: now
    }));

    assert.equal((await storage.get("remainders", "REM-ACTIVE-DISCARD")).status, "available");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    const movements = await storage.getByIndex("movements", "remainderId", "REM-ACTIVE-DISCARD");
    assert.equal(movements.some(item => item.type === "discarded"), false);
  });

  await test("sisa yang dibuang tidak dapat direservasi secara tunggal maupun massal", async () => {
    await storage.importJSON(bundle("DISCARD"), "merge");
    await storage.updateRemainderState({
      id: "REM-DISCARD", changes: { status: "discarded" }, timestamp: now
    });

    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-DISCARD", jobId: "JOB-DISCARD", timestamp: now
    }));
    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-DISCARD"], jobId: "JOB-DISCARD", timestamp: now
    }));

    assert.equal((await storage.get("remainders", "REM-DISCARD")).status, "discarded");
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-DISCARD"))
        .filter(item => item.status === "active").length,
      0
    );
  });

  await test("pencatatan sisa langsung menolak metadata asal-usul turunan", async () => {
    await storage.importJSON(bundle("SOURCE-GUARD"), "merge");
    const base = {
      materialId: "MAT-SOURCE-GUARD", originJobId: "JOB-SOURCE-GUARD",
      sourceSheetId: "SHEET-SOURCE-GUARD", widthCm: 20, heightCm: 15,
      thicknessMm: 8, grainDirection: "none", motif: "plain",
      rotationAllowed: true
    };

    await assert.rejects(storage.createRemainder({
      ...base, id: "REM-CONFLICT-INVENTORY", sourceType: "inventory",
      sourceRemainderId: "REM-SOURCE-GUARD", reservationId: "RSV-WRONG"
    }), /Metadata asal-usul/);
    await assert.rejects(storage.createRemainder({
      ...base, id: "REM-CONFLICT-NEW", sourceType: "new"
    }), /Metadata asal-usul/);

    assert.equal(await storage.get("remainders", "REM-CONFLICT-INVENTORY"), null);
    assert.equal(await storage.get("remainders", "REM-CONFLICT-NEW"), null);
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


  await test("cadangan yang kehilangan satu kelompok data wajib ditolak tanpa menyentuh data lokal", async () => {
    const incomplete = bundle("MISSING-COLLECTION");
    delete incomplete.materials;
    await assert.rejects(storage.importJSON(incomplete, "replace"), /tidak valid/);
    assert.notEqual(await storage.get("remainders", "REM-A"), null);
    assert.equal(await storage.get("materials", "MAT-MISSING-COLLECTION"), null);
  });

  await test("cadangan dengan referensi material atau pekerjaan yang hilang ditolak", async () => {
    const missingMaterial = bundle("MISSING-MATERIAL-REF");
    missingMaterial.materials.materials = [];
    await assert.rejects(storage.importJSON(missingMaterial, "replace"), /tidak valid/);

    const missingJob = bundle("MISSING-JOB-REF");
    missingJob.jobs.jobs = [];
    await assert.rejects(storage.importJSON(missingJob, "replace"), /tidak valid/);

    assert.notEqual(await storage.get("remainders", "REM-A"), null);
    assert.equal(await storage.get("materials", "MAT-MISSING-MATERIAL-REF"), null);
    assert.equal(await storage.get("jobs", "JOB-MISSING-JOB-REF"), null);
  });

  await test("riwayat reservasi legacy yang tidak lengkap diberi peringatan tetapi tetap dapat dipulihkan", async () => {
    const Validator = require("../assets/js/inventory-validator.js");
    const legacy = bundle("MISSING-MOVEMENT");
    legacy.remainders.remainders[0].status = "reserved";
    legacy.reservations.reservations.push({
      id: "RSV-MISSING-MOVEMENT",
      remainderId: "REM-MISSING-MOVEMENT",
      jobId: "JOB-MISSING-MOVEMENT",
      status: "active",
      createdAt: now,
      releasedAt: null,
      consumedAt: null
    });
    const validation = Validator.validateInventoryBundle(legacy);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    assert.ok(validation.warnings.some(item =>
      item.path === "reservations.reservations[0]" &&
      item.message.includes("movement reserved")
    ));
    await storage.importJSON(legacy, "merge");
    const imported = await storage.get("reservations", "RSV-MISSING-MOVEMENT");
    assert.equal(imported.planId, "LEGACY-RSV-MISSING-MOVEMENT");
    assert.equal((await storage.get("plans", imported.planId)).status, "legacy_recovery");
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

  await test("impor legacy menolak benturan ID snapshot sintetis sebelum mengubah database", async () => {
    const collision = bundle("LEGACY-PLAN-COLLISION");
    const reservationId = "RSV-LEGACY-PLAN-COLLISION";
    const syntheticPlanId = "LEGACY-" + reservationId;
    collision.remainders.remainders[0].status = "reserved";
    collision.reservations.reservations.push({
      id: reservationId,
      remainderId: collision.remainders.remainders[0].id,
      jobId: collision.jobs.jobs[0].id,
      status: "active",
      createdAt: now,
      releasedAt: null,
      consumedAt: null
    });
    collision.plans = {
      schemaVersion: 1,
      plans: [{
        id: syntheticPlanId,
        jobId: collision.jobs.jobs[0].id,
        plan: null,
        reservationIds: [],
        status: "legacy_recovery",
        legacy: true,
        createdAt: now,
        completedAt: null,
        cancelledAt: null,
        schemaVersion: 1
      }]
    };

    await assert.rejects(
      storage.importJSON(collision, "replace"),
      /bentrok dengan snapshot dalam paket/
    );
    assert.notEqual(await storage.get("remainders", "REM-A"), null);
    assert.equal(await storage.get("remainders", collision.remainders.remainders[0].id), null);
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
    await assert.rejects(storage.consumeReservations({
      reservations: [], newSheetRemainders: [{ ...base, id: "REM-NEW-MISSING-JOB", originJobId: "JOB-MISSING" }]
    }));
    await assert.rejects(storage.consumeReservations({
      reservations: [], newSheetRemainders: [{ ...base, id: "REM-NEW-MISSING-MATERIAL", materialId: "MAT-MISSING" }]
    }));
    await assert.rejects(storage.consumeReservations({
      reservations: [], newSheetRemainders: [{ ...base, id: "REM-NEW-WRONG-THICKNESS", thicknessMm: 10 }]
    }));
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

  await test("reservasi menolak timestamp tidak valid tanpa mengubah stok atau membuat riwayat", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-RESERVE"), "merge");

    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-INVALID-RESERVE",
      jobId: "JOB-TIMESTAMP-INVALID-RESERVE",
      timestamp: "bukan-tanggal"
    }));

    assert.equal(
      (await storage.get("remainders", "REM-TIMESTAMP-INVALID-RESERVE")).status,
      "available"
    );
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-TIMESTAMP-INVALID-RESERVE")).length,
      0
    );
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-TIMESTAMP-INVALID-RESERVE")).length,
      0
    );
  });

  await test("reservasi menolak timestamp kosong tanpa mengubah stok atau membuat riwayat", async () => {
    await storage.importJSON(bundle("TIMESTAMP-EMPTY-RESERVE"), "merge");

    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-EMPTY-RESERVE",
      jobId: "JOB-TIMESTAMP-EMPTY-RESERVE",
      timestamp: ""
    }));

    assert.equal((await storage.get("remainders", "REM-TIMESTAMP-EMPTY-RESERVE")).status, "available");
    assert.equal((await storage.getByIndex("reservations", "remainderId", "REM-TIMESTAMP-EMPTY-RESERVE")).length, 0);
    assert.equal((await storage.getByIndex("movements", "remainderId", "REM-TIMESTAMP-EMPTY-RESERVE")).length, 0);
  });

  await test("reservasi massal menolak timestamp tidak valid tanpa mengunci sebagian stok", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-BULK-1"), "merge");
    await storage.importJSON(bundle("TIMESTAMP-INVALID-BULK-2"), "merge");

    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-TIMESTAMP-INVALID-BULK-1", "REM-TIMESTAMP-INVALID-BULK-2"],
      jobId: "JOB-TIMESTAMP-INVALID-BULK-1",
      timestamp: "bukan-tanggal"
    }));

    for (const id of ["REM-TIMESTAMP-INVALID-BULK-1", "REM-TIMESTAMP-INVALID-BULK-2"]) {
      assert.equal((await storage.get("remainders", id)).status, "available");
      assert.equal((await storage.getByIndex("reservations", "remainderId", id)).length, 0);
      assert.equal((await storage.getByIndex("movements", "remainderId", id)).length, 0);
    }
  });

  await test("reservasi massal menolak snapshot inventoryUsage yang tidak cocok dengan sumber yang dikunci", async () => {
    await storage.importJSON(bundle("RESERVE-SNAPSHOT-SOURCE-MISMATCH"), "merge");

    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-RESERVE-SNAPSHOT-SOURCE-MISMATCH"],
      jobId: "JOB-RESERVE-SNAPSHOT-SOURCE-MISMATCH",
      planId: "PLAN-WITHOUT-SNAPSHOT",
      timestamp: now
    }));

    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-RESERVE-SNAPSHOT-SOURCE-MISMATCH"],
      jobId: "JOB-RESERVE-SNAPSHOT-SOURCE-MISMATCH",
      timestamp: now,
      planSnapshot: {
        plan: {
          inventoryUsage: [
            { remainderId: "REM-SUMBER-LAIN-RESERVE-SNAPSHOT" }
          ]
        }
      }
    }));

    assert.equal(
      (await storage.get("remainders", "REM-RESERVE-SNAPSHOT-SOURCE-MISMATCH")).status,
      "available"
    );
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-RESERVE-SNAPSHOT-SOURCE-MISMATCH")).length,
      0
    );
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-RESERVE-SNAPSHOT-SOURCE-MISMATCH")).length,
      0
    );
    assert.equal(
      (await storage.getAll("plans")).some(item => item.id === "PLAN-RESERVE-SNAPSHOT-SOURCE-MISMATCH"),
      false
    );
  });

  await test("reservasi massal menolak createdAt snapshot kosong tanpa mengunci stok", async () => {
    await storage.importJSON(bundle("EMPTY-SNAPSHOT-TIMESTAMP"), "merge");

    await assert.rejects(storage.reserveRemainders({
      remainderIds: ["REM-EMPTY-SNAPSHOT-TIMESTAMP"],
      jobId: "JOB-EMPTY-SNAPSHOT-TIMESTAMP",
      timestamp: now,
      planSnapshot: {
        createdAt: "",
        plan: { inventoryUsage: [] }
      }
    }));

    assert.equal((await storage.get("remainders", "REM-EMPTY-SNAPSHOT-TIMESTAMP")).status, "available");
    assert.equal((await storage.getByIndex("reservations", "remainderId", "REM-EMPTY-SNAPSHOT-TIMESTAMP")).length, 0);
    assert.equal((await storage.getAll("plans")).some(item => item.jobId === "JOB-EMPTY-SNAPSHOT-TIMESTAMP"), false);
  });

  await test("pelepasan tunggal menolak timestamp tidak valid tanpa melepas reservasi", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-RELEASE"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-INVALID-RELEASE",
      jobId: "JOB-TIMESTAMP-INVALID-RELEASE",
      timestamp: now
    });

    await assert.rejects(storage.releaseReservation(reservation.id, { timestamp: "bukan-tanggal" }));
    assert.equal((await storage.get("remainders", "REM-TIMESTAMP-INVALID-RELEASE")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-TIMESTAMP-INVALID-RELEASE"))
        .some(item => item.type === "reservation_released"),
      false
    );
  });

  await test("pelepasan massal menolak timestamp tidak valid tanpa melepas reservasi", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-RELEASE-BULK"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-INVALID-RELEASE-BULK",
      jobId: "JOB-TIMESTAMP-INVALID-RELEASE-BULK",
      timestamp: now
    });

    await assert.rejects(storage.releaseReservations({
      reservationIds: [reservation.id], timestamp: "bukan-tanggal"
    }));
    assert.equal((await storage.get("remainders", "REM-TIMESTAMP-INVALID-RELEASE-BULK")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
  });

  await test("konsumsi tunggal menolak timestamp tidak valid tanpa mengonsumsi stok", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-CONSUME"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-INVALID-CONSUME",
      jobId: "JOB-TIMESTAMP-INVALID-CONSUME",
      timestamp: now
    });

    await assert.rejects(storage.consumeReservation({
      reservationId: reservation.id, remainders: [], timestamp: "bukan-tanggal"
    }));
    assert.equal((await storage.get("remainders", "REM-TIMESTAMP-INVALID-CONSUME")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
    assert.equal((await storage.getAll("remainders")).some(item =>
      item.sourceRemainderId === "REM-TIMESTAMP-INVALID-CONSUME"), false);
  });

  await test("konsumsi massal menolak timestamp tidak valid tanpa mengonsumsi stok", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-CONSUME-BULK"), "merge");
    const reservation = await storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-INVALID-CONSUME-BULK",
      jobId: "JOB-TIMESTAMP-INVALID-CONSUME-BULK",
      timestamp: now
    });

    await assert.rejects(storage.consumeReservations({
      reservations: [{ reservationId: reservation.id, remainders: [] }],
      newSheetRemainders: [],
      timestamp: "bukan-tanggal"
    }));
    assert.equal((await storage.get("remainders", "REM-TIMESTAMP-INVALID-CONSUME-BULK")).status, "reserved");
    assert.equal((await storage.get("reservations", reservation.id)).status, "active");
  });

  await test("pembuatan sisa menolak createdAt tidak valid tanpa menyimpan stok atau movement", async () => {
    await assert.rejects(storage.createRemainder({
      id: "REM-TIMESTAMP-INVALID-CREATE",
      materialId: "MAT-A", originJobId: "JOB-A", sourceSheetId: "SHEET-TIMESTAMP-INVALID-CREATE",
      widthCm: 20, heightCm: 15, thicknessMm: 8,
      grainDirection: "none", motif: "plain", rotationAllowed: true,
      createdAt: "bukan-tanggal"
    }));
    assert.equal(await storage.get("remainders", "REM-TIMESTAMP-INVALID-CREATE"), null);
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-TIMESTAMP-INVALID-CREATE")).length,
      0
    );
  });

  await test("perubahan kondisi menolak timestamp tidak valid tanpa mengubah stok atau riwayat", async () => {
    await storage.importJSON(bundle("TIMESTAMP-INVALID-CONDITION"), "merge");
    await assert.rejects(storage.updateRemainderState({
      id: "REM-TIMESTAMP-INVALID-CONDITION",
      changes: { condition: "damaged" },
      timestamp: "bukan-tanggal"
    }));
    assert.equal((await storage.get("remainders", "REM-TIMESTAMP-INVALID-CONDITION")).condition, "good");
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-TIMESTAMP-INVALID-CONDITION"))
        .some(item => item.type === "condition_changed"),
      false
    );
  });

  await test("penyelesaian rencana menolak timestamp tidak valid tanpa mengubah status", async () => {
    const plan = {
      id: "PLAN-TIMESTAMP-INVALID",
      jobId: "JOB-A",
      status: "reserved",
      reservationIds: [],
      createdAt: now,
      completedAt: null,
      cancelledAt: null,
      schemaVersion: 1
    };
    await storage.add("plans", plan);

    await assert.rejects(storage.updatePlanStatus({
      planId: plan.id, status: "cancelled", timestamp: "bukan-tanggal"
    }));
    assert.deepEqual(await storage.get("plans", plan.id), plan);
  });

  await test("reservasi menolak tanggal kalender yang tidak ada tanpa mengubah stok", async () => {
    await storage.importJSON(bundle("TIMESTAMP-IMPOSSIBLE-DATE"), "merge");

    await assert.rejects(storage.reserveRemainder({
      remainderId: "REM-TIMESTAMP-IMPOSSIBLE-DATE",
      jobId: "JOB-TIMESTAMP-IMPOSSIBLE-DATE",
      timestamp: "2026-02-30T12:00:00.000Z"
    }));

    assert.equal(
      (await storage.get("remainders", "REM-TIMESTAMP-IMPOSSIBLE-DATE")).status,
      "available"
    );
    assert.equal(
      (await storage.getByIndex("reservations", "remainderId", "REM-TIMESTAMP-IMPOSSIBLE-DATE")).length,
      0
    );
    assert.equal(
      (await storage.getByIndex("movements", "remainderId", "REM-TIMESTAMP-IMPOSSIBLE-DATE")).length,
      0
    );
  });

  await storage.close();
  console.log("Semua pengujian storage inventaris selesai.");
  await deleteDatabase();
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
