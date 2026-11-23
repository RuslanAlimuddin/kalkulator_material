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

    // Pratinjau menggabungkan sisa inventaris dan lembar baru tanpa mutasi stok.
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    const summary = await page.locator("#inventoryPreviewSummary").textContent();
    assert.match(summary, /Dari inventaris: 1 sisa/);
    assert.match(summary, /Lembar baru: 1/);
    await page.locator("#inventoryPreviewSources").getByText(/REM-PREVIEW/).waitFor();
    await page.locator("#inventoryPreviewSources").getByText(/Lembar baru/).waitFor();
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
      await storage.close();
    });
    await page.reload();
    const recoveryNotice = page.locator("#inventoryRecoveryNotice");
    await recoveryNotice.waitFor({ state: "visible" });
    assert.match(await recoveryNotice.textContent(), /2 ketidaksesuaian/);

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
