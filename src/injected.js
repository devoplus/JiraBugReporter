(function(){
  const send = (type, detail) => {
    try { window.postMessage({ __jira: true, type, detail }, "*"); } catch(e){}
  };

  // console.* patch
  ["log","info","warn","error"].forEach(level => {
    const orig = console[level];
    console[level] = function(...args){
      try { send("console", { level, args: args.map(a => String(a)), ts: Date.now() }); } catch(e){}
      return orig.apply(this, args);
    };
  });

  window.addEventListener("error", e => {
    send("error", { msg: e.message, src: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack, ts: Date.now() });
  });
  window.addEventListener("unhandledrejection", e => {
    send("error", { msg: String(e.reason), kind: "unhandledrejection", ts: Date.now() });
  });

  const origFetch = window.fetch;
  window.fetch = async function(input, init){
    const req = typeof input === "string" ? input : input.url;
    const started = Date.now();
    try {
      const res = await origFetch(input, init);
      send("network", { type:"fetch", url:req, status:res.status, dur: Date.now()-started });
      return res;
    } catch(err){
      send("network", { type:"fetch", url:req, error:String(err), dur: Date.now()-started });
      throw err;
    }
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__jira = { method, url, started: 0 };
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    this.__jira.started = Date.now();
    this.addEventListener('loadend', () => {
      try {
        send("network", {
          type:"xhr",
          url: this.__jira.url,
          method: this.__jira.method,
          status: this.status,
          dur: Date.now()-this.__jira.started
        });
      } catch(e){}
    });
    return origSend.apply(this, args);
  };
})();
