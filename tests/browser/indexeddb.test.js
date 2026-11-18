const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const DB_NAME = "KalkulatorMaterialDB";
const PORT = 4179;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

async function main() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const file = path.resolve(ROOT, "." + pathname);
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": contentType(file) });
      res.end(data);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", resolve);
  });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "km-indexeddb-profile-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      args: ["--no-sandbox"]
    });
    let page = context.pages()[0] || await context.newPage();
    await page.goto("http://127.0.0.1:" + PORT + "/tests/browser/fixture.html");
    await page.addScriptTag({ url: "http://127.0.0.1:" + PORT + "/assets/js/inventory-storage.js" });

    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("KalkulatorMaterialDB");
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
      const storage = MaterialInventoryStorage.createStorage();
      await storage.open();
      await storage.add("remainders", {
        id: "BROWSER-PERSISTENCE-1",
        materialId: "MAT-BROWSER",
        widthCm: 31,
        heightCm: 19,
        thicknessMm: 8,
        grainDirection: "none",
        motif: "plain",
        rotationAllowed: true,
        condition: "good",
        status: "available",
        originJobId: "JOB-BROWSER",
        sourceSheetId: "SHEET-BROWSER-1",
        createdAt: "2026-11-18T00:00:00.000Z",
        updatedAt: "2026-11-18T00:00:00.000Z",
        version: 1
      });
      await storage.close();
    });
    console.log("LULUS: IndexedDB asli di browser berhasil menyimpan data.");

    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      args: ["--no-sandbox"]
    });
    page = context.pages()[0] || await context.newPage();
    await page.goto("http://127.0.0.1:" + PORT + "/tests/browser/fixture.html");
    await page.addScriptTag({ url: "http://127.0.0.1:" + PORT + "/assets/js/inventory-storage.js" });
    const saved = await page.evaluate(async () => {
      const storage = MaterialInventoryStorage.createStorage();
      await storage.open();
      const record = await storage.get("remainders", "BROWSER-PERSISTENCE-1");
      await storage.close();
      return record;
    });
    assert.ok(saved, "Record harus tetap ada setelah browser ditutup dan dibuka kembali.");
    assert.equal(saved.widthCm, 31);
    assert.equal(saved.heightCm, 19);
    assert.equal(saved.status, "available");
    assert.equal(saved.sourceSheetId, "SHEET-BROWSER-1");
    console.log("LULUS: data IndexedDB tetap tersimpan setelah browser ditutup dan dibuka kembali.");

    await page.evaluate(async dbName => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
      });
    }, DB_NAME);
    console.log("Semua pengujian persistensi IndexedDB browser selesai.");
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
