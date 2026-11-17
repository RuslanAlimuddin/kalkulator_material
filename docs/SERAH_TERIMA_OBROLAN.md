# SERAH TERIMA PROYEK — KALKULATOR MATERIAL BANGUNAN

Dokumen ini menjadi catatan utama untuk memindahkan pekerjaan ke obrolan ChatGPT baru ketika percakapan lama penuh.

## 1. Identitas proyek
- Repositori: https://github.com/RuslanAlimuddin/kalkulator_material
- Branch pengembangan aktif: `pengembangan-mesin-hitung`
- Branch utama: `main`
- Aplikasi: HTML, CSS, dan JavaScript murni; harus tetap bisa berjalan offline.
- Lingkungan pengguna: Windows, VS Code, Live Server, Git, Python.

## 2. Tujuan aplikasi
Membuat kalkulator material bangunan berbentuk lembaran (triplek, GRC, kalsiboard, keramik, panel) yang menghitung:
1. geometri pemasangan pada bidang;
2. daftar ukuran potongan yang dibutuhkan;
3. susunan potongan pada lembar sumber (pemotongan 2D);
4. sisa lembar utuh, sisa potongan yang masih layak, dan limbah;
5. stok awal, jumlah pembelian, satuan kemasan, dan biaya;
6. diagram pemasangan serta diagram pemotongan sumber secara terpisah;
7. laporan yang bisa dicetak.

## 3. Keputusan dan prinsip wajib
- Semua perubahan kode dilakukan di branch `pengembangan-mesin-hitung`; jangan mengubah `main` selama refaktor.
- Jangan menghapus atau menimpa file backup.
- Pertahankan HTML/CSS/JavaScript murni dan kemampuan offline.
- Pisahkan geometri pemasangan pada dinding/lantai dari optimasi pemotongan lembar sumber.
- Jumlah lembar harus dihitung dari susunan potongan fisik, bukan hanya jumlah grid atau pembagian luas.
- Jangan menyebut selisih luas sebagai limbah. Sisa harus diklasifikasikan berdasarkan bentuk dan ukuran.
- Jangan menjanjikan hasil paling hemat global jika algoritma yang digunakan hanya heuristik (pendekatan).
- Pengguna pemula dan meminta panduan sederhana dalam bahasa Indonesia. Jika memungkinkan, lakukan perubahan langsung di GitHub agar pengguna tidak perlu menyalin kode manual.
- Setelah setiap tahap, jalankan tes yang tersedia, laporkan apa yang benar-benar diuji, dan perbarui dokumen ini.

## 4. Lingkungan pengguna yang telah diperiksa
- Windows.
- Python 3.14.5 terpasang.
- Git 2.55.0 terpasang.
- VS Code 1.146.0, 64-bit.
- Live Server oleh Ritwick Dey sudah terpasang dan aktif (dibuktikan melalui screenshot pengguna).
- Jangan meminta pengguna menginstal ulang perangkat tersebut tanpa alasan teknis baru.

## 5. Riwayat repositori
Pada branch `main` sudah ada:
- `index.html`
- `backup/kalkulator_material_perbaikan.html` (cadangan, jangan disentuh)
- `README.md`
- `docs/CATATAN_AUDIT_AWAL.md`
- `docs/RUMUS_PERHITUNGAN.md`
- `tests/KASUS_UJI_AWAL.md`

Branch `pengembangan-mesin-hitung` dibuat untuk pekerjaan refaktor. Dokumen rencana ada di:
- `docs/RENCANA_REFAKTOR.md`

## 6. Status kode pada branch pengembangan
Saat dokumen ini dibuat, branch pengembangan sudah memiliki:
- `index.html`: antarmuka aplikasi dan integrasi pemanggilan `MaterialEngine.calculateGeometry(...)`.
- `assets/js/engine.js`: modul geometri murni tanpa DOM, diekspor untuk browser dan Node.js. Menghasilkan koordinat potongan bidang, ukuran potongan tepi, pola Stack/Running/Third Bond, arah horizontal/vertikal, dan alignment. Properti `cols` ditambahkan sebagai alias kompatibilitas untuk pemanggilan UI lama, selain `columns`.
- `tests/engine.test.js`: pengujian dasar, validasi input, dan matriks 54 kombinasi pola × arah × alignment.
- `docs/RENCANA_REFAKTOR.md`: urutan tahap refaktor.

Pengujian pada sesi 17 November 2026: isi `tests/engine.test.js` dijalankan melalui runtime JavaScript terisolasi dengan shim untuk modul `node:assert`; seluruh 4 pengujian bernama dan matriks 54 kombinasi pola/arah/alignment lulus. Kasus regresi 600×100 cm dengan potongan 20×100 cm menghasilkan 30 potongan. Ini bukan pengujian Node.js di PC pengguna dan bukan pengujian browser/Live Server. Pengujian dengan Node.js dan Live Server tetap perlu dilakukan sebelum integrasi dinyatakan final.

## 7. Audit awal dan batasan yang masih harus ditangani
- Fungsi `getInfoHarga()` di aplikasi lama sudah menghitung harga per lembar dari harga kemasan, jumlah kemasan dibulatkan ke atas, uang pembelian, sisa lembar utuh, harga per m² material, dan biaya pembelian per m² bidang.
- Mesin lama sebelumnya mencampur jumlah grid pemasangan dengan jumlah lembar sumber.
- `makeStok()` adalah heuristik sederhana, bukan algoritma pemotongan 2D yang menjamin hasil optimal.
- Label lama "Sisa terbuang" memakai selisih luas sederhana dan tidak menggambarkan bentuk sisa yang sebenarnya.
- Visualisasi lama adalah diagram pemasangan pada bidang, bukan diagram pemotongan lembar sumber.
- Pastikan kontrak data `engine.js` cocok dengan yang dipakai `index.html`, termasuk nama properti `rows/columns`, koordinat, dan jumlah potongan.
- Periksa apakah tes 54 kombinasi benar-benar mencakup kondisi nat/gap lebih dari nol; jika belum, tambahkan tes khusus gap.
- Kasus regresi penting: bidang 600×100 cm, material sumber 600×20 cm dipasang portrait sehingga bidang tertutup oleh 30 potongan berukuran 20×100 cm. Dengan enam potongan dari satu lembar, kebutuhan teoritisnya 5 lembar. Jangan menganggap modul geometri saja sudah menyelesaikan pemotongan sumber.

Catatan perubahan terbaru: commit `04cbac9511fed3aad8f0815ec8b3aa0f9120e30a` pada branch pengembangan menambahkan alias `cols` pada hasil engine karena `index.html` lama membaca `geometry.cols`. Pengujian ulang terhadap engine setelah perubahan tetap lulus.

## 8. Rencana tahapan
1. **Fondasi dan geometri:** jalankan tes engine, periksa kontrak integrasi UI, verifikasi pola, arah, alignment, gap, dan tepi bidang.
2. **Pemotongan lembar sumber:** bentuk daftar potongan dari geometri, tempatkan pada lembar sumber, dukung rotasi sesuai aturan material, lacak sisa persegi panjang, buat diagram potong.
3. **Stok dan pembelian:** kurangi kebutuhan dengan stok, pisahkan lembar sumber yang diperlukan, lembar/kemasan yang dibeli, sisa persediaan, nilai sisa, dan biaya.
4. **UI dan laporan:** tampilkan diagram pemasangan dan diagram potong secara terpisah, tampilkan kategori sisa secara jujur, sediakan laporan cetak.
5. **Validasi akhir:** uji di Live Server dan browser; uji skenario material dan harga yang realistis.

## 9. Dokumen acuan yang wajib dibaca
- `docs/RENCANA_REFAKTOR.md`
- `docs/RUMUS_PERHITUNGAN.md`
- `docs/CATATAN_AUDIT_AWAL.md`
- `tests/KASUS_UJI_AWAL.md`
- `assets/js/engine.js`
- `tests/engine.test.js`
- `index.html`

## 10. Instruksi untuk asisten di obrolan baru
1. Baca dokumen serah-terima ini terlebih dahulu.
2. Baca seluruh dokumen dan kode acuan di atas dari branch `pengembangan-mesin-hitung`.
3. Periksa commit terbaru dan isi file di GitHub; dokumen ini bisa saja belum memuat perubahan yang terjadi setelah dibuat.
4. Lanjutkan dari pekerjaan terakhir yang benar-benar selesai. Jangan mengulang audit atau mengerjakan ulang bagian yang sudah tuntas.
5. Jangan mengubah branch `main` dan jangan menghapus file backup.
6. Jalankan tes yang tersedia sebelum mengubah engine. Setelah perubahan, jalankan lagi tes dan tambahkan kasus uji untuk bug yang diperbaiki.
7. Jangan menyebut tes lulus atau aplikasi berjalan sebelum ada bukti hasil pengujian.
8. Kerjakan perubahan langsung di branch pengembangan melalui koneksi GitHub yang tersedia, jika alat tersebut tersedia.
9. Beri penjelasan sederhana dalam bahasa Indonesia dan berikan langkah berikutnya yang benar-benar diperlukan pengguna.
10. Setelah pekerjaan bermakna selesai, perbarui dokumen serah-terima ini agar obrolan berikutnya bisa meneruskan pekerjaan.

## 11. Teks pembuka obrolan baru
Salin teks dari `docs/PROMPT_LANJUTAN_OBROLAN_BARU.md` atau gunakan template berikut:

> Kita melanjutkan proyek Kalkulator Material Bangunan dari percakapan sebelumnya. Repositori GitHub: https://github.com/RuslanAlimuddin/kalkulator_material. Branch kerja: pengembangan-mesin-hitung. Baca terlebih dahulu docs/SERAH_TERIMA_OBROLAN.md dan semua dokumen/kode acuan yang disebutkan di dalamnya. Periksa kondisi repo terbaru, lalu lanjutkan tepat dari status terakhir yang benar-benar selesai. Jangan mengulang pekerjaan, jangan mengubah branch main, dan jangan menghapus backup. Kerjakan langsung di GitHub bila koneksi tersedia. Jelaskan dalam bahasa Indonesia sederhana dan catat progres terbaru di dokumen serah-terima.
