// İzole dünyada çalışan köprü: injected.js'ten (MAIN world) gelen log mesajlarını
// sınırlı boyutlu tamponlarda biriktirir ve talep edildiğinde sayfa verisini toplar.
const CAPS = { console: 500, errors: 200, network: 500, steps: 50 };
const logs = { console: [], errors: [], network: [] };
const steps = [];

function push(arr, item, cap) {
  arr.push(item);
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

window.addEventListener("message", (e) => {
  if (e.source !== window) return;               // sadece aynı pencere
  const d = e.data;
  if (!d || d.__jbr !== true) return;            // bizim mesajımız mı
  if (d.type === "console") push(logs.console, d.detail, CAPS.console);
  else if (d.type === "error") push(logs.errors, d.detail, CAPS.errors);
  else if (d.type === "network") push(logs.network, d.detail, CAPS.network);
}, false);

// ---- Adım kaydedici (repro steps) — yalnızca üst çerçevede ----
function describeTarget(el) {
  try {
    if (!el || !(el instanceof Element)) return String((el && el.nodeName) || "?");
    let desc = el.tagName.toLowerCase();
    if (el.id) desc += `#${el.id}`;
    else if (el.classList && el.classList.length) desc += "." + [...el.classList].slice(0, 3).join(".");
    // Metin girdisi alanlarının değerini asla kaydetme; buton etiketleri güvenli.
    const tag = el.tagName.toLowerCase();
    const isTextField = (tag === "input" && !["button", "submit", "reset", "checkbox", "radio"].includes(el.type)) || tag === "textarea" || tag === "select";
    const label = isTextField
      ? (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.name || "")
      : ((el.innerText || el.value || el.getAttribute("aria-label") || "").trim());
    const short = String(label).trim().slice(0, 40);
    return short ? `${desc} ("${short}")` : desc;
  } catch (e) {
    return "?";
  }
}

function addStep(action, detail) {
  push(steps, { action, detail, url: location.href, ts: new Date().toISOString() }, CAPS.steps);
}

if (window === window.top) {
  window.addEventListener("click", e => { try { addStep("tıklama", describeTarget(e.target)); } catch (_) {} }, true);
  window.addEventListener("change", e => {
    try {
      const el = e.target;
      const tag = el && el.tagName ? el.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") {
        addStep("girdi", `${describeTarget(el)} — değer girildi (maskelendi)`);
      }
    } catch (_) {}
  }, true);
  window.addEventListener("submit", e => { try { addStep("form gönderimi", describeTarget(e.target)); } catch (_) {} }, true);
  window.addEventListener("popstate", () => { try { addStep("gezinme", location.href); } catch (_) {} });
  window.addEventListener("hashchange", () => { try { addStep("gezinme", location.href); } catch (_) {} });
}

function safeDumpStorage(stor) {
  const out = {};
  try {
    for (let i = 0; i < stor.length; i++) {
      const k = stor.key(i); const v = stor.getItem(k);
      out[k] = (v && v.length > 20000) ? (`__TRUNCATED__(${v.length})`) : v;
    }
  } catch (e) {}
  return out;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "COLLECT_PAGE_DATA") {
    const { includeStorage = true, includeDocCookie = false } = msg.options || {};
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

    const payload = { meta, logs, resources, steps };
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
