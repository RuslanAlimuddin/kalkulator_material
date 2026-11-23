# Dokumen Serah-Terima Proyek — Kalkulator Material Bangunan

Dokumen ini adalah catatan resmi untuk melanjutkan pekerjaan lintas percakapan. Baca dokumen ini dan periksa kondisi repository sebelum memulai tahap baru.

## 1. Tujuan proyek

Mengembangkan Kalkulator Material Bangunan yang menghasilkan perhitungan kebutuhan material secara akurat, menyediakan estimasi biaya, serta mengelola inventaris sisa material dengan aman. Integrasi inventaris tidak boleh merusak atau mengubah perilaku kalkulasi lama tanpa alasan teknis yang jelas.

## 2. Repository dan branch kerja

- Repository: https://github.com/RuslanAlimuddin/kalkulator_material
- Branch kerja: `pengembangan-mesin-hitung`
- Branch `main`: jangan diubah dalam rangkaian pekerjaan ini.
- Jangan melakukan merge tanpa persetujuan eksplisit pengguna.

## 3. Aturan pengerjaan

1. Sebelum bekerja, periksa branch dan HEAD aktual repository.
2. Gunakan dokumen ini sebagai konteks awal, tetapi utamakan kondisi kode terbaru di GitHub jika berbeda.
3. Jangan mengulang audit yang telah selesai tanpa alasan teknis.
4. Prioritaskan konsistensi antar-modul, akurasi hitungan, dan keamanan data.
5. Jangan mengubah kode hanya untuk menambah jumlah commit. Perubahan harus didukung temuan yang jelas.
6. Setiap perbaikan wajib disertai pengujian regresi yang relevan.
7. Setelah perubahan, jalankan atau verifikasi seluruh CI yang relevan; jangan menyatakan lulus jika hasilnya belum terlihat.
8. Hindari pengujian manual bernilai rendah. Kumpulkan daftar uji manual untuk pengguna setelah audit teknis yang relevan selesai.
9. Jangan mengubah `main`, jangan merge, dan jangan mengubah branch kerja tanpa alasan dan persetujuan yang sesuai.
10. Jelaskan hasil dalam bahasa Indonesia sederhana, dengan langkah konkret untuk pengguna pemula.

## 4. Riwayat pekerjaan yang telah diselesaikan

Audit dan pengembangan sebelumnya telah mencakup area berikut:

- Geometri dan mesin pemotongan material.
- Pencocokan serta pemanfaatan sisa inventaris.
- Integrasi kalkulator dengan pratinjau inventaris.
- Alur pratinjau, reservasi, pembatalan, dan penyelesaian pekerjaan.
- Penyimpanan, migrasi, pemulihan, dan penggunaan IndexedDB.
- Validasi material, harga, dan isi kemasan.
- Pemeriksaan antarmuka serta dokumentasi API.
- Penambahan `assets/js/pricing-engine.js` sebagai mesin estimasi harga yang terpisah dari DOM.
- Pengujian unit mesin harga dan pengujian browser untuk integrasi harga serta alur inventaris.

Pengujian browser yang telah ditambahkan mencakup: kalkulasi harga satuan, pembelian kemasan utuh, penggunaan sisa inventaris pada pratinjau, pembatalan pratinjau saat input berubah, reservasi, pemulihan setelah reload, pembatalan reservasi, penyelesaian pekerjaan, dan laporan ketidaksesuaian referensi inventaris.

## 5. Temuan yang belum selesai

### A. Sinkronisasi estimasi biaya dengan penggunaan inventaris

Pratinjau inventaris dapat membagi kebutuhan menjadi lembar yang dipenuhi dari sisa inventaris dan lembar baru yang harus disediakan. Namun, estimasi harga kalkulator saat ini dihitung dari jumlah lembar hasil kalkulasi pemotongan biasa.

Belum dipastikan apakah estimasi harga yang tampil dimaksudkan sebagai:
- biaya pembelian material baru setelah inventaris digunakan; atau
- nilai total material yang dibutuhkan, termasuk material yang sudah tersedia di inventaris.

Jangan mengubah perilaku harga sebelum makna bisnis ini ditetapkan. Audit berikutnya harus menelusuri aliran data dari hasil pratinjau inventaris ke tampilan harga dan menentukan apakah perbedaan tersebut merupakan bug atau memang dua jenis estimasi yang berbeda.

### B. Verifikasi status CI dan HEAD

Pada pemeriksaan terakhir, commit `d70724cffba86dc755b838855d9d5c9add694a98` berhasil ditemukan dan dibaca. Branch `pengembangan-mesin-hitung` juga berhasil ditemukan, dan file-file pada branch tersebut dapat diambil.

Pengguna sebelumnya melaporkan empat pemeriksaan CI lulus pada commit tersebut. Namun, pemeriksaan status GitHub yang tersedia pada sesi terakhir tidak menampilkan status individual (hasil kosong). Karena itu, jangan menyatakan empat CI telah diverifikasi ulang sampai hasil workflow/check yang sebenarnya dapat diperoleh.

### D. Audit awal transaksi reservasi dan konsumsi

Pemeriksaan statis pada `inventory-storage.js`, `inventory-engine.js`, dan pengujian terkait menunjukkan bahwa reservasi massal serta konsumsi multi-reservasi menggunakan transaksi IndexedDB `readwrite` yang mencakup store terkait. Pengujian yang ada memeriksa rollback saat salah satu sumber gagal, konflik dua instance yang mencoba memakai sumber sama, dan kegagalan konsumsi agar sumber serta sisa baru tidak berubah sebagian.

Ini merupakan bukti cakupan desain dan pengujian yang baik, tetapi belum sama dengan verifikasi eksekusi CI terbaru. Audit berikutnya tetap perlu memeriksa jalur lain yang relevan dan status workflow aktual; jangan mengulang pengujian yang sudah tercakup tanpa alasan.

### C. Pengujian browser belum tercantum dalam pipeline CI yang diperiksa

File `tests/browser/inventory-preview.test.js` berisi pengujian browser penting untuk integrasi harga dan alur inventaris. Namun, workflow `.github/workflows/test.yml` yang diperiksa hanya menjalankan `npm run test:inventory` dan `npm run test:regression`. Kedua skrip tersebut tidak menjalankan file pengujian browser itu. `package.json` juga belum mencantumkan Playwright sebagai dependensi pengujian.

Artinya, keberadaan file uji browser belum membuktikan bahwa uji tersebut berjalan otomatis di CI. Periksa apakah ada workflow atau mekanisme CI lain yang memang menjalankannya. Jika tidak ada, rancang integrasi Playwright ke CI sebagai pekerjaan terpisah, dengan dependensi dan pemasangan browser yang jelas. Jangan menganggap pemeriksaan browser lulus hanya karena workflow unit/regresi lulus.

## 6. HEAD dan posisi repository

- Commit kode terakhir yang menjadi acuan audit: `d70724cffba86dc755b838855d9d5c9add694a98` (`test: cover pricing engine and calculator UI integration`).
- Riwayat commit dokumentasi yang diketahui dalam sesi audit ini: `6674a276ff5de045e0fc7d0082351f6bc4c6cadc`, `e219a6a39afde61f63d81a3afbe3146acb1ebd70`, dan `b5a57288f3b9c68c2884e4886eed325a335c2698` (prosedur penyelamatan konteks dan catatan audit), seluruhnya tanggal 2026-11-23.
- Dokumen ini dapat diperbarui lagi setelah pencatatan di atas; karena itu, jangan menganggap daftar commit dokumentasi sebagai pointer HEAD terkini.
- Catatan penting: commit dokumentasi terbaru adalah commit terakhir yang dibuat melalui sesi audit ini, tetapi pointer HEAD aktual branch belum dapat dibaca secara independen oleh alat yang tersedia. Setiap sesi baru wajib memeriksa HEAD aktual terlebih dahulu.

## 7. Tahapan audit berikutnya

1. Periksa HEAD aktual branch kerja dan pastikan tidak ada perubahan baru yang belum tercatat.
2. Periksa workflow GitHub Actions/checks dan catat hasil empat CI secara eksplisit. Pastikan pengujian browser benar-benar dijalankan otomatis, bukan hanya tersimpan sebagai file.
3. Telusuri alur perhitungan harga pada `index.html`, `pricing-engine.js`, dan `inventory-preview-ui.js`.
4. Tetapkan perbedaan antara biaya pembelian baru dan nilai total kebutuhan material; jangan mengasumsikan keduanya sama.
5. Jika ditemukan bug integrasi yang terbukti, tambahkan uji regresi terlebih dahulu atau bersamaan dengan perbaikan.
6. Audit validasi input harga dan kebutuhan lembar pada batas antar-modul.
7. Audit kegagalan penyimpanan, transaksi atomik, dan pemulihan agar stok tidak berubah sebagian.
8. Setelah setiap perbaikan, jalankan seluruh rangkaian CI yang relevan dan catat hasilnya.
9. Setelah audit teknis selesai, berikan ringkasan akhir dan daftar uji manual yang benar-benar perlu dilakukan pengguna.

## 8. Kalimat pemicu percakapan baru

Pengguna cukup menulis:

**Lanjutkan proyek Kalkulator Material dari tahap terakhir.**

Maknanya: baca dokumen ini, periksa repository/branch/HEAD aktual, ambil pekerjaan dari temuan terbuka, dan jangan mengulang tahap yang telah selesai tanpa alasan teknis.

## 9. Prosedur penyelamatan jika percakapan penuh

Jika percakapan berakhir sebelum dokumen ini sempat diperbarui:

1. Pada percakapan baru, gunakan kalimat: **Lanjutkan proyek Kalkulator Material dari tahap terakhir.**
2. Periksa branch, HEAD, commit terbaru, dan status working tree/repository terlebih dahulu.
3. Baca dokumen ini dan bandingkan dengan perubahan repository terbaru.
4. Cari catatan ringkasan/serah-terima terakhir yang tersedia pada percakapan sebelumnya jika konteks itu dapat diakses.
5. Jika ada pekerjaan yang belum tercatat, susun ulang hanya dari bukti yang tersedia (commit, file, hasil pengujian, dan catatan). Tandai bagian yang belum pasti; jangan mengarang status.
6. Jangan mengulang audit selesai kecuali kode berubah atau ada alasan teknis.

Pada akhir setiap tahap besar, perbarui dokumen ini. Jika belum sempat memperbarui, berikan pengguna catatan penyelamatan singkat yang memuat: branch, commit terakhir yang diketahui, file yang diperiksa/diubah, hasil sementara, temuan terbuka, dan langkah berikutnya.

