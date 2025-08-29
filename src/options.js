const $ = id => document.getElementById(id);
(async function init(){
  const s = await chrome.storage.sync.get(["baseUrl","email","token","projectKey","issueType"]);
  $("baseUrl").value = s.baseUrl || "";
  $("email").value = s.email || "";
  $("token").value = s.token || "";
  $("projectKey").value = s.projectKey || "";
  $("issueType").value = s.issueType || "Bug";
})();
$("save").onclick = async () => {
  await chrome.storage.sync.set({
    baseUrl: $("baseUrl").value.trim(),
    email: $("email").value.trim(),
    token: $("token").value,
    projectKey: $("projectKey").value.trim(),
    issueType: $("issueType").value.trim()
  });
  alert("Kaydedildi");
};