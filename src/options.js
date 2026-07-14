// Ayarlar: çoklu Jira profili yönetimi, doğrulama ve bağlantı testi.
const $ = (id) => document.getElementById(id);

let state = null;
let currentId = null;

const setStatus = (text, cls) => JBR.setStatus($("status"), text, cls);

function formProfile() {
  return {
    id: currentId || JBR.newProfileId(),
    name: $("name").value.trim() || "Adsız profil",
    domains: $("domains").value.trim(),
    baseUrl: JBR.normalizeBaseUrl($("baseUrl").value),
    email: $("email").value.trim(),
    token: $("token").value,
    projectKey: $("projectKey").value.trim().toUpperCase(),
    issueType: $("issueType").value.trim() || "Bug"
  };
}

function validate(p) {
  if (!JBR.isValidJiraBase(p.baseUrl)) return "Jira adresi https:// ile başlayan geçerli bir adres olmalıdır (ör. https://company.atlassian.net).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return "Geçerli bir e-posta adresi girin.";
  if (!p.token) return "API belirteci boş olamaz.";
  if (!/^[A-Z][A-Z0-9_]*$/.test(p.projectKey)) return "Proje anahtarı geçersiz görünüyor (ör. WEB, PROJ1).";
  if (!p.issueType) return "Issue türü boş olamaz.";
  return null;
}

function renderList() {
  const ul = $("profileList");
  ul.textContent = "";
  for (const p of state.profiles) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-item" + (p.id === currentId ? " active" : "");
    btn.textContent = p.name || p.baseUrl || "(adsız)";
    if (p.id === state.defaultProfileId) {
      const star = document.createElement("span");
      star.className = "muted";
      star.textContent = " (varsayılan)";
      btn.appendChild(star);
    }
    btn.onclick = () => { selectProfile(p.id); };
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function loadForm(p) {
  currentId = p ? p.id : null;
  $("name").value = p ? (p.name || "") : "";
  $("domains").value = p ? (p.domains || "") : "";
  $("baseUrl").value = p ? (p.baseUrl || "") : "";
  $("email").value = p ? (p.email || "") : "";
  $("token").value = p ? (p.token || "") : "";
  $("projectKey").value = p ? (p.projectKey || "") : "";
  $("issueType").value = p ? (p.issueType || "Bug") : "Bug";
  $("isDefault").checked = p ? p.id === state.defaultProfileId : state.profiles.length === 0;
  $("projectOptions").textContent = "";
  $("issueTypeOptions").textContent = "";
  setStatus("");
  renderList();
}

function selectProfile(id) {
  const p = state.profiles.find(x => x.id === id);
  if (p) loadForm(p);
}

async function persist() {
  await chrome.storage.local.set({
    profiles: state.profiles,
    defaultProfileId: state.defaultProfileId
  });
}

$("newProfile").onclick = () => loadForm(null);

$("save").onclick = async () => {
  try {
    const p = formProfile();
    const err = validate(p);
    if (err) { setStatus(err, "error"); return; }
    const idx = state.profiles.findIndex(x => x.id === p.id);
    if (idx >= 0) state.profiles[idx] = p;
    else state.profiles.push(p);
    if ($("isDefault").checked || state.profiles.length === 1) {
      state.defaultProfileId = p.id;
    } else if (state.defaultProfileId === p.id) {
      // İşaret kaldırıldı: varsayılanı BAŞKA bir profile devret; tek profil
      // varsa varsayılan kalmak zorunda (aksi hâlde işlem sessiz no-op olurdu).
      const other = state.profiles.find(x => x.id !== p.id);
      state.defaultProfileId = other ? other.id : p.id;
      if (!other) setStatus("Tek profil varken varsayılan işareti kaldırılamaz.", "error");
    }
    currentId = p.id;
    await persist();
    renderList();
    setStatus("Kaydedildi.", "success");
  } catch (e) {
    setStatus("Kaydedilemedi: " + JBR.errMsg(e), "error");
  }
};

$("delete").onclick = async () => {
  if (!currentId) { loadForm(null); return; }
  const p = state.profiles.find(x => x.id === currentId);
  if (!confirm(`"${(p && p.name) || "profil"}" silinsin mi?`)) return;
  state.profiles = state.profiles.filter(x => x.id !== currentId);
  if (state.defaultProfileId === currentId) {
    state.defaultProfileId = state.profiles[0] ? state.profiles[0].id : null;
  }
  await persist();
  loadForm(state.profiles[0] || null);
  setStatus("Profil silindi.", "success");
};

$("test").onclick = async () => {
  const btn = $("test");
  btn.disabled = true;
  setStatus("Bağlantı test ediliyor...");
  try {
    const p = formProfile();
    const err = validate(p);
    if (err) throw new Error(err);

    // Üç istek birbirinden bağımsızdır; paralel çalıştırılır.
    const [me, projects, types] = await Promise.all([
      Jira.myself(p),
      Jira.listProjects(p),
      p.projectKey ? Jira.listIssueTypes(p, p.projectKey).catch(() => []) : Promise.resolve([])
    ]);

    const dl = $("projectOptions");
    dl.textContent = "";
    for (const proj of projects) {
      const opt = document.createElement("option");
      opt.value = proj.key;
      opt.label = proj.name;
      dl.appendChild(opt);
    }
    const tdl = $("issueTypeOptions");
    tdl.textContent = "";
    types.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.name;
      tdl.appendChild(opt);
    });

    let msg = `Bağlantı başarılı (${me.displayName || me.emailAddress || p.email}). ${projects.length} proje bulundu.`;
    const known = projects.find(x => x.key === p.projectKey);
    if (p.projectKey && !known) {
      msg += ` Dikkat: "${p.projectKey}" anahtarlı bir proje görünmüyor.`;
      setStatus(msg, "error");
    } else if (types.length && !types.some(t => t.name === p.issueType)) {
      msg += ` Dikkat: "${p.issueType}" bu projede tanımlı değil. Kullanılabilir: ${types.map(t => t.name).join(", ")}.`;
      setStatus(msg, "error");
    } else {
      setStatus(msg, "success");
    }
  } catch (e) {
    setStatus("Test başarısız: " + JBR.errMsg(e), "error");
  } finally {
    btn.disabled = false;
  }
};

(async function init() {
  try {
    await JBR.migrateLegacySettings();
    state = await JBR.getState();
    loadForm(
      state.profiles.find(p => p.id === state.defaultProfileId) || state.profiles[0] || null
    );
  } catch (e) {
    setStatus("Ayarlar yüklenemedi: " + JBR.errMsg(e), "error");
  }
})();
