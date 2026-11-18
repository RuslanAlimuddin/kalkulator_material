# Rancangan Integrasi UI Inventaris Sisa Material

Dokumen ini menjadi kontrak integrasi UI. Modul geometri dan alur kalkulasi lama tidak diubah pada tahap ini. Jembatan parameter formulir ke workflow sudah tersedia pada `assets/js/inventory-app-bridge.js`.

## Kondisi aplikasi saat ini

- `index.html` memuat `engine.js`, `cutting-engine.js`, dan `cutting-adapter.js`.
- Fungsi `calc()` masih sinkron: menghitung geometri, memanggil adapter, lalu menampilkan hasil.
- Fungsi `makeStok()` masih menjadi bagian dari jalur reuse lama.
- Modul `inventory-*.js` belum dimuat oleh halaman utama.
- `inventory-workflow.js` sekarang menyediakan pratinjau terpisah dari reservasi.

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
- halaman pengelolaan sudah berdiri sendiri dan belum diberi tautan navigasi dari `index.html`;
- panel pratinjau planner, reservasi, pembatalan, dan penyelesaian pekerjaan belum dihubungkan ke halaman kalkulator;
- tombol Hitung dan `makeStok()` tetap tidak berubah.

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
