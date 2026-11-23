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
2. Gunakan dokumen ini sebagai aturan dan riwayat induk. Untuk posisi kerja paling baru, baca juga `docs/STATUS_AUDIT_TERKINI.md`; utamakan kondisi repository terbaru jika berbeda.
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

### A. Sinkronisasi estimasi biaya dengan penggunaan inventaris — implementasi selesai

Makna bisnis ditetapkan dengan memisahkan dua angka:
- **Nilai kebutuhan material (tanpa inventaris):** estimasi pembelian untuk seluruh kebutuhan lembar menurut kalkulasi normal.
- **Estimasi pembelian baru (setelah inventaris):** estimasi pembelian untuk lembar baru yang masih diperlukan setelah sisa inventaris yang cocok digunakan.

Implementasi pada branch kerja:
- `inventory-workflow.preview()` dapat menghitung baseline kedua menggunakan planner dan adapter pemotongan yang sama, dengan daftar inventaris kosong.
- `inventory-app-bridge.js` meneruskan opsi baseline tersebut.
- `inventory-preview-ui.js` menghitung dan menampilkan kedua estimasi menggunakan `MaterialPricingEngine`, termasuk pembulatan kemasan.
- Perubahan harga/jenis harga/isi kemasan memperbarui estimasi tanpa mengulang pratinjau geometri.
- Perhitungan baseline hanya membaca/menghitung; tidak membuat reservasi atau mengubah stok.
- Tes unit workflow, tes bridge, dan tes browser memeriksa baseline tanpa inventaris, contoh kebutuhan 2 lembar dibanding pembelian 1 lembar, kebutuhan bruto 5 lembar dibanding pembelian 3 lembar pada kemasan isi 4, serta kondisi seluruh kebutuhan tertutup inventaris (pembelian baru Rp0). Perubahan harga ketika pratinjau terbuka juga diuji.

Jangan menyamakan satu unit sisa inventaris dengan satu lembar utuh untuk menilai kebutuhan bruto. Baseline bruto dihitung ulang tanpa inventaris menggunakan planner yang sama, sedangkan angka pembelian baru berasal dari `plan.newSheetCount`.

### B. Verifikasi status CI dan HEAD

Pada pemeriksaan terakhir, commit `d70724cffba86dc755b838855d9d5c9add694a98` berhasil ditemukan dan dibaca. Branch `pengembangan-mesin-hitung` juga berhasil ditemukan, dan file-file pada branch tersebut dapat diambil.

Pada HEAD kode `3a141a6e66091e1a353e1bc8265aac039ddd5b45`, empat check-run GitHub diverifikasi langsung dan semuanya `completed/success`: `browser-indexeddb`, `batch-reservation`, `inventory-and-regression`, dan `test`. CRUD material, validator impor, dan pemulihan rencana aktif kini memeriksa kecocokan snapshot material/pekerjaan dengan katalog. SHA dokumentasi setelah pembaruan harus diperiksa ulang karena setiap commit baru memicu CI baru.

### D. Audit awal transaksi reservasi dan konsumsi

Pemeriksaan statis pada `inventory-storage.js`, `inventory-engine.js`, dan pengujian terkait menunjukkan bahwa reservasi massal serta konsumsi multi-reservasi menggunakan transaksi IndexedDB `readwrite` yang mencakup store terkait. Pengujian yang ada memeriksa rollback saat salah satu sumber gagal, konflik dua instance yang mencoba memakai sumber sama, dan kegagalan konsumsi agar sumber serta sisa baru tidak berubah sebagian.

Ini merupakan bukti cakupan desain dan pengujian yang baik, tetapi belum sama dengan verifikasi eksekusi CI terbaru. Audit berikutnya tetap perlu memeriksa jalur lain yang relevan dan status workflow aktual; jangan mengulang pengujian yang sudah tercakup tanpa alasan.

### C. Status pengujian browser — sudah diverifikasi aktif di CI

Pemeriksaan seluruh direktori `.github/workflows` menemukan `.github/workflows/browser-indexeddb.yml`. Workflow ini memasang Playwright dan Chromium lalu menjalankan `tests/browser/indexeddb.test.js`, `tests/browser/inventory-plan-recovery.test.js`, `tests/browser/inventory-ui.test.js`, serta `tests/browser/inventory-preview.test.js`. Jadi pengujian browser sudah berjalan otomatis; tidak perlu membuat workflow Playwright baru hanya untuk menghubungkannya ke CI.

## 6. HEAD dan posisi repository

- HEAD yang berhasil diverifikasi sebelum pembaruan dokumen posisi audit: `35f3d4dfbba54f936bcea0165ce30c2f91d7ec6a` (`docs: clarify handoff revision history`).
- Pembaruan dokumen setelah itu akan menghasilkan commit baru; karena itu SHA tersebut bukan pointer permanen.
- Sumber posisi kerja terkini adalah `docs/STATUS_AUDIT_TERKINI.md`. Setiap sesi baru wajib memeriksa pointer branch aktual dan status CI terbaru secara langsung.

## 7. Tahapan audit berikutnya

Ikuti urutan rinci dalam `docs/STATUS_AUDIT_TERKINI.md`. Validasi batas adapter, input UI/katalog, CRUD material/pekerjaan, pemulihan snapshot, ID transaksi tunggal/massal, `planId`, ID pelepasan reservasi, dan nilai versi numerik inventaris telah diaudit/diperbaiki. Pemisahan estimasi kebutuhan bruto dan pembelian baru setelah inventaris juga sudah diimplementasikan dan diuji. Pada HEAD kode `07f4cec90056d63d92c34654c8e731c2e5e84401`, empat CI telah diverifikasi `completed/success`. Berikutnya audit tampilan saat harga kosong/nol, konsistensi label kotak harga kalkulator utama dengan dua estimasi pada pratinjau, serta batas numerik mesin harga (jumlah lembar/harga/total biaya overflow). Validasi harga negatif, isi kemasan nol, pembaruan isi kemasan, skenario nol lembar baru, dan ambang pembulatan kemasan sudah diuji. Jangan mengulang verifikasi yang sudah selesai tanpa perubahan atau alasan teknis.

## 8. Kalimat pemicu percakapan baru

Pengguna cukup menulis:

**Lanjutkan proyek Kalkulator Material dari tahap terakhir.**

Maknanya: baca dokumen ini dan `docs/STATUS_AUDIT_TERKINI.md`, periksa repository/branch/HEAD aktual, ambil pekerjaan dari temuan terbuka, dan jangan mengulang tahap yang telah selesai tanpa alasan teknis.

## 9. Prosedur penyelamatan jika percakapan penuh

Jika percakapan berakhir sebelum dokumen ini sempat diperbarui:

1. Pada percakapan baru, gunakan kalimat: **Lanjutkan proyek Kalkulator Material dari tahap terakhir.**
2. Periksa branch, HEAD, commit terbaru, dan status working tree/repository terlebih dahulu.
3. Baca dokumen ini dan bandingkan dengan perubahan repository terbaru.
4. Cari catatan ringkasan/serah-terima terakhir yang tersedia pada percakapan sebelumnya jika konteks itu dapat diakses.
5. Jika ada pekerjaan yang belum tercatat, susun ulang hanya dari bukti yang tersedia (commit, file, hasil pengujian, dan catatan). Tandai bagian yang belum pasti; jangan mengarang status.
6. Jangan mengulang audit selesai kecuali kode berubah atau ada alasan teknis.

Pada akhir setiap tahap besar, perbarui dokumen ini. Jika belum sempat memperbarui, berikan pengguna catatan penyelamatan singkat yang memuat: branch, commit terakhir yang diketahui, file yang diperiksa/diubah, hasil sementara, temuan terbuka, dan langkah berikutnya.



## 10. Dokumen posisi kerja terkini

Gunakan `docs/STATUS_AUDIT_TERKINI.md` sebagai catatan operasional yang lebih rinci dan selalu diperbarui. Dokumen ini memuat tahap audit aktif, file yang diperiksa, temuan sementara, status CI yang terverifikasi, serta langkah berikutnya. Perbarui dokumen posisi audit setelah setiap tahap bermakna agar percakapan baru tidak bergantung pada ingatan percakapan lama.
