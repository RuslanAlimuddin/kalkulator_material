# Posisi Audit Terkini — Kalkulator Material Bangunan

> Dokumen posisi kerja yang diperbarui pada setiap tahap audit bermakna. Baca bersama `docs/PROMPT_LANJUTAN_PROYEK.md`. Dokumen ini lebih diutamakan untuk mengetahui pekerjaan terakhir yang sedang berjalan; pointer branch/HEAD tetap wajib diverifikasi langsung di GitHub.

## Identitas kerja
- Repository: https://github.com/RuslanAlimuddin/kalkulator_material
- Branch wajib: `pengembangan-mesin-hitung`
- Jangan mengubah `main`; jangan merge tanpa persetujuan eksplisit.
- HEAD saat catatan ini disusun: `35f3d4dfbba54f936bcea0165ce30c2f91d7ec6a` (`docs: clarify handoff revision history`). Ini adalah HEAD yang berhasil dibaca langsung sebelum pembaruan dokumen ini; setelah commit catatan ini, HEAD akan berubah. Selalu baca pointer branch terbaru, jangan memakai SHA statis ini sebagai patokan selamanya.

## Aturan kerja
- Jangan mengulang audit yang telah tuntas tanpa perubahan kode atau alasan teknis.
- Jangan mengubah kode kecuali ada cacat yang dibuktikan.
- Setiap perbaikan kode wajib disertai tes regresi.
- Setelah perubahan, periksa seluruh CI yang relevan pada commit terbaru.
- Jangan meminta uji manual pengguna sebelum audit teknis terkait selesai.
- Catat temuan sementara dan langkah berikutnya di dokumen ini sebelum berpindah tahap/percakapan bila memungkinkan.

## Status audit terkini

### 1. HEAD dan workflow CI — selesai diverifikasi
Sebelum pembaruan dokumen, pointer branch langsung menunjuk ke `35f3d4dfbba54f936bcea0165ce30c2f91d7ec6a`.

Direktori `.github/workflows` memiliki empat workflow:
1. `.github/workflows/browser-indexeddb.yml` — memasang Playwright dan Chromium; menjalankan `tests/browser/indexeddb.test.js`, `tests/browser/inventory-plan-recovery.test.js`, `tests/browser/inventory-ui.test.js`, dan `tests/browser/inventory-preview.test.js`.
2. `.github/workflows/inventory-batch.yml` — menjalankan `tests/inventory-storage-batch.test.js`.
3. `.github/workflows/inventory-regression.yml` — menjalankan `npm run test:inventory` dan `npm run test:regression`.
4. `.github/workflows/test.yml` — menjalankan rangkaian tes inventaris dan regresi yang sama.

Pada HEAD tersebut, empat check-run GitHub semuanya berstatus `completed` dengan kesimpulan `success`:
- `browser-indexeddb`
- `batch-reservation`
- `inventory-and-regression`
- `test`

Jadi, dugaan lama bahwa tes browser belum terhubung ke CI adalah keliru dan telah dikoreksi. Tidak perlu menambah workflow Playwright atau dependensi Playwright ke `package.json` hanya untuk tujuan itu. Pengujian browser sudah dijalankan oleh workflow khusus.

### 2. Audit alur harga dan inventaris — ditelusuri, makna bisnis masih terbuka
File yang diperiksa:
- `index.html`
- `assets/js/pricing-engine.js`
- `assets/js/inventory-preview-ui.js`
- `assets/js/inventory-app-bridge.js`
- `tests/pricing-engine.test.js`
- `tests/browser/inventory-preview.test.js`

Temuan:
- Kalkulator utama menghitung `totalSheets` dari `MaterialCuttingAdapter`, lalu memberikan angka tersebut ke `MaterialPricingEngine.calculatePricing()`.
- Mesin harga menghitung pembelian berdasarkan jumlah lembar hasil kalkulasi utama; untuk harga kemasan, jumlah kemasan dibulatkan ke atas.
- Pratinjau inventaris berjalan melalui jalur terpisah. Ringkasan pratinjau memisahkan `sheetCount`, `inventorySheetCount`, dan `newSheetCount`.
- `inventory-app-bridge.js` membangun input geometri dan meneruskan rencana ke workflow inventaris, tetapi tidak mengirim `newSheetCount` ke mesin harga dan tidak memperbarui kotak estimasi biaya kalkulator.
- Tes browser memang menguji kalkulator harga dan pemanfaatan sisa inventaris pada pratinjau, tetapi tidak menguji bahwa estimasi biaya berubah mengikuti jumlah lembar baru setelah inventaris dipakai.

Kesimpulan sementara:
- Kedua jalur memang belum terhubung untuk menghasilkan satu angka biaya yang memperhitungkan inventaris.
- Belum dapat dinyatakan sebagai bug sebelum definisi angka pada UI ditetapkan: apakah biaya pembelian material baru setelah stok sisa digunakan, atau nilai total kebutuhan material tanpa memperhitungkan stok yang telah dimiliki.
- Label UI saat ini adalah “Estimasi Total Biaya Material”, sedangkan detail menyebut kebutuhan lembar dari kalkulasi utama. Ada potensi ambiguitas bagi pengguna.
- Jangan mengubah kode sebelum makna biaya disepakati. Rancangan yang layak dipertimbangkan adalah memisahkan “nilai kebutuhan material” dan “estimasi pembelian baru setelah inventaris”, bukan mencampur dua konsep tersebut.

### 3. Validasi input antarmodul — pemeriksaan awal, belum selesai
Pemeriksaan awal:
- `pricing-engine.js` memvalidasi jumlah lembar bilangan bulat nonnegatif, luas material positif, luas bidang nonnegatif, harga nonnegatif, satuan harga yang dikenal, dan isi kemasan bilangan bulat minimal satu.
- Input harga UI memakai `type="number"`, `min="0"`, dan `step="1000"`; isi kemasan memakai `type="number"`, `min="1"`, dan `step="1"`.
- `inventory-app-bridge.js` memvalidasi ukuran bidang/material positif, orientasi 0/1, mode presisi/ekonomis, jarak nat/kerf/ukuran minimum sisa nonnegatif, dan ID pekerjaan/material.
- `engine.js` memvalidasi ukuran positif, gap nonnegatif, pola, arah, dan alignment.
- `cutting-adapter.js` dan `cutting-engine.js` memvalidasi ukuran lembar/potongan positif, kerf dan ukuran minimum sisa nonnegatif, serta kuantitas potongan bulat positif.

Belum ditemukan cacat yang cukup kuat untuk membenarkan perubahan kode pada pemeriksaan awal ini. Lanjutkan audit lintas batas untuk nilai kosong, string numerik, nilai ekstrem, ketidaksesuaian aturan UI dan mesin, serta validasi material/arah serat. Jangan menganggap pemeriksaan awal ini sebagai audit validasi final.

### 4. Transaksi inventaris — pemeriksaan statis sebelumnya
Pemeriksaan statis sebelumnya pada `inventory-storage.js`, `inventory-engine.js`, `inventory-workflow.js` dan tes terkait menunjukkan reservasi/konsumsi multi-sumber memakai transaksi IndexedDB `readwrite`; ada tes rollback, konflik penggunaan sumber, dan kegagalan konsumsi agar data tidak berubah sebagian. Ini adalah temuan statis dan cakupan tes; jangan menyebutnya sebagai eksekusi ulang tes kecuali CI terbaru memang diperiksa.

## File yang diperiksa pada tahap terakhir
- `.github/workflows/browser-indexeddb.yml`
- `.github/workflows/inventory-batch.yml`
- `.github/workflows/inventory-regression.yml`
- `.github/workflows/test.yml`
- `package.json`
- `index.html`
- `assets/js/pricing-engine.js`
- `assets/js/inventory-preview-ui.js`
- `assets/js/inventory-app-bridge.js`
- `assets/js/engine.js`
- `assets/js/cutting-adapter.js`
- `assets/js/cutting-engine.js`
- `tests/pricing-engine.test.js`
- `tests/inventory-app-bridge.test.js`
- `tests/browser/inventory-preview.test.js`

## Pekerjaan berikutnya — urutan wajib
1. Lanjutkan audit validasi input lintas modul; fokus pada kasus batas dan ketidaksesuaian yang belum tercakup tes. Hindari tes duplikat yang sudah ada.
2. Telusuri jalur penyimpanan, transaksi, pemulihan, dan kegagalan di titik yang belum ter-cover; audit transaksi dasar yang sudah diperiksa tidak perlu diulang.
3. Kembali ke keputusan makna estimasi biaya: pisahkan konsep nilai kebutuhan vs biaya pembelian baru setelah inventaris. Jangan meminta keputusan pengguna sebelum menyajikan ringkasan opsi yang konkret dan konsekuensinya.
4. Jika ditemukan cacat nyata, tambahkan tes regresi dan perbaiki hanya di branch kerja.
5. Setelah tahap audit/perubahan, perbarui dokumen ini dan verifikasi CI pada HEAD terbaru.
6. Setelah audit teknis selesai, baru berikan daftar uji manual yang benar-benar perlu dilakukan pengguna.

## Prosedur pemulihan percakapan
Jika percakapan terputus mendadak, cukup mulai percakapan baru dengan:
> Lanjutkan proyek Kalkulator Material Bangunan. Baca `docs/PROMPT_LANJUTAN_PROYEK.md` dan `docs/STATUS_AUDIT_TERKINI.md`, verifikasi branch serta HEAD aktual di GitHub, lalu lanjutkan dari bagian “Pekerjaan berikutnya” tanpa mengulang audit yang sudah selesai.

Jika dokumen ini belum sempat diperbarui, rekonstruksi posisi dari commit, file, hasil CI, dan catatan yang tersedia. Tandai ketidakpastian secara terbuka; jangan menebak.
