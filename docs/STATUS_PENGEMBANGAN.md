# Status Pengembangan — Mesin Geometri

> **Catatan:** Dokumen ini adalah catatan tahap awal pembentukan mesin geometri, bukan status terkini seluruh proyek. Status terbaru mencakup mesin pemotongan dan integrasi inventaris yang dijelaskan pada dokumen desain serta panduan workflow.

Cabang: `pengembangan-mesin-hitung`

## Yang sudah dikerjakan

1. Membuat `assets/js/engine.js` sebagai mesin geometri JavaScript murni. Mesin ini tidak membaca elemen HTML dan dapat dipanggil dari browser maupun Node.js.
2. Memindahkan perhitungan posisi panel pada bidang ke fungsi `MaterialEngine.calculateGeometry()`.
3. Menghubungkan `index.html` ke mesin tersebut. Hasil geometri baru dipakai untuk membentuk sel pemasangan dan diteruskan ke mekanisme reuse lama.
4. Membuat `tests/engine.test.js` untuk pengujian yang dapat diulang.

## Cakupan yang telah diuji

- Stack Bond.
- Running Bond dengan arah horizontal dan vertikal.
- Third Bond dengan arah horizontal dan vertikal.
- Sembilan alignment.
- Validasi ukuran nol dan jarak nat negatif.
- Pemeriksaan bahwa panel tidak saling tumpang tindih dan bidang tertutup pada pengujian tanpa nat.
- Sintaks JavaScript mesin dan skrip utama HTML.

Matriks pengujian mencakup 54 kombinasi pola, arah, dan alignment. Pengujian geometri berhasil dijalankan.

## Cara menjalankan pengujian

Dari folder utama proyek, buka terminal dan jalankan:

```bash
node tests/engine.test.js
```

Node.js diperlukan hanya untuk menjalankan pengujian otomatis. Aplikasi tetap dapat dibuka melalui Live Server atau sebagai HTML lokal sesuai dukungan browser.

## Batasan yang belum diselesaikan

- Penghitungan jumlah lembar sumber masih menggunakan mekanisme lama berbasis potongan grid dan stok sisa sederhana.
- Belum ada algoritma pemotongan 2D (menyusun beberapa potongan pada satu lembar sumber secara terencana).
- Angka sisa belum boleh dianggap sebagai limbah aktual.
- Diagram yang tampil masih diagram pemasangan pada bidang, belum diagram pemotongan lembar sumber.
- Pengujian otomatis geometri belum menggantikan uji visual di browser pada seluruh kombinasi input.

Karena itu, perubahan ini memperbaiki fondasi dan geometri pemasangan, tetapi belum menjadikan estimasi jumlah lembar sebagai hasil optimasi pemotongan yang dijamin paling hemat.
