// Uzantı sayfaları (popup, options, report, offscreen) ve service worker
// tarafından paylaşılan yardımcılar: profil deposu, maskeleme, IndexedDB.
const JBR = (() => {

  // ---- Genel yardımcılar ----
  function errMsg(e) {
    if (e && typeof e.message === "string" && e.message) return e.message;
    return String(e);
  }

  function setStatus(el, text, cls) {
    el.textContent = text || "";
    el.className = "status " + (cls || "muted");
  }

  function normalizeBaseUrl(raw) {
    return String(raw || "").trim().replace(/\/+$/, "");
  }

  function isValidJiraBase(base) {
    return /^https:\/\/[^\s/]+/i.test(base);
  }

  // ---- Profil / durum deposu (chrome.storage.local) ----
  async function getState() {
    const s = await chrome.storage.local.get(["profiles", "defaultProfileId", "prefs", "recentIssues"]);
    return {
      profiles: s.profiles || [],
      defaultProfileId: s.defaultProfileId || null,
      prefs: { includeCookies: false, includeStorage: true, redact: true, ...(s.prefs || {}) },
      recentIssues: s.recentIssues || []
    };
  }

  async function setPrefs(patch) {
    const { prefs = {} } = await chrome.storage.local.get("prefs");
    await chrome.storage.local.set({ prefs: { ...prefs, ...patch } });
  }

  function hostMatches(pattern, host) {
    pattern = String(pattern || "").trim().toLowerCase();
    host = String(host || "").toLowerCase();
    if (!pattern || !host) return false;
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return host === base || host.endsWith("." + base);
    }
    return host === pattern;
  }

  // Aktif sekme URL'sine göre profil seç: alan adı deseni eşleşen profil,
  // yoksa varsayılan profil, o da yoksa ilk profil.
  function pickProfile(state, url) {
    let host = "";
    try { host = new URL(url).hostname; } catch (e) {}
    if (host) {
      for (const p of state.profiles) {
        const domains = String(p.domains || "").split(",").map(d => d.trim()).filter(Boolean);
        if (domains.some(d => hostMatches(d, host))) return p;
      }
    }
    return state.profiles.find(p => p.id === state.defaultProfileId) || state.profiles[0] || null;
  }

  function newProfileId() {
    return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  // Eski tekil ayarları (storage.sync) profil modeline taşı. Sync'ten yalnızca
  // API belirteci silinir (artık cihazlar arası senkronize edilmemeli); diğer
  // alanlar bırakılır ki kullanıcının diğer cihazları da taşıma yapabilsin.
  async function migrateLegacySettings() {
    const local = await chrome.storage.local.get("profiles");
    if (local.profiles && local.profiles.length) return;
    const s = await chrome.storage.sync.get(["baseUrl", "email", "token", "projectKey", "issueType"]);
    if (!s.baseUrl && !s.email && !s.token) return;
    const profile = {
      id: newProfileId(),
      name: "Varsayılan",
      baseUrl: normalizeBaseUrl(s.baseUrl),
      email: s.email || "",
      token: s.token || "",
      projectKey: s.projectKey || "",
      issueType: s.issueType || "Bug",
      domains: ""
    };
    await chrome.storage.local.set({ profiles: [profile], defaultProfileId: profile.id });
    await chrome.storage.sync.remove(["token"]);
  }

  async function addRecentIssue(entry) {
    const { recentIssues = [] } = await chrome.storage.local.get("recentIssues");
    recentIssues.unshift(entry);
    await chrome.storage.local.set({ recentIssues: recentIssues.slice(0, 10) });
  }

  // ---- Hassas veri maskeleme ----
  function redactText(input) {
    let s = String(input == null ? "" : input);
    // JWT
    s = s.replace(/eyJ[\w-]{10,}\.[\w-]{5,}\.[\w-]{5,}/g, m => m.slice(0, 10) + "…[JWT-MASKELENDİ]");
    // Authorization şemaları
    s = s.replace(/\b(Bearer|Basic)\s+[\w.~+/=-]{16,}/gi, (_m, k) => k + " [MASKELENDİ]");
    // Uzun hex (oturum kimlikleri, hash'ler)
    s = s.replace(/\b[a-f0-9]{32,}\b/gi, m => m.slice(0, 4) + "…[MASKELENDİ]");
    // Uzun base64/rastgele token görünümlü diziler
    s = s.replace(/[A-Za-z0-9+/_-]{48,}={0,2}/g, m => m.slice(0, 4) + "…[MASKELENDİ]");
    return s;
  }

  // Yükteki TÜM string yaprakları özyinelemeli maskeler; alan listesi tutmak
  // yerine genel yürüyüş yapılır ki content/injected tarafına eklenen yeni
  // alanlar (steps, errors, meta...) maskelemeden kaçamasın.
  function redactDeep(value) {
    if (typeof value === "string") return redactText(value);
    if (Array.isArray(value)) return value.map(redactDeep);
    if (value && typeof value === "object") {
      const out = {};
      for (const k of Object.keys(value)) out[k] = redactDeep(value[k]);
      return out;
    }
    return value;
  }

  function redactPayload(payload) {
    // redactDeep zaten her düzeyde yeni nesne üretir; ayrıca kopyalamaya gerek yok.
    const clone = redactDeep(payload);
    clone._redacted = true;
    return clone;
  }

  // ---- IndexedDB (ekran kaydı blob'u offscreen ↔ report sayfası arasında taşınır) ----
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("jbr-media", 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("blobs"); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbOp(mode, fn) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", mode);
      let result;
      const req = fn(tx.objectStore("blobs"));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  const idbSet = (key, val) => idbOp("readwrite", store => store.put(val, key));
  const idbGet = (key) => idbOp("readonly", store => store.get(key)).then(v => v || null);
  const idbDel = (key) => idbOp("readwrite", store => store.delete(key));

  // ---- Ekran kaydı yaşam döngüsü (TTL ve geçerlilik kuralları tek yerde) ----
  const RECORDING_TTL_MS = 30 * 60 * 1000;

  async function saveRecording(entry) {
    await idbSet("recording", entry);
  }

  // Geçerli (boş olmayan, bayatlamamış) kaydı döndürür; bayat kaydı siler.
  async function getRecording() {
    let entry = null;
    try { entry = await idbGet("recording"); } catch (e) { return null; }
    if (!entry || !entry.blob || !entry.blob.size) return null;
    if (entry.time && Date.now() - entry.time > RECORDING_TTL_MS) {
      try { await idbDel("recording"); } catch (e) {}
      return null;
    }
    return entry;
  }

  async function clearRecording() {
    try { await idbDel("recording"); } catch (e) {}
  }

  return {
    errMsg, setStatus, normalizeBaseUrl, isValidJiraBase,
    getState, setPrefs, pickProfile, newProfileId, migrateLegacySettings, addRecentIssue,
    redactText, redactPayload,
    idbSet, idbGet, idbDel,
    saveRecording, getRecording, clearRecording
  };
})();
