(function initDetector(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTUsageDetector = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function detectorFactory(root) {
  "use strict";

  var UNKNOWN_MODEL = "";
  var modelCatalog = root.ChatGPTModelCatalog;
  if (!modelCatalog && typeof require === "function") {
    try {
      modelCatalog = require("./model-catalog");
    } catch (_) {
      modelCatalog = null;
    }
  }

  var MAX_LABEL_LENGTH = 48;
  var MODEL_PATTERNS = [
    /\b(?:GPT|ChatGPT)[-\s]?(?:\d+(?:\.\d+)*|4o)(?:[-\s]?(?:sol|luna|chat|instant|thinking|fast|mini|nano|pro|turbo|preview|audio|realtime|transcribe|tts|codex|max))*\b/i,
    /\bo\d+(?:[-\s]?[a-z][a-z0-9-]*){0,2}\b/i,
    /\bchat[-\s]?latest\b/i
  ];
  var EXPLICIT_MODEL_CONTEXT_RE = /(?:当前模型|目前模型|模型|current model|selected model|active model)\s*[:：-]?\s*((?:GPT|ChatGPT|gpt)[A-Za-z0-9.\-\s]+|o\d+[A-Za-z0-9.\-\s]*|chat[-\s]?latest)/i;

  var MODEL_SELECTOR_HINTS = [
    '[data-testid="model-switcher-dropdown-button"]',
    '[data-testid*="model-switcher" i]',
    '[aria-label*="model" i]',
    '[data-model]',
    '[data-model-id]',
    '[data-testid*="model" i]',
    '[data-value*="gpt" i]',
    '[data-value*="o" i]',
    '[aria-selected="true"]',
    '[aria-current="true"]',
    'button[aria-haspopup="menu"]',
    '[role="button"][aria-haspopup="menu"]'
  ];

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function detectorLabelFromCatalogInfo(info) {
    if (!info || !info.label) {
      return "";
    }
    return info.label;
  }

  function detectorInfoFromCatalogInfo(info) {
    if (!info) {
      return null;
    }

    var result = Object.assign({}, info);
    result.label = detectorLabelFromCatalogInfo(info);
    if (modelCatalog && typeof modelCatalog.cloneParameters === "function") {
      result.parameters = modelCatalog.cloneParameters(info.parameters || {});
    }
    return result.label ? result : null;
  }

  function publicModelLabelFromVisibleText(text) {
    var clean = normalizeWhitespace(text)
      .replace(/^(?:current model|selected model|active model|model selector|model switcher|switch model|当前模型|目前模型|模型)\s*[:：-]?\s*/i, "")
      .replace(/\s+(?:model[-\s]?switcher(?:[-\s]?dropdown)?(?:[-\s]?button)?|dropdown[-\s]?button|menu[-\s]?button)\b.*$/i, "")
      .trim();
    if (!/^(?:(?:GPT|ChatGPT)[-\s]?(?:\d+(?:\.\d+)*|4o)|o\d+)(?:$|[-\s])/i.test(clean)) {
      return "";
    }
    clean = clean.replace(/^ChatGPT/i, "GPT").replace(/^gpt/i, "GPT");
    if (modelCatalog && typeof modelCatalog.sanitizePublicModelLabel === "function") {
      return modelCatalog.sanitizePublicModelLabel(clean);
    }
    return clean.slice(0, MAX_LABEL_LENGTH);
  }

  function canonicalizeModelName(rawLabel) {
    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      var catalogInfo = modelCatalog.resolveModelInfo(rawLabel);
      var detectorLabel = detectorLabelFromCatalogInfo(catalogInfo);
      if (detectorLabel) {
        return detectorLabel;
      }
    }

    var normalizedLabel = normalizeWhitespace(rawLabel);
    var label = normalizedLabel
      .replace(/[.,:;|()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!label) {
      return "";
    }

    if (/^(auto|instant)$/i.test(label)) {
      return "";
    }

    label = label.replace(/^gpt/i, "GPT");
    label = label.replace(/^GPT\s*[- ]?\s*/i, "GPT-");
    label = label.replace(/^o(\d+)/i, "o$1");
    label = label.replace(/\bo(\d+)\s+(mini|pro|high|medium|low)\b/i, "o$1-$2");
    label = label.replace(/\b(GPT-(?:\d+(?:\.\d+)*|4o))\s+(sol|luna|mini|nano|pro|thinking|fast|instant|high|medium|low)\b/i, function (_, base, suffix) {
      var cleanSuffix = suffix.toLowerCase() === "thinking" ? "Thinking" : suffix.toLowerCase();
      return base + " " + cleanSuffix;
    });
    label = label.replace(/\b(GPT-(?:\d+(?:\.\d+)*|4o))-(sol|luna|mini|nano|pro|thinking|fast|instant|high|medium|low)\b/i, function (_, base, suffix) {
      var cleanSuffix = suffix.toLowerCase() === "thinking" ? "Thinking" : suffix.toLowerCase();
      return base + " " + cleanSuffix;
    });

    return label.slice(0, MAX_LABEL_LENGTH);
  }

  function extractModelLabel(text) {
    var cleanText = normalizeWhitespace(text)
      .replace(/current model/gi, " ")
      .replace(/selected model/gi, " ")
      .replace(/model selector/gi, " ")
      .replace(/switch model/gi, " ");

    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      var catalogInfo = modelCatalog.resolveModelInfo(cleanText);
      var detectorLabel = detectorLabelFromCatalogInfo(catalogInfo);
      if (detectorLabel) {
        return detectorLabel;
      }
    }

    for (var i = 0; i < MODEL_PATTERNS.length; i += 1) {
      var match = cleanText.match(MODEL_PATTERNS[i]);
      if (match) {
        return canonicalizeModelName(match[0]);
      }
    }

    return "";
  }

  function resolveModelInfo(text) {
    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      var catalogInfo = modelCatalog.resolveModelInfo(text);
      if (catalogInfo) {
        return detectorInfoFromCatalogInfo(catalogInfo);
      }
    }

    // 目录没收录的型号(新模型/改了名)——之前这里把 extractModelLabel 的结果丢掉直接返回 null,
    // 导致这类提交永远识别不到、计不上数。改为:只要能从按钮文本里按型号模式抽出标签,就照此计数,
    // 以抽取到的标签同时作为 apiModel/chatgptModel,绝不再静默丢弃(用户:没统计到正确模型)。
    var extractedLabel = extractModelLabel(text);
    if (extractedLabel) {
      return {
        label: extractedLabel,
        apiModel: extractedLabel,
        chatgptModel: extractedLabel,
        parameters: {}
      };
    }
    return null;
  }

  function getAttributeText(element, name) {
    if (!element || typeof element.getAttribute !== "function") {
      return "";
    }

    return element.getAttribute(name) || "";
  }

  function getElementText(element) {
    if (!element) {
      return "";
    }

    var value = "";
    if (typeof element.value === "string") {
      value = element.value;
    }

    return normalizeWhitespace(
      [
        value,
        element.innerText || "",
        element.textContent || "",
        getAttributeText(element, "aria-label"),
        getAttributeText(element, "title"),
        getAttributeText(element, "data-testid"),
        getAttributeText(element, "data-model"),
        getAttributeText(element, "data-model-id"),
        getAttributeText(element, "data-value"),
        getAttributeText(element, "id"),
        getAttributeText(element, "href")
      ].join(" ")
    );
  }

  function modelInfoFromElement(element) {
    if (!element) {
      return null;
    }

    // Resolve each semantic source independently. Combining visible text with
    // data-testid/id values can turn UI implementation names such as
    // "model-switcher-dropdown-button" into a fake model suffix.
    var candidates = [
      getAttributeText(element, "data-model"),
      getAttributeText(element, "data-model-id"),
      getAttributeText(element, "data-value"),
      typeof element.value === "string" ? element.value : "",
      element.innerText || "",
      element.textContent || "",
      getAttributeText(element, "aria-label"),
      getAttributeText(element, "title")
    ];
    var seen = {};
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = normalizeWhitespace(candidates[i]);
      if (!candidate || seen[candidate]) {
        continue;
      }
      seen[candidate] = true;
      var info = resolveModelInfo(candidate);
      if (!info && i < 2 && modelCatalog && typeof modelCatalog.resolveRequestModelInfo === "function") {
        // data-model and data-model-id are explicit model-bearing fields, so
        // they may safely carry a future versioned family unknown to this build.
        info = modelCatalog.resolveRequestModelInfo(candidate);
      }
      if (info && info.label) {
        info.selectedText = candidate.slice(0, 160);
        info.publicModel = publicModelLabelFromVisibleText(candidate);
        return info;
      }
    }

    return null;
  }

  function getEditableText(element) {
    if (!element) {
      return "";
    }

    var value = "";
    if (typeof element.value === "string") {
      value = element.value;
    }

    return normalizeWhitespace(
      [value, element.innerText || "", element.textContent || ""]
        .join(" ")
        .replace(/[\u200b-\u200f\u2060]/g, "")
    );
  }

  function isVisible(element) {
    if (!element) {
      return false;
    }

    var style = typeof root.getComputedStyle === "function" ? root.getComputedStyle(element) : element.style;
    if (style) {
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
    }

    if (typeof element.getBoundingClientRect !== "function") {
      return true;
    }

    var rect = element.getBoundingClientRect();
    if (!rect) {
      return true;
    }

    var hasSize = rect.width > 0 && rect.height > 0;
    var hasPosition = rect.top !== 0 || rect.left !== 0 || rect.right !== 0 || rect.bottom !== 0;
    return hasSize || hasPosition;
  }

  function addUnique(list, seen, items) {
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (item && !seen.has(item)) {
        seen.add(item);
        list.push(item);
      }
    }
  }

  function queryAll(documentLike, selector) {
    if (!documentLike || typeof documentLike.querySelectorAll !== "function") {
      return [];
    }

    try {
      return Array.prototype.slice.call(documentLike.querySelectorAll(selector));
    } catch (_) {
      return [];
    }
  }

  function scoreModelCandidate(element, modelLabel, text) {
    var score = 0;
    var testId = getAttributeText(element, "data-testid");
    var ariaLabel = getAttributeText(element, "aria-label");
    var role = getAttributeText(element, "role");

    if (/model-switcher/i.test(testId)) score += 80;
    if (/model/i.test(ariaLabel) || /模型/.test(ariaLabel)) score += 45;
    if (getAttributeText(element, "data-model") || getAttributeText(element, "data-model-id")) score += 55;
    if (getAttributeText(element, "aria-selected") === "true" || getAttributeText(element, "aria-current") === "true") score += 35;
    if (/button/i.test(element.tagName || "") || role === "button") score += 20;
    if (/menu/i.test(getAttributeText(element, "aria-haspopup"))) score += 12;
    if (modelLabel !== "chat-latest") score += 10;
    if (text.length <= 64) score += 8;
    if (text.length > 120) score -= 35;

    if (typeof element.getBoundingClientRect === "function") {
      var rect = element.getBoundingClientRect();
      if (rect && rect.top >= 0 && rect.top <= 220) score += 20;
      if (rect && rect.left >= 0 && rect.left <= 700) score += 8;
    }

    return score;
  }

  function hasExplicitModelSemantics(element) {
    return /model-switcher/i.test(getAttributeText(element, "data-testid")) ||
      /(?:model|模型)/i.test(getAttributeText(element, "aria-label")) ||
      Boolean(getAttributeText(element, "data-model") || getAttributeText(element, "data-model-id"));
  }

  function isConversationNavigationCandidate(element) {
    if (!element) {
      return false;
    }
    var href = getAttributeText(element, "href");
    if (/\/(?:c|g\/[^/]+\/c)\//i.test(href)) {
      return true;
    }
    if (typeof element.closest !== "function") {
      return false;
    }
    try {
      return Boolean(element.closest('a[href*="/c/"],a[href*="/g/"][href*="/c/"],[data-message-author-role]'));
    } catch (_) {
      return false;
    }
  }

  function explicitModelInfoFromText(text) {
    var clean = normalizeWhitespace(text);
    if (!clean || !/(当前模型|目前模型|current model|selected model|active model)/i.test(clean)) {
      return null;
    }

    var match = clean.match(EXPLICIT_MODEL_CONTEXT_RE);
    if (!match) {
      return null;
    }

    var value = normalizeWhitespace(match[1])
      .replace(/[。！？，,;|].*$/, "")
      .slice(0, 80);
    var info = resolveModelInfo(value);
    return info && info.label && info.apiModel ? info : null;
  }

  function findExplicitModelDeclaration(documentLike) {
    var candidates = [];
    var seen = new Set();
    [
      '[data-message-author-role]',
      '[data-testid*="conversation" i]',
      '[data-testid*="message" i]',
      "main",
      "article",
      "p",
      "li",
      "div",
      "span"
    ].forEach(function query(selector) {
      addUnique(candidates, seen, queryAll(documentLike, selector));
    });

    for (var i = 0; i < Math.min(candidates.length, 600); i += 1) {
      var element = candidates[i];
      if (!isVisible(element)) {
        continue;
      }
      var tagName = String(element.tagName || "").toLowerCase();
      if ((isConversationNavigationCandidate(element) || tagName === "main" || tagName === "article") &&
          !hasExplicitModelSemantics(element)) {
        continue;
      }

      var declarationText = getEditableText(element);
      if (declarationText.length > 160) {
        continue;
      }
      var info = explicitModelInfoFromText(declarationText);
      if (info) {
        return info;
      }
    }

    return null;
  }

  function findCurrentModelInfo(documentLike) {
    var candidates = [];
    var seen = new Set();

    for (var i = 0; i < MODEL_SELECTOR_HINTS.length; i += 1) {
      addUnique(candidates, seen, queryAll(documentLike, MODEL_SELECTOR_HINTS[i]));
    }

    if (candidates.length === 0) {
      addUnique(candidates, seen, queryAll(documentLike, "button,[role='button'],[aria-haspopup='menu']"));
    }

    var best = null;
    for (var j = 0; j < candidates.length; j += 1) {
      var element = candidates[j];
      if (!isVisible(element)) {
        continue;
      }
      if (isConversationNavigationCandidate(element) && !hasExplicitModelSemantics(element)) {
        continue;
      }

      var text = getElementText(element);
      var modelInfo = modelInfoFromElement(element);
      if (!modelInfo || !modelInfo.label) {
        continue;
      }

      var score = scoreModelCandidate(element, modelInfo.label, text);
      if (!best || score > best.score) {
        best = { info: modelInfo, score: score };
      }
    }

    if (best) {
      return best.info;
    }

    // Do not guess from persisted "last/default model" values. They can lag
    // behind a model switch; the current request or current visible selector
    // is required for a reliable count.
    return findExplicitModelDeclaration(documentLike);
  }

  function findCurrentModel(documentLike) {
    var info = findCurrentModelInfo(documentLike);
    return info && info.label ? info.label : UNKNOWN_MODEL;
  }

  function toElement(target) {
    if (!target) {
      return null;
    }

    if (typeof target.closest === "function") {
      return target;
    }

    if (target.parentElement && typeof target.parentElement.closest === "function") {
      return target.parentElement;
    }

    if (target.parentNode && typeof target.parentNode.closest === "function") {
      return target.parentNode;
    }

    return null;
  }

  function closestElement(target, selector) {
    var element = toElement(target);
    if (!element) {
      return null;
    }

    if (typeof element.closest === "function") {
      try {
        return element.closest(selector);
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  function isDisabledControl(element) {
    if (!element) {
      return true;
    }

    return Boolean(
      element.disabled ||
      getAttributeText(element, "aria-disabled") === "true" ||
      getAttributeText(element, "data-disabled") === "true"
    );
  }

  function isSendButton(target) {
    var button = closestElement(target, "button,[role='button']");
    if (!button || isDisabledControl(button) || !isVisible(button)) {
      return false;
    }

    var text = getElementText(button);
    var type = getAttributeText(button, "type");
    var positive = /(send|submit|send-button|send_message|send prompt|composer-submit)/i.test(text) || type === "submit";
    var negative = /(stop|voice|microphone|dictate|upload|attach|regenerate|continue|copy|edit|cancel|tool|search)/i.test(text);

    return positive && !negative;
  }

  function isComposerElement(target) {
    var composer = closestElement(
      target,
      "#prompt-textarea,textarea,[contenteditable='true'],[role='textbox']"
    );

    if (!composer || isDisabledControl(composer) || !isVisible(composer)) {
      return false;
    }

    return true;
  }

  function findComposerElement(documentLike, preferredTarget) {
    if (isComposerElement(preferredTarget)) {
      return closestElement(
        preferredTarget,
        "#prompt-textarea,textarea,[contenteditable='true'],[role='textbox']"
      );
    }

    var selectors = [
      "#prompt-textarea",
      "textarea[placeholder]",
      "textarea",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true']",
      "[role='textbox']"
    ];

    var best = null;
    var bestScore = -1;
    for (var i = 0; i < selectors.length; i += 1) {
      var elements = queryAll(documentLike, selectors[i]);
      for (var j = 0; j < elements.length; j += 1) {
        var element = elements[j];
        if (!isVisible(element) || isDisabledControl(element)) {
          continue;
        }

        var text = getEditableText(element);
        var score = text ? text.length : 0;
        if (typeof element.getBoundingClientRect === "function") {
          var rect = element.getBoundingClientRect();
          if (rect && rect.top > 200) score += 20;
        }

        if (score > bestScore) {
          best = element;
          bestScore = score;
        }
      }
    }

    return best;
  }

  function getComposerText(documentLike, preferredTarget) {
    var composer = findComposerElement(documentLike, preferredTarget);
    return composer ? getEditableText(composer) : "";
  }

  function findEnabledSendButton(documentLike) {
    var controls = queryAll(documentLike, "button,[role='button']");
    for (var i = 0; i < controls.length; i += 1) {
      if (isSendButton(controls[i])) {
        return controls[i];
      }
    }

    return null;
  }

  return {
    UNKNOWN_MODEL: UNKNOWN_MODEL,
    canonicalizeModelName: canonicalizeModelName,
    extractModelLabel: extractModelLabel,
    findComposerElement: findComposerElement,
    findCurrentModel: findCurrentModel,
    findCurrentModelInfo: findCurrentModelInfo,
    findEnabledSendButton: findEnabledSendButton,
    getComposerText: getComposerText,
    getEditableText: getEditableText,
    getElementText: getElementText,
    isComposerElement: isComposerElement,
    isSendButton: isSendButton,
    isVisible: isVisible,
    resolveModelInfo: resolveModelInfo
  };
});
