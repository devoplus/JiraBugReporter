// Sayfa dünyasında (world: MAIN) çalışır; console/hata/ağ olaylarını yakalayıp
// content script'e postMessage ile iletir.
(function () {
  const send = (type, detail) => {
    try { window.postMessage({ __jbr: true, type, detail }, "*"); } catch (e) {}
  };

  const MAX_STR = 2000;
  const MAX_DEPTH = 3;
  const MAX_KEYS = 20;

  function serialize(v, depth = 0, seen = new WeakSet()) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    const t = typeof v;
    if (t === "string") return v.length > MAX_STR ? v.slice(0, MAX_STR) + `…(${v.length} karakter)` : v;
    if (t === "number" || t === "boolean" || t === "bigint") return String(v);
    if (t === "function") return `[function ${v.name || "anonymous"}]`;
    if (t === "symbol") return v.toString();
    try {
      if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack || ""}`.slice(0, MAX_STR);
      if (typeof Node !== "undefined" && v instanceof Node) return `<${String(v.nodeName).toLowerCase()}>`;
      if (depth >= MAX_DEPTH) return Object.prototype.toString.call(v);
      if (seen.has(v)) return "[circular]";
      seen.add(v);
      if (Array.isArray(v)) {
        const arr = v.slice(0, MAX_KEYS).map(x => serialize(x, depth + 1, seen));
        if (v.length > MAX_KEYS) arr.push(`…(+${v.length - MAX_KEYS})`);
        return arr;
      }
      const out = {};
      let i = 0;
      for (const k of Object.keys(v)) {
        if (i++ >= MAX_KEYS) { out["…"] = "kırpıldı"; break; }
        out[k] = serialize(v[k], depth + 1, seen);
      }
      return out;
    } catch (e) {
      return "[serileştirilemedi]";
    }
  }

  // Konuşkan sayfalarda (animasyon karesi başına log vb.) serileştirme +
  // postMessage maliyetinin sayfayı yavaşlatmaması için saniyelik hız sınırı.
  const CONSOLE_LIMIT_PER_SEC = 30;
  let winStart = 0, winCount = 0, dropped = 0;
  function consoleBudgetOk() {
    const now = Date.now();
    if (now - winStart >= 1000) {
      if (dropped > 0) {
        send("console", { level: "info", args: [`[JiraBugReporter] ${dropped} console girdisi hız sınırı nedeniyle atlandı`], ts: now });
        dropped = 0;
      }
      winStart = now;
      winCount = 0;
    }
    if (winCount >= CONSOLE_LIMIT_PER_SEC) { dropped++; return false; }
    winCount++;
    return true;
  }

  ["log", "info", "warn", "error", "debug"].forEach(level => {
    const orig = console[level];
    console[level] = function (...args) {
      try {
        if (consoleBudgetOk()) send("console", { level, args: args.map(a => serialize(a)), ts: Date.now() });
      } catch (e) {}
      return orig.apply(this, args);
    };
  });

  window.addEventListener("error", e => {
    send("error", { msg: e.message, src: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack, ts: Date.now() });
  });
  window.addEventListener("unhandledrejection", e => {
    send("error", { msg: serialize(e.reason), kind: "unhandledrejection", ts: Date.now() });
  });

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    let url = "";
    try {
      if (typeof input === "string") url = input;
      else if (typeof Request !== "undefined" && input instanceof Request) url = input.url;
      else url = String(input); // URL nesnesi vb.
    } catch (e) {}
    const started = Date.now();
    try {
      const res = await origFetch.call(this, input, init);
      send("network", { type: "fetch", url, status: res.status, dur: Date.now() - started });
      return res;
    } catch (err) {
      send("network", { type: "fetch", url, error: String(err), dur: Date.now() - started });
      throw err;
    }
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try { this.__jbr = { method: String(method), url: String(url), started: 0 }; } catch (e) {}
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const info = this.__jbr; // open() patch'lenmeden oluşturulmuş XHR'larda bulunmayabilir
    if (info) {
      info.started = Date.now();
      this.addEventListener("loadend", () => {
        try {
          send("network", { type: "xhr", url: info.url, method: info.method, status: this.status, dur: Date.now() - info.started });
        } catch (e) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
