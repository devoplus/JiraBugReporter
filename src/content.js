(function inject() {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injected.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();

const logs = { console: [], errors: [], network: [] };

window.addEventListener("message", (e) => {
  if (e.source !== window) return;               // sadece aynı pencere
  const d = e.data;
  if (!d || d.__jira !== true) return;           // bizim mesajımız mı
  if (d.type === "console") logs.console.push(d.detail);
  else if (d.type === "error") logs.errors.push(d.detail);
  else if (d.type === "network") logs.network.push(d.detail);
}, false);

function safeDumpStorage(stor) {
  const out = {};
  try {
    for (let i = 0; i < stor.length; i++) {
      const k = stor.key(i); const v = stor.getItem(k);
      out[k] = (v && v.length > 20000) ? (`__TRUNCATED__(${v.length})`) : v;
    }
  } catch(e) {}
  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "COLLECT_PAGE_DATA") {
    const { includeStorage = true, includeDocCookie = true } = msg.options || {};
    const meta = {
      url: location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      time: new Date().toISOString(),
      perf: performance.getEntriesByType('navigation').map(n => ({
        type: n.type, startTime: n.startTime, domComplete: n.domComplete, loadEventEnd: n.loadEventEnd
      }))
    };
    const resources = performance.getEntriesByType('resource').slice(-200).map(r => ({
      name: r.name, initiatorType: r.initiatorType, duration: r.duration, transferSize: r.transferSize
    }));

    const payload = { meta, logs, resources };
    if (includeStorage) {
      payload.storage = {
        localStorage: safeDumpStorage(localStorage),
        sessionStorage: safeDumpStorage(sessionStorage)
      };
    }
    if (includeDocCookie) {
      payload.documentCookie = document.cookie || null; // HttpOnly olmayanlar
    }
    sendResponse(payload);
  }
});
