# Desain Mesin Pemotongan Lembar Sumber

## Status
Mesin geometri, mesin pemotongan, adapter, dan integrasi awal telah diuji pada PC pengguna. Pada 17–18 November 2026, pengguna melaporkan ketiga suite tes Node.js lulus serta uji browser/Live Server untuk nilai bawaan, mode Presisi/Ekonomis, kasus strip panjang, dan harga berjalan normal tanpa error merah di console. Ini adalah validasi awal, bukan pengujian menyeluruh semua kombinasi.

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
- Penanda `source: "new"` diberikan pada satu potongan pertama tiap lembar sumber; potongan berikutnya pada lembar yang sama ditandai `reuse`. Maknanya hanya potongan tambahan berbagi lembar sumber yang sama. Ini BUKAN bukti bahwa potongan tersebut berasal dari stok sisa pekerjaan terdahulu. Tampilan UI harus memakai istilah yang tidak menyiratkan inventaris sisa lama.

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

Pengguna melaporkan ketiga suite (engine.test.js, cutting-engine.test.js, cutting-adapter.test.js) lulus di Node.js lokal. Pengguna juga melaporkan uji browser/Live Server pada nilai bawaan, mode Presisi/Ekonomis, kasus strip panjang, dan harga berjalan normal; console tidak menampilkan error merah.


## Audit arti angka dan istilah hasil — 18 November 2026

### Temuan
1. `sheetCount` adalah jumlah lembar sumber yang dipakai oleh algoritma untuk menempatkan semua potongan.
2. `reuseCount` dihitung dari potongan kedua dan seterusnya yang ditempatkan pada lembar sumber yang sama. Angka ini bukan jumlah potongan yang diambil dari inventaris sisa pekerjaan sebelumnya.
3. `reusableRemainders` adalah ruang kosong persegi panjang yang tersisa pada lembar yang sedang dihitung. Belum ada ambang ukuran minimum; jadi ruang kecil pun dapat masuk daftar sisa.
4. `unclassifiedArea` adalah selisih luas lembar sumber dikurangi luas potongan dan luas persegi panjang yang dicatat. Dapat mencakup kerf dan ruang yang tidak terwakili sebagai persegi panjang bebas; bukan otomatis limbah.
5. Harga per lembar dan per kemasan dihitung dari `sheetCount`; jumlah kemasan dibulatkan ke atas. Aplikasi belum mengurangi kebutuhan dengan stok awal atau inventaris sisa lama.
6. Diagram saat ini menggambarkan tata letak pemasangan pada bidang, bukan tata letak potong tiap lembar sumber.

### Koreksi istilah antarmuka
Teks antarmuka perlu menyebut `reuseCount` sebagai potongan tambahan pada lembar yang sama, bukan “dari sisa” atau “tidak beli baru”. Mode Ekonomis dijelaskan sebagai penyusunan beberapa potongan pada satu lembar sumber. Penanda rotasi berarti potongan diputar 90 derajat, bukan diputar khusus saat memakai sisa.

### Batasan yang sudah dikonfirmasi
- Belum ada stok awal, pengurangan pembelian oleh stok, atau inventaris sisa yang disimpan.
- Belum ada ukuran minimum sisa yang dianggap layak pakai.
- Kerf UI masih 0 cm.
- Belum ada aturan serat/motif dan pembatasan rotasi per material.
- Algoritma guillotine best-fit bersifat heuristik.
- `makeStok()` dan helper lama masih dipertahankan; jangan hapus sebelum audit pemakaian dan regresi tersendiri.

### Langkah teknis berikutnya
Prioritas berikutnya adalah menambahkan tes untuk klasifikasi sisa berdasarkan ukuran minimum, lalu merancang model inventaris sisa yang benar-benar dapat dipakai ulang lintas pekerjaan. Jangan menyamakan sisa persegi panjang hasil kalkulasi saat ini dengan stok inventaris yang sudah tersimpan.
