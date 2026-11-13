const assert = require("node:assert/strict");
const test = require("node:test");
const catalog = require("../src/model-catalog");

function runtimeCatalog() {
  return {
    observedAt: "2026-08-22T12:00:00.000Z",
    models: [
      { slug: "gpt-5-6", title: "GPT-5.6 Luna", reasoning_type: "auto" },
      { slug: "gpt-5-6-mini", title: "GPT-5.6 Luna", reasoning_type: "none" },
      { slug: "auto", title: "Auto", reasoning_type: "auto" }
    ],
    versions: [
      {
        id: "5.6",
        display_text: "Latest • 5.6",
        display_text_for_intelligence: "GPT-5.6 Sol",
        short_display_text_for_intelligence: "5.6 Sol",
        slugs: ["gpt-5-6"],
        intelligence_presets: [
          { title: "Instant", selected_display_title: "Instant", selected_display_version: "5.6", model_slug: "gpt-5-6", lane: "instant" }
        ]
      },
      {
        id: "auto",
        display_text_for_intelligence: "Auto",
        slugs: ["auto"],
        intelligence_presets: []
      }
    ],
    categories: [
      { human_category_name: "Instant", human_category_short_name: "5.6 Luna", default_model: "gpt-5-6", supported_models: ["gpt-5-6"] },
      { human_category_name: "Auto", default_model: "auto", supported_models: [] }
    ]
  };
}

function sharedSlugRuntimeCatalog() {
  return {
    observedAt: "2026-08-24T12:00:00.000Z",
    models: [
      { slug: "gpt-shared-7", title: "GPT Shared Base", reasoning_type: "auto" }
    ],
    versions: [
      {
        id: "shared-alpha",
        display_text_for_intelligence: "GPT Alpha",
        short_display_text_for_intelligence: "Alpha",
        slugs: ["gpt-shared-7"],
        intelligence_presets: [
          {
            title: "Instant",
            selected_display_title: "Instant",
            model_slug: "gpt-shared-7",
            lane: "instant"
          }
        ]
      },
      {
        id: "shared-beta",
        display_text_for_intelligence: "GPT Beta",
        short_display_text_for_intelligence: "Beta",
        slugs: ["gpt-shared-7"],
        intelligence_presets: [
          {
            title: "Pro",
            selected_display_title: "Pro",
            model_slug: "gpt-shared-7",
            lane: "pro"
          }
        ]
      }
    ],
    categories: []
  };
}

test("catalog derives metadata from exact slugs without hardcoded model inventory", () => {
  const thinking = catalog.resolveModelInfo("future-family-2026-thinking");
  assert.equal(thinking.label, "future-family-2026-thinking");
  assert.equal(thinking.apiModel, "future-family-2026-thinking");
  assert.equal(thinking.mode, "thinking");
  assert.deepEqual(thinking.parameters, { model: "future-family-2026-thinking" });

  const instant = catalog.resolveModelInfo("future-family-2027-instant");
  assert.equal(instant.label, "future-family-2027-instant");
  assert.equal(instant.apiModel, "future-family-2027-instant");
  assert.equal(instant.mode, "instant");
  assert.equal(catalog.resolveModelLabel("future-family-2026-thinking"), "future-family-2026-thinking");
  assert.equal(catalog.resolveModelLabel("future-family-2026-instant"), "future-family-2026-instant");

  const chatgptThinking = catalog.resolveModelInfo("gpt-5-thinking");
  assert.equal(chatgptThinking.label, "gpt-5-thinking");
  assert.equal(chatgptThinking.apiModel, "gpt-5-thinking");
  assert.equal(chatgptThinking.mode, "thinking");
  assert.deepEqual(chatgptThinking.parameters, { model: "gpt-5-thinking" });

  const exactChatGPTSlug = catalog.resolveModelInfo("gpt-5-5-thinking");
  assert.equal(exactChatGPTSlug.label, "gpt-5-5-thinking");
  assert.equal(exactChatGPTSlug.apiModel, "gpt-5-5-thinking");
  assert.equal(exactChatGPTSlug.mode, "thinking");
  assert.equal(catalog.resolveModelInfo("gpt-5-2-thinking").label, "gpt-5-2-thinking");
  assert.equal(catalog.resolveModelInfo("gpt-5-3-instant").label, "gpt-5-3-instant");
  assert.equal(catalog.resolveModelInfo("gpt-5-4-thinking").label, "gpt-5-4-thinking");
  assert.equal(catalog.resolveModelInfo("gpt-4-7-pro").label, "gpt-4-7-pro");
  assert.equal(catalog.resolveModelInfo("gpt_5_5_thinking").label, "gpt-5-5-thinking");
  assert.equal(catalog.resolveModelInfo("GPT-5.5 Thinking").label, "gpt-5.5-thinking");
  assert.equal(catalog.resolveModelInfo("gptLastUsedModel"), null);

  const realtime = catalog.resolveModelInfo("gpt-realtime-2");
  assert.equal(realtime.label, "gpt-realtime-2");
  assert.equal(realtime.apiModel, "gpt-realtime-2");

  const embedding = catalog.resolveModelInfo("text-embedding-3-large");
  assert.equal(embedding.label, "text-embedding-3-large");
  assert.equal(embedding.apiModel, "text-embedding-3-large");

  const image = catalog.resolveModelInfo("dall-e-3");
  assert.equal(image.label, "dall-e-3");
  assert.equal(image.apiModel, "dall-e-3");

  const generatedImage = catalog.resolveModelInfo("gpt-image-1");
  assert.equal(generatedImage.label, "gpt-image-1");
  assert.equal(generatedImage.apiModel, "gpt-image-1");

  const audioPreview = catalog.resolveModelInfo("gpt-4o-audio-preview");
  assert.equal(audioPreview.label, "gpt-4o-audio-preview");
  assert.equal(audioPreview.apiModel, "gpt-4o-audio-preview");

  assert.equal(catalog.resolveModelInfo("Auto"), null);
  assert.equal(catalog.resolveModelInfo("gpt-5-5").label, "gpt-5-5");
  assert.equal(catalog.resolveModelInfo("gpt-5-5-preview").label, "gpt-5-5-preview");
  assert.equal(catalog.resolveModelInfo("gpt_5_5").label, "gpt-5-5");
  assert.equal(catalog.resolveModelInfo("gpt_5_5_preview").label, "gpt-5-5-preview");
  assert.equal(catalog.MODELS.length, 0);
});

test("catalog parses visible GPT labels only as generic labels", () => {
  const info = catalog.resolveModelInfo("Current model GPT-4o mini");
  assert.equal(info.apiModel, "gpt-4o-mini");
  assert.equal(info.label, "gpt-4o-mini");
  assert.equal(info.deprecated, false);
});

test("catalog keeps thinking variants separated by exact model slug", () => {
  const gpt5Thinking = catalog.resolveModelInfo("GPT-5 Thinking");
  const futureThinking = catalog.resolveModelInfo("model: future-family-2026-thinking");

  assert.equal(gpt5Thinking.label, "gpt-5-thinking");
  assert.equal(gpt5Thinking.mode, "thinking");
  assert.equal(futureThinking.label, "future-family-2026-thinking");
  assert.equal(futureThinking.mode, "thinking");
  assert.notEqual(gpt5Thinking.label, futureThinking.label);
});

test("catalog does not classify model parameters or feature ids as models", () => {
  [
    "Unknown model",
    "reasoning.effort",
    "reasoning-effort",
    "text.verbosity",
    "text-verbosity",
    "tools",
    "tools.deep_research",
    "agent mode",
    "deep_research",
    "deep research",
    "deep_search",
    "deep search",
    "deepsearch",
    "deepsearch-v2",
    "deep-research",
    "deepresearch-v2",
    "deep-research-v2",
    "agent_mode",
    "agentmode",
    "agentmode-v2",
    "agent-mode",
    "agent-mode-v2",
    "image generation",
    "image_generation",
    "image_generation_options",
    "image-2-image",
    "image_2_image",
    "imagegeneration-v2",
    "image-generation",
    "image-generation-v2",
    "image-generation-options",
    "canvas",
    "canvas mode",
    "canvas_mode",
    "canvas-v2",
    "web_search",
    "web search",
    "websearch",
    "websearch-v2",
    "web-search",
    "web-search-v2",
    "web_search_options",
    "realtime",
    "realtime mode",
    "realtime-v2",
    "real_time",
    "real-time",
    "real-time-v2",
    "audio",
    "audio mode",
    "audio-v2",
    "voice",
    "voice mode",
    "voice-v2"
  ].forEach((value) => {
    assert.equal(catalog.resolveModelInfo(value), null, value);
    assert.equal(catalog.resolveModelLabel(value), "", value);
  });
});

test("catalog keeps exact ChatGPT dash-versioned model slugs distinct", () => {
  // 取自真实账号 /backend-api/models 的当前模型 slug —— 次版本号决定模型身份,必须各自独立计数。
  // Exact request slugs are identities. A bare slug is not rewritten to an
  // invented mode suffix.
  const expected = {
    "gpt-5-3": "gpt-5-3",
    "gpt-5-3-instant": "gpt-5-3-instant",
    "gpt-5-4-thinking": "gpt-5-4-thinking",
    "gpt-5-4-pro": "gpt-5-4-pro",
    "gpt-5-5": "gpt-5-5",
    "gpt-5-5-instant": "gpt-5-5-instant",
    "gpt-5-5-thinking": "gpt-5-5-thinking",
    "gpt-5-5-pro": "gpt-5-5-pro",
    "gpt-5-mini": "gpt-5-mini",
    "gpt-5-3-mini": "gpt-5-3-mini",
    "gpt-5-4-t-mini": "gpt-5-4-t-mini",
    "o3": "o3"
  };
  Object.keys(expected).forEach((slug) => {
    const info = catalog.resolveModelInfo(slug);
    assert.ok(info, `${slug} should resolve to a model, not be dropped`);
    assert.equal(info.label, expected[slug], slug);
    assert.equal(info.apiModel, slug);
  });
  // Minor versions and explicit modes remain separate identities.
  assert.notEqual(catalog.resolveModelInfo("gpt-5-4-thinking").label, catalog.resolveModelInfo("gpt-5-5-thinking").label);
  assert.notEqual(catalog.resolveModelInfo("gpt-5-3-instant").label, catalog.resolveModelInfo("gpt-5-5-instant").label);
  assert.notEqual(catalog.resolveModelInfo("gpt-5-5").label, catalog.resolveModelInfo("gpt-5-5-thinking").label);
  assert.notEqual(catalog.resolveModelInfo("gpt-5-5").label, catalog.resolveModelInfo("gpt-5-5-instant").label);
  // Feature names remain excluded; public dotted labels remain valid.
  assert.equal(catalog.resolveModelInfo("research"), null);
  assert.equal(catalog.resolveModelInfo("agent-mode"), null);
  assert.equal(catalog.resolveModelInfo("GPT-5.5").label, "gpt-5.5");
});

test("catalog accepts current public labels and unknown future GPT versions", () => {
  [
    ["GPT-5.6 Sol", "gpt-5.6-sol"],
    ["GPT-5.6 Sol Pro", "gpt-5.6-sol-pro"],
    ["GPT-5.6 Luna", "gpt-5.6-luna"],
    ["GPT-5.6 Luna Max", "gpt-5.6-luna-max"],
    ["GPT-5.6 Terra", "gpt-5.6-terra"],
    ["GPT-5.6 Terra Max", "gpt-5.6-terra-max"],
    ["GPT-6.1 Aurora", "gpt-6.1-aurora"],
    ["o5 hyper", "o5-hyper"],
    ["gpt-6-1-aurora", "gpt-6-1-aurora"]
  ].forEach(([input, expected]) => {
    const info = catalog.resolveModelInfo(input);
    assert.ok(info, input);
    assert.equal(info.label, expected, input);
    assert.equal(info.apiModel, expected, input);
    assert.deepEqual(info.parameters, { model: expected }, input);
  });
});

test("catalog keeps authoritative unknown model slugs without trusting visible text", () => {
  assert.equal(catalog.isModelSlug("aurora-7"), false);
  assert.equal(catalog.isRequestModelSlug("aurora-7"), true);
  assert.equal(catalog.resolveModelInfo("aurora-7"), null);
  assert.equal(catalog.resolveRequestModelInfo("aurora-7").label, "aurora-7");
  assert.equal(catalog.resolveModelInfo('{"model":"aurora-7"}').label, "aurora-7");

  // Valid, explicitly supplied future model values are preserved rather than
  // being thrown away based on names that resemble known feature families.
  ["temperature-v2", "image-generation-v4", "deepsearch-v2"].forEach((value) => {
    assert.equal(catalog.isRequestModelSlug(value), true, value);
    assert.equal(catalog.isModelSlug(value), false, value);
  });

  // Generic structural or metadata fields are not model identities.
  ["model-v2", "conversation-2026", "request-v3"].forEach((value) => {
    assert.equal(catalog.isRequestModelSlug(value), false, value);
    assert.equal(catalog.resolveRequestModelInfo(value), null, value);
  });
});

test("runtime account catalog separates the public model from internal execution slugs", () => {
  const thinking = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "gpt-5-6-thinking");
  const pro = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "gpt-5-6-pro");
  const instant = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "gpt-5-6");

  assert.equal(thinking.publicModel, "GPT-5.6 Sol");
  assert.equal(thinking.requestModel, "gpt-5-6-thinking");
  assert.equal(thinking.baseModel, "gpt-5-6");
  assert.equal(thinking.mappingStatus, "mapped");
  assert.equal(thinking.source, "account-catalog:version-intelligence");

  assert.equal(pro.publicModel, "GPT-5.6 Sol");
  assert.equal(pro.requestModel, "gpt-5-6-pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.source, "account-catalog:version-intelligence");

  assert.equal(instant.publicModel, "GPT-5.6 Sol");
  assert.equal(instant.requestModel, "gpt-5-6");
  assert.equal(instant.source, "account-catalog:version-preset");
});

test("live version bindings prevent stale selector or fallback titles from moving Sol into Luna", () => {
  const pro = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "gpt-5-6-pro", {
    selectedPublicModel: "GPT-5.6 Luna"
  });
  const instant = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "gpt-5-6", {
    selectedPublicModel: "GPT-5.6 Sol"
  });

  assert.equal(pro.publicModel, "GPT-5.6 Sol");
  assert.equal(pro.source, "account-catalog:version-intelligence");
  assert.equal(instant.publicModel, "GPT-5.6 Sol");
  assert.equal(instant.source, "selector+account-catalog");
});

test("shared runtime slugs use the submit-time public model to select the matching version", () => {
  [sharedSlugRuntimeCatalog(), {
    ...sharedSlugRuntimeCatalog(),
    versions: sharedSlugRuntimeCatalog().versions.reverse()
  }].forEach((runtime) => {
    const info = catalog.resolveRuntimePublicModelInfo(runtime, "gpt-shared-7", {
      selectedPublicModel: "GPT Beta"
    });

    assert.equal(info.publicModel, "GPT Beta");
    assert.equal(info.requestModel, "gpt-shared-7");
    assert.equal(info.mappingStatus, "mapped");
    assert.equal(info.source, "selector+account-catalog");
  });
});

test("shared runtime slugs use the submit-time public mode when the public model is unavailable", () => {
  const info = catalog.resolveRuntimePublicModelInfo(sharedSlugRuntimeCatalog(), "gpt-shared-7", {
    selectedPublicMode: "pro",
    selectedPublicModeLabel: "Pro",
    selectedPublicModeSource: "selector-dom:model-control"
  });

  assert.equal(info.publicModel, "GPT Beta");
  assert.equal(info.mode, "pro");
  assert.equal(info.selectedPublicMode, "pro");
  assert.equal(info.mappingStatus, "mapped");
});

test("shared runtime slugs combine public model and public mode when either hint alone is not unique", () => {
  const runtime = sharedSlugRuntimeCatalog();
  runtime.versions.forEach((version) => {
    version.display_text_for_intelligence = "GPT Shared";
    version.short_display_text_for_intelligence = "Shared";
  });

  const info = catalog.resolveRuntimePublicModelInfo(runtime, "gpt-shared-7", {
    selectedPublicModel: "GPT Shared",
    selectedPublicMode: "pro"
  });

  assert.equal(info.publicModel, "GPT Shared");
  assert.equal(info.mode, "pro");
  assert.equal(info.mappingStatus, "mapped");
});

test("shared runtime slugs remain exact and unmapped when submit-time evidence cannot make the mapping unique", () => {
  const info = catalog.resolveRuntimePublicModelInfo(sharedSlugRuntimeCatalog(), "gpt-shared-7");

  assert.equal(info.publicModel, "gpt-shared-7");
  assert.equal(info.requestModel, "gpt-shared-7");
  assert.equal(info.baseModel, "gpt-shared-7");
  assert.equal(info.mappingStatus, "unmapped");
  assert.equal(info.source, "unmapped-request-slug");
});

test("shared runtime slugs do not guess from catalog order or the fallback model title", () => {
  const info = catalog.resolveRuntimePublicModelInfo(sharedSlugRuntimeCatalog(), "gpt-shared-7", {
    selectedPublicModel: "GPT Missing"
  });

  assert.equal(info.publicModel, "gpt-shared-7");
  assert.equal(info.mappingStatus, "unmapped");
  assert.equal(info.source, "unmapped-request-slug");
});

test("submit-time public mode remains separate from a different internal response mode", () => {
  const info = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "gpt-5-6-pro", {
    selectedPublicModel: "GPT-5.6 Sol",
    selectedPublicMode: "instant",
    selectedPublicModeLabel: "Instant",
    selectedPublicModeSource: "selector-dom:model-control"
  });

  assert.equal(info.mode, "pro");
  assert.equal(info.selectedPublicMode, "instant");
  assert.equal(info.selectedPublicModeLabel, "Instant");
  assert.equal(info.selectedPublicModeSource, "selector-dom:model-control");
});

test("accounts without an intelligence version still map the base slug to the account model title", () => {
  const freeCatalog = runtimeCatalog();
  freeCatalog.versions = freeCatalog.versions.filter((version) => version.id === "auto");
  const luna = catalog.resolveRuntimePublicModelInfo(freeCatalog, "gpt-5-6");

  assert.equal(luna.publicModel, "GPT-5.6 Luna");
  assert.equal(luna.source, "account-catalog:model-title");
});

test("runtime account catalog keeps unknown future request slugs exact and marked unmapped", () => {
  const info = catalog.resolveRuntimePublicModelInfo(runtimeCatalog(), "future-family-2027-thinking", {
    selectedPublicModel: "GPT-5.6 Sol"
  });

  assert.equal(info.publicModel, "future-family-2027-thinking");
  assert.equal(info.requestModel, "future-family-2027-thinking");
  assert.equal(info.mappingStatus, "unmapped");
  assert.equal(info.source, "unmapped-request-slug");
});

test("Auto is accepted only as an exact ChatGPT route and maps through the live account catalog", () => {
  assert.equal(catalog.resolveModelInfo("Auto"), null);
  assert.equal(catalog.resolveRequestModelInfo("auto"), null);
  assert.equal(catalog.isChatGPTRouteSlug("auto"), true);

  const sanitized = catalog.sanitizeRuntimeModelCatalog(runtimeCatalog());
  assert.equal(sanitized.models.find((model) => model.slug === "auto").title, "Auto");
  assert.equal(sanitized.versions.find((version) => version.id === "auto").slugs[0], "auto");
  assert.equal(sanitized.categories.find((category) => category.defaultModel === "auto").humanCategoryName, "Auto");

  const info = catalog.resolveRuntimePublicModelInfo(sanitized, "auto");
  assert.equal(info.publicModel, "Auto");
  assert.equal(info.requestModel, "auto");
  assert.equal(info.mappingStatus, "mapped");
  assert.equal(info.source, "account-catalog:model-title");
});


test("numeric-only catalog titles never merge distinct GPT route model identities", () => {
  const runtime = {
    observedAt: "2026-11-13T01:00:00.000Z",
    models: [{ slug: "gpt-6", title: "6" }],
    versions: [],
    categories: []
  };
  for (const slug of ["gpt-6", "gpt-6-thinking", "gpt-6-pro"]) {
    const info = catalog.resolveRuntimePublicModelInfo(runtime, slug, {
      selectedPublicModel: "6"
    });
    assert.equal(info.publicModel, slug);
    assert.equal(info.requestModel, slug);
    assert.equal(info.mappingStatus, "unmapped");
    assert.equal(info.source, "unmapped-request-slug");
  }
});

test("specific version display names still outrank generic numeric base titles", () => {
  const runtime = runtimeCatalog();
  runtime.models.push({ slug: "gpt-6", title: "6" });
  runtime.versions.push({
    id: "gpt-6-version",
    slug: "gpt-6",
    displayTextForIntelligence: "GPT-6 Thinking",
    intelligencePresets: [{ modelSlug: "gpt-6-thinking", title: "Thinking" }]
  });
  const info = catalog.resolveRuntimePublicModelInfo(runtime, "gpt-6-thinking");
  assert.equal(info.publicModel, "GPT-6 Thinking");
});
