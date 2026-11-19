const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const PORT = 4181;
const NOW = "2026-11-18T14:30:00.000Z";

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
async function addInventoryScripts(page) {
  await page.addScriptTag({ path: path.join(ROOT, "assets/js/inventory-storage.js") });
  await page.addScriptTag({ path: path.join(ROOT, "assets/js/inventory-engine.js") });
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

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "km-plan-recovery-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, args: ["--no-sandbox"]
    });
    let page = context.pages()[0] || await context.newPage();
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await addInventoryScripts(page);

    const planId = await page.evaluate(async () => {
      const now = "2026-11-18T14:30:00.000Z";
      const storage = MaterialInventoryStorage.createStorage({ allowUnsafeInventoryWrites: true });
      await storage.open();
      await storage.add("remainders", {
        id: "BROWSER-RECOVERY-REM", materialId: "MAT-BROWSER",
        widthCm: 40, heightCm: 30, thicknessMm: 8,
        grainDirection: "none", motif: "plain", rotationAllowed: true,
        condition: "good", status: "available", originJobId: "JOB-OLD",
        sourceSheetId: "SHEET-BROWSER", createdAt: now, updatedAt: now, version: 1
      });
      const engine = MaterialInventoryEngine.createInventoryEngine({ storage });
      const reserved = await engine.reservePlan({
        plan: {
          inventoryUsage: [{ remainderId: "BROWSER-RECOVERY-REM", placedCount: 1 }],
          usableRemainders: [], sheets: []
        },
        jobId: "JOB-BROWSER-RECOVERY",
        material: { id: "MAT-BROWSER", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
        timestamp: now
      });
      await storage.close();
      return reserved.planId;
    });

    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true, args: ["--no-sandbox"]
    });
    page = context.pages()[0] || await context.newPage();
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await addInventoryScripts(page);

    const recovered = await page.evaluate(async id => {
      const storage = MaterialInventoryStorage.createStorage();
      await storage.open();
      const engine = MaterialInventoryEngine.createInventoryEngine({ storage });
      const plan = await engine.restorePlan(id);
      const reservationCount = plan.reservations.length;
      await engine.cancelPlan({ reservedPlan: plan });
      const saved = await storage.get("plans", id);
      const remainder = await storage.get("remainders", "BROWSER-RECOVERY-REM");
      await storage.close();
      return { reservationCount, planStatus: saved.status, remainderStatus: remainder.status };
    }, planId);

    assert.deepEqual(recovered, {
      reservationCount: 1,
      planStatus: "cancelled",
      remainderStatus: "available"
    });
    console.log("LULUS: snapshot dan reservasi tetap dapat dipulihkan setelah Chromium benar-benar ditutup dan dibuka kembali.");
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
