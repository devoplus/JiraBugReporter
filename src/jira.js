// Jira Cloud REST API istemcisi (options ve report sayfalarında kullanılır).
// shared.js'in (JBR) bu dosyadan önce yüklenmesi gerekir.
const Jira = (() => {
  const TIMEOUT_MS = 30000;

  const normalizeBaseUrl = JBR.normalizeBaseUrl;

  // UTF-8 güvenli Basic auth (btoa tek başına Latin-1 dışı karakterlerde hata verir)
  function authHeader(email, token) {
    const bytes = new TextEncoder().encode(`${email}:${token}`);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return "Basic " + btoa(bin);
  }

  async function jiraFetch(profile, path, opts = {}) {
    const base = normalizeBaseUrl(profile.baseUrl);
    if (!JBR.isValidJiraBase(base)) throw new Error("Jira adresi https:// ile başlamalıdır.");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || TIMEOUT_MS);
    let res;
    try {
      res = await fetch(base + path, {
        method: opts.method || "GET",
        headers: {
          "Authorization": authHeader(profile.email, profile.token),
          "Accept": "application/json",
          ...(opts.json ? { "Content-Type": "application/json" } : {}),
          ...(opts.headers || {})
        },
        body: opts.json ? JSON.stringify(opts.json) : (opts.body || undefined),
        signal: ctrl.signal
      });
    } catch (e) {
      throw new Error(e && e.name === "AbortError"
        ? "Jira isteği zaman aşımına uğradı."
        : "Jira'ya bağlanılamadı: " + JBR.errMsg(e));
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = [...(j.errorMessages || []), ...Object.entries(j.errors || {}).map(([k, v]) => `${k}: ${v}`)].join(" | ");
      } catch (e) {}
      const known = {
        401: "Kimlik doğrulama başarısız; e-posta ve API belirtecini kontrol edin.",
        403: "Bu işlem için yetkiniz yok.",
        404: "Kaynak bulunamadı; Jira adresini ve proje anahtarını kontrol edin."
      };
      throw new Error(`${known[res.status] || "Jira hatası."} [HTTP ${res.status}]${detail ? " " + detail.slice(0, 300) : ""}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  const myself = (p) => jiraFetch(p, "/rest/api/3/myself");

  const listProjects = (p) =>
    jiraFetch(p, "/rest/api/3/project/search?maxResults=100&orderBy=key").then(r => r.values || []);

  const listIssueTypes = (p, projectKey) =>
    jiraFetch(p, `/rest/api/3/project/${encodeURIComponent(projectKey)}`)
      .then(r => (r.issueTypes || []).filter(t => !t.subtask));

  const listPriorities = (p) =>
    jiraFetch(p, "/rest/api/3/priority").then(r => Array.isArray(r) ? r : (r.values || []));

  function escapeJql(s) {
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Aynı URL'yi anan açık biletleri arar (mükerrer bilet uyarısı için, best-effort).
  async function searchSimilar(p, projectKey, pageUrl) {
    if (!projectKey || !pageUrl) return [];
    const jql = `project = "${escapeJql(projectKey)}" AND statusCategory != Done AND text ~ "${escapeJql(String(pageUrl).slice(0, 150))}" ORDER BY created DESC`;
    const r = await jiraFetch(p, `/rest/api/3/search/jql?maxResults=5&fields=${encodeURIComponent("summary,status,created")}&jql=${encodeURIComponent(jql)}`);
    return r.issues || [];
  }

  // ---- ADF yardımcıları ----
  const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text: String(text) }] });
  const heading = (level, text) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  const bulletList = (items) => ({ type: "bulletList", content: items.map(t => ({ type: "listItem", content: [paragraph(t)] })) });
  const orderedList = (items) => ({ type: "orderedList", content: items.map(t => ({ type: "listItem", content: [paragraph(t)] })) });
  const codeBlock = (language, text) => ({ type: "codeBlock", attrs: { language }, content: [{ type: "text", text }] });

  function buildDescription({ userText, summaryItems, steps, previewJson, attachmentNames }) {
    const content = [];
    const free = String(userText || "").trim();
    if (free) {
      free.split(/\n{2,}/).forEach(par => content.push(paragraph(par.replace(/\n/g, " "))));
    }
    content.push(heading(3, "Otomatik Rapor"), bulletList(summaryItems));
    if (steps && steps.length) {
      content.push(heading(4, `Kullanıcı Adımları (son ${steps.length})`), orderedList(steps));
    }
    if (previewJson) {
      content.push(heading(4, "Özet JSON"), codeBlock("json", previewJson));
    }
    if (attachmentNames && attachmentNames.length) {
      content.push(paragraph(`Tam ayrıntılar için eklerdeki dosyalara bakınız: ${attachmentNames.join(", ")}.`));
    }
    return { version: 1, type: "doc", content };
  }

  async function createIssue(profile, { projectKey, issueType, summary, description, priorityId, labels }) {
    const fields = {
      project: { key: projectKey },
      issuetype: { name: issueType },
      summary: String(summary || "").slice(0, 254),
      description
    };
    if (priorityId) fields.priority = { id: priorityId };
    if (labels && labels.length) fields.labels = labels;
    return jiraFetch(profile, "/rest/api/3/issue", { method: "POST", json: { fields } });
  }

  async function uploadAttachments(profile, issueKey, files) {
    const form = new FormData();
    for (const f of files) form.append("file", f.blob, f.name);
    return jiraFetch(profile, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`, {
      method: "POST",
      body: form,
      headers: { "X-Atlassian-Token": "no-check" }
    });
  }

  const browseUrl = (profile, key) => `${normalizeBaseUrl(profile.baseUrl)}/browse/${key}`;

  return {
    normalizeBaseUrl, myself, listProjects, listIssueTypes, listPriorities,
    searchSimilar, buildDescription, createIssue, uploadAttachments, browseUrl
  };
})();
