# Desain Awal Mesin Pemotongan Lembar Sumber

## Status
Modul awal dibuat pada branch `pengembangan-mesin-hitung`. Modul ini belum dihubungkan ke `index.html`; tujuannya menguji penyusunan potongan secara terpisah dari antarmuka.

## Berkas
- `assets/js/cutting-engine.js`
- `tests/cutting-engine.test.js`

## API

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
- `sheetW`, `sheetH`: lebar dan tinggi lembar sumber sesuai orientasi yang dipilih.
- `parts`: daftar potongan akhir; tiap item memiliki `width`, `height`, dan opsional `id`, `quantity`.
- `allowRotation`: rotasi 90° hanya diizinkan jika bernilai `true`; nilai bawaan `false`.
- `kerf`: lebar bahan yang hilang akibat mata potong. Nilai bawaan 0 cm.

Keluaran:
- `sheetCount`: jumlah lembar sumber yang dipakai oleh susunan algoritma.
- `sheets[].placements`: posisi, ukuran, dan status rotasi setiap potongan.
- `sheets[].leftovers` / `reusableRemainders`: sisa persegi panjang yang masih tercatat setelah penyusunan.
- `unclassifiedArea`: luas yang tidak menjadi potongan atau sisa persegi panjang tercatat; dapat mencakup jalur kerf dan ruang akibat pemecahan bidang. Jangan langsung menyebutnya limbah.
- `optimality: "heuristic"`: hasil merupakan pendekatan, bukan jaminan solusi paling hemat global.

## Cara kerja dan batasan
- Algoritma menggunakan pemotongan guillotine (setiap pembelahan ruang bebas dilakukan lurus dari sisi ke sisi) dengan pemilihan ruang best-fit.
- Potongan berluas besar diprioritaskan.
- Rotasi tidak dilakukan secara diam-diam; harus diizinkan lewat opsi.
- Kerf mengurangi ruang bebas. Celah yang lebih kecil daripada lebar kerf tidak diklaim sebagai sisa yang bisa dipakai.
- Sisa yang tercatat masih berupa persegi panjang. Belum ada batas ukuran minimum untuk menentukan apakah sisa benar-benar berguna bagi pekerjaan berikutnya.
- Belum ada dukungan arah serat, motif, permukaan, pola sambungan, pemotongan multi-tahap kompleks, atau batasan mesin potong. Aturan tersebut harus ditentukan sebelum integrasi untuk material yang membutuhkannya.
- Belum terintegrasi dengan stok awal, pembelian kemasan, tampilan diagram, atau fungsi lama `makeStok()`.

## Pengujian awal
`tests/cutting-engine.test.js` mencakup:
1. 30 potongan 20×100 cm pada lembar 20×600 cm menghasilkan 5 lembar.
2. Potongan sama ukuran dengan lembar.
3. Empat potongan 120×60 cm pada lembar 240×120 cm.
4. Rotasi hanya jika diizinkan.
5. Sisa lebih kecil daripada kerf tidak diklaim sebagai sisa pakai.
6. Pengaruh kerf terhadap susunan.
7. Validasi ukuran, jumlah, dan kerf.

Tes telah dijalankan terhadap isi modul dan berkas tes dari branch melalui pengujian JavaScript terisolasi di sesi asisten dan semua kasus lulus. Ini belum menggantikan pengujian Node.js pada PC pengguna. Jalankan:
```cmd
node tests\engine.test.js
node tests\cutting-engine.test.js
```
