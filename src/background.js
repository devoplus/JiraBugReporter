let rec = { mediaRecorder: null, chunks: [], stream: null };

async function getSettings() {
  const s = await chrome.storage.sync.get(["baseUrl","email","token","projectKey","issueType"]);
  if (!s.baseUrl || !s.email || !s.token || !s.projectKey || !s.issueType) {
    throw new Error("Ayarlar eksik. Lütfen ayarlar sayfası üzerinden Jira bilgilerinizi doldurun.");
  }
  const auth = "Basic " + btoa(`${s.email}:${s.token}`);
  return { ...s, auth };
}

async function capturePng(tabId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {format:"png"});
  const res = await fetch(dataUrl);
  return await res.blob(); // image/png
}

async function recStart(tabId) {
  if (rec.mediaRecorder) throw new Error("Zaten kayıt var.");
  rec.stream = await chrome.tabCapture.capture({
    audio: false,
    video: true,
    videoConstraints: { mandatory: { maxWidth: 1280, maxHeight: 720, maxFrameRate: 10 } }
  });
  if (!rec.stream) throw new Error("Sekme yakalanamadı.");
  rec.chunks = [];
  rec.mediaRecorder = new MediaRecorder(rec.stream, { mimeType: "video/webm;codecs=vp9" });
  rec.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  rec.mediaRecorder.start(1000);
}

async function recStop() {
  if (!rec.mediaRecorder) return null;
  await new Promise(res => {
    rec.mediaRecorder.onstop = res;
    try { rec.mediaRecorder.stop(); } catch {}
  });
  rec.stream.getTracks().forEach(t => t.stop());
  const blob = new Blob(rec.chunks, { type: "video/webm" });
  rec.mediaRecorder = null; rec.stream = null; rec.chunks = [];
  return blob;
}

async function getAllCookiesForUrl(url) {
  try {
    const list = await chrome.cookies.getAll({ url });
    return list.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite, expirationDate: c.expirationDate
    }));
  } catch(e) {
    return [];
  }
}

async function createIssue(settings, payload) {
  const p = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
  const heading = (level, text) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }]
  });
  const bulletList = (items) => ({
    type: "bulletList",
    content: items.map(t => ({ type: "listItem", content: [p(t)] }))
  });
  const codeBlock = (language, text) => ({
    type: "codeBlock",
    attrs: { language },
    content: [{ type: "text", text }]
  });

  const url = payload.meta.url;
  const host = new URL(url).hostname;

  const summaryItems = [
    `URL: ${url}`,
    `Zaman: ${payload.meta.time}`,
    `UA: ${payload.meta.userAgent}`,
    `Viewport: ${payload.meta.viewport.w}x${payload.meta.viewport.h}`,
    `Hata sayısı: ${payload.logs.errors.length}`,
    `Console girdisi: ${payload.logs.console.length}`,
    `Network girdisi: ${payload.logs.network.length} (resources: ${payload.resources.length})`,
    `Cookies: ${payload.cookies ? "eklendi" : "yok"}`,
    `Storage: ${payload.storage ? "eklendi" : "yok"}`,
    `Ekran kaydı: ${payload._hasRecording ? "eklendi" : "yok"}`
  ];

  const previewJson = JSON.stringify(
    {
      meta: payload.meta,
      sampleErrors: payload.logs.errors.slice(0, 3),
      sampleConsole: payload.logs.console.slice(0, 5),
    },
    null, 2
  ).slice(0, 4000);

  const descriptionADF = {
    version: 1,
    type: "doc",
    content: [
      heading(3, "Otomatik Rapor"),
      bulletList(summaryItems),
      heading(4, "Özet JSON"),
      codeBlock("json", previewJson),
      p("Tam ayrıntılar için eklerdeki 'page-report.json' ve 'screenshot.png' dosyalarına bakınız.")
    ]
  };

  const body = {
    fields: {
      project: { key: settings.projectKey },
      issuetype: { name: settings.issueType },
      summary: `[Bug] ${payload.meta.title} @ ${host}`,
      description: descriptionADF
    }
  };

  const r = await fetch(`${settings.baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      "Authorization": settings.auth,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) throw new Error(`Issue create failed: ${r.status} ${await r.text()}`);
  return await r.json();
}


async function uploadAttachment(settings, issueIdOrKey, files) {
  const form = new FormData();
  for (const file of files) form.append("file", file.blob, file.name);

  const r = await fetch(`${settings.baseUrl}/rest/api/3/issue/${issueIdOrKey}/attachments`, {
    method: "POST",
    headers: {
      "Authorization": settings.auth,
      "X-Atlassian-Token": "no-check",
      "Accept": "application/json"
    },
    body: form
  });
  if (!r.ok) throw new Error(`Attachment failed: ${r.status} ${await r.text()}`);
  return await r.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "REC_START") {
        await recStart(msg.tabId);
        sendResponse({ ok: true }); return;
      }
      if (msg?.type === "REC_STOP") {
        const blob = await recStop();
        globalThis.__lastRecording = blob || null;
        sendResponse({ ok: true }); return;
      }
      if (msg?.type === "GET_COOKIES") {
        const cookies = await getAllCookiesForUrl(msg.url);
        sendResponse({ ok: true, cookies }); return;
      }
      if (msg?.type === "CREATE_JIRA") {
        const settings = await getSettings();

        const screenshot = await capturePng(msg.tabId);

        const files = [];
        const reportJson = new Blob([JSON.stringify(msg.payload, null, 2)], {type:"application/json"});
        files.push({ name:"page-report.json", blob: reportJson });
        files.push({ name:"screenshot.png",   blob: screenshot });

        if (globalThis.__lastRecording && globalThis.__lastRecording.size > 0) {
          msg.payload._hasRecording = true;
          files.push({ name:"tab-recording.webm", blob: globalThis.__lastRecording });
          globalThis.__lastRecording = null;
        }

        const issue = await createIssue(settings, msg.payload);
        await uploadAttachment(settings, issue.key, files);

        sendResponse({ ok: true, key: issue.key, url: `${settings.baseUrl}/browse/${issue.key}`});
        return;
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});