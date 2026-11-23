# Pengendali Workflow Inventaris

File: `assets/js/inventory-workflow.js`

Modul ini mengatur urutan proses inventaris. Ia tidak melakukan geometri pemotongan sendiri dan tidak mengubah `engine.js`, `cutting-engine.js`, atau `cutting-adapter.js`.

## Pembuatan

```js
const workflow = MaterialInventoryWorkflow.createInventoryWorkflow({
  storage: inventoryStorage,
  planner: inventoryPlanner,
  inventoryEngine
});
```

## Hitung dan reservasi

```js
const reservedPlan = await workflow.calculateAndReserve({
  jobId: "JOB-2026-0002",
  plannerInput: {
    geometry,
    material,
    newSheet: { widthCm: 120, heightCm: 240 },
    mode: "ekonomis",
    allowRotation: false
  },
  maxReservationAttempts: 2
});
```

Workflow membaca stok berstatus `available` dan kondisi `good`, menghitung rencana, lalu mengunci semua sumber inventaris dalam satu transaksi. Jika stok berubah sebelum reservasi, workflow membaca ulang inventaris dan menghitung ulang rencana. Hasil rencana yang gagal direservasi tidak digunakan kembali.

Nilai `maxReservationAttempts` boleh 1 sampai 5; default 2. Nilai ini membatasi percobaan ulang jika ada konflik stok.

## Pembatalan

```js
await workflow.cancel(reservedPlan);
```

Semua reservasi dari rencana dilepas dalam satu transaksi. Jika salah satu reservasi tidak lagi aktif, seluruh pelepasan dibatalkan.

## Penyelesaian pemakaian inventaris

```js
await workflow.complete(reservedPlan, {
  sourceSheetIdPrefix: "JOB-2026-0002-SHEET"
});
```

Penyelesaian ini mengonsumsi seluruh sumber inventaris yang sudah dipesan, mencatat sisa dari lembar inventaris, dan mencatat sisa layak dari lembar baru fallback. Semua perubahan dilakukan melalui satu transaksi konsumsi multi-sumber agar stok, reservasi, rencana, dan riwayat tetap konsisten.

## Batas penting

- `calculateAndReserve()` mengubah status stok hanya setelah planner menghasilkan rencana dan reservasi berhasil.
- Planner tetap dapat digunakan sendiri untuk simulasi tanpa mengubah inventaris.
- Workflow sudah terhubung ke panel pratinjau pada `index.html` melalui `inventory-preview-ui.js` dan `inventory-app-bridge.js`.
- Panel mendukung pratinjau tanpa mutasi stok, persetujuan/reservasi, pemulihan setelah reload, pembatalan, dan penyelesaian pemotongan.
- Pengujian Chromium untuk alur tersebut tersedia pada `tests/browser/inventory-preview.test.js` dan dijalankan oleh workflow `browser-indexeddb.yml`.
