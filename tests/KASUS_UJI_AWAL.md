# Kasus Uji Awal — Kalkulator Material Lembaran

Status: disiapkan untuk pengujian baseline sebelum refaktor mesin hitung.

Semua ukuran bidang dalam cm kecuali disebutkan lain. Toleransi hasil numerik: 0,01 cm² atau Rp1, kecuali hasil jumlah lembar/kemasan harus tepat.

## A. Uji acuan potongan berulang

| ID | Bidang | Material | Orientasi | Mode | Hasil acuan |
|---|---|---|---|---|---|
| A01 | 600 × 100 | 600 × 20 | Portrait (600 cm vertikal) | Presisi | 30 potong 20 × 100 cm; 6 potong per lembar sumber; 5 lembar sumber |
| A02 | 600 × 100 | 600 × 20 | Portrait | Ekonomis | Tidak boleh membutuhkan lebih dari A01 untuk susunan potong lurus yang sama |
| A03 | 600 × 100 | 600 × 20 | Landscape | Presisi | Hasil harus dihitung ulang dari orientasi aktual; tidak boleh memakai hasil A01 |
| A04 | 600 × 100 | 600 × 20 | Portrait | Presisi | Ubah pola dari Stack Bond; sistem tidak boleh diam-diam memakai aturan Stack Bond |

## B. Uji pembelian kemasan

Asumsi harga satu kemasan Rp700.000 berisi 10 lembar, ukuran satu lembar 240 × 120 cm.

| ID | Kebutuhan lembar | Kemasan dibeli | Lembar dibeli | Sisa lembar utuh | Uang pembelian |
|---|---:|---:|---:|---:|---:|
| B01 | 5 | 1 | 10 | 5 | Rp700.000 |
| B02 | 10 | 1 | 10 | 0 | Rp700.000 |
| B03 | 11 | 2 | 20 | 9 | Rp1.400.000 |
| B04 | 1 | 1 | 10 | 9 | Rp700.000 |

Rumus harga material per m²: Rp700.000 ÷ (10 × 2,88 m²) = Rp24.305,56/m².

Untuk B01, biaya pembelian per m² bidang 6 m² adalah Rp700.000 ÷ 6 = Rp116.666,67/m². Angka ini berbeda dari harga material per m² dan tidak boleh disamakan.

## C. Uji geometri dan validasi

| ID | Kondisi | Hasil yang diharapkan |
|---|---|---|
| C01 | Bidang tepat sama dengan satu lembar | 1 lembar, tidak ada potongan tepi |
| C02 | Bidang lebih kecil dari satu lembar | 1 lembar sumber; sisa harus dicatat, bukan otomatis disebut limbah |
| C03 | Ukuran bidang nol/kosong/negatif | Ditolak dengan pesan validasi |
| C04 | Ukuran material nol/kosong/negatif | Ditolak dengan pesan validasi |
| C05 | Jarak nat negatif | Ditolak |
| C06 | Jarak nat nol | Diterima |
| C07 | Pilih arah geser Vertikal untuk pola selain Stack Bond | Harus menghasilkan susunan valid atau dinonaktifkan; tidak boleh menghasilkan grid kosong |
| C08 | Alignment kiri/tengah/kanan dan atas/tengah/bawah | Posisi potongan tepi harus sesuai pilihan alignment |

## D. Uji pemisahan laporan

| ID | Kondisi | Hasil yang diharapkan |
|---|---|---|
| D01 | Membeli 10 lembar, memakai 5 | 5 lembar utuh tampil sebagai persediaan, bukan limbah |
| D02 | Ada potongan sisa yang memenuhi ukuran kebutuhan berikutnya | Ditampilkan sebagai sisa potensial yang dapat digunakan |
| D03 | Ada potongan kecil yang tidak dapat digunakan | Baru dikategorikan sebagai limbah setelah aturan ukuran minimum ditentukan |
| D04 | Luas lembar total lebih besar dari luas bidang | Selisih luas tidak otomatis dilabeli limbah |

## E. Kriteria penerimaan

1. Semua kasus menghasilkan angka jumlah lembar dan kemasan yang benar.
2. Tidak ada pilihan pola/arah yang menghasilkan hasil kosong tanpa penjelasan.
3. Sisa persediaan dan limbah dilaporkan terpisah.
4. Uang pembelian dibedakan dari harga material per m².
5. Perubahan algoritma disertai hasil uji sebelum dan sesudah.
