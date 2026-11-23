# Checklist Uji Manual — Kalkulator Material dan Inventaris

Dokumen ini adalah daftar uji singkat untuk pemeriksaan penggunaan nyata setelah audit otomatis. Jalankan pada salinan data uji, bukan data inventaris produksi.

## A. Kalkulator utama dan harga

- [ ] Isi ukuran bidang, ukuran material, orientasi, pola, dan mode.
- [ ] Tekan **Hitung Kebutuhan Material**. Pastikan jumlah lembar, rincian potongan, dan visualisasi muncul.
- [ ] Isi harga per lembar, tekan Hitung, lalu pastikan nilai kebutuhan material dan biaya per m² bidang muncul.
- [ ] Ubah harga tanpa menekan Hitung. Pastikan hasil utama tetap menunjukkan hasil perhitungan terakhir; tekan Hitung lagi dan pastikan nilai harga diperbarui.
- [ ] Pilih harga per kemasan dan isi kemasan yang valid. Pastikan jumlah kemasan dibulatkan ke atas, lembar dibeli, dan sisa lembar utuh ditampilkan.
- [ ] Uji harga kosong/nol, harga negatif, serta isi kemasan nol/pecahan. Pastikan pesan validasi jelas dan tidak ada angka biaya yang menyesatkan.

## B. Pratinjau inventaris

- [ ] Buat satu material aktif dan satu pekerjaan berstatus terbuka pada katalog inventaris.
- [ ] Catat satu atau lebih sisa material yang cocok dengan material, ketebalan, kondisi, arah serat, dan motif yang dipilih.
- [ ] Pilih pekerjaan dan material katalog yang sesuai, lalu buat pratinjau.
- [ ] Bandingkan **Nilai kebutuhan material (tanpa inventaris)** dengan **Estimasi pembelian baru (setelah inventaris)**.
- [ ] Pastikan kedua estimasi menampilkan harga material per m² dan estimasi biaya per m² bidang.
- [ ] Ubah harga atau isi kemasan saat pratinjau masih terbuka. Pastikan estimasi harga berubah, tetapi hasil geometri tetap sama.
- [ ] Pastikan pratinjau tidak mengubah status stok atau membuat reservasi.
- [ ] Ubah ukuran bidang/material, orientasi, jarak nat, pola, arah pola, alignment, mode, atau ambang sisa. Pastikan pratinjau lama hilang dan harus dibuat ulang.
- [ ] Ganti pilihan material/pekerjaan atau arah serat. Pastikan pratinjau lama hilang.
- [ ] Nonaktifkan material atau tutup pekerjaan pada katalog, lalu tekan Refresh. Pastikan pratinjau lama dan tombol persetujuannya hilang.
- [ ] Saat ada rencana berstatus reserved, coba ubah ketebalan, motif, kebijakan rotasi, atau status aktif material. Pastikan perubahan yang membuat snapshot tidak cocok ditolak sampai rencana diselesaikan atau dibatalkan.
- [ ] Pastikan perubahan nama material saja tetap dapat dilakukan karena tidak mengubah spesifikasi fisik snapshot.

## C. Reservasi dan penyelesaian

- [ ] Buat pratinjau baru dengan data yang benar, lalu tekan persetujuan.
- [ ] Pastikan sumber sisa yang ditampilkan berubah menjadi berstatus **reserved** dan rencana aktif tercatat.
- [ ] Muat ulang halaman. Pastikan rencana reservasi masih tampil dan dapat dipulihkan.
- [ ] Batalkan rencana. Pastikan sumber sisa kembali **available**.
- [ ] Buat reservasi baru, lalu lakukan penyelesaian hanya setelah pemotongan fisik benar-benar dilakukan.
- [ ] Pastikan sumber lama dikonsumsi dan sisa hasil pemotongan dicatat sebagai sisa inventaris baru.
- [ ] Periksa peringatan audit inventaris. Jangan menyelesaikan rencana bila ada ketidaksesuaian yang belum dipahami.

## Catatan hasil

Catat tanggal, browser/perangkat, skenario, hasil aktual, hasil yang diharapkan, dan tangkapan layar bila ada kegagalan. Jangan menggunakan stok nyata untuk uji pembatalan/penyelesaian.
