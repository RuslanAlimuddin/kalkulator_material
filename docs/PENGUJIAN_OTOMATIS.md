# Pengujian otomatis

Branch `pengembangan-mesin-hitung` menjalankan pengujian otomatis melalui GitHub Actions.

Workflow:
- `test.yml`: menjalankan `npm run test:inventory` dan `npm run test:regression`.
- `inventory-batch.yml`: menjalankan tes khusus reservasi massal inventaris.

Tes reservasi massal memeriksa:
1. Semua unit stok berhasil direservasi dalam satu transaksi.
2. Jika satu unit tidak tersedia atau kondisinya rusak, seluruh reservasi dibatalkan.
3. ID inventaris kosong atau duplikat ditolak.

Tes memakai `fake-indexeddb` untuk mensimulasikan IndexedDB di lingkungan Node.js. Pengujian ini bukan pengganti pemeriksaan persistensi IndexedDB pada browser sebenarnya.
