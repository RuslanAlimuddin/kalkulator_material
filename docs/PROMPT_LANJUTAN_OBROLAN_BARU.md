# PROMPT MELANJUTKAN KALKULATOR MATERIAL DI OBROLAN BARU

Kita melanjutkan proyek **Kalkulator Material Bangunan** dari percakapan sebelumnya.

Repositori: https://github.com/RuslanAlimuddin/kalkulator_material  
Branch kerja: `pengembangan-mesin-hitung`

**Langkah pertama wajib:**
1. Buka dan baca `docs/SERAH_TERIMA_OBROLAN.md`.
2. Baca dokumen acuan dan kode yang disebutkan di dalamnya, terutama `docs/RENCANA_REFAKTOR.md`, `docs/RUMUS_PERHITUNGAN.md`, `tests/KASUS_UJI_AWAL.md`, `assets/js/engine.js`, `tests/engine.test.js`, dan `index.html` pada branch pengembangan.
3. Periksa commit dan kondisi repo terbaru. Jangan hanya mengandalkan ringkasan percakapan.
4. Lanjutkan dari tahap terakhir yang benar-benar selesai. Jangan mengulang audit atau pekerjaan yang sudah selesai.

**Aturan kerja:**
- Semua perubahan kode hanya di branch `pengembangan-mesin-hitung`; jangan mengubah `main`.
- Jangan menghapus atau menimpa backup.
- Aplikasi harus tetap HTML/CSS/JavaScript murni dan dapat berjalan offline.
- Pisahkan geometri pemasangan dari optimasi pemotongan lembar sumber.
- Bedakan kebutuhan lembar, pembelian, stok tersisa, sisa potongan, dan limbah.
- Jangan mengklaim tes lulus atau aplikasi berfungsi sebelum benar-benar diuji.
- Kerjakan langsung di GitHub bila koneksi tersedia agar saya tidak perlu menyalin kode manual.
- Gunakan bahasa Indonesia sederhana, jelaskan istilah teknis secara singkat, dan berikan instruksi praktis hanya jika saya perlu melakukan sesuatu.
- Setelah perubahan penting, jalankan tes dan perbarui `docs/SERAH_TERIMA_OBROLAN.md` agar perpindahan obrolan berikutnya tetap mudah.

Sekarang mulai dengan membaca dokumen serah-terima dan memeriksa status repo terbaru, lalu lanjutkan pekerjaan.


## Status terakhir per 17 November 2026 — integrasi awal pemotongan
- Pengguna menjalankan di PC Windows dan melaporkan lulus: `node tests/engine.test.js` dan `node tests/cutting-engine.test.js`.
- Mesin geometri: `assets/js/engine.js`; tes: `tests/engine.test.js`.
- Mesin pemotongan: `assets/js/cutting-engine.js`; tes: `tests/cutting-engine.test.js`.
- Adapter baru: `assets/js/cutting-adapter.js`; tes baru: `tests/cutting-adapter.test.js`.
- `index.html` sudah memuat dua modul pemotongan dan menggunakan adapter untuk menentukan lembar sumber. Koordinat grid pemasangan tetap dipertahankan agar visualisasi lama tidak berubah kontraknya.
- Mode Presisi tetap satu lembar per grid, kecuali aturan strip panjang khusus. Mode Ekonomis mengemas potongan bersama dan mengizinkan rotasi.
- Hasil UI sekarang membedakan sisa persegi panjang tercatat dan area belum terklasifikasi; jangan menyebut area belum terklasifikasi sebagai limbah.
- `makeStok()` masih ada sebagai cadangan tetapi tidak lagi dipanggil oleh kalkulasi utama. Jangan hapus sebelum regresi browser selesai.
- Pengguna telah menjalankan ketiga suite di PC Windows dan melaporkan semuanya lulus: `node tests/engine.test.js`, `node tests/cutting-engine.test.js`, dan `node tests/cutting-adapter.test.js`.
- Tes unit tiga lapisan sudah lulus secara lokal, tetapi integrasi UI belum diverifikasi melalui browser/Live Server.

**Langkah pertama obrolan berikutnya:** minta hasil tes lokal berikut dari ZIP terbaru branch:
```cmd
node tests\\engine.test.js
node tests\\cutting-engine.test.js
node tests\\cutting-adapter.test.js
```
Setelah ketiganya lulus, pandu uji browser mode Presisi/Ekonomis, kasus strip 600×100 cm, rotasi, harga per lembar, dan harga per kemasan. Jangan mengubah branch `main` atau menghapus backup.


## Status terbaru per 18 November 2026
Pengguna telah mengonfirmasi hasil uji browser/Live Server: nilai bawaan normal; Presisi vs Ekonomis memiliki sedikit perbedaan angka; kasus strip panjang benar; harga material masuk akal; Console tidak memiliki pesan merah.

Sebelumnya, pengguna juga melaporkan ketiga suite Node.js lokal lulus:

    node tests\engine.test.js
    node tests\cutting-engine.test.js
    node tests\cutting-adapter.test.js

Kesimpulan status: integrasi awal mesin geometri, adapter, dan mesin pemotongan sudah melewati tes unit lokal serta uji manual awal browser. Jangan ulangi tahap integrasi atau meminta pengguna menjalankan tes yang sama tanpa alasan. Lanjutkan dengan memeriksa kode dan makna hasil yang ditampilkan, audit laporan/stok/harga, lalu susun tahap pengembangan lanjutan. Perhatikan keterbatasan yang tercatat di bagian 15 docs/SERAH_TERIMA_OBROLAN.md.

Tetap kerjakan hanya di branch pengembangan-mesin-hitung. Jangan mengubah main, jangan menghapus backup, dan jangan menghapus makeStok() sebelum audit pemakaian dan regresi terpisah.
