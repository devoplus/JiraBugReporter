const statusEl = document.getElementById("status");
const btnStart = document.getElementById("startRec");
const btnStop  = document.getElementById("stopRec");
const btnReport= document.getElementById("report");
const cbCookies= document.getElementById("includeCookies");
const cbStorage= document.getElementById("includeStorage");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
  return tab;
}

/*
btnStart.onclick = async () => {
  const tab = await getActiveTab();
  const ok = await chrome.runtime.sendMessage({ type:"REC_START", tabId: tab.id });
  if (ok?.ok) {
    btnStart.disabled = true; btnStop.disabled = false;
    statusEl.textContent = "Kayıt başladı...";
  } else {
    statusEl.textContent = "Kayıt başlatılamadı: " + (ok?.error || "bilinmiyor");
  }
};

btnStop.onclick = async () => {
  const res = await chrome.runtime.sendMessage({ type:"REC_STOP" });
  btnStart.disabled = false; btnStop.disabled = true;
  statusEl.textContent = res?.ok ? "Kayıt durdu." : ("Durdurulamadı: " + (res?.error || "bilinmiyor"));
};
*/

btnReport.onclick = async () => {
  statusEl.textContent = "Bilgiler toplanıyor...";
  const tab = await getActiveTab();

  const data = await chrome.tabs.sendMessage(tab.id, {
    type:"COLLECT_PAGE_DATA",
    options: { includeStorage: cbStorage.checked, includeDocCookie: cbCookies.checked }
  });

  let cookies = [];
  if (cbCookies.checked) {
    cookies = (await chrome.runtime.sendMessage({ type:"GET_COOKIES", url: tab.url }))?.cookies || [];
  }
  data.cookies = { pageDocumentCookie: data?.documentCookie || null, chromeCookies: cookies };

  const res = await chrome.runtime.sendMessage({ type:"CREATE_JIRA", tabId: tab.id, payload: data });
  if (res?.ok) {
    statusEl.innerHTML = `Oluşturuldu: <a href="${res.url}" target="_blank">#${res.key}</a>`;
  } else {
    statusEl.textContent = "Hata: " + (res?.error || "Bilinmiyor");
  }
};