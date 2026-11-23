const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const PORT = 4181;
function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function main() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, "." + pathname);
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      return res.writeHead(403).end("Forbidden");
    }
    fs.readFile(file, (error, data) => {
      if (error) return res.writeHead(404).end("Not found");
      res.writeHead(200, { "content-type": contentType(file) }).end(data);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "km-inventory-preview-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, args: ["--no-sandbox"]
    });
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));

    await page.goto("http://127.0.0.1:" + PORT + "/index.html");
    await page.locator("#inventoryPreviewButton").waitFor();
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      await storage.add("materials", {
        id: "MAT-PREVIEW", name: "Triplek Pratinjau", category: "triplek",
        thicknessMm: 12, surface: null, grainRequired: false,
        motif: "plain", rotationPolicy: "free", active: true
      });
      await storage.add("jobs", {
        id: "JOB-PREVIEW", name: "Pekerjaan Pratinjau", status: "open",
        createdAt: "2026-11-18T12:00:00.000Z", closedAt: null
      });
      await storage.createRemainder({
        id: "REM-PREVIEW", materialId: "MAT-PREVIEW",
        originJobId: "JOB-PREVIEW", sourceSheetId: "JOB-PREVIEW-SHEET-01",
        widthCm: 220, heightCm: 110, thicknessMm: 12,
        grainDirection: "none", motif: "plain", rotationAllowed: true,
        condition: "good", createdAt: "2026-11-18T12:00:00.000Z"
      });
      await storage.close();
    });

    async function chooseInputs() {
      await page.locator("#inventoryRefreshCatalog").click();
      await page.locator("#inventoryMaterial").selectOption("MAT-PREVIEW");
      await page.locator("#inventoryJob").selectOption("JOB-PREVIEW");
      await page.locator("#w").fill("4");
      await page.locator("#h").fill("1");
      await page.locator("#mw").fill("220");
      await page.locator("#mh").fill("110");
      await page.locator("#ori").selectOption("1");
    }
    async function readStatus() {
      return page.evaluate(async () => {
        const storage = MaterialInventoryStorage.createStorage({
          validator: MaterialInventoryValidator
        });
        const remainder = await storage.get("remainders", "REM-PREVIEW");
        await storage.close();
        return remainder.status;
      });
    }

    await chooseInputs();

    // Tombol Hitung lama tetap menjalankan fungsi kalkulasi sebelumnya.
    await page.locator('button[onclick="calc()"]').click();
    await page.locator("#rsec:not(.hidden)").waitFor();

    // Integrasi mesin harga harus menerjemahkan hasil ke properti yang dibaca UI.
    await page.locator("#harga").fill("100000");
    await page.locator("#hargaPer").selectOption("satuan");
    await page.locator('button[onclick="calc()"]').click();
    await page.locator("#hargaTotalBox").waitFor({ state: "visible" });
    assert.match(await page.locator("#hargaTotalBox .ht-label").textContent(), /Nilai kebutuhan material \(tanpa inventaris\)/);
    assert.match(await page.locator("#hargaTotalDetail").textContent(), /tanpa mengurangi sisa inventaris/);
    assert.match(await page.locator("#hargaTotalVal").textContent(), /Rp\s*200\.000/);
    assert.match(await page.locator("#hargaTotalDetail").textContent(), /Kebutuhan: 2 lembar/);

    // Pembelian kemasan memakai pembulatan jumlah kemasan dan menampilkan lembar sisa.
    await page.locator("#hargaPer").selectOption("kemasan");
    await page.locator("#harga").fill("300000");
    await page.locator("#isiKemasan").fill("4");
    await page.locator('button[onclick="calc()"]').click();
    assert.match(await page.locator("#hargaTotalVal").textContent(), /Rp\s*300\.000/);
    assert.match(await page.locator("#hargaTotalDetail").textContent(), /Isi yang dibeli: 4 lembar/);
    assert.match(await page.locator("#hargaTotalDetail").textContent(), /Sisa lembar utuh: 2 lembar/);

    // Pratinjau menggabungkan sisa inventaris dan lembar baru tanpa mutasi stok.
    await page.locator("#hargaPer").selectOption("satuan");
    await page.locator("#harga").fill("100000");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    const summary = await page.locator("#inventoryPreviewSummary").textContent();
    assert.match(summary, /Dari inventaris: 1 sisa/);
    assert.match(summary, /Lembar baru: 1/);
    await page.locator("#inventoryPreviewSources").getByText(/REM-PREVIEW/).waitFor();
    await page.locator("#inventoryPreviewSources").getByText(/Lembar baru/).waitFor();
    const previewPricing = await page.locator("#inventoryPreviewPricing").textContent();
    assert.match(previewPricing, /Nilai kebutuhan material \(tanpa inventaris\)/);
    assert.match(previewPricing, /Rp\s*200\.000/);
    assert.match(previewPricing, /Estimasi pembelian baru \(setelah inventaris\)/);
    assert.match(previewPricing, /Rp\s*100\.000/);
    assert.match(previewPricing, /Harga material: Rp\s*41\.322(?:,\d+)? per m²/);
    assert.match(previewPricing, /Estimasi biaya per m² bidang: Rp\s*50\.000/);
    assert.match(previewPricing, /Estimasi biaya per m² bidang: Rp\s*25\.000/);
    await page.locator("#harga").fill("");
    assert.match(await page.locator("#inventoryPreviewPricing").textContent(), /Masukkan harga material/);
    await page.locator("#harga").fill("0");
    assert.match(await page.locator("#inventoryPreviewPricing").textContent(), /Masukkan harga lebih dari nol/);
    await page.locator("#harga").fill("100000");
    await page.locator("#harga").fill("200000");
    const updatedPricing = await page.locator("#inventoryPreviewPricing").textContent();
    assert.match(updatedPricing, /Rp\s*400\.000/);
    assert.match(updatedPricing, /Rp\s*200\.000/);
    await page.locator("#harga").fill("100000");
    assert.equal(await readStatus(), "available", "Pratinjau tidak boleh mengubah status stok.");

    // Perubahan pola, posisi pemasangan, mode, atau ukuran membatalkan pratinjau lama.
    await page.locator("#patternCards button").filter({ hasText: "Running Bond" }).click();
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#alignPicker .align-dot").first().click();
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#btnEkonomis").click();
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#w").fill("4.5");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#w").fill("4");

    // Kembalikan pengaturan ke keadaan awal untuk melanjutkan alur reservasi.
    await page.locator("#patternCards button").filter({ hasText: "Stack Bond" }).click();
    await page.locator("#btnPresisi").click();
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();

    // Perubahan pilihan material, pekerjaan, dan arah serat membatalkan snapshot lama.
    await page.locator("#inventoryMaterial").selectOption("");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#inventoryConfirmButton").isVisible(), false);
    await page.locator("#inventoryMaterial").selectOption("MAT-PREVIEW");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#inventoryJob").selectOption("");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#inventoryJob").selectOption("JOB-PREVIEW");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#inventoryGrainDirection").selectOption("horizontal");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#inventoryGrainDirection").selectOption("none");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();

    // Perubahan seluruh input geometri tambahan juga membatalkan snapshot lama.
    await page.locator("#ori").selectOption("0");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#ori").selectOption("1");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#gap").fill("0.1");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#gap").fill("0");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#minSisaW").fill("1");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#minSisaW").fill("0");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#minSisaH").fill("1");
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    await page.locator("#minSisaH").fill("0");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();

    // Refresh katalog membatalkan pratinjau jika material dinonaktifkan atau pekerjaan ditutup.
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({ validator: MaterialInventoryValidator });
      await storage.update("materials", "MAT-PREVIEW", { active: false });
      await storage.close();
    });
    await page.locator("#inventoryRefreshCatalog").click();
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#inventoryConfirmButton").isVisible(), false);
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({ validator: MaterialInventoryValidator });
      await storage.update("materials", "MAT-PREVIEW", { active: true });
      await storage.close();
    });
    await page.locator("#inventoryRefreshCatalog").click();
    await page.locator("#inventoryMaterial").selectOption("MAT-PREVIEW");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();

    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({ validator: MaterialInventoryValidator });
      await storage.update("jobs", "JOB-PREVIEW", {
        status: "completed", closedAt: "2026-11-23T08:00:00.000Z"
      });
      await storage.close();
    });
    await page.locator("#inventoryRefreshCatalog").click();
    await page.locator("#inventoryPreviewResult").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#inventoryConfirmButton").isVisible(), false);
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({ validator: MaterialInventoryValidator });
      await storage.update("jobs", "JOB-PREVIEW", { status: "open", closedAt: null });
      await storage.close();
    });
    await page.locator("#inventoryRefreshCatalog").click();
    await page.locator("#inventoryJob").selectOption("JOB-PREVIEW");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();

    // Persetujuan mengunci sumber yang sama persis dengan hasil pratinjau.
    await page.locator("#inventoryConfirmButton").click();
    await page.locator('#inventoryActivePlans [data-plan-id]').waitFor();
    assert.equal(await readStatus(), "reserved");
    const savedPlanId = await page.locator("#inventoryActivePlans [data-plan-id]").getAttribute("data-plan-id");
    assert.ok(savedPlanId);
    assert.match(await page.locator("#inventoryActivePlans").textContent(), /JOB-PREVIEW/);

    // Pemulihan setelah reload harus menampilkan reservasi yang masih aktif.
    await page.reload();
    const recoveredCard = page.locator('#inventoryActivePlans [data-plan-id="' + savedPlanId + '"]');
    await recoveredCard.waitFor();
    assert.match(await recoveredCard.textContent(), /Selesaikan pemotongan/);
    assert.equal(await readStatus(), "reserved");

    // Pembatalan mengembalikan seluruh sumber inventaris menjadi tersedia.
    page.once("dialog", dialog => dialog.accept());
    await recoveredCard.locator('button[data-action="cancel"]').click();
    await page.waitForFunction(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      const remainder = await storage.get("remainders", "REM-PREVIEW");
      await storage.close();
      return remainder.status === "available";
    });
    assert.equal(await readStatus(), "available");

    // Uji persetujuan dan penyelesaian kedua: sumber lama dikonsumsi dan sisa baru dicatat.
    await chooseInputs();
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    await page.locator("#inventoryConfirmButton").click();
    const completionCard = page.locator('#inventoryActivePlans [data-plan-id]').first();
    await completionCard.waitFor();
    page.once("dialog", dialog => dialog.accept());
    await completionCard.locator('button[data-action="complete"]').click();

    await page.waitForFunction(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      const remainder = await storage.get("remainders", "REM-PREVIEW");
      const created = await storage.getAll("remainders");
      await storage.close();
      return remainder.status === "consumed" && created.length > 1;
    });
    const finalState = await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      const remainder = await storage.get("remainders", "REM-PREVIEW");
      const created = await storage.getAll("remainders");
      const plans = await storage.getAll("plans");
      const reservations = await storage.getAll("reservations");
      await storage.close();
      return {
        sourceStatus: remainder.status,
        childRemainders: created.filter(item => item.id !== "REM-PREVIEW"),
        completedPlans: plans.filter(item => item.status === "completed"),
        consumedReservations: reservations.filter(item => item.status === "consumed")
      };
    });
    assert.equal(finalState.sourceStatus, "consumed");
    assert.ok(finalState.childRemainders.length >= 1);
    assert.ok(finalState.completedPlans.length >= 1);
    assert.ok(finalState.consumedReservations.length >= 1);

    // Uji ambang kemasan: kebutuhan bruto 5 lembar, inventaris memenuhi 2,
    // sehingga pembelian baru 3 lembar. Isi kemasan 4 menghasilkan 2 vs 1 pack.
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      for (let i = 1; i <= 2; i += 1) {
        await storage.createRemainder({
          id: "REM-PACK-" + i,
          materialId: "MAT-PREVIEW",
          originJobId: "JOB-PREVIEW",
          sourceSheetId: "JOB-PREVIEW-PACK-SHEET-" + i,
          widthCm: 220, heightCm: 110, thicknessMm: 12,
          grainDirection: "none", motif: "plain", rotationAllowed: true,
          condition: "good", createdAt: "2026-11-18T12:00:00.000Z"
        });
      }
      await storage.close();
    });
    await chooseInputs();
    await page.locator("#w").fill("11");
    await page.locator("#hargaPer").selectOption("kemasan");
    await page.locator("#harga").fill("400000");
    await page.locator("#isiKemasan").fill("4");
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    const packageRows = page.locator("#inventoryPreviewPricing .inventory-price-row");
    assert.match(await page.locator("#inventoryPreviewSummary").textContent(), /Lembar baru: 3/);
    assert.match(await packageRows.nth(0).textContent(), /Rp\s*800\.000/);
    assert.match(await packageRows.nth(0).textContent(), /2 kemasan/);
    assert.match(await packageRows.nth(1).textContent(), /Rp\s*400\.000/);
    assert.match(await packageRows.nth(1).textContent(), /1 kemasan/);
    assert.match(await packageRows.nth(1).textContent(), /sisa utuh 1 lembar/);
    assert.match(await packageRows.nth(0).textContent(), /Harga material: Rp\s*41\.322(?:,\d+)? per m²/);
    assert.match(await packageRows.nth(0).textContent(), /Estimasi biaya per m² bidang: Rp\s*72\.727/);
    assert.match(await packageRows.nth(1).textContent(), /Estimasi biaya per m² bidang: Rp\s*36\.363(?:,\d+)?/);

    // Perubahan isi kemasan saat pratinjau terbuka memperbarui kedua estimasi.
    await page.locator("#isiKemasan").fill("2");
    const resizedPackages = page.locator("#inventoryPreviewPricing .inventory-price-row");
    assert.match(await resizedPackages.nth(0).textContent(), /Rp\s*1\.200\.000/);
    assert.match(await resizedPackages.nth(1).textContent(), /Rp\s*800\.000/);
    await page.locator("#isiKemasan").fill("4");
    const restoredPackages = page.locator("#inventoryPreviewPricing .inventory-price-row");
    assert.match(await restoredPackages.nth(0).textContent(), /Rp\s*800\.000/);
    assert.match(await restoredPackages.nth(1).textContent(), /Rp\s*400\.000/);

    // Isi kemasan tidak valid hanya menonaktifkan estimasi; pratinjau tetap tampil.
    await page.locator("#isiKemasan").fill("0");
    assert.match(await page.locator("#inventoryPreviewPricing").textContent(), /Isi kemasan harus bilangan bulat/);
    await page.locator("#isiKemasan").fill("4");
    await page.locator("#harga").fill("-1000");
    assert.match(await page.locator("#inventoryPreviewPricing").textContent(), /Harga tidak boleh negatif/);
    await page.locator("#harga").fill("400000");

    // Uji seluruh kebutuhan tertutup inventaris: pembelian baru harus Rp0.
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      for (let i = 3; i <= 5; i += 1) {
        await storage.createRemainder({
          id: "REM-PACK-" + i,
          materialId: "MAT-PREVIEW",
          originJobId: "JOB-PREVIEW",
          sourceSheetId: "JOB-PREVIEW-PACK-SHEET-" + i,
          widthCm: 220, heightCm: 110, thicknessMm: 12,
          grainDirection: "none", motif: "plain", rotationAllowed: true,
          condition: "good", createdAt: "2026-11-18T12:00:00.000Z"
        });
      }
      await storage.close();
    });
    await page.locator("#inventoryRefreshCatalog").click();
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    assert.match(await page.locator("#inventoryPreviewSummary").textContent(), /Lembar baru: 0/);
    const fullyCoveredRows = page.locator("#inventoryPreviewPricing .inventory-price-row");
    assert.match(await fullyCoveredRows.nth(0).textContent(), /Rp\s*800\.000/);
    assert.match(await fullyCoveredRows.nth(1).textContent(), /Rp\s*0/);
    assert.match(await fullyCoveredRows.nth(1).textContent(), /Harga material: Rp\s*41\.322(?:,\d+)? per m²/);
    assert.match(await fullyCoveredRows.nth(1).textContent(), /Estimasi biaya per m² bidang: Rp\s*0/);

    // Temuan referensi yang sebelumnya hanya ada di laporan audit storage
    // wajib memunculkan peringatan pada antarmuka utama.
    await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator,
        allowUnsafeInventoryWrites: true
      });
      await storage.add("remainders", {
        id: "REM-AUDIT-UI-ORPHAN",
        materialId: "MAT-AUDIT-UI-MISSING",
        originJobId: "JOB-AUDIT-UI-MISSING"
      });
      await storage.add("plans", {
        id: "PLAN-AUDIT-UI-STALE-MATERIAL",
        jobId: "JOB-PREVIEW",
        material: {
          id: "MAT-PREVIEW", thicknessMm: 99, motif: "plain",
          rotationPolicy: "free", grainRequired: false, active: true
        },
        plan: { inventoryUsage: [] },
        reservationIds: [],
        status: "reserved",
        legacy: false
      });
      // Rencana yang merujuk pekerjaan hilang muncul di plansWithoutJob dan
      // inconsistentPlans, tetapi harus dihitung sekali pada pemberitahuan UI.
      await storage.add("plans", {
        id: "PLAN-AUDIT-UI-MISSING-JOB",
        jobId: "JOB-AUDIT-UI-MISSING",
        material: null,
        plan: { inventoryUsage: [] },
        reservationIds: [],
        status: "reserved",
        legacy: false
      });
      await storage.close();
    });
    await page.reload();
    const recoveryNotice = page.locator("#inventoryRecoveryNotice");
    await recoveryNotice.waitFor({ state: "visible" });
    assert.match(await recoveryNotice.textContent(), /3 ketidaksesuaian/);
    assert.match(await recoveryNotice.textContent(), /snapshot rencana tidak cocok dengan katalog/);
    const stalePlanCard = page.locator('[data-plan-id="PLAN-AUDIT-UI-STALE-MATERIAL"]');
    await stalePlanCard.waitFor();
    assert.match(await stalePlanCard.textContent(), /Pemulihan diblokir/);
    assert.match(await stalePlanCard.textContent(), /Spesifikasi material snapshot/);

    assert.deepEqual(errors, []);
    console.log("LULUS: pratinjau tidak mengubah stok; persetujuan mengunci sumber; reservasi pulih setelah reload; pembatalan melepas stok; penyelesaian mengonsumsi sumber dan mencatat sisa baru; tombol Hitung lama tetap bekerja; seluruh temuan referensi audit ditampilkan.");
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error("GAGAL:", error);
  process.exitCode = 1;
});
