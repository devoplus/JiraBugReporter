// i18n helper utilities
const i18n = {
  // Get translated message
  getMessage: (key, substitutions) => {
    return chrome.i18n.getMessage(key, substitutions) || key;
  },

  // Get current UI language
  getUILanguage: () => {
    return chrome.i18n.getUILanguage();
  },

  // Get user's preferred language from storage or browser default
  getPreferredLanguage: async () => {
    const stored = await chrome.storage.sync.get(['language']);
    if (stored.language) {
      return stored.language;
    }
    // Default to browser language (tr or en)
    const browserLang = chrome.i18n.getUILanguage();
    return browserLang.startsWith('tr') ? 'tr' : 'en';
  },

  // Set user's preferred language
  setPreferredLanguage: async (lang) => {
    await chrome.storage.sync.set({ language: lang });
  },

  // Translate all elements with data-i18n attribute
  translatePage: () => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = i18n.getMessage(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = i18n.getMessage(key);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = i18n.getMessage(key);
    });

    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.getAttribute('data-i18n-value');
      el.value = i18n.getMessage(key);
    });

    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const url = el.getAttribute('data-i18n-url');
      if (url) {
        el.innerHTML = i18n.getMessage(key, url);
      } else {
        el.innerHTML = i18n.getMessage(key);
      }
    });
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
}
