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
  var CHATGPT_MODE_SLUG_RE = /^gpt-(?:(?:\d+(?:[-_.]\d+)*)|4o|4\.5|4\.1|4|3\.5)[-_.](thinking|instant|fast|auto|pro)$/i;
  var CHATGPT_INTERNAL_FAMILY_RE = /^gpt-\d+-\d+(?:[-_.][a-z0-9][a-z0-9._-]*)?$/i;
  var MODEL_FIELD_CONTEXT_RE = /(?:^|[\s{[,(])(?:"|')?(?:model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)(?:"|')?\s*[:=]\s*(?:"|')?([a-z][a-z0-9._-]{1,95})/i;
  var MODEL_TEXT_CONTEXT_RE = /\b(?:current model|selected model|active model|model selector|model switcher|model-switcher|data-model|data-model-id)\b/i;
  var SLUG_TOKEN_RE = /\b[a-z][a-z0-9._-]{1,95}\b/gi;

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
      /^gpt-5\.\d+(?:$|[-_.])/.test(slug) ||
      /^image-\d+-image$/.test(slug) ||
      isFeatureNamedSlug(slug) ||
      /^(?:reasoning(?:effort|summary)?|texte?(?:verbosity|format)?|tools?|toolchoice|temperature|topp|topk|toplogprobs|logprobs|logitbias|frequencypenalty|presencepenalty|max(?:output|completion)?tokens|max(?:tool)?calls|paralleltoolcalls|servicetier|truncation|responseformat|modalities|audio|prompt|include|stop|seed|store|conversationmode|websearch(?:options)?|deepresearch|deepsearch|agentmode|imagegeneration(?:options)?|canvas(?:mode|options)?|inputaudiotranscription|turndetection|stream|streamoptions|metadata|messages?|instructions?|contents?|attachments?|files?)$/.test(key);
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

  function isModelSlug(value) {
    var clean = normalizeSlug(value);
    // 真实模型 slug 形如 gpt-5-5 / gpt-5-5-thinking / gpt-5-3-instant(短横线+次版本号),
    // 每个都是独立模型。结构合法、非功能/参数名、非句点展示标签(gpt-5.x)即视为模型。
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      !isDeniedModelSlug(clean) &&
      hasGenericModelSlugEvidence(clean);
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
    var clean = normalizeSlug(text);
    var gpt = clean.match(/\bgpt[-\s]?(5|4o|4\.5|4\.1|4|3\.5)(?![.\-]\d)(?:[-\s]+(chat|instant|thinking|fast|mini|nano|pro|turbo|preview|audio|realtime|transcribe|tts))?\b/i);
    if (!gpt) {
      return "";
    }

    var suffix = String(gpt[2] || "")
      .replace(/\b(current|model|selected|active|api|chatgpt)\b/g, " ")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "");
    var slug = "gpt-" + gpt[1].toLowerCase() + (suffix ? "-" + suffix : "");
    return isModelSlug(slug) ? slug : "";
  }

  function slugFromModelFieldText(text) {
    var clean = normalizeWhitespace(text);
    var match = clean.match(MODEL_FIELD_CONTEXT_RE);
    if (!match) {
      return "";
    }

    var slug = normalizeSlug(match[1]).replace(/[.,:;|()[\]{}]+$/g, "");
    return isModelSlug(slug) ? slug : "";
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
    if (chatGPTModeModelFromSlug(clean)) {
      return clean;
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
    var mode = inferMode(slug);
    var parameters = {
      model: slug,
      endpoints: TEXT_ENDPOINTS.slice(0)
    };
    if (/^(?:gpt|o\d+)/.test(slug) || mode === "thinking" || mode === "pro") {
      parameters["reasoning.effort"] = REASONING_EFFORTS.slice(0);
    }
    if (/^gpt/.test(slug)) {
      parameters["text.verbosity"] = VERBOSITY_LEVELS.slice(0);
    }
    return parameters;
  }

  function resolveModelInfo(text) {
    var slug = extractSlug(text);
    if (!slug) {
      return null;
    }

    // GPT-5.x 的裸基座(gpt-5-5 / gpt-5-3 等,无模式后缀)在 ChatGPT 里就是 Instant 变体:
    // Instant 模式请求体只发裸 slug,Thinking 发 gpt-5-N-thinking。直接计入并显示为
    // gpt-5-N-instant,与 thinking 区分;apiModel 保留真实裸 slug。配套 background 的
    // 「裸基座不覆盖更具体变体」保证 thinking 不会被降级成裸基座再误判成 instant。
    var bareGpt5xBase = /^gpt-\d+-\d+$/.test(slug);
    return {
      label: bareGpt5xBase ? slug + "-instant" : (labelFromApiSlug(slug) || slug),
      apiModel: slug,
      family: "",
      mode: bareGpt5xBase ? "instant" : (inferMode(slug) || inferMode(text)),
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
    resolveModelInfo: resolveModelInfo,
    resolveModelLabel: resolveModelLabel
  };
});
