(function initBackground(root) {
  "use strict";

  if (!root.ChatGPTModelCatalog && typeof importScripts === "function") {
    try {
      importScripts("model-catalog.js");
    } catch (firstError) {
      try {
        importScripts("src/model-catalog.js");
      } catch (_) {
        // Service worker tests run without importScripts; direct payload metadata still works.
      }
    }
  }

  var modelCatalog = root.ChatGPTModelCatalog;
  if (!modelCatalog && typeof require === "function") {
    try {
      modelCatalog = require("./model-catalog");
    } catch (_) {
      modelCatalog = null;
    }
  }

  var STORAGE_KEY = "chatgptModelUsageStats.v1";
  var SETTINGS_KEY = "chatgptModelUsageSettings.v1";
  var STATUS_KEY = "chatgptModelUsageOpenAIStatus.v1";
  var STATUS_ALARM_NAME = "chatgpt-model-usage-openai-status";
  var STATUS_ALARM_PERIOD_MINUTES = 5;
  var MAX_EVENTS = 500;
  var MAX_PARAMETER_KEYS = 48;
  var MAX_PARAMETER_ARRAY_ITEMS = 16;
  var MAX_PARAMETER_COMBINATIONS_PER_MODEL = 120;
  var MAX_PARAMETER_FIELD_VALUES = 120;
  var MAX_VARIANTS_PER_MODEL = 120;
  var NETWORK_OBSERVATION_WINDOW_MS = 60000;
  var NETWORK_MATCH_EARLY_MS = 750;
  var NETWORK_MATCH_LATE_MS = 15000;
  var NETWORK_MESSAGE_DOM_EARLY_MS = 15000;
  // Agent/research turns can emit several model-bearing requests before the
  // delayed content-script submission is flushed. Keep enough observations
  // to retain the original request while still bounding memory per tab.
  var MAX_NETWORK_OBSERVATIONS_PER_TAB = 64;
  var USAGE_DEDUPE_WINDOW_MS = 2500;
  var CHATGPT_URL_PATTERNS = ["https://chatgpt.com/*", "https://chat.openai.com/*"];
  var ISOLATED_CONTENT_SCRIPT_FILES = [
    "src/model-catalog.js",
    "src/detector.js",
    "src/exporter.js",
    "src/conversation-source.js",
    "src/dashboard.js",
    "src/content.js"
  ];
  var OPENAI_STATUS_SUMMARY_URL = "https://status.openai.com/api/v2/summary.json";
  var OPENAI_STATUS_PAGE_URL = "https://status.openai.com/";
  var recentNetworkObservationsByTab = {};
  var recentUsageSubmissions = [];
  var usageIncrementQueue = Promise.resolve();
  var NETWORK_MODEL_FIELD_RE = /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/i;
  var NETWORK_SKIP_FIELD_RE = /^(message|messages|mapping|content|contents|parts|inputs?|instructions?|attachments?|files?|file_data|image_url|metadata|variables|conversation|conversation_id|parent_message_id|timezone|history_and_training_disabled|force_paragen|paragen|stream|stream_options|protocol|transport|connection|endpoint|path|url|headers|authorization|cookie|client_secret|access_token|session_id|request_id|event_id)$/i;
  var CONVERSATION_MODE_MODELS = {
    "research": { label: "Deep research", feature: "deep_research" },
    "agent-mode": { label: "Agent mode", feature: "agent_mode" }
  };

  function createEmptyStats() {
    return {
      version: 1,
      totals: {},
      byDate: {},
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      featuresByModel: {},
      parametersByModel: {},
      events: [],
      lastUpdated: null
    };
  }

  function normalizeLanguage(value) {
    return value === "en" ? "en" : "zh";
  }

  function createDefaultSettings() {
    return {
      version: 1,
      language: "zh",
      startDate: "",
      endDate: ""
    };
  }

  function sanitizeDateSetting(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function sanitizeSettings(settings) {
    var base = settings && typeof settings === "object" ? settings : createDefaultSettings();
    return {
      version: 1,
      language: normalizeLanguage(base.language),
      startDate: sanitizeDateSetting(base.startDate),
      endDate: sanitizeDateSetting(base.endDate)
    };
  }

  function todayKey(date) {
    var value = date || new Date();
    var year = value.getFullYear();
    var month = String(value.getMonth() + 1).padStart(2, "0");
    var day = String(value.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function cloneStats(stats) {
    var base = stats && typeof stats === "object" ? stats : createEmptyStats();
    var totals = {};
    var byDate = {};
    var models = {};
    var sessionsByModel = {};
    var variantsByModel = {};
    var featuresByModel = {};
    var parametersByModel = {};
    var sourceTotals = base.totals || {};
    var sourceByDate = base.byDate || {};
    var sourceModels = base.models || {};
    var sourceSessionsByModel = base.sessionsByModel || {};
    var sourceVariantsByModel = base.variantsByModel || {};
    var sourceFeaturesByModel = base.featuresByModel || {};
    var sourceParametersByModel = base.parametersByModel || {};

    Object.keys(sourceTotals).forEach(function copyTotal(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      var count = sanitizeCount(sourceTotals[model]);
      if (count <= 0 || !isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      totals[canonicalModel] = (Number(totals[canonicalModel]) || 0) + count;
      models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
    });

    Object.keys(sourceByDate).forEach(function copyDate(dateKey) {
      var sourceDay = sourceByDate[dateKey] || {};
      var day = {};
      Object.keys(sourceDay).forEach(function copyDayModel(model) {
        var metadata = sourceModels[model];
        var canonicalModel = canonicalStoredModelName(model, metadata);
        var count = sanitizeCount(sourceDay[model]);
        if (count <= 0 || !isStoredModelValid(canonicalModel, metadata, model)) {
          return;
        }

        day[canonicalModel] = (Number(day[canonicalModel]) || 0) + count;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      });
      if (Object.keys(day).length > 0) {
        byDate[dateKey] = day;
      }
    });

    Object.keys(sourceSessionsByModel).forEach(function copyModelSessions(model) {
      var sourceSessions = sourceSessionsByModel[model] || {};
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }
      models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);

      Object.keys(sourceSessions).forEach(function copySession(conversationId) {
        var cleanSession = sanitizeSession(sourceSessions[conversationId], conversationId);
        if (!cleanSession) {
          return;
        }

        cleanSession.models = canonicalizeSessionModelCounts(cleanSession.models, sourceModels);
        if (!cleanSession.models[canonicalModel]) {
          cleanSession.models[canonicalModel] = cleanSession.count;
        }

        if (!sessionsByModel[canonicalModel]) {
          sessionsByModel[canonicalModel] = {};
        }
        sessionsByModel[canonicalModel][conversationId] = mergeSessions(
          sessionsByModel[canonicalModel][conversationId],
          cleanSession
        );
      });
    });

    Object.keys(sourceParametersByModel).forEach(function copyModelParameterStats(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var cleanStats = mergeParameterStats(
        parametersByModel[canonicalModel],
        sourceParametersByModel[model],
        exactRequestModelFromMetadata(metadata)
      );
      if (cleanStats.total > 0 || Object.keys(cleanStats.combinations).length > 0) {
        parametersByModel[canonicalModel] = cleanStats;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      }
    });

    Object.keys(sourceVariantsByModel).forEach(function copyModelVariantStats(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var cleanVariants = mergeVariantStats(variantsByModel[canonicalModel], sourceVariantsByModel[model]);
      if (cleanVariants.total > 0 || Object.keys(cleanVariants.variants).length > 0) {
        variantsByModel[canonicalModel] = cleanVariants;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      }
    });

    Object.keys(sourceFeaturesByModel).forEach(function copyModelFeatureStats(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var cleanFeatures = mergeFeatureStats(featuresByModel[canonicalModel], sourceFeaturesByModel[model]);
      if (cleanFeatures.total > 0 || Object.keys(cleanFeatures.features).length > 0) {
        featuresByModel[canonicalModel] = cleanFeatures;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      }
    });

    return {
      version: 1,
      totals: totals,
      byDate: byDate,
      models: models,
      sessionsByModel: sessionsByModel,
      variantsByModel: variantsByModel,
      featuresByModel: featuresByModel,
      parametersByModel: parametersByModel,
      events: Array.isArray(base.events)
        ? base.events.reduce(function copyEvents(events, event) {
            if (!event) {
              return events;
            }

            var metadata = sourceModels[event.model] || event;
            var canonicalModel = canonicalStoredModelName(event.model, metadata);
            if (!isStoredModelValid(canonicalModel, metadata, event.model)) {
              return events;
            }

            events.push(canonicalizeStoredEvent(event, canonicalModel, metadata));
            models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
            return events;
          }, []).slice(0, MAX_EVENTS)
        : [],
      lastUpdated: base.lastUpdated || null
    };
  }

  function sanitizeModelName(model) {
    var clean = String(model || "").replace(/\s+/g, " ").trim();
    return clean.slice(0, 64);
  }

  function sanitizeTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function extractConversationId(pageUrl) {
    var match = String(pageUrl || "").match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : "";
  }

  function sanitizeSession(session, conversationId) {
    if (!conversationId || !session || typeof session !== "object") {
      return null;
    }

    return {
      conversationId: String(conversationId).slice(0, 128),
      title: sanitizeTitle(session.title),
      count: Number(session.count) || 0,
      models: Object.assign({}, session.models || {}),
      firstSubmittedAt: String(session.firstSubmittedAt || ""),
      lastSubmittedAt: String(session.lastSubmittedAt || ""),
      lastPageUrl: String(session.lastPageUrl || "").slice(0, 500),
      lastPromptHash: String(session.lastPromptHash || "").slice(0, 64),
      lastPromptLength: Number(session.lastPromptLength) || 0
    };
  }

  function isUnresolvedModelName(model) {
    var clean = String(model || "").replace(/\s+/g, " ").trim();
    var key = clean.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return !clean || /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key);
  }

  function normalizedStoredModelSlug(model) {
    return String(model || "")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/_/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .toLowerCase();
  }

  function isDeniedStoredModelName(model) {
    var clean = normalizedStoredModelSlug(model);
    var key = clean.replace(/[^a-z0-9]+/g, "");
    return !clean ||
      /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) ||
      /^(?:gpt)?lastusedmodel$/.test(key);
  }

  function hasDeniedStoredModelName(model) {
    return Boolean(String(model || "").trim() && isDeniedStoredModelName(model));
  }

  function isKnownImageGenerationModelFamily(model) {
    var clean = sanitizeChatGPTModel(model).toLowerCase().replace(/_/g, "-");
    return /^(?:gpt-image|dall-e)(?:$|[-_.]\d)/i.test(clean) || /^image-\d+$/i.test(clean);
  }

  function isConversationModePseudoModel(value) {
    // 深度研究 / 代理模式是模型选择器里的可选项,记成同名条目;它们是合法的用户可见模型行,
    // 不应被「功能名 / 歧义 slug」清理逻辑删除。
    return /^(deep research|agent mode)$/i.test(String(value || "").trim());
  }

  function isFeatureOnlyModelName(model) {
    if (isConversationModePseudoModel(model)) {
      return false;
    }
    return Boolean((!isKnownImageGenerationModelFamily(model) && sanitizeUsageFeatureId(model)) || isFeatureNamedSlug(model));
  }

  function hasKnownModelPrefix(model) {
    if (/^image-\d+-image$/i.test(String(model || "").replace(/_/g, "-"))) {
      return false;
    }
    return /^(?:gpt|o\d|chat|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(String(model || ""));
  }

  function hasGenericModelSlugEvidence(model) {
    var clean = sanitizeChatGPTModel(model).toLowerCase().replace(/_/g, "-");
    if (hasKnownModelPrefix(clean)) {
      return true;
    }
    if (/(?:[-_.](?:thinking|instant|fast|auto|pro))$/i.test(clean) && /(?:^|[-_.])(?:\d{1,4}|latest|preview)(?:$|[-_.])/.test(clean)) {
      return true;
    }
    if (/(?:[-_.](?:latest|preview|realtime|audio|tts|transcribe))$/i.test(clean)) {
      return /(?:^|[-_.])(?:model|family|chat|assistant|response|openai|\d{1,4})(?:$|[-_.])/.test(clean);
    }
    return false;
  }

  function isFeatureNamedSlug(model) {
    var clean = sanitizeChatGPTModel(model).toLowerCase().replace(/_/g, "-");
    if (/^image-\d+-image$/i.test(clean)) {
      return true;
    }
    return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas)(?:$|[-_.])/.test(clean) &&
      !/^(?:gpt-image|dall-e|image-\d)/i.test(clean);
  }

  function isTrustedRequestModelSource(source) {
    return /^(webRequest|fetch-request|xhr-request|fetch-response|xhr-response|fetch-url|xhr-url|message-dom)(?::|$)/i.test(String(source || ""));
  }

  function isAmbiguousChatGPTFamilySlug(model) {
    // Versioned request slugs and public dotted GPT labels are both valid
    // identities. Placeholders and feature-only names are filtered elsewhere.
    return false;
  }

  function hasAmbiguousChatGPTFamilySlug(model) {
    return Boolean(String(model || "").trim() && isAmbiguousChatGPTFamilySlug(model));
  }

  function chatGPTModeLabelFromSlug(model) {
    return "";
  }

  function isActualRequestModel(model) {
    var clean = sanitizeChatGPTModel(model);
    return Boolean(clean && !isDeniedStoredModelName(clean) && !isFeatureOnlyModelName(clean) && isModelSlug(clean) && !isAmbiguousChatGPTFamilySlug(clean));
  }

  function isModelSlug(value) {
    var clean = String(value || "").trim();
    if (modelCatalog && typeof modelCatalog.isRequestModelSlug === "function") {
      return modelCatalog.isRequestModelSlug(clean);
    }
    if (modelCatalog && typeof modelCatalog.isModelSlug === "function" && modelCatalog.isModelSlug(clean)) {
      return true;
    }
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      /[a-z]/i.test(clean) &&
      !isFeatureOnlyModelName(clean) &&
      !isFeatureNamedSlug(clean) &&
      !/^(auto|default|none|null|undefined|chatgpt)$/i.test(clean) &&
      (hasGenericModelSlugEvidence(clean) ||
        (/(?=.*[a-z])(?=.*\d)(?=.*[-_.])^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+$/i.test(clean) &&
          !/^(?:model|reasoning|text|tools?|temperature|max|response|request|conversation|metadata|stream|protocol|transport|endpoint|session)(?:[-_.]|$)/i.test(clean)));
  }

  function exactModelCandidate(first, second) {
    // parameters.model comes from the current request and is authoritative.
    // Never let an older DOM/metadata mode suffix override that exact value.
    return second || first || "";
  }

  function modelParametersFromMetadata(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    if (source.parameters && typeof source.parameters === "object") {
      return source.parameters;
    }
    if (source.modelParameters && typeof source.modelParameters === "object") {
      return source.modelParameters;
    }
    return {};
  }

  function exactRequestModelFromMetadata(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var sourceParameters = modelParametersFromMetadata(source);
    var candidates = [
      sourceParameters.model,
      sourceParameters.api_model,
      sourceParameters.apimodel,
      sourceParameters.chatgpt_model,
      sourceParameters.chatgptmodel,
      sourceParameters.selected_model,
      sourceParameters.selectedmodel,
      sourceParameters.model_slug,
      sourceParameters.modelslug,
      sourceParameters.model_id,
      sourceParameters.modelid,
      source.chatgptModel,
      source.apiModel
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = sanitizeChatGPTModel(candidates[i]);
      if (isActualRequestModel(candidate)) {
        return candidate;
      }
    }
    return "";
  }

  function isStoredModelValid(model, metadata, rawModel) {
    if (isConversationModePseudoModel(model) || isConversationModePseudoModel(metadata && metadata.label)) {
      return true;
    }
    var sourceParameters = modelParametersFromMetadata(metadata);
    var declaredChatGPTModel = sanitizeChatGPTModel(exactModelCandidate(metadata && metadata.chatgptModel, sourceParameters.model));
    if (hasDeniedStoredModelName(rawModel)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(rawModel)) {
      return false;
    }
    if (isDeniedStoredModelName(model)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(model)) {
      return false;
    }
    if (isFeatureOnlyModelName(model)) {
      return false;
    }

    if (hasDeniedStoredModelName(metadata && metadata.label)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(metadata && metadata.label)) {
      return false;
    }
    if (hasDeniedStoredModelName(metadata && metadata.apiModel)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(metadata && metadata.apiModel)) {
      return false;
    }
    if (hasDeniedStoredModelName(declaredChatGPTModel)) {
      return false;
    }
    if (isFeatureOnlyModelName(declaredChatGPTModel)) {
      return false;
    }
    if (isAmbiguousChatGPTFamilySlug(declaredChatGPTModel)) {
      return false;
    }

    if (model === "chat-latest" && metadata && metadata.apiModel && metadata.apiModel !== "chat-latest") {
      return false;
    }

    // Stored aggregates may contain false positives created by an older DOM
    // detector (for example ordinary buttons such as "Share"). Keep only a
    // model identity that still has model-shaped evidence after
    // canonicalization. Conversation-mode rows are handled explicitly above.
    return isActualRequestModel(model);
  }

  function exactLabelFallback(slug) {
    return sanitizeModelName(slug);
  }

  function canonicalStoredModelName(model, metadata) {
    var rawModel = sanitizeModelName(model);
    var sourceParameters = modelParametersFromMetadata(metadata);
    var exactModel = sanitizeChatGPTModel(exactModelCandidate(metadata && metadata.chatgptModel, sourceParameters.model));
    if (isActualRequestModel(exactModel)) {
      var exactModeLabel = chatGPTModeLabelFromSlug(exactModel);
      if (exactModeLabel) {
        return exactModeLabel;
      }
      if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
        var exactResolved = modelCatalog.resolveModelInfo(exactModel);
        if (exactResolved && exactResolved.label) {
          return sanitizeModelName(exactResolved.label);
        }
      }
      return exactLabelFallback(exactModel);
    }

    var apiModel = sanitizeChatGPTModel(metadata && metadata.apiModel);
    if (isActualRequestModel(apiModel)) {
      var apiModeLabel = chatGPTModeLabelFromSlug(apiModel);
      if (apiModeLabel) {
        return apiModeLabel;
      }
      if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
        var apiResolved = modelCatalog.resolveModelInfo(apiModel);
        if (apiResolved && apiResolved.label) {
          return sanitizeModelName(apiResolved.label);
        }
      }
      return exactLabelFallback(apiModel);
    }

    var candidates = [
      rawModel,
      metadata && metadata.label,
      metadata && metadata.apiModel
    ];

    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      for (var i = 0; i < candidates.length; i += 1) {
        var resolved = modelCatalog.resolveModelInfo(candidates[i]);
        if (resolved && resolved.label) {
          return sanitizeModelName(resolved.label);
        }
      }
    }

    return exactLabelFallback(rawModel);
  }

  function resolveStoredModelMetadata(canonicalModel, metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var candidates = [
      canonicalModel,
      source.chatgptModel,
      source.apiModel,
      source.label
    ];

    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      for (var i = 0; i < candidates.length; i += 1) {
        var resolved = modelCatalog.resolveModelInfo(candidates[i]);
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  function mergeStoredModelMetadata(existing, canonicalModel, metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var previous = existing && typeof existing === "object" ? existing : {};
    var resolved = resolveStoredModelMetadata(canonicalModel, source);
    var sourceParameters = modelParametersFromMetadata(source);
    if (Object.keys(sourceParameters).length === 0) {
      sourceParameters = modelParametersFromMetadata(previous);
    }
    var requestModel = exactRequestModelFromMetadata({
      parameters: sourceParameters,
      chatgptModel: source.chatgptModel || previous.chatgptModel,
      apiModel: source.apiModel || previous.apiModel
    });
    var apiModel = sanitizeApiModel(
      requestModel || source.apiModel || previous.apiModel || (resolved && resolved.apiModel)
    );
    var chatgptModel = sanitizeChatGPTModel(requestModel || source.chatgptModel || previous.chatgptModel);
    var mode = sanitizeModelMode((resolved && resolved.mode) || source.mode || previous.mode);
    var observedSource = String(source.observedSource || previous.observedSource || "").slice(0, 64);
    var parameters = sanitizeModelParameters(sourceParameters, apiModel);
    if (requestModel) {
      parameters.model = requestModel;
    }

    return {
      label: canonicalModel,
      apiModel: apiModel,
      chatgptModel: chatgptModel,
      mode: mode,
      observedSource: observedSource,
      deprecated: Boolean(source.deprecated || previous.deprecated || (resolved && resolved.deprecated)),
      parameters: parameters
    };
  }

  function canonicalizeStoredEvent(event, canonicalModel, metadata) {
    var sourceEvent = event && typeof event === "object" ? event : {};
    var requestModel = exactRequestModelFromMetadata(sourceEvent) || exactRequestModelFromMetadata(metadata);
    var eventParameters = sanitizeModelParameters(sourceEvent.modelParameters || sourceEvent.parameters || {}, "");
    if (requestModel) {
      eventParameters.model = requestModel;
    }

    var resolved = requestModel && modelCatalog && typeof modelCatalog.resolveModelInfo === "function"
      ? modelCatalog.resolveModelInfo(requestModel)
      : null;
    var apiModel = requestModel || sanitizeApiModel(sourceEvent.apiModel);
    var chatgptModel = requestModel || sanitizeChatGPTModel(sourceEvent.chatgptModel);
    var modelMode = sanitizeModelMode((resolved && resolved.mode) || sourceEvent.modelMode || sourceEvent.mode);

    return Object.assign({}, sourceEvent, {
      model: canonicalModel,
      apiModel: apiModel,
      chatgptModel: chatgptModel,
      modelMode: modelMode,
      modelParameters: eventParameters,
      usageFeatures: normalizeUsageFeatures(sourceEvent.usageFeatures, eventParameters, canonicalModel)
    });
  }

  function canonicalizeSessionModelCounts(modelCounts, sourceModels) {
    var clean = {};
    Object.keys(modelCounts || {}).forEach(function copyModelCount(model) {
      var metadata = (sourceModels && sourceModels[model]) || {};
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var count = sanitizeCount(modelCounts[model]);
      if (count <= 0) {
        return;
      }

      clean[canonicalModel] = (Number(clean[canonicalModel]) || 0) + count;
    });
    return clean;
  }

  function mergeTimestamp(earliest, latest, preferEarliest) {
    var left = String(earliest || "");
    var right = String(latest || "");
    if (!left) return right;
    if (!right) return left;
    return preferEarliest ? (left < right ? left : right) : (left > right ? left : right);
  }

  function mergeSessions(existing, session) {
    var source = sanitizeSession(session, session && session.conversationId);
    if (!source) {
      return existing || null;
    }

    var target = sanitizeSession(existing, existing && existing.conversationId);
    if (!target) {
      return source;
    }

    var mergedModels = {};
    Object.keys(target.models || {}).forEach(function copyTargetModel(model) {
      mergedModels[model] = (Number(mergedModels[model]) || 0) + sanitizeCount(target.models[model]);
    });
    Object.keys(source.models || {}).forEach(function copySourceModel(model) {
      mergedModels[model] = (Number(mergedModels[model]) || 0) + sanitizeCount(source.models[model]);
    });

    var sourceIsNewer = String(source.lastSubmittedAt || "") >= String(target.lastSubmittedAt || "");
    return sanitizeSession(
      {
        conversationId: target.conversationId || source.conversationId,
        title: sourceIsNewer ? source.title || target.title : target.title || source.title,
        count: sanitizeCount(target.count) + sanitizeCount(source.count),
        models: mergedModels,
        firstSubmittedAt: mergeTimestamp(target.firstSubmittedAt, source.firstSubmittedAt, true),
        lastSubmittedAt: mergeTimestamp(target.lastSubmittedAt, source.lastSubmittedAt, false),
        lastPageUrl: sourceIsNewer ? source.lastPageUrl || target.lastPageUrl : target.lastPageUrl || source.lastPageUrl,
        lastPromptHash: sourceIsNewer ? source.lastPromptHash || target.lastPromptHash : target.lastPromptHash || source.lastPromptHash,
        lastPromptLength: sourceIsNewer ? source.lastPromptLength || target.lastPromptLength : target.lastPromptLength || source.lastPromptLength
      },
      target.conversationId || source.conversationId
    );
  }

  function sanitizeApiModel(apiModel) {
    return String(apiModel || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 96);
  }

  function sanitizeChatGPTModel(chatgptModel) {
    var clean = String(chatgptModel || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 96);
    if (modelCatalog && typeof modelCatalog.canonicalizeChatGPTModeSlug === "function") {
      return modelCatalog.canonicalizeChatGPTModeSlug(clean);
    }
    return clean.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
  }

  function sanitizeModelMode(mode) {
    return String(mode || "")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 32);
  }

  function normalizeParameterKeyPart(key) {
    return String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_.-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 64);
  }

  function isDeniedParameterPart(part) {
    return /^(message|messages|mapping|content|contents|parts|inputs?|instructions?|attachments?|files?|file_data|image_url|metadata|variables|conversation|conversation_id|parent_message_id|timezone|history_and_training_disabled|force_paragen|paragen|system|developer|user|stream|stream_options|protocol|transport|connection|endpoint|path|url|headers|authorization|cookie|client_secret|access_token|token|session_id|request_id|event_id|supports_buffering|supported_encodings|system_hints|conversation_mode|api_model|apimodel|chatgpt_model|chatgptmodel|model_mode|modelmode|model_observed_source|observed_source|source|label)$/i.test(part);
  }

  function isKnownTopLevelParameter(part) {
    return /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel|temperature|top_p|top_k|top_logprobs|logprobs|logit_bias|frequency_penalty|presence_penalty|max_tokens|max_output_tokens|max_completion_tokens|max_response_output_tokens|max_tool_calls|seed|n|stop|tool_choice|parallel_tool_calls|modalities|output_modalities|speed|service_tier|store|truncation|prompt_cache_key|prompt_cache_retention|safety_identifier|include|input_audio_format|output_audio_format|timestamp_granularities|best_of|suffix|echo)$/i.test(part);
  }

  function isKnownNestedParameterRoot(part) {
    return /^(reasoning|text|audio|prediction|prompt|response_format|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/i.test(part);
  }

  function isContainerOnlyParameterRoot(part) {
    return /^(reasoning|text|audio|prediction|response_format|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/i.test(part);
  }

  function canonicalParameterAlias(clean, parent) {
    if (clean === "reasoning_effort" || (clean === "effort" && parent === "reasoning")) {
      return "reasoning.effort";
    }
    if ((clean === "verbosity" && parent === "text") || clean === "verbosity" || clean === "text_verbosity") {
      return "text.verbosity";
    }
    if (clean === "topp") {
      return "top_p";
    }
    if (clean === "topk") {
      return "top_k";
    }
    if (clean === "toolchoice") {
      return "tool_choice";
    }
    if (clean === "responseformat") {
      return "response_format";
    }
    return clean;
  }

  function canonicalParameterPath(path, key) {
    var rawKey = String(key || "");
    var clean = normalizeParameterKeyPart(rawKey);
    var parts = (Array.isArray(path) ? path : [])
      .map(normalizeParameterKeyPart)
      .filter(Boolean);

    if (NETWORK_MODEL_FIELD_RE.test(rawKey) && parts.length === 0) {
      return clean;
    }

    if (!clean || isDeniedParameterPart(clean)) {
      return "";
    }

    for (var i = 0; i < parts.length; i += 1) {
      if (isDeniedParameterPart(parts[i])) {
        return "";
      }
    }

    var parent = parts.length ? parts[parts.length - 1] : "";
    clean = canonicalParameterAlias(clean, parent);

    if (clean === "model" && parts.length === 0) {
      return "model";
    }
    if (clean === "prompt" || clean === "prompts") {
      return "";
    }
    if (parts.length === 0 && isContainerOnlyParameterRoot(clean)) {
      return "";
    }
    if (parts.length === 0 && clean === "tools") {
      return "";
    }
    if (clean.indexOf(".") >= 0) {
      var directRoot = clean.split(".")[0];
      return isKnownNestedParameterRoot(directRoot) && !clean.split(".").some(isDeniedParameterPart) ? clean.slice(0, 64) : "";
    }

    if (parts.length > 0) {
      var rootPart = canonicalParameterAlias(parts[0], "");
      if (rootPart === "prompt" && !/^(id|version)$/i.test(clean)) {
        return "";
      }
      if (!isKnownNestedParameterRoot(rootPart)) {
        return "";
      }
      return parts.concat(clean).slice(0, 4).join(".").slice(0, 64);
    }

    if (isKnownTopLevelParameter(clean)) {
      return clean;
    }

    return "";
  }

  function canonicalModelParameterKey(key) {
    return canonicalParameterPath([], key);
  }

  function sanitizeModelParameterValue(value) {
    if (Array.isArray(value)) {
      var cleanItems = value
        .slice(0, MAX_PARAMETER_ARRAY_ITEMS)
        .map(function sanitizeArrayParameterItem(item) {
          if (item && typeof item === "object") {
            try {
              return JSON.stringify(item).slice(0, 160);
            } catch (_) {
              return "";
            }
          }
          return sanitizeParameterArrayItem(item);
        })
        .filter(Boolean);
      return cleanItems.length > 0 ? cleanItems : undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (value === null || typeof value === "undefined") {
      return undefined;
    }

    if (typeof value === "object") {
      try {
        var json = JSON.stringify(value).slice(0, 240);
        return json || undefined;
      } catch (_) {
        return undefined;
      }
    }

    var cleanValue = String(value).replace(/\s+/g, " ").trim().slice(0, 128);
    return cleanValue || undefined;
  }

  function sanitizeModelParameters(parameters, apiModel) {
    var source = parameters && typeof parameters === "object" ? parameters : {};
    var clean = {};

    Object.keys(source).some(function copy(key) {
      var safeKey = canonicalModelParameterKey(key);
      if (!safeKey) {
        return false;
      }

      var cleanValue = sanitizeModelParameterValue(source[key]);
      if (cleanValue !== undefined) {
        if (NETWORK_MODEL_FIELD_RE.test(safeKey)) {
          cleanValue = sanitizeChatGPTModel(cleanValue);
        }
        clean[safeKey] = cleanValue;
      }

      return Object.keys(clean).length >= MAX_PARAMETER_KEYS;
    });

    return clean;
  }

  function sanitizeParameterKey(key) {
    return String(key || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
  }

  function networkModelFieldPriority(key) {
    var clean = normalizeParameterKeyPart(key);
    if (clean === "model") {
      return 100;
    }
    if (clean === "api_model" || clean === "apimodel" || clean === "chatgpt_model" || clean === "chatgptmodel") {
      return 90;
    }
    if (clean === "selected_model" || clean === "selectedmodel") {
      return 80;
    }
    if (clean === "model_slug" || clean === "modelslug" || clean === "model_id" || clean === "modelid") {
      return 60;
    }
    return 0;
  }

  function canonicalNetworkParameterKey(path, key) {
    return canonicalParameterPath(path, key);
  }

  function sanitizeParameterArrayItem(item) {
    if (typeof item === "boolean") {
      return String(item);
    }

    if (typeof item === "number") {
      return Number.isFinite(item) ? String(item) : "";
    }

    return String(item || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
  }

  function createEmptyParameterStats() {
    return {
      total: 0,
      combinations: {},
      fields: {}
    };
  }

  function sanitizeCount(value) {
    var count = Number(value) || 0;
    if (!Number.isFinite(count) || count < 0) {
      return 0;
    }
    return Math.floor(count);
  }

  function parameterValueKey(value) {
    if (Array.isArray(value)) {
      return JSON.stringify(value).slice(0, 512);
    }

    if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }

    return String(value || "").slice(0, 512);
  }

  function parameterCombinationKey(parameters) {
    var keys = Object.keys(parameters || {}).sort();
    return JSON.stringify(
      keys.map(function mapPair(key) {
        return [key, parameters[key]];
      })
    );
  }

  function addParameterFieldCounts(fields, parameters, count) {
    var amount = sanitizeCount(count);
    if (amount <= 0) {
      return;
    }

    Object.keys(parameters || {}).forEach(function countField(key) {
      var safeKey = sanitizeParameterKey(key);
      var valueKey = parameterValueKey(parameters[key]);
      if (!safeKey || !valueKey) {
        return;
      }

      if (!fields[safeKey]) {
        fields[safeKey] = {};
      }
      fields[safeKey][valueKey] = (sanitizeCount(fields[safeKey][valueKey]) || 0) + amount;
      trimCountMap(fields[safeKey], MAX_PARAMETER_FIELD_VALUES);
    });
  }

  function trimCountMap(counts, maxEntries) {
    var keys = Object.keys(counts || {});
    if (keys.length <= maxEntries) {
      return;
    }

    keys
      .sort(function byCountThenName(left, right) {
        var countDelta = sanitizeCount(counts[right]) - sanitizeCount(counts[left]);
        return countDelta || left.localeCompare(right);
      })
      .slice(maxEntries)
      .forEach(function removeKey(key) {
        delete counts[key];
      });
  }

  function trimParameterCombinations(combinations) {
    var keys = Object.keys(combinations || {});
    if (keys.length <= MAX_PARAMETER_COMBINATIONS_PER_MODEL) {
      return;
    }

    keys
      .sort(function byRecency(left, right) {
        var leftEntry = combinations[left] || {};
        var rightEntry = combinations[right] || {};
        return String(rightEntry.lastSubmittedAt || "").localeCompare(String(leftEntry.lastSubmittedAt || ""));
      })
      .slice(MAX_PARAMETER_COMBINATIONS_PER_MODEL)
      .forEach(function removeCombination(key) {
        delete combinations[key];
      });
  }

  function sanitizeParameterFields(fields) {
    var clean = {};
    var source = fields && typeof fields === "object" ? fields : {};

    Object.keys(source)
      .slice(0, MAX_PARAMETER_KEYS)
      .forEach(function copyField(field) {
        var safeField = canonicalModelParameterKey(field);
        var sourceCounts = source[field];
        var cleanCounts = {};
        if (!safeField || !sourceCounts || typeof sourceCounts !== "object" || Array.isArray(sourceCounts)) {
          return;
        }

        Object.keys(sourceCounts).forEach(function copyValue(valueKey) {
          var safeValueKey = String(valueKey || "").slice(0, 512);
          var count = sanitizeCount(sourceCounts[valueKey]);
          if (!safeValueKey || count <= 0) {
            return;
          }
          cleanCounts[safeValueKey] = (sanitizeCount(cleanCounts[safeValueKey]) || 0) + count;
        });

        trimCountMap(cleanCounts, MAX_PARAMETER_FIELD_VALUES);
        if (Object.keys(cleanCounts).length > 0) {
          clean[safeField] = cleanCounts;
        }
      });

    return clean;
  }

  function mergeParameterFields(target, source) {
    Object.keys(source || {}).forEach(function mergeField(field) {
      if (!target[field]) {
        target[field] = {};
      }

      Object.keys(source[field] || {}).forEach(function mergeValue(valueKey) {
        target[field][valueKey] = Math.max(sanitizeCount(target[field][valueKey]), sanitizeCount(source[field][valueKey]));
      });
      trimCountMap(target[field], MAX_PARAMETER_FIELD_VALUES);
    });
  }

  function sanitizeParameterStats(parameterStats) {
    var clean = createEmptyParameterStats();
    var source = parameterStats && typeof parameterStats === "object" ? parameterStats : {};
    var sourceCombinations = source.combinations && typeof source.combinations === "object" ? source.combinations : {};
    var combinationTotal = 0;

    Object.keys(sourceCombinations).forEach(function copyCombination(key) {
      var sourceCombination = sourceCombinations[key];
      if (!sourceCombination || typeof sourceCombination !== "object") {
        return;
      }

      var parameters = sanitizeModelParameters(sourceCombination.parameters || {}, "");
      if (Object.keys(parameters).length === 0) {
        return;
      }

      var count = sanitizeCount(sourceCombination.count);
      if (count <= 0) {
        return;
      }

      var stableKey = parameterCombinationKey(parameters);
      var existing = clean.combinations[stableKey];
      if (!existing) {
        existing = {
          count: 0,
          parameters: parameters,
          firstSubmittedAt: String(sourceCombination.firstSubmittedAt || ""),
          lastSubmittedAt: String(sourceCombination.lastSubmittedAt || "")
        };
        clean.combinations[stableKey] = existing;
      }

      existing.count += count;
      var sourceFirstSubmittedAt = String(sourceCombination.firstSubmittedAt || "");
      var sourceLastSubmittedAt = String(sourceCombination.lastSubmittedAt || "");
      if (sourceFirstSubmittedAt && (!existing.firstSubmittedAt || sourceFirstSubmittedAt < existing.firstSubmittedAt)) {
        existing.firstSubmittedAt = sourceFirstSubmittedAt;
      }
      if (sourceLastSubmittedAt > existing.lastSubmittedAt) {
        existing.lastSubmittedAt = sourceLastSubmittedAt;
      }
      combinationTotal += count;
    });

    trimParameterCombinations(clean.combinations);
    clean.fields = sanitizeParameterFields(source.fields);
    var fieldsFromCombinations = {};
    Object.keys(clean.combinations).forEach(function buildFieldFromCombination(key) {
      var combination = clean.combinations[key];
      addParameterFieldCounts(fieldsFromCombinations, combination.parameters, combination.count);
    });
    mergeParameterFields(clean.fields, fieldsFromCombinations);
    clean.total = Math.max(sanitizeCount(source.total), combinationTotal);

    return clean;
  }

  function addParameterFieldTotals(target, source) {
    Object.keys(source || {}).forEach(function mergeField(field) {
      if (!target[field]) {
        target[field] = {};
      }

      Object.keys(source[field] || {}).forEach(function mergeValue(valueKey) {
        target[field][valueKey] = sanitizeCount(target[field][valueKey]) + sanitizeCount(source[field][valueKey]);
      });
      trimCountMap(target[field], MAX_PARAMETER_FIELD_VALUES);
    });
  }

  function mergeParameterCombinations(target, source) {
    Object.keys(source || {}).forEach(function mergeCombination(key) {
      var sourceCombination = source[key];
      if (!sourceCombination || typeof sourceCombination !== "object") {
        return;
      }

      var stableKey = parameterCombinationKey(sourceCombination.parameters || {});
      if (!stableKey || sanitizeCount(sourceCombination.count) <= 0) {
        return;
      }

      var existing = target[stableKey] || {
        count: 0,
        parameters: sourceCombination.parameters,
        firstSubmittedAt: String(sourceCombination.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceCombination.lastSubmittedAt || "")
      };
      existing.count = sanitizeCount(existing.count) + sanitizeCount(sourceCombination.count);
      existing.parameters = sourceCombination.parameters;
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, sourceCombination.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, sourceCombination.lastSubmittedAt, false);
      target[stableKey] = existing;
    });
    trimParameterCombinations(target);
  }

  function normalizeParameterStatsRequestModel(parameterStats, requestModel) {
    var clean = sanitizeParameterStats(parameterStats);
    var model = sanitizeChatGPTModel(requestModel);
    if (!isActualRequestModel(model)) {
      return clean;
    }

    var normalized = createEmptyParameterStats();
    normalized.total = sanitizeCount(clean.total);
    Object.keys(clean.fields || {}).forEach(function copyField(field) {
      if (field !== "model") {
        normalized.fields[field] = Object.assign({}, clean.fields[field]);
      }
    });

    var combinationModelTotal = 0;
    Object.keys(clean.combinations || {}).forEach(function copyCombination(key) {
      var sourceCombination = clean.combinations[key];
      var parameters = Object.assign({}, sourceCombination.parameters || {}, { model: model });
      var stableKey = parameterCombinationKey(parameters);
      var existing = normalized.combinations[stableKey] || {
        count: 0,
        parameters: parameters,
        firstSubmittedAt: String(sourceCombination.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceCombination.lastSubmittedAt || "")
      };
      var count = sanitizeCount(sourceCombination.count);
      existing.count += count;
      existing.parameters = parameters;
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, sourceCombination.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, sourceCombination.lastSubmittedAt, false);
      normalized.combinations[stableKey] = existing;
      combinationModelTotal += count;
    });

    var legacyModelFieldTotal = Object.keys((clean.fields && clean.fields.model) || {}).reduce(function sum(total, valueKey) {
      return total + sanitizeCount(clean.fields.model[valueKey]);
    }, 0);
    var modelFieldTotal = Math.max(combinationModelTotal, legacyModelFieldTotal, sanitizeCount(clean.total));
    if (modelFieldTotal > 0) {
      normalized.fields.model = {};
      normalized.fields.model[model] = modelFieldTotal;
    }

    return sanitizeParameterStats(normalized);
  }

  function mergeParameterStats(targetStats, sourceStats, requestModel) {
    var target = sanitizeParameterStats(targetStats);
    var source = normalizeParameterStatsRequestModel(sourceStats, requestModel);
    var merged = createEmptyParameterStats();

    merged.total = sanitizeCount(target.total) + sanitizeCount(source.total);
    mergeParameterCombinations(merged.combinations, target.combinations);
    mergeParameterCombinations(merged.combinations, source.combinations);
    addParameterFieldTotals(merged.fields, target.fields);
    addParameterFieldTotals(merged.fields, source.fields);
    return sanitizeParameterStats(merged);
  }

  function sanitizeVariantName(value) {
    var clean = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 128);
    if (modelCatalog && typeof modelCatalog.resolveModelLabel === "function") {
      return modelCatalog.resolveModelLabel(clean) || clean;
    }
    return clean;
  }

  function createEmptyVariantStats() {
    return {
      total: 0,
      variants: {}
    };
  }

  function trimVariants(variants) {
    var keys = Object.keys(variants || {});
    if (keys.length <= MAX_VARIANTS_PER_MODEL) {
      return;
    }

    keys
      .sort(function byCountThenRecent(left, right) {
        var leftEntry = variants[left] || {};
        var rightEntry = variants[right] || {};
        var countDelta = sanitizeCount(rightEntry.count) - sanitizeCount(leftEntry.count);
        return countDelta || String(rightEntry.lastSubmittedAt || "").localeCompare(String(leftEntry.lastSubmittedAt || ""));
      })
      .slice(MAX_VARIANTS_PER_MODEL)
      .forEach(function removeVariant(key) {
        delete variants[key];
      });
  }

  function sanitizeVariantStats(variantStats) {
    var clean = createEmptyVariantStats();
    var source = variantStats && typeof variantStats === "object" ? variantStats : {};
    var variants = source.variants && typeof source.variants === "object" ? source.variants : {};
    var total = 0;

    Object.keys(variants).forEach(function copyVariant(key) {
      var sourceVariant = variants[key];
      if (!sourceVariant || typeof sourceVariant !== "object") {
        return;
      }

      var name = sanitizeVariantName(sourceVariant.name || key);
      var count = sanitizeCount(sourceVariant.count);
      if (!name || count <= 0 || isUnresolvedModelName(name)) {
        return;
      }

      clean.variants[name] = {
        name: name,
        count: (clean.variants[name] ? sanitizeCount(clean.variants[name].count) : 0) + count,
        apiModel: sanitizeApiModel(sourceVariant.apiModel),
        mode: sanitizeModelMode(sourceVariant.mode),
        firstSubmittedAt: String(sourceVariant.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceVariant.lastSubmittedAt || "")
      };
      total += count;
    });

    trimVariants(clean.variants);
    clean.total = Math.max(sanitizeCount(source.total), total);
    return clean;
  }

  function mergeVariantEntries(target, source) {
    Object.keys(source || {}).forEach(function mergeVariant(key) {
      var sourceVariant = source[key];
      if (!sourceVariant || typeof sourceVariant !== "object") {
        return;
      }

      var name = sanitizeVariantName(sourceVariant.name || key);
      var count = sanitizeCount(sourceVariant.count);
      if (!name || count <= 0 || isUnresolvedModelName(name)) {
        return;
      }

      var existing = target[name] || {
        name: name,
        count: 0,
        apiModel: "",
        mode: "",
        firstSubmittedAt: "",
        lastSubmittedAt: ""
      };
      existing.count = sanitizeCount(existing.count) + count;
      existing.apiModel = sanitizeApiModel(sourceVariant.apiModel || existing.apiModel);
      existing.mode = sanitizeModelMode(sourceVariant.mode || existing.mode);
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, sourceVariant.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, sourceVariant.lastSubmittedAt, false);
      target[name] = existing;
    });
    trimVariants(target);
  }

  function mergeVariantStats(targetStats, sourceStats) {
    var target = sanitizeVariantStats(targetStats);
    var source = sanitizeVariantStats(sourceStats);
    var merged = createEmptyVariantStats();

    merged.total = sanitizeCount(target.total) + sanitizeCount(source.total);
    mergeVariantEntries(merged.variants, target.variants);
    mergeVariantEntries(merged.variants, source.variants);
    return sanitizeVariantStats(merged);
  }

  function updateVariantStats(stats, model, modelInfo, submittedAt) {
    var variantName = sanitizeVariantName(
      (modelInfo && modelInfo.parameters && modelInfo.parameters.model) ||
        (modelInfo && modelInfo.chatgptModel) ||
        (modelInfo && modelInfo.apiModel)
    );
    if (!model || !variantName || isUnresolvedModelName(variantName)) {
      return;
    }

    if (!stats.variantsByModel) {
      stats.variantsByModel = {};
    }

    var modelStats = sanitizeVariantStats(stats.variantsByModel[model]);
    var variant = modelStats.variants[variantName] || {
      name: variantName,
      count: 0,
      apiModel: modelInfo.apiModel,
      mode: modelInfo.mode,
      firstSubmittedAt: submittedAt,
      lastSubmittedAt: ""
    };
    variant.count = sanitizeCount(variant.count) + 1;
    variant.apiModel = modelInfo.apiModel;
    variant.mode = modelInfo.mode || variant.mode;
    variant.firstSubmittedAt = variant.firstSubmittedAt || submittedAt;
    variant.lastSubmittedAt = submittedAt;
    modelStats.variants[variantName] = variant;
    modelStats.total = sanitizeCount(modelStats.total) + 1;
    trimVariants(modelStats.variants);
    stats.variantsByModel[model] = modelStats;
  }

  function sanitizeUsageFeatureId(value) {
    var clean = String(value || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/[-_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
    var versionless = clean.replace(/_v\d+$/, "");
    if (/^(gpt_image|dalle|dall_e)$/.test(clean)) return "image_generation";
    if (/^(image|images|image_generation|imagegen)$/.test(versionless)) return "image_generation";
    if (/^(deep_research|deepresearch|deep_search|deepsearch|research)$/.test(versionless)) return "deep_research";
    if (/^(agent|agent_mode|agentmode)$/.test(versionless)) return "agent_mode";
    if (/^(web_search|websearch|search)$/.test(versionless)) return "web_search";
    if (/^(realtime|real_time|realtime_mode|real_time_mode)$/.test(versionless)) return "realtime";
    if (/^(audio|audiomode|audio_mode|voice|voicemode|voice_mode|advanced_voice|input_audio|output_audio|transcription|transcribe|tts|whisper)$/.test(versionless)) return "audio";
    if (/^(canvas|canvases|canvas_mode|canvasmode)$/.test(versionless)) return "canvas";
    if (/^(file_upload|fileupload|attachment|attachments|file_attachment)$/.test(versionless)) return "file_upload";
    if (/^(code_interpreter|codeinterpreter|data_analysis|dataanalysis|python)$/.test(versionless)) return "code_interpreter";
    if (/^(gpts|gpt_id|gptid|gizmo|gizmo_id|gizmoid|custom_gpt|customgpt)$/.test(versionless)) return "gpts";
    if (/^(tasks|scheduled_task|scheduledtask|scheduled_tasks)$/.test(versionless)) return "tasks";
    return "";
  }

  function usageFeatureName(id) {
    var clean = sanitizeUsageFeatureId(id);
    if (clean === "image_generation") return "Image generation";
    if (clean === "deep_research") return "Deep research";
    if (clean === "agent_mode") return "Agent mode";
    if (clean === "web_search") return "Web search";
    if (clean === "realtime") return "Realtime";
    if (clean === "audio") return "Audio";
    if (clean === "canvas") return "Canvas";
    if (clean === "file_upload") return "File upload";
    if (clean === "code_interpreter") return "Code interpreter";
    if (clean === "gpts") return "GPTs";
    if (clean === "tasks") return "Tasks";
    return clean;
  }

  function addUsageFeature(target, feature) {
    var clean = sanitizeUsageFeatureId(feature);
    if (clean) {
      target[clean] = true;
    }
  }

  function addUsageFeatureFromModel(target, model) {
    var clean = String(model || "").toLowerCase();
    if (/^(?:dall-e|gpt-image|image)/.test(clean)) {
      addUsageFeature(target, "image_generation");
    }
    if (/deep[-_]?(research|search)|deepsearch/.test(clean)) {
      addUsageFeature(target, "deep_research");
    }
    if (/agent[-_]?mode|agentic/.test(clean)) {
      addUsageFeature(target, "agent_mode");
    }
    if (/web[-_]?search/.test(clean)) {
      addUsageFeature(target, "web_search");
    }
    if (/realtime/.test(clean)) {
      addUsageFeature(target, "realtime");
    }
    if (/audio|tts|whisper|transcribe/.test(clean)) {
      addUsageFeature(target, "audio");
    }
    if (/canvas/.test(clean)) {
      addUsageFeature(target, "canvas");
    }
  }

  function featureTextFromValue(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 16).map(featureTextFromValue).join(" ");
    }
    if (typeof value === "object") {
      if (isDisabledUsageFeatureSignal(value)) {
        return "";
      }
      return Object.keys(value).slice(0, 12).map(function part(key) {
        if (isDisabledUsageFeatureSignal(value[key])) {
          return "";
        }
        return key + " " + featureTextFromValue(value[key]);
      }).filter(Boolean).join(" ");
    }
    return "";
  }

  function isDisabledUsageFeatureSignal(value) {
    if (value === false || value === 0) {
      return true;
    }
    if (typeof value === "string" && /^(?:false|off|disabled|none)$/i.test(value.replace(/\s+/g, " ").trim())) {
      return true;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.enabled === false || value.disabled === true || value.excluded === true) {
        return true;
      }
    }
    return false;
  }

  function addUsageFeatureFromSignal(target, keyPath, value) {
    if (isDisabledUsageFeatureSignal(value)) {
      return;
    }
    var keyText = String(keyPath || "").toLowerCase();
    var valueText = featureTextFromValue(value).toLowerCase();
    var combined = keyText + " " + valueText;
    if (/image[_\-\s]?generation|imagegen|gpt[_\-\s]?image|dall[_\-\s]?e/.test(combined)) {
      addUsageFeature(target, "image_generation");
    }
    if (/deep[_\-\s]?(research|search)|deepsearch/.test(combined)) {
      addUsageFeature(target, "deep_research");
    }
    if (/agent[_\-\s]?mode|agentmode|agentic/.test(combined) || (/conversation[_\-\s]?mode/.test(keyText) && /\bagent\b/.test(valueText))) {
      addUsageFeature(target, "agent_mode");
    }
    if (/web[_\-\s]?search/.test(combined)) {
      addUsageFeature(target, "web_search");
    }
    if (/(^|[._\-\s])search($|[._\-\s])/.test(combined) && /(^|[._\-\s])(?:search|tools?|enabled[_\-\s]?tools)($|[._\-\s])/.test(keyText)) {
      addUsageFeature(target, "web_search");
    }
    // ChatGPT 当前真实信号(实测请求体):网页搜索=force_use_search / system_hints:["search"];
    // 深度研究=system_hints:["connector:...deep_research"];代理模式=system_hints:["agent"]。
    if (/system[_\-\s]?hints?/.test(keyText) || /force[_\-\s]?use[_\-\s]?search/.test(keyText) || /search[_\-\s]?source/.test(keyText)) {
      if (/force[_\-\s]?use[_\-\s]?search/.test(keyText) || /(^|[^a-z])search([^a-z]|$)/.test(valueText) || /web[_\-\s]?icon/.test(valueText)) {
        addUsageFeature(target, "web_search");
      }
      if (/deep[_\-\s]?research|(^|[^a-z])research([^a-z]|$)/.test(valueText)) {
        addUsageFeature(target, "deep_research");
      }
      if (/(^|[^a-z])agent([^a-z]|$)/.test(valueText)) {
        addUsageFeature(target, "agent_mode");
      }
    }
    if (/realtime|real[_\-\s]?time/.test(combined)) {
      addUsageFeature(target, "realtime");
    }
    if (/(?:^|[_\-\s])audio(?:$|[_\-\s])|input[_\-\s]?audio|output[_\-\s]?audio|audio[_\-\s]?mode|transcription|transcribe|(?:^|[_\-\s])voice(?:$|[_\-\s])|voice[_\-\s]?mode|advanced[_\-\s]?voice|(?:^|[_\-\s])tts(?:$|[_\-\s])|(?:^|[_\-\s])whisper(?:$|[_\-\s])/.test(combined)) {
      addUsageFeature(target, "audio");
    }
    if (/(^|[._\-\s])canvases($|[._\-\s])|(^|[._\-\s])canvas($|[._\-\s])/.test(combined)) {
      addUsageFeature(target, "canvas");
    }
    if (/file[_\-\s]?upload|(?:^|[._\-\s])attachments?(?:$|[._\-\s])|file[_\-\s]?attachment/.test(combined)) {
      addUsageFeature(target, "file_upload");
    }
    if (/code[_\-\s]?interpreter|(?:^|[._\-\s])python(?:$|[._\-\s])|data[_\-\s]?analysis/.test(combined)) {
      addUsageFeature(target, "code_interpreter");
    }
    if (/(?:^|[._\-\s])gpts(?:$|[._\-\s])|gizmo(?:[_\-\s]?id)?|gpt[_\-\s]?id|custom[_\-\s]?gpt/.test(combined)) {
      addUsageFeature(target, "gpts");
    }
    if (/(?:^|[._\-\s])tasks(?:$|[._\-\s])|scheduled[_\-\s]?tasks?/.test(combined)) {
      addUsageFeature(target, "tasks");
    }
  }

  function isUsageFeatureSignalRoot(part) {
    return /^(?:model|features?|enabled[-_]?features?|capabilities|enabled[-_]?capabilities|tools?|enabled[-_]?tools|conversation[-_]?mode|agent|agent[-_]?mode|agentmode|research|deep[-_]?(?:research|search)|deepresearch|deepsearch|imagegen|gpt[-_]?image|dall[-_]?e|dalle|image[-_]?generation(?:[-_]?options)?|imagegeneration(?:[-_]?options)?|web[-_]?search(?:[-_]?options)?|websearch(?:[-_]?options)?|search|input[-_]?audio|output[-_]?audio|input[-_]?audio[-_]?transcription|audio|modalities|output[-_]?modalities|input[-_]?audio[-_]?format|output[-_]?audio[-_]?format|transcription|transcribe|tts|whisper|realtime|real[-_]?time|realtime[-_]?mode|real[-_]?time[-_]?mode|audio[-_]?mode|voice[-_]?mode|voice|advanced[-_]?voice|canvas[-_]?mode|canvas|canvases|file[-_]?upload|attachments?|uploads?|code[-_]?interpreter|python|data[-_]?analysis|gpts|gizmo|gizmo[-_]?id|gpt[-_]?id|custom[-_]?gpt|tasks?|scheduled[-_]?tasks?|system[-_]?hints?|force[-_]?use[-_]?search|client[-_]?reported[-_]?search[-_]?source|search[-_]?source)$/i.test(part);
  }

  function isUsageFeatureSignalPath(parts) {
    var cleanParts = (Array.isArray(parts) ? parts : [])
      .map(normalizeParameterKeyPart)
      .filter(Boolean);
    if (!cleanParts.length) {
      return false;
    }
    if (cleanParts.length === 1 && NETWORK_MODEL_FIELD_RE.test(cleanParts[0])) {
      return false;
    }
    var root = cleanParts[0];
    if (cleanParts.some(function denied(part) {
      return isDeniedParameterPart(part);
    }) && !isUsageFeatureSignalRoot(root)) {
      return false;
    }
    return isUsageFeatureSignalRoot(root);
  }

  function collectUsageFeatures(value, target, depth, path) {
    if (depth > 6 || value == null) {
      return;
    }
    var parts = (Array.isArray(path) ? path : []).map(normalizeParameterKeyPart).filter(Boolean);
    if (isUsageFeatureSignalPath(parts) && isDisabledUsageFeatureSignal(value)) {
      return;
    }
    if (parts.some(isDeniedParameterPart) && !isUsageFeatureSignalRoot(parts[0])) {
      return;
    }
    if (typeof value === "string") {
      if (isUsageFeatureSignalPath(parts)) {
        addUsageFeatureFromSignal(target, parts.join("."), value);
      }
      try {
        collectUsageFeatures(JSON.parse(value), target, depth + 1, parts);
      } catch (_) {
        return;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach(function scanArray(item) {
        if (isDisabledUsageFeatureSignal(item) && isUsageFeatureSignalPath(parts)) {
          return;
        }
        collectUsageFeatures(item, target, depth + 1, parts);
      });
      return;
    }
    if (typeof value !== "object") {
      if (isUsageFeatureSignalPath(parts)) {
        addUsageFeatureFromSignal(target, parts.join("."), value);
      }
      return;
    }
    Object.keys(value).slice(0, 160).forEach(function scanKey(key) {
      var item = value[key];
      var nextPath = parts.concat(normalizeParameterKeyPart(key));
      if (isUsageFeatureSignalPath(nextPath)) {
        addUsageFeatureFromSignal(target, nextPath.join("."), item);
      }
      if (isDisabledUsageFeatureSignal(item) && isUsageFeatureSignalPath(nextPath)) {
        return;
      }
      if (key === "metadata" && item && typeof item === "object" && Array.isArray(item.features)) {
        item.features.slice(0, 32).forEach(function scanMetadataFeature(feature) {
          addUsageFeature(target, feature);
        });
        return;
      }
      if (item && typeof item === "object" && !NETWORK_SKIP_FIELD_RE.test(key)) {
        collectUsageFeatures(item, target, depth + 1, nextPath);
      }
    });
  }

  // 正则兜底:ChatGPT 的对话请求体很大,chrome.webRequest 常按多块(raw[])给出,逐块 JSON.parse
  // 会失败,导致功能信号丢失(模型字段靠正则提取所以没事)。这里直接对原始文本识别结构化功能信号
  // (只匹配 ChatGPT 自己的字段名,不碰用户消息正文 parts)。
  function collectUsageFeaturesFromRawText(clean, target) {
    if (/"force_use_search"\s*:\s*true/i.test(clean) || /"client_reported_search_source"\s*:\s*"[^"]*(?:web|search)/i.test(clean)) {
      addUsageFeature(target, "web_search");
    }
    var hintsMatches = clean.match(/"system_hints"\s*:\s*\[([^\]]*)\]/gi) || [];
    hintsMatches.forEach(function scanHints(block) {
      if (/"search"/i.test(block)) { addUsageFeature(target, "web_search"); }
      if (/deep[_-]?research|"research"|deep_?search/i.test(block)) { addUsageFeature(target, "deep_research"); }
      if (/"agent"/i.test(block)) { addUsageFeature(target, "agent_mode"); }
    });
  }

  function collectUsageFeaturesFromText(text, target) {
    var clean = String(text || "").trim();
    if (!clean || !/(image|imagegen|gpt[_-]?image|dall|dall[_-]?e|deep.?research|deep.?search|deepsearch|agent|web.?search|\bsearch\b|force[_-]?use[_-]?search|system[_-]?hints?|search[_-]?source|realtime|real.?time|audio|input[_-]?audio|output[_-]?audio|voice|advanced[_-]?voice|transcription|tts|whisper|conversation_mode|canvas|canvases)/i.test(clean)) {
      return;
    }
    collectUsageFeaturesFromRawText(clean, target);
    try {
      collectUsageFeatures(JSON.parse(clean), target, 0, []);
      return;
    } catch (_) {
      // Continue with URL/form encoded feature fields.
    }

    if (typeof URLSearchParams !== "undefined" && /(?:^|[?&])[^=]+=/i.test(clean)) {
      try {
        var query = clean.indexOf("?") >= 0 ? clean.slice(clean.indexOf("?") + 1) : clean;
        var params = new URLSearchParams(query);
        params.forEach(function collectFeatureParam(value, key) {
          collectUsageFeatures(value, target, 0, [key]);
        });
      } catch (_) {
        return;
      }
    }
  }

  function normalizeUsageFeatures(features, parameters, model) {
    var result = {};
    (Array.isArray(features) ? features : []).forEach(function copy(feature) {
      addUsageFeature(result, feature);
    });
    Object.keys(parameters || {}).forEach(function inspectParameter(key) {
      if (key !== "model" && isUsageFeatureSignalPath(String(key || "").split(/[.]/))) {
        addUsageFeatureFromSignal(result, key, parameters[key]);
      }
    });
    return Object.keys(result).sort();
  }

  function createEmptyFeatureStats() {
    return {
      total: 0,
      features: {}
    };
  }

  function sanitizeFeatureStats(featureStats) {
    var clean = createEmptyFeatureStats();
    var source = featureStats && typeof featureStats === "object" ? featureStats : {};
    var features = source.features && typeof source.features === "object" ? source.features : {};
    var total = 0;
    Object.keys(features).forEach(function copyFeature(key) {
      var id = sanitizeUsageFeatureId(key);
      var sourceFeature = features[key] && typeof features[key] === "object" ? features[key] : {};
      var count = sanitizeCount(sourceFeature.count || features[key]);
      if (!id || count <= 0) {
        return;
      }
      clean.features[id] = {
        id: id,
        name: usageFeatureName(id),
        count: (clean.features[id] ? sanitizeCount(clean.features[id].count) : 0) + count,
        firstSubmittedAt: String(sourceFeature.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceFeature.lastSubmittedAt || "")
      };
      total += count;
    });
    clean.total = Math.max(sanitizeCount(source.total), total);
    return clean;
  }

  function mergeFeatureStats(targetStats, sourceStats) {
    var target = sanitizeFeatureStats(targetStats);
    var source = sanitizeFeatureStats(sourceStats);
    var merged = createEmptyFeatureStats();
    [target, source].forEach(function merge(stats) {
      merged.total += sanitizeCount(stats.total);
      Object.keys(stats.features || {}).forEach(function mergeFeature(id) {
        var feature = stats.features[id];
        var existing = merged.features[id] || {
          id: id,
          count: 0,
          firstSubmittedAt: "",
          lastSubmittedAt: ""
        };
        existing.count += sanitizeCount(feature.count);
        existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, feature.firstSubmittedAt, true);
        existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, feature.lastSubmittedAt, false);
        merged.features[id] = existing;
      });
    });
    return sanitizeFeatureStats(merged);
  }

  function updateFeatureStats(stats, model, features, submittedAt) {
    var cleanFeatures = normalizeUsageFeatures(features || [], {}, model);
    if (!model || cleanFeatures.length === 0) {
      return;
    }
    if (!stats.featuresByModel) {
      stats.featuresByModel = {};
    }
    var modelStats = sanitizeFeatureStats(stats.featuresByModel[model]);
    cleanFeatures.forEach(function updateFeature(id) {
      var feature = modelStats.features[id] || {
        id: id,
        name: usageFeatureName(id),
        count: 0,
        firstSubmittedAt: submittedAt,
        lastSubmittedAt: ""
      };
      feature.name = usageFeatureName(id);
      feature.count = sanitizeCount(feature.count) + 1;
      feature.firstSubmittedAt = feature.firstSubmittedAt || submittedAt;
      feature.lastSubmittedAt = submittedAt;
      modelStats.features[id] = feature;
      modelStats.total = sanitizeCount(modelStats.total) + 1;
    });
    stats.featuresByModel[model] = sanitizeFeatureStats(modelStats);
  }

  function updateParameterStats(stats, model, parameters, submittedAt) {
    var cleanParameters = sanitizeModelParameters(parameters || {}, "");
    if (Object.keys(cleanParameters).length === 0) {
      return;
    }

    if (!stats.parametersByModel) {
      stats.parametersByModel = {};
    }

    var modelStats = sanitizeParameterStats(stats.parametersByModel[model]);
    var combinationKey = parameterCombinationKey(cleanParameters);
    var combination = modelStats.combinations[combinationKey] || {
      count: 0,
      parameters: cleanParameters,
      firstSubmittedAt: submittedAt,
      lastSubmittedAt: ""
    };

    combination.count = sanitizeCount(combination.count) + 1;
    combination.parameters = cleanParameters;
    combination.firstSubmittedAt = combination.firstSubmittedAt || submittedAt;
    combination.lastSubmittedAt = submittedAt;
    modelStats.combinations[combinationKey] = combination;
    modelStats.total = sanitizeCount(modelStats.total) + 1;
    addParameterFieldCounts(modelStats.fields, cleanParameters, 1);
    trimParameterCombinations(modelStats.combinations);
    stats.parametersByModel[model] = modelStats;
  }

  function addNetworkParameter(parameters, key, value, priority) {
    var safeKey = sanitizeParameterKey(key);
    if (!safeKey) {
      return;
    }

    var isModelField = NETWORK_MODEL_FIELD_RE.test(safeKey);
    var parameterValue = isModelField && Array.isArray(value) ? value[0] : value;
    var canonicalKey = canonicalNetworkParameterKey([], safeKey) || safeKey;
    var clean = sanitizeModelParameters({ [canonicalKey]: parameterValue }, "");
    if (Object.prototype.hasOwnProperty.call(clean, canonicalKey)) {
      if (isModelField) {
        if (!isActualRequestModel(clean[canonicalKey]) && !CONVERSATION_MODE_MODELS[clean[canonicalKey]]) {
          return;
        }
        var currentPriority = Number(parameters.__modelFieldPriority || 0);
        var nextPriority = Number(priority || 1);
        if (currentPriority <= nextPriority) {
          Object.defineProperty(parameters, "__modelFieldPriority", {
            value: nextPriority,
            writable: true,
            configurable: true
          });
          parameters.model = clean[canonicalKey];
        }
      }
      parameters[canonicalKey] = clean[canonicalKey];
    }
  }

  function collectNetworkParameters(value, parameters, depth, path) {
    if (depth > 8 || value == null) {
      return;
    }

    if (typeof value === "string") {
      collectNetworkParametersFromText(value, parameters);
      return;
    }

    if (Array.isArray(value)) {
      value.slice(0, 80).forEach(function collectArrayItem(item) {
        collectNetworkParameters(item, parameters, depth + 1, path);
      });
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    Object.keys(value).slice(0, 160).forEach(function collectKey(key) {
      var item = value[key];
      var parameterKey = canonicalNetworkParameterKey(path, key);
      if (parameterKey) {
        addNetworkParameter(parameters, parameterKey, item, networkModelFieldPriority(key));
      }
      if (item && typeof item === "object" && !NETWORK_SKIP_FIELD_RE.test(key)) {
        collectNetworkParameters(item, parameters, depth + 1, path.concat(key));
      }
    });
  }

  function collectNetworkParametersFromText(text, parameters) {
    var clean = String(text || "").trim();
    if (!clean || !/(model|gpt|chat-latest|o\d+|reasoning|verbosity|temperature|top_p|max_tokens|tool_choice|response_format)/i.test(clean)) {
      return;
    }

    try {
      collectNetworkParameters(JSON.parse(clean), parameters, 0, []);
      return;
    } catch (_) {
      // Continue with URL/form encoded parsing.
    }

    if (typeof URLSearchParams !== "undefined" && /(?:^|[?&])[^=]+=/i.test(clean)) {
      try {
        var query = clean.indexOf("?") >= 0 ? clean.slice(clean.indexOf("?") + 1) : clean;
        var params = new URLSearchParams(query);
        params.forEach(function collectParam(value, key) {
          addNetworkParameter(parameters, canonicalNetworkParameterKey([], key), value, networkModelFieldPriority(key));
        });
      } catch (_) {
        return;
      }
    }
  }

  function bytesToText(bytes) {
    if (!bytes) {
      return "";
    }

    try {
      if (typeof TextDecoder === "function") {
        return new TextDecoder("utf-8").decode(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
      }
    } catch (_) {
      return "";
    }

    if (typeof Buffer === "function") {
      try {
        return Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("utf8");
      } catch (_) {
        return "";
      }
    }

    return "";
  }

  function parseNetworkRequestBody(requestBody) {
    var parameters = {};
    var usageFeatures = {};
    if (!requestBody || typeof requestBody !== "object") {
      return parameters;
    }

    var formData = requestBody.formData && typeof requestBody.formData === "object" ? requestBody.formData : {};
    collectUsageFeatures(formData, usageFeatures, 0, []);
    Object.keys(formData).forEach(function collectFormField(key) {
      addNetworkParameter(parameters, canonicalNetworkParameterKey([], key), formData[key], networkModelFieldPriority(key));
    });

    if (Array.isArray(requestBody.raw)) {
      // chrome.webRequest 对大请求体常分多块(raw[])给出。必须先拼接成完整文本再扫描,
      // 否则信号(如 force_use_search)被拆到不同块里、且逐块 JSON.parse 会失败 → 功能丢失。
      var fullText = requestBody.raw.map(function fromRaw(raw) { return bytesToText(raw && raw.bytes) || ""; }).join("");
      if (fullText) {
        collectNetworkParametersFromText(fullText, parameters);
        collectUsageFeaturesFromText(fullText, usageFeatures);
      }
    }

    delete parameters.__modelFieldPriority;
    Object.defineProperty(parameters, "__usageFeatures", {
      value: Object.keys(usageFeatures).sort(),
      configurable: true
    });
    return parameters;
  }

  function parseNetworkRequestDetails(details) {
    var parameters = parseNetworkRequestBody(details && details.requestBody);
    var usageFeatures = {};
    if (parameters && Array.isArray(parameters.__usageFeatures)) {
      parameters.__usageFeatures.forEach(function rememberFeature(feature) {
        usageFeatures[feature] = true;
      });
    }

    collectNetworkParametersFromText(details && details.url, parameters);
    collectUsageFeaturesFromText(details && details.url, usageFeatures);

    delete parameters.__usageFeatures;
    Object.defineProperty(parameters, "__usageFeatures", {
      value: Object.keys(usageFeatures).sort(),
      configurable: true
    });
    delete parameters.__modelFieldPriority;
    return parameters;
  }

  function observationFromNetworkParameters(parameters, observedAt) {
    var cleanParameters = sanitizeModelParameters(parameters, "");
    var requestModel = sanitizeChatGPTModel(cleanParameters.model);
    var conversationMode = CONVERSATION_MODE_MODELS && CONVERSATION_MODE_MODELS[requestModel];
    if (!isActualRequestModel(requestModel) && !conversationMode) {
      return null;
    }

    var resolved = null;
    if (modelCatalog && typeof modelCatalog.resolveRequestModelInfo === "function") {
      resolved = modelCatalog.resolveRequestModelInfo(requestModel);
    } else if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      resolved = modelCatalog.resolveModelInfo(requestModel);
    }

    return {
      observedAt: observedAt || Date.now(),
      source: "webRequest",
      model: requestModel,
      apiModel: requestModel,
      chatgptModel: requestModel,
      modelMode: (resolved && resolved.mode) || "",
      usageFeatures: normalizeUsageFeatures([].concat(
        parameters && parameters.__usageFeatures || [],
        conversationMode ? [conversationMode.feature] : []
      ), cleanParameters, requestModel),
      modelParameters: cleanParameters
    };
  }

  function observeNetworkRequest(details, nowDate) {
    if (!details || typeof details.tabId !== "number" || details.tabId < 0) {
      return null;
    }
    var method = String(details.method || "").toUpperCase();
    if (method && !/^(POST|PUT|PATCH)$/.test(method)) {
      return null;
    }

    var observedAt = nowDate instanceof Date ? nowDate.getTime() : Date.now();
    var observation = observationFromNetworkParameters(parseNetworkRequestDetails(details), observedAt);
    if (!observation) {
      return null;
    }

    var observations = Array.isArray(recentNetworkObservationsByTab[details.tabId])
      ? recentNetworkObservationsByTab[details.tabId]
      : [];
    observations = observations.filter(function keepRecent(item) {
      return observedAt - Number(item && item.observedAt || 0) <= NETWORK_OBSERVATION_WINDOW_MS;
    });
    observations.push(observation);
    if (observations.length > MAX_NETWORK_OBSERVATIONS_PER_TAB) {
      observations = observations.slice(observations.length - MAX_NETWORK_OBSERVATIONS_PER_TAB);
    }
    recentNetworkObservationsByTab[details.tabId] = observations;
    return observation;
  }

  function mergeRecentNetworkObservation(payload, sender, nowDate) {
    var tabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : -1;
    if (tabId < 0) {
      return payload || {};
    }

    var observations = Array.isArray(recentNetworkObservationsByTab[tabId])
      ? recentNetworkObservationsByTab[tabId]
      : [];
    if (!observations.length) {
      return payload || {};
    }

    var nowMs = nowDate instanceof Date ? nowDate.getTime() : Date.now();
    var submittedMs = new Date(payload && payload.submittedAt || "").getTime();
    if (Number.isNaN(submittedMs)) {
      submittedMs = nowMs;
    }
    var messageDomSubmission = String(payload && payload.source || "") === "message-dom";
    var earlyWindow = messageDomSubmission ? NETWORK_MESSAGE_DOM_EARLY_MS : NETWORK_MATCH_EARLY_MS;
    observations = observations.filter(function keepCandidate(item) {
      var observedAt = Number(item && item.observedAt || 0);
      return observedAt > 0 &&
        nowMs - observedAt <= NETWORK_OBSERVATION_WINDOW_MS &&
        observedAt >= submittedMs - earlyWindow;
    });
    if (!observations.length) {
      delete recentNetworkObservationsByTab[tabId];
      return payload || {};
    }

    var observationIndex = -1;
    if (messageDomSubmission) {
      for (var messageIndex = observations.length - 1; messageIndex >= 0; messageIndex -= 1) {
        var messageObservedAt = Number(observations[messageIndex].observedAt || 0);
        if (messageObservedAt <= submittedMs && messageObservedAt >= submittedMs - earlyWindow) {
          observationIndex = messageIndex;
          break;
        }
      }
    } else {
      for (var i = 0; i < observations.length; i += 1) {
        var observedAt = Number(observations[i].observedAt || 0);
        if (observedAt >= submittedMs && observedAt <= submittedMs + NETWORK_MATCH_LATE_MS) {
          observationIndex = i;
          break;
        }
      }
    }
    if (observationIndex < 0) {
      if (messageDomSubmission) {
        for (var afterIndex = 0; afterIndex < observations.length; afterIndex += 1) {
          var afterTime = Number(observations[afterIndex].observedAt || 0);
          if (afterTime >= submittedMs && afterTime <= submittedMs + NETWORK_MATCH_LATE_MS) {
            observationIndex = afterIndex;
            break;
          }
        }
      } else {
        for (var beforeIndex = observations.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
          var beforeTime = Number(observations[beforeIndex].observedAt || 0);
          if (beforeTime >= submittedMs - earlyWindow && beforeTime < submittedMs) {
            observationIndex = beforeIndex;
            break;
          }
        }
      }
    }
    if (observationIndex < 0) {
      recentNetworkObservationsByTab[tabId] = observations;
      return payload || {};
    }

    var observation = observations[observationIndex];
    observations.splice(observationIndex, 1);
    if (observations.length) {
      recentNetworkObservationsByTab[tabId] = observations;
    } else {
      delete recentNetworkObservationsByTab[tabId];
    }
    var mergedUsageFeatures = normalizeUsageFeatures([].concat(
      Array.isArray(payload && payload.usageFeatures) ? payload.usageFeatures : [],
      Array.isArray(observation.usageFeatures) ? observation.usageFeatures : []
    ), observation.modelParameters, observation.model);
    // The request body's model field identifies the submitted request. A DOM
    // label may be stale after the user switches models, so it must not win.
    return Object.assign({}, payload || {}, {
      model: observation.model,
      apiModel: observation.apiModel,
      chatgptModel: observation.chatgptModel,
      modelMode: observation.modelMode,
      modelObservedSource: observation.source,
      usageFeatures: mergedUsageFeatures,
      modelParameters: observation.modelParameters
    });
  }

  // ChatGPT 的「深度研究 / 代理模式」在模型选择器里是可选项,请求的 model 字段会直接是
  // research / agent-mode。它们不是基础模型,但确实是用户的一次会话选择 —— 记成同名条目并
  // 标记对应功能,避免整条提交被丢弃(否则深度研究/代理模式的用量会完全统计不到)。
  function conversationModeModelInfo(payload, requestSource) {
    if (!isTrustedRequestModelSource(requestSource)) {
      return null;
    }
    var rawModel = (payload && payload.modelParameters && payload.modelParameters.model) || (payload && payload.model);
    var key = String(rawModel || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/_/g, "-").trim();
    var mode = CONVERSATION_MODE_MODELS[key];
    if (!mode) {
      return null;
    }
    return {
      label: mode.label,
      apiModel: key,
      chatgptModel: key,
      mode: "",
      observedSource: String(requestSource || "").slice(0, 64),
      deprecated: false,
      parameters: { model: key },
      usageFeatures: [mode.feature]
    };
  }

  function resolvePayloadModelInfo(payload) {
    var payloadParameters = payload && payload.modelParameters && typeof payload.modelParameters === "object" ? payload.modelParameters : {};
    var requestSource = String((payload && payload.modelObservedSource) || "");
    var parameters = sanitizeModelParameters(payload && payload.modelParameters, "");
    var exactModel = sanitizeChatGPTModel(parameters.model || payloadParameters.model);
    if (!isTrustedRequestModelSource(requestSource) || !isActualRequestModel(exactModel)) {
      var conversationMode = conversationModeModelInfo(payload, requestSource);
      if (conversationMode) {
        return conversationMode;
      }
      return null;
    }
    var resolved = null;

    if (modelCatalog && typeof modelCatalog.resolveRequestModelInfo === "function") {
      resolved = modelCatalog.resolveRequestModelInfo(exactModel);
    } else if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      resolved = modelCatalog.resolveModelInfo(exactModel);
    }

    var apiModel = exactModel;
    var chatgptModel = exactModel;
    var storedModel = sanitizeModelName(chatGPTModeLabelFromSlug(exactModel) || (resolved && resolved.label) || exactModel);

    return {
      label: storedModel,
      apiModel: apiModel,
      chatgptModel: chatgptModel,
      mode: sanitizeModelMode((payload && payload.modelMode) || (resolved && resolved.mode)),
      observedSource: String((payload && payload.modelObservedSource) || "").slice(0, 64),
      deprecated: Boolean(resolved && resolved.deprecated),
      parameters: parameters
    };
  }

  function isDuplicateUsageEvent(stats, model, conversationId, promptHash, submittedAt) {
    if (!promptHash) {
      return false;
    }
    var submittedTime = new Date(submittedAt).getTime();
    if (Number.isNaN(submittedTime)) {
      return false;
    }
    return (stats.events || []).some(function duplicate(event) {
      if (!event || event.promptHash !== promptHash) {
        return false;
      }
      if (conversationId && event.conversationId && event.conversationId !== conversationId) {
        return false;
      }
      var eventTime = new Date(event.submittedAt).getTime();
      return !Number.isNaN(eventTime) && Math.abs(submittedTime - eventTime) < USAGE_DEDUPE_WINDOW_MS;
    });
  }

  function isDuplicatePayloadEvent(stats, payload) {
    var modelInfo = resolvePayloadModelInfo(payload || {});
    if (!modelInfo) {
      return false;
    }
    return isDuplicateUsageEvent(
      stats || createEmptyStats(),
      modelInfo.label,
      extractConversationId(String((payload && payload.pageUrl) || "")),
      String((payload && payload.promptHash) || "").slice(0, 64),
      String((payload && payload.submittedAt) || "")
    );
  }

  function usageSubmissionFingerprint(payload) {
    var modelInfo = resolvePayloadModelInfo(payload || {});
    var promptHash = String((payload && payload.promptHash) || "").slice(0, 64);
    var submittedAt = String((payload && payload.submittedAt) || "");
    var submittedTime = new Date(submittedAt).getTime();
    if (!modelInfo || !promptHash || Number.isNaN(submittedTime)) {
      return null;
    }

    return {
      model: modelInfo.label,
      conversationId: extractConversationId(String((payload && payload.pageUrl) || "")),
      promptHash: promptHash,
      submittedAt: submittedAt,
      submittedTime: submittedTime
    };
  }

  function sameUsageSubmission(left, right) {
    if (!left || !right || left.promptHash !== right.promptHash) {
      return false;
    }
    if (left.conversationId && right.conversationId && left.conversationId !== right.conversationId) {
      return false;
    }
    return Math.abs(left.submittedTime - right.submittedTime) < USAGE_DEDUPE_WINDOW_MS;
  }

  function forgetOldUsageSubmissions(nowMs) {
    recentUsageSubmissions = recentUsageSubmissions.filter(function keepRecent(entry) {
      return nowMs - Number(entry.submittedTime || 0) < USAGE_DEDUPE_WINDOW_MS;
    });
  }

  function rememberUsageSubmission(payload, nowDate) {
    var fingerprint = usageSubmissionFingerprint(payload);
    if (!fingerprint) {
      return false;
    }

    var nowMs = nowDate instanceof Date ? nowDate.getTime() : Date.now();
    forgetOldUsageSubmissions(nowMs);
    if (recentUsageSubmissions.some(function duplicate(entry) { return sameUsageSubmission(entry, fingerprint); })) {
      return true;
    }

    recentUsageSubmissions.push(fingerprint);
    return false;
  }

  function applyIncrement(existingStats, payload, nowDate) {
    var stats = cloneStats(existingStats);
    var now = nowDate || new Date();
    var modelInfo = resolvePayloadModelInfo(payload || {});
    if (!modelInfo) {
      return stats;
    }

    var model = modelInfo.label;
    var submittedAt = payload && payload.submittedAt ? String(payload.submittedAt) : now.toISOString();
    var submittedDate = new Date(submittedAt);
    var dateKey = todayKey(Number.isNaN(submittedDate.getTime()) ? now : submittedDate);
    var pageUrl = String((payload && payload.pageUrl) || "").slice(0, 500);
    var conversationId = extractConversationId(pageUrl);
    var pageTitle = sanitizeTitle(payload && payload.pageTitle);
    var promptHash = String((payload && payload.promptHash) || "").slice(0, 64);
    var promptLength = Number((payload && payload.promptLength) || 0);
    var usageFeatures = normalizeUsageFeatures(
      [].concat(
        Array.isArray(payload && payload.usageFeatures) ? payload.usageFeatures : [],
        Array.isArray(modelInfo.usageFeatures) ? modelInfo.usageFeatures : []
      ),
      modelInfo.parameters,
      model
    );

    if (isDuplicateUsageEvent(stats, model, conversationId, promptHash, submittedAt)) {
      return stats;
    }

    if (!stats.byDate[dateKey]) {
      stats.byDate[dateKey] = {};
    } else {
      stats.byDate[dateKey] = Object.assign({}, stats.byDate[dateKey]);
    }

    stats.totals[model] = (stats.totals[model] || 0) + 1;
    stats.byDate[dateKey][model] = (stats.byDate[dateKey][model] || 0) + 1;
    stats.models[model] = modelInfo;
    updateVariantStats(stats, model, modelInfo, submittedAt);
    updateParameterStats(stats, model, modelInfo.parameters, submittedAt);
    updateFeatureStats(stats, model, usageFeatures, submittedAt);
    updateSessionIndex(stats, model, conversationId, {
      pageTitle: pageTitle,
      pageUrl: pageUrl,
      promptHash: promptHash,
      promptLength: promptLength,
      submittedAt: submittedAt
    });
    stats.lastUpdated = submittedAt;
    stats.events.unshift({
      model: model,
      apiModel: modelInfo.apiModel,
      chatgptModel: modelInfo.chatgptModel,
      modelMode: modelInfo.mode,
      modelObservedSource: modelInfo.observedSource,
      modelParameters: modelInfo.parameters,
      usageFeatures: usageFeatures,
      source: String((payload && payload.source) || "unmarked-source").slice(0, 32),
      submittedAt: submittedAt,
      pageUrl: pageUrl,
      pageTitle: pageTitle,
      conversationId: conversationId,
      promptHash: promptHash,
      promptLength: promptLength
    });
    stats.events = stats.events.slice(0, MAX_EVENTS);

    return stats;
  }

  function updateSessionIndex(stats, model, conversationId, event) {
    if (!conversationId) {
      return;
    }

    if (!stats.sessionsByModel) {
      stats.sessionsByModel = {};
    }
    if (!stats.sessionsByModel[model]) {
      stats.sessionsByModel[model] = {};
    }

    var existing = stats.sessionsByModel[model][conversationId] || {
      conversationId: conversationId,
      title: "",
      count: 0,
      models: {},
      firstSubmittedAt: event.submittedAt,
      lastSubmittedAt: ""
    };

    existing.count = (Number(existing.count) || 0) + 1;
    existing.models[model] = (Number(existing.models[model]) || 0) + 1;
    existing.title = event.pageTitle || existing.title || conversationId;
    existing.firstSubmittedAt = existing.firstSubmittedAt || event.submittedAt;
    existing.lastSubmittedAt = event.submittedAt;
    existing.lastPageUrl = event.pageUrl;
    existing.lastPromptHash = event.promptHash;
    existing.lastPromptLength = event.promptLength;
    stats.sessionsByModel[model][conversationId] = sanitizeSession(existing, conversationId);
  }

  function totalCount(stats) {
    return Object.keys(stats.totals || {}).reduce(function sum(total, model) {
      return total + (Number(stats.totals[model]) || 0);
    }, 0);
  }

  function badgeText(count) {
    // 工具栏图标徽章只显示很短的数字,数大就用 99+,避免长数字盖住图标。
    if (count <= 0) return "";
    if (count > 99) return "99+";
    return String(count);
  }

  function openAIStatusState(status, error) {
    if (error) {
      var message = String(error).toLowerCase();
      if (/timed?\s*out|timeout/i.test(message)) return "timeout";
      if (/fetch|network|unavailable|failed|dns|abort/i.test(message)) return "fetch-failure";
      return "unavailable";
    }
    var indicator = String((status && status.status && status.status.indicator) || "").toLowerCase();
    if (indicator === "none" || indicator === "operational") return "operational";
    if (indicator === "minor" || indicator === "degraded" || indicator === "degraded_performance") return "degraded";
    if (indicator === "partial" || indicator === "partial_outage") return "partial";
    if (indicator === "maintenance" || indicator === "under_maintenance") return "maintenance";
    if (indicator === "major" || indicator === "major_outage" || indicator === "critical") return "major";
    return "unknown";
  }

  function statusLabel(state) {
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

  function createOpenAIStatusRecord(response, checkedAt) {
    var status = response && response.ok && response.status ? response.status : null;
    var error = response && response.ok ? "" : sanitizeStatusText(response && response.error, 180) || "OpenAI status request failed.";
    var state = openAIStatusState(status, error);
    return {
      version: 1,
      ok: Boolean(response && response.ok && status),
      checkedAt: sanitizeStatusText(checkedAt || new Date().toISOString(), 48),
      sourceUrl: OPENAI_STATUS_PAGE_URL,
      state: state,
      label: statusLabel(state),
      error: error,
      status: status
    };
  }

  function sanitizeOpenAIStatusRecord(record) {
    var source = record && typeof record === "object" ? record : null;
    if (!source) {
      return null;
    }
    var state = String(source.state || "").toLowerCase();
    if (!/^(operational|degraded|partial|maintenance|major|unavailable|unknown|timeout|fetch-failure)$/.test(state)) {
      state = openAIStatusState(source.status, source.error);
    }
    return {
      version: 1,
      ok: Boolean(source.ok && source.status),
      checkedAt: sanitizeStatusText(source.checkedAt, 48),
      sourceUrl: sanitizeStatusText(source.sourceUrl || OPENAI_STATUS_PAGE_URL, 300),
      state: state,
      label: statusLabel(state),
      error: sanitizeStatusText(source.error, 180),
      status: source.status && typeof source.status === "object" ? source.status : null
    };
  }

  function isAbnormalOpenAIStatus(record) {
    var clean = sanitizeOpenAIStatusRecord(record);
    return Boolean(clean && clean.state !== "operational");
  }

  function statusBadgeText(record, count) {
    var clean = sanitizeOpenAIStatusRecord(record);
    if (!isAbnormalOpenAIStatus(clean)) {
      return badgeText(count);
    }
    return clean.state === "unavailable" || clean.state === "unknown" || clean.state === "timeout" || clean.state === "fetch-failure" ? "?" : "!";
  }

  function statusBadgeColor(record) {
    var clean = sanitizeOpenAIStatusRecord(record);
    if (!isAbnormalOpenAIStatus(clean)) return "#2563eb";
    if (clean.state === "major" || clean.state === "partial") return "#dc2626";
    if (clean.state === "degraded" || clean.state === "maintenance") return "#d97706";
    if (clean.state === "timeout" || clean.state === "fetch-failure") return "#d97706";
    return "#64748b";
  }

  function actionTitle(stats, record) {
    // 悬停标题与角标口径一致:都用"当前所选日期范围"的计数,避免角标显示范围数、标题却显示全部总数。
    var count = computeBadgeCount(stats || createEmptyStats(), badgeFilter);
    var clean = sanitizeOpenAIStatusRecord(record);
    var prefix = "ChatGPT Model Usage" + (count ? " · " + count : "");
    if (!clean) return prefix;
    return prefix + " · OpenAI status: " + clean.label;
  }

  // 角标范围过滤器:由面板(dashboard)推送当前选择的日期范围,角标只显示该范围内的次数,
  // 而不是全部总数(用户:角标显示面板所选日期范围对应的数字)。SW 重启后从存储恢复。
  var badgeFilter = null;

  function sanitizeBadgeFilter(filter) {
    if (!filter || typeof filter !== "object") { return null; }
    var dateRe = /^\d{4}-\d{2}-\d{2}$/;
    var startDate = typeof filter.startDate === "string" && dateRe.test(filter.startDate) ? filter.startDate : "";
    var endDate = typeof filter.endDate === "string" && dateRe.test(filter.endDate) ? filter.endDate : "";
    var models = Array.isArray(filter.models)
      ? filter.models.filter(function keepStrings(m) { return typeof m === "string" && m; }).slice(0, 200)
      : [];
    if (!startDate && !endDate && !models.length) { return null; }
    return { startDate: startDate, endDate: endDate, models: models };
  }

  function setBadgeFilter(filter) {
    badgeFilter = sanitizeBadgeFilter(filter);
    return badgeFilter;
  }

  // 按日期范围(可选叠加模型集合)对 stats.byDate[date][model] 求和;没有过滤器时回退到全部总数。
  function computeBadgeCount(stats, filter) {
    stats = stats || createEmptyStats();
    var clean = sanitizeBadgeFilter(filter);
    if (!clean) { return totalCount(stats); }
    var byDate = stats.byDate || {};
    var start = clean.startDate;
    var end = clean.endDate;
    if (start && end && start > end) { var swap = start; start = end; end = swap; }
    var modelSet = null;
    if (clean.models.length) {
      modelSet = {};
      clean.models.forEach(function markModel(m) { modelSet[m] = true; });
    }
    var sum = 0;
    Object.keys(byDate).forEach(function eachDate(date) {
      if (start && date < start) { return; }
      if (end && date > end) { return; }
      var dayModels = byDate[date] || {};
      Object.keys(dayModels).forEach(function eachModel(model) {
        if (modelSet && !modelSet[model]) { return; }
        sum += Number(dayModels[model]) || 0;
      });
    });
    return sum;
  }

  function loadBadgeFilter(done) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      if (done) { done(); }
      return;
    }
    try {
      chrome.storage.local.get(["chatgptUsageBadgeFilter"], function applyStored(items) {
        badgeFilter = sanitizeBadgeFilter(items && items.chatgptUsageBadgeFilter);
        if (done) { done(); }
      });
    } catch (_) {
      if (done) { done(); }
    }
  }

  function setBadge(stats, statusRecord) {
    if (typeof chrome === "undefined" || !chrome.action || !chrome.action.setBadgeText) {
      return;
    }

    var count = computeBadgeCount(stats || createEmptyStats(), badgeFilter);
    chrome.action.setBadgeBackgroundColor({ color: statusBadgeColor(statusRecord) });
    chrome.action.setBadgeText({ text: statusBadgeText(statusRecord, count) });
    if (typeof chrome.action.setTitle === "function") {
      chrome.action.setTitle({ title: actionTitle(stats || createEmptyStats(), statusRecord) });
    }
  }

  function isChatGPTUrl(url) {
    return /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)(?:\/|$)/i.test(String(url || ""));
  }

  function sanitizeStatusText(value, maxLength) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength || 180);
  }

  function sanitizeOpenAIStatusComponent(component, index) {
    var source = component && typeof component === "object" ? component : {};
    var name = sanitizeStatusText(source.name, 120);
    if (!name) {
      return null;
    }

    return {
      id: sanitizeStatusText(source.id, 80),
      name: name,
      status: sanitizeStatusText(source.status, 48),
      updatedAt: sanitizeStatusText(source.updated_at || source.updatedAt, 48),
      group: Boolean(source.group),
      groupId: sanitizeStatusText(source.group_id || source.groupId, 80),
      position: Number(source.position || index || 0) || 0
    };
  }

  function componentMatchesAny(component, patterns) {
    var name = String((component && component.name) || "");
    return patterns.some(function matches(pattern) {
      return pattern.test(name);
    });
  }

  function webChatGPTStatusPatterns() {
    return [
      /^chatgpt$/i,
      /^conversations$/i,
      /^agent$/i,
      /^deep research$/i,
      /^image generation$/i,
      /^voice mode$/i,
      /^search$/i,
      /^gpts$/i,
      /^connectors\/apps$/i,
      /^file uploads$/i,
      /^login$/i
    ];
  }

  function openAIStatusSeverity(value) {
    var clean = String(value || "").toLowerCase();
    if (clean === "major_outage" || clean === "major" || clean === "critical") return 5;
    if (clean === "partial_outage") return 4;
    if (clean === "degraded_performance" || clean === "minor") return 3;
    if (clean === "under_maintenance" || clean === "maintenance") return 2;
    if (clean === "operational" || clean === "none") return 1;
    return 0;
  }

  function openAIStatusIndicatorFromSeverity(severity) {
    if (severity >= 5) return "major";
    if (severity === 4) return "partial_outage";
    if (severity === 3) return "minor";
    if (severity === 2) return "maintenance";
    return "none";
  }

  function aggregateOpenAIComponentStatus(components) {
    var severity = components.reduce(function worst(current, component) {
      return Math.max(current, openAIStatusSeverity(component && component.status));
    }, 1);
    return {
      indicator: openAIStatusIndicatorFromSeverity(severity),
      description: ""
    };
  }

  function importantOpenAIComponents(components) {
    var patterns = webChatGPTStatusPatterns();
    var byName = {};
    components.forEach(function keep(component) {
      var key = String((component && component.name) || "").toLowerCase();
      if (!key || component.group || !componentMatchesAny(component, patterns)) {
        return;
      }
      if (!byName[key] || openAIStatusSeverity(component.status) > openAIStatusSeverity(byName[key].status)) {
        byName[key] = component;
      }
    });
    return Object.keys(byName).map(function toComponent(key) {
      return byName[key];
    }).sort(function byPosition(left, right) {
      return left.position - right.position || left.name.localeCompare(right.name);
    }).slice(0, 12);
  }

  function sanitizeOpenAIStatusPayload(payload, fetchedAt) {
    var source = payload && typeof payload === "object" ? payload : {};
    var page = source.page && typeof source.page === "object" ? source.page : {};
    var status = source.status && typeof source.status === "object" ? source.status : {};
    var components = Array.isArray(source.components)
      ? source.components.map(sanitizeOpenAIStatusComponent).filter(Boolean)
      : [];
    components.sort(function byPosition(left, right) {
      return left.position - right.position || left.name.localeCompare(right.name);
    });
    var importantComponents = importantOpenAIComponents(components);
    var aggregateStatus = aggregateOpenAIComponentStatus(importantComponents);
    return {
      fetchedAt: sanitizeStatusText(fetchedAt || new Date().toISOString(), 48),
      sourceUrl: OPENAI_STATUS_PAGE_URL,
      page: {
        id: sanitizeStatusText(page.id, 80),
        name: sanitizeStatusText(page.name || "OpenAI", 120),
        url: sanitizeStatusText(page.url || OPENAI_STATUS_PAGE_URL, 300),
        updatedAt: sanitizeStatusText(page.updated_at || page.updatedAt, 48)
      },
      status: aggregateStatus,
      components: importantComponents,
      incidents: []
    };
  }

  function fetchOpenAIStatus(callback) {
    var finished = false;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = typeof setTimeout === "function"
      ? setTimeout(function timeoutStatus() {
          if (finished) {
            return;
          }
          finished = true;
          if (controller) {
            controller.abort();
          }
          callback({ ok: false, error: "OpenAI status request timed out." });
        }, 9000)
      : null;

    function respond(message) {
      if (finished) {
        return;
      }
      finished = true;
      if (timeoutId && typeof clearTimeout === "function") {
        clearTimeout(timeoutId);
      }
      callback(message);
    }

    if (typeof fetch !== "function") {
      respond({ ok: false, error: "Fetch is not available in this Chrome runtime." });
      return;
    }

    fetch(OPENAI_STATUS_SUMMARY_URL, { cache: "no-store", signal: controller ? controller.signal : undefined })
      .then(function parseResponse(response) {
        if (!response || !response.ok) {
          throw new Error("OpenAI status HTTP " + (response && response.status));
        }
        return response.json();
      })
      .then(function handlePayload(payload) {
        respond({ ok: true, status: sanitizeOpenAIStatusPayload(payload, new Date().toISOString()) });
      })
      .catch(function failed(error) {
        respond({ ok: false, error: String((error && error.message) || error || "OpenAI status request failed.") });
      });
  }

  function injectIsolatedContentScripts(tabId) {
    if (
      typeof chrome === "undefined" ||
      !chrome.scripting ||
      !chrome.scripting.executeScript ||
      typeof tabId !== "number"
    ) {
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ISOLATED_CONTENT_SCRIPT_FILES.slice()
      },
      function ignoreIsolatedInjectionResult() {
        void chrome.runtime.lastError;
      }
    );
  }

  function storageGet(callback) {
    chrome.storage.local.get([STORAGE_KEY], function handleGet(result) {
      var rawStats = result[STORAGE_KEY];
      var cleanStats = cloneStats(rawStats);
      if (rawStats && JSON.stringify(rawStats) !== JSON.stringify(cleanStats)) {
        chrome.storage.local.set({ [STORAGE_KEY]: cleanStats }, function handleCleanedStats() {
          callback(cleanStats);
        });
        return;
      }
      callback(cleanStats);
    });
  }

  function storageSet(stats, callback) {
    chrome.storage.local.set({ [STORAGE_KEY]: stats }, function handleSet() {
      statusGet(function updateBadgeWithStatus(statusRecord) {
        setBadge(stats, statusRecord);
        if (callback) callback(stats);
      });
    });
  }

  function settingsGet(callback) {
    chrome.storage.local.get([SETTINGS_KEY], function handleGet(result) {
      callback(sanitizeSettings(result[SETTINGS_KEY]));
    });
  }

  function settingsSet(settings, callback) {
    var nextSettings = sanitizeSettings(settings);
    chrome.storage.local.set({ [SETTINGS_KEY]: nextSettings }, function handleSet() {
      if (callback) callback(nextSettings);
    });
  }

  function statusGet(callback) {
    chrome.storage.local.get([STATUS_KEY], function handleGet(result) {
      callback(sanitizeOpenAIStatusRecord(result[STATUS_KEY]));
    });
  }

  function statusSet(statusRecord, callback) {
    var cleanRecord = sanitizeOpenAIStatusRecord(statusRecord);
    chrome.storage.local.set({ [STATUS_KEY]: cleanRecord }, function handleSet() {
      storageGet(function updateBadge(stats) {
        setBadge(stats, cleanRecord);
        if (callback) callback(cleanRecord);
      });
    });
  }

  function refreshOpenAIStatus(callback) {
    fetchOpenAIStatus(function handleStatus(response) {
      var record = createOpenAIStatusRecord(response, new Date().toISOString());
      statusSet(record, function savedStatus(savedRecord) {
        if (callback) {
          callback({ ok: savedRecord.ok, status: savedRecord.status, statusRecord: savedRecord, error: savedRecord.error });
        }
      });
    });
  }

  function ensureStatusAlarm() {
    if (typeof chrome === "undefined" || !chrome.alarms || typeof chrome.alarms.create !== "function") {
      return;
    }
    chrome.alarms.create(STATUS_ALARM_NAME, { periodInMinutes: STATUS_ALARM_PERIOD_MINUTES });
  }

  function storageGetPromise() {
    return new Promise(function resolveStorageGet(resolve) {
      storageGet(resolve);
    });
  }

  function storageSetPromise(stats) {
    return new Promise(function resolveStorageSet(resolve) {
      storageSet(stats, resolve);
    });
  }

  function enqueueUsageIncrement(message, sender, sendResponse) {
    var job = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function runIncrement() {
      var nowDate = new Date();
      return storageGetPromise().then(function update(stats) {
        var payload = mergeRecentNetworkObservation(message.payload || {}, sender, nowDate);
        if (rememberUsageSubmission(payload, nowDate) || isDuplicatePayloadEvent(stats, payload)) {
          return storageSetPromise(stats).then(function respondDuplicate(savedStats) {
            sendResponse({
              ok: true,
              recorded: false,
              duplicate: true,
              event: null,
              stats: savedStats
            });
          });
        }
        var beforeCount = totalCount(stats);
        var nextStats = applyIncrement(stats, payload, nowDate);
        return storageSetPromise(nextStats).then(function respond(savedStats) {
          var recorded = totalCount(savedStats) > beforeCount;
          var duplicate = !recorded && isDuplicatePayloadEvent(savedStats, payload);
          sendResponse({
            ok: true,
            recorded: recorded,
            duplicate: duplicate,
            event: recorded && savedStats.events && savedStats.events[0] ? savedStats.events[0] : null,
            stats: savedStats
          });
        });
      });
    }).catch(function reportIncrementError(error) {
      sendResponse({
        ok: false,
        recorded: false,
        error: String((error && error.message) || error || "Usage increment failed.")
      });
    });

    usageIncrementQueue = job.catch(function keepQueueAlive() {});
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "usage.get") {
      storageGet(function respond(stats) {
        // 带上当前状态记录再刷角标,否则 OpenAI 异常期间打开面板会把角标的 !/? 状态徽标刷回普通数字。
        statusGet(function withStatus(record) {
          setBadge(stats, record);
          sendResponse({ ok: true, stats: stats });
        });
      });
      return true;
    }

    if (message.type === "settings.get") {
      settingsGet(function respond(settings) {
        sendResponse({ ok: true, settings: settings });
      });
      return true;
    }

    if (message.type === "settings.set") {
      settingsSet(message.settings || {}, function respond(settings) {
        sendResponse({ ok: true, settings: settings });
      });
      return true;
    }

    if (message.type === "openai.status.get") {
      statusGet(function respondWithCachedStatus(statusRecord) {
        // 只有"成功且有内容"的缓存才直接返回;缓存为空或上次抓取失败(ok:false)时强制重新抓取。
        // 否则一次失败被缓存后,之后每次读取/刷新都卡在旧的失败结果上,表现为"状态无法获取、刷新没用"。
        var hasGoodCache = statusRecord && statusRecord.ok && statusRecord.status;
        if (hasGoodCache && message.cached !== false) {
          sendResponse({ ok: statusRecord.ok, status: statusRecord.status, statusRecord: statusRecord, error: statusRecord.error });
          return;
        }
        refreshOpenAIStatus(sendResponse);
      });
      return true;
    }

    if (message.type === "usage.increment") {
      enqueueUsageIncrement(message, sender, sendResponse);
      return true;
    }

    if (message.type === "usage.reset") {
      var empty = createEmptyStats();
      storageSet(empty, function respond(savedStats) {
        sendResponse({ ok: true, stats: savedStats });
      });
      return true;
    }

    if (message.type === "usage.download") {
      downloadViaApi(message, sendResponse);
      return true;
    }

    if (message.type === "badge.setFilter") {
      setBadgeFilter(message.filter);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try { chrome.storage.local.set({ chatgptUsageBadgeFilter: badgeFilter }); } catch (_) {}
      }
      storageGet(function withStats(stats) {
        statusGet(function withStatus(record) {
          setBadge(stats, record);
          sendResponse({ ok: true, filter: badgeFilter });
        });
      });
      return true;
    }

    return false;
  }

  // 旧环境的单文件下载回退：内容脚本把 data: URL 交给后台 chrome.downloads。
  // 当前弹窗通常直接使用 Blob URL；多对话导出只下载一个 ZIP。
  function downloadViaApi(message, sendResponse) {
    try {
      if (typeof chrome === "undefined" || !chrome.downloads || typeof chrome.downloads.download !== "function") {
        sendResponse({ ok: false, error: "no-downloads-api" });
        return;
      }
      chrome.downloads.download(
        { url: message.url, filename: message.filename, saveAs: false },
        function onStarted(downloadId) {
          if (chrome.runtime && chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          sendResponse({ ok: typeof downloadId === "number", downloadId: downloadId });
        }
      );
    } catch (error) {
      sendResponse({ ok: false, error: String((error && error.message) || error) });
    }
  }

  function addChromeListener(event, listener) {
    if (event && typeof event.addListener === "function") {
      event.addListener.apply(event, Array.prototype.slice.call(arguments, 1));
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime) {
    addChromeListener(chrome.runtime.onMessage, handleMessage);
    // SW 启动即恢复角标范围过滤器(只加载变量,不在这里强行刷角标,以免覆盖状态徽标);
    // 后续 setBadge(计数/状态刷新/面板推送范围)都会带上这个过滤器生效。
    loadBadgeFilter();
    addChromeListener(chrome.runtime.onInstalled, function handleInstalled() {
      ensureStatusAlarm();
      refreshOpenAIStatus();
      loadBadgeFilter();
    });
    addChromeListener(chrome.runtime.onStartup, function handleStartup() {
      ensureStatusAlarm();
      refreshOpenAIStatus();
      loadBadgeFilter();
    });
    addChromeListener(chrome.alarms && chrome.alarms.onAlarm, function handleAlarm(alarm) {
      if (alarm && alarm.name === STATUS_ALARM_NAME) {
        refreshOpenAIStatus();
      }
    });
    addChromeListener(chrome.tabs && chrome.tabs.onUpdated, function handleTabUpdated(tabId, changeInfo, tab) {
      var url = (changeInfo && changeInfo.url) || (tab && tab.url);
      if (isChatGPTUrl(url)) {
        injectIsolatedContentScripts(tabId);
        return;
      }

      if (changeInfo && changeInfo.status === "complete" && tab && isChatGPTUrl(tab.url)) {
        injectIsolatedContentScripts(tabId);
      }
    });
    addChromeListener(chrome.webRequest && chrome.webRequest.onBeforeRequest, function handleBeforeRequest(details) {
      observeNetworkRequest(details);
    }, { urls: CHATGPT_URL_PATTERNS }, ["requestBody"]);
    ensureStatusAlarm();
  }

  root.ChatGPTUsageBackground = {
    SETTINGS_KEY: SETTINGS_KEY,
    STORAGE_KEY: STORAGE_KEY,
    STATUS_ALARM_NAME: STATUS_ALARM_NAME,
    STATUS_ALARM_PERIOD_MINUTES: STATUS_ALARM_PERIOD_MINUTES,
    STATUS_KEY: STATUS_KEY,
    ISOLATED_CONTENT_SCRIPT_FILES: ISOLATED_CONTENT_SCRIPT_FILES.slice(),
    applyIncrement: applyIncrement,
    badgeText: badgeText,
    computeBadgeCount: computeBadgeCount,
    setBadgeFilter: setBadgeFilter,
    sanitizeBadgeFilter: sanitizeBadgeFilter,
    createDefaultSettings: createDefaultSettings,
    createEmptyStats: createEmptyStats,
    extractConversationId: extractConversationId,
    actionTitle: actionTitle,
    createOpenAIStatusRecord: createOpenAIStatusRecord,
    isChatGPTUrl: isChatGPTUrl,
    isAbnormalOpenAIStatus: isAbnormalOpenAIStatus,
    openAIStatusState: openAIStatusState,
    sanitizeSettings: sanitizeSettings,
    sanitizeOpenAIStatusRecord: sanitizeOpenAIStatusRecord,
    resolvePayloadModelInfo: resolvePayloadModelInfo,
    mergeRecentNetworkObservation: mergeRecentNetworkObservation,
    observeNetworkRequest: observeNetworkRequest,
    parseNetworkRequestBody: parseNetworkRequestBody,
    parseNetworkRequestDetails: parseNetworkRequestDetails,
    sanitizeModelName: sanitizeModelName,
    sanitizeOpenAIStatusPayload: sanitizeOpenAIStatusPayload,
    statusBadgeColor: statusBadgeColor,
    statusBadgeText: statusBadgeText,
    sanitizeVariantStats: sanitizeVariantStats,
    todayKey: todayKey,
    totalCount: totalCount
  };

  if (typeof module === "object" && module.exports) {
    module.exports = root.ChatGPTUsageBackground;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
