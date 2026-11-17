# Rencana Refaktor Mesin Perhitungan

Cabang kerja: `pengembangan-mesin-hitung`

## Prinsip
1. Pertahankan aplikasi tetap HTML/CSS/JavaScript murni dan dapat berjalan offline.
2. Jangan menghapus atau menimpa file cadangan.
3. Pisahkan geometri pemasangan pada bidang dari optimasi pemotongan lembar sumber.
4. Jangan menyebut luas sisa sebagai limbah sebelum bentuk dan ukuran sisa diketahui.
5. Setiap perubahan mesin wajib memiliki kasus uji yang dapat diulang.

## Tahap 1 — Fondasi dan validasi
- Ekstrak fungsi hitung inti menjadi modul JavaScript tanpa ketergantungan DOM.
- Tetapkan satuan internal yang konsisten (cm; konversi ke m² hanya pada keluaran).
- Validasi masukan dan konfigurasi pola/orientasi.
- Buat pengujian otomatis untuk kasus uji awal.

Kriteria selesai: hasil uji dapat dijalankan ulang dan tidak bergantung pada browser untuk pengujian fungsi inti.

## Tahap 2 — Geometri pemasangan
- Hitung koordinat dan ukuran setiap potongan pada bidang.
- Dukung pola Stack Bond, Running Bond, dan Third Bond.
- Dukung arah horizontal dan vertikal untuk pola yang relevan.
- Terapkan alignment secara konsisten.
- Pastikan tidak ada celah, tumpang tindih, ukuran negatif, atau grid kosong tanpa alasan.

Kriteria selesai: seluruh bidang tertutup sesuai ukuran dan aturan nat, dengan posisi potongan tepi yang dapat diverifikasi.

## Tahap 3 — Pemotongan lembar sumber
- Bangun daftar potongan yang dibutuhkan dari hasil geometri pemasangan.
- Susun potongan pada lembar sumber dengan rotasi sesuai aturan material.
- Lacak asal setiap potongan dan sisa persegi panjang.
- Bedakan lembar sumber baru, sisa pakai, dan potongan yang tidak dapat digunakan.
- Tampilkan diagram pemotongan sumber secara terpisah dari gambar pemasangan.

Kriteria selesai: jumlah lembar berasal dari susunan potongan fisik, bukan jumlah grid pemasangan atau pembagian luas.

## Tahap 4 — Pembelian dan stok
- Kurangi kebutuhan dengan stok awal yang dimasukkan pengguna.
- Bulatkan jumlah pembelian sesuai satuan jual (lembar atau kemasan).
- Pisahkan biaya pembelian, nilai persediaan tersisa, dan biaya material terpakai.
- Pertahankan harga material per m² sebagai metrik pembanding.

Kriteria selesai: skenario beli per lembar dan per kemasan sesuai tabel kasus uji.

## Tahap 5 — Integrasi tampilan dan laporan
- Tampilkan kebutuhan pemasangan, pola, jumlah lembar sumber, dan diagram potong.
- Tampilkan stok, pembelian, dan limbah secara terpisah.
- Sediakan laporan yang bisa dicetak.
- Uji alur penggunaan melalui Live Server dan browser.

## Batasan algoritma
Heuristik pemotongan (aturan pendekatan untuk menyusun potongan) mungkin tidak menemukan solusi global paling hemat untuk semua kombinasi. Jika tidak menggunakan solver optimasi lengkap, aplikasi harus menyebut hasil sebagai estimasi algoritmik dan tidak menjanjikan jumlah lembar minimum mutlak.
