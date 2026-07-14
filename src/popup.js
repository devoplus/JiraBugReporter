const statusEl = document.getElementById("status");
const btnRecStart = document.getElementById("recStart");
const btnRecStop = document.getElementById("recStop");
const btnReport = document.getElementById("report");
const cbCookies = document.getElementById("includeCookies");
const cbStorage = document.getElementById("includeStorage");
const noProfileEl = document.getElementById("noProfile");
const recentWrap = document.getElementById("recentWrap");
const recentList = document.getElementById("recentList");

const setStatus = (text, cls) => JBR.setStatus(statusEl, text, cls);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const savePrefs = () => JBR.setPrefs({ includeCookies: cbCookies.checked, includeStorage: cbStorage.checked });

function updateRecButtons(recording) {
  btnRecStart.disabled = recording;
  btnRecStop.disabled = !recording;
}

function renderRecent(items) {
  if (!items || !items.length) return;
  recentWrap.classList.remove("hidden");
  recentList.textContent = "";
  for (const it of items.slice(0, 5)) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = it.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = it.key;
    li.appendChild(a);
    const span = document.createElement("span");
    span.className = "muted";
    span.textContent = " — " + String(it.title || "").slice(0, 60);
    li.appendChild(span);
    recentList.appendChild(li);
  }
}

(async function init() {
  try {
    const state = await JBR.getState();
    cbCookies.checked = !!state.prefs.includeCookies;
    cbStorage.checked = state.prefs.includeStorage !== false;
    renderRecent(state.recentIssues);
    if (!state.profiles.length) {
      noProfileEl.classList.remove("hidden");
      btnReport.disabled = true;
    }
    const rs = await chrome.runtime.sendMessage({ type: "REC_STATUS" });
    updateRecButtons(!!(rs && rs.recordingTabId));
  } catch (e) {
    setStatus("Başlatma hatası: " + JBR.errMsg(e), "error");
  }
})();

document.getElementById("openOptions").onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

cbCookies.onchange = savePrefs;
cbStorage.onchange = savePrefs;

btnRecStart.onclick = async () => {
  btnRecStart.disabled = true;
  try {
    const tab = await getActiveTab();
    if (!tab || tab.id == null) throw new Error("Aktif sekme bulunamadı.");
    const res = await chrome.runtime.sendMessage({ type: "REC_START", tabId: tab.id });
    if (!res || !res.ok) throw new Error((res && res.error) || "Bilinmeyen hata");
    updateRecButtons(true);
    setStatus("Kayıt başladı. Hatayı yeniden üretin, ardından raporu hazırlayın.");
  } catch (e) {
    btnRecStart.disabled = false;
    setStatus("Kayıt başlatılamadı: " + JBR.errMsg(e), "error");
  }
};

btnRecStop.onclick = async () => {
  btnRecStop.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: "REC_STOP" });
    if (!res || !res.ok) throw new Error((res && res.error) || "Bilinmeyen hata");
    updateRecButtons(false);
    setStatus(res.hasRecording ? "Kayıt durdu; rapora eklenmek üzere hazır." : "Kayıt durdu (veri yok).");
  } catch (e) {
    updateRecButtons(false);
    setStatus("Kayıt durdurulamadı: " + JBR.errMsg(e), "error");
  }
};

btnReport.onclick = async () => {
  btnReport.disabled = true;
  setStatus("Bilgiler toplanıyor...");
  try {
    const tab = await getActiveTab();
    if (!tab || tab.id == null) throw new Error("Aktif sekme bulunamadı.");
    await savePrefs();
    const res = await chrome.runtime.sendMessage({
      type: "PREPARE_REPORT",
      tab: { id: tab.id, url: tab.url, title: tab.title, windowId: tab.windowId },
      options: {
        includeCookies: cbCookies.checked,
        includeStorage: cbStorage.checked
      }
    });
    if (!res || !res.ok) throw new Error((res && res.error) || "Bilinmeyen hata");
    window.close();
  } catch (e) {
    setStatus("Hata: " + JBR.errMsg(e), "error");
    btnReport.disabled = false;
  }
};
