# i18n (Internationalization) Implementation

## Overview
This extension now supports multiple languages (Turkish and English) using Chrome's native i18n API.

## Structure

```
src/
├── _locales/
│   ├── tr/
│   │   └── messages.json    # Turkish translations (55 keys)
│   └── en/
│       └── messages.json    # English translations (55 keys)
├── i18n.js                  # i18n helper utilities
├── manifest.json            # Updated with i18n references
├── popup.html               # Updated with data-i18n attributes
├── popup.js                 # Updated to use i18n
├── options.html             # Updated with data-i18n attributes
├── options.js               # Updated to use i18n
└── background.js            # Updated for i18n messages
```

## Features

### 1. Automatic Language Detection
- Detects browser's language setting on first use
- Defaults to Turkish if browser language is not English
- Supports `tr` (Turkish) and `en` (English)

### 2. Manual Language Selection
- Dropdown selector in both popup and options pages
- Language preference saved in Chrome sync storage
- Persists across browser sessions
- Changes take effect immediately on reload

### 3. Comprehensive Translation Coverage
- UI labels and buttons
- Error messages
- Status messages
- Jira issue descriptions (ADF format)
- Placeholder texts
- Tooltips and titles

## Usage

### For End Users
1. Open the extension popup or options page
2. Select your preferred language from the "Language" / "Dil" dropdown
3. The interface will reload in the selected language

### For Developers

#### Adding New Translations
1. Add the key-value pair to both `_locales/tr/messages.json` and `_locales/en/messages.json`
2. Use the key in your code:

**In HTML:**
```html
<div data-i18n="yourKey">Default text</div>
```

**In JavaScript:**
```javascript
const text = i18n.getMessage("yourKey");
// or in background.js:
const text = msg("yourKey");
```

#### Available i18n Helper Functions

**In popup.js and options.js:**
```javascript
i18n.getMessage(key, substitutions)  // Get translated message
i18n.getPreferredLanguage()          // Get user's preferred language
i18n.setPreferredLanguage(lang)      // Set user's preferred language
i18n.translatePage()                 // Translate all elements with data-i18n attributes
```

**In background.js:**
```javascript
msg(key, substitutions)  // Shorthand for chrome.i18n.getMessage
```

#### HTML Attributes for i18n
- `data-i18n`: Translates element's textContent
- `data-i18n-placeholder`: Translates input's placeholder
- `data-i18n-title`: Translates element's title attribute
- `data-i18n-value`: Translates input's value attribute
- `data-i18n-html`: Translates element's innerHTML (use with caution)

## Translation Keys

### UI Elements
- `extName`, `extDescription` - Extension metadata
- `popupTitle`, `popupSubtitle` - Popup header
- `optionsTitle`, `optionsSubtitle` - Options header
- `labelCookies`, `labelStorage` - Toggle labels
- `btnCreateIssue`, `btnSave` - Action buttons

### Status Messages
- `statusCollecting` - "Collecting information..."
- `statusCreated` - "Created:"
- `statusError` - "Error:"
- `alertSaved` - "Saved"

### Error Messages
- `errorMissingSettings` - Settings not configured
- `errorAlreadyRecording` - Recording already in progress
- `errorCaptureTabFailed` - Tab capture failed
- `errorIssueCreateFailed` - Issue creation failed
- `errorAttachmentFailed` - Attachment upload failed

### Jira ADF Content
- `adfHeadingAutoReport` - "Automated Report" / "Otomatik Rapor"
- `adfSummaryUrl`, `adfSummaryTime`, etc. - Report field labels
- `adfIncluded`, `adfNotIncluded` - Status indicators
- `issueSummaryPrefix` - "[Bug]" prefix for issues

### Language Selection
- `labelLanguage` - "Language:" / "Dil:"
- `languageTurkish` - "Türkçe"
- `languageEnglish` - "English"

## Testing

Run the validation script to ensure i18n implementation is correct:
```bash
node test-i18n.js
```

This verifies:
- Manifest has i18n references
- Both locale directories exist
- Locale files have matching keys
- All required keys are present
- HTML files reference i18n.js
- HTML files have data-i18n attributes
- Background.js uses chrome.i18n API

## Browser Compatibility
- Chrome/Chromium: Full support
- Edge: Full support
- Other Chromium-based browsers: Full support

## Default Language
The default locale is set to Turkish (`tr`) in `manifest.json`, matching the original extension's language.

## Notes
- Language preference is synced across devices using Chrome sync storage
- When adding new UI text, always add it to both language files
- Keep translation keys consistent and descriptive
- The i18n system uses Chrome's native `chrome.i18n` API for best compatibility
