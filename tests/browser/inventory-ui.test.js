const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "../..");
const PORT = 4180;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
async function main() {
  const server = http.createServer((req,res) => {
    const pathname = decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
    const file = path.resolve(ROOT,"."+pathname);
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return res.writeHead(403).end("Forbidden");
    fs.readFile(file,(error,data) => {
      if (error) return res.writeHead(404).end("Not found");
      res.writeHead(200,{"content-type":contentType(file)}).end(data);
    });
  });
  await new Promise((resolve,reject) => { server.once("error",reject); server.listen(PORT,"127.0.0.1",resolve); });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),"km-inventory-ui-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile,{headless:true,args:["--no-sandbox"]});
    const page = context.pages()[0] || await context.newPage();
    const errors = [];
    page.on("pageerror",error => errors.push(error.message));
    await page.goto("http://127.0.0.1:"+PORT+"/inventaris.html");
    await page.waitForFunction(() =>
      document.querySelectorAll("#remainderMaterial option").length > 0
    );
    await page.locator("[data-tab=materials]").click();
    await page.locator("#materialName").fill("Triplek Browser");
    await page.locator("#materialCategory").fill("triplek");
    await page.locator("#materialThickness").fill("12");
    await page.locator("#materialForm").evaluate(form => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByText("Material berhasil ditambahkan.").waitFor();

    await page.locator("[data-tab=jobs]").click();
    await page.locator("#jobName").fill("Pekerjaan Browser");
    await page.locator("#jobForm").evaluate(form => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByText("Pekerjaan berhasil dicatat.").waitFor();

    await page.locator("[data-tab=stock]").click();
    await page.locator("#remainderMaterial").selectOption({index:1});
    await page.locator("#remainderJob").selectOption({index:1});
    await page.locator("#sourceSheet").fill("JOB-BROWSER-SHEET-01");
    await page.locator("#remainderWidth").fill("80");
    await page.locator("#remainderHeight").fill("45");
    await page.locator("#remainderForm").evaluate(form => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await page.getByText(/Sisa berhasil dicatat/).waitFor();
    await page.locator("#stockTable").getByText("80 × 45 cm").waitFor();
    assert.equal(await page.locator("#countAvailable").textContent(),"1");

    await page.locator("#stockTable button[data-action=damaged]").click();
    await page.getByText("Kondisi stok berhasil diperbarui.").waitFor();
    await page.locator("#stockTable").getByText("Kondisi: damaged").waitFor();

    await page.reload();
    await page.locator("#stockTable").getByText("80 × 45 cm").waitFor();
    await page.locator("#stockTable").getByText("Kondisi: damaged").waitFor();
    await page.locator("[data-tab=history]").click();
    await page.locator("#movementTable").getByText("Sisa dicatat").waitFor();
    await page.locator("#movementTable").getByText("Kondisi diubah").waitFor();

    // Cadangan valid dengan peringatan harus tetap diimpor, tetapi peringatannya
    // wajib terlihat agar pengguna tidak mengira paket sepenuhnya bersih.
    const warningBundle = await page.evaluate(async () => {
      const backupStorage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      const bundle = await backupStorage.exportJSON();
      await backupStorage.close();
      bundle.jobs.jobs[0].status = "completed";
      bundle.jobs.jobs[0].closedAt = null;
      return JSON.stringify(bundle);
    });
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#importMode").selectOption("replace");
    await page.locator("#importFile").setInputFiles({
      name: "cadangan-dengan-peringatan.json",
      mimeType: "application/json",
      buffer: Buffer.from(warningBundle)
    });
    await page.waitForFunction(() =>
      document.querySelector("#notice").textContent.includes("Peringatan (")
    );
    assert.match(await page.locator("#notice").textContent(), /Peringatan \(/);

    assert.deepEqual(errors,[]);
    console.log("LULUS: UI inventaris dapat membuat material, pekerjaan, dan sisa; memperbarui kondisi; serta mempertahankan data dan riwayat setelah reload.");
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
main().catch(error => { console.error("GAGAL:",error); process.exitCode=1; });
