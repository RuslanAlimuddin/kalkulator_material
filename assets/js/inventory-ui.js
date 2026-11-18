/* UI pengelolaan inventaris. Tidak menyentuh jalur kalkulasi utama. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const storage = MaterialInventoryStorage.createStorage({ validator: MaterialInventoryValidator });
  let cache = { materials: [], jobs: [], remainders: [], movements: [], reservations: [] };
  let filterStatus = "all";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[ch]));
  }
  function dateLabel(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("id-ID");
  }
  function materialById(id) { return cache.materials.find(x => x.id === id); }
  function jobById(id) { return cache.jobs.find(x => x.id === id); }
  function statusLabel(status) {
    return ({available:"Tersedia",reserved:"Dipesan",consumed:"Dikonsumsi",discarded:"Rusak / dibuang"})[status] || status;
  }
  function notify(message, error) {
    const el = $("notice");
    el.textContent = message;
    el.className = error ? "notice error" : "notice";
    el.hidden = false;
  }
  function clearNotice() { $("notice").hidden = true; }

  async function refresh() {
    const names = ["materials","jobs","remainders","movements","reservations"];
    const values = await Promise.all(names.map(name => storage.getAll(name)));
    names.forEach((name, i) => { cache[name] = values[i]; });
    cache.remainders.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    cache.movements.sort((a,b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    render();
  }

  function renderSelects() {
    $("remainderMaterial").innerHTML = '<option value="">Pilih material</option>' +
      cache.materials.filter(x => x.active !== false).map(x =>
        '<option value="' + esc(x.id) + '">' + esc(x.name) + ' · ' + esc(x.thicknessMm) + ' mm</option>'
      ).join("");
    $("remainderJob").innerHTML = '<option value="">Pilih pekerjaan asal</option>' +
      cache.jobs.filter(x => x.status === "open").map(x =>
        '<option value="' + esc(x.id) + '">' + esc(x.name) + ' · ' + esc(x.id) + '</option>'
      ).join("");
  }

  function renderMaterials() {
    $("materialsTable").innerHTML = cache.materials.length ? cache.materials.map(item =>
      '<tr><td><strong>' + esc(item.name) + '</strong><small>' + esc(item.id) + '</small></td>' +
      '<td>' + esc(item.category) + '</td><td>' + esc(item.thicknessMm) + ' mm</td>' +
      '<td>' + esc(item.motif) + '</td><td>' + esc(item.rotationPolicy) + '</td>' +
      '<td>' + (item.active === false ? "Tidak aktif" : "Aktif") + '</td></tr>'
    ).join("") : '<tr><td colspan="6" class="empty">Belum ada katalog material.</td></tr>';
  }

  function renderJobs() {
    $("jobsTable").innerHTML = cache.jobs.length ? cache.jobs.slice().sort((a,b) =>
      String(b.createdAt).localeCompare(String(a.createdAt))).map(item =>
      '<tr><td><strong>' + esc(item.name) + '</strong><small>' + esc(item.id) + '</small></td>' +
      '<td>' + esc(item.status) + '</td><td>' + dateLabel(item.createdAt) + '</td>' +
      '<td>' + (item.closedAt ? dateLabel(item.closedAt) : "—") + '</td></tr>'
    ).join("") : '<tr><td colspan="4" class="empty">Belum ada pekerjaan.</td></tr>';
  }

  function renderRemainders() {
    const query = $("searchStock").value.trim().toLowerCase();
    const rows = cache.remainders.filter(item => {
      const material = materialById(item.materialId) || {};
      const job = jobById(item.originJobId) || {};
      const matchesStatus = filterStatus === "all" || item.status === filterStatus;
      const haystack = [item.id,item.materialId,material.name,item.originJobId,job.name,item.sourceSheetId,
        item.widthCm,item.heightCm,item.condition].join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
    $("stockCount").textContent = rows.length + " unit";
    $("stockTable").innerHTML = rows.length ? rows.map(item => {
      const material = materialById(item.materialId) || {};
      const job = jobById(item.originJobId) || {};
      const canEdit = item.status === "available";
      return '<tr><td><strong>' + esc(material.name || item.materialId) + '</strong><small>' +
        esc(item.id) + '</small></td><td class="size">' + esc(item.widthCm) + ' × ' + esc(item.heightCm) + ' cm</td>' +
        '<td>' + esc(job.name || item.originJobId) + '<small>' + esc(item.originJobId) + '</small></td>' +
        '<td>' + esc(item.sourceSheetId) + '</td><td><span class="pill ' + esc(item.status) + '">' +
        esc(statusLabel(item.status)) + '</span><small>Kondisi: ' + esc(item.condition) + '</small></td>' +
        '<td>' + (canEdit ? '<button data-action="good" data-id="' + esc(item.id) + '">Baik</button> ' +
          '<button data-action="damaged" data-id="' + esc(item.id) + '">Rusak</button> ' +
          '<button class="danger" data-action="discard" data-id="' + esc(item.id) + '">Buang</button>' : "—") +
        '</td></tr>';
    }).join("") : '<tr><td colspan="6" class="empty">Tidak ada stok yang cocok.</td></tr>';
  }

  function renderMovements() {
    const latest = cache.movements.slice(0,100);
    const names = {
      created:"Sisa dicatat",reserved:"Dipesan",reservation_released:"Reservasi dibatalkan",
      consumed:"Dikonsumsi",remainder_created:"Sisa baru terbentuk",
      condition_changed:"Kondisi diubah",discarded:"Dibuang",imported:"Diimpor"
    };
    $("movementTable").innerHTML = latest.length ? latest.map(item => {
      const remainder = cache.remainders.find(x => x.id === item.remainderId);
      const job = jobById(item.jobId) || {};
      return '<tr><td>' + dateLabel(item.timestamp) + '</td><td>' + esc(names[item.type] || item.type) +
        '</td><td>' + esc(remainder ? remainder.id : item.remainderId) + '</td><td>' +
        esc(job.name || item.jobId || "—") + '</td><td>' +
        esc((item.fromStatus || "—") + " → " + (item.toStatus || "—")) + '</td></tr>';
    }).join("") : '<tr><td colspan="5" class="empty">Belum ada riwayat pergerakan.</td></tr>';
  }

  function renderSummary() {
    $("countMaterials").textContent = cache.materials.length;
    $("countJobs").textContent = cache.jobs.length;
    $("countAvailable").textContent = cache.remainders.filter(x => x.status === "available").length;
    $("countReserved").textContent = cache.remainders.filter(x => x.status === "reserved").length;
    $("countConsumed").textContent = cache.remainders.filter(x => x.status === "consumed").length;
    $("countDiscarded").textContent = cache.remainders.filter(x => x.status === "discarded" || x.condition === "damaged").length;
  }

  function render() {
    renderSelects(); renderMaterials(); renderJobs(); renderRemainders(); renderMovements(); renderSummary();
  }

  function activateTab(tab) {
    document.querySelectorAll("[data-tab]").forEach(el => el.classList.toggle("active", el.dataset.tab === tab));
    document.querySelectorAll("[data-panel]").forEach(el => el.hidden = el.dataset.panel !== tab);
  }

  $("tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-tab]");
    if (button) activateTab(button.dataset.tab);
  });
  $("statusFilter").addEventListener("change", event => { filterStatus = event.target.value; renderRemainders(); });
  $("searchStock").addEventListener("input", renderRemainders);

  $("materialForm").addEventListener("submit", async event => {
    event.preventDefault(); clearNotice();
    try {
      const name = $("materialName").value.trim();
      const record = {
        id: MaterialInventoryStorage.makeId("MAT"), name,
        category: $("materialCategory").value.trim(),
        thicknessMm: Number($("materialThickness").value),
        surface: $("materialSurface").value.trim() || null,
        grainRequired: $("materialGrain").checked,
        motif: $("materialMotif").value.trim() || "plain",
        rotationPolicy: $("materialRotation").value,
        active: true
      };
      if (!name || !record.category || !(record.thicknessMm > 0)) throw new Error("Nama, kategori, dan ketebalan material wajib valid.");
      await storage.add("materials", record);
      event.target.reset(); $("materialMotif").value = "plain";
      await refresh(); notify("Material berhasil ditambahkan.");
    } catch (error) { notify(error.message || "Gagal menyimpan material.", true); }
  });

  $("jobForm").addEventListener("submit", async event => {
    event.preventDefault(); clearNotice();
    try {
      const name = $("jobName").value.trim();
      if (!name) throw new Error("Nama pekerjaan wajib diisi.");
      await storage.add("jobs", {
        id: MaterialInventoryStorage.makeId("JOB"), name, status:"open",
        createdAt:new Date().toISOString(), closedAt:null
      });
      event.target.reset(); await refresh(); notify("Pekerjaan berhasil dicatat.");
    } catch (error) { notify(error.message || "Gagal menyimpan pekerjaan.", true); }
  });

  $("remainderForm").addEventListener("submit", async event => {
    event.preventDefault(); clearNotice();
    try {
      const material = materialById($("remainderMaterial").value);
      const jobId = $("remainderJob").value;
      if (!material || !jobId) throw new Error("Pilih material dan pekerjaan asal.");
      const record = await storage.createRemainder({
        materialId: material.id,
        originJobId: jobId,
        sourceSheetId: $("sourceSheet").value.trim(),
        widthCm: Number($("remainderWidth").value),
        heightCm: Number($("remainderHeight").value),
        thicknessMm: material.thicknessMm,
        grainDirection: $("remainderGrain").value.trim() || "none",
        motif: material.motif,
        rotationAllowed: material.rotationPolicy !== "fixed" && material.grainRequired !== true,
        condition: $("remainderCondition").value
      });
      event.target.reset(); await refresh();
      notify("Sisa berhasil dicatat dengan ID " + record.id + ". Riwayat pembentukannya juga tersimpan.");
    } catch (error) { notify(error.message || "Gagal mencatat sisa.", true); }
  });

  $("stockTable").addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = cache.remainders.find(x => x.id === button.dataset.id);
    if (!item) return;
    const action = button.dataset.action;
    if (action === "discard" && !confirm("Buang sisa " + item.id + "? Tindakan ini mengubah status stok menjadi discarded.")) return;
    try {
      const changes = action === "discard" ? {status:"discarded"} :
        {condition: action === "damaged" ? "damaged" : "good"};
      await storage.updateRemainderState({id:item.id,changes});
      await refresh(); notify(action === "discard" ? "Stok telah ditandai dibuang." : "Kondisi stok berhasil diperbarui.");
    } catch (error) { notify(error.message || "Perubahan stok gagal.", true); }
  });

  $("exportButton").addEventListener("click", async () => {
    try {
      const bundle = await storage.exportJSON();
      const blob = new Blob([JSON.stringify(bundle,null,2)], {type:"application/json"});
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "inventaris-material-" + new Date().toISOString().slice(0,10) + ".json";
      link.click(); URL.revokeObjectURL(url);
      notify("Cadangan JSON berhasil disiapkan.");
    } catch (error) { notify(error.message || "Ekspor gagal.", true); }
  });

  $("importButton").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const bundle = JSON.parse(await file.text());
      const mode = $("importMode").value;
      const warning = mode === "replace"
        ? "GANTI seluruh data inventaris lokal dengan isi file?"
        : "Gabungkan data file ke inventaris lokal? ID yang bentrok akan ditolak.";
      if (!confirm(warning)) return;
      const result = await storage.importJSON(bundle, mode);
      await refresh();
      notify("Impor selesai: " + result.imported + " record. Mode: " + result.mode + ".");
    } catch (error) { notify(error.message || "Impor gagal.", true); }
    finally { event.target.value = ""; }
  });

  refresh().catch(error => notify("Inventaris tidak dapat dibuka: " + error.message, true));
})();
