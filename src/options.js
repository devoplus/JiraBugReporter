const $ = id => document.getElementById(id);

// Initialize i18n and load settings
(async function init(){
  // Translate the page
  i18n.translatePage();
  
  // Set API token hint with URL
  const apiTokenUrl = 'https://id.atlassian.com/manage-profile/security/api-tokens';
  const hintText = i18n.getMessage('apiTokenHint', apiTokenUrl);
  $('apiTokenHintText').textContent = hintText.replace(apiTokenUrl, '').trim();
  
  // Get and set current language
  const currentLang = await i18n.getPreferredLanguage();
  $('languageSelect').value = currentLang;
  
  // Load saved settings
  const s = await chrome.storage.sync.get(["baseUrl","email","token","projectKey","issueType"]);
  $("baseUrl").value = s.baseUrl || "";
  $("email").value = s.email || "";
  $("token").value = s.token || "";
  $("projectKey").value = s.projectKey || "";
  $("issueType").value = s.issueType || i18n.getMessage("defaultIssueType");
})();

// Language change handler
$('languageSelect').addEventListener('change', async (e) => {
  const newLang = e.target.value;
  await i18n.setPreferredLanguage(newLang);
  
  // Reload to apply new language
  location.reload();
});

// Save settings
$("save").onclick = async () => {
  await chrome.storage.sync.set({
    baseUrl: $("baseUrl").value.trim(),
    email: $("email").value.trim(),
    token: $("token").value,
    projectKey: $("projectKey").value.trim(),
    issueType: $("issueType").value.trim()
  });
  alert(i18n.getMessage("alertSaved"));
};
