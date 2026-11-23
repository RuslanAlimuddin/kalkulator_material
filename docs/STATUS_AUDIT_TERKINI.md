# Posisi Audit Terkini — Kalkulator Material Bangunan

> Dokumen posisi kerja yang diperbarui pada setiap tahap audit bermakna. Baca bersama `docs/PROMPT_LANJUTAN_PROYEK.md`. Dokumen ini lebih diutamakan untuk mengetahui pekerjaan terakhir yang sedang berjalan; pointer branch/HEAD tetap wajib diverifikasi langsung di GitHub.

## Identitas kerja
- Repository: https://github.com/RuslanAlimuddin/kalkulator_material
- Branch wajib: `pengembangan-mesin-hitung`
- Jangan mengubah `main`; jangan merge tanpa persetujuan eksplisit.
- HEAD kode terbaru yang sudah diverifikasi: `6fce40f234c41d4b0954ca83f0e2400e98bdc854` (`test: verify baseline option passes through inventory bridge`). Integrasi estimasi kebutuhan bruto dan pembelian setelah inventaris telah diterapkan; seluruh empat CI pada HEAD ini sudah diverifikasi `completed/success`.

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

### 2. Audit alur harga dan inventaris — dua estimasi terpisah telah diimplementasikan dan diuji
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

Kesimpulan dan implementasi:
- Makna bisnis dipisahkan menjadi (1) nilai kebutuhan material tanpa inventaris dan (2) estimasi pembelian baru setelah inventaris.
- `inventory-workflow.preview()` kini dapat menghitung `baselinePlan` dengan planner/adapter yang sama dan daftar inventaris kosong. Ini menghindari kesalahan menilai setiap unit sisa inventaris sebagai satu lembar utuh.
- `inventory-app-bridge.js` meneruskan opsi `includeBaseline`.
- `inventory-preview-ui.js` menampilkan kedua estimasi di area hasil pratinjau dengan mesin harga yang sama, termasuk pembelian kemasan utuh.
- Harga, jenis harga, dan isi kemasan dapat diubah ketika pratinjau masih aktif; angka estimasi diperbarui tanpa mengulang perhitungan geometri.
- Pengujian browser memeriksa skenario 2 lembar kebutuhan bruto dan 1 lembar pembelian baru setelah satu sisa inventaris digunakan. Pengujian workflow/bridge memeriksa opsi baseline dan memastikan perhitungan tetap terpisah dari reservasi.
- Tidak ada mutasi stok pada saat menghitung baseline atau menampilkan estimasi. Reservasi tetap hanya terjadi ketika pengguna menekan tombol persetujuan.
- Perhitungan harga kalkulator lama tetap dipertahankan; tidak diubah menjadi angka neto secara diam-diam.

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

### 4C. Validasi ID opsional pada konsumsi sisa — cacat ditemukan, diperbaiki, dan CI lulus
File:
- `assets/js/inventory-storage.js`
- `tests/inventory-storage.test.js`
- Pembanding skema: `assets/js/inventory-validator.js`

Temuan:
- `consumeReservations()` menerima ID sisa turunan opsional dan menggunakan ID otomatis bila tidak diberikan.
- Sebelum perbaikan, ID yang diberikan pemanggil tidak divalidasi tipenya. Nilai numerik atau teks kosong dapat melewati pemeriksaan awal dan berpotensi menghasilkan record yang tidak memenuhi skema bundle, yang mewajibkan ID record berupa teks tidak kosong.
- Field opsional `sourceSheetId` pada batch konsumsi juga belum memvalidasi tipe jika diberikan.

Perbaikan:
- ID sisa turunan yang diberikan harus berupa string tidak kosong; jika tidak diberikan/null, ID otomatis tetap digunakan.
- `sourceSheetId` opsional pada konsumsi batch, jika diberikan, harus berupa string tidak kosong.
- ID pada sisa dari lembar baru juga diperiksa dengan aturan yang sama.
- Tes regresi mencakup ID numerik pada ketiga jalur tersebut dan memastikan stok/reservasi tidak berubah ketika input ditolak.

Commit final: `b093576491e7037fb7a0191afdc046fa88daa02f`.
Keempat check-run pada commit ini `completed/success`:
- `test`
- `inventory-and-regression`
- `batch-reservation`
- `browser-indexeddb`

### 4D. Validasi ID dan referensi transaksi tunggal — cacat ditemukan, diperbaiki, dan CI lulus
File:
- `assets/js/inventory-storage.js`
- `tests/inventory-storage.test.js`
- Pembanding: aturan field pada `assets/js/inventory-validator.js`

Temuan:
- Jalur transaksi massal sudah memiliki validasi tipe untuk beberapa ID, tetapi jalur tunggal belum konsisten.
- `reserveRemainder()` sebelumnya hanya memeriksa nilai `remainderId` dan `jobId` bersifat truthy; ID reservasi khusus yang diberikan pemanggil juga tidak diperiksa sebagai string.
- `consumeReservation()` belum memeriksa ID sisa turunan opsional dan `sourceSheetId` opsional.
- `createRemainder()` belum memeriksa tipe ID khusus.
- `updateRemainderState()` meneruskan `referenceId` ke movement tanpa memastikan tipe string.

Perbaikan:
- ID wajib dan ID opsional yang diberikan pemanggil kini harus berupa string tidak kosong.
- ID otomatis tetap dipakai bila field ID opsional tidak diberikan.
- Referensi movement opsional divalidasi sebelum transaksi dijalankan.
- Tes regresi memeriksa ID numerik pada reservasi, konsumsi, pencatatan sisa, serta referensi perubahan kondisi; tes memastikan stok, reservasi, dan riwayat tidak berubah saat input ditolak.

Commit kode: `0d1230c57049a80ca6559357d4b58dc6e0249627`.
Commit tes: `fa2254a9aac32dd69cfb5bfe262ddb40ec32b568`.
Empat check-run pada commit tes `completed/success`: `test`, `inventory-and-regression`, `batch-reservation`, dan `browser-indexeddb`.

Kesimpulan:
- Cacat validasi ID pada jalur transaksi tunggal sudah diperbaiki.
- Belum ada perubahan pada perilaku bisnis reservasi/konsumsi yang valid.
- Audit masih perlu memeriksa referensi dan field transaksi lain yang belum disentuh, terutama validasi `planId`, konsistensi snapshot, serta field opsional pada operasi pelepasan.

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
1. Audit nilai ekstrem pada field transaksi telah menemukan dan memperbaiki validasi `version` yang sebelumnya menerima bilangan bulat tidak aman atau tidak lagi dapat dinaikkan. Tes validator dan tes integrasi impor memastikan nilai tersebut ditolak sebelum data lokal berubah.
2. Pemeriksaan angka dimensi, luas turunan, timestamp, `schemaVersion`, `geometryVersion`, serta validasi ID transaksi tidak menemukan cacat tambahan yang cukup terbukti untuk mengubah kode. Perhitungan luas yang dapat overflow sudah ditangani dengan pemeriksaan `Number.isFinite` pada jalur transaksi; validasi snapshot geometri memeriksa angka finite dan batas lembar.
3. Fokus berikutnya adalah menuntaskan definisi bisnis estimasi biaya vs penggunaan inventaris. Telusuri ulang aliran data UI dan mesin harga hanya untuk memastikan opsi implementasi, lalu sajikan perbandingan konkret: (a) nilai total kebutuhan material, dan (b) estimasi pembelian baru setelah stok inventaris dipakai. Jangan mengubah formula atau tampilan sebelum makna bisnis diputuskan.
4. Jika ditemukan cacat nyata, tambahkan tes regresi dan perbaiki hanya di branch kerja.
5. Setelah tahap audit/perubahan, perbarui dokumen ini dan verifikasi CI pada HEAD terbaru.
6. Setelah audit teknis selesai, baru berikan daftar uji manual yang benar-benar perlu dilakukan pengguna.

## Prosedur pemulihan percakapan
Jika percakapan terputus mendadak, cukup mulai percakapan baru dengan:
> Lanjutkan proyek Kalkulator Material Bangunan. Baca `docs/PROMPT_LANJUTAN_PROYEK.md` dan `docs/STATUS_AUDIT_TERKINI.md`, verifikasi branch serta HEAD aktual di GitHub, lalu lanjutkan dari bagian “Pekerjaan berikutnya” tanpa mengulang audit yang sudah selesai.

Jika dokumen ini belum sempat diperbarui, rekonstruksi posisi dari commit, file, hasil CI, dan catatan yang tersedia. Tandai ketidakpastian secara terbuka; jangan menebak.


### 4E. Validasi planId dan ID pelepasan reservasi — diperbaiki, seluruh CI lulus
File:
- `assets/js/inventory-storage.js`
- `tests/inventory-storage.test.js`

Temuan dan perbaikan:
- `reserveRemainders()` kini menolak `jobId` yang bukan teks tidak kosong dan `planId` opsional yang bukan teks tidak kosong.
- `releaseReservations()` dan `consumeReservations()` kini memvalidasi `planId` opsional sebelum transaksi berjalan.
- Tes regresi memastikan ID rencana invalid ditolak dan tidak membuat reservasi, perubahan stok, atau record rencana.
- Audit jalur pelepasan tunggal menemukan `releaseReservation()` belum memvalidasi tipe/isi `reservationId`. Fungsi kini menolak angka, teks kosong/spasi, `null`, dan `undefined` sebelum membuka transaksi.
- Tes regresi memastikan kegagalan validasi ID pelepasan tidak mengubah status reservasi/sumber maupun menambah movement.
- Pemeriksaan statis tambahan pada `releaseReservations()` memastikan seluruh ID reservasi dalam satu rencana harus dilepas bersama, sumber tidak boleh memiliki reservasi aktif lain, daftar `reservationIds` harus cocok dengan snapshot, dan `inventoryUsage` rencana modern harus cocok dengan sumber yang dilepas. Pemeriksaan tersebut sudah ada dan tidak perlu diubah.

Commit:
- Validasi `planId` dan tes massal: `68ef724814b5eaddfa62d7ee585dfc11304587c6`.
- Validasi ID pelepasan tunggal: `7277af7a64eb235a7eaeae4ba57a6f08d604ee2a`.
- Tes regresi pelepasan tunggal dan HEAD akhir tahap: `de0e8c7769bea3a9cd76b9c4884502f0a5fdfc0f`.

Empat check-run pada HEAD akhir `de0e8c7769bea3a9cd76b9c4884502f0a5fdfc0f` telah diverifikasi `completed/success`:
- `inventory-and-regression`
- `batch-reservation`
- `test`
- `browser-indexeddb`

Kesimpulan:
- Validasi batas `planId` pada reservasi massal, pelepasan massal, dan konsumsi massal telah diperkuat.
- Validasi ID pada jalur pelepasan tunggal kini konsisten dengan jalur transaksi tunggal lainnya.
- Tidak ada perubahan pada perilaku bisnis untuk input yang valid.
- Belum ditemukan alasan untuk mengubah algoritma pelepasan atau snapshot; audit berikutnya beralih ke validasi nilai ekstrem/field transaksi tersisa, lalu keputusan makna estimasi biaya.


### 4F. Batas versi numerik inventaris — cacat ditemukan, diperbaiki, dan CI lulus
File:
- `assets/js/inventory-validator.js`
- `tests/inventory-validator.test.js`
- `tests/inventory-storage.test.js`

Temuan:
- Validasi sebelumnya hanya mensyaratkan `version` sebagai bilangan bulat minimal 1.
- Nilai `Number.MAX_SAFE_INTEGER` dan angka integer yang lebih besar tetap diterima, walaupun JavaScript tidak dapat menjamin kenaikan versi berikutnya tetap akurat.
- Operasi reservasi, pelepasan, dan konsumsi menaikkan `version`; karena itu, menerima nilai yang tidak aman dapat merusak fungsi penghitung versi.

Perbaikan:
- Validator kini mensyaratkan `Number.isSafeInteger(version)`, minimal 1, dan lebih kecil dari `Number.MAX_SAFE_INTEGER` agar satu kenaikan berikutnya masih dapat dilakukan dengan aman.
- Tes validator mencakup nol, negatif, pecahan, `Infinity`, `NaN`, batas maksimum aman, angka di atas batas, serta nilai aman tepat di bawah batas.
- Tes storage memastikan impor dengan versi ekstrem ditolak sebelum data lokal diubah atau record dari paket invalid tersimpan.

Commit:
- Implementasi validator: `5c3ed5937770696be66ca42eebcf4dbe7423681f`.
- Tes validator: `95583d1ed6a2f27808144b8190ec3777f07ad303`.
- Tes integrasi impor dan HEAD kode tahap ini: `4747f76dbcc9267da0822e35fa6210ea0d2c7165`.

Empat check-run pada HEAD `4747f76dbcc9267da0822e35fa6210ea0d2c7165` telah diverifikasi `completed/success`:
- `test`
- `inventory-and-regression`
- `batch-reservation`
- `browser-indexeddb`

Kesimpulan:
- Paket cadangan tidak lagi dapat memasukkan versi sisa yang tidak aman atau tidak dapat dinaikkan.
- Penolakan impor terjadi sebelum transaksi mengganti data lokal.
- Tidak ada perubahan pada rumus kalkulasi material atau estimasi harga pada tahap ini.

### 4G. Pemisahan estimasi kebutuhan bruto dan pembelian baru setelah inventaris — implementasi selesai, seluruh CI lulus
File yang diubah:
- `assets/js/inventory-workflow.js`
- `assets/js/inventory-app-bridge.js`
- `assets/js/inventory-preview-ui.js`
- `index.html`
- `tests/inventory-workflow.test.js`
- `tests/inventory-app-bridge.test.js`
- `tests/browser/inventory-preview.test.js`

Keputusan bisnis:
1. **Nilai kebutuhan material (tanpa inventaris):** jumlah lembar yang dibutuhkan menurut planner tanpa stok inventaris, dinilai dengan harga satuan/kemasan yang dipilih.
2. **Estimasi pembelian baru (setelah inventaris):** jumlah lembar baru yang tersisa setelah planner menggunakan inventaris yang cocok, dinilai dengan aturan harga yang sama.

Implementasi teknis:
- Workflow menerima opsi `includeBaseline: true`. Bila aktif, workflow menjalankan planner kedua dengan `remainders: []` untuk menghasilkan `baselinePlan`.
- Planner dan cutting adapter yang sama dipakai untuk kedua hitungan. Baseline tidak menganggap satu sisa inventaris sebagai satu lembar utuh dan tidak memakai rumus hitungan terpisah.
- Bridge meneruskan opsi baseline dari UI.
- UI pratinjau menampilkan dua angka berdampingan dan menghitung harga melalui `MaterialPricingEngine`.
- Untuk harga kemasan, pembulatan kemasan utuh, jumlah lembar dibeli, dan sisa lembar mengikuti mesin harga yang sudah ada.
- Perubahan input harga, jenis harga, atau isi kemasan memperbarui tampilan estimasi jika pratinjau masih berlaku. Perubahan geometri/katalog tetap membatalkan pratinjau seperti sebelumnya.
- Baseline hanya menghitung; tidak menyimpan, memesan, atau mengubah status inventaris.

Pengujian:
- `inventory-workflow.test.js`: memastikan baseline tanpa inventaris dihitung terpisah dari plan inventaris.
- `inventory-app-bridge.test.js`: memastikan opsi baseline diteruskan ke workflow.
- `inventory-preview.test.js`: skenario browser membuktikan kebutuhan bruto 2 lembar (Rp200.000) dibanding pembelian baru 1 lembar (Rp100.000), dengan harga satuan Rp100.000/lembar.
- Seluruh empat CI pada HEAD kode `6fce40f234c41d4b0954ca83f0e2400e98bdc854` diverifikasi `completed/success`: `browser-indexeddb`, `batch-reservation`, `inventory-and-regression`, dan `test`.

Commit kode utama tahap ini:
- Workflow baseline: `02e5c1d2518e63cd7216a4e9d3344ea6ed50e922`.
- Bridge baseline: `fd3d013994bc767fb6d6fb84402f6458e60dd6e2`.
- Tes workflow: `3b2e5ea52998690d212d119425bb3c0dfb94bd9a`.
- UI harga: `4569cd6bbc20d3e04056dbbf78414daabebb3922`.
- Tampilan kalkulator: `656058b3bf171d7fa9ebf46b50c289ba28ef5bd2`.
- Tes browser: `0023305f2a12e44dd3f7cd7d3ad09f7083a9113c`.
- Tes bridge: `6fce40f234c41d4b0954ca83f0e2400e98bdc854`.

Pekerjaan berikutnya:
1. Audit skenario seluruh inventaris mencukupi sehingga `newSheetCount = 0`; estimasi pembelian baru harus tampil Rp0, sementara nilai kebutuhan bruto tetap sesuai baseline.
2. Audit harga kemasan saat inventaris mengurangi kebutuhan melintasi batas kemasan (contoh gross 5 lembar, net 3 lembar, isi 4/kemasan).
3. Pastikan perubahan harga/kemasan memperbarui dua angka dan perubahan geometri membatalkan pratinjau.
4. Setelah skenario tersebut teruji, audit integrasi biaya lebih lanjut dan siapkan daftar uji manual yang relevan.