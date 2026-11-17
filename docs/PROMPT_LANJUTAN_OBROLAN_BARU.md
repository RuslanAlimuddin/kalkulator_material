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


## Status tambahan per 17 November 2026
- Pengguna sudah menjalankan `node tests/engine.test.js` pada PC Windows dengan Node.js v24.18.0; seluruh tes geometri lulus.
- Mesin pemotongan awal sudah ditambahkan: `assets/js/cutting-engine.js`.
- Tesnya: `tests/cutting-engine.test.js`.
- Desain dan batasannya: `docs/DESAIN_MESIN_PEMOTONGAN.md`.
- Sebelum integrasi UI, minta pengguna mengunduh ZIP terbaru branch ini dan menjalankan:
  ```cmd
  node tests\engine.test.js
  node tests\cutting-engine.test.js
  ```
- Pengujian cutting-engine baru lulus di pengujian JavaScript terisolasi, belum di Node.js PC pengguna.
- Jangan menganggap cutting engine sudah terintegrasi. `index.html` masih memakai `makeStok()` lama. Integrasikan hanya setelah tes lokal kedua mesin lulus dan kontrak input-output diperiksa.
