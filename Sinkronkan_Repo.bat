@echo off
setlocal EnableExtensions
title Sinkronisasi Kalkulator Material

REM ============================================================
REM Sinkronisasi aman PC dengan GitHub.
REM - Hanya branch pengembangan-mesin-hitung.
REM - Hanya fast-forward; tidak pernah reset/force/clean.
REM - Perubahan file yang sudah dilacak akan menghentikan proses.
REM - File lokal tak terlacak (mis. node_modules/package-lock.json)
REM   tidak dihapus. Jika menghalangi pembaruan, Git akan gagal aman.
REM ============================================================

cd /d "%~dp0"
if errorlevel 1 (
  echo [GAGAL] Tidak dapat membuka folder tool.
  goto selesai_gagal
)

echo.
echo ============================================================
echo       SINKRONISASI KALKULATOR MATERIAL
echo ============================================================
echo Folder : %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] Git tidak ditemukan. Instal Git for Windows terlebih dahulu.
  goto selesai_gagal
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [GAGAL] Folder ini bukan repository Git.
  goto selesai_gagal
)

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if not "%BRANCH%"=="pengembangan-mesin-hitung" (
  echo [DIHENTIKAN] Branch aktif: "%BRANCH%"
  echo Tool ini hanya boleh berjalan pada branch:
  echo pengembangan-mesin-hitung
  goto selesai_gagal
)

for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do set "REMOTE=%%R"
if not defined REMOTE (
  echo [GAGAL] Remote "origin" tidak ditemukan.
  goto selesai_gagal
)
echo %REMOTE% | findstr /i /c:"RuslanAlimuddin/kalkulator_material" >nul
if errorlevel 1 (
  echo [DIHENTIKAN] Remote origin bukan repository proyek yang diharapkan.
  echo Periksa alamat remote sebelum melanjutkan.
  goto selesai_gagal
)
echo Remote : %REMOTE%
echo Branch : %BRANCH%
echo.

REM Pastikan tidak ada perubahan pada file yang sudah dilacak.
git diff --quiet
if errorlevel 1 (
  echo [DIHENTIKAN] Ada perubahan lokal pada file yang dilacak.
  echo Tidak ada file yang diubah oleh tool ini.
  echo Simpan atau commit perubahan tersebut, lalu jalankan ulang.
  goto selesai_gagal
)

git diff --cached --quiet
if errorlevel 1 (
  echo [DIHENTIKAN] Ada perubahan yang sudah masuk staging.
  echo Tidak ada file yang diubah oleh tool ini.
  echo Commit atau keluarkan dari staging secara manual, lalu ulangi.
  goto selesai_gagal
)

echo [1/3] Menghubungi GitHub dan mengambil pembaruan...
git fetch origin pengembangan-mesin-hitung
if errorlevel 1 (
  echo [GAGAL] Fetch gagal. Periksa internet, autentikasi, dan remote.
  goto selesai_gagal
)

echo.
echo [2/3] Memeriksa apakah pembaruan aman...
git merge-base --is-ancestor HEAD FETCH_HEAD
if errorlevel 1 (
  echo [DIHENTIKAN] Riwayat lokal tidak dapat diperbarui dengan fast-forward.
  echo Kemungkinan PC memiliki commit sendiri atau riwayat bercabang.
  echo Tidak ada reset, force, atau penghapusan file yang dilakukan.
  echo Minta pemeriksaan sebelum melakukan tindakan lanjutan.
  goto selesai_gagal
)

echo.
echo [3/3] Menyiapkan file tool dan menyamakan file kerja dengan GitHub...

REM Jangan menghapus atau memindahkan file BAT yang sedang berjalan.
REM Jika file belum terlacak, hentikan dan minta pengguna mengganti namanya
REM setelah proses ini selesai. Ini mencegah CMD kehilangan file batch aktif.
git ls-files --error-unmatch Sinkronkan_Repo.bat >nul 2>nul
if errorlevel 1 (
  echo [TINDAKAN DIPERLUKAN] File tool ini belum tercatat di Git lokal.
  echo Setelah jendela ini selesai, ubah nama file:
  echo Sinkronkan_Repo.bat menjadi Sinkronkan_Repo_lama.bat
  echo Lalu jalankan file yang sudah berganti nama tersebut.
  echo Git akan mengambil file tool terbaru dari GitHub.
  goto selesai_gagal
)

git merge --ff-only FETCH_HEAD
if errorlevel 1 (
  echo [GAGAL] Git tidak dapat menyelesaikan fast-forward.
  echo File lokal tidak dibersihkan atau dipaksa ditimpa.
  goto selesai_gagal
)

echo.
echo ============================================================
echo [BERHASIL] Sinkronisasi selesai.
echo ============================================================
echo Branch dan commit lokal sekarang:
git branch --show-current
git log -1 --oneline
echo.
echo Catatan:
echo - Tool ini tidak menjalankan pengujian.
echo - Jalankan perintah npm test yang diberikan setelah ini.
echo - node_modules dan package-lock.json lokal tidak dihapus.
echo.
goto selesai

:selesai_gagal
echo.
echo [BELUM TERSINKRON] Jangan jalankan pengujian dahulu.
echo Kirimkan seluruh pesan di atas untuk diperiksa.
echo.

:selesai
pause
endlocal
