/* UI pratinjau dan reservasi inventaris pada kalkulator utama.
 * Jalur ini terpisah dari calc() dan tidak mengubah kalkulasi lama.
 */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  let storage = null;
  let bridge = null;
  let workflow = null;
  let materials = [];
  let jobs = [];
  let currentPreview = null;
  let activePlanViews = [];

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
    $("inventoryConfirmButton").hidden = true;
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
    const selectedMaterial = materialSelect.value;
    const selectedJob = jobSelect.value;
    materialSelect.replaceChildren();
    jobSelect.replaceChildren();
    addOption(materialSelect, "", "Pilih material dari katalog");
    addOption(jobSelect, "", "Pilih pekerjaan");

    const activeMaterials = materials.filter(item => item && item.active !== false);
    const openJobs = jobs.filter(item => item && item.status === "open");
    activeMaterials.forEach(item => {
      addOption(materialSelect, item.id, item.name + " · " + item.thicknessMm + " mm");
    });
    openJobs.forEach(item => addOption(jobSelect, item.id, item.name));
    if (activeMaterials.some(item => item.id === selectedMaterial)) materialSelect.value = selectedMaterial;
    if (openJobs.some(item => item.id === selectedJob)) jobSelect.value = selectedJob;

    $("inventoryCatalogHint").textContent =
      activeMaterials.length + " material aktif · " + openJobs.length + " pekerjaan terbuka";
    $("inventoryPreviewButton").disabled = activeMaterials.length === 0 || openJobs.length === 0;
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
      const label = sheet.source === "inventory"
        ? "Sisa inventaris " + sheet.remainderId
        : "Lembar baru #" + sheet.id;
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
    const remainderRows = (plan.usableRemainders || []).map(item => ({
      ...item, category: "Layak dicatat"
    })).concat((plan.tooSmallRemainders || []).map(item => ({
      ...item, category: "Di bawah batas ukuran"
    })));
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
    $("inventoryConfirmButton").hidden = false;
    $("inventoryConfirmButton").disabled = false;
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
    message("Pratinjau selesai. Stok inventaris belum diubah. Periksa sumber sebelum menyetujui.");
  }

  async function confirmCurrentPreview() {
    if (!currentPreview) throw new Error("Buat pratinjau terlebih dahulu sebelum menyetujui.");
    const approved = currentPreview;
    $("inventoryConfirmButton").disabled = true;
    try {
      const reserved = await bridge.confirm(approved);
      currentPreview = null;
      $("inventoryConfirmButton").hidden = true;
      message("Reservasi berhasil. " + reserved.reservations.length +
        " sisa inventaris dikunci untuk pekerjaan ini. Rencana tersimpan dan dapat dipulihkan setelah halaman dibuka kembali.");
      await refreshActivePlans();
    } catch (error) {
      $("inventoryConfirmButton").disabled = false;
      throw error;
    }
  }

  function appendText(parent, tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    parent.appendChild(node);
    return node;
  }

  function makeActionButton(label, action, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    if (className) button.className = className;
    return button;
  }

  function renderActivePlans(views) {
    activePlanViews = views;
    const root = $("inventoryActivePlans");
    root.replaceChildren();
    if (!views.length) {
      appendText(root, "p", "Belum ada reservasi aktif.", "inventory-preview-muted");
      return;
    }

    views.forEach(view => {
      const record = view.record;
      const card = document.createElement("article");
      card.className = "inventory-active-card";
      card.dataset.planId = record.id;
      const title = appendText(card, "strong",
        "Pekerjaan " + (record.jobId || "tidak diketahui") + " · " + record.id);
      title.className = "inventory-active-title";

      if (record.status === "legacy_recovery") {
        appendText(card, "p",
          "Reservasi lama tidak memiliki snapshot pemotongan. Rencana tidak dapat diselesaikan, tetapi reservasi dapat dibatalkan dengan aman.",
          "inventory-preview-warning");
        card.appendChild(makeActionButton("Batalkan reservasi lama", "cancel-legacy", "inventory-action-danger"));
        root.appendChild(card);
        return;
      }

      if (view.error || !view.restored) {
        appendText(card, "p",
          "Pemulihan diblokir: " + (view.error || "snapshot tidak tersedia") +
          ". Stok tidak diubah; periksa laporan pemulihan inventaris.",
          "inventory-preview-warning");
        root.appendChild(card);
        return;
      }

      const reserved = view.restored;
      const materialName = reserved.material && reserved.material.name
        ? reserved.material.name : (reserved.material && reserved.material.id) || "Material";
      appendText(card, "p",
        materialName + " · " + reserved.plan.sheetCount + " lembar sumber · " +
        reserved.plan.inventorySheetCount + " sisa inventaris · " +
        reserved.plan.newSheetCount + " lembar baru",
        "inventory-preview-muted");
      const sourceList = document.createElement("ul");
      reserved.inventoryUsage.forEach(item => {
        sourceList.appendChild(makeListItem(item.remainderId, item.placedCount + " potongan"));
      });
      card.appendChild(sourceList);

      const actions = document.createElement("div");
      actions.className = "inventory-active-actions";
      const prefixLabel = document.createElement("label");
      prefixLabel.textContent = "Awalan ID lembar hasil pemotongan";
      const prefixInput = document.createElement("input");
      prefixInput.type = "text";
      prefixInput.className = "inventory-source-prefix";
      prefixInput.value = (reserved.jobId || "JOB") + "-CUT-" +
        new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
      prefixLabel.appendChild(prefixInput);
      actions.appendChild(prefixLabel);
      actions.appendChild(makeActionButton("Selesaikan pemotongan", "complete", "inventory-action-primary"));
      actions.appendChild(makeActionButton("Batalkan reservasi", "cancel", "inventory-action-danger"));
      card.appendChild(actions);
      root.appendChild(card);
    });
  }

  async function refreshActivePlans() {
    const records = await workflow.getRecoveryPlans();
    const views = await Promise.all(records.map(async record => {
      if (record.status === "legacy_recovery") return { record, restored: null };
      try {
        return { record, restored: await workflow.restorePlan(record.id) };
      } catch (error) {
        return { record, restored: null, error: error.message || String(error) };
      }
    }));
    renderActivePlans(views);

    const report = await workflow.getRecoveryReport();
    const inconsistentPlanIds = new Set(report.inconsistentPlans.map(item => item.id));
    const additionalReservationIssues = new Set(
      report.inconsistentReservations
        .map(item => item.planId || item.id)
        .filter(id => !inconsistentPlanIds.has(id))
    ).size;
    const problems = report.orphanedReservations.length +
      report.orphanedRemainders.length +
      report.multiplyReservedRemainders.length +
      report.reservationsWithoutSource.length +
      report.inconsistentPlans.length +
      additionalReservationIssues;
    const notice = $("inventoryRecoveryNotice");
    if (problems) {
      notice.textContent = "Peringatan audit inventaris: ditemukan " + problems +
        " ketidaksesuaian. Jangan menyelesaikan rencana yang bermasalah sebelum diperiksa.";
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
  }

  async function handleActivePlanAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest("[data-plan-id]");
    if (!card) return;
    const view = activePlanViews.find(item => item.record.id === card.dataset.planId);
    if (!view) return;
    const action = button.dataset.action;
    button.disabled = true;
    let successMessage = "";
    try {
      if (action === "cancel-legacy") {
        if (!window.confirm("Batalkan seluruh reservasi lama " + view.record.id + "?")) {
          button.disabled = false;
          return;
        }
        await workflow.cancelLegacyRecovery(view.record.id);
        successMessage = "Reservasi lama berhasil dibatalkan. Stok terkait kembali tersedia.";
      } else if (action === "cancel") {
        if (!window.confirm("Batalkan seluruh reservasi untuk pekerjaan " + view.record.jobId + "?")) {
          button.disabled = false;
          return;
        }
        await bridge.cancel(view.restored);
        successMessage = "Reservasi berhasil dibatalkan. Semua sumber inventaris telah dilepas.";
      } else if (action === "complete") {
        const prefix = card.querySelector(".inventory-source-prefix").value.trim();
        if (!prefix) throw new Error("Awalan ID lembar hasil pemotongan wajib diisi.");
        if (!window.confirm(
          "Pastikan pemotongan fisik untuk pekerjaan " + view.record.jobId +
          " benar-benar selesai. Sistem akan mengonsumsi sumber yang dipesan dan mencatat sisa hasilnya. Lanjutkan?"
        )) {
          button.disabled = false;
          return;
        }
        const result = await bridge.complete(view.restored, {
          sourceSheetIdPrefix: prefix
        });
        successMessage = "Penyelesaian berhasil. " + result.consumedReservations.length +
          " sumber inventaris dikonsumsi dan " + result.createdRemainders.length +
          " sisa baru dicatat.";
      }
      await refreshCatalog();
      await refreshActivePlans();
      if (successMessage) message(successMessage);
    } catch (error) {
      message(error.message || "Tindakan reservasi gagal.", true);
      button.disabled = false;
    }
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
      workflow = MaterialInventoryWorkflow.createInventoryWorkflow({
        storage, planner, inventoryEngine: engine
      });
      bridge = MaterialInventoryAppBridge.createInventoryAppBridge({
        geometryEngine: MaterialEngine, workflow
      });

      $("inventoryRefreshCatalog").addEventListener("click", async () => {
        try {
          await refreshCatalog();
          await refreshActivePlans();
        } catch (error) {
          message(error.message || "Katalog inventaris gagal dimuat.", true);
        }
      });
      $("inventoryPreviewButton").addEventListener("click", () => {
        $("inventoryPreviewButton").disabled = true;
        createPreview()
          .catch(error => message(error.message || "Pratinjau gagal dibuat.", true))
          .finally(() => { $("inventoryPreviewButton").disabled = false; });
      });
      $("inventoryConfirmButton").addEventListener("click", () => {
        confirmCurrentPreview().catch(error => message(error.message || "Reservasi gagal.", true));
      });
      $("inventoryActivePlans").addEventListener("click", handleActivePlanAction);
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
      await refreshActivePlans();
    } catch (error) {
      message("Fitur inventaris belum dapat dibuka: " + (error.message || error), true);
    }
  }

  init();
})();
