# Desain Mesin Pemotongan Lembar Sumber

## Status
Mesin pemotongan dan adapter geometri telah dibuat pada branch `pengembangan-mesin-hitung`. Integrasi awal sudah digunakan oleh `index.html`, tetapi masih menunggu tes adapter lokal dan uji browser/Live Server.

## Berkas
- `assets/js/engine.js`: geometri pemasangan pada bidang.
- `assets/js/cutting-engine.js`: penyusunan potongan pada lembar sumber.
- `assets/js/cutting-adapter.js`: jembatan antara geometri pemasangan dan mesin pemotongan.
- `tests/engine.test.js`
- `tests/cutting-engine.test.js`
- `tests/cutting-adapter.test.js`

## Mesin pemotongan

API inti:

```js
const result = MaterialCuttingEngine.calculateCutting({
  sheetW: 20,
  sheetH: 600,
  parts: [{ id: "potong-1", width: 20, height: 100, quantity: 30 }],
  allowRotation: false,
  kerf: 0
});
```

Satuan semua ukuran adalah cm.

Masukan:
- `sheetW`, `sheetH`: ukuran lembar sumber sesuai orientasi yang dipilih.
- `parts`: daftar potongan akhir; tiap item memiliki `width`, `height`, dan opsional `id`, `quantity`.
- `allowRotation`: rotasi 90° hanya diizinkan jika `true`; nilai bawaan `false`.
- `kerf`: lebar bahan yang hilang akibat mata potong; nilai bawaan 0 cm.

Keluaran:
- `sheetCount`: jumlah lembar sumber menurut susunan algoritma.
- `sheets[].placements`: posisi, ukuran, dan status rotasi setiap potongan.
- `sheets[].leftovers` / `reusableRemainders`: sisa persegi panjang yang masih tercatat.
- `unclassifiedArea`: luas yang tidak menjadi potongan atau sisa persegi panjang tercatat. Ini dapat mencakup jalur kerf dan ruang akibat pemecahan bidang; jangan langsung menyebutnya limbah.
- `optimality: "heuristic"`: pendekatan, bukan jaminan solusi paling hemat global.

## Adapter dan kebijakan mode aplikasi

Pemanggilan:

```js
const result = MaterialCuttingAdapter.calculateMaterialSources({
  geometry,
  sheetW: matW,
  sheetH: matH,
  mode: "presisi", // atau "ekonomis"
  autoStripReuse: false,
  allowRotation: false,
  kerf: 0
});
```

Adapter mengubah setiap `geometry.cells` menjadi satu potongan dengan ID unik. Ia mengembalikan kembali daftar `cells` dalam kontrak yang dipakai visualisasi lama: `xStart`, `yStart`, `width`, `height`, `nCuts`, `source`, `sheetId`, dan `rotated`.

Kebijakan sementara:
- **Presisi:** setiap grid memakai satu lembar sumber sendiri, sehingga tidak ada pemanfaatan sisa antar-grid.
- **Pengecualian strip panjang:** aturan lama untuk material portrait, pola Stack, satu baris, dan lembar lebih panjang dari bidang tetap mengizinkan beberapa potongan dari lembar yang sama.
- **Ekonomis:** semua potongan dapat disusun bersama pada lembar sumber. Rotasi diizinkan sesuai perilaku mode ekonomis lama.
- **Kerf:** UI saat ini mengirim 0 cm. Pengaturan kerf belum disediakan.
- Penanda `source: "new"` diberikan pada satu potongan pertama tiap lembar sumber; potongan berikutnya pada lembar yang sama ditandai `reuse`. Ini adalah ringkasan pemakaian lembar, bukan identifikasi sisa inventaris yang disimpan.

## Cara kerja dan batasan
- Algoritma menggunakan pemotongan guillotine (pembelahan ruang bebas berupa garis lurus dari sisi ke sisi) dengan pemilihan ruang best-fit.
- Potongan berluas besar diprioritaskan.
- Rotasi tidak dilakukan diam-diam; adapter hanya mengizinkannya pada mode ekonomis yang memintanya.
- Kerf mengurangi ruang bebas. Celah lebih kecil daripada kerf tidak diklaim sebagai sisa pakai.
- Sisa tercatat masih berupa persegi panjang. Belum ada batas ukuran minimum untuk menentukan apakah sisa benar-benar berguna bagi pekerjaan berikutnya.
- Belum ada dukungan arah serat, motif, permukaan, atau batasan mesin potong.
- Belum ada diagram khusus tata letak potongan pada lembar sumber; visualisasi yang ada tetap menggambarkan posisi pemasangan pada bidang.
- Stok awal, pembelian kemasan, dan penyimpanan sisa potongan sebagai inventaris belum terhubung ke mesin pemotongan.
- `makeStok()` lama masih berada di `index.html` sebagai cadangan, tetapi kalkulasi utama sudah tidak memanggilnya. Jangan hapus sebelum tes regresi UI selesai.

## Pengujian
Jalankan dari root folder proyek:

```cmd
node tests\\engine.test.js
node tests\\cutting-engine.test.js
node tests\\cutting-adapter.test.js
```

Cakupan mesin:
1. 30 potongan 20×100 cm pada lembar 20×600 cm menghasilkan 5 lembar.
2. Potongan sama ukuran dengan lembar.
3. Empat potongan 120×60 cm pada lembar 240×120 cm.
4. Rotasi hanya jika diizinkan.
5. Sisa lebih kecil daripada kerf tidak diklaim sebagai sisa pakai.
6. Pengaruh kerf terhadap susunan.
7. Validasi ukuran, jumlah, dan kerf.

Cakupan adapter:
1. Mode presisi tetap satu lembar per grid.
2. Pengecualian strip panjang mempertahankan lima lembar untuk 30 potongan 20×100 cm.
3. Mode ekonomis dapat menggabungkan empat potongan 120×60 cm pada lembar 240×120 cm.
4. Koordinat dan atribut yang dibutuhkan visualisasi lama tetap tersedia.
5. Ukuran lembar tidak valid ditolak.

Pengguna telah menjalankan dua suite pertama secara lokal dan melaporkan semuanya lulus. Suite adapter baru ditambahkan setelah itu dan masih perlu dijalankan secara lokal. Uji browser/Live Server juga belum dilakukan.
