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

    const planIds = await page.evaluate(async () => {
      const now = "2026-11-18T14:30:00.000Z";
      const storage = MaterialInventoryStorage.createStorage({ allowUnsafeInventoryWrites: true });
      await storage.open();
      await storage.add("jobs", {
        id: "JOB-BROWSER-RECOVERY", name: "Pekerjaan pemulihan browser",
        status: "open", createdAt: now, closedAt: null
      });
      await storage.add("materials", {
        id: "MAT-BROWSER", name: "Material pemulihan browser",
        thicknessMm: 8, motif: "plain", rotationPolicy: "free",
        grainRequired: false, active: true
      });
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
          usableRemainders: [],
          sheets: [{
            id: "INVENTORY-0-BROWSER-RECOVERY-REM",
            source: "inventory", remainderId: "BROWSER-RECOVERY-REM",
            width: 40, height: 30
          }]
        },
        jobId: "JOB-BROWSER-RECOVERY",
        material: { id: "MAT-BROWSER", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
        timestamp: now
      });
      await storage.add("remainders", {
        id: "BROWSER-COMPLETE-REM", materialId: "MAT-BROWSER",
        widthCm: 36, heightCm: 28, thicknessMm: 8,
        grainDirection: "none", motif: "plain", rotationAllowed: true,
        condition: "good", status: "available", originJobId: "JOB-OLD",
        sourceSheetId: "SHEET-BROWSER-2", createdAt: now, updatedAt: now, version: 1
      });
      const reservedForCompletion = await engine.reservePlan({
        plan: {
          inventoryUsage: [{ remainderId: "BROWSER-COMPLETE-REM", placedCount: 1 }],
          usableRemainders: [],
          sheets: [{
            id: "INVENTORY-0-BROWSER-COMPLETE-REM",
            source: "inventory", remainderId: "BROWSER-COMPLETE-REM",
            width: 36, height: 28
          }]
        },
        jobId: "JOB-BROWSER-RECOVERY",
        material: { id: "MAT-BROWSER", thicknessMm: 8, motif: "plain", rotationPolicy: "free" },
        timestamp: now
      });
      await storage.close();
      return { cancelPlanId: reserved.planId, completePlanId: reservedForCompletion.planId };
    });

    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true, args: ["--no-sandbox"]
    });
    page = context.pages()[0] || await context.newPage();
    await page.goto("http://127.0.0.1:" + PORT + "/");
    await addInventoryScripts(page);

    const recovered = await page.evaluate(async ids => {
      const storage = MaterialInventoryStorage.createStorage();
      await storage.open();
      const engine = MaterialInventoryEngine.createInventoryEngine({ storage });

      const cancelPlan = await engine.restorePlan(ids.cancelPlanId);
      const cancelReservationCount = cancelPlan.reservations.length;
      await engine.cancelPlan({ reservedPlan: cancelPlan });
      const cancelled = await storage.get("plans", ids.cancelPlanId);
      const releasedSource = await storage.get("remainders", "BROWSER-RECOVERY-REM");

      const completePlan = await engine.restorePlan(ids.completePlanId);
      const completeReservationCount = completePlan.reservations.length;
      await engine.consumePlan({
        reservedPlan: completePlan,
        sourceSheetIdPrefix: "BROWSER-RECOVERED-COMPLETE",
        timestamp: "2026-11-18T14:31:00.000Z"
      });
      const completed = await storage.get("plans", ids.completePlanId);
      const consumedSource = await storage.get("remainders", "BROWSER-COMPLETE-REM");
      await storage.close();
      return {
        cancelReservationCount, cancelPlanStatus: cancelled.status,
        releasedSourceStatus: releasedSource.status,
        completeReservationCount, completePlanStatus: completed.status,
        consumedSourceStatus: consumedSource.status
      };
    }, planIds);

    assert.deepEqual(recovered, {
      cancelReservationCount: 1,
      cancelPlanStatus: "cancelled",
      releasedSourceStatus: "available",
      completeReservationCount: 1,
      completePlanStatus: "completed",
      consumedSourceStatus: "consumed"
    });
    console.log("LULUS: snapshot dan reservasi dapat dipulihkan setelah Chromium ditutup; pembatalan dan penyelesaian keduanya berhasil.");
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
