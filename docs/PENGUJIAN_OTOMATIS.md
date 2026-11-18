# Pengujian otomatis

Branch `pengembangan-mesin-hitung` menjalankan pengujian melalui GitHub Actions.

## Workflow

- `test.yml`: menjalankan `npm run test:inventory` dan `npm run test:regression`.
- `inventory-batch.yml`: menjalankan tes khusus reservasi massal dan pembatalan atomik.
- `browser-indexeddb.yml`: menjalankan Chromium headless untuk memeriksa IndexedDB asli.

## Cakupan utama

1. Validator, storage, engine, matcher, dan planner.
2. Reservasi beberapa unit dalam satu transaksi.
3. Pembatalan beberapa reservasi secara atomik.
4. Konsumsi beberapa sumber inventaris beserta sisa turunan.
5. Pencatatan sisa yang berasal dari lembar baru fallback dalam transaksi yang sama.
6. Pekerjaan yang hanya memakai lembar baru tetap dapat mencatat sisa tanpa reservasi inventaris.
7. Siklus pekerjaan A → B → C, termasuk sisa lembar baru dari B yang dipakai kembali oleh C.
8. Regresi geometri, cutting engine, dan cutting adapter.
9. Persistensi IndexedDB asli setelah browser ditutup dan dibuka kembali.

Tes Node.js memakai `fake-indexeddb` untuk menguji transaksi tanpa browser. Tes browser menggunakan Chromium sungguhan agar penyimpanan IndexedDB asli juga diverifikasi.

## Hasil verifikasi terakhir

Commit: `3fd6c5108d567d5a455e704f244654f8313bcb2d`

- Suite inventaris: sukses.
- Suite regresi: sukses.
- Reservasi massal: sukses.
- IndexedDB browser: sukses; data tetap ada setelah browser ditutup dan dibuka kembali.

Tautan:
- [Pengujian inventaris dan regresi](https://github.com/RuslanAlimuddin/kalkulator_material/actions/runs/44315674650)
- [Pengujian reservasi massal](https://github.com/RuslanAlimuddin/kalkulator_material/actions/runs/44315674816)
- [Pengujian IndexedDB browser](https://github.com/RuslanAlimuddin/kalkulator_material/actions/runs/44315674692)
