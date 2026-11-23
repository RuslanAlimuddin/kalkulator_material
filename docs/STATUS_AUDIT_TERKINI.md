# Posisi Audit Terkini — Kalkulator Material Bangunan

> Dokumen posisi kerja yang diperbarui pada setiap tahap audit bermakna. Baca bersama `docs/PROMPT_LANJUTAN_PROYEK.md`. Dokumen ini lebih diutamakan untuk mengetahui pekerjaan terakhir yang sedang berjalan; pointer branch/HEAD tetap wajib diverifikasi langsung di GitHub.

## Identitas kerja
- Repository: https://github.com/RuslanAlimuddin/kalkulator_material
- Branch wajib: `pengembangan-mesin-hitung`
- Jangan mengubah `main`; jangan merge tanpa persetujuan eksplisit.
- HEAD kode terbaru yang sudah diverifikasi: `c5970257d3415029ea70b537d6d70e73486df10a` (`test: restore recovery fixtures after corruption checks`). Perubahan ini menambah tes fail-closed saat snapshot dan status sumber tidak konsisten, serta memulihkan fixture setelah simulasi kerusakan. Empat CI pada SHA ini sudah diverifikasi `completed/success`.

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

Pada HEAD dokumentasi sebelum perbaikan, empat check-run GitHub semuanya `completed/success`. Setelah perbaikan validasi adapter pada commit `f3dfe56c3e13ee8794d5ac57cfa64b4db66c9816`, keempat check-run kembali diverifikasi `completed/success`:
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
- `tests/browser/inventory-preview.test.js`\n- `inventaris.html`\n- `assets/js/inventory-ui.js`\n- `assets/js/inventory-storage.js`\n- `assets/js/inventory-validator.js`\n- `tests/inventory-storage.test.js`

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

### 3. Validasi input antarmodul — sebagian diperbaiki, audit lanjutan tetap terbuka
Pemeriksaan awal:
- `pricing-engine.js` memvalidasi jumlah lembar bilangan bulat nonnegatif, luas material positif, luas bidang nonnegatif, harga nonnegatif, satuan harga yang dikenal, dan isi kemasan bilangan bulat minimal satu.
- Input harga UI memakai `type="number"`, `min="0"`, dan `step="1000"`; isi kemasan memakai `type="number"`, `min="1"`, dan `step="1"`.
- `inventory-app-bridge.js` memvalidasi ukuran bidang/material positif, orientasi 0/1, mode presisi/ekonomis, jarak nat/kerf/ukuran minimum sisa nonnegatif, dan ID pekerjaan/material.
- `engine.js` memvalidasi ukuran positif, gap nonnegatif, pola, arah, dan alignment.
- `cutting-adapter.js` dan `cutting-engine.js` memvalidasi ukuran lembar/potongan positif, kerf dan ukuran minimum sisa nonnegatif, serta kuantitas potongan bulat positif.

Temuan konkret pada `cutting-adapter.js`: mode tidak dikenal diam-diam diperlakukan seperti mode Presisi, dan jalur geometri kosong mengembalikan hasil sebelum memvalidasi kerf serta batas minimum sisa. Keduanya diperbaiki pada commit `f3dfe56c3e13ee8794d5ac57cfa64b4db66c9816`; tes regresi ditambahkan pada `tests/cutting-adapter.test.js`. Empat CI pada commit perbaikan semuanya lulus, termasuk tes regresi dan browser. Audit lanjutan pada `inventaris.html`, `assets/js/inventory-ui.js`, `assets/js/inventory-storage.js`, `assets/js/inventory-validator.js`, dan tes terkait menemukan satu cacat nyata: formulir hanya menampilkan pekerjaan `open`, tetapi `createRemainder()` sebelumnya hanya memeriksa keberadaan pekerjaan. API penyimpanan dapat menerima pencatatan sisa pada pekerjaan `completed` atau `archived`, berbeda dengan batas yang dipakai reservasi, konsumsi, dan pembuatan sisa lembar baru. Perbaikan menambahkan pemeriksaan `job.status === "open"` di dalam transaksi yang sama sebelum menulis sisa dan movement. Tes regresi baru memeriksa kedua status tertutup serta memastikan tidak ada sisa maupun movement yang tersimpan. Arah serat tetap berupa teks bebas sesuai desain formulir; tidak boleh dibatasi ke enum buatan. Pemeriksaan form material, dimensi, ketebalan, kondisi, dan pemetaan kebijakan rotasi tidak menghasilkan cacat tambahan yang terbukti pada tahap ini.

### 3A. CRUD katalog material — cacat ditemukan, diperbaiki, dan CI lulus
File:
- `assets/js/inventory-storage.js`
- `tests/inventory-storage.test.js`
- Pembanding skema: `assets/js/inventory-validator.js`

Temuan:
- Validator bundle menetapkan tipe/nilai yang valid untuk field material: nama/kategori/motif tidak kosong bila tersedia, ketebalan angka finite positif, `grainRequired` boolean, `rotationPolicy` salah satu `free`/`quarter_turn`/`fixed`, `active` boolean, dan `surface` bila diisi harus berupa teks tidak kosong.
- Sebelum perbaikan, CRUD umum `add`, `put`, dan `update` tidak memvalidasi field katalog tersebut. Contohnya, ketebalan negatif atau kebijakan rotasi tak dikenal dapat tersimpan melalui API meski impor bundle akan menolaknya.
- Perbaikan menambahkan validasi konsistensi field yang diberikan pada ketiga jalur CRUD.
- Kompatibilitas penting: tes CRUD lama memang menggunakan record minimal (hanya ID dan nama). Karena itu, validasi tidak memaksa semua field opsional skema lengkap harus selalu ada; field yang disertakan harus valid. Validasi impor bundle tetap menjadi pemeriksaan skema penuh.
- Tes regresi menguji ketebalan nol/negatif/Infinity, tipe boolean salah, kebijakan rotasi tidak dikenal, field teks kosong, serta memastikan add/put/update menolak tanpa mengubah data.

Percobaan CI pertama pada implementasi yang terlalu ketat gagal karena memutus kontrak CRUD minimal yang sudah diuji. Implementasi kemudian dilonggarkan secara tepat agar mempertahankan kompatibilitas. Pada commit final `b3d0f33bb2a86704db913dd176aa53f1f6479af9`, empat check-run semuanya `completed/success`: `browser-indexeddb`, `batch-reservation`, `test`, dan `inventory-and-regression`.

### 3B. CRUD pekerjaan — cacat ditemukan, diperbaiki, dan CI lulus
File:
- `assets/js/inventory-storage.js`
- `tests/inventory-storage.test.js`
- Pembanding skema: `assets/js/inventory-validator.js`

Temuan:
- Sebelum perbaikan, `add()` dan `put()` untuk store `jobs` hanya memeriksa status pekerjaan.
- `update()` hanya memvalidasi status jika field itu diubah. Nama dan timestamp tidak divalidasi pada jalur CRUD umum.
- Validator bundle sebenarnya mewajibkan nama pekerjaan tidak kosong, `createdAt` berupa ISO UTC yang valid, `closedAt` null atau ISO UTC valid, `closedAt` tidak mendahului `createdAt`, dan pekerjaan `open` harus memiliki `closedAt: null`.
- Ini berarti record invalid dapat ditulis melalui CRUD lalu ditolak saat ekspor/impor bundle atau pemeriksaan integritas berikutnya.

Perbaikan:
- Tambah dan put sekarang memvalidasi record pekerjaan lengkap sesuai aturan di atas.
- Update menggabungkan perubahan parsial dengan record lama, lalu memvalidasi hasil akhirnya sebelum menyimpan; transaksi dibatalkan bila tidak valid.
- Pemeriksaan status dipisahkan dari pemeriksaan record lengkap agar kontrak error lama tetap terjaga dan validasi penutupan dengan reservasi/rencana tertunda tetap berjalan.
- Tes regresi menguji nama kosong/whitespace, tanggal tidak valid, tanggal kalender mustahil, urutan tanggal terbalik, dan status open dengan closedAt terisi. Add/put/update harus menolak dan tidak menyimpan perubahan.

CI pada commit `d4caf68c053369afd1c46b8584a25b188a5188fa`:
- `inventory-and-regression` — completed/success
- `test` — completed/success
- `browser-indexeddb` — completed/success
- `batch-reservation` — completed/success

### 4. Transaksi inventaris — pemeriksaan statis sebelumnya
Pemeriksaan statis sebelumnya pada `inventory-storage.js`, `inventory-engine.js`, `inventory-workflow.js` dan tes terkait menunjukkan reservasi/konsumsi multi-sumber memakai transaksi IndexedDB `readwrite`; ada tes rollback, konflik penggunaan sumber, dan kegagalan konsumsi agar data tidak berubah sebagian. Ini adalah temuan statis dan cakupan tes; jangan menyebutnya sebagai eksekusi ulang tes kecuali CI terbaru memang diperiksa.

### 4A. Pemulihan rencana setelah browser ditutup — cakupan diperluas, seluruh CI lulus
File:
- `tests/browser/inventory-plan-recovery.test.js`
- Jalur implementasi yang diverifikasi: `assets/js/inventory-engine.js`, `assets/js/inventory-storage.js`

Temuan audit:
- Tes browser sebelumnya membuat reservasi, menutup seluruh persistent Chromium context, membuka ulang profil browser yang sama, memulihkan snapshot, lalu membatalkan rencana.
- Tes unit konsumsi rencana sudah menguji konsumsi dan rollback, tetapi belum membuktikan jalur konsumsi melalui snapshot yang dipulihkan setelah browser benar-benar ditutup.
- Ini merupakan kekurangan cakupan pengujian, bukan bukti cacat implementasi.

Perluasan:
- Satu skenario browser kini menyiapkan dua rencana tersimpan sebelum browser ditutup.
- Setelah browser dibuka kembali menggunakan profil persisten yang sama, rencana pertama dipulihkan dan dibatalkan; status rencana menjadi `cancelled`, stok sumber kembali `available`.
- Rencana kedua dipulihkan dan diselesaikan; status rencana menjadi `completed`, stok sumber menjadi `consumed`.
- Log CI mengonfirmasi pesan lulus tes pemulihan, pembatalan, dan penyelesaian setelah restart.

Commit tes: `9c8fdd9cd44e4c53fabe494aa9d08f0b95c027ca`.
Empat check-run pada commit tersebut semuanya `completed/success`:
- `browser-indexeddb`
- `batch-reservation`
- `inventory-and-regression`
- `test`

Batas kesimpulan: pengujian ini membuktikan persistensi dan pemulihan setelah browser ditutup secara normal, bukan simulasi pemadaman listrik atau penghentian proses paksa di setiap instruksi transaksi. Atomicity transaksi IndexedDB tetap ditopang oleh tes rollback yang sudah ada.

### 4B. Snapshot tidak konsisten dan kegagalan pemulihan — pengujian diperluas, seluruh CI lulus
File:
- `tests/inventory-engine-cancel-plan.test.js`
- `tests/inventory-plan-recovery.test.js`
- Implementasi yang diaudit: `assets/js/inventory-engine.js`, `assets/js/inventory-storage.js`

Temuan:
- Jalur `restorePlan()` memverifikasi snapshot aktif, daftar ID reservasi, relasi reservasi-pekerjaan-sumber, status sumber `reserved`, kondisi sumber `good`, dan kecocokan material.
- Tes pemulihan yang sudah ada juga menguji sumber hilang, status sumber salah, hubungan pekerjaan salah, snapshot historis yang tidak cocok, orphan, ketidaksesuaian movement, migrasi database lama, serta pemulihan multi-sumber.
- Jalur pembatalan/penyelesaian memakai validasi ulang di dalam transaksi storage; tes rollback sebelumnya sudah membuktikan kegagalan satu item tidak menyisakan perubahan parsial.

Perluasan regresi baru:
- Snapshot dengan daftar `reservationIds` yang tidak cocok ditolak oleh `restorePlan()` dan `cancelPlan()`.
- Sumber yang statusnya tidak lagi `reserved` ditolak oleh pemulihan dan pembatalan.
- Kedua kegagalan tidak mengubah status rencana atau reservasi dan tidak melakukan pelepasan stok tambahan.
- Fixture (data uji) dipulihkan setelah simulasi korupsi sehingga ekspor bundle berikutnya tetap valid.

Catatan pengujian:
- Commit awal pengujian gagal karena fixture yang sengaja dirusak tidak dipulihkan sebelum tes ekspor cadangan. Ini kegagalan pada kebersihan data uji, bukan cacat aplikasi.
- Fixture diperbaiki; log CI menunjukkan tes baru lulus.
- Commit final: `c5970257d3415029ea70b537d6d70e73486df10a`.
- Keempat check-run pada HEAD final `completed/success`: `test`, `inventory-and-regression`, `batch-reservation`, dan `browser-indexeddb`.

Kesimpulan:
- Belum ditemukan cacat implementasi baru pada pemulihan snapshot dan pembatalan yang diuji.
- Tidak perlu mengubah kode produksi pada tahap ini. Fokus berikutnya beralih ke validasi batas API untuk record transaksi (reservasi, rencana, movement, dan sisa material), tanpa mengulang pemeriksaan CRUD material/pekerjaan yang sudah selesai.

### 5. Perbaikan validasi adapter — selesai dan CI lulus
- Commit: `f3dfe56c3e13ee8794d5ac57cfa64b4db66c9816`.
- File kode: `assets/js/cutting-adapter.js`.
- File tes: `tests/cutting-adapter.test.js`.
- Adapter kini menolak mode selain `presisi`/`ekonomis`.
- Validasi kerf dan ukuran minimum sisa berjalan sebelum jalur cepat geometri kosong.
- Keempat check-run pada SHA perbaikan: `browser-indexeddb`, `batch-reservation`, `inventory-and-regression`, dan `test` — semuanya `completed/success`.
- Perilaku hitung normal tidak diubah; `main` tidak disentuh.

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
1. Audit validasi CRUD katalog material dan record pekerjaan sudah diperbaiki serta lulus seluruh CI. Lanjutkan audit batas API lain yang belum diperiksa, terutama field/record transaksi dan nilai ekstrem, tanpa mengulang CRUD material/pekerjaan.
2. Audit validasi batas API untuk record transaksi (reservasi, rencana, movement, sisa material) dan nilai ekstrem. Audit pemulihan snapshot tidak konsisten, pembatalan, serta penyelesaian sudah diperluas dan seluruh CI lulus; jangan mengulang skenario yang telah tercakup tanpa alasan.
3. Kembali ke keputusan makna estimasi biaya: pisahkan konsep nilai kebutuhan vs biaya pembelian baru setelah inventaris. Jangan meminta keputusan pengguna sebelum menyajikan ringkasan opsi yang konkret dan konsekuensinya.
4. Jika ditemukan cacat nyata, tambahkan tes regresi dan perbaiki hanya di branch kerja.
5. Setelah tahap audit/perubahan, perbarui dokumen ini dan verifikasi CI pada HEAD terbaru.
6. Setelah audit teknis selesai, baru berikan daftar uji manual yang benar-benar perlu dilakukan pengguna.

## Prosedur pemulihan percakapan
Jika percakapan terputus mendadak, cukup mulai percakapan baru dengan:
> Lanjutkan proyek Kalkulator Material Bangunan. Baca `docs/PROMPT_LANJUTAN_PROYEK.md` dan `docs/STATUS_AUDIT_TERKINI.md`, verifikasi branch serta HEAD aktual di GitHub, lalu lanjutkan dari bagian “Pekerjaan berikutnya” tanpa mengulang audit yang sudah selesai.

Jika dokumen ini belum sempat diperbarui, rekonstruksi posisi dari commit, file, hasil CI, dan catatan yang tersedia. Tandai ketidakpastian secara terbuka; jangan menebak.
