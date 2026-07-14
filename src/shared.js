// Uzantı sayfaları (popup, options, report, offscreen) ve service worker
// tarafından paylaşılan yardımcılar: profil deposu, maskeleme, IndexedDB.
const JBR = (() => {

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

  // Eski tekil ayarları (storage.sync) profil modeline taşı ve sync'ten sil;
  // API belirteci artık cihazlar arası senkronize edilmez.
  async function migrateLegacySettings() {
    const local = await chrome.storage.local.get("profiles");
    if (local.profiles && local.profiles.length) return;
    const s = await chrome.storage.sync.get(["baseUrl", "email", "token", "projectKey", "issueType"]);
    if (!s.baseUrl && !s.token) return;
    const profile = {
      id: newProfileId(),
      name: "Varsayılan",
      baseUrl: String(s.baseUrl || "").trim().replace(/\/+$/, ""),
      email: s.email || "",
      token: s.token || "",
      projectKey: s.projectKey || "",
      issueType: s.issueType || "Bug",
      domains: ""
    };
    await chrome.storage.local.set({ profiles: [profile], defaultProfileId: profile.id });
    await chrome.storage.sync.remove(["baseUrl", "email", "token", "projectKey", "issueType"]);
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

  // Rapor yükündeki token benzeri değerleri maskeler (kopya üzerinde çalışır).
  function redactPayload(payload) {
    const clone = JSON.parse(JSON.stringify(payload));
    const redactMap = obj => { if (obj) for (const k of Object.keys(obj)) obj[k] = redactText(obj[k]); };
    if (clone.storage) {
      redactMap(clone.storage.localStorage);
      redactMap(clone.storage.sessionStorage);
    }
    if (clone.cookies) {
      if (clone.cookies.pageDocumentCookie) clone.cookies.pageDocumentCookie = redactText(clone.cookies.pageDocumentCookie);
      (clone.cookies.chromeCookies || []).forEach(c => { c.value = redactText(c.value); });
    }
    const logs = clone.logs || {};
    (logs.network || []).forEach(n => { if (n.url) n.url = redactText(n.url); });
    (logs.console || []).forEach(c => {
      if (Array.isArray(c.args)) c.args = c.args.map(a => typeof a === "string" ? redactText(a) : a);
    });
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

  async function idbSet(key, val) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(val, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", "readonly");
      const req = tx.objectStore("blobs").get(key);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async function idbDel(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  return {
    getState, pickProfile, newProfileId, migrateLegacySettings, addRecentIssue,
    redactText, redactPayload,
    idbSet, idbGet, idbDel
  };
})();
