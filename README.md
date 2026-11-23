# Kalkulator Material Bangunan

Aplikasi kalkulator kebutuhan material penutup bidang (dinding, lantai, plafon).

## Menjalankan aplikasi
1. Buka folder repositori ini di Visual Studio Code.
2. Buka `index.html`.
3. Klik kanan, lalu pilih **Open with Live Server**.

Aplikasi utama dibuat dengan HTML, CSS, dan JavaScript tanpa framework tambahan. Perhitungan berjalan di browser dan dapat digunakan secara offline setelah file tersedia di komputer.

## Struktur proyek
- `index.html` — aplikasi aktif untuk pengembangan.
- `backup/kalkulator_material_perbaikan.html` — salinan awal sebelum pengembangan lanjutan.
- `docs/` — dokumentasi perencanaan, rumus, audit, dan pengujian.
- `tests/` — pengujian mesin geometri, pemotongan, inventaris, dan browser.

## Status
Mesin geometri, pemotongan, planner inventaris, reservasi, pembatalan, penyelesaian, dan pemulihan snapshot sudah terintegrasi pada branch `pengembangan-mesin-hitung`. Pengujian otomatis dijalankan melalui GitHub Actions. Algoritma pemotongan tetap bersifat heuristik (pendekatan praktis, bukan jaminan solusi paling optimal). Lihat folder `docs/` untuk rumus, batasan, dan panduan alur.
