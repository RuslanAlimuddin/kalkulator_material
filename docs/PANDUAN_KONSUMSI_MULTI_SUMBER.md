## Penyelesaian pemakaian rencana multi-sumber

Setelah pemotongan fisik selesai, gunakan `inventoryEngine.consumePlan()` dengan hasil dari `reservePlan()`:

```js
const result = await inventoryEngine.consumePlan({
  reservedPlan,
  sourceSheetIdPrefix: "JOB-2026-0002-SHEET"
});
```

Fungsi ini:
- mengonsumsi seluruh reservasi inventaris dalam satu transaksi;
- hanya menyimpan sisa yang masuk daftar `usableRemainders`;
- menghubungkan sisa turunan ke pekerjaan dan lembar sumbernya;
- mencatat semua movement pemakaian dan pembentukan sisa.

Jika satu reservasi tidak lagi aktif atau satu sumber tidak lagi berstatus reserved, seluruh konsumsi dibatalkan. Tidak ada sumber yang boleh berubah menjadi consumed sendirian.
