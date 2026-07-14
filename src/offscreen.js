// Offscreen belge: MV3 service worker'da tabCapture.capture/MediaRecorder
// bulunmadığı için sekme kaydı burada yapılır. Kayıt bittiğinde blob,
// rapor sayfasının okuyabilmesi için IndexedDB'ye yazılır.
let rec = null;

async function start(streamId) {
  if (rec) throw new Error("Zaten devam eden bir kayıt var.");
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
        maxWidth: 1280,
        maxHeight: 720,
        maxFrameRate: 10
      }
    }
  });
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const chunks = [];
  const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1500000 });
  mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.start(1000);
  rec = { mr, stream, chunks };
}

async function stop() {
  if (!rec) return 0;
  const { mr, stream, chunks } = rec;
  rec = null;
  if (mr.state !== "inactive") {
    await new Promise(resolve => {
      mr.onstop = resolve;
      mr.onerror = resolve;
      try { mr.stop(); } catch (e) { resolve(); }
    });
  }
  stream.getTracks().forEach(t => t.stop());
  const blob = new Blob(chunks, { type: "video/webm" });
  if (blob.size > 0) {
    await JBR.idbSet("recording", { blob, time: Date.now() });
  }
  return blob.size;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  (async () => {
    try {
      if (msg.type === "OFFSCREEN_REC_START") {
        await start(msg.streamId);
        sendResponse({ ok: true });
      } else if (msg.type === "OFFSCREEN_REC_STOP") {
        const size = await stop();
        sendResponse({ ok: true, hasData: size > 0 });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true;
});
