# Blueprint Teknis — Inventaris Sisa Material Lintas Pekerjaan

Status: rancangan teknis untuk ditinjau sebelum implementasi  
Target branch: `pengembangan-mesin-hitung`  
Satuan dimensi: sentimeter (cm), luas: cm²

## 1. Tujuan dan batas perubahan

Inventaris menyimpan potongan sisa yang secara fisik masih tersedia agar dapat digunakan pada pekerjaan berikutnya. Sisa dari pekerjaan A dapat dipakai pada B/C; sisa baru hasil pemotongan pekerjaan berikutnya kembali menjadi stok.

Lapisan inventaris tidak mengambil alih geometri pemasangan. Tanggung jawab tetap dipisahkan:

- `engine.js`: geometri pemasangan; tidak diubah untuk fitur inventaris.
- `cutting-engine.js`: menyusun potongan pada satu ukuran sumber per pemanggilan; dipertahankan sebagai mesin geometri pemotongan.
- `cutting-adapter.js`: antarmuka kalkulasi aplikasi; integrasi inventaris dilakukan secara opsional melalui lapisan baru.
- Modul inventaris: identitas persisten, kecocokan material, penyimpanan, reservasi, dan riwayat.
- `makeStok()`: tetap dipertahankan sampai pengganti selesai diuji dan perilaku lama dibandingkan.

Tidak ada perubahan pada `main`; seluruh pengembangan berada di branch `pengembangan-mesin-hitung`.

## 2. Berkas JSON dan perannya

JSON merupakan format pertukaran/cadangan (impor-ekspor), bukan penyimpanan operasional utama.

### 2.1 `materials.json` — katalog spesifikasi

Berisi definisi jenis material yang dapat dibandingkan.

```json
{
  "schemaVersion": 1,
  "materials": [
    {
      "id": "MAT-KERAMIK-001",
      "name": "Keramik contoh",
      "category": "keramik",
      "thicknessMm": 8,
      "surface": "glossy",
      "grainRequired": false,
      "motif": "plain",
      "rotationPolicy": "free",
      "active": true
    }
  ]
}
```

Aturan:
- `id` unik dan stabil.
- Ketebalan disimpan dalam mm agar tidak tercampur dengan dimensi potong cm.
- `rotationPolicy`: `free`, `quarter_turn`, atau `fixed`.
- Atribut material yang menentukan kompatibilitas harus eksplisit; nama material saja tidak cukup.

### 2.2 `jobs.json` — pekerjaan

```json
{
  "schemaVersion": 1,
  "jobs": [
    {
      "id": "JOB-2026-0001",
      "name": "Pekerjaan A",
      "status": "open",
      "createdAt": "2026-11-18T00:00:00.000Z",
      "closedAt": null
    }
  ]
}
```

Status pekerjaan: `open`, `completed`, atau `archived`. Job yang sudah selesai tetap disimpan karena menjadi asal-usul stok dan riwayat.

### 2.3 `remainders.json` — unit fisik sisa material

Satu objek mewakili satu potongan fisik yang dapat dilacak, bukan sekadar jumlah agregat.

```json
{
  "schemaVersion": 1,
  "remainders": [
    {
      "id": "REM-uuid",
      "materialId": "MAT-KERAMIK-001",
      "widthCm": 42.5,
      "heightCm": 31,
      "thicknessMm": 8,
      "grainDirection": "none",
      "motif": "plain",
      "rotationAllowed": true,
      "condition": "good",
      "status": "available",
      "originJobId": "JOB-2026-0001",
      "sourceSheetId": "JOB-2026-0001-SHEET-03",
      "createdAt": "2026-11-18T00:00:00.000Z",
      "updatedAt": "2026-11-18T00:00:00.000Z",
      "version": 1
    }
  ]
}
```

Status stok: `available`, `reserved`, `consumed`, `discarded`. Kondisi fisik: `good`, `damaged`, atau `unknown`. Hanya `available` dengan kondisi `good` yang otomatis ditawarkan matcher. Status `unknown` memerlukan pemeriksaan/persetujuan pengguna.

Setiap hasil sisa baru dari pemotongan membuat ID baru. Potongan asal yang dipakai tidak diubah ukurannya diam-diam: ia ditandai `consumed`, lalu sisa turunannya dibuat sebagai record baru dan ditautkan melalui movement.

### 2.4 `reservations.json` — penguncian stok untuk pekerjaan

```json
{
  "schemaVersion": 1,
  "reservations": [
    {
      "id": "RSV-uuid",
      "remainderId": "REM-uuid",
      "jobId": "JOB-2026-0002",
      "status": "active",
      "createdAt": "2026-11-18T00:00:00.000Z",
      "releasedAt": null,
      "consumedAt": null
    }
  ]
}
```

Satu remainder hanya boleh memiliki satu reservasi aktif. Reservasi tidak mengurangi stok; ia mengubah status unit menjadi `reserved`. Pembatalan mengembalikannya menjadi `available`; pemakaian mengubahnya menjadi `consumed`.

### 2.5 `movements.json` — buku riwayat

Catatan bersifat append-only (ditambah, bukan ditimpa). Jenis peristiwa: `created`, `reserved`, `reservation_released`, `consumed`, `remainder_created`, `condition_changed`, `discarded`, `imported`.

Setiap catatan minimal memuat `id`, `remainderId`, `type`, `jobId` bila terkait, `timestamp`, `fromStatus`, `toStatus`, dan `referenceId` bila terkait reservasi/pemotongan. Catatan koreksi dibuat sebagai peristiwa baru, bukan menghapus riwayat lama.

## 3. Hubungan antar-data

- `remainders.materialId -> materials.id`
- `remainders.originJobId -> jobs.id`
- `reservations.remainderId -> remainders.id`
- `reservations.jobId -> jobs.id`
- `movements.remainderId -> remainders.id`
- `movements.jobId -> jobs.id` jika peristiwa terkait pekerjaan.

Saat impor, validator menolak ID ganda, referensi yatim (ID tujuan tidak ditemukan), dimensi nol/negatif, status tidak dikenal, dan reservasi aktif ganda. Impor tidak boleh menimpa data aktif secara diam-diam; pengguna harus memilih gabungkan, ganti seluruh data, atau batalkan.

## 4. Aturan pencocokan material dan ukuran

Urutan pemeriksaan matcher:

1. Status harus `available`; kondisi harus `good`.
2. `materialId` harus sama. Pengecualian material substitusi hanya boleh dibuat sebagai aturan eksplisit di masa depan, bukan tebakan nama.
3. Ketebalan harus sama; toleransi hanya jika ditetapkan pada definisi material.
4. Motif dan arah serat harus cocok. Material bermotif/berarah tidak boleh diputar jika kebijakan melarang.
5. Periksa orientasi normal dan orientasi putar 90° secara terpisah.
6. Dimensi efektif harus cukup untuk potongan setelah memperhitungkan kerf pada sisi potong yang memang baru dibuat.
7. Batas minimum sisa tetap dipakai untuk menentukan apakah hasil potongan turunan layak disimpan.

Rotasi diizinkan hanya jika ketiga aturan membolehkan: kebijakan material, atribut unit sisa, dan kebutuhan potongan. Nilai `allowRotation` global pada cutting engine tidak boleh diaktifkan untuk campuran stok yang memiliki kebijakan rotasi berbeda.

Kerf tidak boleh dipotong dua kali. Dimensi record sisa adalah ukuran fisik bersih yang diukur setelah pemotongan sebelumnya. Kerf hanya diterapkan pada pemotongan baru yang sedang dihitung. Batas minimum ukuran sisa bukan pengganti pemeriksaan kecocokan material.

## 5. Strategi pencocokan dengan mesin pemotongan saat ini

`MaterialCuttingEngine.calculateCutting()` menerima satu pasangan `sheetW/sheetH` dalam satu pemanggilan. Karena stok inventaris dapat memiliki ukuran berbeda, matcher menjadi pengatur sumber:

- Kelompokkan kandidat berdasarkan kompatibilitas material dan kebijakan orientasi.
- Urutkan kandidat dengan skor yang terdokumentasi: kecocokan dimensi/limbah terkecil terlebih dahulu, lalu umur stok tertua sebagai pemecah seri.
- Evaluasi satu unit remainder menggunakan ukuran unit tersebut. Jangan menganggap satu pemanggilan cutting engine dapat mencampur beberapa ukuran sumber.
- Ambil hanya penempatan yang benar-benar berasal dari unit fisik yang sedang dievaluasi. Kandidat yang tidak muat dilewati.
- Setelah stok remainder yang cocok dipertimbangkan, kalkulasi kebutuhan lembar baru sebagai fallback.
- Kembalikan rincian sumber setiap potongan: `new` atau `inventory`, ID remainder/sheet, orientasi, dan ukuran sisa.

Matcher tidak boleh menyatakan stok terpakai sebelum reservasi berhasil disimpan. Algoritma tetap heuristik; hasilnya bukan jaminan optimasi global.

## 6. Penyimpanan offline dengan IndexedDB

Nama database: `KalkulatorMaterialDB`, versi awal 1. Object store:
- `materials` (keyPath `id`)
- `jobs` (keyPath `id`)
- `remainders` (keyPath `id`; index `status`, `materialId`, `originJobId`)
- `reservations` (keyPath `id`; index `remainderId`, `jobId`, `status`)
- `movements` (keyPath `id`; index `remainderId`, `jobId`, `timestamp`)
- `meta` (keyPath `key`; versi skema dan waktu ekspor terakhir).

Operasi reservasi harus berada dalam satu transaksi IndexedDB yang mencakup `remainders`, `reservations`, dan `movements`: baca ulang status/version, pastikan masih `available`, ubah ke `reserved`, buat reservasi dan movement. Jika status sudah berubah, transaksi dibatalkan dan matcher harus memilih ulang.

Operasi konsumsi juga atomik: validasi reservasi aktif, tandai sumber `consumed`, catat movement, buat semua remainder turunan, dan catat movement pembentukannya dalam transaksi yang sama. Jika salah satu langkah gagal, seluruh transaksi batal.

IndexedDB adalah sumber data operasional offline. JSON adalah ekspor/impor/cadangan. ID dibuat dengan `crypto.randomUUID()` bila tersedia; fallback harus tetap menghasilkan ID unik dan diuji.

## 7. Modul JavaScript yang direncanakan

- `assets/js/inventory-validator.js`: validasi skema, dimensi, referensi, status, kompatibilitas.
- `assets/js/inventory-storage.js`: pembukaan DB, migrasi versi, CRUD, transaksi reservasi/konsumsi, impor-ekspor.
- `assets/js/inventory-engine.js`: alur bisnis stok, pembentukan sisa baru, status dan riwayat.
- `assets/js/inventory-matcher.js`: pencocokan kandidat satu unit sisa, orientasi, kerf, dan ranking.
- `assets/js/inventory-planner.js`: perencanaan multi-sumber; memakai unit inventaris satu per satu, lalu meneruskan potongan yang belum terpenuhi ke `cutting-adapter.js` untuk lembar baru. Modul ini hanya menghitung rencana dan tidak mengunci atau mengubah stok.

Semua modul harus dapat diuji di Node.js dengan dependency injection untuk storage/IndexedDB mock. Browser menggunakan IndexedDB asli.

## 8. Integrasi dengan adapter dan UI

Integrasi dilakukan secara bertahap dan opsional. Jalur kalkulasi lama tanpa inventaris harus menghasilkan keluaran yang sama seperti sebelumnya. Perencanaan multi-sumber ditempatkan pada `inventory-planner.js`; adapter lama tetap menjadi jalur kalkulasi lembar baru dan tidak diubah.

Alur baru:
1. UI memilih/membuat pekerjaan aktif dan spesifikasi material.
2. Adapter menerima konteks inventaris opsional.
3. Matcher mencari kandidat dan menghitung sumber inventory serta lembar baru.
4. UI menampilkan rincian kandidat dan meminta konfirmasi penggunaan/reservasi.
5. Setelah konfirmasi, storage melakukan reservasi atomik.
6. Setelah pemotongan dikonfirmasi selesai, transaksi konsumsi mencatat penggunaan dan menyimpan sisa turunan.
7. Jika kalkulasi dibatalkan sebelum pemotongan fisik, reservasi dilepas.

Tidak boleh mengubah stok hanya karena pengguna menekan tombol hitung. Perubahan stok terjadi pada tindakan konfirmasi reservasi/pemakaian yang jelas.

## 9. Rencana pengujian wajib

1. Validator: data valid, ID duplikat, referensi yatim, dimensi negatif/nol, status salah.
2. Matcher: material beda, ketebalan beda, motif/serat, rotasi diizinkan/dilarang, cukup/tidak cukup ukuran, kerf.
3. Storage: simpan-baca, ekspor-impor, upgrade skema, kegagalan transaksi.
4. Reservasi: satu stok tidak dapat dipesan dua pekerjaan; pembatalan mengembalikan status.
5. Siklus lintas pekerjaan: sisa A tersedia -> dipesan B -> dikonsumsi B -> sisa turunan B tersedia untuk C.
6. Regresi: tiga test suite lama tetap lulus tanpa perubahan hasil.
7. Browser: data tetap ada setelah refresh dan browser ditutup/dibuka kembali; UI menunjukkan asal stok dan riwayatnya.

## 10. Urutan implementasi

A. Finalisasi dan tinjau skema data.  
B. Buat validator dan pengujian unit.  
C. Buat IndexedDB storage dan pengujian transaksi.  
D. Buat engine/matcher dengan data uji.  
E. Integrasikan secara opsional ke adapter; pertahankan jalur lama.  
F. Uji siklus A-B-C dan seluruh regresi.  
G. Baru bangun UI inventaris.  
H. Hapus/ubah `makeStok()` hanya setelah pengganti lulus semua pengujian dan perbandingan perilaku.

**Belum ada kode aplikasi yang diubah oleh dokumen rancangan ini.** Implementasi dimulai setelah skema dan aturan ini ditinjau.


## 11. Status implementasi saat ini

- Tahap 1: validator inventaris selesai dan lulus pengujian.
- Tahap 2: IndexedDB storage, reservasi, pelepasan, konsumsi atomik, dan impor-ekspor selesai dan lulus pengujian.
- Tahap 3: inventory engine untuk membentuk sisa turunan selesai dan lulus pengujian.
- Tahap 4: matcher kandidat satu unit sisa selesai dan lulus pengujian.
- Tahap 5 awal: `inventory-planner.js` telah dibuat untuk memilih beberapa unit sisa secara berurutan, kemudian memakai lembar baru sebagai fallback. Pengujian lokal tahap ini masih menunggu dijalankan.

Planner tidak melakukan reservasi. Setelah rencana ditinjau pengguna, lapisan integrasi berikutnya harus mengunci setiap unit sumber secara atomik. Jika salah satu reservasi gagal, rencana harus dihitung ulang atau reservasi yang sudah berhasil harus dilepas. Konsumsi baru dilakukan setelah pemotongan fisik dikonfirmasi.
