const assert = require("node:assert/strict");
const test = require("node:test");
const catalog = require("../src/model-catalog");

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

test("catalog accepts unknown versioned slugs only with explicit model-field evidence", () => {
  assert.equal(catalog.isModelSlug("aurora-7"), false);
  assert.equal(catalog.isRequestModelSlug("aurora-7"), true);
  assert.equal(catalog.resolveModelInfo("aurora-7"), null);
  assert.equal(catalog.resolveRequestModelInfo("aurora-7").label, "aurora-7");
  assert.equal(catalog.resolveModelInfo('{"model":"aurora-7"}').label, "aurora-7");

  [
    "model-v2",
    "temperature-v2",
    "conversation-2026",
    "request-v3",
    "image-generation-v4",
    "deepsearch-v2"
  ].forEach((value) => {
    assert.equal(catalog.isRequestModelSlug(value), false, value);
    assert.equal(catalog.resolveRequestModelInfo(value), null, value);
  });
});
