// Rapor düzenleme sayfası: toplanan veriyi gösterir, ekran görüntüsü işaretlemeye,
// alanları düzenlemeye ve mükerrer kontrolüne izin verir; bileti Jira'da açar.
const $ = (id) => document.getElementById(id);
const setStatus = (text, cls) => JBR.setStatus($("status"), text, cls);

let pending = null;
let state = null;
let profile = null;
let annotator = null;
let recording = null;

// ---------- Ekran görüntüsü işaretleme ----------
class Annotator {
  constructor(canvas, overlay, dataUrl, onFail) {
    this.canvas = canvas;
    this.overlay = overlay;
    this.ctx = canvas.getContext("2d");
    this.octx = overlay.getContext("2d");
    this.tool = "rect";
    this.undoStack = [];
    this.originalDataUrl = dataUrl;
    this.drag = null;
    this.ready = false;
    this.failed = false;
    this.onFail = onFail || null;
    this._readyResolvers = [];

    this.load(dataUrl);

    overlay.addEventListener("pointerdown", (e) => this.onDown(e));
    overlay.addEventListener("pointermove", (e) => this.onMove(e));
    overlay.addEventListener("pointerup", (e) => this.onUp(e));
    overlay.addEventListener("pointercancel", () => { this.drag = null; this.clearOverlay(); });
  }

  load(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.setSize(img.naturalWidth, img.naturalHeight);
      this.ctx.drawImage(img, 0, 0);
      this.ready = true;
      this._readyResolvers.splice(0).forEach(r => r(true));
    };
    img.onerror = () => {
      this.failed = true;
      this._readyResolvers.splice(0).forEach(r => r(false));
      if (this.onFail) this.onFail();
    };
    img.src = dataUrl;
  }

  // Görüntü decode edilene kadar bekler; başarısızlık veya zaman aşımında false döner.
  whenReady(timeoutMs = 3000) {
    if (this.ready) return Promise.resolve(true);
    if (this.failed) return Promise.resolve(false);
    return new Promise(resolve => {
      this._readyResolvers.push(resolve);
      setTimeout(() => resolve(this.ready), timeoutMs);
    });
  }

  setSize(w, h) {
    this.canvas.width = w; this.canvas.height = h;
    this.overlay.width = w; this.overlay.height = h;
  }

  pos(e) {
    const r = this.overlay.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.canvas.width, (e.clientX - r.left) * (this.canvas.width / r.width))),
      y: Math.max(0, Math.min(this.canvas.height, (e.clientY - r.top) * (this.canvas.height / r.height)))
    };
  }

  onDown(e) {
    if (!this.ready) return;
    e.preventDefault();
    this.overlay.setPointerCapture(e.pointerId);
    this.drag = { start: this.pos(e), end: this.pos(e) };
  }

  onMove(e) {
    if (!this.drag) return;
    this.drag.end = this.pos(e);
    this.preview();
  }

  onUp(e) {
    if (!this.drag) return;
    this.drag.end = this.pos(e);
    const box = this.box();
    this.drag = null;
    this.clearOverlay();
    if (box.w < 3 || box.h < 3) return;
    this.snapshot();
    this.apply(box);
  }

  box() {
    const { start, end } = this.drag;
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
      start, end
    };
  }

  clearOverlay() {
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  strokeStyle(ctx) {
    ctx.strokeStyle = "#ff2d2d";
    ctx.lineWidth = Math.max(3, Math.round(this.canvas.width / 400));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  preview() {
    const b = this.box();
    const ctx = this.octx;
    this.clearOverlay();
    this.strokeStyle(ctx);
    if (this.tool === "arrow") {
      this.drawArrow(ctx, b.start, b.end);
    } else {
      if (this.tool === "crop") ctx.setLineDash([8, 6]);
      else if (this.tool === "blur") ctx.setLineDash([3, 3]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
    }
  }

  drawArrow(ctx, from, to) {
    const head = Math.max(12, ctx.lineWidth * 4);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  snapshot() {
    this.undoStack.push({ dataUrl: this.canvas.toDataURL("image/png"), w: this.canvas.width, h: this.canvas.height });
    if (this.undoStack.length > 12) this.undoStack.shift();
  }

  apply(b) {
    const ctx = this.ctx;
    this.strokeStyle(ctx);
    if (this.tool === "rect") {
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    } else if (this.tool === "arrow") {
      this.drawArrow(ctx, b.start, b.end);
    } else if (this.tool === "blur") {
      this.pixelate(b);
    } else if (this.tool === "crop") {
      this.crop(b);
    }
  }

  pixelate(b) {
    const x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.w), h = Math.round(b.h);
    const tmp = document.createElement("canvas");
    tmp.width = Math.max(1, Math.round(w * 0.06));
    tmp.height = Math.max(1, Math.round(h * 0.06));
    const tctx = tmp.getContext("2d");
    tctx.drawImage(this.canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
    const prev = this.ctx.imageSmoothingEnabled;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
    this.ctx.imageSmoothingEnabled = prev;
  }

  crop(b) {
    const x = Math.round(b.x), y = Math.round(b.y), w = Math.round(b.w), h = Math.round(b.h);
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    tmp.getContext("2d").drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    this.setSize(w, h);
    this.ctx.drawImage(tmp, 0, 0);
  }

  restore(snap) {
    const img = new Image();
    img.onload = () => {
      this.setSize(snap.w, snap.h);
      this.ctx.drawImage(img, 0, 0);
    };
    img.src = snap.dataUrl;
  }

  undo() {
    const snap = this.undoStack.pop();
    if (snap) this.restore(snap);
  }

  reset() {
    this.undoStack = [];
    this.ready = false;
    this.load(this.originalDataUrl);
  }

  toBlob() {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(b => b ? resolve(b) : reject(new Error("Ekran görüntüsü dışa aktarılamadı.")), "image/png");
    });
  }
}

// ---------- Yardımcılar ----------
function fatal(text) {
  const el = $("fatal");
  el.textContent = text;
  el.classList.remove("hidden");
  $("submit").disabled = true;
}

function fillSelect(sel, items, selectedValue) {
  sel.textContent = "";
  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.value;
    opt.textContent = it.label;
    if (it.value === selectedValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

// Proje/issue türü alanını select ↔ input arasında dönüştürür (id korunur);
// Jira meta yüklenemediğinde kullanıcı değerleri elle düzeltebilsin diye.
function fieldEl(id, tag) {
  let el = $(id);
  if (el.tagName.toLowerCase() !== tag) {
    const n = document.createElement(tag);
    n.id = id;
    el.replaceWith(n);
    el = n;
  }
  if (id === "project" && !el.dataset.wired) {
    el.dataset.wired = "1";
    el.addEventListener("change", () => {
      refreshIssueTypes().catch(() => {});
      loadDuplicates();
    });
  }
  return el;
}

function fmtStep(s) {
  let t = "";
  try { t = new Date(s.ts).toLocaleTimeString("tr-TR"); } catch (e) {}
  return `${t ? t + " — " : ""}${s.action}: ${String(s.detail || "").slice(0, 120)}`;
}

function currentProfile() {
  const id = $("profileSelect").value;
  return state.profiles.find(p => p.id === id) || profile;
}

// ---------- Jira meta (projeler, issue tipleri, öncelikler) ----------
async function refreshIssueTypes() {
  const prof = currentProfile();
  const key = $("project").value.trim();
  if (!key) return;
  const types = await Jira.listIssueTypes(prof, key);
  if (!types.length) return;
  const items = types.map(t => ({ value: t.name, label: t.name }));
  const selected = items.some(i => i.value === prof.issueType) ? prof.issueType : items[0].value;
  fillSelect(fieldEl("issueType", "select"), items, selected);
}

async function loadJiraMeta() {
  const prof = currentProfile();
  const warn = $("metaWarn");
  warn.classList.add("hidden");

  // Öncelik listesi bağımsız; proje listesiyle paralel çekilir.
  const prioP = Jira.listPriorities(prof).then(prios => {
    fillSelect($("priority"),
      [{ value: "", label: "(Varsayılan)" }, ...prios.map(pr => ({ value: pr.id, label: pr.name }))],
      "");
  }).catch(() => {});

  try {
    const projects = await Jira.listProjects(prof);
    const items = projects.map(p => ({ value: p.key, label: `${p.key} — ${p.name}` }));
    const selected = items.some(i => i.value === prof.projectKey) ? prof.projectKey : (items[0] && items[0].value);
    fillSelect(fieldEl("project", "select"), items, selected);
    await refreshIssueTypes();
  } catch (e) {
    // Liste alınamadı: elle düzenlenebilir alanlara dönüş (profil değeri bayatsa
    // kullanıcı kilitlenmesin).
    fieldEl("project", "input").value = prof.projectKey || "";
    fieldEl("issueType", "input").value = prof.issueType || "Bug";
    warn.textContent = "Proje/issue türü listesi alınamadı (" + JBR.errMsg(e) + "); değerleri elle düzenleyebilirsiniz.";
    warn.classList.remove("hidden");
  }
  await prioP;
}

// ---------- Mükerrer bilet kontrolü ----------
async function loadDuplicates(keyOverride) {
  const box = $("duplicates");
  box.classList.add("hidden");
  try {
    const prof = currentProfile();
    const key = (keyOverride || $("project").value || prof.projectKey || "").trim();
    const issues = await Jira.searchSimilar(prof, key, pending.payload.meta.url);
    if (!issues.length) return;
    const list = $("duplicateList");
    list.textContent = "";
    for (const is of issues) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = Jira.browseUrl(prof, is.key);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = is.key;
      li.appendChild(a);
      const span = document.createElement("span");
      const status = is.fields && is.fields.status ? ` [${is.fields.status.name}]` : "";
      span.textContent = ` — ${(is.fields && is.fields.summary) || ""}${status}`;
      li.appendChild(span);
      list.appendChild(li);
    }
    box.classList.remove("hidden");
  } catch (e) {
    // best-effort; sessizce geç
  }
}

// ---------- Gönderim ----------
function buildSummaryItems(payload, { includeRecording, includeScreenshot, redacted }) {
  const meta = payload.meta || {};
  const logs = payload.logs || {};
  const cookieCount = payload.cookies && payload.cookies.chromeCookies ? payload.cookies.chromeCookies.length : 0;
  const items = [
    `URL: ${meta.url}`,
    `Zaman: ${meta.time}`,
    `UA: ${meta.userAgent}`,
    `Viewport: ${meta.viewport ? meta.viewport.w + "x" + meta.viewport.h : "bilinmiyor"}`,
    `Hata sayısı: ${(logs.errors || []).length}`,
    `Console girdisi: ${(logs.console || []).length}`,
    `Network girdisi: ${(logs.network || []).length} (resources: ${(payload.resources || []).length})`,
    `Kullanıcı adımı: ${(payload.steps || []).length}`,
    `Cookies: ${payload.cookies ? cookieCount + " adet eklendi" : "yok"}`,
    `Storage: ${payload.storage ? "eklendi" : "yok"}`,
    `Ekran görüntüsü: ${includeScreenshot ? "eklendi" : "yok"}`,
    `Ekran kaydı: ${includeRecording ? "eklendi" : "yok"}`,
    `Hassas veri maskeleme: ${redacted ? "açık" : "kapalı"}`
  ];
  if (meta.note) items.push(`Not: ${meta.note}`);
  return items;
}

// Jira ek boyutu sınırına takılmamak için rapor JSON'unu gerekirse kırp.
// Önce kompakt forma geçilir; hacmin asıl kaynağı storage/cookies ise onlar
// düşürülür, ardından log kuyrukları yarılanır.
function safeReportJson(payload) {
  const MAX = 9 * 1024 * 1024;
  let json = JSON.stringify(payload, null, 2);
  if (json.length <= MAX) return json;

  json = JSON.stringify(payload);
  const sizeOf = v => { try { return v ? JSON.stringify(v).length : 0; } catch (e) { return 0; } };

  if (json.length > MAX && sizeOf(payload.storage) > MAX / 3) {
    payload.storage = "__DROPPED__ (boyut sınırı)";
    payload._truncated = "Rapor, ek boyutu sınırı nedeniyle kırpıldı.";
    json = JSON.stringify(payload);
  }
  if (json.length > MAX && sizeOf(payload.cookies) > MAX / 3) {
    payload.cookies = "__DROPPED__ (boyut sınırı)";
    payload._truncated = "Rapor, ek boyutu sınırı nedeniyle kırpıldı.";
    json = JSON.stringify(payload);
  }

  let guard = 0;
  while (json.length > MAX && guard++ < 8) {
    const logs = payload.logs || {};
    let shrunk = false;
    ["console", "network"].forEach(k => {
      if (Array.isArray(logs[k]) && logs[k].length > 10) {
        logs[k] = logs[k].slice(-Math.floor(logs[k].length / 2));
        shrunk = true;
      }
    });
    if (Array.isArray(payload.resources) && payload.resources.length > 10) {
      payload.resources = payload.resources.slice(-Math.floor(payload.resources.length / 2));
      shrunk = true;
    }
    if (!shrunk) {
      if (payload.storage && typeof payload.storage === "object") payload.storage = "__DROPPED__ (boyut sınırı)";
      else if (payload.cookies && typeof payload.cookies === "object") payload.cookies = "__DROPPED__ (boyut sınırı)";
      else break;
    }
    payload._truncated = "Rapor, ek boyutu sınırı nedeniyle kırpıldı.";
    json = JSON.stringify(payload);
  }
  return json;
}

async function submit() {
  const btn = $("submit");
  btn.disabled = true;
  setStatus("Bilet oluşturuluyor...");
  try {
    const prof = currentProfile();
    if (!prof) throw new Error("Profil bulunamadı; ayarlar sayfasından bir profil oluşturun.");

    const doRedact = $("redact").checked;
    // redactPayload zaten kopya üzerinde çalışır; maskeleme kapalıysa structuredClone yeterli.
    const payload = doRedact ? JBR.redactPayload(pending.payload) : structuredClone(pending.payload);
    delete payload.collectFailed;
    if (!$("incCookies").checked) delete payload.cookies;
    if (!$("incStorage").checked) delete payload.storage;

    const includeRecording = !!(recording && $("incRecording").checked);
    // Görüntü decode edilmeden gönderilirse boş canvas yüklenmesin.
    const includeScreenshot = !!(annotator && await annotator.whenReady(3000));

    const attachmentNames = ["page-report.json"];
    if (includeScreenshot) attachmentNames.push("screenshot.png");
    if (includeRecording) attachmentNames.push("tab-recording.webm");

    const summaryItems = buildSummaryItems(payload, { includeRecording, includeScreenshot, redacted: doRedact });
    const previewJson = JSON.stringify({
      meta: payload.meta,
      sampleErrors: ((payload.logs || {}).errors || []).slice(0, 3),
      sampleConsole: ((payload.logs || {}).console || []).slice(0, 5)
    }, null, 2).slice(0, 4000);

    const description = Jira.buildDescription({
      userText: $("description").value,
      summaryItems,
      steps: (payload.steps || []).map(fmtStep),
      previewJson,
      attachmentNames
    });

    const labels = $("labels").value.split(",")
      .map(s => s.trim()).filter(Boolean)
      .map(s => s.replace(/\s+/g, "-"));

    const projectKey = $("project").value.trim();
    const issueType = $("issueType").value.trim();
    if (!projectKey || !issueType) throw new Error("Proje ve issue türü seçilmelidir.");

    const issue = await Jira.createIssue(prof, {
      projectKey,
      issueType,
      summary: $("summary").value.trim() || `[Bug] ${payload.meta.title || payload.meta.url}`,
      description,
      priorityId: $("priority").value || null,
      labels
    });
    const issueUrl = Jira.browseUrl(prof, issue.key);

    setStatus(`Bilet oluşturuldu: ${issue.key}. Ekler yükleniyor...`);

    const files = [{ name: "page-report.json", blob: new Blob([safeReportJson(payload)], { type: "application/json" }) }];
    if (includeScreenshot) files.push({ name: "screenshot.png", blob: await annotator.toBlob() });
    if (includeRecording) files.push({ name: "tab-recording.webm", blob: recording.blob });

    let attachWarn = "";
    try {
      await Jira.uploadAttachments(prof, issue.key, files);
    } catch (e) {
      attachWarn = " Ancak ekler yüklenemedi: " + JBR.errMsg(e) +
        " Bilet zaten oluşturuldu; lütfen tekrar bilet açmak yerine eki elle yükleyin.";
    }

    if (recording) await JBR.clearRecording();
    await JBR.addRecentIssue({ key: issue.key, url: issueUrl, title: $("summary").value.trim(), time: new Date().toISOString() });
    await chrome.storage.session.remove("pendingReport");

    const el = $("status");
    el.className = "status " + (attachWarn ? "error" : "success");
    el.textContent = "";
    el.append(attachWarn ? "Bilet oluşturuldu (eksik eklerle): " : "Bilet oluşturuldu: ");
    const a = document.createElement("a");
    a.href = issueUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = issue.key;
    el.appendChild(a);
    if (attachWarn) el.append(attachWarn);
    btn.textContent = "Bilet açıldı ✓";
  } catch (e) {
    setStatus("Hata: " + JBR.errMsg(e), "error");
    btn.disabled = false;
  }
}

// ---------- Başlangıç ----------
(async function init() {
  try {
    const s = await chrome.storage.session.get("pendingReport");
    pending = s.pendingReport;
    if (!pending) {
      fatal("Bekleyen rapor verisi bulunamadı. Lütfen raporu uzantı penceresindeki 'Rapor hazırla' butonuyla oluşturun.");
      return;
    }
    state = await JBR.getState();
    if (!state.profiles.length) {
      fatal("Tanımlı Jira profili yok. Lütfen önce ayarlar sayfasından bir profil oluşturun.");
      return;
    }
    profile = JBR.pickProfile(state, pending.payload.meta.url);

    // Profil seçici
    fillSelect($("profileSelect"),
      state.profiles.map(p => ({ value: p.id, label: p.name || p.baseUrl })),
      profile.id);
    $("profileSelect").onchange = () => { loadJiraMeta().then(() => loadDuplicates()).catch(() => {}); };

    // Sayfa bilgisi & alanlar
    const meta = pending.payload.meta || {};
    let host = "";
    try { host = new URL(meta.url).hostname; } catch (e) {}
    $("pageInfo").textContent = `${meta.title || "(başlıksız)"} — ${meta.url || ""}`;
    $("summary").value = `[Bug] ${meta.title || meta.url || "Sayfa"}${host ? " @ " + host : ""}`.slice(0, 254);

    // Eksik/kırpılmış veri uyarısı görünür olsun (yalnızca açıklamaya gömülü not yetmez).
    if (pending.payload.collectFailed || meta.note) {
      const w = $("collectWarn");
      w.textContent = "Dikkat: " + (meta.note || "Sayfa verileri eksik toplanmış olabilir.");
      w.classList.remove("hidden");
    }

    // Eklenecekler
    const hasCookies = !!pending.payload.cookies;
    const hasStorage = !!pending.payload.storage;
    $("incCookies").checked = hasCookies;
    $("incCookies").disabled = !hasCookies;
    $("incCookiesLabel").textContent = hasCookies
      ? `Çerezler (${(pending.payload.cookies.chromeCookies || []).length} adet)`
      : "Çerezler (toplanmadı)";
    $("incStorage").checked = hasStorage;
    $("incStorage").disabled = !hasStorage;
    $("incStorageLabel").textContent = hasStorage ? "Depolama özeti" : "Depolama özeti (toplanmadı)";
    $("redact").checked = state.prefs.redact !== false;

    const logs = pending.payload.logs || {};
    $("logSummary").textContent =
      `${(logs.errors || []).length} hata, ${(logs.console || []).length} console, ` +
      `${(logs.network || []).length} network girdisi, ${(pending.payload.steps || []).length} kullanıcı adımı toplandı.`;

    // Ekran kaydı (geçerlilik/TTL kuralları shared.js'te)
    recording = await JBR.getRecording();
    if (recording) {
      const sameTab = recording.tabId == null || recording.tabId === pending.tab.id;
      // Farklı sekmeden kalan kayıt yanlışlıkla eklenmesin: varsayılan işaretsiz + uyarı.
      $("incRecording").checked = sameTab;
      $("incRecordingLabel").textContent =
        `Ekran kaydı (${(recording.blob.size / (1024 * 1024)).toFixed(1)} MB)` +
        (sameTab ? "" : " — DİKKAT: farklı bir sekmeden alınmış");
    } else {
      $("incRecording").checked = false;
      $("incRecording").disabled = true;
      $("incRecordingLabel").textContent = "Ekran kaydı (yok)";
    }

    // Ekran görüntüsü düzenleyici
    if (pending.screenshot) {
      const hideEditor = () => {
        annotator = null;
        $("toolbar").classList.add("hidden");
        $("canvasWrap").classList.add("hidden");
        $("noShot").classList.remove("hidden");
      };
      annotator = new Annotator($("shot"), $("shotOverlay"), pending.screenshot, hideEditor);
      document.querySelectorAll("#toolbar .tool[data-tool]").forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll("#toolbar .tool[data-tool]").forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          annotator.tool = btn.dataset.tool;
        };
      });
      $("undo").onclick = () => annotator.undo();
      $("resetImg").onclick = () => annotator.reset();
    } else {
      $("toolbar").classList.add("hidden");
      $("canvasWrap").classList.add("hidden");
      $("noShot").classList.remove("hidden");
    }

    $("redact").onchange = () => JBR.setPrefs({ redact: $("redact").checked });
    $("submit").onclick = submit;

    // Meta yükleme ve mükerrer arama bağımsızdır; paralel çalıştırılır.
    // Mükerrer arama, profildeki proje anahtarıyla hemen başlar; kullanıcı
    // projeyi değiştirirse change handler'ı yeniden arar.
    await Promise.allSettled([loadJiraMeta(), loadDuplicates(profile.projectKey)]);
  } catch (e) {
    fatal("Rapor sayfası başlatılamadı: " + JBR.errMsg(e));
  }
})();
