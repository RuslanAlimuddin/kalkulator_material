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

test("versi skema yang tidak didukung ditolak", () => {
  const data = validBundle();
  data.materials.schemaVersion = 2;
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
