const assert = require("node:assert/strict");
const test = require("node:test");
const detector = require("../src/detector");
const catalog = require("../src/model-catalog");
const background = require("../src/background");
const dashboard = require("../src/dashboard");
const pageModelHook = require("../src/page-model-hook");

const ALL_FEATURE_IDS = ["agent_mode", "audio", "canvas", "deep_research", "image_generation", "realtime", "web_search"];

test("background normalizes aliases for all seven feature IDs on the real request model", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "future-family-2026-thinking",
      apiModel: "ignored-visible-label",
      chatgptModel: "ignored-visible-label",
      modelObservedSource: "fetch-request:model",
      modelParameters: {
        model: "future-family-2026-thinking",
        features: [
          "agentmode-v2",
          "deepsearch-v2",
          "gpt-image",
          "web-search-v2",
          "real_time_mode",
          "audiomode-v2",
          "voicemode-v2",
          "input_audio",
          "output_audio",
          "tts",
          "whisper",
          "canvas-v2"
        ]
      },
      usageFeatures: ["agent mode", "deep search", "dall-e", "search", "realtime", "voice mode", "canvas"],
      submittedAt: now.toISOString(),
      promptHash: "all-features",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.equal(next.totals.web_search, undefined);
  assert.equal(next.totals.deep_research, undefined);
  assert.equal(next.totals.canvas, undefined);
  assert.deepEqual(next.events[0].usageFeatures, ALL_FEATURE_IDS);
  assert.deepEqual(Object.keys(next.featuresByModel["future-family-2026-thinking"].features).sort(), ALL_FEATURE_IDS);
  ALL_FEATURE_IDS.forEach((id) => {
    assert.equal(next.featuresByModel["future-family-2026-thinking"].features[id].count, 1, id);
  });
});

test("background does not count disabled or excluded feature signals", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");
  const observed = background.observeNetworkRequest(
    {
      tabId: 9,
      method: "POST",
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody: {
        raw: [
          {
            bytes: Buffer.from(JSON.stringify({
              model: "future-family-2026-thinking",
              features: [
                { type: "web_search", enabled: false },
                { type: "deep_research", disabled: true },
                { type: "image_generation", excluded: true }
              ],
              tools: [
                { type: "canvas", enabled: false },
                { type: "audio", disabled: true },
                { type: "realtime", excluded: true },
                { type: "agent_mode" }
              ],
              web_search: false,
              image_generation: "off",
              canvas: "disabled",
              realtime: 0,
              voice: "none"
            }))
          }
        ]
      }
    },
    now
  );

  assert.ok(observed);
  assert.deepEqual(observed.usageFeatures, ["agent_mode"]);
});

test("versioned feature names never become future model slugs", () => {
  [
    "file-upload-v2",
    "code-interpreter-v2",
    "connectors-v2",
    "gpts-v2",
    "tasks-v2"
  ].forEach((value) => {
    assert.equal(catalog.isRequestModelSlug(value), false, value);
    assert.equal(pageModelHook.isModelSlug(value), false, value);
    assert.equal(detector.resolveModelInfo(value), null, value);
  });

  assert.equal(catalog.isRequestModelSlug("aurora-7"), true);
  assert.equal(pageModelHook.isModelSlug("aurora-7"), true);
});

test("dashboard feature rows hide zero-count entries and label canonical features", () => {
  const model = "future-family-2026-thinking";
  const first = new Date("2026-08-23T12:00:00.000Z");
  let stats = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "feature-row-1",
      requestModel: model,
      apiModel: model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      usageFeatures: ["deep_research"],
      submittedAt: first.toISOString(),
      pageUrl: "https://chatgpt.com/c/feature-row"
    },
    first
  );
  stats = background.applyIncrement(
    stats,
    {
      submissionId: "feature-row-2",
      requestModel: model,
      apiModel: model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      usageFeatures: ["deep_research"],
      submittedAt: new Date(first.getTime() + 1000).toISOString(),
      pageUrl: "https://chatgpt.com/c/feature-row"
    },
    new Date(first.getTime() + 1000)
  );
  stats.featuresByModel[model].features.web_search = {
    id: "web_search",
    count: 0
  };

  const html = dashboard.renderModelTextList(stats, { language: "en", startDate: "", endDate: "" });
  assert.match(html, /Deep Research/);
  assert.doesNotMatch(html, /Web search/);
  assert.doesNotMatch(html, />0 times</);
});

test("all-time feature counts do not disappear from text rows outside the default chart window", () => {
  const model = "future-family-2026-thinking";
  const older = new Date("2025-01-02T10:00:00.000Z");
  const newer = new Date("2025-03-11T10:00:00.000Z");
  let stats = background.createEmptyStats();
  [older, new Date(older.getTime() + 3000), newer].forEach((at, index) => {
    stats = background.applyIncrement(stats, {
      submissionId: `all-time-feature-${index}`,
      requestModel: model,
      apiModel: model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      usageFeatures: [index === 2 ? "web_search" : "deep_research"],
      submittedAt: at.toISOString(),
      pageUrl: "https://chatgpt.com/c/all-time-feature"
    }, at);
  });

  const allTime = dashboard.renderModelTextList(stats, { language: "en", startDate: "", endDate: "" });
  assert.match(allTime, /3 times/);
  assert.match(allTime, /Deep Research <b>2<\/b>/);
  assert.match(allTime, /Web search <b>1<\/b>/);

  const filtered = dashboard.renderModelTextList(stats, {
    language: "en", startDate: "2025-03-11", endDate: "2025-03-11"
  });
  assert.match(filtered, /1 times/);
  assert.match(filtered, /Web search <b>1<\/b>/);
  assert.doesNotMatch(filtered, /Deep Research/);

  // Older retained-event details can be incomplete even when the aggregate is known.
  const aggregateOnly = Object.assign({}, stats, { events: [], eventHistoryComplete: false, analyticsByDate: {} });
  const restored = dashboard.renderModelTextList(aggregateOnly, { language: "en", startDate: "", endDate: "" });
  assert.match(restored, /Deep Research <b>2<\/b>/);
});

test("bare GPT request slugs are counted exactly without an invented instant suffix", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");
  // The current request body is authoritative. A bare slug remains bare unless
  // the request itself supplies an explicit mode suffix.
  const stats = background.applyIncrement(background.createEmptyStats(), {
    model: "gpt-5-5", chatgptModel: "gpt-5-5", apiModel: "gpt-5-5",
    modelObservedSource: "webRequest", submittedAt: now.toISOString(),
    promptHash: "instant-real", promptLength: 8, modelParameters: { model: "gpt-5-5" }
  }, now);
  assert.equal(stats.totals["gpt-5-5"], 1);
  assert.equal(stats.totals["gpt-5-5-instant"], undefined);
  // 另一条次版本同理
  const stats2 = background.applyIncrement(background.createEmptyStats(), {
    model: "gpt-5-3", modelObservedSource: "webRequest", submittedAt: now.toISOString(),
    promptHash: "i2", promptLength: 8, modelParameters: { model: "gpt-5-3" }
  }, now);
  assert.equal(stats2.totals["gpt-5-3"], 1);
});

test("legacy invented instant labels migrate to their exact bare request slug", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const stats = background.createEmptyStats();
  stats.totals["gpt-5-5-instant"] = 6;
  stats.byDate["2026-06-26"] = { "gpt-5-5-instant": 6 };
  stats.models["gpt-5-5-instant"] = {
    label: "gpt-5-5-instant",
    apiModel: "gpt-5-5",
    chatgptModel: "gpt-5-5",
    mode: "instant",
    parameters: { model: "gpt-5-5" }
  };

  const migrated = background.applyIncrement(stats, {
    model: "gpt-5-5",
    apiModel: "gpt-5-5",
    chatgptModel: "gpt-5-5",
    modelObservedSource: "webRequest",
    submittedAt: now.toISOString(),
    promptHash: "migration-check",
    promptLength: 8,
    modelParameters: { model: "gpt-5-5" }
  }, now);

  assert.equal(migrated.totals["gpt-5-5"], 7);
  assert.equal(migrated.totals["gpt-5-5-instant"], undefined);
  assert.deepEqual(migrated.byDate["2026-06-26"], { "gpt-5-5": 6 });
});

test("dashboard keeps instant records whose apiModel is the bare gpt-5-x slug (not dropped by sanitize)", () => {
  // 兼容旧版本已经保存的 instant 记录；升级清理不能让历史统计归零。
  const stats = background.createEmptyStats();
  stats.totals["gpt-5-5-instant"] = 6;
  stats.byDate["2026-06-26"] = { "gpt-5-5-instant": 6 };
  stats.models["gpt-5-5-instant"] = { label: "gpt-5-5-instant", apiModel: "gpt-5-5", chatgptModel: "gpt-5-5", mode: "instant", parameters: { model: "gpt-5-5" } };
  const html = dashboard.renderModelTextList(stats, { language: "zh", startDate: "2026-06-26", endDate: "2026-06-26" });
  assert.match(html, /gpt-5-5-instant/);
  assert.match(html, /gpt-5-5-instant[\s\S]*<b>6 次<\/b>/);
  assert.doesNotMatch(html, /范围内|全部|今日/);
  assert.doesNotMatch(html, /暂无模型记录/);
  // 趋势图也应取到 6,而不是 0
  const series = dashboard.chartSeries(stats, ["gpt-5-5-instant"], "2026-06-26", "2026-06-26");
  assert.deepEqual(series.series[0].values, [6]);
});

test("public dotted GPT labels and exact request slugs both remain valid", () => {
  assert.equal(catalog.resolveModelInfo("GPT-5.5 Thinking").label, "gpt-5.5-thinking");
  assert.equal(catalog.resolveModelInfo("gpt-5-5-thinking").label, "gpt-5-5-thinking");
  assert.equal(catalog.resolveModelInfo("gpt_5_5_thinking").label, "gpt-5-5-thinking");
  assert.equal(catalog.resolveModelInfo("gptLastUsedModel"), null);
  assert.equal(detector.resolveModelInfo("GPT-5.5 Thinking").label, "gpt-5.5-thinking");
  assert.equal(detector.extractModelLabel("Current model GPT-5.5 Thinking"), "gpt-5.5-thinking");
});

test("future O-series labels become valid model identities and are counted", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const info = detector.resolveModelInfo("o5 hyper");
  const stats = background.applyIncrement(background.createEmptyStats(), {
    model: info.label,
    apiModel: info.apiModel,
    modelObservedSource: "fetch-request:model",
    modelParameters: info.parameters,
    submittedAt: now.toISOString(),
    promptHash: "future-o-series",
    promptLength: 12
  }, now);

  assert.equal(info.label, "o5-hyper");
  assert.equal(stats.totals["o5-hyper"], 1);
  assert.equal(stats.models["o5-hyper"].parameters.model, "o5-hyper");
});

const featurePayload = (model, hash, extra) => Object.assign({
  model,
  modelObservedSource: "fetch-request:model",
  source: "send-button",
  submittedAt: "2026-06-04T12:00:00.000Z",
  promptHash: hash,
  promptLength: 10,
  modelParameters: { model }
}, extra || {});

test("deep research / agent mode picker selections are counted (not dropped) and survive cleanup", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");
  let stats = background.createEmptyStats();
  stats = background.applyIncrement(stats, featurePayload("research", "r1"), now);
  stats = background.applyIncrement(stats, featurePayload("agent-mode", "a1"), now);
  // 触发对历史聚合的清理,确认这两个伪模型不被误删
  stats = background.applyIncrement(stats, featurePayload("gpt-5-5-thinking", "g1"), now);
  stats = background.applyIncrement(stats, featurePayload("agent-mode", "a2"), now);

  assert.equal(stats.totals["Deep research"], 1);
  assert.equal(stats.totals["Agent mode"], 2);
  assert.equal(stats.totals["gpt-5-5-thinking"], 1);
  assert.equal(stats.featuresByModel["Deep research"].features.deep_research.count, 1);
  assert.equal(stats.featuresByModel["Agent mode"].features.agent_mode.count, 2);

  // 内部图像编辑工件仍应被丢弃,不污染模型统计
  const dropped = background.applyIncrement(background.createEmptyStats(), featurePayload("image-2-image", "i1"), now);
  assert.deepEqual(dropped.totals, {});
});

test("new usage features (file upload / code interpreter / GPTs / tasks) are tracked with display names", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    featurePayload("gpt-5-5-thinking", "feat", { usageFeatures: ["file_upload", "code_interpreter", "gpts", "tasks"] }),
    now
  );
  const features = next.featuresByModel["gpt-5-5-thinking"].features;
  assert.equal(features.file_upload.name, "File upload");
  assert.equal(features.code_interpreter.name, "Code interpreter");
  assert.equal(features.gpts.name, "GPTs");
  assert.equal(features.tasks.name, "Tasks");
  assert.equal(next.featuresByModel["gpt-5-5-thinking"].total, 4);
});

test("detects the REAL ChatGPT composer feature signals (force_use_search / system_hints)", () => {
  const parse = (obj) => background.parseNetworkRequestBody({ raw: [{ bytes: Buffer.from(JSON.stringify(obj), "utf8") }] }).__usageFeatures;
  // 网页搜索:实测请求体 force_use_search:true + client_reported_search_source
  assert.ok(parse({ model: "gpt-5-5-thinking", force_use_search: true, client_reported_search_source: "conversation_composer_web_icon" }).includes("web_search"));
  // 深度研究:system_hints:["connector:connector_openai_deep_research"]
  assert.ok(parse({ model: "gpt-5-5-thinking", system_hints: ["connector:connector_openai_deep_research"] }).includes("deep_research"));
  // 代理模式:system_hints:["agent"]
  assert.ok(parse({ model: "gpt-5-5-thinking", system_hints: ["agent"] }).includes("agent_mode"));
  // 网页搜索:system_hints:["search"]
  assert.ok(parse({ model: "gpt-5-5-thinking", system_hints: ["search"] }).includes("web_search"));
  // 普通提问不应误报功能
  assert.deepEqual(parse({ model: "gpt-5-5-thinking", system_hints: [] }), []);
});

test("reasoning effort is tracked as a per-model parameter dimension", () => {
  const now = new Date("2026-06-04T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    featurePayload("gpt-5-5-thinking", "effort", { modelParameters: { model: "gpt-5-5-thinking", "reasoning.effort": "high" } }),
    now
  );
  assert.deepEqual(next.parametersByModel["gpt-5-5-thinking"].fields["reasoning.effort"], { high: 1 });
});
