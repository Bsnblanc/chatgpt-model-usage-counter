const assert = require("node:assert/strict");
const test = require("node:test");
const detector = require("../src/detector");
const catalog = require("../src/model-catalog");
const background = require("../src/background");
const dashboard = require("../src/dashboard");

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
      url: "https://chatgpt.com/local-model-probe",
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

test("dashboard feature rows hide zero-count entries and label canonical features", () => {
  const stats = background.createEmptyStats();
  stats.totals["future-family-2026-thinking"] = 2;
  stats.byDate["2026-06-04"] = { "future-family-2026-thinking": 2 };
  stats.models["future-family-2026-thinking"] = {
    label: "future-family-2026-thinking",
    apiModel: "future-family-2026-thinking",
    chatgptModel: "future-family-2026-thinking",
    parameters: { model: "future-family-2026-thinking" }
  };
  stats.featuresByModel["future-family-2026-thinking"] = {
    total: 2,
    features: {
      web_search: { id: "web_search", count: 0 },
      deep_research: { id: "deep_research", count: 2, lastSubmittedAt: "2026-06-04T12:00:00.000Z" }
    }
  };

  const html = dashboard.renderModelTextList(stats, { language: "en", startDate: "", endDate: "" });
  assert.match(html, /Deep Research/);
  assert.doesNotMatch(html, /Web search/);
  assert.doesNotMatch(html, />0 times</);
});

test("instant model (bare gpt-5-x) is counted under the -instant label, not the bare slug", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");
  // 真机实测:选 Instant 模型后,请求体只给裸 slug gpt-5-5(无 thinking 后缀)。
  // 必须存成 gpt-5-5-instant,否则 instant 用量被错记成裸 gpt-5-5。
  const stats = background.applyIncrement(background.createEmptyStats(), {
    model: "gpt-5-5", chatgptModel: "gpt-5-5", apiModel: "gpt-5-5",
    modelObservedSource: "webRequest", submittedAt: now.toISOString(),
    promptHash: "instant-real", promptLength: 8, modelParameters: { model: "gpt-5-5" }
  }, now);
  assert.equal(stats.totals["gpt-5-5-instant"], 1);
  assert.equal(stats.totals["gpt-5-5"], undefined);
  // 另一条次版本同理
  const stats2 = background.applyIncrement(background.createEmptyStats(), {
    model: "gpt-5-3", modelObservedSource: "webRequest", submittedAt: now.toISOString(),
    promptHash: "i2", promptLength: 8, modelParameters: { model: "gpt-5-3" }
  }, now);
  assert.equal(stats2.totals["gpt-5-3-instant"], 1);
});

test("dashboard keeps instant records whose apiModel is the bare gpt-5-x slug (not dropped by sanitize)", () => {
  // 真机实测的 instant 记录:键是 gpt-5-5-instant,但 apiModel/chatgptModel 是裸 gpt-5-5。
  // 裸 gpt-5-5 会被归一成 "gpt-5.5" 命中视觉标签否决规则;若据此丢弃整条记录,面板会显示 0。
  const stats = background.createEmptyStats();
  stats.totals["gpt-5-5-instant"] = 6;
  stats.byDate["2026-06-26"] = { "gpt-5-5-instant": 6 };
  stats.models["gpt-5-5-instant"] = { label: "gpt-5-5-instant", apiModel: "gpt-5-5", chatgptModel: "gpt-5-5", mode: "instant", parameters: { model: "gpt-5-5" } };
  const html = dashboard.renderModelTextList(stats, { language: "zh", startDate: "2026-06-26", endDate: "2026-06-26" });
  assert.match(html, /gpt-5-5-instant/);
  assert.match(html, /范围内 6/);
  assert.doesNotMatch(html, /暂无模型记录/);
  // 趋势图也应取到 6,而不是 0
  const series = dashboard.chartSeries(stats, ["gpt-5-5-instant"], "2026-06-26", "2026-06-26");
  assert.deepEqual(series.series[0].values, [6]);
});

test("GPT-5.5 visible labels are rejected while exact ChatGPT thinking slugs stay valid", () => {
  assert.equal(catalog.resolveModelInfo("GPT-5.5 Thinking"), null);
  assert.equal(catalog.resolveModelInfo("gpt-5-5-thinking").label, "gpt-5-5-thinking");
  assert.equal(catalog.resolveModelInfo("gpt_5_5_thinking").label, "gpt-5-5-thinking");
  assert.equal(catalog.resolveModelInfo("gptLastUsedModel"), null);
  assert.equal(detector.resolveModelInfo("GPT-5.5 Thinking"), null);
  assert.equal(detector.extractModelLabel("Current model GPT-5.5 Thinking"), "");
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
