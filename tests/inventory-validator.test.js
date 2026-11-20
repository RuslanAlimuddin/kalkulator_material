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
