# Audit Awal Kalkulator Material

Tanggal: 2026-11-17

## File dasar
- `index.html` adalah salinan kerja dari `kalkulator_material_perbaikan.html`.
- Salinan awal juga disimpan di `backup/kalkulator_material_perbaikan.html`.
- Pemeriksaan sintaks JavaScript menggunakan Node.js `node --check` berhasil.

## Temuan kode yang perlu ditangani

1. **Arah geser vertikal belum dihitung.** Pilihan arah pada UI menggunakan ID `vertikal`, tetapi cabang kalkulasi hanya menangani `horizontal`. Akibatnya, memilih arah vertikal dapat menghasilkan grid kosong atau hasil tidak benar.
2. **Perhitungan lembar sumber belum akurat untuk semua potongan.** Kode menghitung sumber lembar berdasarkan grid pemasangan; satu lembar yang dipotong menjadi beberapa bagian untuk posisi pemasangan belum ditangani secara umum.
3. **Mode Ekonomis memakai algoritma sisa persegi panjang sederhana.** Ini bukan algoritma optimasi pemotongan dua dimensi (2D cutting-stock) yang menjamin jumlah lembar minimum.
4. **Angka “Sisa terbuang” terlalu disederhanakan.** Rumus mengurangi luas bidang dari total luas lembar sumber. Hasilnya belum memisahkan sisa utuh, sisa potongan yang dapat dipakai kembali, dan limbah sebenarnya.
5. **Harga kemasan sudah memiliki pembulatan pembelian.** Fungsi `getInfoHarga()` menghitung jumlah kemasan utuh dengan pembulatan ke atas, sisa lembar utuh, harga material per m², dan biaya per m² bidang. Perlu pengujian skenario untuk memastikan angka kebutuhan lembar sumber yang menjadi masukannya sudah benar.
6. **Pilihan preset material masih ada.** Perlu dipastikan apakah preset akan dihapus sesuai arah pengembangan yang disepakati.
7. **Aplikasi saat ini fokus pada material berbentuk lembar.** Material batang, gulungan, dan curah belum menjadi cakupan tahap awal.

## Urutan pengerjaan yang disarankan

1. Buat kasus uji acuan dan dokumentasikan rumus.
2. Pisahkan kebutuhan pemasangan dari kebutuhan lembar sumber/pemotongan.
3. Perbaiki hitungan potongan dari satu lembar sumber.
4. Perbaiki arah pola vertikal atau nonaktifkan sementara sampai siap.
5. Pisahkan sisa utuh, sisa dapat digunakan, dan limbah.
6. Uji biaya pembelian satuan dan kemasan.
7. Baru lanjutkan fitur stok, beberapa bidang, bukaan pintu/jendela, dan laporan proyek.

## Batasan sementara

Jangan gunakan angka “limbah” atau “jumlah lembar minimum” sebagai jaminan optimasi pemotongan sebelum mesin baru diuji pada kasus-kasus nyata.
