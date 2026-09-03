(function initPopupDashboard() {
  "use strict";

  function isChatGPTTab(tab) {
    if (!tab || typeof tab.url !== "string") {
      return false;
    }
    try {
      var url = new URL(tab.url);
      return url.protocol === "https:" &&
        (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com");
    } catch (error) {
      return false;
    }
  }

  function ensureActiveTabCatalog() {
    if (typeof chrome === "undefined" ||
        !chrome.tabs ||
        typeof chrome.tabs.query !== "function" ||
        typeof chrome.tabs.sendMessage !== "function") {
      return;
    }

    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function handleActiveTabs(tabs) {
        if (chrome.runtime && chrome.runtime.lastError) {
          return;
        }
        var tab = tabs && tabs[0];
        if (!isChatGPTTab(tab) || typeof tab.id !== "number") {
          return;
        }
        try {
          chrome.tabs.sendMessage(tab.id, { type: "usage.catalog.ensure" }, function ignoreEnsureResult() {
            // Reading lastError prevents an absent or outdated content script from surfacing
            // an unchecked error. Catalog assurance is optional and never blocks the popup.
            if (chrome.runtime && chrome.runtime.lastError) {
              return;
            }
          });
        } catch (error) {
          // The popup remains usable when the active tab has no message receiver.
        }
      });
    } catch (error) {
      // Missing tab access or a closing browser window must not block popup startup.
    }
  }

  function detectBrowserLanguage() {
    var language = "";
    try {
      language =
        window.navigator && (
          Array.isArray(window.navigator.languages) &&
            window.navigator.languages[0] ||
          window.navigator.language
        ) ||
        document.documentElement.lang ||
        "";
    } catch (error) {
      language = document.documentElement.lang || "";
    }
    return /^zh(?:[-_]|$)/i.test(String(language || "").trim())
      ? "zh"
      : "en";
  }

  function applyActivePageLanguage(dashboard) {
    if (
      !dashboard ||
      typeof dashboard.setDetectedLanguage !== "function" ||
      typeof chrome === "undefined" ||
      !chrome.tabs ||
      typeof chrome.tabs.query !== "function" ||
      typeof chrome.tabs.sendMessage !== "function"
    ) {
      return;
    }
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function handleActiveTabs(tabs) {
        if (chrome.runtime && chrome.runtime.lastError) {
          return;
        }
        var tab = tabs && tabs[0];
        if (!isChatGPTTab(tab) || typeof tab.id !== "number") {
          return;
        }
        try {
          chrome.tabs.sendMessage(tab.id, { type: "usage.language.get" }, function languageReady(response) {
            if (chrome.runtime && chrome.runtime.lastError) {
              return;
            }
            if (response && response.ok && response.language) {
              dashboard.setDetectedLanguage(response.language);
            }
          });
        } catch (error) {
          // Browser language remains the safe local fallback.
        }
      });
    } catch (error) {
      // Browser language remains the safe local fallback.
    }
  }

  var catalogEnsureStarted = false;
  function ensureUsageCatalogOnce() {
    if (catalogEnsureStarted) {
      return;
    }
    catalogEnsureStarted = true;
    ensureActiveTabCatalog();
  }

  var root = document.getElementById("dashboard-root");
  if (!root || !window.ChatGPTUsageDashboard) {
    return;
  }

  var dashboard = window.ChatGPTUsageDashboard.init(root, {
    surface: "popup",
    detectedLanguage: detectBrowserLanguage(),
    onLanguageChange: function syncPopupLanguage(language) {
      document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    },
    onUsageViewActivate: ensureUsageCatalogOnce
  });
  applyActivePageLanguage(dashboard);
  if (
    dashboard &&
    typeof dashboard.cancelPendingExportConversationList === "function" &&
    typeof window.addEventListener === "function"
  ) {
    window.addEventListener("pagehide", function cancelUnneededConversationIndex() {
      dashboard.cancelPendingExportConversationList();
    });
  }
})();
