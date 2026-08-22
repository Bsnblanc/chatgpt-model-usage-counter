(function initContentScript() {
  "use strict";

  if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
    document.documentElement.setAttribute(
      "data-chatgpt-model-usage-content-entry",
      "detector:" + (window.ChatGPTUsageDetector ? "yes" : "no") + ";chrome:" + (typeof chrome !== "undefined" && chrome.runtime ? "yes" : "no")
    );
  }

  var detector = window.ChatGPTUsageDetector;
  var modelCatalog = window.ChatGPTModelCatalog;
  if (!detector || typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }

  if (window.__chatgptModelUsageCounterLoaded) {
    var existingHost = typeof document.getElementById === "function"
      ? document.getElementById("chatgpt-model-usage-counter-panel-host")
      : null;
    var startedAt = Number(window.__chatgptModelUsageCounterStartedAt) || 0;
    if (existingHost || (startedAt && Date.now() - startedAt < 3000)) {
      if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
        document.documentElement.setAttribute(
          "data-chatgpt-model-usage-content-skip",
          existingHost ? "already-loaded" : "initializing"
        );
      }
      return;
    }

    if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
      document.documentElement.setAttribute("data-chatgpt-model-usage-content-stale-flag", "recovered");
    }
  }
  window.__chatgptModelUsageCounterStartedAt = Date.now();
  if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
    document.documentElement.setAttribute("data-chatgpt-model-usage-content-stage", "loading");
  }

  if (window.__chatgptModelUsageCounterLoaded) {
    window.__chatgptModelUsageCounterLoaded = false;
  }

  if (window.__chatgptModelUsageCounterLoaded) {
    return;
  }
  window.__chatgptModelUsageCounterLoaded = true;
  if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
    document.documentElement.setAttribute("data-chatgpt-model-usage-content-loaded", "true");
    document.documentElement.setAttribute("data-chatgpt-model-usage-content-stage", "loaded");
  }

  var DEDUPE_WINDOW_MS = 2500;
  var MESSAGE_MATCH_WINDOW_MS = 60000;
  var COMPOSER_POLL_MS = 500;
  var MODEL_OBSERVATION_WAIT_MS = 12000;
  var FINAL_RESPONSE_MODEL_WAIT_MS = 1500;
  var SETTINGS_KEY = "chatgptModelUsageSettings.v1";
  var STATUS_KEY = "chatgptModelUsageOpenAIStatus.v1";
  var lastSubmission = null;
  var lastDirectSubmission = null;
  var lastComposerSnapshot = null;
  var lastObservedModelInfo = null;
  var runtimeModelCatalog = null;
  var runtimeModelCatalogPromise = null;
  var pendingSubmissions = [];
  var pendingSubmissionTimer = null;
  var pendingResponseObservations = [];
  var submissionSequence = 0;
  var seenUserMessages = new Set();
  var seenAssistantModelMessages = new Set();
  var pendingAssistantModelCandidate = null;
  var pendingAssistantModelTimer = null;
  var ensureUsagePanelMounted = null;

  function setDiagnostic(name, value) {
    if (!document.documentElement || typeof document.documentElement.setAttribute !== "function") {
      return;
    }
    document.documentElement.setAttribute("data-chatgpt-model-usage-" + name, String(value || ""));
  }

  // 扩展被重载/更新后,已打开页面里的旧内容脚本上下文会失效:继续调用 chrome.runtime.sendMessage /
  // chrome.storage 会抛 "Extension context invalidated"。下面用 try/catch 捕获首次抛错并置位此标志,
  // 之后不再尝试。(不预检 chrome.runtime.id——单测的 chrome mock 没有 id,会被误判成失效。)
  var extensionContextLost = false;

  // 启动时记下扩展 id。真实浏览器里扩展一旦被重载,旧页面里的 chrome.runtime.id 会变成 undefined。
  // 据此“主动”发现上下文失效——不必等用户下一次提交失败才发现,好尽早把入口标成“刷新”提示用户。
  // 启动时本来就没有 id 的环境(如单测 mock)不参与主动判定,避免误报(与上面注释同理)。
  var initialRuntimeId = (function readInitialRuntimeId() {
    try {
      return typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime.id : undefined;
    } catch (_) {
      return undefined;
    }
  })();

  function extensionContextSeemsLost() {
    if (!initialRuntimeId) {
      return false;
    }
    try {
      return !(typeof chrome !== "undefined" && chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return true;
    }
  }

  // 上下文失效后只处理一次:记录诊断 + 在面板入口提示用户刷新本页(刷新会注入新的内容脚本)。
  function handleExtensionContextInvalidated() {
    if (extensionContextLost) {
      return;
    }
    extensionContextLost = true;
    setDiagnostic("last-record-status", "error:context-invalidated");
    try {
      var toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
      if (toggle) {
        toggle.title = "扩展已更新,请刷新本页以继续统计";
        var label = toggle.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
        if (label) {
          label.textContent = "刷新";
        }
      }
    } catch (_) {
      // 忽略:提示是尽力而为,不能因此再抛错。
    }
  }

  function normalizePromptText(value) {
    return String(value || "")
      .replace(/[\u200b-\u200f\u2060]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sanitizeRuntimeModelCatalog(value) {
    if (!modelCatalog || typeof modelCatalog.sanitizeRuntimeModelCatalog !== "function") {
      return null;
    }
    return modelCatalog.sanitizeRuntimeModelCatalog(value);
  }

  function runtimeCatalogSnapshot(payload) {
    var source = payload && typeof payload === "object" ? payload : {};
    return sanitizeRuntimeModelCatalog({
      observedAt: new Date().toISOString(),
      models: source.models,
      versions: source.versions,
      categories: source.categories
    });
  }

  function publishRuntimeModelCatalog(catalog) {
    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    if (!catalog || !runtime || typeof runtime.sendMessage !== "function" || extensionContextLost) {
      return;
    }
    try {
      runtime.sendMessage({ type: "usage.catalog", catalog: catalog }, function ignoreCatalogResponse() {
        void runtime.lastError;
      });
    } catch (error) {
      if (/context invalidated|Extension context/i.test(String((error && error.message) || error || ""))) {
        handleExtensionContextInvalidated();
      }
    }
  }

  function refreshRuntimeModelCatalog() {
    if (runtimeModelCatalogPromise) {
      return runtimeModelCatalogPromise;
    }
    if (!modelCatalog || typeof modelCatalog.sanitizeRuntimeModelCatalog !== "function" || typeof fetch !== "function") {
      return Promise.resolve(null);
    }
    runtimeModelCatalogPromise = fetch("/backend-api/models?history_and_training_disabled=false", {
      credentials: "include",
      cache: "no-store"
    }).then(function parseCatalogResponse(response) {
      if (!response || !response.ok || typeof response.json !== "function") {
        throw new Error("model-catalog-http-" + (response && response.status));
      }
      return response.json();
    }).then(function rememberCatalog(payload) {
      var catalog = runtimeCatalogSnapshot(payload);
      if (!catalog) {
        throw new Error("model-catalog-empty");
      }
      runtimeModelCatalog = catalog;
      setDiagnostic("model-catalog-status", "ok");
      setDiagnostic("model-catalog-observed-at", catalog.observedAt || "");
      publishRuntimeModelCatalog(catalog);
      return catalog;
    }).catch(function catalogFailed(error) {
      setDiagnostic("model-catalog-status", "error:" + String((error && error.message) || error || "unknown").slice(0, 80));
      return null;
    }).then(function allowFutureRefresh(result) {
      runtimeModelCatalogPromise = null;
      return result;
    });
    return runtimeModelCatalogPromise;
  }

  function hashText(value) {
    var hash = 2166136261;
    var text = String(value || "");
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
  }

  function getElementText(element) {
    if (!element) {
      return "";
    }

    return normalizePromptText(element.innerText || element.textContent || "");
  }

  function getEventPath(event) {
    if (event && typeof event.composedPath === "function") {
      try {
        return event.composedPath();
      } catch (_) {
        return [];
      }
    }

    return event && event.target ? [event.target] : [];
  }

  function findSendButtonTarget(event) {
    if (detector.isSendButton(event.target)) {
      return event.target;
    }

    var path = getEventPath(event);
    for (var i = 0; i < path.length; i += 1) {
      if (detector.isSendButton(path[i])) {
        return path[i];
      }
    }

    var target = event && event.target ? event.target : null;
    if (!target) {
      return null;
    }

    var sendBtn = document.querySelector('button[data-testid="send-button"]');
    if (sendBtn && (sendBtn === target || sendBtn.contains(target))) {
      return sendBtn;
    }

    return null;
  }

  function findComposerTarget(event) {
    if (detector.isComposerElement(event.target)) {
      return event.target;
    }

    var path = getEventPath(event);
    for (var i = 0; i < path.length; i += 1) {
      if (detector.isComposerElement(path[i])) {
        return path[i];
      }
    }

    if (detector.isComposerElement(document.activeElement)) {
      return document.activeElement;
    }

    return detector.findComposerElement(document, event.target);
  }

  function isDuplicate(model, promptText, now) {
    var key = model + ":" + hashText(promptText);
    if (lastSubmission && lastSubmission.key === key && now - lastSubmission.time < DEDUPE_WINDOW_MS) {
      return true;
    }

    lastSubmission = { key: key, time: now };
    return false;
  }

  function hasResolvedModel(modelInfo) {
    return Boolean(
      modelInfo &&
        modelInfo.label &&
        modelInfo.apiModel &&
        modelInfo.parameters &&
        modelInfo.parameters.model
    );
  }

  function isRequestModelSource(source) {
    return /^(fetch-request|xhr-request|fetch-response|xhr-response|fetch-url|xhr-url|webRequest|message-dom)(?::|$)/i.test(String(source || ""));
  }

  function canonicalRequestModelSlug(value) {
    var clean = normalizePromptText(value).slice(0, 96);
    if (modelCatalog && typeof modelCatalog.canonicalizeChatGPTModeSlug === "function") {
      return modelCatalog.canonicalizeChatGPTModeSlug(clean);
    }
    return clean.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
  }

  function isActualRequestModelSlug(value) {
    var clean = canonicalRequestModelSlug(value);
    if (modelCatalog && typeof modelCatalog.isRequestModelSlug === "function") {
      return modelCatalog.isRequestModelSlug(clean);
    }
    if (modelCatalog && typeof modelCatalog.isModelSlug === "function" && modelCatalog.isModelSlug(clean)) {
      return true;
    }
    var normalized = clean.toLowerCase().replace(/_/g, "-");
    var key = clean.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      !/^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) &&
      !/^(?:gpt)?lastusedmodel$/.test(key) &&
      !/^(auto|default|none|null|undefined|chatgpt)$/i.test(clean) &&
      !isFeatureNamedRequestSlug(clean) &&
      (hasGenericRequestModelEvidence(normalized) ||
        (/(?=.*[a-z])(?=.*\d)(?=.*[-_.])^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+$/i.test(clean) &&
          !/^(?:model|reasoning|text|tools?|temperature|max|response|request|conversation|metadata|stream|protocol|transport|endpoint|session)(?:[-_.]|$)/i.test(clean)));
  }

  function isChatGPTRouteSlug(value) {
    var clean = canonicalRequestModelSlug(value);
    if (modelCatalog && typeof modelCatalog.isChatGPTRouteSlug === "function") {
      return modelCatalog.isChatGPTRouteSlug(clean);
    }
    return clean === "auto" || isActualRequestModelSlug(clean);
  }

  function hasKnownRequestModelPrefix(value) {
    if (/^image-\d+-image$/i.test(String(value || "").replace(/_/g, "-"))) {
      return false;
    }
    return /^(?:gpt|o\d|chat|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(String(value || ""));
  }

  function hasGenericRequestModelEvidence(value) {
    var slug = String(value || "").toLowerCase().replace(/_/g, "-");
    if (hasKnownRequestModelPrefix(slug)) {
      return true;
    }
    if (/(?:[-_.](?:thinking|instant|fast|auto|pro))$/i.test(slug) && /(?:^|[-_.])(?:\d{1,4}|latest|preview)(?:$|[-_.])/.test(slug)) {
      return true;
    }
    if (/(?:[-_.](?:latest|preview|realtime|audio|tts|transcribe))$/i.test(slug)) {
      return /(?:^|[-_.])(?:model|family|chat|assistant|response|openai|\d{1,4})(?:$|[-_.])/.test(slug);
    }
    return false;
  }

  function isFeatureNamedRequestSlug(value) {
    var slug = normalizePromptText(value).toLowerCase().replace(/_/g, "-");
    if (/^image-\d+-image$/i.test(slug)) {
      return true;
    }
    return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas)(?:$|[-_.])/.test(slug) &&
      !/^(?:gpt-image|dall-e|image-\d)/i.test(slug);
  }

  function modelModeFromSlug(value) {
    var match = String(value || "").match(/[-_.](thinking|instant|fast|auto|pro)$/i);
    return match ? match[1].toLowerCase() : "";
  }

  function normalizeUsageFeatures(features) {
    var seen = {};
    (Array.isArray(features) ? features : []).forEach(function copy(feature) {
      var clean = String(feature || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      var rawClean = clean;
      clean = clean.replace(/_v\d+$/, "");
      if (/^(agent|agent_mode|agentmode)$/.test(clean)) clean = "agent_mode";
      if (/^(deep_research|deepresearch|deep_search|deepsearch|research)$/.test(clean)) clean = "deep_research";
      if (/^(gpt_image|dalle|dall_e)$/.test(rawClean)) clean = "image_generation";
      if (/^(image|images|image_generation|imagegen)$/.test(clean)) clean = "image_generation";
      if (/^(web_search|websearch|search)$/.test(clean)) clean = "web_search";
      if (/^(realtime|real_time|realtime_mode|real_time_mode)$/.test(clean)) clean = "realtime";
      if (/^(audio|audiomode|audio_mode|voice|voicemode|voice_mode|advanced_voice|input_audio|output_audio|transcription|transcribe|tts|whisper)$/.test(clean)) clean = "audio";
      if (/^(canvas|canvases|canvas_mode|canvasmode)$/.test(clean)) clean = "canvas";
      if (/^(image_generation|deep_research|agent_mode|web_search|realtime|audio|canvas)$/.test(clean)) {
        seen[clean] = true;
      }
    });
    return Object.keys(seen).sort();
  }

  function mergeUsageFeatures(primaryFeatures, secondaryFeatures) {
    return normalizeUsageFeatures((Array.isArray(primaryFeatures) ? primaryFeatures : []).concat(Array.isArray(secondaryFeatures) ? secondaryFeatures : []));
  }

  function readControlAttribute(element, name) {
    if (!element || typeof element.getAttribute !== "function") {
      return "";
    }
    return normalizePromptText(element.getAttribute(name) || "");
  }

  function readSelectedToolControlText(element) {
    if (readControlAttribute(element, "data-testid") === "model-switcher-dropdown-button") {
      return "";
    }
    var attributes = [
      "aria-label",
      "title",
      "aria-pressed",
      "aria-selected",
      "role",
      "data-testid",
      "data-state",
      "data-selected"
    ].map(function read(name) {
      return readControlAttribute(element, name);
    });
    attributes.push(getElementText(element));
    attributes.push(readSelectedToolDescendantText(element));
    return normalizePromptText(attributes.filter(Boolean).join(" "));
  }

  function readSelectedToolDescendantText(element) {
    if (!element || typeof element.querySelectorAll !== "function") {
      return "";
    }

    var parts = [];
    var selectors = "[aria-label],[title],[data-testid],[aria-pressed],[aria-selected],[data-state],[data-selected]";
    try {
      Array.prototype.slice.call(element.querySelectorAll(selectors), 0, 16).forEach(function read(descendant) {
        [
          "aria-label",
          "title",
          "aria-pressed",
          "aria-selected",
          "role",
          "data-testid",
          "data-state",
          "data-selected"
        ].forEach(function pushAttribute(name) {
          var value = readControlAttribute(descendant, name);
          if (value) {
            parts.push(value);
          }
        });
        parts.push(getElementText(descendant));
      });
    } catch (_) {
      return "";
    }
    return normalizePromptText(parts.filter(Boolean).join(" "));
  }

  function hasSelectedToolState(element, text) {
    var ariaPressed = readControlAttribute(element, "aria-pressed").toLowerCase();
    var ariaSelected = readControlAttribute(element, "aria-selected").toLowerCase();
    var dataSelected = readControlAttribute(element, "data-selected").toLowerCase();
    var dataState = readControlAttribute(element, "data-state").toLowerCase();
    var lower = String(text || "").toLowerCase();
    return ariaPressed === "true" ||
      ariaSelected === "true" ||
      dataSelected === "true" ||
      /^(selected|active|checked|on|open)$/i.test(dataState) ||
      /\b(?:click|tap|press)\s+to\s+(?:remove|deselect|turn\s+off|disable)\b/i.test(lower) ||
      /\b(?:remove|deselect|selected|selected-tool|active-tool)\b/i.test(lower);
  }

  function hasStrongSelectedToolState(text) {
    var lower = String(text || "").toLowerCase();
    return /\b(?:click|tap|press)\s+to\s+(?:remove|deselect|turn\s+off|disable)\b/i.test(lower) ||
      /\b(?:selected-tool|active-tool)\b/i.test(lower);
  }

  function isElementVisible(element) {
    if (!element || element.disabled || element.hidden) {
      return false;
    }
    if (element.style && (element.style.display === "none" || element.style.visibility === "hidden")) {
      return false;
    }
    if (typeof element.getAttribute === "function" && element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (typeof element.getBoundingClientRect === "function") {
      try {
        var rect = element.getBoundingClientRect();
        if (rect && Number(rect.width) === 0 && Number(rect.height) === 0) {
          return false;
        }
      } catch (_) {
        return true;
      }
    }
    return true;
  }

  function rectFromElement(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return null;
    }
    try {
      var rect = element.getBoundingClientRect();
      return rect && typeof rect.top === "number" && typeof rect.bottom === "number" ? rect : null;
    } catch (_) {
      return null;
    }
  }

  function isComposerAdjacentControl(element, composer, text) {
    if (!composer) {
      return true;
    }
    var controlRect = rectFromElement(element);
    var composerRect = rectFromElement(composer);
    if (!controlRect || !composerRect) {
      return true;
    }
    var verticalGap = Math.max(0, composerRect.top - controlRect.bottom, controlRect.top - composerRect.bottom);
    var horizontalGap = Math.max(0, composerRect.left - controlRect.right, controlRect.left - composerRect.right);
    if (selectedToolFeatureFromText(text) && (hasStrongSelectedToolState(text) || hasSelectedToolState(element, text))) {
      return verticalGap <= 520;
    }
    return verticalGap <= 260 && horizontalGap <= 220;
  }

  // 从工具 mention pill 的结构化属性映射到功能 ID。当前 ChatGPT 把已启用的工具渲染成 composer
  // 输入框里的内联 pill:<span data-symbol="ecosystemMention" data-id="search"
  // data-system-hint-type="search" data-keyword="网页搜索">网页搜索</span>。用这些稳定属性识别,
  // 不会误命中侧边栏/工具菜单里同名但未启用的链接(那些没有这些 data-* 属性)。
  function mentionPillFeature(el) {
    if (!el || typeof el.getAttribute !== "function") {
      return "";
    }
    var hint = String(el.getAttribute("data-system-hint-type") || "").toLowerCase();
    var id = String(el.getAttribute("data-id") || "").toLowerCase();
    var keyword = String(el.getAttribute("data-keyword") || el.textContent || "");
    var key = hint + " " + id;
    if (/research|deep/.test(key) || /深度研究|深度搜索/.test(keyword)) { return "deep_research"; }
    if (/agent/.test(key) || /代理|智能体/.test(keyword)) { return "agent_mode"; }
    if (/(^|[^a-z])search([^a-z]|$)|web/.test(key) || /网页搜索|联网搜索|网络搜索/.test(keyword)) { return "web_search"; }
    if (/image|dall|imagegen/.test(key) || /创建图片|生成图片|图片生成|画图/.test(keyword)) { return "image_generation"; }
    if (/canvas/.test(key) || /画布/.test(keyword)) { return "canvas"; }
    if (/audio|voice/.test(key) || /语音|听写|朗读/.test(keyword)) { return "audio"; }
    return "";
  }

  function selectedToolFeatureFromText(text) {
    var lower = String(text || "").toLowerCase();
    if (/\b(?:web\s+search|web_search|web-search|search\s+the\s+web|internet\s+search|search\s+the\s+internet)\b/i.test(lower) || (/\bsearch\b/i.test(lower) && /(?:data-testid\s+(?:composer-)?(?:selected-)?tool-search|composer-tool-search|web|internet|click to remove|selected[-_\s]?tool|composer-selected-tool)/i.test(lower))) {
      return "web_search";
    }
    if (/\b(?:image|images|imagegen|image\s*gen|gpt[_\-\s]?image|dall[_\-\s]?e|create\s+(?:an\s+)?image|generate\s+(?:an\s+)?image|image\s+generation)\b/i.test(lower)) {
      return "image_generation";
    }
    if (/\b(?:deep\s+research|deep\s+search|research)\b/i.test(lower)) {
      return "deep_research";
    }
    if (/\b(?:agent\s+mode|agent)\b/i.test(lower)) {
      return "agent_mode";
    }
    if (/\b(?:real\s*-?\s*time|realtime)\b/i.test(lower)) {
      return "realtime";
    }
    if (/\b(?:audio|voice|dictation|input_audio|input\s+audio|output_audio|output\s+audio|tts|whisper|advanced_voice|advanced\s+voice)\b/i.test(lower)) {
      return "audio";
    }
    if (/\b(?:canvas|canvases)\b/i.test(lower)) {
      return "canvas";
    }
    return "";
  }

  function collectSelectedToolControls() {
    var selectors = [
      'button',
      'button[aria-label]',
      'button[title]',
      'button[aria-pressed]',
      'button[aria-selected]',
      'button[data-testid]',
      '[role="button"]',
      '[role="button"][aria-label]',
      '[role="button"][title]',
      '[role="button"][aria-pressed]',
      '[role="button"][aria-selected]',
      '[role="button"][data-testid]',
      '[aria-pressed="true"]',
      '[aria-selected="true"]',
      '[data-selected="true"]',
      '[data-state="selected"]',
      '[data-state="active"]',
      '[data-state="checked"]',
      '[data-state="on"]',
      '[data-state="open"]',
      '[aria-label*="remove" i]',
      '[title*="remove" i]',
      '[data-testid*="selected" i]',
      '[data-testid*="tool" i]'
    ];
    var controls = new Set();
    selectors.forEach(function query(selector) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function add(element) {
          controls.add(element);
        });
      } catch (_) {
        return;
      }
    });
    return controls;
  }

  function rememberSelectedToolDiagnostics(candidateCount, acceptedTexts, features) {
    setDiagnostic("selected-tool-candidates", String(candidateCount || 0));
    setDiagnostic("selected-tool-accepted", acceptedTexts.slice(0, 3).join(" | "));
    setDiagnostic("selected-tool-features", normalizeUsageFeatures(features).join(","));
  }

  function readComposerSelectedUsageFeatures(target) {
    var composer = detector.isComposerElement(target) ? target : detector.findComposerElement(document, target);
    var features = [];
    var candidateCount = 0;
    var acceptedTexts = [];
    collectSelectedToolControls().forEach(function inspect(control) {
      candidateCount += 1;
      if (!isElementVisible(control)) {
        return;
      }
      var text = readSelectedToolControlText(control);
      // 工具 chip 的文本很短(如 "Search"、"网页搜索, 点击移除")。侧边栏/对话列表等容器
      // (role=tabpanel/navigation/list…)会把整列对话标题拼成超长文本,里面的 "image"/"gpt"
      // 等词会被误判成功能。按文本长度 + 容器角色排除这类元素,避免误报。
      if (!text || text.length > 80) {
        return;
      }
      var controlRole = (control && typeof control.getAttribute === "function") ? String(control.getAttribute("role") || "").toLowerCase() : "";
      if (/^(?:tabpanel|tablist|navigation|list|listbox|menu|menubar|tree|grid|region|main|complementary|dialog|article|feed)$/.test(controlRole)) {
        return;
      }
      if (!isComposerAdjacentControl(control, composer, text)) {
        return;
      }
      if (!hasSelectedToolState(control, text)) {
        return;
      }
      var feature = selectedToolFeatureFromText(text);
      if (feature) {
        features.push(feature);
        acceptedTexts.push(text);
      }
    });
    // 精准识别 composer 输入框里已启用的工具 mention pill。只在 composer 输入框内部按结构化
    // data-* 属性匹配(data-symbol="ecosystemMention" / data-system-hint-type / data-inline-selection-pill),
    // 不扫描侧边栏与工具下拉菜单,避免把同名但未启用的工具误判为已启用。
    if (composer && typeof composer.querySelectorAll === "function") {
      var pillSelector = "[data-symbol='ecosystemMention'],[data-system-hint-type],[data-inline-selection-pill]";
      Array.prototype.forEach.call(composer.querySelectorAll(pillSelector), function pill(el) {
        var pillFeature = mentionPillFeature(el);
        if (pillFeature) {
          features.push(pillFeature);
          acceptedTexts.push(el.getAttribute("data-keyword") || el.getAttribute("data-system-hint-type") || el.getAttribute("data-id") || "");
        }
      });
    }
    rememberSelectedToolDiagnostics(candidateCount, acceptedTexts, features);
    return normalizeUsageFeatures(features);
  }

  function withSubmissionUsageFeatures(modelInfo, usageFeatures) {
    if (!hasResolvedModel(modelInfo)) {
      var onlyFeatures = normalizeUsageFeatures(usageFeatures);
      return onlyFeatures.length ? { usageFeatures: onlyFeatures } : modelInfo;
    }
    var copy = Object.assign({}, modelInfo);
    copy.usageFeatures = mergeUsageFeatures(modelInfo.usageFeatures, usageFeatures);
    return copy;
  }

  function sanitizeParameterKey(key) {
    return String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_.-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 64);
  }

  function sanitizeParameterValue(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 16).map(function sanitizeArrayItem(item) {
        if (typeof item === "boolean" || typeof item === "number") {
          return item;
        }
        return normalizePromptText(item).slice(0, 128);
      }).filter(function keepItem(item) {
        return item !== "";
      });
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value).slice(0, 240);
      } catch (_) {
        return "";
      }
    }
    return normalizePromptText(value).slice(0, 160);
  }

  function actualModelParameters(parameters, apiModel) {
    var clean = {};
    var source = parameters && typeof parameters === "object" ? parameters : {};
    function denied(part) {
      return /^(messages?|mapping|contents?|parts|inputs?|instructions?|attachments?|files?|file_data|image_url|metadata|variables|conversation|conversation_id|parent_message_id|timezone|history_and_training_disabled|force_paragen|paragen|system|developer|user|stream|stream_options|protocol|transport|connection|endpoint|path|url|headers|authorization|cookie|client_secret|access_token|token|session_id|request_id|event_id|supports_buffering|supported_encodings|system_hints|conversation_mode|model_mode|modelmode|model_observed_source|observed_source|source|label)$/i.test(part);
    }
    function nestedRoot(part) {
      return /^(reasoning|text|format|audio|prediction|prompt|response_format|tools|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/i.test(part);
    }
    function canonical(key) {
      var safeKey = sanitizeParameterKey(key);
      if (!safeKey || denied(safeKey)) return "";
      if (safeKey === "reasoning_effort") return "reasoning.effort";
      if (safeKey === "verbosity" || safeKey === "text_verbosity") return "text.verbosity";
      if (safeKey === "topp") return "top_p";
      if (safeKey === "topk") return "top_k";
      if (safeKey === "toolchoice") return "tool_choice";
      if (safeKey === "responseformat") return "response_format";
      if (safeKey === "prompt" || safeKey === "prompts") return "";
      if (safeKey.indexOf(".") >= 0) {
        var parts = safeKey.split(".");
        return nestedRoot(parts[0]) && !parts.some(denied) ? safeKey : "";
      }
      return /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel|temperature|top_p|top_k|top_logprobs|logprobs|logit_bias|frequency_penalty|presence_penalty|max_tokens|max_output_tokens|max_completion_tokens|max_response_output_tokens|max_tool_calls|seed|n|stop|tools|tool_choice|parallel_tool_calls|response_format|modalities|output_modalities|voice|speed|service_tier|store|truncation|prompt_cache_key|prompt_cache_retention|safety_identifier|include|reasoning|text|audio|prediction|input_audio_format|output_audio_format|input_audio_transcription|turn_detection|web_search_options|image_generation_options|size|quality|style|background|moderation|output_format|output_compression|format|encoding_format|dimensions|language|timestamp_granularities|best_of|suffix|echo)$/i.test(safeKey) ? safeKey : "";
    }

    Object.keys(source).some(function copy(key) {
      var safeKey = canonical(key);
      var value = sanitizeParameterValue(source[key]);
      if (!safeKey || value === "" || value == null) {
        return false;
      }
      if (/^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/.test(safeKey) && typeof value === "string" && !isChatGPTRouteSlug(value)) {
        return false;
      }
      if (/^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/.test(safeKey) && typeof value === "string") {
        value = canonicalRequestModelSlug(value);
      }
      clean[safeKey] = value;
      return Object.keys(clean).length >= 48;
    });

    if (!clean.model && apiModel) {
      clean.model = canonicalRequestModelSlug(apiModel);
    }

    return clean;
  }

  function resolveModelText(value, source, observedAt) {
    var clean = canonicalRequestModelSlug(value);
    if (isRequestModelSource(source) && isChatGPTRouteSlug(clean)) {
      var requestInfo = typeof detector.resolveModelInfo === "function" ? detector.resolveModelInfo(clean) : null;
      return {
        label: (requestInfo && requestInfo.label) || clean,
        apiModel: clean,
        mode: (requestInfo && requestInfo.mode) || modelModeFromSlug(clean),
        parameters: actualModelParameters({ model: clean }, clean),
        chatgptModel: clean,
        observedSource: source || "",
        observedAt: observedAt || Date.now()
      };
    }

    if (!value || typeof detector.resolveModelInfo !== "function") {
      return null;
    }

    var info = detector.resolveModelInfo(value);
    if (!hasResolvedModel(info)) {
      return null;
    }

    info.parameters = actualModelParameters({ model: info.apiModel }, info.apiModel);
    info.chatgptModel = normalizePromptText(value);
    info.observedSource = source || "";
    info.observedAt = observedAt || Date.now();
    return info;
  }

  function rememberObservedModel(value, source, observedAt, shouldFlush, observedParameters, observedFeatures) {
    if (!isRequestModelSource(source)) {
      return null;
    }
    var info = resolveModelText(value, source, observedAt);
    if (!info) {
      return null;
    }

    info.parameters = actualModelParameters(observedParameters, info.apiModel);
    if (observedParameters && observedParameters.model && isActualRequestModelSlug(observedParameters.model)) {
      info.chatgptModel = canonicalRequestModelSlug(observedParameters.model);
    }
    if (/^message-dom:model-slug/i.test(String(source || ""))) {
      info.responseModel = canonicalRequestModelSlug(value);
    }
    info.usageFeatures = normalizeUsageFeatures(observedFeatures);
    lastObservedModelInfo = info;
    if (shouldFlush !== false) {
      flushPendingSubmission();
    }
    return info;
  }

  function readDomModel() {
    var info =
      typeof detector.findCurrentModelInfo === "function"
        ? detector.findCurrentModelInfo(document)
        : null;

    if (hasResolvedModel(info)) {
      info.parameters = actualModelParameters({ model: info.apiModel }, info.apiModel);
      info.observedSource = info.observedSource || "message-dom:dom";
      info.chatgptModel = info.chatgptModel || info.apiModel;
      if (
        runtimeModelCatalog &&
        modelCatalog &&
        typeof modelCatalog.selectedPublicModelFromText === "function"
      ) {
        info.publicModel = modelCatalog.selectedPublicModelFromText(info.selectedText || "", runtimeModelCatalog) || info.publicModel || "";
      }
      info.selectedPublicModel = info.publicModel || "";
      info.selectedPublicModelSource = info.selectedPublicModel ? "selector-dom" : "";
      setDiagnostic("detected-model", info.label);
      setDiagnostic("detected-api-model", info.apiModel);
      setDiagnostic("detected-public-model", info.selectedPublicModel);
      setDiagnostic("detected-model-source", info.observedSource);
      return info;
    }

    return null;
  }

  function trustedDomModelInfo(info) {
    if (!hasResolvedModel(info)) {
      return null;
    }

    var copy = Object.assign({}, info);
    var source = String(copy.observedSource || "dom");
    copy.observedSource = /^message-dom(?::|$)/i.test(source) ? source : "message-dom:" + source.slice(0, 52);
    copy.parameters = actualModelParameters(copy.parameters || { model: copy.apiModel }, copy.apiModel);
    copy.usageFeatures = normalizeUsageFeatures(copy.usageFeatures);
    return copy;
  }

  function freshObservedModel(now, minObservedAt) {
    if (hasResolvedModel(lastObservedModelInfo)) {
      var observedAt = Number(lastObservedModelInfo.observedAt || 0);
      if (!minObservedAt || observedAt >= minObservedAt) {
        if (now - observedAt <= MESSAGE_MATCH_WINDOW_MS) {
          setDiagnostic("detected-model", lastObservedModelInfo.label);
          setDiagnostic("detected-api-model", lastObservedModelInfo.apiModel);
          setDiagnostic("detected-model-source", lastObservedModelInfo.observedSource || "page");
          return lastObservedModelInfo;
        }
      }
    }

    return null;
  }

  function conversationIdFromCurrentLocation() {
    var match = String(location && location.href || "").match(/\/c\/([^/?#]+)/i);
    return match ? match[1] : "";
  }

  function createSubmissionId(now, promptHash) {
    submissionSequence += 1;
    return [
      "usage",
      Number(now || Date.now()).toString(36),
      submissionSequence.toString(36),
      String(promptHash || "").slice(0, 12)
    ].join("-");
  }

  function removePendingResponseObservation(submissionId) {
    var id = String(submissionId || "");
    pendingResponseObservations = pendingResponseObservations.filter(function keep(item) {
      return item.submissionId !== id;
    });
  }

  function prunePendingResponseObservations(now) {
    var current = Number(now || Date.now());
    pendingResponseObservations = pendingResponseObservations.filter(function keep(item) {
      return current - Number(item.submittedAt || 0) <= 60 * 60 * 1000;
    });
  }

  function rememberPendingResponseObservation(submissionId, submittedAt, pageUrl) {
    if (!submissionId) {
      return;
    }
    removePendingResponseObservation(submissionId);
    prunePendingResponseObservations(submittedAt);
    pendingResponseObservations.push({
      submissionId: submissionId,
      submittedAt: Number(submittedAt || Date.now()),
      conversationId: conversationIdFromCurrentLocation(),
      pageUrl: String(pageUrl || location.href || "")
    });
  }

  function clearOlderPendingResponsesForConversation(submittedAt) {
    var conversationId = conversationIdFromCurrentLocation();
    pendingResponseObservations = pendingResponseObservations.filter(function keep(item) {
      return item.conversationId !== conversationId || Number(item.submittedAt || 0) > Number(submittedAt || 0);
    });
  }

  function sendResponseObservation(responseModel, observedSource, observedAt) {
    var model = canonicalRequestModelSlug(responseModel);
    if (!isActualRequestModelSlug(model)) {
      return false;
    }
    prunePendingResponseObservations(observedAt);
    var conversationId = conversationIdFromCurrentLocation();
    var matchIndex = -1;
    for (var index = pendingResponseObservations.length - 1; index >= 0; index -= 1) {
      if (!conversationId || pendingResponseObservations[index].conversationId === conversationId) {
        matchIndex = index;
        break;
      }
    }
    if (matchIndex < 0) {
      return false;
    }

    var pending = pendingResponseObservations.splice(matchIndex, 1)[0];
    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== "function" || extensionContextLost) {
      return false;
    }
    try {
      runtime.sendMessage({
        type: "usage.response",
        payload: {
          submissionId: pending.submissionId,
          conversationId: pending.conversationId,
          responseModel: model,
          runtimeModelCatalog: runtimeModelCatalog,
          pageUrl: pending.pageUrl || location.href,
          observedSource: String(observedSource || "message-dom:model-slug").slice(0, 64),
          observedAt: new Date(Number(observedAt || Date.now())).toISOString()
        }
      }, function responseObserved(response) {
        if (runtime.lastError || !response || !response.ok) {
          setDiagnostic("last-response-status", "error");
          return;
        }
        setDiagnostic("last-response-status", response.updated ? "updated" : "unchanged");
        setDiagnostic("last-response-model", model);
      });
    } catch (error) {
      if (/context invalidated|Extension context/i.test(String((error && error.message) || error || ""))) {
        handleExtensionContextInvalidated();
      }
      return false;
    }
    return true;
  }

  function sendUsage(source, promptText, modelInfo, now, pendingUsageFeatures, submissionId) {
    var resolved = hasResolvedModel(modelInfo);
    var model = resolved ? modelInfo.label : "";
    var apiModel = resolved ? modelInfo.apiModel : "";
    var chatgptModel = resolved ? modelInfo.chatgptModel || "" : "";
    var modelMode = resolved ? modelInfo.mode || "" : "";
    var modelParameters = resolved ? modelInfo.parameters : {};
    var publicModel = resolved ? modelInfo.selectedPublicModel || modelInfo.publicModel || "" : "";
    var selectedPublicModelSource = resolved
      ? modelInfo.selectedPublicModelSource || (publicModel ? "selector-dom" : "")
      : "";
    var requestModel = resolved ? modelInfo.requestModel || modelParameters.model || apiModel : "";
    var responseModel = resolved ? modelInfo.responseModel || "" : "";
    var observedSource = resolved ? modelInfo.observedSource || "page" : "pending-webRequest";
    var usageFeatures = resolved ? normalizeUsageFeatures(modelInfo.usageFeatures) : normalizeUsageFeatures(pendingUsageFeatures);
    var duplicateKey = model || "pending-webRequest";
    if (isDuplicate(duplicateKey, promptText, now)) {
      return false;
    }
    if (source !== "message-dom" && lastComposerSnapshot && lastComposerSnapshot.hash === hashText(promptText)) {
      lastComposerSnapshot = null;
    }
    if (source !== "message-dom") {
      lastDirectSubmission = { hash: hashText(promptText), time: now };
    }

    setDiagnostic("last-record-status", "sending");
    setDiagnostic("last-record-model", model);
    setDiagnostic("last-record-api-model", apiModel);
    setDiagnostic("last-record-chatgpt-model", chatgptModel);
    try {
      setDiagnostic("last-record-parameters", JSON.stringify(modelParameters || {}));
    } catch (_) {
      setDiagnostic("last-record-parameters", "");
    }
    setDiagnostic("last-record-source", source);

    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== "function") {
      setDiagnostic("last-record-status", "error:runtime-unavailable");
      return false;
    }
    if (extensionContextLost) {
      // 已知扩展上下文失效(扩展被重载/更新),不再尝试发送,避免重复抛错。
      return false;
    }
    if (responseModel) {
      clearOlderPendingResponsesForConversation(now);
    } else {
      rememberPendingResponseObservation(submissionId, now, location.href);
    }

    try {
    runtime.sendMessage(
      {
        type: "usage.increment",
        payload: {
          model: model,
          publicModel: publicModel,
          selectedPublicModel: publicModel,
          selectedPublicModelSource: selectedPublicModelSource,
          apiModel: apiModel,
          chatgptModel: chatgptModel,
          requestModel: requestModel,
          responseModel: responseModel,
          modelMode: modelMode,
          modelParameters: modelParameters,
          runtimeModelCatalog: runtimeModelCatalog,
          usageFeatures: usageFeatures,
          modelObservedSource: observedSource,
          submissionId: submissionId,
          source: source,
          pageUrl: location.href,
          pageTitle: document.title,
          submittedAt: new Date(now).toISOString(),
          promptHash: hashText(promptText),
          promptLength: promptText.length
        }
      },
      function recordResponse(response) {
        if (runtime.lastError) {
          removePendingResponseObservation(submissionId);
          setDiagnostic("last-record-status", "error:" + runtime.lastError.message);
          return;
        }
        if (!response || !response.ok) {
          removePendingResponseObservation(submissionId);
          setDiagnostic("last-record-status", "error");
          return;
        }

        if (!response.recorded && response.duplicate) {
          removePendingResponseObservation(submissionId);
          setDiagnostic("last-record-status", "duplicate");
          return;
        }

        if (!response.recorded) {
          removePendingResponseObservation(submissionId);
          setDiagnostic("last-record-status", "blocked:no-request-model");
          return;
        }

        var event = response.event || {};
        if (event.model) {
          setDiagnostic("last-record-model", event.model);
        }
        if (event.apiModel) {
          setDiagnostic("last-record-api-model", event.apiModel);
        }
        if (event.chatgptModel) {
          setDiagnostic("last-record-chatgpt-model", event.chatgptModel);
        }
        if (event.modelParameters) {
          try {
            setDiagnostic("last-record-parameters", JSON.stringify(event.modelParameters || {}));
          } catch (_) {
            setDiagnostic("last-record-parameters", "");
          }
        }
        setDiagnostic("last-record-status", "ok");
        setDiagnostic("last-record-total", response.stats && response.stats.totals ? response.stats.totals[event.model || model] || 0 : 0);

      }
    );
    } catch (sendError) {
      var sendErrorMessage = sendError && sendError.message ? sendError.message : "send-failed";
      removePendingResponseObservation(submissionId);
      setDiagnostic("last-record-status", "error:" + sendErrorMessage);
      if (/context invalidated|Extension context/i.test(sendErrorMessage)) {
        handleExtensionContextInvalidated();
      }
      return false;
    }

    return true;
  }

  function finishPendingSubmission() {
    if (!pendingSubmissions.length) {
      return false;
    }

    var items = pendingSubmissions.slice();
    pendingSubmissions = [];
    if (pendingSubmissionTimer) {
      clearTimeout(pendingSubmissionTimer);
      pendingSubmissionTimer = null;
    }

    items.forEach(function flushPendingItem(item) {
      var observed = freshObservedModel(Date.now(), item.time - 250);
      var modelInfo = hasResolvedModel(item.domModelInfo) ? Object.assign({}, item.domModelInfo) : null;
      if (hasResolvedModel(observed)) {
        if (!modelInfo) {
          modelInfo = Object.assign({}, observed);
        } else {
          modelInfo.apiModel = observed.apiModel || modelInfo.apiModel;
          modelInfo.chatgptModel = observed.chatgptModel || modelInfo.chatgptModel;
          modelInfo.mode = observed.mode || modelInfo.mode;
          modelInfo.parameters = actualModelParameters(observed.parameters, observed.apiModel);
          modelInfo.observedSource = observed.observedSource || modelInfo.observedSource;
        }
        if (observed.responseModel) {
          modelInfo.responseModel = observed.responseModel;
        }
      }
      modelInfo = withSubmissionUsageFeatures(modelInfo, item.usageFeatures);
      sendUsage(item.source, item.promptText, modelInfo, item.time, item.usageFeatures, item.submissionId);
    });
    return true;
  }

  function flushPendingSubmission() {
    finishPendingSubmission();
  }

  function schedulePendingSubmissionFlush() {
    var now = Date.now();
    if (freshObservedModel(now, now - 250)) {
      finishPendingSubmission();
      return;
    }

    if (typeof setTimeout !== "function") {
      finishPendingSubmission();
      return;
    }

    if (pendingSubmissionTimer) {
      clearTimeout(pendingSubmissionTimer);
    }
    pendingSubmissionTimer = setTimeout(finishPendingSubmission, MODEL_OBSERVATION_WAIT_MS);
  }

  function queueSubmission(source, promptText, domModelInfo, now, usageFeatures) {
    var hash = hashText(promptText);
    if (source === "message-dom" && lastDirectSubmission && lastDirectSubmission.hash === hash && now - lastDirectSubmission.time < MESSAGE_MATCH_WINDOW_MS) {
      return;
    }
    for (var i = 0; i < pendingSubmissions.length; i += 1) {
      var pending = pendingSubmissions[i];
      if (pending.hash !== hash) {
        continue;
      }
      var elapsed = Math.abs(now - pending.time);
      var mirrorsSameSubmission = source === "message-dom" || pending.source === "message-dom";
      // Pointer/click/Enter duplicates arrive almost together. A rendered
      // user-message observation may arrive later, but still mirrors the same
      // submission. Allow an intentional repeat of the same prompt once it is
      // outside the short direct-event dedupe window.
      if (elapsed < DEDUPE_WINDOW_MS || (mirrorsSameSubmission && elapsed < MESSAGE_MATCH_WINDOW_MS)) {
        return;
      }
    }

    pendingSubmissions.push({
      submissionId: createSubmissionId(now, hash),
      source: source,
      promptText: promptText,
      domModelInfo: hasResolvedModel(domModelInfo) ? domModelInfo : null,
      usageFeatures: normalizeUsageFeatures(usageFeatures),
      time: now,
      hash: hash
    });
    schedulePendingSubmissionFlush();
  }

  function recordUsage(source, target, promptTextOverride) {
    var promptText = normalizePromptText(promptTextOverride || detector.getComposerText(document, target));
    if (!promptText) {
      return;
    }

    var now = Date.now();
    queueSubmission(source, promptText, readDomModel(), now, readComposerSelectedUsageFeatures(target));
  }

  function refreshComposerSnapshot() {
    var promptText = normalizePromptText(detector.getComposerText(document, document.activeElement));
    if (!promptText) {
      return;
    }

    lastComposerSnapshot = {
      hash: hashText(promptText),
      text: promptText,
      time: Date.now()
    };
  }

  function deferComposerRefresh() {
    if (typeof setTimeout === "function") {
      setTimeout(refreshComposerSnapshot, 0);
      return;
    }

    refreshComposerSnapshot();
  }

  function userMessageKey(element, text) {
    var id = element && typeof element.getAttribute === "function" ? element.getAttribute("data-message-id") : "";
    if (id) {
      return "id:" + id;
    }

    return "text:" + hashText(text) + ":" + text.slice(0, 32);
  }

  function assistantModelKey(element, model) {
    var id = element && typeof element.getAttribute === "function"
      ? element.getAttribute("data-message-id") || element.getAttribute("data-turn-id") || element.getAttribute("data-turn-id-container")
      : "";
    if (id) {
      return "id:" + id + ":" + model;
    }

    return "model:" + model + ":" + hashText(getElementText(element));
  }

  function collectUserMessages() {
    var selectors = [
      '[data-message-author-role="user"]',
      '[data-testid*="user-message" i]',
      '[data-testid*="conversation-turn-user" i]'
    ];
    var found = [];
    var elements = new Set();

    selectors.forEach(function query(selector) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function add(element) {
          elements.add(element);
        });
      } catch (_) {
        return;
      }
    });

    elements.forEach(function addCandidate(element) {
      var text = getElementText(element);
      if (!text) {
        return;
      }

      found.push({
        element: element,
        key: userMessageKey(element, text),
        text: text
      });
    });

    return found;
  }

  function collectAssistantModelMessages() {
    var found = [];
    var elements = new Set();
    [
      '[data-message-model-slug]',
      '[data-message-author-role="assistant"][data-message-model-slug]',
      '[data-turn="assistant"] [data-message-model-slug]'
    ].forEach(function query(selector) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function add(element) {
          elements.add(element);
        });
      } catch (_) {
        return;
      }
    });

    elements.forEach(function addCandidate(element) {
      var model = element && typeof element.getAttribute === "function"
        ? element.getAttribute("data-message-model-slug")
        : "";
      if (!isActualRequestModelSlug(model)) {
        return;
      }

      found.push({
        element: element,
        key: assistantModelKey(element, model),
        model: normalizePromptText(model),
        contentLength: getElementText(element).length
      });
    });

    return found;
  }

  function seedExistingUserMessages() {
    collectUserMessages().forEach(function mark(message) {
      seenUserMessages.add(message.key);
    });
    collectAssistantModelMessages().forEach(function mark(message) {
      seenAssistantModelMessages.add(message.key);
    });
  }

  function scanNewUserMessages() {
    var snapshot = lastComposerSnapshot;
    var now = Date.now();
    collectUserMessages().forEach(function inspect(message) {
      if (seenUserMessages.has(message.key)) {
        return;
      }

      seenUserMessages.add(message.key);
      if (!snapshot || now - snapshot.time > MESSAGE_MATCH_WINDOW_MS) {
        return;
      }

      if (hashText(message.text) !== snapshot.hash) {
        return;
      }

      recordUsage("message-dom", message.element, message.text);
      lastComposerSnapshot = null;
    });
  }

  function commitAssistantModelCandidate(message) {
    if (!message || !message.model) {
      return false;
    }
    if (pendingAssistantModelTimer) {
      clearTimeout(pendingAssistantModelTimer);
      pendingAssistantModelTimer = null;
    }
    pendingAssistantModelCandidate = null;
    var observedAt = Date.now();
    rememberObservedModel(
      message.model,
      "message-dom:model-slug",
      observedAt,
      true,
      { model: message.model },
      []
    );
    return sendResponseObservation(message.model, "message-dom:model-slug", observedAt);
  }

  function scheduleAssistantModelCandidate(message) {
    pendingAssistantModelCandidate = message;
    if (pendingAssistantModelTimer || typeof setTimeout !== "function") {
      return;
    }
    pendingAssistantModelTimer = setTimeout(function commitDelayedAssistantModel() {
      pendingAssistantModelTimer = null;
      var candidate = pendingAssistantModelCandidate;
      pendingAssistantModelCandidate = null;
      commitAssistantModelCandidate(candidate);
    }, FINAL_RESPONSE_MODEL_WAIT_MS);
  }

  function scanNewAssistantModelMessages() {
    var unseen = [];
    collectAssistantModelMessages().forEach(function inspect(message) {
      if (seenAssistantModelMessages.has(message.key)) {
        return;
      }

      seenAssistantModelMessages.add(message.key);
      unseen.push(message);
    });
    if (!unseen.length) {
      return;
    }

    // Reasoning and final assistant nodes can be rendered as separate elements.
    // The reasoning node may arrive first and can even carry a different slug.
    // Prefer the content-bearing final node; only use a metadata-only node after
    // a short settlement window when no final node appears.
    var finalCandidate = null;
    for (var index = unseen.length - 1; index >= 0; index -= 1) {
      if (Number(unseen[index].contentLength || 0) > 0) {
        finalCandidate = unseen[index];
        break;
      }
    }
    if (finalCandidate) {
      commitAssistantModelCandidate(finalCandidate);
      return;
    }
    scheduleAssistantModelCandidate(unseen[unseen.length - 1]);
  }

  function installUsagePanel() {
    if (
      !window.ChatGPTUsageDashboard ||
      typeof document.getElementById !== "function" ||
      typeof document.createElement !== "function" ||
      document.getElementById("chatgpt-model-usage-counter-panel-host")
    ) {
      return;
    }

    var host = document.createElement("div");
    host.id = "chatgpt-model-usage-counter-panel-host";
    host.innerHTML = [
      '<button id="chatgpt-model-usage-counter-panel-toggle" type="button" title="模型统计" aria-haspopup="dialog" aria-expanded="false"><span class="chatgpt-model-usage-counter-panel-toggle-label">统计</span></button>',
      '<aside id="chatgpt-model-usage-counter-panel" hidden>',
      '<div id="chatgpt-model-usage-counter-panel-body"></div>',
      "</aside>"
    ].join("");

    var style = document.createElement("style");
    style.textContent = [
      "#chatgpt-model-usage-counter-panel-host{z-index:2147483647;font:13px/1.35 system-ui,sans-serif;color:inherit;--usage-text-primary:#18201c;--usage-surface-panel:#fbfcfa;--usage-border-control:#ccd4ca;--usage-border-panel:#dde3dc;--usage-shadow-export:rgba(15,23,42,.14);--usage-panel-toggle-hover:rgba(0,0,0,.06)}",
      "#chatgpt-model-usage-counter-panel-host[data-chatgpt-model-usage-theme=\"dark\"],html.dark #chatgpt-model-usage-counter-panel-host,html[data-theme*=\"dark\"] #chatgpt-model-usage-counter-panel-host{--usage-text-primary:#ececf1;--usage-surface-panel:#2a2b32;--usage-border-control:#565869;--usage-border-panel:#3e3f4b;--usage-shadow-export:rgba(0,0,0,.3);--usage-panel-toggle-hover:rgba(255,255,255,.08)}",
      "#chatgpt-model-usage-counter-panel-host.is-embedded{position:relative;display:inline-flex;align-items:center;align-self:center;flex:0 0 auto;margin-left:4px}",
      "#chatgpt-model-usage-counter-panel-host.is-main-top{margin-left:auto;margin-right:8px}",
      "#chatgpt-model-usage-counter-panel-host.is-fallback{position:fixed;right:12px;top:12px}",
      "#chatgpt-model-usage-counter-panel-main-mount{position:sticky;top:0;z-index:2147483647;display:flex;align-items:center;justify-content:flex-end;box-sizing:border-box;min-height:44px;padding:6px 12px;background:var(--main-surface-primary,transparent);pointer-events:none}",
      "#chatgpt-model-usage-counter-panel-main-mount #chatgpt-model-usage-counter-panel-host{pointer-events:auto}",
      "#chatgpt-model-usage-counter-panel-toggle{display:inline-flex;align-items:center;justify-content:center;height:32px;min-width:0;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;padding:0 8px;font:inherit;line-height:1;cursor:pointer}",
      "#chatgpt-model-usage-counter-panel-toggle:hover{background:var(--usage-panel-toggle-hover,rgba(0,0,0,.06))}",
      "#chatgpt-model-usage-counter-panel-host.is-fallback #chatgpt-model-usage-counter-panel-toggle{width:28px;height:28px;padding:0;border-color:var(--usage-border-control,#d1d5db);background:var(--usage-surface-panel,#fff);color:var(--usage-text-primary,#111827);box-shadow:0 6px 18px var(--usage-shadow-export,rgba(15,23,42,.16));font-size:0}",
      "#chatgpt-model-usage-counter-panel-host.is-fallback #chatgpt-model-usage-counter-panel-toggle::after{content:'U';font-size:12px;font-weight:700}",
      // 统计入口不再随 OpenAI 状态变色(用户:不要那个奶油色/警告样式);状态提示保留在面板状态页与工具栏角标。
      "#chatgpt-model-usage-counter-panel{position:fixed;top:52px;right:12px;box-sizing:border-box;width:min(400px,calc(100vw - 24px));height:min(560px,calc(100vh - 76px));overflow:hidden;border:1px solid var(--usage-border-panel,rgba(24,32,28,.14));border-radius:8px;background:var(--usage-surface-panel,#fbfcfa);color:var(--usage-text-primary,#18201c);box-shadow:0 18px 42px var(--usage-shadow-export,rgba(24,32,28,.14))}",
      "#chatgpt-model-usage-counter-panel-body{height:100%;padding:0;overflow:hidden}",
      "@media (max-width:720px){#chatgpt-model-usage-counter-panel{left:10px;right:10px;top:48px;width:auto;height:calc(100vh - 64px)}}"
    ].join("");
    host.appendChild(style);

    var panel = host.querySelector("#chatgpt-model-usage-counter-panel");
    var body = host.querySelector("#chatgpt-model-usage-counter-panel-body");
    var toggleButton = host.querySelector("#chatgpt-model-usage-counter-panel-toggle");
    var toggleLabel = host.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
    var dashboard = null;
    var currentPanelLanguage = "zh";
    var currentStatusRecord = null;
    var lastMountedLocation = "";

    function hasDarkClass(element) {
      return Boolean(element && /(^|\s)dark(\s|$)/i.test(String(element.className || "")));
    }

    function readDataTheme(element) {
      return element && typeof element.getAttribute === "function"
        ? String(element.getAttribute("data-theme") || "").toLowerCase()
        : "";
    }

    function parseColorChannel(value) {
      var percent = /%$/.test(String(value || "").trim());
      var number = parseFloat(value);
      if (!Number.isFinite(number)) {
        return 0;
      }
      return percent ? Math.max(0, Math.min(255, number * 2.55)) : Math.max(0, Math.min(255, number));
    }

    function parseAlpha(value) {
      if (value == null || value === "") {
        return 1;
      }
      var percent = /%$/.test(String(value || "").trim());
      var number = parseFloat(value);
      if (!Number.isFinite(number)) {
        return 1;
      }
      return percent ? Math.max(0, Math.min(1, number / 100)) : Math.max(0, Math.min(1, number));
    }

    function rgbFromColor(value) {
      var color = String(value || "").trim();
      var rgb = color.match(/^rgba?\(([^)]+)\)$/i);
      if (rgb) {
        var parts = rgb[1].split(/\s*,\s*|\s+\/\s*|\s+/).filter(Boolean);
        if (parts.length >= 3) {
          var alpha = parseAlpha(parts[3]);
          if (alpha <= 0) {
            return null;
          }
          return {
            r: parseColorChannel(parts[0]),
            g: parseColorChannel(parts[1]),
            b: parseColorChannel(parts[2])
          };
        }
      }
      var hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (!hex) {
        return null;
      }
      var valuePart = hex[1];
      if (valuePart.length === 3) {
        valuePart = valuePart.replace(/./g, "$&$&");
      }
      return {
        r: parseInt(valuePart.slice(0, 2), 16),
        g: parseInt(valuePart.slice(2, 4), 16),
        b: parseInt(valuePart.slice(4, 6), 16)
      };
    }

    function relativeLuminance(color) {
      function channel(value) {
        value = value / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      }
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    }

    function computedBackgroundColor(element) {
      if (!element) {
        return "";
      }
      var reader = typeof getComputedStyle === "function"
        ? getComputedStyle
        : window && typeof window.getComputedStyle === "function" ? window.getComputedStyle.bind(window) : null;
      if (!reader) {
        return "";
      }
      try {
        var styles = reader(element);
        return styles && (styles.backgroundColor || styles.background || "");
      } catch (_) {
        return "";
      }
    }

    function detectComputedPageTheme() {
      var candidates = [document.body, document.documentElement, typeof document.querySelector === "function" ? document.querySelector("main") : null];
      var sawLight = false;
      for (var index = 0; index < candidates.length; index += 1) {
        var color = rgbFromColor(computedBackgroundColor(candidates[index]));
        if (color) {
          if (relativeLuminance(color) < 0.5) {
            return "dark";
          }
          sawLight = true;
        }
      }
      return sawLight ? "light" : "";
    }

    function preferredPanelTheme() {
      var query = window && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      return query && query.matches ? "dark" : "light";
    }

    function detectPanelTheme() {
      var documentElement = document.documentElement;
      var bodyElement = document.body;
      if (hasDarkClass(documentElement)) {
        return "dark";
      }
      var htmlTheme = readDataTheme(documentElement);
      if (htmlTheme.indexOf("dark") !== -1) {
        return "dark";
      }
      if (htmlTheme.indexOf("light") !== -1) {
        return "light";
      }
      if (hasDarkClass(bodyElement)) {
        return "dark";
      }
      var bodyTheme = readDataTheme(bodyElement);
      if (bodyTheme.indexOf("dark") !== -1) {
        return "dark";
      }
      if (bodyTheme.indexOf("light") !== -1) {
        return "light";
      }
      return detectComputedPageTheme() || preferredPanelTheme();
    }

    function applyPanelTheme() {
      var theme = detectPanelTheme();
      host.setAttribute("data-chatgpt-model-usage-theme", theme);
      // 把 ChatGPT 实际主题存下来,供工具栏弹窗读取,保证两个面板颜色一致。
      try {
        if (window.chrome && chrome.storage && chrome.storage.local && (theme === "dark" || theme === "light")) {
          chrome.storage.local.set({ chatgptUsagePanelTheme: theme });
        }
      } catch (_) {}
    }

    function observePanelTheme() {
      applyPanelTheme();
      var mediaQuery = window && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      if (mediaQuery && typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", applyPanelTheme);
      }
      if (mediaQuery && typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(applyPanelTheme);
      }
      if (typeof MutationObserver !== "function") {
        return;
      }
      var observer = new MutationObserver(applyPanelTheme);
      [document.documentElement, document.body].forEach(function observeThemeTarget(target) {
        if (target) {
          observer.observe(target, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
        }
      });
    }

    function normalizeStatusState(value) {
      var state = String(value || "").toLowerCase();
      return /^(operational|degraded|partial|maintenance|major|unavailable|unknown|timeout|fetch-failure)$/.test(state) ? state : "unknown";
    }

    function statusLabel(record, language) {
      var label = String((record && record.label) || "").replace(/\s+/g, " ").trim();
      if (label) {
        return label;
      }
      var state = normalizeStatusState(record && record.state);
      if (language === "en") {
        if (state === "operational") return "Operational";
        if (state === "degraded") return "Degraded performance";
        if (state === "partial") return "Partial outage";
        if (state === "maintenance") return "Under maintenance";
        if (state === "major") return "Major outage";
        if (state === "unavailable") return "Status unavailable";
        if (state === "timeout") return "Status check timed out";
        if (state === "fetch-failure") return "Status fetch failed";
        return "Unknown";
      }
      if (state === "operational") return "正常";
      if (state === "degraded") return "性能下降";
      if (state === "partial") return "部分中断";
      if (state === "maintenance") return "维护中";
      if (state === "major") return "严重中断";
      if (state === "unavailable") return "状态不可用";
      if (state === "timeout") return "状态检查超时";
      if (state === "fetch-failure") return "状态获取失败";
      return "未知";
    }

    function applyPanelToggleState() {
      var language = currentPanelLanguage === "en" ? "en" : "zh";
      var isEnglish = language === "en";
      var baseTitle = isEnglish ? "Model Usage" : "模型统计";
      if (toggleButton) {
        toggleButton.title = baseTitle;
      }
      if (toggleLabel) {
        toggleLabel.textContent = isEnglish ? "Usage" : "统计";
      }
      if (!currentStatusRecord) {
        host.removeAttribute("data-openai-status-state");
        host.removeAttribute("data-openai-status-label");
        return;
      }
      var state = normalizeStatusState(currentStatusRecord.state);
      var label = statusLabel(currentStatusRecord, language);
      host.setAttribute("data-openai-status-state", state);
      host.setAttribute("data-openai-status-label", label);
      if (toggleButton) {
        toggleButton.title = baseTitle + " · OpenAI: " + label;
        toggleButton.setAttribute("aria-label", toggleButton.title);
      }
    }

    function applyPanelToggleLanguage(language) {
      currentPanelLanguage = language === "en" ? "en" : "zh";
      applyPanelToggleState();
    }

    function applyPanelToggleStatus(record) {
      currentStatusRecord = record && typeof record === "object" ? record : null;
      applyPanelToggleState();
    }

    function readPanelToggleLanguage() {
      applyPanelToggleLanguage("zh");
      if (!window.chrome || !chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== "function") {
        return;
      }
      try {
        chrome.storage.local.get([SETTINGS_KEY, STATUS_KEY], function applyStoredLanguage(items) {
          if (chrome.runtime && chrome.runtime.lastError) {
            applyPanelToggleLanguage("zh");
            return;
          }
          var settings = items && items[SETTINGS_KEY];
          applyPanelToggleLanguage(settings && settings.language === "en" ? "en" : "zh");
          applyPanelToggleStatus(items && items[STATUS_KEY]);
        });
      } catch (_) {
        applyPanelToggleLanguage("zh");
      }
    }

    readPanelToggleLanguage();
    observePanelTheme();

    if (window.chrome && chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === "function") {
      chrome.storage.onChanged.addListener(function updatePanelToggleLanguage(changes, areaName) {
        if (areaName !== "local") {
          return;
        }
        var settingsChange = changes && changes[SETTINGS_KEY];
        if (settingsChange) {
          var settings = settingsChange.newValue;
          applyPanelToggleLanguage(settings && settings.language === "en" ? "en" : "zh");
        }
        var statusChange = changes && changes[STATUS_KEY];
        if (statusChange) {
          applyPanelToggleStatus(statusChange.newValue);
        }
      });
    }

    function queryAll(root, selector) {
      if (!root || typeof root.querySelectorAll !== "function") {
        return [];
      }
      try {
        return Array.prototype.slice.call(root.querySelectorAll(selector));
      } catch (_) {
        return [];
      }
    }

    function closest(element, selector) {
      if (!element || typeof element.closest !== "function") {
        return null;
      }
      try {
        return element.closest(selector);
      } catch (_) {
        return null;
      }
    }

    function elementRect(element) {
      if (!element || typeof element.getBoundingClientRect !== "function") {
        return null;
      }
      try {
        return element.getBoundingClientRect();
      } catch (_) {
        return null;
      }
    }

    function elementTag(element) {
      return String((element && element.tagName) || "").toLowerCase();
    }

    function isOwnPanelElement(element) {
      return element === host || Boolean(closest(element, "#chatgpt-model-usage-counter-panel-host"));
    }

    function isSyntheticMainMount(element) {
      return Boolean(element && element.id === "chatgpt-model-usage-counter-panel-main-mount");
    }

    function isSidebarElement(element) {
      return Boolean(closest(element, "aside,[data-testid*='sidebar' i],[aria-label*='sidebar' i]"));
    }

    function isUsableTopBar(element) {
      if (!element || isOwnPanelElement(element) || isSyntheticMainMount(element) || isSidebarElement(element)) {
        return false;
      }
      var rect = elementRect(element);
      if (!rect) {
        return true;
      }
      var width = Number(rect.width || 0);
      var height = Number(rect.height || 0);
      var top = Number(rect.top || 0);
      if (!width && rect.right != null && rect.left != null) {
        width = Number(rect.right) - Number(rect.left);
      }
      if (!height && rect.bottom != null && rect.top != null) {
        height = Number(rect.bottom) - Number(rect.top);
      }
      return width >= 180 && height >= 28 && height <= 140 && top >= -12 && top <= 160;
    }

    function isUsableMainContent(element) {
      if (!element || isOwnPanelElement(element) || isSidebarElement(element)) {
        return false;
      }
      var rect = elementRect(element);
      if (!rect) {
        return true;
      }
      var width = Number(rect.width || 0);
      var height = Number(rect.height || 0);
      var top = Number(rect.top || 0);
      if (!width && rect.right != null && rect.left != null) {
        width = Number(rect.right) - Number(rect.left);
      }
      if (!height && rect.bottom != null && rect.top != null) {
        height = Number(rect.bottom) - Number(rect.top);
      }
      return width >= 320 && height >= 220 && top <= 180;
    }

    function findMainContent() {
      var selectors = ["main", '[role="main"]'];
      for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
        var nodes = queryAll(document, selectors[selectorIndex]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          if (isUsableMainContent(nodes[nodeIndex])) {
            return nodes[nodeIndex];
          }
        }
      }
      return null;
    }

    function topBarFromAnchor(anchor) {
      var current = anchor;
      var best = null;
      for (var depth = 0; current && depth < 8; depth += 1) {
        if (isUsableTopBar(current)) {
          best = current;
        }
        if (elementTag(current) === "main") {
          break;
        }
        current = current.parentElement || current.parentNode;
      }
      return best;
    }

    function findTopBarByAnchor() {
      var selectors = [
        'main [data-testid="model-switcher-dropdown-button"]',
        'main [data-testid*="model-switcher" i]',
        'main button[aria-label*="model" i]',
        'main button[aria-haspopup="menu"]',
        '[data-testid="model-switcher-dropdown-button"]',
        '[data-testid*="model-switcher" i]',
        'button[aria-label*="model" i]',
        'button[aria-haspopup="menu"]'
      ];
      for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
        var nodes = queryAll(document, selectors[selectorIndex]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          var topBar = topBarFromAnchor(nodes[nodeIndex]);
          if (topBar) {
            return topBar;
          }
        }
      }
      return null;
    }

    function ensureMainTopMount() {
      var main = findMainContent();
      if (!main || typeof document.createElement !== "function") {
        return null;
      }

      var mount = typeof document.getElementById === "function" ? document.getElementById("chatgpt-model-usage-counter-panel-main-mount") : null;
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "chatgpt-model-usage-counter-panel-main-mount";
        mount.setAttribute("data-chatgpt-model-usage-counter-panel-main-mount", "true");
      }
      if (mount.parentNode !== main) {
        if (main.firstChild && typeof main.insertBefore === "function") {
          main.insertBefore(mount, main.firstChild);
        } else if (typeof main.appendChild === "function") {
          main.appendChild(mount);
        }
      }
      return mount;
    }

    function findPanelMount() {
      // 优先:把入口放进「对话内标题栏」的右侧动作区(分享 / … 按钮所在的组),
      // 这样统计入口就紧贴标题栏右侧,而不是漂浮或挤在顶部。该组较窄会被 isUsableTopBar
      // 的宽度阈值拒绝,所以这里按 testid 直接命中、绕过宽度检查。
      if (typeof document.querySelector === "function") {
        var rightActions =
          document.getElementById("conversation-header-actions") ||
          document.querySelector('[data-testid="thread-header-right-actions"]') ||
          document.querySelector('[data-testid="conversation-header-actions"]');
        if (rightActions && !isOwnPanelElement(rightActions) && !isSidebarElement(rightActions)) {
          return { element: rightActions, kind: "header-actions" };
        }
      }

      var selectors = [
        "main header",
        'main [data-testid="conversation-header"]',
        'main [data-testid="chat-header"]',
        'main [data-testid="conversation-panel-header"]',
        'main [data-testid="thread-header"]',
        'main [data-testid="main-header"]',
        'main [data-testid*="header" i]',
        'main [data-testid*="toolbar" i]',
        'main [role="toolbar"]',
        'main [class*="sticky"][class*="top-0"]',
        'main [class*="sticky"][class*="top"]',
        "main > div:first-child",
        "main > div > div:first-child",
        '[data-testid="conversation-header"]',
        '[data-testid="chat-header"]',
        '[data-testid="conversation-panel-header"]',
        '[data-testid="thread-header"]',
        '[data-testid*="header" i]',
        '[data-testid*="toolbar" i]',
        '[role="toolbar"]',
        "header"
      ];
      for (var index = 0; index < selectors.length; index += 1) {
        var nodes = queryAll(document, selectors[index]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          if (isUsableTopBar(nodes[nodeIndex])) {
            return { element: nodes[nodeIndex], kind: "header" };
          }
        }
      }
      var anchoredTopBar = findTopBarByAnchor();
      if (anchoredTopBar) {
        return { element: anchoredTopBar, kind: "header" };
      }
      var mainTopMount = ensureMainTopMount();
      return mainTopMount ? { element: mainTopMount, kind: "main-top" } : null;
    }

    function attachHost() {
      var mount = findPanelMount();
      if (mount) {
        if (host.parentNode !== mount.element) {
          mount.element.appendChild(host);
        }
        host.classList.add("is-embedded");
        host.classList.remove("is-fallback");
        if (mount.kind === "main-top") {
          host.classList.add("is-main-top");
        } else {
          host.classList.remove("is-main-top");
        }
        lastMountedLocation = String(location && location.href || "");
        return true;
      }

      if (!host.parentNode) {
        (document.body || document.documentElement).appendChild(host);
      }
      host.classList.add("is-fallback");
      host.classList.remove("is-embedded");
      host.classList.remove("is-main-top");
      lastMountedLocation = String(location && location.href || "");
      return false;
    }

    function hostIsConnected() {
      return typeof host.isConnected === "boolean" ? host.isConnected : Boolean(host.parentNode);
    }

    function maintainPanelMount() {
      var currentLocation = String(location && location.href || "");
      if (!hostIsConnected() || currentLocation !== lastMountedLocation) {
        attachHost();
      }
    }

    function observePanelMount() {
      if (typeof MutationObserver !== "function") {
        return;
      }
      // Observe <html>, not the current <body>: some ChatGPT routes replace the
      // whole body during SPA navigation. An observer attached to the old body
      // would then stop seeing changes and leave the entry inside detached DOM.
      var root = document.documentElement || document.body;
      if (!root) {
        return;
      }
      // 持续观察,绝不一次性 disconnect:ChatGPT 重渲染标题栏(尤其多对话导出会逐个切换对话)
      // 会把入口从 DOM 里移除,之前 attach 成功就 disconnect 导致入口一去不返(用户:导出后统计入口消失)。
      // 现在只要入口掉了(host 不在文档里)就立刻重新挂回去;平时挂着只读一个布尔值,几乎零开销。
      var observer = new MutationObserver(function retryAttach() {
        if (!hostIsConnected()) {
          attachHost();
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    }

    function panelLabels(language) {
      if (language === "en") {
        return { toggle: "Usage", title: "Model usage" };
      }

      return { toggle: "统计", title: "模型统计" };
    }

    function applyPanelLanguage(language) {
      var labels = panelLabels(language);
      var toggleLabel = host.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
      if (toggleButton) {
        toggleButton.title = labels.title;
      }
      if (toggleLabel) {
        toggleLabel.textContent = labels.toggle;
      }
    }

    function openPanel() {
      panel.hidden = false;
      toggleButton.setAttribute("aria-expanded", "true");
      if (!dashboard) {
        dashboard = window.ChatGPTUsageDashboard.init(body, { surface: "page", onClose: closePanel, onLanguageChange: applyPanelLanguage });
      } else {
        dashboard.reload();
      }
    }

    function closePanel() {
      panel.hidden = true;
      toggleButton.setAttribute("aria-expanded", "false");
    }

    attachHost();
    ensureUsagePanelMounted = maintainPanelMount;
    // 始终观察并在入口掉了时重挂(过去只在初次落到 fallback 才观察,导致已嵌入标题栏的入口
    // 在 ChatGPT 重渲染标题栏后——尤其多对话导出逐个切换对话时——掉了就再也回不来)。
    observePanelMount();

    toggleButton.addEventListener("click", function toggle() {
      if (extensionContextLost || extensionContextSeemsLost()) {
        handleExtensionContextInvalidated();
        if (location && typeof location.reload === "function") {
          location.reload();
        }
        return;
      }
      if (panel.hidden) {
        openPanel();
        return;
      }
      panel.hidden = true;
      toggleButton.setAttribute("aria-expanded", "false");
    });
  }

  function startMessageObserver() {
    seedExistingUserMessages();
    refreshComposerSnapshot();

    if (typeof MutationObserver === "function") {
      var root = document.body || document.documentElement;
      if (root) {
        new MutationObserver(function handleMutations() {
          refreshComposerSnapshot();
          scanNewUserMessages();
          scanNewAssistantModelMessages();
        }).observe(root, {
          childList: true,
          characterData: true,
          subtree: true
        });
      }
    }

    if (typeof setInterval === "function") {
      setInterval(function refreshRuntimeSnapshot() {
        // 主动发现“扩展被重载、本页旧脚本已失效”,尽早把入口标成“刷新”,别让用户对着死面板以为统计坏了。
        if (extensionContextSeemsLost()) {
          handleExtensionContextInvalidated();
          return;
        }
        if (typeof ensureUsagePanelMounted === "function") {
          ensureUsagePanelMounted();
        }
        refreshComposerSnapshot();
        scanNewAssistantModelMessages();
        readDomModel();
      }, COMPOSER_POLL_MS);
    }
  }

  document.addEventListener(
    "pointerdown",
    function handlePointerdown(event) {
      refreshComposerSnapshot();
      var button = findSendButtonTarget(event);
      if (button) {
        recordUsage("send-button", button);
      }
    },
    true
  );

  document.addEventListener(
    "pointerup",
    function handlePointerup(event) {
      refreshComposerSnapshot();
      var button = findSendButtonTarget(event);
      if (button) {
        recordUsage("send-button", button);
      }
    },
    true
  );

  document.addEventListener(
    "click",
    function handleClick(event) {
      refreshComposerSnapshot();
      var button = findSendButtonTarget(event);
      if (button) {
        recordUsage("send-button", button);
      }
    },
    true
  );

  document.addEventListener(
    "submit",
    function handleSubmit(event) {
      refreshComposerSnapshot();
      if (detector.getComposerText(document, event.target)) {
        recordUsage("form-submit", event.target);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    function handleKeydown(event) {
      refreshComposerSnapshot();
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing
      ) {
        return;
      }

      var composer = findComposerTarget(event);
      if (!composer || !detector.getComposerText(document, composer)) {
        return;
      }

      recordUsage("enter-key", composer);
      lastComposerSnapshot = null;
    },
    true
  );

  document.addEventListener("beforeinput", deferComposerRefresh, true);
  document.addEventListener("input", deferComposerRefresh, true);
  document.addEventListener("keyup", refreshComposerSnapshot, true);
  readDomModel();
  refreshRuntimeModelCatalog();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMessageObserver, { once: true });
  } else {
    startMessageObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installUsagePanel, { once: true });
  } else {
    installUsagePanel();
  }

  // 导出对话的内容脚本接口。优先使用当前 ChatGPT 页面的同源账号历史请求；
  // 不读取 cookie/token/header。接口不可用时才通过侧边栏 SPA 导航读取已渲染 DOM。
  if (chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === "function") {
    var waitMs = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    var listSidebarConversations = function () {
      var seen = {};
      var out = [];
      Array.prototype.forEach.call(document.querySelectorAll('a[href*="/c/"]'), function (a) {
        var href = a.getAttribute("href") || "";
        var m = href.match(/\/c\/([0-9a-zA-Z-]{6,})/);
        if (!m || seen[m[1]]) {
          return;
        }
        seen[m[1]] = true;
        var title = (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
        out.push({ id: m[1], title: title || ("对话 " + m[1].slice(0, 6)) });
      });
      return out;
    };

    // 展开侧边栏里折叠的项目/文件夹,让里面的对话也出现在列表里(用户:文件夹内对话看不到)。
    var expandSidebarFolders = function () {
      var folders = Array.prototype.slice.call(document.querySelectorAll('nav [aria-expanded="false"]')).filter(function (el) {
        if (el.tagName !== "DIV") {
          return false;
        }
        var label = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        // 排除边栏开关 / 个人资料 / 项目选项菜单等非文件夹的可展开元素
        return label && !/边栏|sidebar|个人资料|profile|选项|option|菜单|menu/i.test(label);
      });
      folders.forEach(function (f) { try { f.click(); } catch (_) {} });
      return folders.length;
    };

    var listAllDomConversations = function () {
      var expanded = expandSidebarFolders();
      return waitMs(expanded ? 1300 : 0).then(function () {
        return listSidebarConversations();
      });
    };

    var conversationIdFromPath = function () {
      return (String(location.pathname || "").match(/\/c\/([^/?#]+)/) || [])[1] || "";
    };
    var findConversationLink = function (id) {
      return document.querySelector('a[href$="/c/' + id + '"]') || document.querySelector('a[href*="/c/' + id + '"]');
    };
    // 点开侧边栏链接后,轮询等地址真正切到目标对话(SPA 切换有延迟);
    // 超时返回 false,让调用方跳过收集,避免抓到上一段对话。
    var waitForConversationSwitch = function (id, maxMs) {
      var deadline = Date.now() + maxMs;
      return new Promise(function (resolve) {
        var poll = function () {
          if (conversationIdFromPath() === id) { resolve(true); return; }
          if (Date.now() >= deadline) { resolve(false); return; }
          setTimeout(poll, 120);
        };
        poll();
      });
    };

    // 切换对话后,正文是异步渲染的;固定等几百毫秒就收会拿到 0 条消息 → 导出“未检测到对话”。
    // 这里轮询等 [data-message-author-role] 真正出现且数量连续稳定再收,最长等 maxMs。
    var waitForMessages = function (maxMs) {
      var deadline = Date.now() + maxMs;
      return new Promise(function (resolve) {
        var last = -1;
        var stable = 0;
        var poll = function () {
          var n = 0;
          try { n = document.querySelectorAll("[data-message-author-role]").length; } catch (_) {}
          if (n > 0 && n === last) { stable += 1; } else { stable = 0; }
          last = n;
          if ((n > 0 && stable >= 2) || Date.now() >= deadline) { resolve(n); return; }
          setTimeout(poll, 250);
        };
        poll();
      });
    };

    var collectManyFromDom = function (ids, perDelayMs) {
      var exporter = window.ChatGPTUsageExporter;
      if (!exporter || typeof exporter.collectConversationFromDom !== "function") {
        return Promise.reject(new Error("exporter-unavailable"));
      }
      var startId = conversationIdFromPath();
      var list = listSidebarConversations();
      var byId = {};
      list.forEach(function (c) { byId[c.id] = c; });
      var targets = (Array.isArray(ids) && ids.length) ? ids : list.map(function (c) { return c.id; });
      var results = [];
      var step = function (i) {
        if (i >= targets.length) {
          return Promise.resolve(results);
        }
        var id = targets[i];
        var link = findConversationLink(id);
        if (!link || typeof link.click !== "function") {
          // 侧边栏没有这条对话的链接 —— 跳过,绝不把当前显示的那段误当成它收集。
          return step(i + 1);
        }
        link.click();
        return waitForConversationSwitch(id, Math.max(perDelayMs || 2500, 2500)).then(function (switched) {
          // 切过去就少等一下;没检测到切换(加载慢/链接特殊)多给点时间,随后都靠 waitForMessages 兜底。
          return waitMs(switched ? 250 : 900);
        }).then(function () {
          try { window.scrollTo(0, document.body.scrollHeight); } catch (_) {}
          // 关键修复:轮询等正文真正渲染出来再收,而不是固定短等待就收(收太早 → 0 条 → 导出不可用)。
          return waitForMessages(8000);
        }).then(function () {
          try { window.scrollTo(0, document.body.scrollHeight); } catch (_) {}
          return waitMs(250);
        }).then(function () {
          var conv = exporter.collectConversationFromDom(document);
          if (conv && conv.id === id && conv.messages && conv.messages.length) {
            // 标题一律以侧边栏里这条对话(按目标 id 取)的真实标题为准:即使切换太快、DOM 里
            // 还残留上一段对话的 document.title,也不会张冠李戴。侧边栏没标题时才退回 DOM 采到的。
            if (byId[id] && byId[id].title) {
              conv.title = byId[id].title;
            }
            results.push(conv);
          }
        }).catch(function skipFailedDomConversation() {
          // One DOM-rendering failure must not abort the remaining selected
          // conversations. The caller reports any still-missing ids.
        }).then(function nextTarget() { return step(i + 1); });
      };
      // 采集会沿侧边栏切换对话；结束后用 SPA 点击切回用户原来那段（仅点同源链接，不整页刷新，
      // 以免打断随后的导出）。原本在新对话/根路径（无对话链接）则不强行还原。
      var restore = function () {
        if (!startId || conversationIdFromPath() === startId) { return Promise.resolve(); }
        var back = findConversationLink(startId);
        if (back && typeof back.click === "function") {
          back.click();
          return waitForConversationSwitch(startId, 2500);
        }
        return Promise.resolve();
      };
      return step(0).then(function (res) {
        return restore().then(function () { return res; });
      }, function failed(error) {
        return restore().then(function rethrow() { throw error; });
      });
    };

    var accountHistoryAuthPromise = null;
    var accountHistoryAuthClearTimer = null;
    var ACCOUNT_HISTORY_AUTH_IDLE_MS = 30 * 1000;

    function clearAccountHistoryAuth() {
      accountHistoryAuthPromise = null;
      if (accountHistoryAuthClearTimer && typeof clearTimeout === "function") {
        clearTimeout(accountHistoryAuthClearTimer);
      }
      accountHistoryAuthClearTimer = null;
    }

    function scheduleAccountHistoryAuthClear() {
      if (accountHistoryAuthClearTimer && typeof clearTimeout === "function") {
        clearTimeout(accountHistoryAuthClearTimer);
      }
      accountHistoryAuthClearTimer = typeof setTimeout === "function"
        ? setTimeout(function clearIdleAccountHistoryAuth() {
            clearAccountHistoryAuth();
          }, ACCOUNT_HISTORY_AUTH_IDLE_MS)
        : null;
    }

    function loadAccountHistoryAuth(forceRefresh) {
      if (accountHistoryAuthPromise && !forceRefresh) {
        return accountHistoryAuthPromise;
      }
      accountHistoryAuthPromise = window.fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" }
      }).then(function parseSession(response) {
        if (!response || !response.ok || typeof response.json !== "function") {
          throw new Error("ChatGPT account session is unavailable.");
        }
        return response.json();
      }).then(function validateSession(session) {
        var token = String(session && (session.accessToken || session.access_token) || "");
        var accountId = String(
          session && session.account && session.account.id ||
          session && (session.accountId || session.account_id) ||
          ""
        );
        if (!token || !accountId) {
          throw new Error("ChatGPT account authorization is unavailable.");
        }
        // Authentication values remain only in this content-script memory.
        // They are never persisted, logged, exported, or sent off ChatGPT.
        return { token: token, accountId: accountId };
      }).catch(function allowFutureAuthRetry(error) {
        clearAccountHistoryAuth();
        throw error;
      });
      return accountHistoryAuthPromise;
    }

    function accountHistoryFetch(url, init, refreshed) {
      return loadAccountHistoryAuth(Boolean(refreshed)).then(function authorizedFetch(auth) {
        scheduleAccountHistoryAuthClear();
        var options = Object.assign({}, init || {});
        var headers;
        if (typeof Headers === "function") {
          headers = new Headers(options.headers || {});
          headers.set("accept", "application/json");
          headers.set("authorization", "Bearer " + auth.token);
          headers.set("chatgpt-account-id", auth.accountId);
        } else {
          headers = Object.assign({}, options.headers || {}, {
            accept: "application/json",
            authorization: "Bearer " + auth.token,
            "chatgpt-account-id": auth.accountId
          });
        }
        options.headers = headers;
        options.credentials = "include";
        options.cache = "no-store";
        return window.fetch(url, options);
      }).then(function refreshExpiredSession(response) {
        if (response && (response.status === 401 || response.status === 403)) {
          clearAccountHistoryAuth();
          if (!refreshed) {
            return accountHistoryFetch(url, init, true);
          }
        }
        return response;
      });
    }

    function accountSourceOptions() {
      var source = window.ChatGPTConversationSource;
      var exporter = window.ChatGPTUsageExporter;
      if (!source || !exporter || typeof window.fetch !== "function") {
        return null;
      }
      return {
        source: source,
        options: {
          fetchImpl: accountHistoryFetch,
          exporter: exporter,
          origin: location.origin,
          includeArchived: true,
          pageSize: 100,
          concurrency: 2,
          requestGapMs: 150
        }
      };
    }

    function safeCollectionError(error) {
      return String((error && error.message) || error || "conversation-unavailable").replace(/\s+/g, " ").trim().slice(0, 240);
    }

    function uniqueIds(ids) {
      var seen = {};
      return (Array.isArray(ids) ? ids : []).reduce(function (out, value) {
        var id = String(value || "").trim();
        if (/^[0-9a-zA-Z-]{6,160}$/.test(id) && !seen[id]) {
          seen[id] = true;
          out.push(id);
        }
        return out;
      }, []);
    }

    function mergeCollectionResults(ids, primary, fallbackConversations, fallbackUsed) {
      var targets = uniqueIds(ids);
      var byId = {};
      var primaryFailures = {};
      var warnings = Array.isArray(primary && primary.warnings) ? primary.warnings.slice() : [];
      (primary && Array.isArray(primary.conversations) ? primary.conversations : []).forEach(function addPrimary(conversation) {
        if (conversation && conversation.id) {
          byId[conversation.id] = conversation;
        }
      });
      (Array.isArray(fallbackConversations) ? fallbackConversations : []).forEach(function addFallback(conversation) {
        if (conversation && conversation.id && !byId[conversation.id]) {
          byId[conversation.id] = conversation;
        }
      });
      (primary && Array.isArray(primary.failures) ? primary.failures : []).forEach(function rememberFailure(failure) {
        if (failure && failure.id) {
          primaryFailures[failure.id] = failure.error;
        }
      });
      var failures = [];
      var conversations = [];
      targets.forEach(function orderResult(id) {
        if (byId[id]) {
          conversations.push(byId[id]);
        } else {
          failures.push({
            id: id,
            error: primaryFailures[id] || "Conversation was not available from account history or the loaded sidebar."
          });
        }
      });
      if (fallbackUsed) {
        warnings.push({
          scope: "rendered-page-fallback",
          error: "One or more conversations were read from the rendered ChatGPT page because account-history detail access was unavailable."
        });
      }
      return {
        conversations: conversations,
        failures: failures,
        warnings: warnings,
        requestedCount: targets.length,
        complete: failures.length === 0 && warnings.length === 0 && (!primary || primary.complete !== false)
      };
    }

    function collectWithDomFallback(ids, primaryPromise, perDelayMs) {
      var targets = uniqueIds(ids);
      return Promise.resolve(primaryPromise).catch(function accountFailed(error) {
        return {
          conversations: [],
          failures: targets.map(function failure(id) { return { id: id, error: safeCollectionError(error) }; }),
          warnings: [{ scope: "account-details", error: safeCollectionError(error) }],
          requestedCount: targets.length,
          complete: false
        };
      }).then(function fallbackMissing(primary) {
        var completed = {};
        (primary.conversations || []).forEach(function mark(conversation) {
          if (conversation && conversation.id) { completed[conversation.id] = true; }
        });
        var missing = targets.filter(function missingId(id) { return !completed[id]; });
        if (!missing.length) {
          return mergeCollectionResults(targets, primary, [], false);
        }
        // If the missing target is already open, read it directly before trying
        // sidebar navigation. Shared, temporary, or otherwise unlisted chats
        // can be fully rendered even when no matching sidebar link exists.
        var directFallback = [];
        var currentId = conversationIdFromPath();
        if (currentId && missing.indexOf(currentId) !== -1) {
          var exporter = window.ChatGPTUsageExporter;
          try {
            var current = exporter && typeof exporter.collectConversationFromDom === "function"
              ? exporter.collectConversationFromDom(document)
              : null;
            if (current && current.id === currentId && current.messages && current.messages.length) {
              directFallback.push(current);
              missing = missing.filter(function notCurrent(id) { return id !== currentId; });
            }
          } catch (_) {}
        }
        if (!missing.length) {
          return mergeCollectionResults(targets, primary, directFallback, true);
        }
        return collectManyFromDom(missing, perDelayMs).catch(function () { return []; }).then(function merge(fallback) {
          return mergeCollectionResults(targets, primary, directFallback.concat(fallback), true);
        });
      });
    }

    function listConversationsForExport() {
      var account = accountSourceOptions();
      if (!account) {
        return listAllDomConversations().then(function domOnly(conversations) {
          return {
            conversations: conversations,
            total: conversations.length,
            complete: false,
            source: "sidebar",
            warnings: [{ scope: "account", error: "Account history access is unavailable; showing loaded sidebar chats only." }]
          };
        });
      }
      return account.source.listAccountConversations(account.options).then(function accountList(result) {
        var accountConversations = result.conversations || [];
        if (!accountConversations.length) {
          return listAllDomConversations().then(function useVisibleSidebarWhenAccountIndexIsEmpty(sidebarConversations) {
            if (!sidebarConversations.length) {
              return {
                conversations: [],
                total: 0,
                complete: Boolean(result.complete),
                source: "account",
                warnings: result.warnings || []
              };
            }
            return {
              conversations: sidebarConversations,
              total: sidebarConversations.length,
              complete: false,
              source: "sidebar",
              warnings: (result.warnings || []).concat([{
                scope: "account",
                error: "The account history endpoint returned an empty index; showing the loaded sidebar conversations instead."
              }])
            };
          });
        }
        return {
          conversations: accountConversations,
          total: accountConversations.length,
          complete: Boolean(result.complete),
          source: "account",
          warnings: result.warnings || []
        };
      }).catch(function accountListFailed(error) {
        return listAllDomConversations().then(function fallbackList(conversations) {
          return {
            conversations: conversations,
            total: conversations.length,
            complete: false,
            source: "sidebar",
            warnings: [{ scope: "account", error: safeCollectionError(error) }]
          };
        });
      });
    }

    function collectCurrentConversation() {
      var id = conversationIdFromPath();
      var account = accountSourceOptions();
      if (id && account) {
        return collectWithDomFallback([id], account.source.collectConversations([id], account.options));
      }
      var exporter = window.ChatGPTUsageExporter;
      var conversation = exporter && typeof exporter.collectConversationFromDom === "function"
        ? exporter.collectConversationFromDom(document)
        : null;
      var hasConversation = Boolean(conversation && conversation.messages && conversation.messages.length);
      return Promise.resolve({
        conversations: hasConversation ? [conversation] : [],
        failures: hasConversation ? [] : [{ id: id, error: "No exportable conversation is open." }],
        warnings: hasConversation ? [{
          scope: "rendered-page-fallback",
          error: "The current conversation was read from the rendered ChatGPT page; account-history completeness could not be verified."
        }] : [],
        requestedCount: 1,
        complete: false
      });
    }

    function collectSelectedConversations(ids, perDelayMs) {
      var targets = uniqueIds(ids);
      var account = accountSourceOptions();
      var primary = account
        ? account.source.collectConversations(targets, account.options)
        : Promise.reject(new Error("Account history access is unavailable."));
      return collectWithDomFallback(targets, primary, perDelayMs);
    }

    function collectAllConversations() {
      var account = accountSourceOptions();
      if (!account) {
        return listAllDomConversations().then(function collectLoaded(list) {
          return collectSelectedConversations(list.map(function id(item) { return item.id; })).then(function markSidebarOnly(result) {
            result.warnings = (result.warnings || []).concat([{
              scope: "account",
              error: "Account history access is unavailable; only loaded sidebar chats were collected."
            }]);
            result.complete = false;
            return result;
          });
        });
      }
      return account.source.collectAllConversations(account.options).then(function fallbackFailedDetails(primary) {
        var ids = (primary.index || []).map(function id(item) { return item.id; });
        return collectWithDomFallback(ids, Promise.resolve(primary)).then(function attachWarnings(result) {
          // collectWithDomFallback already carries account-index warnings and
          // adds an explicit rendered-page warning when any detail request
          // required DOM fallback. Preserve both; fallback must never be
          // reported as a verified complete account export.
          result.complete = primary.indexComplete !== false &&
            result.complete !== false &&
            result.failures.length === 0 &&
            (result.warnings || []).length === 0;
          return result;
        });
      }).catch(function accountAllFailed(error) {
        return listAllDomConversations().then(function collectLoaded(list) {
          return collectSelectedConversations(list.map(function id(item) { return item.id; })).then(function markFallback(result) {
            result.warnings = (result.warnings || []).concat([{
              scope: "account",
              error: safeCollectionError(error)
            }]);
            result.complete = false;
            return result;
          });
        });
      });
    }

    // 暴露给同一隔离世界里的页面内面板直接调用；弹窗面板走 chrome.tabs 消息。
    window.__chatgptUsageListConversations = listConversationsForExport;
    window.__chatgptUsageCollectCurrent = collectCurrentConversation;
    window.__chatgptUsageCollectMany = collectSelectedConversations;
    window.__chatgptUsageCollectAll = collectAllConversations;

    chrome.runtime.onMessage.addListener(function handleConversationMessage(message, sender, sendResponse) {
      if (!message) {
        return undefined;
      }
      var exporter = window.ChatGPTUsageExporter;
      var exporterReady = exporter && typeof exporter.collectConversationFromDom === "function";
      if (message.type === "conversation.collect") {
        if (!exporterReady) { sendResponse({ ok: false, error: "exporter-unavailable" }); return true; }
        collectCurrentConversation()
          .then(function (result) {
            sendResponse({
              ok: true,
              conversation: result.conversations[0] || null,
              conversations: result.conversations,
              failures: result.failures,
              warnings: result.warnings || [],
              requestedCount: result.requestedCount,
              complete: result.complete
            });
          })
          .catch(function (e) { sendResponse({ ok: false, error: safeCollectionError(e) }); });
        return true;
      }
      if (message.type === "conversation.list") {
        listConversationsForExport()
          .then(function (result) {
            sendResponse({
              ok: true,
              conversations: result.conversations,
              total: result.total,
              complete: result.complete,
              source: result.source,
              warnings: result.warnings
            });
          })
          .catch(function (e) { sendResponse({ ok: false, error: safeCollectionError(e) }); });
        return true;
      }
      if (message.type === "conversation.collectMany") {
        if (!exporterReady) { sendResponse({ ok: false, error: "exporter-unavailable" }); return true; }
        collectSelectedConversations(message.ids, message.perDelayMs)
          .then(function (result) {
            sendResponse({
              ok: true,
              conversations: result.conversations,
              failures: result.failures,
              warnings: result.warnings || [],
              requestedCount: result.requestedCount,
              complete: result.complete
            });
          })
          .catch(function (e) { sendResponse({ ok: false, error: safeCollectionError(e) }); });
        return true;
      }
      if (message.type === "conversation.collectAll") {
        if (!exporterReady) { sendResponse({ ok: false, error: "exporter-unavailable" }); return true; }
        collectAllConversations()
          .then(function (result) {
            sendResponse({
              ok: true,
              conversations: result.conversations,
              failures: result.failures,
              warnings: result.warnings || [],
              requestedCount: result.requestedCount,
              complete: result.complete
            });
          })
          .catch(function (e) { sendResponse({ ok: false, error: safeCollectionError(e) }); });
        return true;
      }
      return undefined;
    });
  }
})();
