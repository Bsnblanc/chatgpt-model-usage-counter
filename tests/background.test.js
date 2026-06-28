const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const background = require("../src/background");

const SUPPORTED_USAGE_FEATURES = ["agent_mode", "audio", "canvas", "deep_research", "image_generation", "realtime", "web_search"];
const SUPPORTED_USAGE_FEATURE_NAMES = {
  agent_mode: "Agent mode",
  audio: "Audio",
  canvas: "Canvas",
  deep_research: "Deep research",
  image_generation: "Image generation",
  realtime: "Realtime",
  web_search: "Web search"
};

test("computeBadgeCount shows only the selected date range, not the all-time total", () => {
  // 用户:角标不要显示全部总数,只显示面板所选日期范围内的次数。
  const stats = {
    total: 999,
    byDate: {
      "2026-06-02": { "gpt-5-thinking": 7, "o3": 1 },
      "2026-06-03": { "gpt-5-thinking": 27, "o3": 3 },
      "2026-06-27": { "gpt-5-thinking": 50 }
    }
  };
  // 选 06-02~06-03:7+1+27+3 = 38(不含范围外 06-27 的 50)
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-02", endDate: "2026-06-03" }), 38);
  // 叠加模型过滤:只 gpt-5-thinking = 7+27 = 34
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-02", endDate: "2026-06-03", models: ["gpt-5-thinking"] }), 34);
  // 只选范围外那天:50
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-27", endDate: "2026-06-27" }), 50);
  // 颠倒起止也能算(自动交换)
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-03", endDate: "2026-06-02" }), 38);
  // 空过滤器视为无过滤
  assert.equal(background.sanitizeBadgeFilter({ startDate: "", endDate: "", models: [] }), null);
});

test("OpenAI status refresh forces a fresh fetch instead of serving a stale failed cache", () => {
  // 用户:ChatGPT 网页状态点刷新也获取不到、刷新按钮没用。根因是上次抓取失败(ok:false)被缓存后,
  // 之后每次 openai.status.get 都直接返回旧的失败缓存,且刷新没带 cached:false。
  const bg = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  const dash = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");
  // 后台:只有成功且有内容的缓存才直接返回,否则强制重新抓取
  assert.match(bg, /hasGoodCache\s*=\s*statusRecord\s*&&\s*statusRecord\.ok\s*&&\s*statusRecord\.status/);
  assert.match(bg, /if\s*\(hasGoodCache\s*&&\s*message\.cached\s*!==\s*false\)/);
  // 面板:刷新(force=true)时带 cached:false,真正走网络重新抓取
  assert.match(dash, /"openai\.status\.get",\s*cached:\s*force\s*\?\s*false\s*:\s*true/);
  assert.match(dash, /loadOpenAIStatus\(state,\s*force\)/);
});

test("applyIncrement updates totals, daily stats, events, and total count", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "gpt-5-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "gpt-5-thinking" },
      source: "send-button",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/123",
      pageTitle: "Conversation title",
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["gpt-5-thinking"], 1);
  assert.equal(next.byDate["2026-05-23"]["gpt-5-thinking"], 1);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].model, "gpt-5-thinking");
  assert.equal(next.events[0].apiModel, "gpt-5-thinking");
  assert.equal(next.events[0].chatgptModel, "gpt-5-thinking");
  assert.equal(next.events[0].modelParameters.model, "gpt-5-thinking");
  assert.equal(next.events[0].conversationId, "123");
  assert.equal(next.events[0].pageTitle, "Conversation title");
  assert.equal(next.models["gpt-5-thinking"].apiModel, "gpt-5-thinking");
  assert.equal(next.sessionsByModel["gpt-5-thinking"]["123"].count, 1);
  assert.equal(next.sessionsByModel["gpt-5-thinking"]["123"].title, "Conversation title");
  assert.equal(background.totalCount(next), 1);
});

test("applyIncrement dedupes racing observations for the same submitted prompt", () => {
  const stats = background.createEmptyStats();
  const firstSubmittedAt = new Date("2026-05-23T12:00:00.000Z");
  const secondSubmittedAt = new Date("2026-05-23T12:00:00.001Z");
  const first = background.applyIncrement(
    stats,
    {
      model: "future-family-2026-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      source: "send-button",
      submittedAt: firstSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/duplicate-race",
      pageTitle: "Duplicate race",
      promptHash: "same-prompt",
      promptLength: 19
    },
    firstSubmittedAt
  );
  const next = background.applyIncrement(
    first,
    {
      model: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      source: "send-button",
      submittedAt: secondSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/duplicate-race",
      pageTitle: "Duplicate race",
      promptHash: "same-prompt",
      promptLength: 19
    },
    secondSubmittedAt
  );

  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.equal(next.byDate["2026-05-23"]["future-family-2026-thinking"], 1);
  assert.equal(next.sessionsByModel["future-family-2026-thinking"]["duplicate-race"].count, 1);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].modelObservedSource, "webRequest");
});

test("applyIncrement dedupes root ChatGPT submissions observed by webRequest then fetch-request", () => {
  const stats = background.createEmptyStats();
  const firstSubmittedAt = new Date("2026-06-01T12:00:00.000Z");
  const secondSubmittedAt = new Date("2026-06-01T12:00:00.001Z");
  const promptHash = "e78b1273";
  const model = "gpt-5-thinking";
  const first = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      source: "send-button",
      submittedAt: firstSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/",
      pageTitle: "ChatGPT",
      promptHash,
      promptLength: 55
    },
    firstSubmittedAt
  );
  const next = background.applyIncrement(
    first,
    {
      model,
      modelObservedSource: "fetch-request",
      modelParameters: { model },
      source: "send-button",
      submittedAt: secondSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/",
      pageTitle: "ChatGPT",
      promptHash,
      promptLength: 55
    },
    secondSubmittedAt
  );

  assert.equal(background.totalCount(next), 1);
  assert.equal(next.totals[model], 1);
  assert.equal(next.byDate["2026-06-01"][model], 1);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].conversationId, "");
  assert.equal(next.events[0].pageUrl, "https://chatgpt.com/");
  assert.equal(next.events[0].promptHash, promptHash);
  assert.equal(next.events[0].modelObservedSource, "webRequest");
  assert.equal(next.events[0].source, "send-button");
});

test("applyIncrement preserves known separate conversations and repeated prompts outside dedupe window", () => {
  let stats = background.createEmptyStats();
  const model = "gpt-5-thinking";
  const promptHash = "repeatable-prompt";
  const firstSubmittedAt = new Date("2026-06-01T12:00:00.000Z");
  const secondSubmittedAt = new Date("2026-06-01T12:00:00.001Z");
  const laterSubmittedAt = new Date("2026-06-01T12:00:03.000Z");

  stats = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      source: "send-button",
      submittedAt: firstSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/known-first",
      promptHash,
      promptLength: 17
    },
    firstSubmittedAt
  );
  stats = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "fetch-request",
      modelParameters: { model },
      source: "send-button",
      submittedAt: secondSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/known-second",
      promptHash,
      promptLength: 17
    },
    secondSubmittedAt
  );
  stats = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "fetch-request",
      modelParameters: { model },
      source: "send-button",
      submittedAt: laterSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/known-first",
      promptHash,
      promptLength: 17
    },
    laterSubmittedAt
  );

  assert.equal(background.totalCount(stats), 3);
  assert.equal(stats.totals[model], 3);
  assert.equal(stats.sessionsByModel[model]["known-first"].count, 2);
  assert.equal(stats.sessionsByModel[model]["known-second"].count, 1);
});

test("applyIncrement refuses unresolved model records", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "",
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(background.totalCount(next), 0);
  assert.equal(next.events.length, 0);
});

test("applyIncrement refuses unknown and ambiguous GPT family records", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const invalidModels = [
    "Unknown model",
    "unknown",
    "Unknown",
    "unknown_model",
    "unknown-model",
    "Unresolved model",
    "gptLastUsedModel",
    "gptlastusedmodel",
    "agentmode",
    "agentmode-v2",
    "agent-mode-v2",
    "deep-research",
    "deep_research",
    "deepresearch",
    "deepresearch-v2",
    "deepsearch",
    "deepsearch-v2",
    "image-generation",
    "image_generation",
    "imagegeneration",
    "imagegeneration-v2",
    "image-generation-v2",
    "web-search",
    "web_search",
    "websearch",
    "websearch-v2",
    "web-search-v2",
    "realtime",
    "realtime-v2",
    "real-time-v2",
    "real_time",
    "audio",
    "audio-v2",
    "canvas",
    "canvas-v2",
    "voice-v2"
  ];

  invalidModels.forEach((model) => {
    const next = background.applyIncrement(
      background.createEmptyStats(),
      {
        model,
        apiModel: model,
        chatgptModel: model,
        modelObservedSource: "fetch-request",
        modelParameters: { model },
        submittedAt: now.toISOString(),
        promptHash: "abc123",
        promptLength: 42
      },
      now
    );

    assert.equal(background.totalCount(next), 0, model);
    assert.equal(next.events.length, 0, model);
  });
});

test("applyIncrement removes stored invalid ChatGPT family model keys from every aggregate", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "GPT-5.5": 31,
      "future-family-2026-thinking": 1
    },
    byDate: {
      "2026-05-23": {
        "GPT-5.5": 31,
        "future-family-2026-thinking": 1
      }
    },
    models: {
      "GPT-5.5": {
        label: "GPT-5.5",
        apiModel: "GPT-5.5",
        chatgptModel: "GPT-5.5",
        parameters: { model: "GPT-5.5" }
      },
      "future-family-2026-thinking": {
        label: "future-family-2026-thinking",
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        parameters: { model: "future-family-2026-thinking" }
      }
    },
    sessionsByModel: {
      "GPT-5.5": {
        dirty: {
          conversationId: "dirty",
          title: "Dirty model",
          count: 31,
          models: { "GPT-5.5": 31 },
          lastSubmittedAt: "2026-05-23T10:00:00.000Z"
        }
      },
      "future-family-2026-thinking": {
        clean: {
          conversationId: "clean",
          title: "Clean model",
          count: 1,
          models: { "future-family-2026-thinking": 1 },
          lastSubmittedAt: "2026-05-23T10:05:00.000Z"
        }
      }
    },
    parametersByModel: {
      "GPT-5.5": {
        total: 31,
        combinations: {
          dirty: {
            count: 31,
            parameters: { model: "GPT-5.5", "reasoning.effort": "high" }
          }
        },
        fields: { model: { "GPT-5.5": 31 } }
      }
    },
    variantsByModel: {
      "GPT-5.5": {
        total: 31,
        variants: {
          "GPT-5.5": { name: "GPT-5.5", count: 31 }
        }
      }
    },
    featuresByModel: {
      "GPT-5.5": {
        total: 31,
        features: { agent_mode: { id: "agent_mode", count: 31 } }
      }
    },
    events: [
      {
        model: "GPT-5.5",
        apiModel: "GPT-5.5",
        chatgptModel: "GPT-5.5",
        modelParameters: { model: "GPT-5.5" }
      }
    ]
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "future-family-2026-thinking" },
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["GPT-5.5"], undefined);
  assert.equal(next.byDate["2026-05-23"]["GPT-5.5"], undefined);
  assert.equal(next.models["GPT-5.5"], undefined);
  assert.equal(next.sessionsByModel["GPT-5.5"], undefined);
  assert.equal(next.parametersByModel["GPT-5.5"], undefined);
  assert.equal(next.variantsByModel["GPT-5.5"], undefined);
  assert.equal(next.featuresByModel["GPT-5.5"], undefined);
  assert.equal(next.events.some((event) => event.model === "GPT-5.5"), false);
  assert.equal(next.totals["future-family-2026-thinking"], 2);
});

test("applyIncrement does not remap invalid historical keys through valid metadata", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const invalidModels = ["GPT-5.5", "gpt-5.5", "Unknown model", "gptLastUsedModel"];
  const existingStats = background.createEmptyStats();
  invalidModels.forEach((model, index) => {
    existingStats.totals[model] = index + 1;
    existingStats.byDate["2026-05-22"] = existingStats.byDate["2026-05-22"] || {};
    existingStats.byDate["2026-05-22"][model] = index + 1;
    existingStats.models[model] = {
      label: model,
      apiModel: "gpt-5-thinking",
      chatgptModel: model,
      parameters: { model: "gpt-5-thinking" }
    };
    existingStats.sessionsByModel[model] = {
      dirty: {
        conversationId: "dirty",
        title: "Dirty",
        count: index + 1,
        models: { [model]: index + 1, "gpt-5-thinking": index + 1 }
      }
    };
    existingStats.parametersByModel[model] = {
      total: index + 1,
      combinations: {
        dirty: { count: index + 1, parameters: { model: "gpt-5-thinking", "reasoning.effort": "high" } }
      },
      fields: { "reasoning.effort": { high: index + 1 } }
    };
    existingStats.variantsByModel[model] = {
      total: index + 1,
      variants: {
        "gpt-5-thinking": { name: "gpt-5-thinking", count: index + 1, apiModel: "gpt-5-thinking" }
      }
    };
    existingStats.featuresByModel[model] = {
      total: index + 1,
      features: { deep_research: { id: "deep_research", count: index + 1 } }
    };
    existingStats.events.push({
      model,
      apiModel: "gpt-5-thinking",
      chatgptModel: model,
      modelParameters: { model: "gpt-5-thinking" },
      submittedAt: "2026-05-22T12:00:00.000Z"
    });
  });

  const next = background.applyIncrement(
    existingStats,
    {
      model: "gpt-5-thinking",
      apiModel: "gpt-5-thinking",
      chatgptModel: "gpt-5-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "gpt-5-thinking", "reasoning.effort": "high" },
      submittedAt: now.toISOString(),
      promptHash: "clean",
      promptLength: 12
    },
    now
  );

  invalidModels.forEach((model) => {
    assert.equal(next.totals[model], undefined, model);
    assert.equal(next.models[model], undefined, model);
    assert.equal(next.parametersByModel[model], undefined, model);
    assert.equal(next.variantsByModel[model], undefined, model);
    assert.equal(next.featuresByModel[model], undefined, model);
    assert.equal(next.sessionsByModel[model], undefined, model);
    assert.equal(next.events.some((event) => event.model === model), false, model);
    assert.equal(JSON.stringify(next).includes(model), false, model);
  });
  assert.equal(next.totals["gpt-5-thinking"], 1);
  assert.equal(next.totals.thinking, undefined);
  assert.equal(next.events[0].model, "gpt-5-thinking");
  assert.equal(next.events[0].modelParameters.model, "gpt-5-thinking");
});

test("applyIncrement removes feature-only model keys from stored aggregates", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "agent-mode": 3,
      deep_research: 2,
      "canvas-v2": 4,
      "future-family-2026-thinking": 1
    },
    byDate: {
      "2026-05-23": {
        "agent-mode": 3,
        deep_research: 2,
        "canvas-v2": 4,
        "future-family-2026-thinking": 1
      }
    },
    models: {
      "agent-mode": {
        label: "agent-mode",
        chatgptModel: "agent-mode",
        parameters: { model: "agent-mode" }
      },
      deep_research: {
        label: "deep_research",
        chatgptModel: "deep_research",
        parameters: { model: "deep_research" }
      },
      "canvas-v2": {
        label: "canvas-v2",
        chatgptModel: "canvas-v2",
        parameters: { model: "canvas-v2" }
      },
      "future-family-2026-thinking": {
        label: "future-family-2026-thinking",
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        parameters: { model: "future-family-2026-thinking" }
      }
    },
    sessionsByModel: {
      "agent-mode": {
        legacy: {
          conversationId: "legacy",
          title: "Legacy",
          count: 3,
          models: { "agent-mode": 3 },
          firstSubmittedAt: "2026-05-23T10:00:00.000Z",
          lastSubmittedAt: "2026-05-23T10:00:00.000Z"
        }
      },
      "canvas-v2": {
        canvas: {
          conversationId: "canvas",
          title: "Canvas",
          count: 4,
          models: { "canvas-v2": 4 },
          firstSubmittedAt: "2026-05-23T10:03:00.000Z",
          lastSubmittedAt: "2026-05-23T10:03:00.000Z"
        }
      },
      "future-family-2026-thinking": {
        legacy: {
          conversationId: "legacy",
          title: "Legacy",
          count: 1,
          models: { "future-family-2026-thinking": 1 },
          firstSubmittedAt: "2026-05-23T10:05:00.000Z",
          lastSubmittedAt: "2026-05-23T10:05:00.000Z"
        }
      }
    },
    parametersByModel: {
      "agent-mode": {
        total: 3,
        combinations: {
          feature: {
            count: 3,
            parameters: { model: "agent-mode" }
          }
        },
        fields: { model: { "agent-mode": 3 } }
      },
      "canvas-v2": {
        total: 4,
        combinations: {
          canvas: {
            count: 4,
            parameters: { model: "canvas-v2" }
          }
        },
        fields: { model: { "canvas-v2": 4 } }
      },
      "future-family-2026-thinking": {
        total: 1,
        combinations: {
          thinking: {
            count: 1,
            parameters: { model: "future-family-2026-thinking" }
          }
        },
        fields: { model: { "future-family-2026-thinking": 1 } }
      }
    },
    variantsByModel: {
      "agent-mode": {
        total: 3,
        variants: {
          "agent-mode": {
            name: "agent-mode",
            count: 3
          }
        }
      },
      "canvas-v2": {
        total: 4,
        variants: {
          "canvas-v2": {
            name: "canvas-v2",
            count: 4
          }
        }
      },
      "future-family-2026-thinking": {
        total: 1,
        variants: {
          "future-family-2026-thinking": {
            name: "future-family-2026-thinking",
            count: 1,
            apiModel: "future-family-2026-thinking"
          }
        }
      }
    },
    featuresByModel: {
      "agent-mode": {
        total: 3,
        features: { agent_mode: { id: "agent_mode", count: 3 } }
      },
      "canvas-v2": {
        total: 4,
        features: { canvas: { id: "canvas", count: 4 } }
      },
      "future-family-2026-thinking": {
        total: 1,
        features: { agent_mode: { id: "agent_mode", count: 1 } }
      }
    },
    events: [
      {
        model: "agent-mode",
        chatgptModel: "agent-mode",
        modelParameters: { model: "agent-mode" }
      },
      {
        model: "canvas-v2",
        chatgptModel: "canvas-v2",
        modelParameters: { model: "canvas-v2" },
        usageFeatures: ["canvas"]
      },
      {
        model: "future-family-2026-thinking",
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        modelParameters: { model: "future-family-2026-thinking" },
        usageFeatures: ["agent-mode"]
      }
    ]
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "future-family-2026-thinking" },
      usageFeatures: ["agent-mode"],
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/legacy",
      pageTitle: "Legacy",
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["agent-mode"], undefined);
  assert.equal(next.totals.deep_research, undefined);
  assert.equal(next.totals["canvas-v2"], undefined);
  assert.equal(next.byDate["2026-05-23"]["agent-mode"], undefined);
  assert.equal(next.byDate["2026-05-23"]["canvas-v2"], undefined);
  assert.equal(next.models["agent-mode"], undefined);
  assert.equal(next.models["canvas-v2"], undefined);
  assert.equal(next.sessionsByModel["agent-mode"], undefined);
  assert.equal(next.sessionsByModel["canvas-v2"], undefined);
  assert.equal(next.parametersByModel["agent-mode"], undefined);
  assert.equal(next.parametersByModel["canvas-v2"], undefined);
  assert.equal(next.variantsByModel["agent-mode"], undefined);
  assert.equal(next.variantsByModel["canvas-v2"], undefined);
  assert.equal(next.featuresByModel["agent-mode"], undefined);
  assert.equal(next.featuresByModel["canvas-v2"], undefined);
  assert.equal(next.events.some((event) => event.model === "agent-mode"), false);
  assert.equal(next.events.some((event) => event.model === "canvas-v2"), false);

  assert.equal(next.totals["future-family-2026-thinking"], 2);
  assert.equal(next.events.length, 2);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 2);
});

test("applyIncrement accepts exact request model slugs across model families", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const modelSlugs = [
    { model: "gpt-5", storedModel: "gpt-5", requestModel: "gpt-5" },
    { model: "gpt-5-thinking", storedModel: "gpt-5-thinking", requestModel: "gpt-5-thinking" },
    { model: "gpt-5-5-thinking", storedModel: "gpt-5-5-thinking", requestModel: "gpt-5-5-thinking" },
    { model: "future-family-2026-thinking", storedModel: "future-family-2026-thinking", requestModel: "future-family-2026-thinking" },
    { model: "future-family-2026-instant", storedModel: "future-family-2026-instant", requestModel: "future-family-2026-instant" },
    { model: "gpt-realtime-2", storedModel: "gpt-realtime-2", requestModel: "gpt-realtime-2" },
    { model: "codex-mini-latest", storedModel: "codex-mini-latest", requestModel: "codex-mini-latest" },
    { model: "computer-use-preview", storedModel: "computer-use-preview", requestModel: "computer-use-preview" },
    { model: "text-embedding-3-large", storedModel: "text-embedding-3-large", requestModel: "text-embedding-3-large" },
    { model: "gpt-image", storedModel: "gpt-image", requestModel: "gpt-image" },
    { model: "dall-e", storedModel: "dall-e", requestModel: "dall-e" },
    { model: "image-1", storedModel: "image-1", requestModel: "image-1" },
    { model: "image-2", storedModel: "image-2", requestModel: "image-2" },
    { model: "dall-e-3", storedModel: "dall-e-3", requestModel: "dall-e-3" },
    { model: "whisper-1", storedModel: "whisper-1", requestModel: "whisper-1" },
    { model: "tts-1", storedModel: "tts-1", requestModel: "tts-1" },
    { model: "omni-moderation-latest", storedModel: "omni-moderation-latest", requestModel: "omni-moderation-latest" }
  ];

  modelSlugs.forEach(({ model, storedModel, requestModel }) => {
    const next = background.applyIncrement(
      background.createEmptyStats(),
      {
        model,
        apiModel: "ignored-catalog-value",
        chatgptModel: "ignored-catalog-value",
        modelObservedSource: "fetch-request",
        modelParameters: { model },
        submittedAt: now.toISOString(),
        promptHash: model,
        promptLength: 42
      },
      now
    );

    assert.equal(next.totals[storedModel], 1, model);
    assert.equal(next.events[0].apiModel, requestModel, model);
    assert.equal(next.events[0].chatgptModel, requestModel, model);
    assert.equal(next.events[0].modelParameters.model, requestModel, model);
  });
});

test("applyIncrement does not derive usage features from model names alone", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");

  ["gpt-realtime-2", "tts-1", "whisper-1", "gpt-image", "dall-e", "future-family-2026-thinking"].forEach((model) => {
    const next = background.applyIncrement(
      background.createEmptyStats(),
      {
        model,
        apiModel: model,
        chatgptModel: model,
        modelObservedSource: "fetch-request",
        modelParameters: { model },
        submittedAt: now.toISOString(),
        promptHash: `no-feature-${model}`,
        promptLength: 42
      },
      now
    );

    assert.equal(next.events[0].model, model);
    assert.deepEqual(next.events[0].usageFeatures, [], model);
    assert.equal(next.featuresByModel[model], undefined, model);
  });
});

test("parseNetworkRequestBody prefilters all feature aliases", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(JSON.stringify({
          selected_model: "future-family-2026-thinking",
          features: ["imagegen", "gpt_image", "gpt-image", "dalle", "dall_e", "input_audio", "output_audio", "tts", "whisper", "advanced_voice", "canvases"]
        }), "utf8")
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, ["audio", "canvas", "image_generation"]);
});

test("parseNetworkRequestBody does not derive features from model fields", () => {
  ["gpt-realtime-2", "tts-1", "whisper-1", "gpt-image", "dall-e"].forEach((model) => {
    const parsed = background.parseNetworkRequestBody({
      raw: [
        {
          bytes: Buffer.from(JSON.stringify({ model }), "utf8")
        }
      ]
    });

    assert.equal(parsed.model, model, model);
    assert.deepEqual(parsed.__usageFeatures, [], model);
  });
});

test("applyIncrement canonicalizes mixed-case and underscore request model slugs", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(JSON.stringify({ model: "GPT_4o", reasoning: { effort: "high" } }), "utf8")
      }
    ]
  });
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "GPT_4o",
      apiModel: "GPT_4o",
      chatgptModel: "GPT_4o",
      modelObservedSource: "fetch-request",
      modelParameters: parsed,
      submittedAt: now.toISOString(),
      promptHash: "mixed-case-model",
      promptLength: 42
    },
    now
  );

  assert.equal(parsed.model, "gpt-4o");
  assert.equal(next.totals["gpt-4o"], 1);
  assert.equal(next.totals.GPT_4o, undefined);
  assert.equal(next.events[0].model, "gpt-4o");
  assert.equal(next.events[0].apiModel, "gpt-4o");
  assert.equal(next.events[0].chatgptModel, "gpt-4o");
  assert.equal(next.events[0].modelParameters.model, "gpt-4o");
  assert.equal(next.variantsByModel["gpt-4o"].variants["gpt-4o"].count, 1);
  assert.deepEqual(next.parametersByModel["gpt-4o"].fields.model, { "gpt-4o": 1 });
});

test("applyIncrement stores supplied API model parameters", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelMode: "thinking",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": ["none", "low", "medium", "high", "xhigh"],
        "text.verbosity": ["low", "medium", "high"]
      },
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.models["future-family-2026-thinking"].apiModel, "future-family-2026-thinking");
  assert.equal(next.models["future-family-2026-thinking"].chatgptModel, "future-family-2026-thinking");
  assert.equal(next.models["future-family-2026-thinking"].mode, "thinking");
  assert.equal(next.events[0].chatgptModel, "future-family-2026-thinking");
  assert.deepEqual(next.events[0].modelParameters["text.verbosity"], ["low", "medium", "high"]);
  assert.equal(next.variantsByModel["future-family-2026-thinking"].variants["future-family-2026-thinking"].count, 1);
});

test("applyIncrement stores only model call parameters", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        temperature: 0.2,
        "image_generation_options.size": "1024x1024",
        voice: "advanced_voice",
        voice_mode: true,
        audio_mode: true,
        realtime_mode: true,
        size: 43299,
        quality: "attachment-quality",
        text: "Attached prompt text must not be counted as a model parameter.",
        conversation: "conversation-field",
        stream: true,
        conversation_mode: "primary_assistant",
        supports_buffering: true,
        supported_encodings: ["v1"],
        system_hints: "length:0"
      },
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  const parameters = next.events[0].modelParameters;
  assert.equal(parameters.model, "future-family-2026-thinking");
  assert.equal(parameters["reasoning.effort"], "high");
  assert.equal(parameters.temperature, 0.2);
  assert.equal(parameters["image_generation_options.size"], "1024x1024");
  assert.equal(parameters.voice, undefined);
  assert.equal(parameters.voice_mode, undefined);
  assert.equal(parameters.audio_mode, undefined);
  assert.equal(parameters.realtime_mode, undefined);
  assert.equal(parameters.size, undefined);
  assert.equal(parameters.quality, undefined);
  assert.equal(parameters.text, undefined);
  assert.equal(parameters.conversation, undefined);
  assert.equal(parameters.stream, undefined);
  assert.equal(parameters.conversation_mode, undefined);
  assert.equal(parameters.supports_buffering, undefined);
  assert.equal(parameters.supported_encodings, undefined);
  assert.equal(parameters.system_hints, undefined);
});

test("parseNetworkRequestBody covers official model parameters and excludes content transport fields", () => {
  const requestBody = {
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            reasoning: { effort: "high", summary: "auto" },
            text: { verbosity: "medium", format: { type: "json_schema" } },
            temperature: 0.2,
            top_p: 0.9,
            top_logprobs: 5,
            logprobs: true,
            logit_bias: { "123": -1 },
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
            max_output_tokens: 2048,
            max_completion_tokens: 1024,
            max_tool_calls: 4,
            parallel_tool_calls: true,
            service_tier: "auto",
            truncation: "auto",
            stop: ["END"],
            modalities: ["text", "audio"],
            voice: "advanced_voice",
            voice_mode: true,
            audio_mode: true,
            realtime_mode: true,
            audio: { output: { voice: "alloy", speed: 1 }, format: "pcm16" },
            prompt: { id: "pmpt_123", version: "2", variables: { secret: "hidden" } },
            prompt_cache_key: "cache-key",
            prompt_cache_retention: "24h",
            safety_identifier: "user_123",
            include: ["reasoning.encrypted_content"],
            response_format: { type: "json_schema" },
            turn_detection: { type: "server_vad" },
            input_audio_transcription: { model: "gpt-realtime-whisper" },
            web_search_options: { search_context_size: "low" },
            image_generation_options: { size: "1024x1024" },
            tools: [{ type: "deep_search" }],
            size: 43299,
            quality: "attachment-quality",
            unknown_internal_knob: "future-value",
            stream: true,
            stream_options: { include_usage: true },
            conversation_mode: "primary_assistant",
            supports_buffering: true,
            supported_encodings: ["v1"],
            system_hints: "length:0",
            messages: [{ role: "user", content: "secret" }],
            input: "secret",
            instructions: "secret",
            metadata: { hidden: true },
            user: "user-id",
            transport: "sse",
            protocol: "chatgpt"
          }),
          "utf8"
        )
      }
    ]
  };

  const parsed = background.parseNetworkRequestBody(requestBody);

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed["reasoning.effort"], "high");
  assert.equal(parsed["reasoning.summary"], "auto");
  assert.equal(parsed["text.verbosity"], "medium");
  assert.equal(parsed["text.format.type"], "json_schema");
  assert.equal(parsed.temperature, 0.2);
  assert.equal(parsed.top_p, 0.9);
  assert.equal(parsed.top_logprobs, 5);
  assert.equal(parsed.logprobs, true);
  assert.equal(parsed.frequency_penalty, 0.1);
  assert.equal(parsed.presence_penalty, 0.2);
  assert.equal(parsed.max_output_tokens, 2048);
  assert.equal(parsed.max_completion_tokens, 1024);
  assert.equal(parsed.max_tool_calls, 4);
  assert.equal(parsed.parallel_tool_calls, true);
  assert.equal(parsed.service_tier, "auto");
  assert.equal(parsed.truncation, "auto");
  assert.deepEqual(parsed.stop, ["END"]);
  assert.deepEqual(parsed.modalities, ["text", "audio"]);
  assert.equal(parsed.voice, undefined);
  assert.equal(parsed.voice_mode, undefined);
  assert.equal(parsed.audio_mode, undefined);
  assert.equal(parsed.realtime_mode, undefined);
  assert.equal(parsed["audio.output.voice"], "alloy");
  assert.equal(parsed["audio.output.speed"], 1);
  assert.equal(parsed["prompt.id"], "pmpt_123");
  assert.equal(parsed["prompt.version"], "2");
  assert.equal(parsed.prompt_cache_key, "cache-key");
  assert.equal(parsed.prompt_cache_retention, "24h");
  assert.equal(parsed.safety_identifier, "user_123");
  assert.deepEqual(parsed.include, ["reasoning.encrypted_content"]);
  assert.equal(parsed["response_format.type"], "json_schema");
  assert.equal(parsed["turn_detection.type"], "server_vad");
  assert.equal(parsed["input_audio_transcription.model"], "gpt-realtime-whisper");
  assert.equal(parsed["web_search_options.search_context_size"], "low");
  assert.equal(parsed["image_generation_options.size"], "1024x1024");
  assert.equal(parsed.reasoning, undefined);
  assert.equal(parsed.text, undefined);
  assert.equal(parsed.response_format, undefined);
  assert.equal(parsed.image_generation_options, undefined);
  assert.equal(parsed.tools, undefined);
  assert.equal(parsed["tools.type"], undefined);
  assert.equal(parsed.size, undefined);
  assert.equal(parsed.quality, undefined);
  assert.equal(parsed.unknown_internal_knob, undefined);
  assert.equal(parsed.stream, undefined);
  assert.equal(parsed.stream_options, undefined);
  assert.equal(parsed.conversation_mode, undefined);
  assert.equal(parsed.supports_buffering, undefined);
  assert.equal(parsed.supported_encodings, undefined);
  assert.equal(parsed.system_hints, undefined);
  assert.equal(parsed.messages, undefined);
  assert.equal(parsed.input, undefined);
  assert.equal(parsed.instructions, undefined);
  assert.equal(parsed.metadata, undefined);
  assert.equal(parsed.user, undefined);
  assert.equal(parsed.transport, undefined);
  assert.equal(parsed.protocol, undefined);
  assert.equal(parsed["prompt.variables"], undefined);
});

test("parseNetworkRequestBody uses only the current request model field", () => {
  const withCurrentModel = {
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            selected_model: "future-family-2026-instant",
            default_model_slug: "gpt-4o-mini",
            last_message_model_slug: "gpt-4o-mini",
            model: "future-family-2026-thinking",
            temperature: 0.1
          }),
          "utf8"
        )
      }
    ]
  };
  const defaultOnly = {
    raw: [
      {
        bytes: Buffer.from(JSON.stringify({ default_model_slug: "gpt-4o-mini", temperature: 0.1 }), "utf8")
      }
    ]
  };

  assert.equal(background.parseNetworkRequestBody(withCurrentModel).model, "future-family-2026-thinking");
  assert.equal(background.parseNetworkRequestBody(defaultOnly).model, undefined);
});

test("parseNetworkRequestBody preserves model aliases while choosing canonical count model", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            selected_model: "gpt-5-3-instant",
            api_model: "gpt-5-2-thinking",
            chatgpt_model: "gpt-5-4-thinking",
            temperature: 0.2
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "gpt-5-4-thinking");
  assert.equal(parsed.api_model, "gpt-5-2-thinking");
  assert.equal(parsed.chatgpt_model, "gpt-5-4-thinking");
  assert.equal(parsed.selected_model, "gpt-5-3-instant");
  assert.equal(parsed.temperature, 0.2);
});

test("image-N-image request fields are feature names, not models", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [{ bytes: Buffer.from(JSON.stringify({ model: "image-2-image" }), "utf8") }]
  });
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "image-2-image",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "image-2-image" },
      source: "send-button",
      submittedAt: "2026-05-23T12:00:00.000Z",
      promptHash: "image-feature",
      promptLength: 10
    },
    new Date("2026-05-23T12:00:00.000Z")
  );

  assert.equal(parsed.model, undefined);
  assert.deepEqual(next.totals, {});
  assert.equal(next.events.length, 0);
});

test("applyIncrement preserves internal numbered GPT mode slugs for storage", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "gpt-5-2-thinking",
      apiModel: "gpt-5-2-thinking",
      chatgptModel: "gpt-5-2-thinking",
      modelObservedSource: "fetch-request:model",
      modelParameters: { model: "gpt-5-2-thinking" },
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "canonical-numbered",
      promptLength: 10
    },
    now
  );

  assert.equal(next.totals["gpt-5-2-thinking"], 1);
  assert.equal(next.totals["gpt-5-thinking"], undefined);
  assert.equal(next.byDate["2026-05-23"]["gpt-5-2-thinking"], 1);
  assert.equal(next.events[0].model, "gpt-5-2-thinking");
  assert.equal(next.events[0].apiModel, "gpt-5-2-thinking");
  assert.equal(next.events[0].chatgptModel, "gpt-5-2-thinking");
  assert.equal(next.events[0].modelParameters.model, "gpt-5-2-thinking");
});

test("applyIncrement counts request feature tags separately from model parameters", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "future-family-2026-thinking",
      apiModel: "ignored",
      chatgptModel: "ignored",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "medium"
      },
      usageFeatures: SUPPORTED_USAGE_FEATURES,
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.deepEqual(Object.keys(next.featuresByModel["future-family-2026-thinking"].features).sort(), SUPPORTED_USAGE_FEATURES);
  assert.equal(next.featuresByModel.thinking, undefined);
  SUPPORTED_USAGE_FEATURES.forEach((feature) => {
    assert.equal(next.featuresByModel["future-family-2026-thinking"].features[feature].count, 1, feature);
    assert.equal(next.featuresByModel["future-family-2026-thinking"].features[feature].name, SUPPORTED_USAGE_FEATURE_NAMES[feature], feature);
    assert.equal(next.totals[feature], undefined, feature);
    assert.equal(next.byDate["2026-05-23"][feature], undefined, feature);
    assert.equal(next.models[feature], undefined, feature);
    assert.equal(next.sessionsByModel[feature], undefined, feature);
    assert.equal(next.parametersByModel[feature], undefined, feature);
    assert.equal(next.variantsByModel[feature], undefined, feature);
    assert.equal(next.events.some((event) => event.model === feature), false, feature);
  });
  assert.deepEqual(next.events[0].usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(next.events[0].modelParameters["reasoning.effort"], "high");
  assert.equal(next.events[0].usageFeatures.includes("thinking"), false);
});

test("parseNetworkRequestBody detects every supported feature signal", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            canvas: true,
            image_generation_options: { size: "1024x1024" },
            conversation_mode: { kind: "agent mode" },
            web_search_options: { search_context_size: "low" },
            input_audio_transcription: { model: "gpt-realtime-whisper" },
            realtime_mode: true,
            audio_mode: true,
            voice_mode: true,
            modalities: ["text", "audio"],
            tools: [{ type: "deep research" }, { type: "search" }, { type: "image generation" }]
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(parsed["web_search_options.search_context_size"], "low");
  assert.equal(parsed["input_audio_transcription.model"], "gpt-realtime-whisper");
  assert.equal(parsed.conversation_mode, undefined);
  assert.equal(parsed.realtime_mode, undefined);
  assert.equal(parsed.audio_mode, undefined);
  assert.equal(parsed.voice_mode, undefined);
});

test("parseNetworkRequestBody detects direct feature flags and ignores disabled or prompt-scoped flags", () => {
  const direct = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            agentmode: true,
            "deep-search": true,
            canvas: true,
            image_generation: true,
            "web-search": true,
            search: true,
            "real-time": true,
            voice: true
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(direct.model, "future-family-2026-thinking");
  assert.deepEqual(direct.__usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(direct.agentmode, undefined);
  assert.equal(direct.canvas, undefined);
  assert.equal(direct["deep-search"], undefined);
  assert.equal(direct.image_generation, undefined);
  assert.equal(direct["web-search"], undefined);
  assert.equal(direct.search, undefined);
  assert.equal(direct["real-time"], undefined);
  assert.equal(direct.voice, undefined);

  const disabledAndPromptScoped = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            agent_mode: false,
            canvas: false,
            deep_search: "off",
            image_generation: { enabled: false },
            web_search: "disabled",
            search: "disabled",
            realtime_mode: false,
            voice_mode: false,
            prompt: {
              agentmode: true,
              canvas: true,
              deepsearch: true,
              image_generation: true,
              web_search: true,
              search: true,
              realtime: true,
              voice: true
            }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(disabledAndPromptScoped.model, "future-family-2026-thinking");
  assert.deepEqual(disabledAndPromptScoped.__usageFeatures, []);
});

test("parseNetworkRequestBody detects URL encoded feature flags without parameter pollution", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          [
            "model=future-family-2026-thinking",
            "reasoning_effort=high",
            "agentmode=true",
            "deepsearch=true",
            "image_generation=true",
            "web_search=true",
            "real_time=true",
            "voice=true",
            "canvas=true"
          ].join("&"),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed["reasoning.effort"], "high");
  assert.deepEqual(parsed.__usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(parsed.agentmode, undefined);
  assert.equal(parsed.deepsearch, undefined);
  assert.equal(parsed.image_generation, undefined);
  assert.equal(parsed.web_search, undefined);
  assert.equal(parsed.real_time, undefined);
  assert.equal(parsed.voice, undefined);
  assert.equal(parsed.canvas, undefined);
});

test("parseNetworkRequestBody treats search booleans and search tools as web search", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            search: true,
            tools: [{ type: "search" }]
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, ["web_search"]);
  assert.equal(parsed.search, undefined);
  assert.equal(parsed.tools, undefined);
});

test("parseNetworkRequestBody ignores feature words inside prompt content", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            messages: [
              {
                role: "user",
                content: "Please compare web search, deep research, agent mode, image generation, canvas, realtime, and voice."
              }
            ],
            input: "web search deep research image generation canvas",
            instructions: "Use the words agent mode, canvas, and realtime in the answer.",
            metadata: {
              note: "voice audio web search canvas"
            }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, []);
  assert.equal(parsed.messages, undefined);
  assert.equal(parsed.input, undefined);
  assert.equal(parsed.instructions, undefined);
  assert.equal(parsed.metadata, undefined);
});

test("feature-like model fields do not become model counts", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const parsedFeatureOnly = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "canvas-v2",
            canvas: true,
            tools: [{ type: "deepsearch" }],
            image_generation_options: { size: "1024x1024" }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsedFeatureOnly.model, undefined);
  assert.deepEqual(parsedFeatureOnly.__usageFeatures, ["canvas", "deep_research", "image_generation"]);

  const ignored = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "agent-mode-v2",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "agent-mode-v2", temperature: 0.2 },
      usageFeatures: ["agent_mode"],
      submittedAt: now.toISOString(),
      promptHash: "feature-only",
      promptLength: 10
    },
    now
  );

  assert.deepEqual(ignored.totals, {});
  assert.deepEqual(ignored.featuresByModel, {});
  assert.equal(ignored.events.length, 0);

  const ignoredAudio = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "audio-v2",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "audio-v2", temperature: 0.2 },
      usageFeatures: ["audio"],
      submittedAt: now.toISOString(),
      promptHash: "audio-feature-only",
      promptLength: 10
    },
    now
  );

  assert.deepEqual(ignoredAudio.totals, {});
  assert.deepEqual(ignoredAudio.featuresByModel, {});
  assert.equal(ignoredAudio.events.length, 0);
});

test("feature signals bind to selected real request model", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "canvas-v2",
            selected_model: "future-family-2026-thinking",
            canvas: true,
            reasoning: { effort: "high" },
            conversation_mode: { kind: "agent_mode" },
            tools: [{ type: "deepsearch" }],
            image_generation_options: { size: "1024x1024" }
          }),
          "utf8"
        )
      }
    ]
  });
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: parsed.model,
      chatgptModel: parsed.model,
      apiModel: parsed.model,
      modelObservedSource: "webRequest",
      modelParameters: parsed,
      usageFeatures: parsed.__usageFeatures,
      submittedAt: now.toISOString(),
      promptHash: "real-model",
      promptLength: 12
    },
    now
  );

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed.conversation_mode, undefined);
  assert.equal(parsed.tools, undefined);
  assert.equal(parsed["image_generation_options.size"], "1024x1024");
  assert.deepEqual(parsed.__usageFeatures, ["agent_mode", "canvas", "deep_research", "image_generation"]);
  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.equal(next.totals["canvas-v2"], undefined);
  assert.equal(next.events[0].model, "future-family-2026-thinking");
  assert.equal(next.events[0].modelParameters.model, "future-family-2026-thinking");
  assert.deepEqual(next.events[0].usageFeatures, ["agent_mode", "canvas", "deep_research", "image_generation"]);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.canvas.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.deep_research.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.image_generation.count, 1);
  assert.equal(next.parametersByModel["future-family-2026-thinking"].fields.conversation_mode, undefined);
  assert.equal(next.parametersByModel["future-family-2026-thinking"].fields.tools, undefined);

  const audioParsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "audio-v2",
            selected_model: "future-family-2026-thinking",
            modalities: ["text", "audio"],
            web_search_options: { search_context_size: "low" },
            input_audio_transcription: { model: "gpt-realtime-whisper" }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(audioParsed.model, "future-family-2026-thinking");
  assert.deepEqual(audioParsed.__usageFeatures, ["audio", "realtime", "web_search"]);
  assert.equal(audioParsed["web_search_options.search_context_size"], "low");
  assert.equal(audioParsed["input_audio_transcription.model"], "gpt-realtime-whisper");
});

test("applyIncrement aggregates observed parameter values and combinations by model", () => {
  let stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "medium",
        temperature: 0.2
      },
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "first",
      promptLength: 10
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "high",
        temperature: 0.2
      },
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: new Date(now.getTime() + 1000).toISOString(),
      promptHash: "second",
      promptLength: 12
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "medium",
        temperature: 0.2
      },
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: new Date(now.getTime() + 2000).toISOString(),
      promptHash: "third",
      promptLength: 14
    },
    now
  );

  const aggregate = stats.parametersByModel["future-family-2026-thinking"];
  const combinations = Object.values(aggregate.combinations);
  const mediumCombination = combinations.find((entry) => entry.parameters["text.verbosity"] === "medium");
  const highCombination = combinations.find((entry) => entry.parameters["text.verbosity"] === "high");

  assert.equal(aggregate.total, 3);
  assert.equal(combinations.length, 2);
  assert.equal(mediumCombination.count, 2);
  assert.equal(highCombination.count, 1);
  assert.deepEqual(aggregate.fields.model, { "future-family-2026-thinking": 3 });
  assert.deepEqual(aggregate.fields["reasoning.effort"], { high: 3 });
  assert.deepEqual(aggregate.fields["text.verbosity"], { medium: 2, high: 1 });
  assert.deepEqual(aggregate.fields.temperature, { "0.2": 3 });
  assert.equal(mediumCombination.parameters.temperature, 0.2);
  assert.equal(stats.variantsByModel["future-family-2026-thinking"].total, 3);
  assert.equal(stats.variantsByModel["future-family-2026-thinking"].variants["future-family-2026-thinking"].count, 3);
});

test("applyIncrement keeps ChatGPT visible mode models as separate counters", () => {
  let stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      modelObservedSource: "fetch-request",
      submittedAt: now.toISOString(),
      promptHash: "thinking",
      promptLength: 12
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-instant",
      modelParameters: { model: "future-family-2026-instant", "reasoning.effort": "low" },
      modelObservedSource: "fetch-request",
      submittedAt: new Date(now.getTime() + 1000).toISOString(),
      promptHash: "instant",
      promptLength: 10
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      modelObservedSource: "fetch-request",
      submittedAt: new Date(now.getTime() + 2000).toISOString(),
      promptHash: "thinking-again",
      promptLength: 14
    },
    now
  );

  assert.equal(stats.totals["future-family-2026-thinking"], 2);
  assert.equal(stats.totals["future-family-2026-instant"], 1);
  assert.equal(stats.variantsByModel["future-family-2026-thinking"].total, 2);
  assert.equal(stats.variantsByModel["future-family-2026-instant"].total, 1);
  assert.equal(stats.variantsByModel["future-family-2026-thinking"].variants["future-family-2026-thinking"].count, 2);
  assert.equal(stats.variantsByModel["future-family-2026-instant"].variants["future-family-2026-instant"].count, 1);
  assert.equal(stats.parametersByModel["future-family-2026-thinking"].fields.model["future-family-2026-thinking"], 2);
  assert.equal(stats.parametersByModel["future-family-2026-instant"].fields.model["future-family-2026-instant"], 1);
});

test("applyIncrement migrates and cleans stored parameter aggregates", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "GPT-5.5": 2,
      "Unknown model": 8,
      unknown: 3
    },
    byDate: {
      "2026-05-22": {
        "GPT-5.5": 2,
        "Unknown model": 8,
        unknown: 3
      }
    },
    models: {
      "GPT-5.5": {
        label: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-thinking"
      },
      "Unknown model": {
        label: "Unknown model",
        apiModel: "unknown"
      },
      unknown: {
        label: "unknown",
        apiModel: "unknown"
      }
    },
    sessionsByModel: {},
    parametersByModel: {
      "GPT-5.5": {
        total: "2",
        combinations: {
          staleKey: {
            count: "2",
            parameters: {
              model: "gpt-5.5",
              "reasoning.effort": "low"
            },
            firstSubmittedAt: "2026-05-22T10:00:00.000Z",
            lastSubmittedAt: "2026-05-22T11:00:00.000Z"
          },
          badCount: {
            count: 0,
            parameters: {
              model: "gpt-5.5",
              "reasoning.effort": "high"
            }
          }
        },
        fields: {
          "reasoning.effort": {
            low: "2",
            high: 0
          },
          invalid: null
        }
      },
      "Unknown model": {
        total: 8,
        combinations: {
          unknown: {
            count: 8,
            parameters: {
              model: "unknown"
            }
          }
        },
        fields: {
          model: {
            unknown: 8
          }
        }
      },
      unknown: {
        total: 3,
        combinations: {
          unknown: {
            count: 3,
            parameters: {
              model: "unknown"
            }
          }
        },
        fields: {
          model: {
            unknown: 3
          }
        }
      }
    },
    events: [
      {
        model: "GPT-5.5"
      },
      {
        model: "Unknown model"
      },
      {
        model: "unknown"
      }
    ],
    lastUpdated: "2026-05-22T11:00:00.000Z"
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: now.toISOString(),
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high"
      },
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  const aggregate = next.parametersByModel["future-family-2026-thinking"];
  const combinations = Object.values(aggregate.combinations);
  const lowCombination = combinations.find((entry) => entry.parameters["reasoning.effort"] === "low");
  const highCombination = combinations.find((entry) => entry.parameters["reasoning.effort"] === "high");

  assert.equal(next.parametersByModel["Unknown model"], undefined);
  assert.equal(next.parametersByModel.unknown, undefined);
  assert.equal(next.events.some((event) => event.model === "Unknown model"), false);
  assert.equal(next.events.some((event) => event.model === "unknown"), false);
  assert.equal(aggregate.total, 1);
  assert.equal(combinations.length, 1);
  assert.equal(lowCombination, undefined);
  assert.equal(highCombination.count, 1);
  assert.equal(aggregate.fields.model["gpt-5.5"], undefined);
  assert.deepEqual(aggregate.fields.model, { "future-family-2026-thinking": 1 });
  assert.deepEqual(aggregate.fields["reasoning.effort"], { high: 1 });
});

test("applyIncrement canonicalizes stored model labels across every aggregate", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "GPT-5 5": 2,
      "GPT-5.5": 1
    },
    byDate: {
      "2026-05-23": {
        "GPT-5 5": 2,
        "GPT-5.5": 1
      }
    },
    models: {
      "GPT-5 5": {
        label: "GPT-5 5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-thinking",
        mode: "thinking"
      },
      "GPT-5.5": {
        label: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-instant",
        mode: "instant"
      }
    },
    sessionsByModel: {
      "GPT-5 5": {
        "legacy-conversation": {
          conversationId: "legacy-conversation",
          title: "Legacy title",
          count: 2,
          models: { "GPT-5 5": 2 },
          firstSubmittedAt: "2026-05-23T10:00:00.000Z",
          lastSubmittedAt: "2026-05-23T10:10:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/legacy-conversation"
        }
      },
      "GPT-5.5": {
        "legacy-conversation": {
          conversationId: "legacy-conversation",
          title: "Canonical title",
          count: 1,
          models: { "GPT-5.5": 1 },
          firstSubmittedAt: "2026-05-23T11:00:00.000Z",
          lastSubmittedAt: "2026-05-23T11:10:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/legacy-conversation"
        }
      }
    },
    parametersByModel: {
      "GPT-5 5": {
        total: 2,
        combinations: {
          thinking: {
            count: 2,
            parameters: {
              model: "future-family-2026-thinking",
              "reasoning.effort": "high"
            },
            firstSubmittedAt: "2026-05-23T10:00:00.000Z",
            lastSubmittedAt: "2026-05-23T10:10:00.000Z"
          }
        },
        fields: {
          model: { "future-family-2026-thinking": 2 }
        }
      },
      "GPT-5.5": {
        total: 1,
        combinations: {
          instant: {
            count: 1,
            parameters: {
              model: "future-family-2026-instant",
              "reasoning.effort": "low"
            },
            firstSubmittedAt: "2026-05-23T11:00:00.000Z",
            lastSubmittedAt: "2026-05-23T11:10:00.000Z"
          }
        },
        fields: {
          model: { "future-family-2026-instant": 1 }
        }
      }
    },
    variantsByModel: {
      "GPT-5 5": {
        total: 2,
        variants: {
          "future-family-2026-thinking": {
            name: "future-family-2026-thinking",
            count: 2,
            apiModel: "gpt-5.5",
            mode: "thinking",
            firstSubmittedAt: "2026-05-23T10:00:00.000Z",
            lastSubmittedAt: "2026-05-23T10:10:00.000Z"
          }
        }
      },
      "GPT-5.5": {
        total: 1,
        variants: {
          "future-family-2026-instant": {
            name: "future-family-2026-instant",
            count: 1,
            apiModel: "gpt-5.5",
            mode: "instant",
            firstSubmittedAt: "2026-05-23T11:00:00.000Z",
            lastSubmittedAt: "2026-05-23T11:10:00.000Z"
          }
        }
      }
    },
    events: [
      {
        model: "GPT-5 5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-thinking"
      },
      {
        model: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-instant"
      }
    ],
    lastUpdated: "2026-05-23T11:10:00.000Z"
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      source: "webRequest",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/legacy-conversation",
      pageTitle: "Live title",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high"
      },
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["GPT-5 5"], undefined);
  assert.equal(next.byDate["2026-05-23"]["GPT-5 5"], undefined);
  assert.equal(next.models["GPT-5 5"], undefined);
  assert.equal(next.sessionsByModel["GPT-5 5"], undefined);
  assert.equal(next.parametersByModel["GPT-5 5"], undefined);
  assert.equal(next.variantsByModel["GPT-5 5"], undefined);
  assert.equal(next.events.some((event) => event.model === "GPT-5 5"), false);
  assert.equal(next.events.some((event) => event.apiModel === "gpt-5.5"), false);
  assert.equal(next.events.some((event) => event.modelParameters && event.modelParameters.model === "gpt-5.5"), false);
  assert.equal(next.totals["GPT-5.5"], undefined);

  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.equal(next.byDate["2026-05-23"]["future-family-2026-thinking"], 1);
  assert.equal(next.models["future-family-2026-thinking"].label, "future-family-2026-thinking");
  assert.equal(next.models["future-family-2026-thinking"].apiModel, "future-family-2026-thinking");
  assert.equal(next.sessionsByModel["future-family-2026-thinking"]["legacy-conversation"].count, 1);
  assert.deepEqual(next.sessionsByModel["future-family-2026-thinking"]["legacy-conversation"].models, { "future-family-2026-thinking": 1 });
  assert.equal(next.parametersByModel["future-family-2026-thinking"].total, 1);
  assert.equal(next.parametersByModel["future-family-2026-thinking"].fields.model["future-family-2026-thinking"], 1);
  assert.equal(next.variantsByModel["future-family-2026-thinking"].total, 1);
  assert.equal(next.variantsByModel["future-family-2026-thinking"].variants["future-family-2026-thinking"].count, 1);

  assert.equal(next.totals["future-family-2026-instant"], undefined);
  assert.equal(next.parametersByModel["future-family-2026-instant"], undefined);
  assert.equal(next.variantsByModel["future-family-2026-instant"], undefined);
});

test("applyIncrement canonicalizes event-only request model metadata", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {},
    byDate: {},
    models: {},
    sessionsByModel: {},
    variantsByModel: {},
    parametersByModel: {},
    events: [
      {
        model: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "GPT-5.5",
        modelObservedSource: "fetch-request",
        modelParameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high"
        }
      }
    ]
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "text.verbosity": "high"
      },
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.events.length, 1);
  assert.equal(next.events.some((event) => event.model === "GPT-5.5"), false);
  assert.equal(next.events.some((event) => event.apiModel === "gpt-5.5"), false);
  assert.equal(next.events[0].model, "future-family-2026-thinking");
  assert.equal(next.events[0].apiModel, "future-family-2026-thinking");
  assert.equal(next.events[0].modelParameters.model, "future-family-2026-thinking");
});

test("webRequest observations override DOM metadata with request body parameters", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const requestBody = {
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            reasoning: { effort: "xhigh" },
            text: { verbosity: "high" },
            temperature: 0.3,
            top_p: 0.95,
            max_output_tokens: 1024,
            image_generation_options: { size: "1024x1024" },
            conversation_mode: { kind: "agent_mode" },
            tools: [{ type: "deep_research" }]
          }),
          "utf8"
        )
      }
    ]
  };

  const parsed = background.parseNetworkRequestBody(requestBody);
  const observed = background.observeNetworkRequest({ tabId: 17, requestBody }, now);
  const merged = background.mergeRecentNetworkObservation(
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "GPT-5.5",
      modelParameters: { model: "gpt-5.5" },
      source: "enter-key",
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42,
      usageFeatures: ["web_search"]
    },
    { tab: { id: 17 } },
    new Date(now.getTime() + 500)
  );
  const next = background.applyIncrement(background.createEmptyStats(), merged, now);

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed["reasoning.effort"], "xhigh");
  assert.equal(parsed["text.verbosity"], "high");
  assert.equal(parsed.temperature, 0.3);
  assert.equal(observed.model, "future-family-2026-thinking");
  assert.equal(merged.chatgptModel, "future-family-2026-thinking");
  assert.equal(merged.modelObservedSource, "webRequest");
  assert.equal(merged.modelParameters.model, "future-family-2026-thinking");
  assert.equal(merged.modelParameters.max_output_tokens, 1024);
  assert.deepEqual(merged.usageFeatures, ["agent_mode", "deep_research", "image_generation", "web_search"]);
  assert.equal(next.events[0].modelParameters["reasoning.effort"], "xhigh");
  assert.equal(next.events[0].model, "future-family-2026-thinking");
  assert.equal(next.variantsByModel["future-family-2026-thinking"].variants["future-family-2026-thinking"].count, 1);
  assert.deepEqual(next.parametersByModel["future-family-2026-thinking"].fields["text.verbosity"], { high: 1 });
  assert.deepEqual(next.parametersByModel["future-family-2026-thinking"].fields.top_p, { "0.95": 1 });
  assert.deepEqual(next.parametersByModel["future-family-2026-thinking"].fields.max_output_tokens, { "1024": 1 });
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.image_generation.name, "Image generation");
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.deep_research.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.web_search.count, 1);
});

test("webRequest observations read model parameters from request URLs", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const observed = background.observeNetworkRequest(
    {
      tabId: 18,
      url: "https://chatgpt.com/local-model-probe?model=future-family-2026-thinking&reasoning_effort=high&temperature=0.2"
    },
    now
  );
  const merged = background.mergeRecentNetworkObservation(
    {
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "url123",
      promptLength: 18
    },
    { tab: { id: 18 } },
    new Date(now.getTime() + 250)
  );
  const next = background.applyIncrement(background.createEmptyStats(), merged, now);

  assert.equal(observed.model, "future-family-2026-thinking");
  assert.equal(merged.modelParameters.model, "future-family-2026-thinking");
  assert.equal(merged.modelParameters["reasoning.effort"], "high");
  assert.equal(merged.modelParameters.temperature, "0.2");
  assert.equal(next.byDate["2026-05-23"]["future-family-2026-thinking"], 1);
});

test("webRequest observations are consumed once per tab", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  background.observeNetworkRequest(
    {
      tabId: 19,
      requestBody: {
        raw: [{ bytes: Buffer.from(JSON.stringify({ model: "future-family-2026-thinking" }), "utf8") }]
      }
    },
    now
  );

  const first = background.mergeRecentNetworkObservation(
    { source: "send-button", submittedAt: now.toISOString(), promptHash: "one", promptLength: 1 },
    { tab: { id: 19 } },
    new Date(now.getTime() + 100)
  );
  const second = background.mergeRecentNetworkObservation(
    {
      model: "GPT-5.5",
      modelObservedSource: "message-dom",
      modelParameters: { model: "gpt-5.5" },
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "two",
      promptLength: 2
    },
    { tab: { id: 19 } },
    new Date(now.getTime() + 200)
  );

  assert.equal(first.model, "future-family-2026-thinking");
  assert.equal(first.modelObservedSource, "webRequest");
  assert.equal(second.model, "GPT-5.5");
  assert.equal(second.modelObservedSource, "message-dom");
});

test("applyIncrement stores daily counts using submittedAt date", () => {
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "gpt-4o",
      modelObservedSource: "fetch-response",
      modelParameters: { model: "gpt-4o" },
      source: "send-button",
      submittedAt: "2026-05-23T23:59:59.000Z",
      promptHash: "date123",
      promptLength: 12
    },
    new Date("2026-05-24T00:00:10.000Z")
  );

  assert.equal(next.byDate["2026-05-23"]["gpt-4o"], 1);
  assert.equal(next.byDate["2026-05-24"], undefined);
});

test("applyIncrement limits stored event history", () => {
  let stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  for (let index = 0; index < 510; index += 1) {
    stats = background.applyIncrement(
      stats,
      {
        model: "GPT-4o",
        modelObservedSource: "fetch-request",
        modelParameters: { model: "gpt-4o" },
        source: "enter-key",
        submittedAt: new Date(now.getTime() + index).toISOString(),
        promptHash: String(index),
        promptLength: index
      },
      now
    );
  }

  assert.equal(stats.totals["gpt-4o"], 510);
  assert.equal(stats.events.length, 500);
  assert.equal(stats.events[0].promptLength, 509);
});

test("badgeText keeps action badge compact", () => {
  assert.equal(background.badgeText(0), "");
  assert.equal(background.badgeText(12), "12");
  assert.equal(background.badgeText(99), "99");
  // 数字大就用很短的 99+,避免长数字盖住工具栏图标
  assert.equal(background.badgeText(100), "99+");
  assert.equal(background.badgeText(10000), "99+");
});

test("OpenAI status records drive compact abnormal badge and title", () => {
  const major = background.createOpenAIStatusRecord({
    ok: true,
    status: background.sanitizeOpenAIStatusPayload({
      components: [
        { id: "chatgpt", name: "ChatGPT", status: "major_outage", position: 1 },
        { id: "conversations", name: "Conversations", status: "operational", position: 2 }
      ]
    }, "2026-06-04T04:00:00.000Z")
  }, "2026-06-04T04:00:01.000Z");

  assert.equal(major.state, "major");
  assert.equal(background.isAbnormalOpenAIStatus(major), true);
  assert.equal(background.statusBadgeText(major, 42), "!");
  assert.equal(background.statusBadgeColor(major), "#dc2626");
  assert.match(background.actionTitle({ totals: { "gpt-5-thinking": 42 } }, major), /OpenAI status: Major outage/);

  const operational = background.createOpenAIStatusRecord({
    ok: true,
    status: background.sanitizeOpenAIStatusPayload({
      components: [{ id: "chatgpt", name: "ChatGPT", status: "operational", position: 1 }]
    }, "2026-06-04T04:00:00.000Z")
  }, "2026-06-04T04:00:01.000Z");

  assert.equal(operational.state, "operational");
  assert.equal(background.isAbnormalOpenAIStatus(operational), false);
  assert.equal(background.statusBadgeText(operational, 42), "42");
  assert.equal(background.statusBadgeColor(operational), "#2563eb");

  const timeout = background.createOpenAIStatusRecord({ ok: false, error: "OpenAI status request timed out." }, "2026-06-04T04:00:02.000Z");
  assert.equal(timeout.state, "timeout");
  assert.match(timeout.label, /timed out/);
  assert.equal(background.isAbnormalOpenAIStatus(timeout), true);
  assert.equal(background.statusBadgeText(timeout, 0), "?");
  assert.equal(background.statusBadgeColor(timeout), "#d97706");

  const fetchFail = background.createOpenAIStatusRecord({ ok: false, error: "Fetch is not available in this Chrome runtime." }, "2026-06-04T04:00:03.000Z");
  assert.equal(fetchFail.state, "fetch-failure");
  assert.equal(background.isAbnormalOpenAIStatus(fetchFail), true);
  assert.equal(background.statusBadgeText(fetchFail, 0), "?");
});

test("sanitizeSettings keeps only supported UI languages", () => {
  assert.deepEqual(background.sanitizeSettings({ language: "en", startDate: "2026-05-01", endDate: "2026-05-30" }), {
    version: 1,
    language: "en",
    startDate: "2026-05-01",
    endDate: "2026-05-30"
  });
  assert.deepEqual(background.sanitizeSettings({ language: "fr", startDate: "bad", endDate: "2026-05-30" }), {
    version: 1,
    language: "zh",
    startDate: "",
    endDate: "2026-05-30"
  });
  assert.deepEqual(background.sanitizeSettings(null), { version: 1, language: "zh", startDate: "", endDate: "" });
});

test("sanitizeOpenAIStatusPayload keeps only web ChatGPT availability without incident timeline data", () => {
  const status = background.sanitizeOpenAIStatusPayload(
    {
      page: {
        id: "openai",
        name: "OpenAI",
        url: "https://status.openai.com/",
        updated_at: "2026-05-30T12:00:00.000Z"
      },
      status: {
        indicator: "minor",
        description: "Partially degraded service"
      },
      components: [
        {
          id: "responses",
          name: "Responses",
          status: "operational",
          position: 1,
          updated_at: "2026-05-30T12:01:00.000Z"
        },
        {
          id: "realtime",
          name: "Realtime",
          status: "degraded_performance",
          position: 2,
          updated_at: "2026-05-30T12:02:00.000Z"
        },
        {
          id: "images",
          name: "Images",
          status: "operational",
          position: 3
        },
        {
          id: "chatgpt-atlas",
          name: "ChatGPT Atlas",
          status: "operational",
          position: 4
        },
        {
          id: "agent",
          name: "Agent",
          status: "operational",
          position: 5
        },
        {
          id: "image-generation",
          name: "Image Generation",
          status: "operational",
          position: 6
        },
        {
          id: "file-uploads",
          name: "File uploads",
          status: "operational",
          position: 7
        },
        {
          id: "voice-mode",
          name: "Voice mode",
          status: "operational",
          position: 8
        },
        {
          id: "login",
          name: "Login",
          status: "operational",
          position: 9
        },
        {
          id: "login-web",
          name: "Login",
          status: "degraded_performance",
          position: 10
        }
      ],
      incidents: [
        {
          id: "incident-1",
          name: "Realtime degradation",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/example",
          updated_at: "2026-05-30T12:03:00.000Z"
        },
        {
          id: "incident-1b",
          name: "API users may see increased error rates for GPT-5.4",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/api",
          updated_at: "2026-05-30T12:03:00.000Z"
        },
        {
          id: "incident-1c",
          name: "ChatGPT Atlas browsing issue",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/atlas",
          updated_at: "2026-05-30T12:03:00.000Z",
          components: [{ name: "ChatGPT Atlas" }]
        },
        {
          id: "incident-2",
          name: "ChatGPT conversations latency",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/chatgpt",
          updated_at: "2026-05-30T12:03:00.000Z",
          components: [{ name: "Conversations" }],
          incident_updates: [
            {
              body: "Some users may see slower ChatGPT conversations on web.",
              status: "investigating",
              updated_at: "2026-05-30T12:03:00.000Z"
            }
          ]
        }
      ]
    },
    "2026-05-30T12:04:00.000Z"
  );

  assert.equal(status.page.name, "OpenAI");
  assert.equal(status.status.indicator, "minor");
  assert.equal(status.status.description, "");
  assert.equal(status.realtime, undefined);
  assert.equal(status.components.some((component) => component.name === "Responses"), false);
  assert.equal(status.components.some((component) => component.name === "Realtime"), false);
  assert.equal(status.components.some((component) => component.name === "Images"), false);
  assert.equal(status.components.some((component) => component.name === "ChatGPT Atlas"), false);
  assert.equal(status.components.some((component) => component.name === "Agent"), true);
  assert.equal(status.components.some((component) => component.name === "Image Generation"), true);
  assert.equal(status.components.some((component) => component.name === "File uploads"), true);
  assert.equal(status.components.some((component) => component.name === "Voice mode"), true);
  assert.equal(status.components.some((component) => component.name === "Login"), true);
  assert.equal(status.components.filter((component) => component.name === "Login").length, 1);
  assert.equal(status.components.find((component) => component.name === "Login").status, "degraded_performance");
  assert.deepEqual(status.incidents, []);
  assert.equal(status.sourceUrl, "https://status.openai.com/");
});

test("sanitizeOpenAIStatusPayload aggregates top status from filtered ChatGPT web components", () => {
  const status = background.sanitizeOpenAIStatusPayload(
    {
      status: {
        indicator: "critical",
        description: "Major API outage"
      },
      components: [
        { id: "responses", name: "Responses", status: "major_outage", position: 1 },
        { id: "chatgpt", name: "ChatGPT", status: "operational", position: 2 },
        { id: "conversations", name: "Conversations", status: "operational", position: 3 }
      ]
    },
    "2026-05-30T12:04:00.000Z"
  );

  assert.equal(status.status.indicator, "none");
  assert.equal(status.status.description, "");
  assert.deepEqual(
    status.components.map((component) => component.name),
    ["ChatGPT", "Conversations"]
  );
});

test("isChatGPTUrl accepts only ChatGPT page URLs", () => {
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/"), true);
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/c/abc"), true);
  assert.equal(background.isChatGPTUrl("https://chat.openai.com/"), true);
  assert.equal(background.isChatGPTUrl("https://example.com/"), false);
});

test("service worker script registers available chrome events without requiring optional events", () => {
  const listeners = [];
  const alarms = [];
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      alarms: {
        create: (name, options) => alarms.push({ name, options }),
        onAlarm: { addListener: (listener) => listeners.push(["alarm", listener]) }
      },
      storage: {
        local: {
          get: () => {},
          set: () => {}
        }
      },
      action: {
        setBadgeBackgroundColor: () => {},
        setBadgeText: () => {},
        setTitle: () => {}
      }
    },
    Date,
    Math,
    Number,
    Object,
    String,
    Array
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  assert.equal(listeners.length, 3);
  assert.equal(listeners[0][0], "message");
  assert.equal(listeners[1][0], "installed");
  assert.equal(listeners[2][0], "alarm");
  assert.equal(alarms.length, 1);
  assert.equal(alarms[0].name, background.STATUS_ALARM_NAME);
  assert.equal(alarms[0].options.periodInMinutes, background.STATUS_ALARM_PERIOD_MINUTES);
});

test("status alarm stores latest OpenAI status and updates toolbar abnormal state", async () => {
  const listeners = [];
  const stored = {};
  const badgeTexts = [];
  const badgeColors = [];
  let title = "";
  let resolved;
  const updated = new Promise((resolve) => {
    resolved = resolve;
  });
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      alarms: {
        create: () => {},
        onAlarm: { addListener: (listener) => listeners.push(["alarm", listener]) }
      },
      storage: {
        local: {
          get: (keys, callback) => {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(stored, key)) {
                result[key] = stored[key];
              }
            });
            setTimeout(() => callback(result), 0);
          },
          set: (value, callback) => {
            Object.assign(stored, value);
            setTimeout(() => callback && callback(), 0);
          }
        }
      },
      action: {
        setBadgeBackgroundColor: ({ color }) => badgeColors.push(color),
        setBadgeText: ({ text }) => badgeTexts.push(text),
        setTitle: ({ title: nextTitle }) => {
          title = nextTitle;
          resolved();
        }
      }
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        components: [
          { id: "chatgpt", name: "ChatGPT", status: "major_outage", position: 1 },
          { id: "conversations", name: "Conversations", status: "operational", position: 2 }
        ]
      })
    }),
    Date,
    Math,
    Number,
    Object,
    String,
    Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  const alarmListener = listeners.find((entry) => entry[0] === "alarm")[1];
  alarmListener({ name: background.STATUS_ALARM_NAME });
  await updated;

  assert.equal(stored[background.STATUS_KEY].state, "major");
  assert.equal(badgeTexts.at(-1), "!");
  assert.equal(badgeColors.at(-1), "#dc2626");
  assert.match(title, /OpenAI status: Major outage/);
});

test("usage.increment message path dedupes root submissions across webRequest and fetch-request", async () => {
  const listeners = [];
  let storedStats = null;
  const badgeTexts = [];
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      storage: {
        local: {
          get: (keys, callback) => {
            setTimeout(() => callback({ [background.STORAGE_KEY]: storedStats }), 0);
          },
          set: (value, callback) => {
            setTimeout(() => {
              if (Object.prototype.hasOwnProperty.call(value, background.STORAGE_KEY)) {
                storedStats = value[background.STORAGE_KEY];
              }
              callback();
            }, 0);
          }
        }
      },
      action: {
        setBadgeBackgroundColor: () => {},
        setBadgeText: ({ text }) => badgeTexts.push(text)
      }
    },
    Date,
    Math,
    Number,
    Object,
    String,
    Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  const model = "gpt-5-thinking";
  const promptHash = "86bc567";
  const sender = { tab: { id: 31 } };
  const firstPayload = {
    model,
    apiModel: model,
    chatgptModel: model,
    modelMode: "thinking",
    modelParameters: { model },
    usageFeatures: ["web_search"],
    modelObservedSource: "webRequest",
    source: "send-button",
    pageUrl: "https://chatgpt.com/",
    pageTitle: "ChatGPT",
    submittedAt: "2026-06-01T17:35:28.581Z",
    promptHash,
    promptLength: 139
  };
  const secondPayload = Object.assign({}, firstPayload, {
    modelObservedSource: "fetch-request",
    submittedAt: "2026-06-01T17:35:28.583Z"
  });

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  const messageListener = listeners.find((entry) => entry[0] === "message")[1];

  const firstResponsePromise = new Promise((resolve) => {
    assert.equal(messageListener({ type: "usage.increment", payload: firstPayload }, sender, resolve), true);
  });
  const secondResponsePromise = new Promise((resolve) => {
    assert.equal(messageListener({ type: "usage.increment", payload: secondPayload }, sender, resolve), true);
  });
  const responses = await Promise.all([firstResponsePromise, secondResponsePromise]);

  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].recorded, true);
  assert.equal(responses[0].duplicate, false);
  assert.equal(responses[1].ok, true);
  assert.equal(responses[1].recorded, false);
  assert.equal(responses[1].duplicate, true);
  assert.equal(background.totalCount(storedStats), 1);
  assert.equal(storedStats.totals[model], 1);
  assert.equal(storedStats.events.length, 1);
  assert.equal(storedStats.events[0].conversationId, "");
  assert.equal(storedStats.events[0].pageUrl, "https://chatgpt.com/");
  assert.equal(storedStats.events[0].promptHash, promptHash);
  assert.equal(storedStats.events[0].source, "send-button");
  assert.equal(storedStats.events[0].modelObservedSource, "webRequest");
  assert.deepEqual(storedStats.events[0].usageFeatures, ["web_search"]);
  assert.equal(storedStats.featuresByModel[model].features.web_search.name, "Web search");
  assert.equal(storedStats.featuresByModel[model].features.web_search.count, 1);
  assert.equal(storedStats.totals.web_search, undefined);
  assert.equal(badgeTexts[badgeTexts.length - 1], "1");
});

test("mergeRecentNetworkObservation keeps the specific DOM model over a bare GPT base", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");
  // 网络请求体只给裸基座 gpt-5-5(GPT-5.5 的 /f/conversation 实测如此)
  background.observeNetworkRequest({
    tabId: 71,
    requestBody: { raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5-5" }), "utf8") }] }
  }, now);
  // content 据助手消息 data-message-model-slug 给出真实模型 gpt-5-5-thinking
  const merged = background.mergeRecentNetworkObservation(
    { model: "gpt-5-5-thinking", apiModel: "gpt-5-5-thinking", chatgptModel: "gpt-5-5-thinking", modelObservedSource: "message-dom:model-slug", modelParameters: { model: "gpt-5-5-thinking" } },
    { tab: { id: 71 } },
    now
  );
  assert.equal(merged.model, "gpt-5-5-thinking", "bare base must not overwrite the specific variant");

  // 落库后确实记到具体模型,不被拆到 gpt-5-5
  const next = background.applyIncrement(background.createEmptyStats(), Object.assign({
    modelObservedSource: "message-dom:model-slug", source: "send-button", submittedAt: now.toISOString(), promptHash: "p1", promptLength: 5
  }, merged), now);
  assert.equal(next.totals["gpt-5-5-thinking"], 1);
  assert.equal(next.totals["gpt-5-5"], undefined);
});

test("mergeRecentNetworkObservation still lets a specific network model override a DOM base", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");
  background.observeNetworkRequest({
    tabId: 72,
    requestBody: { raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5-5-instant" }), "utf8") }] }
  }, now);
  const merged = background.mergeRecentNetworkObservation(
    { model: "gpt-5-5", modelObservedSource: "message-dom:dom", modelParameters: { model: "gpt-5-5" } },
    { tab: { id: 72 } },
    now
  );
  assert.equal(merged.model, "gpt-5-5-instant", "specific network model wins over bare DOM base");
});
