(function initModelCatalog(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTModelCatalog = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function modelCatalogFactory() {
  "use strict";

  var REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh"];
  var VERBOSITY_LEVELS = ["low", "medium", "high"];
  var TEXT_ENDPOINTS = ["responses", "chat.completions"];
  var MODE_SUFFIX_RE = /(?:[-_.](thinking|instant|fast|auto|pro))$/i;
  var CHATGPT_MODE_SLUG_RE = /^gpt-(?:(?:\d+(?:[-_.]\d+)*)|4o)[-_.](thinking|instant|fast|auto|pro)$/i;
  var MODEL_FIELD_CONTEXT_RE = /(?:^|[\s{[,(])(?:"|')?(?:model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)(?:"|')?\s*[:=]\s*(?:"|')?([a-z][a-z0-9._-]{1,95})/i;
  var MODEL_TEXT_CONTEXT_RE = /\b(?:current model|selected model|active model|model selector|model switcher|model-switcher|data-model|data-model-id)\b/i;
  var SLUG_TOKEN_RE = /\b[a-z][a-z0-9._-]{1,95}\b/gi;
  var GENERIC_VERSIONED_SLUG_RE = /^(?=[a-z0-9._-]{2,96}$)(?=.*[a-z])(?=.*\d)(?=.*[-_.])[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+$/i;

  function normalizeWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) {
    return normalizeWhitespace(value)
      .toLowerCase()
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/[^a-z0-9]+/g, "");
  }

  function normalizeSlug(value) {
    return canonicalizeChatGPTModeSlug(normalizeWhitespace(value).toLowerCase().replace(/_/g, "-"));
  }

  function canonicalizeChatGPTModeSlug(value) {
    var slug = normalizeWhitespace(value).toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
    // 不再折叠次版本号:gpt-5-5-thinking 保持原样(它与 gpt-5-4-thinking 是不同模型)。
    return slug;
  }

  function isDeniedModelSlug(value) {
    var slug = normalizeSlug(value);
    var key = normalizeKey(slug);
    return !slug ||
      /^(auto|default|none|null|undefined|chatgpt)$/.test(slug) ||
      /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) ||
      /^(?:gpt)?lastusedmodel$/.test(key) ||
      /^image-\d+-image$/.test(slug) ||
      isFeatureNamedSlug(slug) ||
      /^(?:model|modelslug|modelid|selectedmodel|apimodel|chatgptmodel|reasoning(?:effort|summary)?|texte?(?:verbosity|format)?|tools?|toolchoice|temperature|topp|topk|toplogprobs|logprobs|logitbias|frequencypenalty|presencepenalty|max(?:output|completion)?tokens|max(?:tool)?calls|paralleltoolcalls|servicetier|truncation|responseformat|modalities|audio|prompt|include|stop|seed|store|conversationmode|websearch(?:options)?|deepresearch|deepsearch|agentmode|imagegeneration(?:options)?|canvas(?:mode|options)?|inputaudiotranscription|turndetection|stream|streamoptions|metadata|messages?|instructions?|contents?|attachments?|files?|request|response|endpoint|transport|protocol|session|conversation)$/.test(key);
  }

  function hasKnownModelPrefix(slug) {
    if (/^image-\d+-image$/i.test(String(slug || "").replace(/_/g, "-"))) {
      return false;
    }
    return /^(?:gpt|o\d+(?:-(?:mini|pro|high))?|chat|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(slug);
  }

  function isFeatureNamedSlug(value) {
    var slug = normalizeSlug(value);
    return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas)(?:$|[-_.])/.test(slug) &&
      !/^(?:gpt-image|dall-e|image-\d)/i.test(slug);
  }

  function hasGenericModelSlugEvidence(slug) {
    if (hasKnownModelPrefix(slug)) {
      return true;
    }

    if (MODE_SUFFIX_RE.test(slug) && /(?:^|[-_.])(?:\d{1,4}|latest|preview)(?:$|[-_.])/.test(slug)) {
      return true;
    }

    if (/(?:[-_.](?:latest|preview|realtime|audio|tts|transcribe))$/i.test(slug)) {
      return /(?:^|[-_.])(?:model|family|chat|assistant|response|openai|\d{1,4})(?:$|[-_.])/.test(slug);
    }

    return false;
  }

  function genericVersionRootKey(slug) {
    var parts = normalizeSlug(slug).split(/[-_.]+/);
    var versionIndex = -1;
    for (var i = 0; i < parts.length; i += 1) {
      if (/\d/.test(parts[i])) {
        versionIndex = i;
        break;
      }
    }
    return versionIndex > 0 ? parts.slice(0, versionIndex).join("") : "";
  }

  function hasExplicitVersionEvidence(slug) {
    if (!GENERIC_VERSIONED_SLUG_RE.test(slug)) {
      return false;
    }
    var rootKey = genericVersionRootKey(slug);
    return Boolean(rootKey && !isDeniedModelSlug(rootKey));
  }

  function isModelSlug(value) {
    var clean = normalizeSlug(value);
    // 真实模型 slug 形如 gpt-5-5 / gpt-5-5-thinking / gpt-5-3-instant(短横线+次版本号),
    // 每个都是独立模型。结构合法、非功能/参数名、非句点展示标签(gpt-5.x)即视为模型。
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      !isDeniedModelSlug(clean) &&
      hasGenericModelSlugEvidence(clean);
  }

  function isRequestModelSlug(value) {
    var clean = normalizeSlug(value);
    // Exact model-bearing fields are stronger evidence than arbitrary page
    // text. This accepts a future family such as "aurora-7" without turning
    // ordinary unversioned UI labels into models.
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      !isDeniedModelSlug(clean) &&
      (hasGenericModelSlugEvidence(clean) || hasExplicitVersionEvidence(clean));
  }

  function cloneParameters(parameters) {
    var result = {};
    Object.keys(parameters || {}).forEach(function copy(key) {
      var value = parameters[key];
      result[key] = Array.isArray(value) ? value.slice(0) : value;
    });
    return result;
  }

  function inferMode(text) {
    var match = normalizeWhitespace(text).match(MODE_SUFFIX_RE) || normalizeWhitespace(text).match(/\b(thinking|instant|fast|auto|pro)\b/i);
    return match ? match[1].toLowerCase() : "";
  }

  function chatGPTModeModelFromSlug(apiSlug) {
    var slug = normalizeSlug(apiSlug);
    var match = slug.match(CHATGPT_MODE_SLUG_RE);
    return match ? match[1].toLowerCase() : "";
  }

  function labelFromApiSlug(apiSlug) {
    var slug = normalizeSlug(apiSlug);
    return isModelSlug(slug) ? slug : "";
  }

  function slugFromHumanLabel(text) {
    var clean = normalizeWhitespace(text)
      .replace(/^(?:current model|selected model|active model|model selector|model switcher|switch model)\s*[:：-]?\s*/i, "")
      .replace(/\s+(?:model[-\s]?switcher(?:[-\s]?dropdown)?(?:[-\s]?button)?|dropdown[-\s]?button|menu[-\s]?button)\b.*$/i, "")
      .replace(/[()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    var oSeries = clean.match(/^(o\d+)(?:[-\s]+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2}))?$/i);
    if (oSeries) {
      var oSuffix = normalizeWhitespace(oSeries[2] || "")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "");
      var oSlug = String(oSeries[1] || "").toLowerCase() + (oSuffix ? "-" + oSuffix : "");
      return isModelSlug(oSlug) ? oSlug : "";
    }
    var gpt = clean.match(/^(?:chatgpt|gpt)[-\s]?(\d+(?:\.\d+)*|4o)(?:[-\s]+([a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,2}))?$/i);
    if (!gpt || /^(?:model|selected|current|active)$/i.test(String(gpt[2] || "").trim())) {
      return "";
    }

    var suffix = normalizeWhitespace(gpt[2] || "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
    var slug = "gpt-" + String(gpt[1] || "").toLowerCase() + (suffix ? "-" + suffix : "");
    return isModelSlug(slug) ? slug : "";
  }

  function slugFromModelFieldText(text) {
    var clean = normalizeWhitespace(text);
    var match = clean.match(MODEL_FIELD_CONTEXT_RE);
    if (!match) {
      return "";
    }

    var slug = normalizeSlug(match[1]).replace(/[.,:;|()[\]{}]+$/g, "");
    return isRequestModelSlug(slug) ? slug : "";
  }

  function slugFromTokens(text, requireModelContext) {
    var clean = normalizeWhitespace(text);
    if (requireModelContext && !MODEL_TEXT_CONTEXT_RE.test(clean)) {
      return "";
    }

    var tokens = clean.toLowerCase().replace(/_/g, "-").match(SLUG_TOKEN_RE) || [];
    for (var i = 0; i < tokens.length; i += 1) {
      if (isModelSlug(tokens[i])) {
        return normalizeSlug(tokens[i]);
      }
    }

    return "";
  }

  function extractSlug(text) {
    var clean = normalizeSlug(text);
    var fieldSlug = slugFromModelFieldText(text);
    if (fieldSlug) {
      return fieldSlug;
    }
    if (isModelSlug(clean)) {
      return clean;
    }

    var exact = clean.match(/\b(?:gpt|o\d|chat|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|image|audio)[a-z0-9._-]{1,95}\b/i);
    if (exact && MODE_SUFFIX_RE.test(exact[0]) && isModelSlug(exact[0])) {
      return exact[0];
    }

    var labelSlug = slugFromHumanLabel(text);
    if (labelSlug) {
      return labelSlug;
    }

    if (exact && isModelSlug(exact[0])) {
      return normalizeSlug(exact[0]);
    }

    return slugFromTokens(text, true);
  }

  function makeParameters(slug) {
    // Only observed request values belong in usage statistics. Supported-value
    // inventories (for example every possible reasoning effort) are not values
    // the user actually selected and must never be counted as parameters.
    return { model: slug };
  }

  function resolveModelInfo(text) {
    var slug = extractSlug(text);
    if (!slug) {
      return null;
    }

    return {
      // The exact observed slug is the model identity. Never manufacture an
      // "-instant" suffix from a bare versioned slug: current ChatGPT models
      // can share one model across instant/reasoning effort choices.
      label: labelFromApiSlug(slug) || slug,
      apiModel: slug,
      family: "",
      mode: inferMode(slug) || inferMode(text),
      deprecated: false,
      parameters: makeParameters(slug)
    };
  }

  function resolveRequestModelInfo(text) {
    var clean = normalizeSlug(text);
    var slug = slugFromModelFieldText(text);
    if (!slug && isRequestModelSlug(clean)) {
      slug = clean;
    }
    if (!slug) {
      return resolveModelInfo(text);
    }
    return {
      label: slug,
      apiModel: slug,
      family: "",
      mode: inferMode(slug) || inferMode(text),
      deprecated: false,
      parameters: makeParameters(slug)
    };
  }

  function resolveModelLabel(text) {
    var info = resolveModelInfo(text);
    return info ? info.label : "";
  }

  return {
    MODELS: [],
    REASONING_EFFORTS: REASONING_EFFORTS.slice(0),
    TEXT_ENDPOINTS: TEXT_ENDPOINTS.slice(0),
    VERBOSITY_LEVELS: VERBOSITY_LEVELS.slice(0),
    chatGPTModeModelFromSlug: chatGPTModeModelFromSlug,
    cloneParameters: cloneParameters,
    labelFromApiSlug: labelFromApiSlug,
    normalizeKey: normalizeKey,
    normalizeSlug: normalizeSlug,
    canonicalizeChatGPTModeSlug: canonicalizeChatGPTModeSlug,
    isDeniedModelSlug: isDeniedModelSlug,
    isFeatureNamedSlug: isFeatureNamedSlug,
    isModelSlug: isModelSlug,
    isRequestModelSlug: isRequestModelSlug,
    resolveModelInfo: resolveModelInfo,
    resolveModelLabel: resolveModelLabel,
    resolveRequestModelInfo: resolveRequestModelInfo
  };
});
