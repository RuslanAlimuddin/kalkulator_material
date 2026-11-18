## Mengunci sumber dari hasil perencanaan

Setelah `planner.calculate(input)` menghasilkan rencana, gunakan:

```js
const reservedPlan = await inventoryEngine.reservePlan({
  plan,
  jobId: "JOB-TUJUAN"
});
```

Hasilnya berisi:
- `plan`: rencana yang sama, tanpa perubahan.
- `reservations`: semua reservasi inventaris yang berhasil dibuat.
- `inventoryUsage`: daftar pemakaian inventaris dengan tambahan `reservationId` untuk setiap sumber.

Reservasi dilakukan sekaligus melalui `reserveRemainders()`. Bila salah satu stok sudah berubah status atau tidak layak, seluruh operasi ditolak. Dalam kondisi tersebut, baca ulang inventaris dan hitung ulang rencana; jangan lanjut memakai rencana yang gagal direservasi.
