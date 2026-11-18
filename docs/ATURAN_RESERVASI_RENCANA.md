## Reservasi rencana inventaris

Setelah planner menghasilkan `inventoryUsage`, lapisan pengendali harus mengirim seluruh `remainderId` terpilih ke `storage.reserveRemainders({ remainderIds, jobId })`.

Reservasi massal memakai satu transaksi IndexedDB. Jangan memanggil `reserveRemainder()` berulang kali untuk satu rencana multi-sumber karena kegagalan di tengah rangkaian dapat meninggalkan reservasi parsial.

Jika reservasi massal gagal karena stok berubah atau tidak lagi tersedia, rencana lama harus dibuang, data inventaris dibaca ulang, lalu planner dijalankan kembali. Jangan memakai rencana lama setelah konflik reservasi.
