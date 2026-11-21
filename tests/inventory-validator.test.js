const assert = require("node:assert/strict");
const { validateInventoryBundle } = require("../assets/js/inventory-validator.js");

function test(name, fn) {
  fn();
  console.log("LULUS:", name);
}

const now = "2026-11-18T04:00:00.000Z";

function validBundle() {
  return {
    materials: {
      schemaVersion: 1,
      materials: [{
        id: "MAT-001", name: "Keramik putih", category: "keramik",
        thicknessMm: 8, surface: "glossy", grainRequired: false,
        motif: "plain", rotationPolicy: "free", active: true
      }]
    },
    jobs: {
      schemaVersion: 1,
      jobs: [{
        id: "JOB-A", name: "Pekerjaan A", status: "open",
        createdAt: now, closedAt: null
      }]
    },
    remainders: {
      schemaVersion: 1,
      remainders: [{
        id: "REM-001", materialId: "MAT-001", widthCm: 42.5, heightCm: 31,
        thicknessMm: 8, grainDirection: "none", motif: "plain",
        rotationAllowed: true, condition: "good", status: "available",
        originJobId: "JOB-A", sourceSheetId: "SHEET-01",
        createdAt: now, updatedAt: now, version: 1
      }]
    },
    reservations: { schemaVersion: 1, reservations: [] },
    movements: { schemaVersion: 1, movements: [] }
  };
}

function validPlanBundle() {
  const data = validBundle();
  data.remainders.remainders[0].status = "reserved";
  data.jobs.jobs.push({
    id: "JOB-B", name: "Pekerjaan B", status: "open",
    createdAt: now, closedAt: null
  });
  data.reservations.reservations.push({
    id: "RSV-PLAN-001", remainderId: "REM-001", jobId: "JOB-A",
    planId: "PLAN-001", status: "active",
    createdAt: now, releasedAt: null, consumedAt: null
  });
  data.plans = {
    schemaVersion: 1,
    plans: [{
      id: "PLAN-001", jobId: "JOB-A",
      plan: { inventoryUsage: [{ remainderId: "REM-001" }] },
      reservationIds: ["RSV-PLAN-001"], status: "reserved", legacy: false
    }]
  };
  return data;
}

function validate(bundle) {
  return validateInventoryBundle(bundle);
}

test("paket inventaris valid diterima", () => {
  const result = validate(validBundle());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("paket null ditolak dengan laporan kesalahan", () => {
  const result = validate(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});


test("meta opsional tetap kompatibel dengan cadangan lama", () => {
  const data = validBundle();
  assert.equal(validate(data).valid, true);
  data.meta = null;
  assert.equal(validate(data).valid, true);
});

test("meta dengan bentuk selain array ditolak", () => {
  const data = validBundle();
  data.meta = { key: "schemaVersion", value: 2 };
  assert.ok(validate(data).errors.some(e => e.path === "meta"));
});

test("record meta wajib berupa objek dengan key unik", () => {
  const data = validBundle();
  data.meta = [
    { key: "schemaVersion", value: 2 },
    { key: "schemaVersion", value: 1 },
    null
  ];
  const result = validate(data);
  assert.ok(result.errors.some(e => /Key meta tidak boleh duplikat/.test(e.message)));
  assert.ok(result.errors.some(e => /Record meta harus berupa objek/.test(e.message)));
});

test("versi skema yang tidak didukung ditolak", () => {
  const data = validBundle();
  data.materials.schemaVersion = 3;
  assert.equal(validate(data).valid, false);
});

test("array koleksi yang hilang ditolak", () => {
  const data = validBundle();
  delete data.jobs.jobs;
  assert.equal(validate(data).valid, false);
});

test("ID ganda dalam katalog ditolak", () => {
  const data = validBundle();
  data.materials.materials.push({ ...data.materials.materials[0] });
  assert.ok(validate(data).errors.some(e => /ID duplikat/.test(e.message)));
});

test("ketebalan nol ditolak", () => {
  const data = validBundle();
  data.materials.materials[0].thicknessMm = 0;
  assert.equal(validate(data).valid, false);
});

test("dimensi sisa nol atau negatif ditolak", () => {
  for (const value of [0, -2]) {
    const data = validBundle();
    data.remainders.remainders[0].widthCm = value;
    assert.equal(validate(data).valid, false);
  }
});

test("referensi material yang tidak ditemukan ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].materialId = "MAT-HILANG";
  assert.ok(validate(data).errors.some(e => /Material dengan ID/.test(e.message)));
});

test("referensi pekerjaan asal yang tidak ditemukan ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].originJobId = "JOB-HILANG";
  assert.ok(validate(data).errors.some(e => /Pekerjaan asal/.test(e.message)));
});

test("rantai asal-usul sisa material yang membentuk siklus ditolak", () => {
  const data = validBundle();
  const createdAt = "2026-11-18T04:00:00.000Z";
  const reservedAt = "2026-11-18T05:00:00.000Z";
  const consumedAt = "2026-11-18T06:00:00.000Z";
  const base = data.remainders.remainders[0];
  const a = {
    ...base, id: "REM-CYCLE-A", status: "consumed", sourceType: "inventory",
    sourceRemainderId: "REM-CYCLE-B", reservationId: "RSV-CYCLE-A",
    createdAt, updatedAt: consumedAt
  };
  const b = {
    ...base, id: "REM-CYCLE-B", status: "consumed", sourceType: "inventory",
    sourceRemainderId: "REM-CYCLE-A", reservationId: "RSV-CYCLE-B",
    createdAt, updatedAt: consumedAt
  };
  data.remainders.remainders.push(a, b);
  for (const [remainder, reservationId] of [[a, "RSV-CYCLE-A"], [b, "RSV-CYCLE-B"]]) {
    data.reservations.reservations.push({
      id: reservationId, remainderId: remainder.id, jobId: "JOB-A",
      status: "consumed", createdAt: reservedAt, releasedAt: null, consumedAt
    });
    data.movements.movements.push(
      { id: "MOV-CREATE-" + remainder.id, remainderId: remainder.id,
        type: "remainder_created", jobId: "JOB-A", timestamp: createdAt,
        fromStatus: null, toStatus: "available", referenceId: remainder.sourceRemainderId },
      { id: "MOV-RESERVE-" + remainder.id, remainderId: remainder.id,
        type: "reserved", jobId: "JOB-A", timestamp: reservedAt,
        fromStatus: "available", toStatus: "reserved", referenceId: reservationId },
      { id: "MOV-CONSUME-" + remainder.id, remainderId: remainder.id,
        type: "consumed", jobId: "JOB-A", timestamp: consumedAt,
        fromStatus: "reserved", toStatus: "consumed", referenceId: reservationId }
    );
  }
  const result = validate(data);
  assert.ok(result.errors.some(e => /Rantai asal-usul sisa material mengandung siklus/.test(e.message)));
});

test("status sisa yang tidak dikenal ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].status = "ready";
  assert.equal(validate(data).valid, false);
});

test("ketebalan sisa harus sama dengan katalog material", () => {
  const data = validBundle();
  data.remainders.remainders[0].thicknessMm = 10;
  assert.ok(validate(data).errors.some(e => /Ketebalan sisa harus sama/.test(e.message)));
});

test("status reserved tanpa reservasi aktif ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].status = "reserved";
  assert.ok(validate(data).errors.some(e => /harus memiliki satu reservasi aktif/.test(e.message)));
});

test("reservasi aktif mengubah konsistensi status sisa menjadi reserved", () => {
  const data = validBundle();
  data.remainders.remainders[0].status = "reserved";
  data.reservations.reservations.push({
    id: "RSV-001", remainderId: "REM-001", jobId: "JOB-A",
    status: "active", createdAt: now, releasedAt: null, consumedAt: null
  });
  assert.equal(validate(data).valid, true);
});

test("sisa material tidak boleh dibuat sebelum pekerjaan asalnya", () => {
  const data = validBundle();
  data.jobs.jobs[0].createdAt = "2026-11-18T05:00:00.000Z";
  data.remainders.remainders[0].createdAt = "2026-11-18T04:00:00.000Z";
  data.remainders.remainders[0].updatedAt = "2026-11-18T05:00:00.000Z";
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "remainders.remainders[0].createdAt" &&
    /tidak boleh mendahului waktu pembuatan pekerjaan asal/.test(e.message)
  ));
});

test("reservasi tidak boleh dibuat sebelum pekerjaan pemesannya", () => {
  const data = validBundle();
  data.jobs.jobs[0].createdAt = "2026-11-18T05:00:00.000Z";
  data.remainders.remainders[0].status = "reserved";
  data.reservations.reservations.push({
    id: "RSV-BEFORE-JOB", remainderId: "REM-001", jobId: "JOB-A",
    status: "active", createdAt: "2026-11-18T04:00:00.000Z",
    releasedAt: null, consumedAt: null
  });
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "reservations.reservations[0].createdAt" &&
    /tidak boleh mendahului waktu pembuatan pekerjaan/.test(e.message)
  ));
});

test("reservasi aktif tidak boleh terhubung ke pekerjaan completed atau archived", () => {
  for (const status of ["completed", "archived"]) {
    const data = validBundle();
    data.jobs.jobs[0].status = status;
    data.jobs.jobs[0].closedAt = now;
    data.remainders.remainders[0].status = "reserved";
    data.reservations.reservations.push({
      id: "RSV-CLOSED-JOB-" + status, remainderId: "REM-001", jobId: "JOB-A",
      status: "active", createdAt: now, releasedAt: null, consumedAt: null
    });
    const result = validate(data);
    assert.ok(result.errors.some(e =>
      e.path === "reservations.reservations[0].jobId" &&
      /pekerjaan yang masih open/.test(e.message)
    ), "Reservasi aktif pada pekerjaan " + status + " harus ditolak");
  }
});

test("reservasi tidak boleh dibuat setelah pekerjaan ditutup", () => {
  const data = validBundle();
  data.jobs.jobs[0].status = "completed";
  data.jobs.jobs[0].closedAt = "2026-11-18T06:00:00.000Z";
  data.reservations.reservations.push({
    id: "RSV-AFTER-CLOSE", remainderId: "REM-001", jobId: "JOB-A",
    status: "released", createdAt: "2026-11-18T07:00:00.000Z",
    releasedAt: "2026-11-18T08:00:00.000Z", consumedAt: null
  });
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "reservations.reservations[0].createdAt" &&
    /tidak boleh setelah pekerjaan ditutup/.test(e.message)
  ));
});

test("reservasi tidak boleh diselesaikan setelah pekerjaan ditutup", () => {
  const data = validBundle();
  data.jobs.jobs[0].status = "completed";
  data.jobs.jobs[0].closedAt = "2026-11-18T06:00:00.000Z";
  data.remainders.remainders[0].status = "consumed";
  data.reservations.reservations.push({
    id: "RSV-TERMINAL-AFTER-CLOSE", remainderId: "REM-001", jobId: "JOB-A",
    status: "consumed", createdAt: "2026-11-18T05:00:00.000Z",
    releasedAt: null, consumedAt: "2026-11-18T07:00:00.000Z"
  });
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "reservations.reservations[0].consumedAt" &&
    /tidak boleh setelah pekerjaan ditutup/.test(e.message)
  ));
});

test("sisa turunan tidak boleh dibuat sebelum sumbernya dikonsumsi", () => {
  const data = validBundle();
  const source = data.remainders.remainders[0];
  source.status = "consumed";
  const childCreatedAt = "2026-11-18T05:00:00.000Z";
  const consumedAt = "2026-11-18T06:00:00.000Z";
  data.remainders.remainders.push({
    ...source, id: "REM-CHILD-EARLY", status: "available",
    sourceType: "inventory", sourceRemainderId: source.id,
    reservationId: "RSV-SOURCE", createdAt: childCreatedAt,
    updatedAt: childCreatedAt, version: 1
  });
  data.reservations.reservations.push({
    id: "RSV-SOURCE", remainderId: source.id, jobId: "JOB-A",
    status: "consumed", createdAt: now, releasedAt: null, consumedAt
  });
  data.movements.movements.push({
    id: "MOV-CHILD-CREATE", remainderId: "REM-CHILD-EARLY",
    type: "remainder_created", jobId: "JOB-A", timestamp: childCreatedAt,
    fromStatus: null, toStatus: "available", referenceId: source.id
  });
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "remainders.remainders[1].createdAt" &&
    /tidak boleh mendahului waktu konsumsi sumber/.test(e.message)
  ));
});
test("snapshot rencana dan reservasi dengan sumber serta pekerjaan cocok diterima", () => {
  assert.equal(validate(validPlanBundle()).valid, true);
});

test("snapshot pemulihan tanpa pekerjaan induk ditolak", () => {
  const data = validBundle();
  data.plans = {
    schemaVersion: 1,
    plans: [{
      id: "PLAN-ORPHAN", jobId: "JOB-TIDAK-ADA", plan: null,
      reservationIds: [], status: "legacy_recovery", legacy: true
    }]
  };
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "plans.plans[0].jobId" && /tidak ditemukan/.test(e.message)
  ));
});

test("reservasi dengan jobId berbeda dari snapshot rencana ditolak", () => {
  const data = validPlanBundle();
  data.reservations.reservations[0].jobId = "JOB-B";
  const result = validate(data);
  assert.ok(result.errors.some(e => /Pekerjaan reservasi tidak cocok/.test(e.message)));
});

test("sumber inventaris snapshot yang berbeda dari reservasi ditolak", () => {
  const data = validPlanBundle();
  data.plans.plans[0].plan.inventoryUsage[0].remainderId = "REM-LAIN";
  const result = validate(data);
  assert.ok(result.errors.some(e => /Daftar sumber inventaris tidak cocok/.test(e.message)));
});


test("dua reservasi aktif untuk satu sisa ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].status = "reserved";
  for (const id of ["RSV-001", "RSV-002"]) {
    data.reservations.reservations.push({
      id, remainderId: "REM-001", jobId: "JOB-A",
      status: "active", createdAt: now, releasedAt: null, consumedAt: null
    });
  }
  assert.ok(validate(data).errors.some(e => /lebih dari satu reservasi aktif/.test(e.message)));
});

test("kondisi fisik tidak dikenal ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].condition = "broken";
  assert.equal(validate(data).valid, false);
});

test("tanggal yang tidak valid ditolak", () => {
  const data = validBundle();
  data.jobs.jobs[0].createdAt = "kemarin";
  assert.equal(validate(data).valid, false);
});

test("tanggal kalender yang tidak ada ditolak", () => {
  const data = validBundle();
  data.jobs.jobs[0].createdAt = "2026-02-30T12:00:00.000Z";
  assert.equal(validate(data).valid, false);
});

test("waktu penutupan pekerjaan tidak boleh mendahului waktu pembuatan", () => {
  const data = validBundle();
  data.jobs.jobs[0].status = "completed";
  data.jobs.jobs[0].createdAt = "2026-11-18T06:00:00.000Z";
  data.jobs.jobs[0].closedAt = "2026-11-18T05:00:00.000Z";
  assert.equal(validate(data).valid, false);
});

test("updatedAt sisa material tidak boleh mendahului createdAt", () => {
  const data = validBundle();
  data.remainders.remainders[0].createdAt = "2026-11-18T06:00:00.000Z";
  data.remainders.remainders[0].updatedAt = "2026-11-18T05:00:00.000Z";
  assert.equal(validate(data).valid, false);
});

test("waktu pelepasan reservasi tidak boleh mendahului waktu pembuatan", () => {
  const data = validBundle();
  data.reservations.reservations.push({
    id: "RSV-CHRONOLOGY", remainderId: "REM-001", jobId: "JOB-A",
    status: "released",
    createdAt: "2026-11-18T06:00:00.000Z",
    releasedAt: "2026-11-18T05:00:00.000Z",
    consumedAt: null
  });
  assert.equal(validate(data).valid, false);
});

test("timestamp snapshot rencana yang tidak valid ditolak", () => {
  const data = validPlanBundle();
  data.plans.plans[0].createdAt = "2026-02-30T12:00:00.000Z";
  assert.equal(validate(data).valid, false);
});

test("snapshot rencana dibatalkan tidak boleh memiliki completedAt", () => {
  const data = validBundle();
  data.plans = {
    schemaVersion: 1,
    plans: [{
      id: "PLAN-CANCELLED-TIMESTAMP", jobId: "JOB-A",
      plan: { inventoryUsage: [] }, reservationIds: [],
      status: "cancelled", legacy: false,
      createdAt: now, cancelledAt: now, completedAt: now
    }]
  };
  assert.equal(validate(data).valid, false);
});

test("waktu completedAt snapshot harus sama dengan consumedAt reservasi", () => {
  const data = validPlanBundle();
  const completedAt = "2026-11-18T06:00:00.000Z";
  const consumedAt = "2026-11-18T07:00:00.000Z";
  data.remainders.remainders[0].status = "consumed";
  data.reservations.reservations[0].status = "consumed";
  data.reservations.reservations[0].consumedAt = consumedAt;
  data.plans.plans[0].status = "completed";
  data.plans.plans[0].createdAt = now;
  data.plans.plans[0].completedAt = completedAt;
  assert.equal(validate(data).valid, false);
});

test("waktu cancelledAt snapshot harus sama dengan releasedAt reservasi", () => {
  const data = validPlanBundle();
  const cancelledAt = "2026-11-18T06:00:00.000Z";
  const releasedAt = "2026-11-18T07:00:00.000Z";
  data.remainders.remainders[0].status = "available";
  data.reservations.reservations[0].status = "released";
  data.reservations.reservations[0].releasedAt = releasedAt;
  data.plans.plans[0].status = "cancelled";
  data.plans.plans[0].createdAt = now;
  data.plans.plans[0].cancelledAt = cancelledAt;
  assert.equal(validate(data).valid, false);
});

test("ID movement wajib diisi", () => {
  const data = validBundle();
  data.movements.movements.push({
    remainderId: "REM-001", type: "created",
    timestamp: now, fromStatus: null, toStatus: "available"
  });
  assert.ok(validate(data).errors.some(e => e.path === "movements.movements[0].id"));
});

test("ID movement duplikat ditolak agar riwayat tidak tertimpa saat impor replace", () => {
  const data = validBundle();
  for (const remainderId of ["REM-001", "REM-001"]) {
    data.movements.movements.push({
      id: "MOV-DUPLICATE", remainderId, type: "created",
      timestamp: now, fromStatus: null, toStatus: "available"
    });
  }
  assert.ok(validate(data).errors.some(e => /ID duplikat: MOV-DUPLICATE/.test(e.message)));
});

test("jenis movement harus memiliki transisi status yang sesuai", () => {
  const data = validBundle();
  data.movements.movements.push({
    id: "MOV-WRONG-TRANSITION", remainderId: "REM-001",
    type: "reserved", timestamp: now,
    fromStatus: null, toStatus: "available"
  });
  assert.ok(validate(data).errors.some(e =>
    /Perubahan status tidak sesuai/.test(e.message)
  ));
});

test("movement reservasi harus merujuk reservasi dengan sumber yang sama", () => {
  const data = validPlanBundle();
  data.movements.movements.push({
    id: "MOV-RESERVED", remainderId: "REM-001",
    type: "reserved", jobId: "JOB-A", timestamp: now,
    fromStatus: "available", toStatus: "reserved",
    referenceId: "RSV-TIDAK-ADA"
  });
  assert.ok(validate(data).errors.some(e =>
    /Riwayat reservasi harus merujuk ID reservasi yang ada/.test(e.message)
  ));
});

test("movement reservasi yang terhubung benar diterima", () => {
  const data = validPlanBundle();
  data.movements.movements.push({
    id: "MOV-RESERVED", remainderId: "REM-001",
    type: "reserved", jobId: "JOB-A", timestamp: now,
    fromStatus: "available", toStatus: "reserved",
    referenceId: "RSV-PLAN-001"
  });
  assert.equal(validate(data).valid, true);
});

test("movement reserved tidak boleh merujuk reservasi yang sudah terminal", () => {
  const data = validPlanBundle();
  const terminalAt = "2026-11-18T06:00:00.000Z";
  data.remainders.remainders[0].status = "consumed";
  data.remainders.remainders[0].updatedAt = terminalAt;
  data.reservations.reservations[0].status = "consumed";
  data.reservations.reservations[0].consumedAt = terminalAt;
  data.movements.movements.push({
    id: "MOV-RESERVED-AFTER-CONSUME", remainderId: "REM-001",
    type: "reserved", jobId: "JOB-A", timestamp: now,
    fromStatus: "available", toStatus: "reserved",
    referenceId: "RSV-PLAN-001"
  });
  const result = validate(data);
  assert.ok(result.errors.some(e =>
    e.path === "movements.movements[0].referenceId" &&
    /movement reserved harus merujuk reservasi berstatus active/.test(e.message)
  ));
});

test("reservasi lama tanpa riwayat lengkap diberi peringatan, bukan langsung ditolak", () => {
  const data = validBundle();
  data.reservations.reservations.push({
    id: "RSV-LEGACY", remainderId: "REM-001", jobId: "JOB-A",
    status: "released", createdAt: now, releasedAt: now, consumedAt: null
  });
  const result = validate(data);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => /movement reserved/.test(w.message)));
  assert.ok(result.warnings.some(w => /movement terminal/.test(w.message)));
});

test("lebih dari satu movement reserved untuk reservasi yang sama ditolak", () => {
  const data = validPlanBundle();
  for (const id of ["MOV-RESERVED-1", "MOV-RESERVED-2"]) {
    data.movements.movements.push({
      id, remainderId: "REM-001", type: "reserved",
      jobId: "JOB-A", timestamp: now,
      fromStatus: "available", toStatus: "reserved",
      referenceId: "RSV-PLAN-001"
    });
  }
  assert.ok(validate(data).errors.some(e =>
    /lebih dari satu movement reserved/.test(e.message)
  ));
});

test("movement terminal tidak boleh mendahului movement reservasi", () => {
  const data = validBundle();
  data.reservations.reservations.push({
    id: "RSV-RELEASED", remainderId: "REM-001", jobId: "JOB-A",
    status: "released", createdAt: now,
    releasedAt: "2026-11-18T05:00:00.000Z", consumedAt: null
  });
  data.movements.movements.push({
    id: "MOV-RELEASED", remainderId: "REM-001",
    type: "reservation_released", jobId: "JOB-A",
    timestamp: "2026-11-18T05:00:00.000Z",
    fromStatus: "reserved", toStatus: "available",
    referenceId: "RSV-RELEASED"
  }, {
    id: "MOV-RESERVED-LATE", remainderId: "REM-001",
    type: "reserved", jobId: "JOB-A",
    timestamp: "2026-11-18T06:00:00.000Z",
    fromStatus: "available", toStatus: "reserved",
    referenceId: "RSV-RELEASED"
  });
  assert.ok(validate(data).errors.some(e =>
    /tidak boleh mendahului movement reserved/.test(e.message)
  ));
});

test("movement awal ganda ditolak meskipun timestamp-nya sama", () => {
  const data = validBundle();
  data.movements.movements.push({
    id: "MOV-INITIAL-1", remainderId: "REM-001", type: "created",
    timestamp: now, fromStatus: null, toStatus: "available"
  }, {
    id: "MOV-INITIAL-2", remainderId: "REM-001", type: "remainder_created",
    timestamp: now, fromStatus: null, toStatus: "available"
  });
  assert.ok(validate(data).errors.some(e => /lebih dari satu movement awal/.test(e.message)));
});

test("rantai status movement yang terputus ditolak", () => {
  const data = validBundle();
  data.movements.movements.push({
    id: "MOV-CREATED", remainderId: "REM-001", type: "created",
    timestamp: "2026-11-18T04:00:00.000Z",
    fromStatus: null, toStatus: "available"
  }, {
    id: "MOV-DISCARDED", remainderId: "REM-001", type: "discarded",
    timestamp: "2026-11-18T05:00:00.000Z",
    fromStatus: "reserved", toStatus: "discarded"
  });
  const result = validate(data);
  assert.ok(result.errors.some(e => /Urutan movement terputus/.test(e.message)));
});

test("status akhir harus cocok dengan movement terakhir pada timestamp pembaruan", () => {
  const data = validBundle();
  data.remainders.remainders[0].status = "discarded";
  data.remainders.remainders[0].updatedAt = "2026-11-18T05:00:00.000Z";
  data.movements.movements.push({
    id: "MOV-LAST-AVAILABLE", remainderId: "REM-001", type: "created",
    timestamp: "2026-11-18T05:00:00.000Z",
    fromStatus: null, toStatus: "available"
  });
  assert.ok(validate(data).errors.some(e => /Status akhir sisa material tidak cocok/.test(e.message)));
});

test("riwayat yang tertinggal dari updatedAt diberi peringatan legacy", () => {
  const data = validBundle();
  data.remainders.remainders[0].updatedAt = "2026-11-18T06:00:00.000Z";
  data.movements.movements.push({
    id: "MOV-OLD", remainderId: "REM-001", type: "created",
    timestamp: "2026-11-18T04:00:00.000Z",
    fromStatus: null, toStatus: "available"
  });
  const result = validate(data);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => /Movement terakhir lebih lama/.test(w.message)));
});

test("riwayat legacy yang memiliki aktivitas tetapi kehilangan movement awal diberi peringatan", () => {
  const data = validBundle();
  data.movements.movements.push({
    id: "MOV-LEGACY-CONDITION", remainderId: "REM-001",
    type: "condition_changed", timestamp: now,
    fromStatus: "available", toStatus: "available"
  });
  const result = validate(data);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => /movement awal tidak ditemukan/i.test(w.message)));
});

test("sisa modern tanpa movement pembuatan tetap ditolak", () => {
  const data = validBundle();
  data.remainders.remainders[0].sourceType = "new";
  const result = validate(data);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /tepat satu movement remainder_created/.test(e.message)));
});

test("asal-usul sisa turunan harus menunjuk sumber dan reservasi yang benar", () => {
  const data = validBundle();
  data.jobs.jobs.push({ id: "JOB-B", name: "Pekerjaan B", status: "open", createdAt: now, closedAt: null });
  data.remainders.remainders[0].status = "consumed";
  data.remainders.remainders.push({
    id: "REM-CHILD", materialId: "MAT-001", widthCm: 20, heightCm: 10,
    thicknessMm: 8, grainDirection: "none", motif: "plain",
    rotationAllowed: true, condition: "good", status: "available",
    originJobId: "JOB-B", sourceSheetId: "SHEET-B",
    sourceType: "inventory", sourceRemainderId: "REM-001",
    reservationId: "RSV-SOURCE",
    createdAt: now, updatedAt: now, version: 1
  });
  data.reservations.reservations.push({
    id: "RSV-SOURCE", remainderId: "REM-001", jobId: "JOB-B",
    status: "consumed", createdAt: now, releasedAt: null, consumedAt: now
  });
  data.movements.movements.push({
    id: "MOV-CHILD-CREATED", remainderId: "REM-CHILD",
    type: "remainder_created", jobId: "JOB-B", timestamp: now,
    fromStatus: null, toStatus: "available", referenceId: "REM-001"
  });
  assert.equal(validate(data).valid, true, JSON.stringify(validate(data).errors));

  data.remainders.remainders[1].sourceRemainderId = "REM-MISSING";
  assert.ok(validate(data).errors.some(e => /Sisa material sumber tidak ditemukan/.test(e.message)));
});


test("reservasi consumed wajib cocok dengan status sumber dan tidak boleh ganda", () => {
  const sourceNotConsumed = validBundle();
  sourceNotConsumed.reservations.reservations.push({
    id: "RSV-CONSUMED-WRONG-SOURCE", remainderId: "REM-001", jobId: "JOB-A",
    status: "consumed", createdAt: now, releasedAt: null, consumedAt: now
  });
  assert.ok(validate(sourceNotConsumed).errors.some(error =>
    /sumber yang juga berstatus consumed/.test(error.message)
  ));

  const duplicate = validBundle();
  duplicate.remainders.remainders[0].status = "consumed";
  for (const id of ["RSV-CONSUMED-1", "RSV-CONSUMED-2"]) {
    duplicate.reservations.reservations.push({
      id, remainderId: "REM-001", jobId: "JOB-A",
      status: "consumed", createdAt: now, releasedAt: null, consumedAt: now
    });
  }
  assert.ok(validate(duplicate).errors.some(error =>
    /lebih dari satu reservasi consumed/.test(error.message)
  ));
});

test("sisa turunan wajib mempertahankan identitas dan karakter material sumber", () => {
  const fields = [
    ["materialId", "MAT-002"],
    ["thicknessMm", 10],
    ["grainDirection", "vertical"],
    ["motif", "striped"],
    ["rotationAllowed", false]
  ];
  for (const [field, value] of fields) {
    const data = validBundle();
    data.jobs.jobs.push({ id: "JOB-B", name: "Pekerjaan B", status: "open", createdAt: now, closedAt: null });
    data.materials.materials.push({
      id: "MAT-002", name: "Keramik lain", category: "keramik",
      thicknessMm: 8, grainRequired: false, motif: "plain",
      rotationPolicy: "free", active: true
    });
    data.remainders.remainders[0].status = "consumed";
    data.remainders.remainders.push({
      id: "REM-CHILD", materialId: "MAT-001", widthCm: 20, heightCm: 10,
      thicknessMm: 8, grainDirection: "none", motif: "plain",
      rotationAllowed: true, condition: "good", status: "available",
      originJobId: "JOB-B", sourceSheetId: "SHEET-B",
      sourceType: "inventory", sourceRemainderId: "REM-001",
      reservationId: "RSV-SOURCE", createdAt: now, updatedAt: now, version: 1
    });
    data.reservations.reservations.push({
      id: "RSV-SOURCE", remainderId: "REM-001", jobId: "JOB-B",
      status: "consumed", createdAt: now, releasedAt: null, consumedAt: now
    });
    data.movements.movements.push({
      id: "MOV-CHILD-CREATED", remainderId: "REM-CHILD",
      type: "remainder_created", jobId: "JOB-B", timestamp: now,
      fromStatus: null, toStatus: "available", referenceId: "REM-001"
    });
    data.remainders.remainders[1][field] = value;
    const result = validate(data);
    assert.ok(result.errors.some(error =>
      error.path === "remainders.remainders[1]." + field &&
      /sumbernya|sumbernya|material sumber|sama dengan material sumbernya/i.test(error.message)
    ), field + " harus ditolak karena berbeda dari sumber");
  }
});

test("movement pembuatan harus cocok dengan referensi asal-usul sisa", () => {
  const data = validBundle();
  data.remainders.remainders[0].sourceType = "new";
  data.movements.movements.push({
    id: "MOV-CHILD-CREATED", remainderId: "REM-001",
    type: "remainder_created", jobId: "JOB-A", timestamp: now,
    fromStatus: null, toStatus: "available", referenceId: "SHEET-WRONG"
  });
  assert.ok(validate(data).errors.some(e => /Referensi movement pembuatan tidak cocok/.test(e.message)));
});

test("sisa dari lembar baru tidak boleh memiliki referensi sumber inventaris", () => {
  const data = validBundle();
  data.remainders.remainders[0].sourceType = "new";
  data.remainders.remainders[0].sourceRemainderId = "REM-OTHER";
  assert.ok(validate(data).errors.some(e => /Sisa dari lembar baru tidak boleh menunjuk/.test(e.message)));
});

test("record legacy tanpa metadata asal-usul tetap diterima", () => {
  const data = validBundle();
  assert.equal(validate(data).valid, true);
});

test("metadata sumber inventaris tanpa sourceType ditolak, tetapi record legacy tetap diterima", () => {
  const data = validBundle();
  data.remainders.remainders[0].sourceRemainderId = "REM-001";
  const result = validate(data);
  assert.ok(result.errors.some(e => /Metadata sumber inventaris wajib disertai sourceType/.test(e.message)));

  const reservationOnly = validBundle();
  reservationOnly.remainders.remainders[0].reservationId = "RSV-ORPHAN";
  assert.ok(validate(reservationOnly).errors.some(e =>
    /Metadata sumber inventaris wajib disertai sourceType/.test(e.message)
  ));
});

test("waktu movement harus cocok dengan timestamp reservasi", () => {
  const data = validBundle();
  data.reservations.reservations.push({
    id: "RSV-TIME-MISMATCH", remainderId: "REM-001", jobId: "JOB-A",
    status: "released", createdAt: now,
    releasedAt: "2026-11-18T05:00:00.000Z", consumedAt: null
  });
  data.movements.movements.push({
    id: "MOV-RESERVED-TIME", remainderId: "REM-001",
    type: "reserved", jobId: "JOB-A", timestamp: "2026-11-18T04:30:00.000Z",
    fromStatus: "available", toStatus: "reserved",
    referenceId: "RSV-TIME-MISMATCH"
  }, {
    id: "MOV-RELEASED-TIME", remainderId: "REM-001",
    type: "reservation_released", jobId: "JOB-A",
    timestamp: "2026-11-18T05:30:00.000Z",
    fromStatus: "reserved", toStatus: "available",
    referenceId: "RSV-TIME-MISMATCH"
  });
  const result = validate(data);
  assert.ok(result.errors.some(e => /waktu pembuatan reservasi/.test(e.message)));
  assert.ok(result.errors.some(e => /waktu akhir reservasi/.test(e.message)));
});

test("reservasi terminal tidak boleh memiliki dua timestamp akhir sekaligus", () => {
  const released = validBundle();
  released.reservations.reservations.push({
    id: "RSV-RELEASED-BOTH", remainderId: "REM-001", jobId: "JOB-A",
    status: "released", createdAt: now,
    releasedAt: now, consumedAt: now
  });
  assert.ok(validate(released).errors.some(e => /released tidak boleh memiliki waktu pemakaian/.test(e.message)));

  const consumed = validBundle();
  consumed.reservations.reservations.push({
    id: "RSV-CONSUMED-BOTH", remainderId: "REM-001", jobId: "JOB-A",
    status: "consumed", createdAt: now,
    releasedAt: now, consumedAt: now
  });
  assert.ok(validate(consumed).errors.some(e => /consumed tidak boleh memiliki waktu pelepasan/.test(e.message)));
});

test("movement dengan remainder yang tidak ada ditolak", () => {
  const data = validBundle();
  data.movements.movements.push({
    id: "MOV-001", remainderId: "REM-HILANG", type: "created",
    timestamp: now, fromStatus: null, toStatus: "available"
  });
  assert.ok(validate(data).errors.some(e => /Sisa material pada riwayat/.test(e.message)));
});

test("sisa rusak tidak otomatis dianggap data valid-tersedia tanpa peringatan", () => {
  const data = validBundle();
  data.remainders.remainders[0].condition = "damaged";
  const result = validate(data);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => /matcher tetap harus mengecualikannya/.test(w.message)));
});

console.log("Semua pengujian validator inventaris selesai.");
