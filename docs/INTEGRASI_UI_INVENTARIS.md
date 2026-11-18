# Rancangan Integrasi UI Inventaris Sisa Material

Dokumen ini menjadi kontrak integrasi UI. Modul geometri dan alur kalkulasi lama tidak diubah pada tahap ini. Jembatan parameter formulir ke workflow sudah tersedia pada `assets/js/inventory-app-bridge.js`.

## Kondisi aplikasi saat ini

- `index.html` memuat mesin geometri/pemotongan lama dan modul inventaris yang diperlukan untuk pratinjau.
- Fungsi `calc()` tetap sinkron: menghitung geometri, memanggil adapter, lalu menampilkan hasil.
- Fungsi `makeStok()` tetap menjadi bagian dari jalur reuse lama dan tidak diubah.
- `inventory-preview-ui.js` menghubungkan kontrol panel pratinjau dengan `inventory-app-bridge.js`.
- `inventory-workflow.js` menyediakan pratinjau yang terpisah dari reservasi.

Karena perbedaan sinkron/asinkron tersebut, integrasi tidak boleh mengganti atau mengubah `calc()` secara langsung. UI inventaris akan menjadi jalur opsional yang terpisah terlebih dahulu.

## Kontrak alur pengguna

### 1. Pratinjau — tidak mengubah stok

Bangun objek masukan dari nilai formulir yang sama dengan kalkulasi utama. Gunakan `inventory-app-bridge.js` agar konversi orientasi, dimensi, pola, alignment, nat, dan aturan strip panjang mengikuti mesin geometri yang sama:

- geometri dari `MaterialEngine.calculateGeometry()`;
- spesifikasi material;
- ukuran lembar baru;
- motif dan arah serat;
- kebijakan rotasi;
- kerf dan batas minimum sisa.

Panggil:

```js
const bridge = MaterialInventoryAppBridge.createInventoryAppBridge({
  geometryEngine: MaterialEngine,
  workflow
});
const preview = await bridge.preview({
  jobId,
  wallWidthM,
  wallHeightM,
  materialLengthCm,
  materialWidthCm,
  orientation,
  gapCm,
  pattern,
  direction,
  alignment,
  mode,
  material,
  minRemainderW,
  minRemainderH
});
```

Hasil pratinjau berisi rencana, jumlah snapshot stok, material, dan konteks pekerjaan. Fungsi ini hanya membaca inventaris dan menghitung rencana; tidak membuat reservasi atau mengubah status stok.

UI menampilkan setidaknya:
- jumlah dan ID sumber inventaris yang akan dipakai;
- jumlah lembar baru yang dibutuhkan;
- potongan yang berasal dari setiap sumber;
- daftar sisa yang akan tercipta;
- ringkasan material yang digunakan.

### 2. Konfirmasi — reservasi sumber yang benar-benar ditampilkan

Setelah pengguna menekan tombol konfirmasi, panggil:

```js
const reservedPlan = await bridge.confirm(preview);
```

Fungsi ini mengunci sumber persis seperti yang terlihat pada pratinjau. Fungsi ini tidak menghitung ulang atau diam-diam mengganti stok yang dipilih.

Jika reservasi gagal karena stok berubah, UI harus:
1. memberi tahu bahwa stok berubah;
2. membatalkan konfirmasi tersebut;
3. membuat pratinjau baru;
4. menampilkan kembali perubahan rencana sebelum pengguna mengonfirmasi lagi.

Jangan melakukan reservasi hanya ketika pengguna menekan tombol Hitung.

### 3. Pembatalan

Jika pengguna membatalkan sebelum pemotongan fisik dilakukan:

```js
await bridge.cancel(reservedPlan);
```

Semua reservasi rencana dilepas dalam satu transaksi. Jika satu reservasi tidak lagi aktif, seluruh pelepasan dibatalkan.

### 4. Penyelesaian pekerjaan

Setelah pemotongan fisik benar-benar selesai:

```js
const result = await bridge.complete(reservedPlan, {
  sourceSheetIdPrefix: jobSheetPrefix
});
```

Operasi ini dalam satu transaksi:
- mengubah semua sumber inventaris yang dipesan menjadi consumed;
- menyimpan sisa dari sumber inventaris;
- menyimpan sisa dari lembar baru fallback;
- membuat riwayat pergerakan untuk setiap sisa.

Sisa dari lembar baru juga dapat disimpan walaupun pekerjaan tidak memakai inventaris lama.

## Integrasi panel pratinjau pada kalkulator utama — tahap B

Panel opsional sudah ditambahkan pada `index.html`, dikendalikan oleh `assets/js/inventory-preview-ui.js`. Panel ini membaca daftar material aktif dan pekerjaan terbuka dari IndexedDB, lalu memakai parameter bidang, ukuran lembar, orientasi, pola, arah, alignment, nat, dan batas minimum sisa dari formulir kalkulator utama.

Pengguna memilih pekerjaan, material katalog, dan arah serat. Tombol **Pratinjau Pemakaian Sisa** menjalankan alur berikut:
1. `inventory-app-bridge.js` membangun geometri melalui `MaterialEngine.calculateGeometry()`.
2. `inventory-workflow.js` membaca sisa yang tersedia dan kondisinya baik.
3. `inventory-planner.js` mengalokasikan sisa inventaris yang cocok terlebih dahulu.
4. Kekurangan potongan dihitung memakai lembar baru melalui `cutting-adapter.js`.
5. Panel menampilkan sumber lembar, asal setiap potongan, dan sisa hasil pemotongan.

Pratinjau tidak memanggil `confirmPreview()` atau `reservePlan()`. Dengan demikian, stok tidak dikunci atau dikurangi ketika pratinjau dibuat. Tombol **Hitung Kebutuhan Material** tetap menjalankan `calc()` lama dan tidak diubah.

Pengujian browser `tests/browser/inventory-preview.test.js` memeriksa skenario satu sisa inventaris yang dipakai bersama satu lembar baru, memastikan status stok tetap `available`, dan memastikan tombol Hitung lama tetap bekerja. Pengujian ini dijalankan pada Chromium melalui `.github/workflows/browser-indexeddb.yml`.

Batas tahap B:
- belum ada tombol persetujuan/reservasi pada panel;
- belum ada daftar reservasi aktif, pembatalan, atau penyelesaian pekerjaan dari panel;
- belum ada perubahan stok otomatis;
- kesesuaian tampilan visual akhir masih perlu pemeriksaan browser setelah tes otomatis lulus.

## Integrasi reservasi pada kalkulator utama — tahap C

Panel kalkulator sekarang menyediakan alur persetujuan dan pengelolaan reservasi:
- **Setujui dan Kunci Sumber** memanggil `bridge.confirm(preview)` dan menyimpan snapshot sekaligus mengunci semua sisa inventaris yang dipakai. Lembar baru tidak dikunci karena belum merupakan stok inventaris.
- **Reservasi Aktif** membaca daftar snapshot berstatus `reserved` dan memulihkannya melalui `workflow.restorePlan()` saat halaman dibuka kembali.
- **Batalkan Reservasi** memanggil `bridge.cancel()` untuk melepas seluruh sumber rencana secara atomik. Reservasi legacy tanpa snapshot hanya dapat dibatalkan, tidak dapat diselesaikan.
- **Selesaikan Pemotongan** tersedia setelah pekerjaan fisik benar-benar selesai. Pengguna dapat mengubah awalan ID lembar sumber; `bridge.complete()` mengonsumsi semua sumber inventaris dan mencatat sisa dari sumber lama maupun lembar baru.

Setiap tindakan meminta konfirmasi pengguna. Jika pemulihan snapshot gagal atau audit menemukan hubungan stok yang tidak konsisten, panel tidak menawarkan penyelesaian untuk rencana tersebut dan menampilkan peringatan. Sistem tidak menebak atau melepas stok yang tidak dapat diverifikasi.

Pengujian browser `tests/browser/inventory-preview.test.js` diperluas untuk menguji pratinjau tanpa mutasi, persetujuan dan penguncian, pemulihan setelah reload, pembatalan, penyelesaian, konsumsi sumber, dan pencatatan sisa turunan. Hasil pengujian harus dinyatakan lulus hanya setelah workflow Chromium selesai.

Batas tahap C:
- belum ada pembaruan status pekerjaan menjadi closed otomatis;
- ID lembar sumber adalah awalan yang dapat diedit pengguna, bukan integrasi dengan label fisik atau sistem barcode;
- pemeriksaan visual tata letak panel tetap diperlukan pada browser pengguna.

## Implementasi UI pengelolaan — tahap awal

Halaman pengelolaan pertama tersedia pada `inventaris.html`, dengan pengendali `assets/js/inventory-ui.js`. Halaman ini dapat dibuka langsung melalui Live Server atau server lokal repository. Halaman kalkulator utama belum diubah pada tahap ini.

Fitur yang tersedia:
- katalog material dan pencatatan pekerjaan;
- pencatatan unit sisa dengan material, ukuran, pekerjaan asal, dan ID lembar sumber;
- daftar stok dengan pencarian dan filter status;
- ringkasan stok tersedia, dipesan, dikonsumsi, serta rusak/dibuang;
- perubahan kondisi unit dan pembuangan stok yang masih tersedia;
- riwayat pergerakan;
- impor dan ekspor JSON.

Pencatatan sisa menggunakan `storage.createRemainder()`: pemeriksaan referensi material/pekerjaan, penyimpanan sisa, dan pembuatan movement dilakukan dalam satu transaksi IndexedDB. Perubahan kondisi atau pembuangan menggunakan `storage.updateRemainderState()`, juga bersama movement dalam satu transaksi. Unit yang berstatus reserved atau consumed tidak dapat diubah melalui UI pengelolaan.

Pengujian tambahan:
- `tests/inventory-ui-storage.test.js`: transaksi pencatatan, perubahan kondisi, pembuangan, dan validasi paket.
- `tests/browser/inventory-ui.test.js`: alur UI Chromium, pencatatan data, riwayat, dan persistensi setelah reload.
- Kedua pengujian dimasukkan ke workflow inventaris dan workflow Chromium.

Batas tahap ini:
- halaman pengelolaan tersedia terpisah dan sekarang ditautkan dari panel kalkulator utama;
- reservasi, pembatalan, dan penyelesaian pekerjaan dari panel kalkulator belum diimplementasikan;
- tombol Hitung dan `makeStok()` tetap tidak berubah.

## Penyimpanan snapshot dan pemulihan reservasi (IndexedDB v2)

Database inventaris sekarang menggunakan versi 2. Migrasi versi 1 ke versi 2 mempertahankan object store dan data lama, menambahkan:

- object store `plans` untuk menyimpan snapshot rencana yang disetujui;
- index `reservations.planId` untuk menghubungkan reservasi dengan snapshot;
- index `plans.jobId` dan `plans.status` untuk pencarian pemulihan.

Saat `reservePlan()` dipanggil, snapshot rencana lengkap, seluruh record reservasi, dan perubahan status sumber menjadi `reserved` disimpan dalam satu transaksi IndexedDB. Rencana yang hanya menggunakan lembar baru tetap disimpan walaupun daftar reservasinya kosong.

Snapshot menyimpan hasil planner yang telah disetujui, metadata material, arah serat, motif, dan ID reservasi. `restorePlan(planId)` membaca ulang snapshot serta seluruh reservasi aktif. Jika ada ID yang hilang, berlebih, atau tidak cocok, pemulihan dan penyelesaian diblokir; sistem tidak menghitung ulang rencana.

Pembatalan dan penyelesaian memperbarui status snapshot dalam transaksi yang sama dengan pelepasan/penggunaan reservasi dan pencatatan sisa. Status snapshot:
- `reserved`: pekerjaan telah disetujui dan masih aktif;
- `cancelled`: reservasi telah dilepas;
- `completed`: sumber telah dikonsumsi dan sisa hasil telah dicatat;
- `legacy_recovery`: reservasi aktif versi 1 yang tidak mempunyai snapshot asli.

Gunakan API workflow berikut untuk pemulihan:
```js
const activePlans = await workflow.getRecoveryPlans();
const recoveryReport = await workflow.getRecoveryReport();
const restoredPlan = await workflow.restorePlan(planId);

// Untuk reservasi lama yang tidak memiliki snapshot:
await workflow.cancelLegacyRecovery(legacyPlanId);
```

Reservasi lama tidak dibuatkan rencana palsu. Sistem menampilkannya sebagai `legacy_recovery`; pembatalan hanya dilakukan jika semua reservasi dan sumber stok masih cocok. Penyelesaian pekerjaan lama tanpa snapshot tidak diperbolehkan. `getRecoveryReport()` juga mendeteksi reservasi aktif tanpa snapshot, sumber yang berstatus reserved tanpa reservasi aktif, sisa dengan reservasi ganda, reservasi yang sumbernya hilang, dan snapshot yang daftar reservasinya tidak cocok. Reservasi yang merupakan bagian dari snapshot tidak boleh dilepas atau dikonsumsi satu per satu; prosesnya harus melalui operasi seluruh rencana agar tidak meninggalkan sumber lain terkunci.

Ekspor JSON sekarang memakai skema 2 dan menyertakan `plans`. Impor tetap menerima paket skema 1. Reservasi aktif yang diimpor dari paket lama otomatis diberi catatan pemulihan legacy agar stok terkunci tetap dapat ditemukan. Validator menerima paket versi 1 dan 2.

Pengujian tambahan:
- `tests/inventory-plan-recovery.test.js`: pemulihan setelah storage dibuka ulang, pembatalan, penyelesaian, rencana tanpa inventaris, ekspor/validasi, dan migrasi reservasi legacy.
- `tests/browser/inventory-plan-recovery.test.js`: pemulihan snapshot setelah proses Chromium benar-benar ditutup dan dibuka kembali.
- `.github/workflows/inventory-regression.yml`: menjalankan tes inventaris dan regresi geometri/cutting pada push ke cabang pengembangan.
- `.github/workflows/browser-indexeddb.yml`: menjalankan pengujian IndexedDB nyata dan pemulihan setelah browser ditutup.

## Prinsip perlindungan

- Tombol Hitung lama tetap menjalankan jalur kalkulasi lama.
- UI inventaris dibuat sebagai fitur opsional dan tidak mengubah hasil lama.
- Tidak ada perubahan stok pada pratinjau.
- Tidak ada perubahan stok jika reservasi gagal.
- Penyelesaian inventaris dilakukan hanya setelah pemotongan dikonfirmasi selesai.
- Jangan menghapus atau mengganti `makeStok()` sampai jalur baru terintegrasi dan dibandingkan hasilnya.
- Integrasi visual harus diuji pada browser setelah seluruh tes otomatis lulus.

## File yang akan disentuh pada tahap integrasi UI

Perubahan UI nantinya dibatasi pada:
- `index.html`: elemen kontrol dan panel ringkasan inventaris opsional;
- pemuatan script modul inventaris yang diperlukan;
- satu pengendali UI baru bila dibutuhkan.

File geometri `engine.js`, `cutting-engine.js`, dan `cutting-adapter.js` tetap dilindungi.
