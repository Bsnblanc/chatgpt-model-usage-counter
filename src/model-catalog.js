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
  var EXECUTION_MODE_SUFFIX_RE = /[-_.](thinking|instant|fast|auto|pro)$/i;

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
    // "chat" by itself is too broad for visible page text: ordinary controls
    // such as "Chats" were previously accepted as a model slug. Keep the
    // known ChatGPT route explicitly and let future versioned chat-* routes
    // pass through hasExplicitVersionEvidence instead.
    return /^(?:gpt|o\d+(?:-(?:mini|pro|high))?|chat-latest(?:$|[-_.])|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(slug);
  }

  function isFeatureNamedSlug(value) {
    var slug = normalizeSlug(value);
    return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas|file-?upload|attachments?|uploads?|code-?interpreter|data-?analysis|python|connectors?|connected-?apps?|gpts|gizmo(?:-?id)?|gpt-?id|custom-?gpt|tasks?|scheduled-?tasks?)(?:$|[-_.])/.test(slug) &&
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

  function isChatGPTRouteSlug(value) {
    var clean = normalizeSlug(value);
    // "auto" is a real ChatGPT request route only when it comes from an exact
    // request/catalog field. resolveModelInfo still rejects arbitrary visible
    // "Auto" text, so this does not turn a generic UI label into a model.
    return clean === "auto" || isRequestModelSlug(clean);
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

  function usesIntelligenceModel(mode) {
    return mode === "thinking" || mode === "pro";
  }

  function normalizePublicMode(value) {
    var clean = normalizeWhitespace(value).toLowerCase();
    if (!clean) {
      return "";
    }
    if (/^(?:reasoning|think|thinking)$/.test(clean)) return "thinking";
    if (/^(?:instant|fast)$/.test(clean)) return clean;
    if (/^(?:pro|auto)$/.test(clean)) return clean;
    return inferMode(clean);
  }

  function publicModeLabel(mode, preset, explicitLabel) {
    var label = sanitizePublicModelLabel(explicitLabel);
    if (label) {
      return label;
    }
    label = sanitizePublicModelLabel(
      preset && (preset.selectedDisplayTitle || preset.title || preset.lane)
    );
    if (label) {
      return label;
    }
    var clean = normalizePublicMode(mode);
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
  }

  function presetMode(preset) {
    var source = preset && typeof preset === "object" ? preset : {};
    return normalizePublicMode(
      source.lane ||
      source.selectedDisplayTitle ||
      source.title
    );
  }

  function versionPresetCandidates(version, requestSlug, baseSlug) {
    var request = normalizeSlug(requestSlug);
    var base = normalizeSlug(baseSlug);
    if (!version || (!request && !base)) {
      return [];
    }
    var presets = version.intelligencePresets || [];
    var exact = presets.filter(function exactRequest(preset) {
      return preset.modelSlug === request;
    });
    if (exact.length) {
      return exact;
    }
    return presets.filter(function baseRequest(preset) {
      return preset.modelSlug === base;
    });
  }

  function versionPresetForSlug(version, requestSlug, baseSlug, modeHint) {
    var candidates = versionPresetCandidates(version, requestSlug, baseSlug);
    var expectedMode = normalizePublicMode(modeHint);
    if (expectedMode) {
      var matching = candidates.filter(function matchesMode(preset) {
        return presetMode(preset) === expectedMode;
      });
      return matching.length === 1 ? matching[0] : null;
    }
    return candidates.length === 1 ? candidates[0] : null;
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

  function sanitizePublicModelLabel(value) {
    var clean = normalizeWhitespace(value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[|]+$/g, "")
      .trim()
      .slice(0, 96);
    if (!clean || /^(?:default|none|null|undefined|unknown(?: model)?)$/i.test(clean)) {
      return "";
    }
    return clean;
  }

  function sanitizeRuntimeModelCatalog(catalog) {
    var source = catalog && typeof catalog === "object" ? catalog : {};
    var models = (Array.isArray(source.models) ? source.models : []).slice(0, 200).map(function cleanModel(model) {
      var item = model && typeof model === "object" ? model : {};
      var slug = normalizeSlug(item.slug || item.id || item.model);
      if (!isChatGPTRouteSlug(slug)) {
        return null;
      }
      return {
        slug: slug,
        title: sanitizePublicModelLabel(item.title || item.name || item.display_name),
        reasoningType: normalizeWhitespace(item.reasoningType || item.reasoning_type).toLowerCase().slice(0, 32)
      };
    }).filter(Boolean);
    var versions = (Array.isArray(source.versions) ? source.versions : []).slice(0, 120).map(function cleanVersion(version) {
      var item = version && typeof version === "object" ? version : {};
      var slugs = (Array.isArray(item.slugs) ? item.slugs : []).map(normalizeSlug).filter(isChatGPTRouteSlug).slice(0, 40);
      var presets = (Array.isArray(item.intelligencePresets)
        ? item.intelligencePresets
        : Array.isArray(item.intelligence_presets)
          ? item.intelligence_presets
          : []).slice(0, 40).map(function cleanPreset(preset) {
            var value = preset && typeof preset === "object" ? preset : {};
            return {
              title: sanitizePublicModelLabel(value.title),
              selectedDisplayTitle: sanitizePublicModelLabel(value.selectedDisplayTitle || value.selected_display_title),
              selectedDisplayVersion: sanitizePublicModelLabel(value.selectedDisplayVersion || value.selected_display_version),
              modelSlug: isChatGPTRouteSlug(value.modelSlug || value.model_slug)
                ? normalizeSlug(value.modelSlug || value.model_slug)
                : "",
              lane: normalizeWhitespace(value.lane).toLowerCase().slice(0, 32),
              presetType: normalizeWhitespace(value.presetType || value.preset_type).toLowerCase().slice(0, 32)
            };
          }).filter(function keepPreset(preset) {
            return preset.modelSlug || preset.title || preset.selectedDisplayTitle;
          });
      if (!slugs.length && !presets.length) {
        return null;
      }
      return {
        id: sanitizePublicModelLabel(item.id),
        displayText: sanitizePublicModelLabel(item.displayText || item.display_text),
        displayTextForIntelligence: sanitizePublicModelLabel(item.displayTextForIntelligence || item.display_text_for_intelligence),
        shortDisplayTextForIntelligence: sanitizePublicModelLabel(item.shortDisplayTextForIntelligence || item.short_display_text_for_intelligence),
        slugs: slugs,
        intelligencePresets: presets
      };
    }).filter(Boolean);
    var categories = (Array.isArray(source.categories) ? source.categories : []).slice(0, 120).map(function cleanCategory(category) {
      var item = category && typeof category === "object" ? category : {};
      var defaultModel = normalizeSlug(item.defaultModel || item.default_model);
      if (!isChatGPTRouteSlug(defaultModel)) {
        defaultModel = "";
      }
      var supportedModels = (Array.isArray(item.supportedModels) ? item.supportedModels : Array.isArray(item.supported_models) ? item.supported_models : [])
        .map(normalizeSlug)
        .filter(isChatGPTRouteSlug)
        .slice(0, 80);
      if (!defaultModel && !supportedModels.length) {
        return null;
      }
      return {
        humanCategoryName: sanitizePublicModelLabel(item.humanCategoryName || item.human_category_name),
        humanCategoryShortName: sanitizePublicModelLabel(item.humanCategoryShortName || item.human_category_short_name),
        defaultModel: defaultModel,
        supportedModels: supportedModels
      };
    }).filter(Boolean);
    if (!models.length && !versions.length && !categories.length) {
      return null;
    }
    return {
      observedAt: normalizeWhitespace(source.observedAt || source.observed_at).slice(0, 48),
      models: models,
      versions: versions,
      categories: categories
    };
  }

  function runtimeModelBySlug(catalog, slug) {
    var clean = normalizeSlug(slug);
    return (catalog && catalog.models || []).filter(function matches(model) {
      return model.slug === clean;
    })[0] || null;
  }

  function runtimeVersionBySlug(catalog, slug) {
    var clean = normalizeSlug(slug);
    return (catalog && catalog.versions || []).filter(function matches(version) {
      return version.slugs.indexOf(clean) >= 0 || version.intelligencePresets.some(function presetMatches(preset) {
        return preset.modelSlug === clean;
      });
    })[0] || null;
  }

  function runtimeCategoryBySlug(catalog, slug) {
    var clean = normalizeSlug(slug);
    return (catalog && catalog.categories || []).filter(function matches(category) {
      return category.defaultModel === clean || category.supportedModels.indexOf(clean) >= 0;
    })[0] || null;
  }

  function runtimeBaseSlug(catalog, requestSlug) {
    var clean = normalizeSlug(requestSlug);
    if (runtimeModelBySlug(catalog, clean) || runtimeVersionBySlug(catalog, clean)) {
      return clean;
    }
    var candidate = clean;
    for (var i = 0; i < 3; i += 1) {
      var match = candidate.match(EXECUTION_MODE_SUFFIX_RE);
      if (!match) {
        break;
      }
      candidate = candidate.slice(0, candidate.length - match[0].length);
      if (runtimeModelBySlug(catalog, candidate) || runtimeVersionBySlug(catalog, candidate)) {
        return candidate;
      }
    }
    return clean;
  }

  function publicLabelsForRuntimeSlug(catalog, slug) {
    var labels = [];
    var seen = {};
    function add(value) {
      var label = sanitizePublicModelLabel(value);
      var key = normalizeKey(label);
      if (label && key && !seen[key]) {
        seen[key] = true;
        labels.push(label);
      }
    }
    var model = runtimeModelBySlug(catalog, slug);
    var version = runtimeVersionBySlug(catalog, slug);
    var category = runtimeCategoryBySlug(catalog, slug);
    if (model) add(model.title);
    if (version) {
      add(version.displayTextForIntelligence);
      add(version.shortDisplayTextForIntelligence);
    }
    if (category) {
      add(category.humanCategoryName);
      add(category.humanCategoryShortName);
    }
    return labels;
  }

  function selectedPublicModelFromText(text, runtimeCatalog) {
    var catalog = sanitizeRuntimeModelCatalog(runtimeCatalog);
    var clean = normalizeWhitespace(text);
    if (!catalog || !clean) {
      return "";
    }
    var cleanKey = normalizeKey(clean);
    var labels = [];
    catalog.models.forEach(function addModel(model) {
      if (model.title) labels.push(model.title);
    });
    catalog.versions.forEach(function addVersion(version) {
      if (version.displayTextForIntelligence) labels.push(version.displayTextForIntelligence);
      if (version.shortDisplayTextForIntelligence) labels.push(version.shortDisplayTextForIntelligence);
    });
    labels.sort(function longestFirst(left, right) { return right.length - left.length; });
    for (var i = 0; i < labels.length; i += 1) {
      var label = labels[i];
      var key = normalizeKey(label);
      if (key && (cleanKey === key || cleanKey.indexOf(key) >= 0 || key.indexOf(cleanKey) >= 0)) {
        return label;
      }
    }
    for (var versionIndex = 0; versionIndex < catalog.versions.length; versionIndex += 1) {
      var version = catalog.versions[versionIndex];
      var versionId = normalizeWhitespace(version.id);
      if (!versionId || clean.toLowerCase().indexOf(versionId.toLowerCase()) < 0) {
        continue;
      }
      if (/(?:thinking|reasoning|extra\s*high|xhigh|\bhigh\b|\bmedium\b|\blow\b|pro)/i.test(clean) && version.displayTextForIntelligence) {
        return version.displayTextForIntelligence;
      }
      var baseSlug = version.slugs[0] || (version.intelligencePresets[0] && version.intelligencePresets[0].modelSlug);
      var model = runtimeModelBySlug(catalog, baseSlug);
      if (model && model.title) {
        return model.title;
      }
    }
    return "";
  }

  function resolveRuntimePublicModelInfo(runtimeCatalog, requestModel, options) {
    var catalog = sanitizeRuntimeModelCatalog(runtimeCatalog);
    var requestSlug = normalizeSlug(requestModel);
    if (!isChatGPTRouteSlug(requestSlug)) {
      return null;
    }
    var settings = options && typeof options === "object" ? options : {};
    var selected = sanitizePublicModelLabel(settings.selectedPublicModel) ||
      selectedPublicModelFromText(settings.selectedText, catalog);
    var baseSlug = catalog ? runtimeBaseSlug(catalog, requestSlug) : requestSlug;
    var model = catalog ? runtimeModelBySlug(catalog, baseSlug) : null;
    var version = catalog ? runtimeVersionBySlug(catalog, baseSlug) : null;
    var requestMode = inferMode(requestSlug);
    var explicitPublicMode = normalizePublicMode(settings.selectedPublicMode);
    var explicitPublicModeLabel = sanitizePublicModelLabel(settings.selectedPublicModeLabel);
    var selectedTextMode = normalizePublicMode(settings.selectedText);
    // Submit-time selector evidence describes what the user chose. It must
    // outrank the later request/response slug when resolving the public mode.
    var modeHint = explicitPublicMode || selectedTextMode || requestMode;
    var label = "";
    var source = "";
    var expectedLabel = "";

    var presetCandidates = versionPresetCandidates(version, requestSlug, baseSlug);
    var versionPreset = versionPresetForSlug(version, requestSlug, baseSlug, modeHint);
    var resolvedPresetMode = presetMode(versionPreset);
    var mode = requestMode || resolvedPresetMode;
    var selectedPublicMode = explicitPublicMode || selectedTextMode || resolvedPresetMode || requestMode;
    var selectedPublicModeSource = explicitPublicMode
      ? normalizeWhitespace(settings.selectedPublicModeSource || "selector-dom").slice(0, 80)
      : selectedTextMode
        ? normalizeWhitespace(settings.selectedPublicModeSource || "selector-dom:model-control").slice(0, 80)
        : versionPreset && resolvedPresetMode
          ? "account-catalog:intelligence-preset"
          : requestMode
            ? "request-slug"
            : "";
    var selectedPublicModeLabel = publicModeLabel(
      selectedPublicMode,
      versionPreset,
      explicitPublicModeLabel
    );

    // ChatGPT exposes "Model" and "Effort" as separate picker fields. The live
    // account catalog can intentionally expose the same internal base slug in
    // two layers:
    //   models[].title                       -> fallback/base model name
    //   versions[].displayTextForIntelligence -> currently selectable model
    //
    // A version intelligence_preset is the account's explicit binding from an
    // exact request slug (including the Instant lane) to that selectable
    // public model. It therefore outranks models[].title. Without this rule a
    // paid account selecting "GPT-5.6 Sol / Instant" is falsely recorded as
    // "GPT-5.6 Luna" merely because both layers share gpt-5-6.
    //
    // -thinking and -pro are also intelligence routes after their suffix is
    // reduced to the version's base slug. Unknown/unbound slugs stay exact.
    if (
      version &&
      version.displayTextForIntelligence &&
      (usesIntelligenceModel(requestMode) || presetCandidates.length)
    ) {
      expectedLabel = version.displayTextForIntelligence;
      label = expectedLabel;
      source = usesIntelligenceModel(mode)
        ? "account-catalog:version-intelligence"
        : "account-catalog:version-preset";
    } else if (model && model.title) {
      expectedLabel = model.title;
      label = expectedLabel;
      source = "account-catalog:model-title";
    }

    if (selected && catalog) {
      var selectedKey = normalizeKey(selected);
      var selectedIsCatalogLabel = publicLabelsForRuntimeSlug(catalog, baseSlug)
        .map(normalizeKey)
        .indexOf(selectedKey) >= 0;
      var selectedMatchesExpected = expectedLabel && (
        selectedKey === normalizeKey(expectedLabel) ||
        (
          usesIntelligenceModel(mode) &&
          version &&
          selectedKey === normalizeKey(version.shortDisplayTextForIntelligence)
        )
      );
      if (selectedIsCatalogLabel && (!expectedLabel || selectedMatchesExpected)) {
        label = expectedLabel || selected;
        source = "selector+account-catalog";
      }
    }
    if (!label) {
      label = requestSlug;
      source = "unmapped-request-slug";
    }

    return {
      publicModel: sanitizePublicModelLabel(label) || requestSlug,
      requestModel: requestSlug,
      baseModel: baseSlug,
      mode: mode,
      selectedPublicMode: selectedPublicMode,
      selectedPublicModeLabel: selectedPublicModeLabel,
      selectedPublicModeSource: selectedPublicModeSource,
      mappingStatus: /^unmapped/.test(source) ? "unmapped" : "mapped",
      source: source,
      catalogObservedAt: catalog ? catalog.observedAt : ""
    };
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
    isChatGPTRouteSlug: isChatGPTRouteSlug,
    resolveModelInfo: resolveModelInfo,
    resolveModelLabel: resolveModelLabel,
    resolveRequestModelInfo: resolveRequestModelInfo,
    resolveRuntimePublicModelInfo: resolveRuntimePublicModelInfo,
    usesIntelligenceModel: usesIntelligenceModel,
    sanitizePublicModelLabel: sanitizePublicModelLabel,
    normalizePublicMode: normalizePublicMode,
    sanitizeRuntimeModelCatalog: sanitizeRuntimeModelCatalog,
    selectedPublicModelFromText: selectedPublicModelFromText
  };
});
