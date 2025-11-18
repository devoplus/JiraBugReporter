const statusEl = document.getElementById("status");
const btnStart = document.getElementById("startRec");
const btnStop  = document.getElementById("stopRec");
const btnReport= document.getElementById("report");
const cbCookies= document.getElementById("includeCookies");
const cbStorage= document.getElementById("includeStorage");
const languageSelect = document.getElementById("languageSelect");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({active:true, currentWindow:true});
  return tab;
}

// Initialize i18n
document.addEventListener('DOMContentLoaded', async () => {
  // Get and set current language
  const currentLang = await i18n.getPreferredLanguage();
  languageSelect.value = currentLang;
  
  // Translate the page
  i18n.translatePage();
});

// Language change handler
languageSelect.addEventListener('change', async (e) => {
  const newLang = e.target.value;
  await i18n.setPreferredLanguage(newLang);
  
  // Show a message indicating language change will take effect on reload
  // For now, we'll just reload the popup
  location.reload();
});

/*
btnStart.onclick = async () => {
  const tab = await getActiveTab();
  const ok = await chrome.runtime.sendMessage({ type:"REC_START", tabId: tab.id });
  if (ok?.ok) {
    btnStart.disabled = true; btnStop.disabled = false;
    statusEl.textContent = i18n.getMessage("statusCollecting");
  } else {
    statusEl.textContent = i18n.getMessage("statusError") + " " + (ok?.error || i18n.getMessage("statusUnknown"));
  }
};

btnStop.onclick = async () => {
  const res = await chrome.runtime.sendMessage({ type:"REC_STOP" });
  btnStart.disabled = false; btnStop.disabled = true;
  statusEl.textContent = res?.ok ? "Kayıt durdu." : (i18n.getMessage("statusError") + " " + (res?.error || i18n.getMessage("statusUnknown")));
};
*/

btnReport.onclick = async () => {
  statusEl.textContent = i18n.getMessage("statusCollecting");
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
    statusEl.innerHTML = `${i18n.getMessage("statusCreated")} <a href="${res.url}" target="_blank">#${res.key}</a>`;
  } else {
    statusEl.textContent = i18n.getMessage("statusError") + " " + (res?.error || i18n.getMessage("statusUnknown"));
  }
};
