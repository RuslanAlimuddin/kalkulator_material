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

Pengujian pada sesi 17 November 2026: isi `tests/engine.test.js` dijalankan melalui runtime JavaScript terisolasi dengan shim untuk modul `node:assert`; seluruh 6 pengujian bernama dan matriks 54 kombinasi pola/arah/alignment lulus, termasuk nat 1 cm dan kasus strip 600×100 cm. Kasus regresi 600×100 cm dengan potongan 20×100 cm menghasilkan 30 potongan. Ini bukan pengujian Node.js di PC pengguna dan bukan pengujian browser/Live Server. Pengujian dengan Node.js dan Live Server tetap perlu dilakukan sebelum integrasi dinyatakan final.

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


## 12. Progres setelah pengujian PC pengguna — 17 November 2026
Pengguna berhasil menjalankan `node tests/engine.test.js` di PC Windows (Node.js v24.18.0). Hasil yang dikirim menunjukkan seluruh pengujian bernama, matriks 54 kombinasi, tes nat, dan kasus strip 600×100 cm lulus. Ini adalah bukti tes Node.js lokal untuk mesin geometri.

Modul pemotongan awal kemudian ditambahkan di branch ini:
- `assets/js/cutting-engine.js` — algoritma guillotine best-fit (heuristik), modul murni tanpa DOM.
- `tests/cutting-engine.test.js` — pengujian untuk jumlah lembar, potongan tepat ukuran, beberapa potongan per lembar, rotasi, kerf, dan validasi.
- `docs/DESAIN_MESIN_PEMOTONGAN.md` — API, asumsi, batasan, dan cara pengujian.

Commit terkait:
- Mesin pemotongan: `46c27ac8e63fe8269b44a03f763944c5bff5b71a`
- Tes pemotongan: `38ad10f89ac25320d830592fb94b250d0800b613`
- Koreksi kasus kerf: `cac7a25dbc32824d7de161bb282da632d3cd0819`
- Perbaikan klasifikasi ruang lebih kecil dari kerf: `e889f17a707de8b25b5fc4add73582560e1eac55`
- Tambahan tes kerf: `e616a2fc39225e799aecd59c1e41a3fcf96e42e1`
- Dokumentasi desain: `feaca6c61321bfcf29d4ccb34b44d66b6a826e79`

Status validasi modul baru:
- Isi `tests/cutting-engine.test.js` dijalankan terhadap isi `assets/js/cutting-engine.js` yang diambil dari branch melalui pengujian JavaScript terisolasi; seluruh 7 kasus lulus.
- Ini bukan eksekusi Node.js lokal. Pengguna perlu mengunduh ZIP branch terbaru dan menjalankan kedua perintah Node di dokumen desain.
- Mesin pemotongan BELUM diintegrasikan ke `index.html`; fungsi lama `makeStok()` masih digunakan oleh UI.
- Belum ada keputusan UI untuk arah serat/motif, batas rotasi tiap jenis material, atau ukuran minimum sisa pakai. Modul memakai default aman `allowRotation: false`; kerf default 0 dan dapat dikonfigurasi.
- Hasil algoritma adalah heuristik dan tidak boleh disebut solusi optimal global.

### Tugas berikutnya
1. Minta pengguna mengunduh ZIP terbaru branch `pengembangan-mesin-hitung`.
2. Jalankan `node tests\engine.test.js` dan `node tests\cutting-engine.test.js` dari folder root proyek.
3. Jika lulus, lanjutkan integrasi adapter dari `geometry.cells` ke `MaterialCuttingEngine.calculateCutting()`, dengan tetap mempertahankan diagram pemasangan.
4. Integrasikan hasil susunan potongan ke UI secara bertahap; jangan hapus `makeStok()` sebelum penggantinya terbukti dan tes regresi tersedia.
5. Pisahkan sisa persegi panjang, lembar utuh, stok, pembelian, dan limbah. Jangan menyimpulkan limbah hanya dari selisih luas.


## 13. Integrasi awal mesin pemotongan — 17 November 2026
Pengguna telah menjalankan kedua pengujian Node.js langsung di PC Windows dan mengirim hasil lulus:
- `node tests/engine.test.js`: pengujian bernama, matriks 54 kombinasi pola/arah/alignment, nat, dan strip 600×100 cm semuanya lulus.
- `node tests/cutting-engine.test.js`: seluruh 7 kelompok tes mesin pemotongan lulus.

Setelah hasil tersebut diterima, adapter dan integrasi awal dibuat pada branch `pengembangan-mesin-hitung`:
- `assets/js/cutting-adapter.js`: mengubah `geometry.cells` menjadi daftar potongan untuk mesin sumber. Adapter mempertahankan koordinat bidang untuk visualisasi lama.
- `tests/cutting-adapter.test.js`: 5 kelompok tes untuk mode presisi, aturan strip panjang, mode ekonomis, kontrak data UI, dan validasi.
- `index.html`: memuat `cutting-engine.js` dan `cutting-adapter.js`; kalkulasi lembar sumber sekarang memakai adapter, bukan pemanggilan `makeStok()`.
- Kartu hasil memisahkan sisa persegi panjang tercatat dan area belum terklasifikasi. Area belum terklasifikasi tidak diberi label limbah.
- CSS metrik memakai kolom adaptif agar lima metrik bisa menyesuaikan lebar layar.

Perilaku integrasi sementara:
- Mode Presisi: satu lembar sumber per grid, kecuali aturan khusus strip panjang yang mengizinkan beberapa potongan dari satu lembar.
- Mode Ekonomis: potongan dapat disusun bersama pada lembar sumber; rotasi diizinkan karena deskripsi mode lama menyatakan rotasi boleh digunakan.
- Kerf masih 0 cm secara default di UI. Belum ada pengaturan pengguna untuk kerf.
- `makeStok()` dan helper grid lama sengaja belum dihapus sebagai cadangan; kalkulasi utama sudah tidak memanggilnya.
- Diagram yang ada tetap diagram pemasangan pada bidang, bukan diagram pemotongan lembar sumber.

Commit integrasi terbaru:
- Adapter: `9d6404187687903f42d27d50f552032bf838a02c`
- Tes adapter: `29cf4f214c258bd8eb260cc9aa2a79abeb7580be`
- Integrasi adapter ke `index.html`: `88433d790d5508fa0e8c5134445e2f5216ab9775`
- Tata letak metrik adaptif: `8b85674504455623e15fd8cac8390e1a7e103548`

Status tes setelah integrasi:
- Dua suite lama sudah terbukti lulus di Node.js PC pengguna sebelum integrasi.
- Tes adapter baru sudah ditambahkan, tetapi BELUM dijalankan di Node.js PC pengguna.
- Integrasi UI belum diverifikasi melalui browser/Live Server. Jangan menyatakan aplikasi final atau bebas regresi sebelum langkah berikut dilakukan.

### Langkah pengguna berikutnya
1. Unduh ZIP terbaru branch kerja: https://github.com/RuslanAlimuddin/kalkulator_material/archive/refs/heads/pengembangan-mesin-hitung.zip
2. Ekstrak ke folder baru, misalnya `D:\\kalkulator_material_uji2` (jangan timpa folder uji lama).
3. Buka CMD dan jalankan dari root proyek:
   ```cmd
   cd /d "D:\\kalkulator_material_uji2"
   node tests\\engine.test.js
   node tests\\cutting-engine.test.js
   node tests\\cutting-adapter.test.js
   ```
4. Kirim hasil ketiga tes. Jika semuanya lulus, lanjutkan uji tampilan browser untuk mode Presisi/Ekonomis, strip 600×100 cm, rotasi, harga per lembar, dan harga per kemasan.

Jangan hapus `makeStok()` dahulu. Setelah adapter dan UI terbukti stabil, baru lakukan pembersihan helper lama dalam commit terpisah.


## 14. Hasil tes adapter lokal pengguna — 17 November 2026
Pengguna mengunduh branch terbaru ke `D:\\kalkulator_material_uji2` dan melaporkan ketiga suite Node.js berhasil:
- `node engine.test.js`: tes geometri bernama, matriks 54 kombinasi, nat, dan kasus strip 600×100 cm lulus.
- `node cutting-engine.test.js`: seluruh 7 kelompok tes mesin pemotongan lulus.
- `node cutting-adapter.test.js`: seluruh 5 kelompok tes adapter lulus.

Ini adalah hasil eksekusi Node.js lokal yang dilaporkan langsung oleh pengguna. Pengujian unit (tes fungsi terpisah) kini lengkap untuk tiga lapisan mesin. Namun, belum ada bukti uji browser/Live Server, interaksi UI, canvas, atau alur harga setelah integrasi.

### Langkah berikutnya: uji browser/regresi UI
Minta pengguna membuka ZIP/folder `D:\\kalkulator_material_uji2` melalui Live Server (atau server lokal yang biasa dipakai), lalu:
1. Hitung dengan nilai awal aplikasi dan pastikan tidak ada pesan error; hasil dan diagram muncul.
2. Uji mode Presisi dan Ekonomis dengan ukuran bidang/material yang sama; catat jumlah lembar, grid reuse, serta tabel rincian.
3. Uji kasus strip panjang: material 20×600 cm dan bidang 600×100 cm; pastikan 30 grid dan 5 lembar sumber.
4. Uji beberapa ukuran material dan pola (Stack, Running, Third), arah horizontal/vertikal, dan alignment.
5. Isi harga per lembar; lalu uji harga per kemasan/dus dan jumlah isi. Pastikan estimasi total serta sisa lembar utuh masuk akal.
6. Periksa console browser (F12 → Console) jika ada error; minta pengguna mengirim pesan error dan hasil layar jika terjadi.

Jangan hapus fungsi `makeStok()` lama atau menyatakan integrasi final sebelum UI/regresi di atas selesai. Catatan teknis: diagram yang ada adalah diagram pemasangan pada bidang, bukan diagram pemotongan tiap lembar sumber. Kerf UI masih 0 cm; pengaturan kerf, arah serat, ukuran minimum sisa, dan inventaris stok sisa belum tersedia.


## 15. Hasil uji browser setelah integrasi — 18 November 2026
Pengguna telah menjalankan uji aplikasi melalui browser/Live Server dan melaporkan:
- Pengujian A — nilai bawaan: semua normal.
- Pengujian B — mode Presisi dan Ekonomis: terdapat sedikit perubahan nilai; tidak dilaporkan hasil yang janggal.
- Pengujian C — kasus khusus strip panjang: semua hasil benar.
- Pengujian D — harga material: hasil masuk akal.
- Console browser: tidak ada pesan merah/error.

Dengan laporan ini, validasi awal mencakup ketiga suite tes Node.js lokal pengguna (engine.test.js, cutting-engine.test.js, cutting-adapter.test.js) dan uji browser/Live Server untuk nilai bawaan, mode Presisi/Ekonomis, kasus strip panjang, serta harga.

Catatan ketelitian: ini adalah hasil uji manual yang dilaporkan pengguna, bukan hasil pengujian otomatis browser. Belum berarti seluruh kombinasi pola, arah, alignment, variasi material, stok, dan pembelian sudah diuji menyeluruh. Sedikit perbedaan hasil antara Presisi dan Ekonomis dapat terjadi karena aturan pemanfaatan lembar sumbernya memang berbeda; jangan menganggap kedua mode harus menghasilkan angka sama.

### Status tahap
Integrasi awal mesin geometri → adapter → mesin pemotongan pada UI lulus uji awal pengguna. Fungsi lama makeStok() dan helper terkait masih dipertahankan sebagai cadangan. Branch main dan backup tidak disentuh.

### Tahap pekerjaan selanjutnya
1. Periksa kembali kode terbaru index.html, cutting-adapter.js, dan cutting-engine.js untuk memahami persis arti setiap angka yang ditampilkan.
2. Pastikan istilah dan kategori hasil tidak menyesatkan: kebutuhan lembar sumber, grid/potongan yang dipakai ulang, sisa persegi panjang, area belum terklasifikasi, stok awal, jumlah pembelian, sisa lembar utuh, dan biaya.
3. Periksa alur harga untuk harga per lembar dan harga per kemasan, termasuk pembulatan jumlah kemasan.
4. Rencanakan pengembangan berikutnya secara bertahap: pengaturan kerf (lebar mata potong), batas ukuran minimum sisa yang dianggap layak pakai, aturan rotasi/arah serat per material, inventaris sisa stok, dan diagram tata letak pemotongan lembar sumber. Jangan menambahkan semua fitur sekaligus.
5. Jangan hapus makeStok() sebelum ada audit pemakaian final dan tes regresi tambahan. Penghapusan helper lama harus menjadi perubahan terpisah.
6. Jangan merge ke main tanpa persetujuan pengguna.

Bukti yang tersedia: hasil tes Node.js lokal dan laporan uji manual browser dari pengguna pada 17–18 November 2026. Belum ada screenshot atau rekaman hasil browser yang disimpan sebagai artefak pengujian.


## 16. Audit arti angka dan istilah UI — 18 November 2026
Audit kode index.html, assets/js/cutting-adapter.js, assets/js/cutting-engine.js, dan docs/DESAIN_MESIN_PEMOTONGAN.md menemukan bahwa:
- sheetCount adalah jumlah lembar sumber yang dipakai algoritma.
- reuseCount menghitung potongan kedua dan seterusnya pada lembar sumber yang sama. Ini bukan pengambilan stok sisa dari pekerjaan lama.
- reusableRemainders adalah ruang persegi panjang kosong yang tercatat pada lembar hasil saat ini; belum ada ukuran minimum sisa layak pakai.
- unclassifiedArea bukan otomatis limbah.
- Harga dihitung dari kebutuhan lembar algoritmik dan kemasan dibulatkan ke atas; stok awal/inventaris sisa belum mengurangi pembelian.
- Visualisasi sekarang adalah diagram pemasangan, bukan diagram pemotongan tiap lembar.

Teks UI diperbaiki agar tidak menyebut potongan tambahan pada lembar yang sama sebagai “dari sisa” atau menjanjikan “tidak beli baru”. Mode Ekonomis kini dijelaskan sebagai penyusunan beberapa potongan pada lembar sumber yang sama. Catatan rotasi juga diperjelas sebagai putaran 90 derajat.

Pengujian yang telah dilaporkan pengguna tetap: tiga suite Node.js lulus dan uji manual Live Server berjalan normal tanpa error console. Perubahan teks UI ini belum diuji ulang di browser; perlu satu pemeriksaan visual singkat setelah ZIP terbaru diunduh. Jangan menghapus makeStok(); jangan merge ke main.

Tahap setelah ini: buat rancangan ukuran minimum sisa layak pakai dan inventaris sisa lintas pekerjaan, dengan tes khusus. Kerf, arah serat/motif, dan diagram cutting layout per lembar tetap menjadi pengembangan terpisah.


## 17. Klasifikasi sisa berdasarkan ukuran minimum — 18 November 2026
Pengembangan ditambahkan pada branch pengembangan:
- Parameter `minRemainderW` dan `minRemainderH` (cm), default 0.
- Sisa dianggap memenuhi ukuran minimum hanya jika kedua dimensinya lolos.
- Keluaran baru `usableRemainders`, `tooSmallRemainders`, dan luas masing-masing.
- `reusableRemainders` tetap berisi seluruh ruang geometris untuk kompatibilitas; luas belum terklasifikasi tetap memakai semua ruang geometris.
- UI memiliki input lebar/tinggi minimum dan kartu hasil terpisah untuk sisa yang memenuhi batas dan yang di bawah batas.
- Klasifikasi ukuran tidak menjamin kondisi fisik atau kecocokan material.

Tes baru ditambahkan untuk batas minimum, nilai tepat di batas, dan input negatif. Tes belum dijalankan di PC pengguna. Setelah commit, jalankan tiga suite Node.js dan uji browser singkat; jangan merge ke main.
