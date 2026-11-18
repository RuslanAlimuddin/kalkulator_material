/* UI pratinjau inventaris pada kalkulator utama.
 * Jalur ini terpisah dari calc() dan tidak mengubah stok.
 */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  let storage = null;
  let bridge = null;
  let materials = [];
  let jobs = [];
  let currentPreview = null;

  function message(text, error) {
    const node = $("inventoryPreviewNotice");
    node.textContent = text;
    node.className = error ? "inventory-preview-notice error" : "inventory-preview-notice";
    node.hidden = false;
  }

  function clearMessage() {
    $("inventoryPreviewNotice").hidden = true;
  }

  function clearPreview() {
    currentPreview = null;
    $("inventoryPreviewResult").hidden = true;
    $("inventoryPreviewSummary").textContent = "";
    $("inventoryPreviewSources").replaceChildren();
    $("inventoryPreviewParts").replaceChildren();
    $("inventoryPreviewLeftovers").replaceChildren();
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function renderCatalog() {
    const materialSelect = $("inventoryMaterial");
    const jobSelect = $("inventoryJob");
    materialSelect.replaceChildren();
    jobSelect.replaceChildren();
    addOption(materialSelect, "", "Pilih material dari katalog");
    addOption(jobSelect, "", "Pilih pekerjaan");

    materials.filter(item => item && item.active !== false).forEach(item => {
      addOption(materialSelect, item.id, item.name + " · " + item.thicknessMm + " mm");
    });
    jobs.filter(item => item && item.status === "open").forEach(item => {
      addOption(jobSelect, item.id, item.name);
    });

    $("inventoryCatalogHint").textContent =
      materials.filter(item => item && item.active !== false).length + " material aktif · " +
      jobs.filter(item => item && item.status === "open").length + " pekerjaan terbuka";
    $("inventoryPreviewButton").disabled = !materials.length || !jobs.length;
  }

  async function refreshCatalog() {
    const values = await Promise.all([
      storage.getAll("materials"),
      storage.getAll("jobs")
    ]);
    materials = values[0];
    jobs = values[1];
    renderCatalog();
    clearPreview();
    clearMessage();
  }

  function makeListItem(title, detail) {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = title;
    item.appendChild(strong);
    if (detail) {
      const small = document.createElement("div");
      small.textContent = detail;
      item.appendChild(small);
    }
    return item;
  }

  function renderPreview(preview) {
    const plan = preview.plan;
    const summary = [
      "Total sumber: " + plan.sheetCount + " lembar",
      "Dari inventaris: " + plan.inventorySheetCount + " sisa",
      "Lembar baru: " + plan.newSheetCount,
      "Potongan: " + plan.cells.length
    ];
    $("inventoryPreviewSummary").textContent = summary.join(" · ");

    const sources = $("inventoryPreviewSources");
    sources.replaceChildren();
    plan.sheets.forEach(sheet => {
      const label = sheet.source === "inventory" ? "Sisa inventaris " + sheet.remainderId : "Lembar baru #" + sheet.id;
      sources.appendChild(makeListItem(
        label,
        sheet.width + " × " + sheet.height + " cm · " +
        (sheet.placements || []).length + " potongan"
      ));
    });
    if (!plan.sheets.length) sources.appendChild(makeListItem("Tidak ada lembar sumber", ""));

    const parts = $("inventoryPreviewParts");
    parts.replaceChildren();
    plan.cells.forEach((cell, index) => {
      const source = cell.sourceType === "inventory"
        ? "Inventaris " + cell.sourceRemainderId
        : "Lembar baru #" + cell.sheetId;
      parts.appendChild(makeListItem(
        "Potongan " + (index + 1) + " · " + cell.width + " × " + cell.height + " cm",
        source + (cell.rotated ? " · diputar 90°" : "")
      ));
    });

    const leftovers = $("inventoryPreviewLeftovers");
    leftovers.replaceChildren();
    const remainderRows = (plan.usableRemainders || []).map(item => ({ ...item, category: "Layak dicatat" }))
      .concat((plan.tooSmallRemainders || []).map(item => ({ ...item, category: "Di bawah batas ukuran" })));
    remainderRows.forEach(item => {
      const source = item.source === "inventory"
        ? "Sisa inventaris " + item.sourceRemainderId
        : "Lembar baru #" + item.sheetId;
      leftovers.appendChild(makeListItem(
        item.width + " × " + item.height + " cm · " + item.category,
        source
      ));
    });
    if (!remainderRows.length) leftovers.appendChild(makeListItem("Tidak ada sisa bidang yang terdeteksi", ""));

    $("inventoryPreviewResult").hidden = false;
  }

  async function createPreview() {
    clearMessage();
    clearPreview();

    const material = materials.find(item => item.id === $("inventoryMaterial").value);
    const jobId = $("inventoryJob").value;
    if (!material) throw new Error("Pilih material yang sudah terdaftar di katalog inventaris.");
    if (!jobId) throw new Error("Pilih pekerjaan yang akan menggunakan material.");
    if (material.grainRequired === true && $("inventoryGrainDirection").value === "none") {
      throw new Error("Material ini memerlukan arah serat. Pilih horizontal atau vertikal.");
    }

    const preview = await bridge.preview({
      jobId,
      wallWidthM: $("w").value,
      wallHeightM: $("h").value,
      materialLengthCm: $("mw").value,
      materialWidthCm: $("mh").value,
      orientation: $("ori").value,
      gapCm: $("gap").value,
      pattern: curPattern,
      direction: curDir,
      alignment: curAlign,
      mode: curMode,
      material,
      motif: material.motif,
      grainDirection: $("inventoryGrainDirection").value,
      kerf: 0,
      minRemainderW: $("minSisaW").value,
      minRemainderH: $("minSisaH").value
    });
    currentPreview = preview;
    renderPreview(preview);
    message("Pratinjau selesai. Stok inventaris belum diubah.");
  }

  async function init() {
    try {
      storage = MaterialInventoryStorage.createStorage({
        validator: MaterialInventoryValidator
      });
      const matcher = MaterialInventoryMatcher.createInventoryMatcher({
        cuttingEngine: MaterialCuttingEngine
      });
      const planner = MaterialInventoryPlanner.createInventoryPlanner({
        matcher,
        cuttingAdapter: MaterialCuttingAdapter,
        cuttingEngine: MaterialCuttingEngine
      });
      const engine = MaterialInventoryEngine.createInventoryEngine({ storage });
      const workflow = MaterialInventoryWorkflow.createInventoryWorkflow({
        storage, planner, inventoryEngine: engine
      });
      bridge = MaterialInventoryAppBridge.createInventoryAppBridge({
        geometryEngine: MaterialEngine, workflow
      });

      $("inventoryRefreshCatalog").addEventListener("click", () => {
        refreshCatalog().catch(error => message(error.message || "Katalog gagal dimuat.", true));
      });
      $("inventoryPreviewButton").addEventListener("click", () => {
        $("inventoryPreviewButton").disabled = true;
        createPreview()
          .catch(error => message(error.message || "Pratinjau gagal dibuat.", true))
          .finally(() => { $("inventoryPreviewButton").disabled = false; });
      });
      ["inventoryMaterial", "inventoryJob", "inventoryGrainDirection"].forEach(id => {
        $(id).addEventListener("change", () => {
          clearPreview();
          clearMessage();
        });
      });
      ["w", "h", "mn", "mw", "mh", "ori", "gap", "minSisaW", "minSisaH"].forEach(id => {
        $(id).addEventListener("input", clearPreview);
        $(id).addEventListener("change", clearPreview);
      });
      await refreshCatalog();
      $("inventoryPreviewButton").disabled = false;
    } catch (error) {
      message("Fitur pratinjau inventaris belum dapat dibuka: " + (error.message || error), true);
    }
  }

  init();
})();
