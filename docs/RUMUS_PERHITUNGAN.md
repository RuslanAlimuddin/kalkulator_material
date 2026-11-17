# Rumus Acuan Perhitungan Material Lembaran

Dokumen ini menetapkan istilah dan rumus yang harus dipakai secara konsisten. Rumus kebutuhan lembar sumber bergantung pada pola, orientasi, arah potongan, dan pemanfaatan sisa; karena itu tidak boleh disamakan dengan pembagian luas bidang oleh luas lembar.

## 1. Luas bidang dan material

- Luas bidang (m²) = lebar bidang (m) × tinggi bidang (m).
- Luas satu lembar (m²) = panjang lembar (m) × lebar lembar (m).
- Harga material per m² = harga per lembar ÷ luas satu lembar.
- Jika harga diberikan per kemasan: harga per lembar = harga kemasan ÷ jumlah lembar per kemasan.

## 2. Kebutuhan, pembelian, dan persediaan

Pisahkan tiga angka:
1. **Kebutuhan lembar**: jumlah lembar sumber yang diperkirakan diperlukan untuk membuat semua potongan.
2. **Jumlah dibeli**: jumlah satuan atau kemasan yang harus dibeli, setelah pembulatan sesuai aturan penjualan.
3. **Sisa persediaan**: material yang dibeli tetapi belum terpakai, termasuk lembar utuh dan potongan layak pakai.

Untuk penjualan per kemasan:
- Kemasan dibeli = pembulatan ke atas (kebutuhan lembar ÷ isi kemasan).
- Lembar dibeli = kemasan dibeli × isi kemasan.
- Sisa lembar utuh = lembar dibeli − kebutuhan lembar.
- Uang pembelian = kemasan dibeli × harga per kemasan.

Untuk penjualan per lembar:
- Lembar dibeli = kebutuhan lembar (dikurangi stok yang memang tersedia, jika fitur stok sudah diaktifkan).
- Uang pembelian = lembar yang harus dibeli × harga per lembar.

## 3. Biaya yang harus dibedakan

- Harga material per m²: nilai pembanding harga material berdasarkan luas satu lembar.
- Uang pembelian proyek: uang yang benar-benar dibayarkan untuk memperoleh jumlah lembar/kemasan yang harus dibeli.
- Biaya pembelian per m² bidang: uang pembelian proyek ÷ luas bidang.
- Nilai sisa persediaan tidak otomatis menjadi limbah atau biaya yang habis dipakai pada proyek.

## 4. Sisa dan limbah

Jangan menyebut seluruh selisih luas lembar dan luas bidang sebagai limbah. Laporan harus memisahkan:
- sisa lembar utuh;
- sisa potongan yang masih dapat dipakai;
- limbah potongan yang tidak memenuhi ukuran minimum pemakaian;
- selisih luas teoritis yang belum diklasifikasikan.

Klasifikasi sisa potongan memerlukan data ukuran, bukan hanya selisih luas.

## 5. Batasan optimasi

Algoritma pemotongan dua dimensi (2D cutting-stock) menentukan bagaimana bentuk potongan ditempatkan pada lembar sumber. Pembagian luas saja tidak membuktikan bahwa susunan potongan dapat dipotong secara fisik. Mesin harus memeriksa ukuran, orientasi, rotasi yang diizinkan, jarak potong/kerf jika relevan, dan sisa yang dapat dipakai kembali.

Sebelum seluruh pola dan kondisi diuji, hasil jumlah lembar adalah estimasi berdasarkan algoritma yang digunakan, bukan jaminan jumlah minimum global.
