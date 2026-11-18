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

    await page.locator("#inventoryRefreshCatalog").click();
    await page.locator("#inventoryMaterial").selectOption("MAT-PREVIEW");
    await page.locator("#inventoryJob").selectOption("JOB-PREVIEW");
    await page.locator("#w").fill("4");
    await page.locator("#h").fill("1");
    await page.locator("#mw").fill("220");
    await page.locator("#mh").fill("110");
    await page.locator("#ori").selectOption("1");

    // Tombol Hitung lama tetap menjalankan fungsi kalkulasi sebelumnya.
    await page.locator('button[onclick="calc()"]').click();
    await page.locator("#rsec:not(.hidden)").waitFor();

    // Pratinjau harus mengutamakan sisa inventaris lalu menghitung kekurangan dari lembar baru.
    await page.locator("#inventoryPreviewButton").click();
    await page.locator("#inventoryPreviewResult:not([hidden])").waitFor();
    const summary = await page.locator("#inventoryPreviewSummary").textContent();
    assert.match(summary, /Dari inventaris: 1 sisa/);
    assert.match(summary, /Lembar baru: 1/);
    await page.locator("#inventoryPreviewSources").getByText(/REM-PREVIEW/).waitFor();
    await page.locator("#inventoryPreviewSources").getByText(/Lembar baru/).waitFor();

    const status = await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      const remainder = await storage.get("remainders", "REM-PREVIEW");
      await storage.close();
      return remainder.status;
    });
    assert.equal(status, "available", "Pratinjau tidak boleh mengubah status stok.");
    assert.deepEqual(errors, []);
    console.log("LULUS: panel pratinjau menggabungkan sisa inventaris dan lembar baru tanpa mengubah stok; tombol Hitung lama tetap bekerja.");
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
