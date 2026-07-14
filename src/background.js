// Service worker: rapor hazırlama (ekran görüntüsü + sayfa verisi + çerezler),
// offscreen belge üzerinden sekme kaydı ve eski ayarların taşınması.
importScripts("shared.js");

chrome.runtime.onInstalled.addListener(() => { JBR.migrateLegacySettings().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { JBR.migrateLegacySettings().catch(() => {}); });

// ---- Offscreen belge / sekme kaydı ----
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Sekme ekran kaydı için MediaRecorder çalıştırma"
    });
  }
}

async function startRecording(tabId) {
  const sess = await chrome.storage.session.get("recordingTabId");
  if (sess.recordingTabId) throw new Error("Zaten devam eden bir kayıt var.");
  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_REC_START", streamId, tabId });
  if (!res || !res.ok) {
    await chrome.offscreen.closeDocument().catch(() => {});
    throw new Error((res && res.error) || "Kayıt başlatılamadı.");
  }
  await chrome.storage.session.set({ recordingTabId: tabId });
}

async function stopRecording() {
  let hasData = false;
  if (await chrome.offscreen.hasDocument()) {
    try {
      const res = await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_REC_STOP" });
      hasData = !!(res && res.ok && res.hasData);
    } catch (e) {}
    await chrome.offscreen.closeDocument().catch(() => {});
  }
  await chrome.storage.session.remove("recordingTabId");
  return hasData;
}

// ---- Çerezler ----
async function getAllCookiesForUrl(url) {
  try {
    const list = await chrome.cookies.getAll({ url });
    return list.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate
    }));
  } catch (e) {
    return [];
  }
}

// ---- Rapor hazırlama: veri topla, storage.session'a koy, rapor sekmesini aç ----
async function prepareReport(tab, options) {
  // Devam eden kayıt varsa otomatik durdur; blob IndexedDB'de rapor sayfasını bekler.
  const sess = await chrome.storage.session.get("recordingTabId");
  if (sess.recordingTabId) await stopRecording();

  // Ekran görüntüsü rapor sekmesi açılmadan ÖNCE, hedef sekme görünürken alınmalı.
  let screenshot = null;
  try {
    screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch (e) {}

  // Sayfa verisini yalnızca üst çerçeveden iste (iframe'lerin yarışmasını önler).
  let pageData = null;
  try {
    pageData = await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_PAGE_DATA", options }, { frameId: 0 });
  } catch (e) {}
  if (!pageData) {
    // Stub yük: rapor sayfası collectFailed bayrağını görünür bir uyarıya çevirir.
    pageData = {
      collectFailed: true,
      meta: {
        url: tab.url || "", title: tab.title || "", userAgent: navigator.userAgent,
        viewport: null, time: new Date().toISOString(),
        note: "İçerik betiğine erişilemedi (kısıtlı sayfa veya uzantı kurulumundan önce açılmış sekme); yalnızca temel bilgiler toplandı."
      },
      logs: { console: [], errors: [], network: [] },
      resources: [], steps: []
    };
  }

  if (options && options.includeCookies) {
    pageData.cookies = {
      pageDocumentCookie: pageData.documentCookie || null,
      chromeCookies: await getAllCookiesForUrl(tab.url)
    };
  }
  delete pageData.documentCookie;

  const pendingReport = {
    payload: pageData,
    screenshot,
    tab: { id: tab.id, url: tab.url, title: tab.title },
    options: options || {},
    createdAt: new Date().toISOString()
  };
  // storage.session kotasına (~10MB) sığana kadar kademeli küçült:
  // 1) olduğu gibi, 2) ekran görüntüsüz, 3) storage dökümü ve log kuyrukları kırpılmış.
  const shrinkSteps = [
    () => {},
    () => {
      pendingReport.screenshot = null;
      appendNote(pendingReport, "Ekran görüntüsü boyut sınırı nedeniyle rapora eklenemedi.");
    },
    () => {
      const p = pendingReport.payload;
      delete p.storage;
      const logs = p.logs || {};
      ["console", "network"].forEach(k => { if (Array.isArray(logs[k])) logs[k] = logs[k].slice(-100); });
      if (Array.isArray(p.resources)) p.resources = p.resources.slice(-50);
      appendNote(pendingReport, "Depolama dökümü ve log kuyrukları boyut sınırı nedeniyle kırpıldı.");
    }
  ];
  let stored = false;
  for (const shrink of shrinkSteps) {
    shrink();
    try {
      await chrome.storage.session.set({ pendingReport });
      stored = true;
      break;
    } catch (e) {}
  }
  if (!stored) throw new Error("Rapor verisi boyut sınırına sığmadı; lütfen 'Depolama Özeti' seçeneğini kapatıp tekrar deneyin.");
  await chrome.tabs.create({ url: chrome.runtime.getURL("report.html") });
}

function appendNote(pendingReport, note) {
  const meta = pendingReport.payload.meta;
  meta.note = ((meta.note || "") + " " + note).trim();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.target === "offscreen") return; // offscreen belgesine yönelik mesajlar
  (async () => {
    try {
      if (msg?.type === "REC_START") {
        await startRecording(msg.tabId);
        sendResponse({ ok: true });
      } else if (msg?.type === "REC_STOP") {
        const hasRecording = await stopRecording();
        sendResponse({ ok: true, hasRecording });
      } else if (msg?.type === "REC_STATUS") {
        const s = await chrome.storage.session.get("recordingTabId");
        sendResponse({ ok: true, recordingTabId: s.recordingTabId || null });
      } else if (msg?.type === "PREPARE_REPORT") {
        await prepareReport(msg.tab, msg.options);
        sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: JBR.errMsg(e) });
    }
  })();
  return true;
});
