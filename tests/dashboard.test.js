const assert = require("node:assert/strict");
const test = require("node:test");
const dashboard = require("../src/dashboard");
const exporter = require("../src/exporter");

function createStats() {
  return {
    totals: {
      "future-family-2026-thinking": 2,
      "future-family-2026-instant": 1
    },
    byDate: {
      "2026-05-30": {
        "future-family-2026-thinking": 2,
        "future-family-2026-instant": 1
      }
    },
    models: {
      "future-family-2026-thinking": {
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        mode: "thinking",
        parameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high",
          "text.verbosity": "medium"
        }
      },
      "future-family-2026-instant": {
        apiModel: "future-family-2026-instant",
        chatgptModel: "future-family-2026-instant",
        mode: "instant",
        parameters: {
          model: "future-family-2026-instant",
          "reasoning.effort": "medium",
          "text.verbosity": "low"
        }
      }
    },
    sessionsByModel: {
      "future-family-2026-thinking": {
        "conversation-alpha": {
          conversationId: "conversation-alpha",
          title: "Thinking conversation",
          count: 2,
          models: { "future-family-2026-thinking": 2 },
          lastSubmittedAt: "2026-05-30T15:00:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/conversation-alpha"
        }
      },
      "future-family-2026-instant": {
        "conversation-beta": {
          conversationId: "conversation-beta",
          title: "Instant conversation",
          count: 1,
          models: { "future-family-2026-instant": 1 },
          lastSubmittedAt: "2026-05-30T15:10:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/conversation-beta"
        }
      }
    },
    variantsByModel: {
      "future-family-2026-thinking": {
        total: 2,
        variants: {
          "future-family-2026-thinking": {
            name: "future-family-2026-thinking",
            count: 2,
            apiModel: "future-family-2026-thinking",
            mode: "thinking",
            lastSubmittedAt: "2026-05-30T15:10:00.000Z"
          }
        }
      },
      "future-family-2026-instant": {
        total: 1,
        variants: {
          "future-family-2026-instant": {
            name: "future-family-2026-instant",
            count: 1,
            apiModel: "future-family-2026-instant",
            mode: "instant",
            lastSubmittedAt: "2026-05-30T14:00:00.000Z"
          }
        }
      }
    },
    featuresByModel: {
      "future-family-2026-thinking": {
        total: 2,
        features: {
          deep_research: {
            id: "deep_research",
            count: 2,
            lastSubmittedAt: "2026-05-30T15:10:00.000Z"
          }
        }
      },
      "future-family-2026-instant": {
        total: 1,
        features: {
          image_generation: {
            id: "image_generation",
            count: 1,
            lastSubmittedAt: "2026-05-30T14:00:00.000Z"
          }
        }
      }
    },
    events: [
      {
        model: "future-family-2026-thinking",
        modelParameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high",
          "text.verbosity": "medium"
        },
        usageFeatures: ["deep_research"],
        submittedAt: "2026-05-30T15:10:00.000Z"
      },
      {
        model: "future-family-2026-thinking",
        modelParameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high",
          "text.verbosity": "medium"
        },
        usageFeatures: ["deep_research"],
        submittedAt: "2026-05-30T15:00:00.000Z"
      },
      {
        model: "future-family-2026-instant",
        modelParameters: {
          model: "future-family-2026-instant",
          "reasoning.effort": "medium",
          "text.verbosity": "low"
        },
        usageFeatures: ["image_generation"],
        submittedAt: "2026-05-30T14:00:00.000Z"
      }
    ]
  };
}

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function flushDashboardPromises(ticks = 12) {
  for (let index = 0; index < ticks; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createDirtyStats() {
  return {
    totals: {
      "gpt-5-5-preview": 31,
      "gpt_5_5": 4,
      "GPT-5.5": 2,
      "GPT-5 5": 1,
      "Unknown model": 7,
      "gpt-5-thinking": 3
    },
    byDate: {
      "2026-05-30": {
        "gpt-5-5-preview": 31,
        "gpt_5_5": 4,
        "GPT-5.5": 2,
        "GPT-5 5": 1,
        "Unknown model": 7,
        "gpt-5-thinking": 3
      }
    },
    models: {
      "gpt-5-5-preview": {
        label: "gpt-5-5-preview",
        apiModel: "gpt-5-thinking",
        chatgptModel: "gpt-5-5-preview",
        parameters: { model: "gpt-5-thinking" }
      },
      "gpt-5-thinking": {
        label: "gpt-5-thinking",
        apiModel: "gpt-5-thinking",
        chatgptModel: "gpt-5-thinking",
        mode: "thinking",
        parameters: { model: "gpt-5-thinking", "reasoning.effort": "high" }
      }
    },
    sessionsByModel: {
      "gpt-5-5-preview": {
        dirty: {
          conversationId: "dirty",
          title: "Dirty session",
          count: 31,
          models: { "gpt-5-5-preview": 31, "gpt-5-thinking": 3 }
        }
      },
      "gpt-5-thinking": {
        clean: {
          conversationId: "clean",
          title: "Clean exact thinking session",
          count: 3,
          models: { "gpt-5-thinking": 3, "gpt-5-5-preview": 31 },
          lastSubmittedAt: "2026-05-30T15:00:00.000Z"
        }
      }
    },
    variantsByModel: {
      "gpt-5-5-preview": {
        total: 31,
        variants: { "gpt-5-5-preview": { name: "gpt-5-5-preview", count: 31 } }
      },
      "gpt-5-thinking": {
        total: 3,
        variants: {
          "gpt-5-thinking": { name: "gpt-5-thinking", count: 3, apiModel: "gpt-5-thinking", mode: "thinking" },
          "gpt-5-5-preview": { name: "gpt-5-5-preview", count: 31 }
        }
      }
    },
    parametersByModel: {
      "gpt-5-5-preview": {
        total: 31,
        combinations: { dirty: { count: 31, parameters: { model: "gpt-5-5-preview" } } }
      },
      "gpt-5-thinking": {
        total: 3,
        combinations: { clean: { count: 3, parameters: { model: "gpt-5-thinking", "reasoning.effort": "high" } } }
      }
    },
    featuresByModel: {
      "gpt-5-5-preview": {
        total: 31,
        features: { agent_mode: { id: "agent_mode", count: 31 } }
      },
      "gpt-5-thinking": {
        total: 3,
        features: { deep_research: { id: "deep_research", count: 3 } }
      }
    },
    events: [
      {
        model: "gpt-5-5-preview",
        apiModel: "gpt-5-thinking",
        chatgptModel: "gpt-5-5-preview",
        modelParameters: { model: "gpt-5-thinking" },
        submittedAt: "2026-05-30T14:00:00.000Z"
      },
      {
        model: "gpt-5-thinking",
        apiModel: "gpt-5-thinking",
        chatgptModel: "gpt-5-thinking",
        modelMode: "thinking",
        modelParameters: { model: "gpt-5-thinking", "reasoning.effort": "high" },
        usageFeatures: ["deep_research"],
        submittedAt: "2026-05-30T15:00:00.000Z"
      }
    ]
  };
}

function createImageDashboardStats() {
  const stats = {
    totals: {},
    byDate: { "2026-05-30": {} },
    models: {},
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {},
    parametersByModel: {},
    events: []
  };
  ["gpt-image", "dall-e", "image-1", "image-2"].forEach((model, index) => {
    const count = index + 1;
    stats.totals[model] = count;
    stats.byDate["2026-05-30"][model] = count;
    stats.models[model] = { label: model, parameters: { model } };
    stats.sessionsByModel[model] = {};
  });
  stats.totals["image-2-image"] = 0;
  stats.byDate["2026-05-30"]["image-2-image"] = 0;
  stats.models["image-2-image"] = {
    label: "image-2-image",
    parameters: { model: "image-2-image" }
  };
  stats.sessionsByModel["image-2-image"] = {};
  return stats;
}

function createZeroOnlyImageStats() {
  return {
    totals: { "image-2-image": 0 },
    byDate: { "2026-05-30": { "image-2-image": 0 } },
    models: {
      "image-2-image": {
        label: "image-2-image",
        parameters: { model: "image-2-image" }
      }
    },
    sessionsByModel: { "image-2-image": {} },
    variantsByModel: {},
    featuresByModel: {},
    parametersByModel: {},
    events: []
  };
}

class DashboardTestElement {
  constructor(attributes = {}) {
    this.attributes = { ...attributes };
    this.checked = Boolean(attributes.checked);
    this.disabled = Boolean(attributes.disabled);
    this.value = attributes.value || "";
    this.textContent = attributes.textContent || "";
    this.listeners = {};
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  dispatch(type) {
    if (this.listeners[type]) {
      this.listeners[type]({ target: this });
    }
  }
}

class DashboardTestContainer {
  constructor() {
    this.nodes = [];
    this._innerHTML = "";
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.nodes = [];
    this.parse();
  }

  get innerHTML() {
    return this._innerHTML;
  }

  parse() {
    const html = this._innerHTML;
    if (html.includes('class="usage-refresh"')) {
      this.nodes.push(new DashboardTestElement({ class: "usage-refresh", selector: ".usage-refresh" }));
    }

    const status = html.match(/<div class="usage-status[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (status) {
      this.nodes.push(new DashboardTestElement({
        class: "usage-status",
        selector: ".usage-status",
        textContent: status[1]
      }));
    }
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    if (selector === "[data-view-tab]" || selector === "[data-model-toggle]") {
      return [];
    }
    return this.nodes.filter((node) => node.attributes.selector === selector);
  }
}

test("dashboard text view keeps exact and public labels while hiding unresolved placeholders", () => {
  const html = dashboard.renderModelTextList(createDirtyStats(), { language: "en" });

  assert.match(html, /gpt-5-thinking/);
  assert.match(html, /Clean exact thinking session/);
  ["gpt-5-5-preview", "gpt_5_5", "GPT-5.5", "GPT-5 5", "Dirty session"].forEach((value) => {
    assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), value);
  });
  ["Unknown model"].forEach((value) => {
    assert.doesNotMatch(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), value);
  });
});

test("dashboard helpers preserve exact variants and filter invalid parameter aggregates", () => {
  const variants = dashboard.modelVariants(createDirtyStats(), "gpt-5-thinking");
  const combinations = dashboard.parameterCombinations(createDirtyStats(), "gpt-5-thinking");

  assert.deepEqual(variants.map((variant) => variant.name), ["gpt-5-5-preview", "gpt-5-thinking"]);
  assert.equal(combinations.length, 1);
  assert.equal(combinations[0].parameters.model, "gpt-5-thinking");
});

test("dashboard treats canvas and versioned feature slugs as features, not models", () => {
  const stats = createStats();
  stats.totals.canvas = 8;
  stats.totals["canvas-v2"] = 5;
  stats.totals["future-family-2026-thinking"] = 3;
  stats.byDate["2026-05-30"].canvas = 8;
  stats.byDate["2026-05-30"]["canvas-v2"] = 5;
  stats.models.canvas = { label: "canvas", parameters: { model: "canvas" } };
  stats.models["canvas-v2"] = { label: "canvas-v2", parameters: { model: "canvas-v2" } };
  stats.featuresByModel["future-family-2026-thinking"].features.canvas = {
    id: "canvas",
    count: 1,
    lastSubmittedAt: "2026-05-30T15:20:00.000Z"
  };
  stats.events.unshift({
    model: "future-family-2026-thinking",
    modelParameters: { model: "future-family-2026-thinking" },
    usageFeatures: ["canvas"],
    submittedAt: "2026-05-30T15:20:00.000Z"
  });

  const html = dashboard.renderModelTextList(stats, { language: "en" });

  assert.match(html, /Canvas/);
  assert.doesNotMatch(html, /<strong>canvas<\/strong>/);
  assert.doesNotMatch(html, /<strong>canvas-v2<\/strong>/);
});

test("dashboard keeps recorded Deep Research and Agent Mode choices", () => {
  const stats = createStats();
  stats.totals["Deep research"] = 2;
  stats.totals["Agent mode"] = 1;
  stats.byDate["2026-05-30"]["Deep research"] = 2;
  stats.byDate["2026-05-30"]["Agent mode"] = 1;
  stats.models["Deep research"] = {
    label: "Deep research",
    apiModel: "research",
    chatgptModel: "research",
    parameters: { model: "research" }
  };
  stats.models["Agent mode"] = {
    label: "Agent mode",
    apiModel: "agent-mode",
    chatgptModel: "agent-mode",
    parameters: { model: "agent-mode" }
  };
  stats.variantsByModel["Deep research"] = {
    total: 2,
    variants: {
      research: {
        name: "research",
        apiModel: "research",
        count: 2
      }
    }
  };
  stats.variantsByModel["Agent mode"] = {
    total: 1,
    variants: {
      "agent-mode": {
        name: "agent-mode",
        apiModel: "agent-mode",
        count: 1
      }
    }
  };

  const html = dashboard.renderModelTextList(stats, { language: "en" });

  assert.match(html, /Deep research/);
  assert.match(html, /Agent mode/);
  assert.match(html, /research/);
  assert.match(html, /agent-mode/);
});

test("dashboard fills missing event feature rows from stored aggregates in the selected range", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.totals[model] = 4;
  stats.byDate["2026-06-03"] = { [model]: 2 };
  stats.featuresByModel[model].features.web_search = {
    id: "web_search",
    count: 2,
    lastSubmittedAt: "2026-06-03T08:29:15.429Z"
  };
  stats.events = [
    {
      model,
      modelParameters: { model },
      usageFeatures: [],
      submittedAt: "2026-06-03T08:29:15.429Z"
    },
    {
      model,
      modelParameters: { model },
      usageFeatures: [],
      submittedAt: "2026-06-03T07:51:26.965Z"
    }
  ];

  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /Features/);
  assert.match(html, /Web search/);
  assert.match(html, /2 times/);
});

test("dashboard text rows clarify selected range and all-time totals", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.totals[model] = 5;
  stats.byDate["2026-06-03"] = { [model]: 2 };
  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /Range 2/);
  assert.match(html, /All time 5/);
});

test("dashboard falls back to stored sessions when selected range events are outside the cache", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.byDate["2026-06-03"] = { [model]: 1 };
  stats.sessionsByModel[model]["cached-outside-events"] = {
    conversationId: "cached-outside-events",
    title: "Stored session outside event cache",
    count: 1,
    models: { [model]: 1 },
    lastSubmittedAt: "2026-06-03T08:29:15.429Z",
    lastPageUrl: "https://chatgpt.com/c/cached-outside-events"
  };
  stats.events = [];

  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /Stored session outside event cache/);
  assert.doesNotMatch(html, /No conversations for this record/);
});

test("dashboard uses stored sessions when firstSubmittedAt is inside the selected range", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.byDate["2026-06-03"] = { [model]: 1 };
  stats.sessionsByModel[model] = {
    firstInRange: {
      conversationId: "firstInRange",
      title: "Stored session first date in range",
      count: 1,
      models: { [model]: 1 },
      firstSubmittedAt: "2026-06-03T08:29:15.429Z",
      lastSubmittedAt: "2026-06-04T08:29:15.429Z",
      lastPageUrl: "https://chatgpt.com/c/firstInRange"
    }
  };
  stats.events = [];

  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /Stored session first date in range/);
});

test("dashboard prefers stored session counts when cached range events undercount the same conversation", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.byDate["2026-06-03"] = { [model]: 3 };
  stats.sessionsByModel[model] = {
    capped: {
      conversationId: "capped",
      title: "Stored capped session",
      count: 3,
      models: { [model]: 3 },
      lastSubmittedAt: "2026-06-03T08:29:15.429Z",
      lastPageUrl: "https://chatgpt.com/c/capped"
    }
  };
  stats.events = [
    {
      model,
      conversationId: "capped",
      pageTitle: "Event capped session",
      pageUrl: "https://chatgpt.com/c/capped",
      modelParameters: { model },
      usageFeatures: [],
      submittedAt: "2026-06-03T08:29:15.429Z"
    }
  ];

  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /Stored capped session/);
  assert.match(html, /Historical records not linked/);
  assert.match(html, /Stored capped session[\s\S]*2 times/);
  assert.match(html, /Event capped session[\s\S]*1 times/);
});

test("modelVariants falls back to stored variants when selected range events are empty", () => {
  const variants = dashboard.modelVariants(createStats(), "future-family-2026-thinking", 3, []);

  assert.equal(variants.length, 1);
  assert.equal(variants[0].name, "future-family-2026-thinking");
  assert.equal(variants[0].count, 2);
});

test("dashboard renders stored variants when selected range events are empty", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.byDate["2026-06-03"] = { [model]: 1 };
  stats.events = [];

  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      startDate: "2026-06-03",
      endDate: "2026-06-03",
      selectedModels: { [model]: true },
      stats
    },
    [model]
  );

  // 变体与行模型同名时不再重复("调用型号"那段去掉);模型与计数仍正常显示
  assert.doesNotMatch(html, /class="usage-variant-row"/);
  assert.match(html, /future-family-2026-thinking/);
});

test("dashboard shows stored feature counts in range when selected range events are empty", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.byDate["2026-06-03"] = { [model]: 1 };
  stats.events = [];
  stats.featuresByModel[model].features.web_search = {
    id: "web_search",
    count: 1,
    lastSubmittedAt: "2026-06-03T09:00:00.000Z"
  };

  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /future-family-2026-thinking/);
  assert.match(html, /Features/);
  assert.match(html, /Web search/);
  assert.match(html, /<b>1 times<\/b><span>Web search<\/span>/);
  assert.doesNotMatch(html, /Deep research/);
  assert.doesNotMatch(html, /Deep research[\s\S]*2 times/);
});

test("dashboard hides dirty zero-count image feature rows and keeps real image model rows", () => {
  const stats = createStats();
  const imageModels = ["gpt-image", "dall-e", "image-1", "image-2"];
  imageModels.forEach((model, index) => {
    stats.totals[model] = index + 1;
    stats.byDate["2026-05-30"][model] = index + 1;
    stats.models[model] = { label: model, parameters: { model } };
  });
  stats.totals["image-2-image"] = 0;
  stats.byDate["2026-05-30"]["image-2-image"] = 0;
  stats.models["image-2-image"] = {
    label: "image-2-image",
    parameters: { model: "image-2-image" }
  };
  stats.sessionsByModel["image-2-image"] = {
    dirty: {
      conversationId: "dirty",
      title: "Dirty zero-count image feature row",
      count: 0,
      models: { "image-2-image": 0 }
    }
  };
  stats.featuresByModel["future-family-2026-thinking"].features.image_generation = {
    id: "image_generation",
    count: 1,
    lastSubmittedAt: "2026-05-30T15:20:00.000Z"
  };

  const html = dashboard.renderModelTextList(stats, { language: "en" });

  imageModels.forEach((model) => {
    assert.match(html, new RegExp(`<strong>${model}<\\/strong>`), model);
  });
  assert.match(html, /Image generation/);
  assert.doesNotMatch(html, /<strong>image-2-image<\/strong>/);
  assert.doesNotMatch(html, /Dirty zero-count image feature row/);
});

test("dashboard page theme detects dark computed ChatGPT background without dark attributes", () => {
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const previousMatchMedia = globalThis.matchMedia;
  const body = { className: "", getAttribute: () => null };
  const documentElement = { className: "", getAttribute: () => null };
  const main = { className: "", getAttribute: () => null };

  globalThis.document = {
    body,
    documentElement,
    querySelector(selector) {
      return selector === "main" ? main : null;
    }
  };
  globalThis.getComputedStyle = (element) => {
    if (element === body || element === documentElement || element === main) {
      return { backgroundColor: "rgb(18, 18, 18)" };
    }
    return { backgroundColor: "transparent" };
  };
  globalThis.matchMedia = () => ({ matches: false });

  try {
    assert.equal(dashboard._test.detectPageTheme(), "dark");
  } finally {
    globalThis.document = previousDocument;
    globalThis.getComputedStyle = previousGetComputedStyle;
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("popup theme: stored ChatGPT theme drives popup CSS variables (same token set as in-page panel)", () => {
  const applied = {};
  const popupEl = { style: { setProperty(name, value) { applied[name] = value; } } };
  const container = { querySelector(sel) { return sel === ".usage-dashboard-popup" ? popupEl : null; } };
  const state = { options: { surface: "popup" }, container, resolvedPopupTheme: "dark" };

  dashboard._test.applyPopupThemeVariables(state);
  // 暗色:surface-page 与 surface-panel 同为 #2a2b32(原来 page 是 #1a1a2e navy,与页面内面板有色差);
  // 统一后弹窗与页面内面板背景真正一致,且不是纯黑(用户:两个面板色差不一样、别黑)。
  assert.equal(applied["--usage-surface-page"], "#2a2b32");
  assert.equal(applied["--usage-text-primary"], "#ececf1");

  state.resolvedPopupTheme = "light";
  dashboard._test.applyPopupThemeVariables(state);
  // 亮色:surface-page 也统一成 #fbfcfa(原来是 #f7f8f6,与页面内面板 #fbfcfa 有细微色差)
  assert.equal(applied["--usage-surface-page"], "#fbfcfa");
  assert.equal(applied["--usage-text-primary"], "#18201c");

  // 非 popup 表面不受影响(该函数只服务弹窗)
  const pageApplied = {};
  const pageEl = { style: { setProperty(n, v) { pageApplied[n] = v; } } };
  const pageState = { options: { surface: "page" }, container: { querySelector() { return pageEl; } }, resolvedPopupTheme: "dark" };
  dashboard._test.applyPopupThemeVariables(pageState);
  assert.equal(Object.keys(pageApplied).length, 0);
});

test("dashboard page theme treats dark main surface as dark over light page chrome", () => {
  const previousDocument = globalThis.document;
  const previousGetComputedStyle = globalThis.getComputedStyle;
  const previousMatchMedia = globalThis.matchMedia;
  const body = { className: "", getAttribute: () => null };
  const documentElement = { className: "", getAttribute: () => null };
  const main = { className: "", getAttribute: () => null };

  globalThis.document = {
    body,
    documentElement,
    querySelector(selector) {
      return selector === "main" ? main : null;
    }
  };
  globalThis.getComputedStyle = (element) => {
    if (element === main) {
      return { backgroundColor: "rgb(18, 18, 18)" };
    }
    if (element === body || element === documentElement) {
      return { backgroundColor: "rgb(255, 255, 255)" };
    }
    return { backgroundColor: "transparent" };
  };
  globalThis.matchMedia = () => ({ matches: false });

  try {
    assert.equal(dashboard._test.detectPageTheme(), "dark");
  } finally {
    globalThis.document = previousDocument;
    globalThis.getComputedStyle = previousGetComputedStyle;
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("dashboard render prunes stale selected zero-count models from count, chips, and chart", () => {
  const container = new DashboardTestContainer();
  const state = {
    container,
    options: { surface: "popup" },
    language: "en",
    activeView: "chart",
    loading: false,
    stats: createImageDashboardStats(),
    selectedModels: { "image-2-image": true },
    startDate: "2026-05-30",
    endDate: "2026-05-30",
    statusText: "",
    statusError: false,
    statusScope: "global"
  };

  dashboard._test.render(state);

  assert.equal(state.selectedModels["image-2-image"], undefined);
  assert.match(container.innerHTML, /10 total \| 4 selected/);
  ["gpt-image", "dall-e", "image-1", "image-2"].forEach((model) => {
    assert.match(container.innerHTML, new RegExp(`data-model-toggle="${model}" checked`), `${model} chip is selected`);
    assert.match(container.innerHTML, new RegExp(`data-model="${model}"`), `${model} chart series is rendered`);
    assert.match(container.innerHTML, new RegExp(`<span>${model}<\\/span>`), `${model} chip label is rendered`);
  });
  assert.doesNotMatch(container.innerHTML, /image-2-image/);
});

test("dashboard export view heading shows Export, not the stats title/subtitle", () => {
  const container = new DashboardTestContainer();
  const state = {
    container,
    options: { surface: "popup" },
    language: "en",
    activeView: "export",
    loading: false,
    stats: createImageDashboardStats(),
    selectedModels: {},
    startDate: "2026-05-30",
    endDate: "2026-05-30",
    statusText: "",
    statusError: false,
    statusScope: "global",
    exportConversationList: [
      { id: "chat-0001", title: "First chat", updateTime: "2026-05-30T15:00:00.000Z" },
      { id: "chat-0002", title: "First chat", archived: true }
    ],
    exportSelected: {}
  };

  dashboard._test.render(state);

  // 导出页标题应是 Export,而不是统计页的 "Model usage" + "X total | N selected"(用户:导出界面标题不对)。
  assert.match(container.innerHTML, /<h2>Export<\/h2>/);
  assert.match(container.innerHTML, /Choose one or more conversations from the list/);
  assert.match(container.innerHTML, /data-export-conv="chat-0001"/);
  assert.match(container.innerHTML, /data-export-conv="chat-0002"/);
  assert.match(container.innerHTML, /Archived/);
  assert.match(container.innerHTML, /One selection downloads one file/);
  assert.doesNotMatch(container.innerHTML, /data-export-scope=/);
  assert.match(container.innerHTML, /data-export-format="json" disabled/);
  assert.doesNotMatch(container.innerHTML, /\d+ total \| \d+ selected/);
});

test("dashboard render shows empty state when stale selected zero-count model is the only model", () => {
  const container = new DashboardTestContainer();
  const state = {
    container,
    options: { surface: "popup" },
    language: "en",
    activeView: "chart",
    loading: false,
    stats: createZeroOnlyImageStats(),
    selectedModels: { "image-2-image": true },
    startDate: "2026-05-30",
    endDate: "2026-05-30",
    statusText: "",
    statusError: false,
    statusScope: "global"
  };

  dashboard._test.render(state);

  assert.equal(state.selectedModels["image-2-image"], undefined);
  assert.match(container.innerHTML, /0 total \| 0 selected/);
  assert.match(container.innerHTML, /No model records yet\./);
  assert.doesNotMatch(container.innerHTML, /data-model-toggle=/);
  assert.doesNotMatch(container.innerHTML, /data-model="image-2-image"/);
  assert.doesNotMatch(container.innerHTML, />image-2-image</);
});

test("usage chart separates date ticks, axis label, and legend rows", () => {
  const model = "future-family-2026-thinking";
  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      loading: false,
      stats: createStats(),
      selectedModels: { [model]: true },
      startDate: "2026-05-30",
      endDate: "2026-05-30"
    },
    [model]
  );
  const dateY = Number(html.match(/class="usage-axis usage-axis-date"[^>]*y="([0-9.]+)"|y="([0-9.]+)" class="usage-axis usage-axis-date"/)?.slice(1).find(Boolean));
  const xAxisY = Number(html.match(/y="([0-9.]+)" class="usage-axis usage-axis-label" text-anchor="end">Date/)?.[1]);
  const legendY = Number(html.match(/y="([0-9.]+)" class="usage-axis usage-axis-label">Legend/)?.[1]);

  assert.match(html, /Model usage trend/);
  assert.match(html, />Count<\/text>/);
  assert.match(html, />Date<\/text>/);
  assert.match(html, />Legend<\/text>/);
  assert.ok(Number.isFinite(dateY), "date tick y position should be rendered");
  assert.ok(Number.isFinite(xAxisY), "x-axis label y position should be rendered");
  assert.ok(Number.isFinite(legendY), "legend label y position should be rendered");
  assert.ok(xAxisY - dateY >= 10, "x-axis label should not overlap date ticks");
  assert.ok(legendY - xAxisY >= 10, "legend row should not overlap x-axis label");
});

test("the default date range ends on the browser-local current day", () => {
  const today = localDateKey();
  const model = "future-family-current-day";
  const data = dashboard.chartSeries(
    {
      totals: { [model]: 1 },
      byDate: { [today]: { [model]: 1 } },
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      parametersByModel: {},
      events: []
    },
    [model],
    "",
    ""
  );

  assert.equal(data.dates.at(-1), today);
  assert.equal(data.series[0].values.at(-1), 1);
});

test("saved or entered future dates are clamped to the browser-local current day", () => {
  const today = localDateKey();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = localDateKey(tomorrowDate);

  assert.equal(dashboard._test.dateNoLaterThanToday(tomorrow), today);
  assert.equal(
    dashboard._test.dateNoLaterThanToday("2026-05-30"),
    "2026-05-30",
  );

  const controls = dashboard.renderDateControls({
    language: "en",
    startDate: today,
    endDate: today,
  });
  assert.match(controls, new RegExp(`max="${today}"`, "g"));
  assert.doesNotMatch(controls, new RegExp(`value="${tomorrow}"`));
});

test("renderModelTextList keeps legacy aggregate details and conversations inside each model record", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });

  assert.match(html, /usage-model-record/);
  assert.match(html, /future-family-2026-thinking/);
  assert.match(html, /future-family-2026-instant/);
  // 同名变体("调用型号"又写一遍同型号)不再重复显示
  assert.doesNotMatch(html, /usage-variant-row/);
  assert.match(html, /Latest parameters/);
  assert.match(html, /reasoning.effort=high/);
  assert.match(html, /text.verbosity=medium/);
  assert.doesNotMatch(html, /model=future-family-2026-thinking/);
  assert.match(html, /Features/);
  assert.match(html, /Deep Research/);
  assert.match(html, /Image generation/);
  assert.match(html, /Related conversations/);
  assert.match(html, /Thinking conversation/);
  assert.match(html, /Instant conversation/);
  assert.match(html, /usage-relation-conversation/);
  assert.match(html, /Historical records not linked/);
});

test("renderModelTextList nests related conversations in the matching model record", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const recordStart = html.indexOf('<div class="usage-model-record">');
  const nextRecordStart = html.indexOf('<div class="usage-model-record">', recordStart + 1);
  const modelRecord = nextRecordStart === -1 ? html.slice(recordStart) : html.slice(recordStart, nextRecordStart);

  assert.notEqual(recordStart, -1);
  assert.match(modelRecord, /future-family-2026-thinking/);
  assert.match(modelRecord, /usage-relation-conversation/);
  assert.match(modelRecord, /data-session-id="conversation-alpha"/);
  assert.doesNotMatch(modelRecord, /data-session-id="conversation-beta"/);
});

test("related conversation rows render title links without selection controls", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const rowStart = html.indexOf('<div class="usage-relation-conversation">');
  const metaStart = html.indexOf("<small>", rowStart);
  const indexRow = html.slice(rowStart, metaStart);

  assert.notEqual(rowStart, -1);
  assert.match(indexRow, /usage-index-link/);
  assert.match(indexRow, /data-session-id="conversation-alpha"/);
  assert.match(indexRow, /Thinking conversation/);
  assert.doesNotMatch(indexRow, /usage-session-titlebar/);
  assert.doesNotMatch(indexRow, /<input\b/);
  assert.doesNotMatch(indexRow, />Open</);
});

test("usage count details keep request-response relations and their conversations in one hierarchy", () => {
  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      loading: false,
      stats: createStats(),
      selectedModels: { "future-family-2026-thinking": true },
      startDate: "2026-05-30",
      endDate: "2026-05-30"
    },
    ["future-family-2026-thinking"]
  );
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "dashboard.js"), "utf8");
  const detailsStart = html.indexOf('<div class="usage-count-details" data-model-record-details="future-family-2026-thinking">');
  const details = html.slice(detailsStart);

  assert.notEqual(detailsStart, -1);
  assert.match(html, /<div class="usage-count-row">/);
  assert.doesNotMatch(html, /data-model-record-toggle/);
  assert.doesNotMatch(html, /usage-count-caret/);
  assert.match(details, /future-family-2026-thinking[\s\S]*Response pending/);
  assert.match(details, /Reasoning effort/);
  assert.match(details, /Features/);
  assert.match(details, /Related conversations/);
  assert.match(details, /usage-relation-conversation/);
  assert.doesNotMatch(details, /usage-session-titlebar/);
  assert.match(source, /\.usage-count-record\{[^}]*border:0;[^}]*border-bottom:1px solid var\(--usage-border-divider\);[^}]*background:transparent/);
  assert.match(source, /\.usage-model-relation\{[^}]*border:1px solid var\(--usage-border-panel\)/);
});

test("usage count details render inline without popup row toggles", () => {
  const container = new DashboardTestContainer();
  const state = {
    container,
    options: { surface: "popup" },
    language: "en",
    activeView: "chart",
    loading: false,
    stats: createStats(),
    selectedModels: { "future-family-2026-thinking": true },
    startDate: "2026-05-30",
    endDate: "2026-05-30",
    statusText: "",
    statusError: false,
    statusScope: "global"
  };

  dashboard._test.render(state);
  const toggle = container.querySelector("[data-model-record-toggle]");

  assert.equal(toggle, null);
  assert.match(container.innerHTML, /usage-count-details" data-model-record-details="future-family-2026-thinking">/);
  assert.doesNotMatch(container.innerHTML, /usage-count-details" data-model-record-details="future-family-2026-thinking" hidden/);
  assert.doesNotMatch(container.innerHTML, /<details class="usage-count-record">/);
  assert.doesNotMatch(container.innerHTML, /<summary class="usage-count-row">/);
  assert.doesNotMatch(container.innerHTML, /<button class="usage-count-row"/);
  assert.match(container.innerHTML, /<div class="usage-count-row">/);
});

test("usage date range filters model counts, features, parameters, and conversation index", () => {
  const stats = createStats();
  stats.totals["future-family-2026-thinking"] = 5;
  stats.byDate["2026-05-01"] = { "future-family-2026-thinking": 3 };
  stats.events = stats.events.map((event, index) => ({
    ...event,
    conversationId: index < 2 ? "conversation-alpha" : "conversation-beta",
    pageTitle: index < 2 ? "Thinking conversation" : "Instant conversation",
    pageUrl: index < 2 ? "https://chatgpt.com/c/conversation-alpha" : "https://chatgpt.com/c/conversation-beta"
  }));
  stats.events.push({
    model: "future-family-2026-thinking",
    modelParameters: {
      model: "future-family-2026-thinking",
      "reasoning.effort": "low"
    },
    usageFeatures: ["web_search"],
    submittedAt: "2026-05-01T10:00:00.000Z",
    conversationId: "conversation-old",
    pageTitle: "Old conversation",
    pageUrl: "https://chatgpt.com/c/conversation-old"
  });

  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      selectedModels: { "future-family-2026-thinking": true },
      stats
    },
    ["future-family-2026-thinking"]
  );

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2<\/b>/);
  assert.match(html, /Deep Research <b>2<\/b>/);
  assert.match(html, /Reasoning effort[\s\S]*<b>high<\/b> 2 times/);
  assert.match(html, /Thinking conversation/);
  assert.doesNotMatch(html, /Web search/);
  assert.doesNotMatch(html, /reasoning\.effort=low/);
  assert.doesNotMatch(html, /Old conversation/);
});

test("dashboard normalizes raw event feature aliases before display", () => {
  const stats = createStats();
  stats.events = [
    {
      model: "future-family-2026-thinking",
      usageFeatures: ["websearch", "deepsearch", "dalle", "canvases"],
      submittedAt: "2026-05-30T15:10:00.000Z"
    }
  ];

  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      selectedModels: { "future-family-2026-thinking": true },
      stats
    },
    ["future-family-2026-thinking"]
  );

  assert.match(html, /Web Search|Web search/);
  assert.match(html, /Deep Research/);
  assert.match(html, /Image generation/);
  assert.match(html, /Canvas/);
  assert.doesNotMatch(html, /websearch/);
  assert.doesNotMatch(html, /deepsearch/);
  assert.doesNotMatch(html, /dalle/);
});

test("explicit date range does not reuse cached sessions outside the selected range", () => {
  const stats = createStats();
  stats.sessionsByModel["future-family-2026-thinking"] = {
    outside: {
      conversationId: "outside",
      title: "Outside cached conversation",
      count: 3,
      models: { "future-family-2026-thinking": 3 },
      lastSubmittedAt: "2026-06-01T05:27:16.000Z",
      lastPageUrl: "https://chatgpt.com/c/outside"
    }
  };

  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      selectedModels: { "future-family-2026-thinking": true },
      stats
    },
    ["future-family-2026-thinking"]
  );

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2<\/b>/);
  assert.match(html, /No conversations for this record/);
  assert.doesNotMatch(html, /Outside cached conversation/);
  assert.doesNotMatch(html, /2026-06-01/);
});

test("model rows keep today's count inside the selected date range", () => {
  const stats = createStats();
  const today = localDateKey();
  const selectedDate = today === "2026-05-30" ? "2026-05-29" : "2026-05-30";
  stats.totals = { "future-family-2026-thinking": 9 };
  stats.byDate = {
    [selectedDate]: { "future-family-2026-thinking": 2 },
    [today]: { "future-family-2026-thinking": 7 }
  };

  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: selectedDate,
    endDate: selectedDate
  });

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2<\/b><small>Range 2 \| All time 9 \| Today 0<\/small>/);
  assert.doesNotMatch(html, /Today 7/);
});

test("modelVariants returns exact response model counts", () => {
  const variants = dashboard.modelVariants(createStats(), "future-family-2026-thinking");

  assert.equal(variants.length, 1);
  assert.equal(variants[0].name, "future-family-2026-thinking");
  assert.equal(variants[0].count, 2);
});

test("modelVariants uses responseModel instead of the requested route for actual response details", () => {
  const stats = createStats();
  stats.totals = { "GPT-5.6 Sol": 2 };
  stats.byDate = { "2026-05-30": { "GPT-5.6 Sol": 2 } };
  stats.models = {
    "GPT-5.6 Sol": {
      label: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-pro",
      apiModel: "gpt-5-6-thinking"
    }
  };
  stats.events = [
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-pro",
      apiModel: "gpt-5-6-thinking",
      modelMode: "pro",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-05-30T15:10:00.000Z"
    },
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-thinking",
      apiModel: "gpt-5-6-thinking",
      modelMode: "thinking",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-05-30T15:00:00.000Z"
    }
  ];

  const variants = dashboard.modelVariants(stats, "GPT-5.6 Sol");

  assert.deepEqual(
    variants.map((variant) => [variant.name, variant.count]),
    [["gpt-5-6-pro", 1], ["gpt-5-6-thinking", 1]]
  );
  assert.equal(variants[0].apiModel, "gpt-5-6-pro");
});

test("request-only events stay in a pending request-response relation", () => {
  const stats = createStats();
  stats.totals = { "GPT-5.6 Sol": 2 };
  stats.byDate = { "2026-05-30": { "GPT-5.6 Sol": 2 } };
  stats.events = [
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-pro",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-05-30T15:10:00.000Z"
    },
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-05-30T15:00:00.000Z"
    }
  ];

  const variants = dashboard.modelVariants(stats, "GPT-5.6 Sol", 10, stats.events);
  const requests = dashboard.modelRequestModels(stats, "GPT-5.6 Sol", 10, stats.events);
  const html = dashboard.renderModelTextList(stats, {
    language: "zh",
    startDate: "2026-05-30",
    endDate: "2026-05-30"
  });

  assert.deepEqual(variants.map((variant) => [variant.name, variant.count]), [["gpt-5-6-pro", 1]]);
  assert.deepEqual(requests.map((request) => [request.name, request.count]), [["gpt-5-6-thinking", 2]]);
  assert.match(html, /gpt-5-6-thinking<\/code><i>&rarr;<\/i><code>gpt-5-6-pro/);
  assert.match(html, /待确认实际回复/);
  assert.equal((html.match(/gpt-5-6-pro/g) || []).length, 1);
  assert.equal((html.match(/待确认实际回复/g) || []).length, 1);
});

test("chart count details show each request-response pair and pending pair together", () => {
  const stats = createStats();
  stats.totals = { "GPT-5.6 Sol": 3 };
  stats.byDate = { "2026-05-30": { "GPT-5.6 Sol": 3 } };
  stats.events = [
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-thinking",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-05-30T15:20:00.000Z"
    },
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6",
      responseModel: "gpt-5-6",
      modelParameters: { model: "gpt-5-6" },
      submittedAt: "2026-05-30T15:10:00.000Z"
    },
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-05-30T15:00:00.000Z"
    }
  ];

  const html = dashboard.renderActiveView(
    {
      language: "zh",
      activeView: "chart",
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      selectedModels: { "GPT-5.6 Sol": true },
      stats
    },
    ["GPT-5.6 Sol"]
  );

  assert.match(html, /gpt-5-6-thinking<\/code><i>&rarr;<\/i><code>gpt-5-6-thinking/);
  assert.match(html, /gpt-5-6<\/code><i>&rarr;<\/i><code>gpt-5-6/);
  assert.match(html, /待确认实际回复/);
  assert.equal((html.match(/class="usage-model-relation"/g) || []).length, 3);
});

test("Chat and Work contributions stay under the same exact request-response relation and their own conversations", () => {
  const model = "5.6 Terra";
  const stats = {
    totals: { [model]: 2 },
    byDate: { "2026-08-22": { [model]: 2 } },
    models: { [model]: { label: model } },
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {},
    parametersByModel: {},
    relationsByModel: {},
    events: [
      {
        model,
        requestModel: "gpt-5.6-terra-wm",
        responseModel: "gpt-5.6-terra-wm",
        modelParameters: { model: "gpt-5.6-terra-wm", "reasoning.effort": "high" },
        usageFeatures: ["web_search"],
        sourceMode: "work",
        conversationId: "work-0001",
        pageTitle: "Work research",
        pageUrl: "https://chatgpt.com/c/work-0001",
        submittedAt: "2026-08-22T16:10:00.000Z"
      },
      {
        model,
        requestModel: "gpt-5.6-terra-wm",
        responseModel: "gpt-5.6-terra-wm",
        modelParameters: { model: "gpt-5.6-terra-wm", "reasoning.effort": "low" },
        usageFeatures: ["connectors"],
        sourceMode: "chat",
        conversationId: "chat-0001",
        pageTitle: "Chat research",
        pageUrl: "https://chatgpt.com/c/chat-0001",
        submittedAt: "2026-08-22T16:00:00.000Z"
      }
    ]
  };
  const state = {
    language: "en",
    startDate: "2026-08-22",
    endDate: "2026-08-22"
  };
  const relations = dashboard.modelRelations(stats, model, state);
  const html = dashboard.renderModelTextList(stats, state);

  assert.equal(relations.length, 1);
  assert.equal(relations[0].count, 2);
  assert.deepEqual(relations[0].efforts, { high: 1, low: 1 });
  assert.deepEqual(relations[0].features, { web_search: 1, connectors: 1 });
  assert.equal(Object.values(relations[0].conversations).reduce((sum, item) => sum + item.count, 0), 2);
  assert.match(html, /gpt-5\.6-terra-wm<\/code><i>&rarr;<\/i><code>gpt-5\.6-terra-wm/);
  assert.match(html, /Work research/);
  assert.match(html, /Chat research/);
  assert.match(html, /class="usage-source-mode work">Work/);
  assert.match(html, /class="usage-source-mode chat">Chat/);
});

test("parameterCombinations prefers stored aggregate when available", () => {
  const stats = createStats();
  stats.parametersByModel = {
    "future-family-2026-thinking": {
      combinations: {
        exact: {
          count: 9,
          parameters: {
            model: "future-family-2026-thinking",
            "reasoning.effort": "xhigh",
            "text.verbosity": "high"
          },
          lastSubmittedAt: "2026-05-30T16:00:00.000Z"
        }
      }
    }
  };

  const combinations = dashboard.parameterCombinations(stats, "future-family-2026-thinking");

  assert.equal(combinations.length, 1);
  assert.equal(combinations[0].count, 9);
  assert.equal(combinations[0].parameters["reasoning.effort"], "xhigh");
});
test("renderOpenAIStatusPanel shows ChatGPT web availability without unrelated product blocks", () => {
  const html = dashboard.renderOpenAIStatusPanel({
    language: "en",
    openaiStatus: {
      fetchedAt: "2026-05-30T12:04:00.000Z",
      sourceUrl: "https://status.openai.com/",
      page: { name: "OpenAI", updatedAt: "2026-05-30T12:00:00.000Z" },
      status: { indicator: "minor", description: "Partially degraded service" },
      components: [
        { name: "Conversations", status: "degraded_performance" },
        { name: "Image Generation", status: "operational" },
        { name: "ChatGPT", status: "operational" },
        { name: "Voice Mode", status: "operational" },
        { name: "Search", status: "operational" },
        { name: "API", status: "operational" },
        { name: "Sora", status: "operational" },
        { name: "Playground", status: "operational" }
      ],
      incidents: [
        {
          name: "ChatGPT conversations latency",
          status: "investigating",
          impact: "minor",
          updatedAt: "2026-05-30T12:03:00.000Z",
          shortlink: "https://stspg.io/example",
          summary: "Some users may see slower ChatGPT conversations on web.",
          components: ["Conversations"]
        }
      ]
    }
  });

  assert.doesNotMatch(html, /ChatGPT web status/);
  assert.match(html, /Partially degraded service/);
  assert.match(html, /Last checked/);
  assert.equal((html.match(/>From status\.openai\.com</g) || []).length, 1);
  assert.match(html, /Conversations/);
  assert.match(html, /Degraded performance/);
  assert.match(html, /ChatGPT/);
  assert.match(html, /Image Generation/);
  assert.match(html, /Voice Mode/);
  assert.match(html, /Search/);
  assert.doesNotMatch(html, />API</);
  assert.doesNotMatch(html, /Sora/);
  assert.doesNotMatch(html, /Playground/);
  assert.doesNotMatch(html, /Related incident summary/);
  assert.doesNotMatch(html, /ChatGPT conversations latency/);
  assert.doesNotMatch(html, /Investigating/);
  assert.doesNotMatch(html, /Minor impact/);
  assert.doesNotMatch(html, /Some users may see slower ChatGPT conversations on web\./);
  assert.doesNotMatch(html, /Affected: Conversations/);
  assert.doesNotMatch(html, /Active incidents/);
  assert.doesNotMatch(html, /1 items/);
  assert.match(html, /status\.openai\.com/);
});

test("renderOpenAIStatusPanel omits incident block when there are no related incidents", () => {
  const html = dashboard.renderOpenAIStatusPanel({
    language: "en",
    openaiStatus: {
      fetchedAt: "2026-05-30T12:04:00.000Z",
      sourceUrl: "https://status.openai.com/",
      page: { name: "OpenAI", updatedAt: "2026-05-30T12:00:00.000Z" },
      status: { indicator: "none", description: "All Systems Operational" },
      components: [{ name: "Conversations", status: "operational" }],
      incidents: []
    }
  });

  assert.match(html, /All Systems Operational/);
  assert.match(html, /Conversations/);
  assert.doesNotMatch(html, /Related incident summary/);
  assert.doesNotMatch(html, /No active incidents/);
});

test("renderOpenAIStatusPanel shows loading state before status data exists", () => {
  const html = dashboard.renderOpenAIStatusPanel({
    language: "en",
    openaiStatus: null,
    openaiStatusLoading: true
  });

  assert.match(html, /usage-skeleton/);
  assert.doesNotMatch(html, /All Systems Operational/);
});

test("dashboard refreshes usage stats when local storage changes", async () => {
  const previousHandler = globalThis.ChatGPTUsageDashboardMessageHandler;
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const storageListeners = [];
  const container = new DashboardTestContainer();
  const initialStats = createStats();
  const updatedStats = createStats();
  updatedStats.totals["future-family-2026-thinking"] = 3;
  updatedStats.byDate["2026-05-30"]["future-family-2026-thinking"] = 3;
  let usageGetCount = 0;

  globalThis.document = {
    getElementById() {
      return null;
    },
    createElement() {
      return { id: "", textContent: "" };
    },
    head: {
      appendChild() {}
    }
  };
  globalThis.chrome = {
    storage: {
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        }
      }
    }
  };
  globalThis.ChatGPTUsageDashboardMessageHandler = (message) => {
    if (message.type === "usage.get") {
      usageGetCount += 1;
      return { ok: true, stats: usageGetCount === 1 ? initialStats : updatedStats };
    }
    if (message.type === "settings.get") {
      return { ok: true, settings: { language: "en", startDate: "2026-05-30", endDate: "2026-05-30" } };
    }
    return undefined;
  };

  try {
    dashboard.init(container, { surface: "popup" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storageListeners.length, 1);
    assert.match(container.innerHTML, /3 total/);

    storageListeners[0]({ "chatgptModelUsageStats.v1": { newValue: updatedStats } }, "local");
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    if (typeof previousHandler === "undefined") {
      delete globalThis.ChatGPTUsageDashboardMessageHandler;
    } else {
      globalThis.ChatGPTUsageDashboardMessageHandler = previousHandler;
    }
    if (typeof previousChrome === "undefined") {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
    if (typeof previousDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }

  assert.equal(usageGetCount, 2);
  assert.match(container.innerHTML, /4 total/);
  assert.match(container.innerHTML, /future-family-2026-thinking/);
});

test("newly counted models become visible by default without reselecting a model the user cleared", () => {
  const state = {
    stats: {
      totals: {
        "future-family-2026-thinking": 2,
        "future-family-2026-instant": 1
      },
      byDate: {},
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      parametersByModel: {},
      events: []
    },
    selectedModels: {},
    knownModels: {},
    modelSelectionInitialized: false
  };

  dashboard._test.ensureSelection(state);
  assert.equal(state.selectedModels["future-family-2026-thinking"], true);
  assert.equal(state.selectedModels["future-family-2026-instant"], true);

  state.selectedModels["future-family-2026-thinking"] = false;
  state.stats.totals["future-family-2027-pro"] = 1;
  dashboard._test.ensureSelection(state);

  assert.equal(state.selectedModels["future-family-2026-thinking"], false);
  assert.equal(state.selectedModels["future-family-2026-instant"], true);
  assert.equal(state.selectedModels["future-family-2027-pro"], true);
});

test("dashboard refresh reloads the account conversation list in the export view", async () => {
  const previousHandler = globalThis.ChatGPTUsageDashboardMessageHandler;
  const previousList = globalThis.__chatgptUsageListConversations;
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const container = new DashboardTestContainer();
  let listRequestCount = 0;

  globalThis.document = {
    getElementById() {
      return null;
    },
    createElement() {
      return { id: "", textContent: "" };
    },
    head: {
      appendChild() {}
    }
  };
  globalThis.chrome = {
    storage: {
      onChanged: {
        addListener() {}
      }
    }
  };
  globalThis.ChatGPTUsageDashboardMessageHandler = (message) => {
    if (message.type === "usage.get") {
      return { ok: true, stats: createStats() };
    }
    if (message.type === "settings.get") {
      return { ok: true, settings: { language: "en", startDate: "2026-05-30", endDate: "2026-05-30" } };
    }
    return undefined;
  };
  globalThis.__chatgptUsageListConversations = () => {
    listRequestCount += 1;
    return {
      conversations: listRequestCount === 1
        ? [{ id: "chat-1", title: "First" }]
        : [
            { id: "chat-1", title: "First" },
            { id: "chat-2", title: "Second" }
          ],
      complete: true,
      source: "account"
    };
  };

  try {
    const instance = dashboard.init(container, { surface: "page" });
    await flushDashboardPromises();

    instance.state.activeView = "export";
    await instance.reload();
    assert.equal(listRequestCount, 1);
    assert.deepEqual(instance.state.exportConversationList.map((conversation) => conversation.id), ["chat-1"]);

    instance.state.exportSelected = { "chat-1": true };
    await instance.reload();
    assert.equal(listRequestCount, 2);
    assert.deepEqual(instance.state.exportConversationList.map((conversation) => conversation.id), ["chat-1", "chat-2"]);
    assert.deepEqual(instance.state.exportSelected, { "chat-1": true });
  } finally {
    if (typeof previousHandler === "undefined") {
      delete globalThis.ChatGPTUsageDashboardMessageHandler;
    } else {
      globalThis.ChatGPTUsageDashboardMessageHandler = previousHandler;
    }
    if (typeof previousList === "undefined") {
      delete globalThis.__chatgptUsageListConversations;
    } else {
      globalThis.__chatgptUsageListConversations = previousList;
    }
    if (typeof previousChrome === "undefined") {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
    if (typeof previousDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});

test("dashboard refresh keeps parameter rows and in-range aggregate feature rows when range events are empty", async () => {
  const previousHandler = globalThis.ChatGPTUsageDashboardMessageHandler;
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const storageListeners = [];
  const container = new DashboardTestContainer();
  const initialStats = createStats();
  const model = "gpt-5-thinking";
  const updatedStats = {
    totals: { [model]: 5 },
    byDate: { "2026-05-30": { [model]: 5 } },
    models: {
      [model]: {
        label: model,
        apiModel: model,
        chatgptModel: model,
        mode: "thinking",
        parameters: {
          model,
          "reasoning.effort": "high",
          "web_search_options.search_context_size": "low"
        }
      }
    },
    sessionsByModel: { [model]: {} },
    variantsByModel: {},
    featuresByModel: {
      [model]: {
        total: 5,
        features: {
          web_search: {
            id: "web_search",
            count: 5,
            lastSubmittedAt: "2026-05-30T18:00:00.000Z"
          }
        }
      }
    },
    parametersByModel: {
      [model]: {
        total: 5,
        combinations: {
          webSearch: {
            count: 5,
            parameters: {
              model,
              "reasoning.effort": "high",
              "web_search_options.search_context_size": "low"
            },
            lastSubmittedAt: "2026-05-30T18:00:00.000Z"
          }
        }
      }
    },
    events: []
  };
  let usageGetCount = 0;

  globalThis.document = {
    getElementById() {
      return null;
    },
    createElement() {
      return { id: "", textContent: "" };
    },
    head: {
      appendChild() {}
    }
  };
  globalThis.chrome = {
    storage: {
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        }
      }
    }
  };
  globalThis.ChatGPTUsageDashboardMessageHandler = (message) => {
    if (message.type === "usage.get") {
      usageGetCount += 1;
      return { ok: true, stats: usageGetCount === 1 ? initialStats : updatedStats };
    }
    if (message.type === "settings.get") {
      return { ok: true, settings: { language: "en", startDate: "2026-05-30", endDate: "2026-05-30" } };
    }
    return undefined;
  };

  try {
    dashboard.init(container, { surface: "popup" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storageListeners.length, 1);
    storageListeners[0]({ "chatgptModelUsageStats.v1": { newValue: updatedStats } }, "local");
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    if (typeof previousHandler === "undefined") {
      delete globalThis.ChatGPTUsageDashboardMessageHandler;
    } else {
      globalThis.ChatGPTUsageDashboardMessageHandler = previousHandler;
    }
    if (typeof previousChrome === "undefined") {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
    if (typeof previousDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }

  assert.equal(usageGetCount, 2);
  assert.match(container.innerHTML, /class="usage-feature-row"/);
  assert.match(container.innerHTML, /Web search/);
  assert.match(container.innerHTML, /Web search[\s\S]*5/);
  assert.match(container.innerHTML, /class="usage-param-row"/);
  assert.match(container.innerHTML, /reasoning\.effort=high/);
  assert.match(container.innerHTML, /web_search_options\.search_context_size=low/);
});

test("custom date controls render only inside the usage view", () => {
  const state = {
    language: "en",
    activeView: "chart",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    selectedModels: { "future-family-2026-thinking": true },
    stats: createStats()
  };

  const chartHtml = dashboard.renderActiveView(state, ["future-family-2026-thinking"]);
  assert.match(chartHtml, /usage-date-controls/);
  assert.match(chartHtml, /Custom dates/);
  assert.match(chartHtml, /viewBox="0 0 360 192"/);
  assert.doesNotMatch(chartHtml, /usage-event-text-list/);
  assert.doesNotMatch(chartHtml, /Recent records/);

  state.activeView = "status";
  state.openaiStatus = {
    sourceUrl: "https://status.openai.com/",
    status: { indicator: "none", description: "All Systems Operational" },
    components: []
  };
  assert.doesNotMatch(dashboard.renderActiveView(state, []), /usage-date-controls/);
});

test("exportTargetPlan follows the visible checkbox list and ignores unselected entries", async () => {
  const selected = await dashboard._test.exportTargetPlan({
    language: "en",
    exportConversationList: [
      { id: "chat-0001", title: "One" },
      { id: "chat-0002", title: "Two" },
      { id: "chat-0003", title: "Three" }
    ],
    exportSelected: { "chat-0001": true, "chat-0002": false, "chat-0003": true }
  });
  assert.deepEqual(selected.ids, ["chat-0001", "chat-0003"]);
  assert.equal(selected.complete, true);
});

test("export requires an explicit list selection and enables formats only after selection", async () => {
  const state = {
    language: "en",
    activeView: "export",
    exportConversationList: [
      { id: "chat-0001", title: "One" },
      { id: "chat-0002", title: "Two" }
    ],
    exportSelected: { "stale-not-listed": true }
  };

  const emptyHtml = dashboard.renderActiveView(state, []);
  assert.match(emptyHtml, /data-export-format="json" disabled/);
  await assert.rejects(
    dashboard._test.exportTargetPlan(state),
    /Select at least one conversation to export/
  );

  state.exportSelected["chat-0002"] = true;
  const selectedHtml = dashboard.renderActiveView(state, []);
  assert.match(selectedHtml, /1 selected/);
  assert.doesNotMatch(selectedHtml, /data-export-format="json" disabled/);
  assert.deepEqual((await dashboard._test.exportTargetPlan(state)).ids, ["chat-0002"]);
});

test("export checkbox changes update only existing controls without rebuilding or scrolling the view", () => {
  const conversationOne = new DashboardTestElement({ "data-export-conv": "chat-0001" });
  const conversationTwo = new DashboardTestElement({ "data-export-conv": "chat-0002" });
  const count = new DashboardTestElement({ selector: ".usage-export-selcount" });
  const format = new DashboardTestElement({ "data-export-format": "json", disabled: true });
  const selectAll = new DashboardTestElement({ "data-export-selectall": "" });
  const selectNone = new DashboardTestElement({ "data-export-selectnone": "" });
  const nodes = [conversationOne, conversationTwo, count, format, selectAll, selectNone];
  const originalHtml = "<section>keep-this-view-instance</section>";
  const container = {
    innerHTML: originalHtml,
    scrollTop: 137,
    querySelector(selector) {
      if (selector === ".usage-export-selcount") return count;
      if (selector === "[data-export-selectall]") return selectAll;
      if (selector === "[data-export-selectnone]") return selectNone;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-export-conv]") return [conversationOne, conversationTwo];
      if (selector === "[data-export-format]") return [format];
      if (selector === "[data-export-selectall],[data-export-selectnone]") return [selectAll, selectNone];
      if (selector === "[data-view-tab]" || selector === "[data-model-toggle]") return [];
      return nodes.filter((node) => node.getAttribute("selector") === selector);
    }
  };
  const state = {
    language: "en",
    container,
    options: {},
    exportConversationList: [
      { id: "chat-0001", title: "One" },
      { id: "chat-0002", title: "Two" }
    ],
    exportSelected: {},
    exportBusy: false
  };

  dashboard._test.bindEvents(state);
  conversationOne.checked = true;
  conversationOne.dispatch("change");
  assert.deepEqual(state.exportSelected, { "chat-0001": true });
  assert.equal(count.textContent, "1 selected");
  assert.equal(format.disabled, false);
  assert.equal(container.innerHTML, originalHtml);
  assert.equal(container.scrollTop, 137);

  selectAll.dispatch("click");
  assert.deepEqual(state.exportSelected, { "chat-0001": true, "chat-0002": true });
  assert.equal(conversationOne.checked, true);
  assert.equal(conversationTwo.checked, true);
  assert.equal(count.textContent, "2 selected");
  assert.equal(container.innerHTML, originalHtml);
  assert.equal(container.scrollTop, 137);

  selectNone.dispatch("click");
  assert.deepEqual(state.exportSelected, {});
  assert.equal(conversationOne.checked, false);
  assert.equal(conversationTwo.checked, false);
  assert.equal(count.textContent, "0 selected");
  assert.equal(format.disabled, true);
  assert.equal(container.innerHTML, originalHtml);
  assert.equal(container.scrollTop, 137);
});

test("the current conversation is first and selected only on the first export-list load", () => {
  const container = new DashboardTestContainer();
  const state = {
    container,
    options: { surface: "page" },
    language: "en",
    activeView: "export",
    startDate: "2026-08-01",
    endDate: "2026-08-22",
    selectedModels: {},
    knownModels: {},
    modelSelectionInitialized: true,
    stats: {
      totals: {},
      byDate: {},
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      featuresByModel: {},
      parametersByModel: {},
      relationsByModel: {},
      events: []
    },
    exportSelected: {},
    exportSelectionInitialized: false,
    exportBusy: false,
    statusText: "",
    statusError: false
  };
  const result = {
    currentConversationId: "chat-current",
    conversations: [
      { id: "chat-old", title: "Older", updateTime: "2026-08-22T16:00:00.000Z" },
      { id: "chat-current", title: "Current", updateTime: "2026-08-22T15:00:00.000Z" }
    ],
    complete: true,
    source: "account"
  };

  dashboard._test.applyExportConversationList(state, result);
  assert.deepEqual(state.exportConversationList.map((item) => item.id), ["chat-current", "chat-old"]);
  assert.deepEqual(state.exportSelected, { "chat-current": true });
  assert.match(container.innerHTML, /Current chat/);

  state.exportSelected = {};
  dashboard._test.applyExportConversationList(state, result);
  assert.deepEqual(state.exportSelected, {}, "a user-cleared current conversation stays cleared on refresh");
});

test("export view reports an unavailable account index instead of showing an unexplained empty list", () => {
  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "export",
    exportConversationList: [],
    exportConversationMeta: {
      complete: false,
      source: "unavailable",
      warnings: [{ scope: "account", error: "no-tab" }]
    }
  }, []);

  assert.match(html, /No account conversations are available to export/);
  assert.match(html, /could not be read/);
  assert.match(html, /usage-export-warning/);
});

test("export view reports account-read failure when the sidebar fallback is also empty", () => {
  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "export",
    exportConversationList: [],
    exportConversationMeta: {
      complete: false,
      source: "sidebar",
      warnings: [{ scope: "account", error: "history request failed" }]
    }
  }, []);

  assert.match(html, /No account conversations are available to export/);
  assert.match(html, /could not be read/);
  assert.match(html, /usage-export-warning/);
});

test("conversation collection cannot be complete while it contains failures", () => {
  const normalized = dashboard._test.normalizeConversationCollection({
    conversations: [{ id: "chat-0001", messages: [{ role: "user", text: "ok" }] }],
    failures: [{ id: "chat-0002", error: "unavailable" }],
    requestedCount: 2
  });

  assert.equal(normalized.complete, false);
  assert.equal(normalized.requestedCount, 2);
});

test("multi-conversation archive contains separate files and a machine-readable integrity report", async () => {
  let downloaded = null;
  const archiveExporter = Object.assign({}, exporter, {
    downloadBlob(blob, filename) {
      downloaded = { blob, filename };
    }
  });
  const state = {
    language: "en",
    container: { querySelector: () => null }
  };

  await dashboard._test.finishConversationArchive(
    state,
    archiveExporter,
    [
      { name: "First chat.md", content: "# First\n" },
      { name: "Second chat.md", content: "# Second\n" }
    ],
    "markdown",
    { requestedCount: 2, complete: true, failures: [], warnings: [] },
    2,
    []
  );

  assert.ok(downloaded);
  assert.match(downloaded.filename, /^chatgpt-conversations-markdown-\d{4}-\d{2}-\d{2}\.zip$/);
  const buffer = Buffer.from(await downloaded.blob.arrayBuffer());
  const entries = {};
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries[name] = buffer.subarray(dataStart, dataStart + size);
    offset = dataStart + size;
  }

  assert.equal(entries["First chat.md"].toString("utf8"), "# First\n");
  assert.equal(entries["Second chat.md"].toString("utf8"), "# Second\n");
  const report = JSON.parse(entries["_export-report.json"].toString("utf8"));
  assert.equal(report.requestedConversationCount, 2);
  assert.equal(report.exportedConversationCount, 2);
  assert.equal(report.exportedFileCount, 2);
  assert.equal(report.failedConversationCount, 0);
  assert.equal(report.complete, true);
});

test("archive integrity report cannot be complete when collection warnings exist", async () => {
  let downloaded = null;
  const archiveExporter = Object.assign({}, exporter, {
    downloadBlob(blob, filename) {
      downloaded = { blob, filename };
    }
  });
  const state = {
    language: "en",
    options: { surface: "page" },
    container: { querySelector: () => null }
  };

  await dashboard._test.finishConversationArchive(
    state,
    archiveExporter,
    [{ name: "Recovered chat.md", content: "# Recovered\n" }],
    "markdown",
    {
      requestedCount: 1,
      complete: false,
      failures: [],
      warnings: [{ scope: "rendered-page-fallback", error: "Completeness could not be verified." }]
    },
    1,
    []
  );

  const buffer = Buffer.from(await downloaded.blob.arrayBuffer());
  let offset = 0;
  let report = null;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (name === "_export-report.json") {
      report = JSON.parse(buffer.subarray(dataStart, dataStart + size).toString("utf8"));
    }
    offset = dataStart + size;
  }

  assert.ok(report);
  assert.equal(report.complete, false);
  assert.equal(report.failedConversationCount, 0);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].scope, "rendered-page-fallback");
});

test("multi-conversation export keeps requested order and never archives an unrequested result", async () => {
  let downloaded = null;
  const previousCollector = globalThis.__chatgptUsageCollectMany;
  globalThis.__chatgptUsageCollectMany = async () => ({
    conversations: [
      { id: "secret-0003", title: "Secret", messages: [{ id: "s1", role: "user", text: "must not export" }] },
      { id: "chat-0002", title: "Two", messages: [{ id: "m2", role: "user", text: "second" }] },
      { id: "chat-0001", title: "One", messages: [{ id: "m1", role: "user", text: "first" }] },
      { id: "chat-0001", title: "Duplicate", messages: [{ id: "m3", role: "user", text: "duplicate" }] }
    ],
    failures: [],
    requestedCount: 2,
    complete: true
  });
  const archiveExporter = Object.assign({}, exporter, {
    downloadBlob(blob, filename) {
      downloaded = { blob, filename };
    }
  });
  const state = {
    language: "en",
    options: { surface: "page" },
    container: { querySelector: () => null }
  };

  try {
    await dashboard._test.downloadConversationArchiveByIds(
      state,
      archiveExporter,
      { ids: ["chat-0001", "chat-0002"], complete: true, warnings: [] },
      "json"
    );
  } finally {
    if (typeof previousCollector === "undefined") {
      delete globalThis.__chatgptUsageCollectMany;
    } else {
      globalThis.__chatgptUsageCollectMany = previousCollector;
    }
  }

  assert.ok(downloaded);
  const buffer = Buffer.from(await downloaded.blob.arrayBuffer());
  const names = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    offset = dataStart + size;
  }

  assert.deepEqual(names, ["One.json", "Two.json", "_export-report.json"]);
  assert.doesNotMatch(buffer.toString("utf8"), /Secret|must not export|Duplicate|duplicate/);
});

test("multi-conversation PNG archive keeps exactly one PNG per selected conversation", async () => {
  let downloaded = null;
  const previousCollector = globalThis.__chatgptUsageCollectMany;
  const previousDocument = globalThis.document;
  globalThis.document = { createElement() { return {}; } };
  globalThis.__chatgptUsageCollectMany = async () => ({
    conversations: [
      {
        id: "chat-paged",
        title: "Paged",
        messages: [{ id: "m1", role: "assistant", text: "long answer" }]
      },
      {
        id: "chat-second",
        title: "Second",
        messages: [{ id: "m2", role: "assistant", text: "second answer" }]
      }
    ],
    failures: [],
    requestedCount: 2,
    complete: true
  });
  let pngBuildCount = 0;
  const archiveExporter = Object.assign({}, exporter, {
    buildPngBlobFromConversations() {
      pngBuildCount += 1;
      return Promise.resolve(new Blob([Uint8Array.from([137, 80, 78, 71, pngBuildCount])], { type: "image/png" }));
    },
    downloadBlob(blob, filename) {
      downloaded = { blob, filename };
    }
  });
  const state = {
    language: "en",
    options: { surface: "page" },
    container: { querySelector: () => null }
  };

  try {
    await dashboard._test.downloadConversationArchiveByIds(
      state,
      archiveExporter,
      { ids: ["chat-paged", "chat-second"], complete: true, warnings: [] },
      "png"
    );
  } finally {
    if (typeof previousCollector === "undefined") {
      delete globalThis.__chatgptUsageCollectMany;
    } else {
      globalThis.__chatgptUsageCollectMany = previousCollector;
    }
    if (typeof previousDocument === "undefined") {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }

  assert.ok(downloaded);
  const buffer = Buffer.from(await downloaded.blob.arrayBuffer());
  const names = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    offset = dataStart + size;
  }

  assert.deepEqual(names, [
    "Paged.png",
    "Second.png",
    "_export-report.json"
  ]);
  assert.equal(pngBuildCount, 2);
});

test("archive filenames use the browser-local calendar date", () => {
  assert.equal(dashboard._test.localExportDateStamp(new Date(2026, 7, 22, 23, 30)), "2026-08-22");
});

test("conversation archive basenames avoid case-insensitive and generated-suffix collisions", () => {
  const bases = dashboard._test.uniqueConversationBases(exporter, [
    { id: "chat-0001", title: "Report" },
    { id: "chat-0002", title: "report" },
    { id: "chat-0003", title: "Report-2" },
    { id: "chat-0004", title: "CON" },
    { id: "chat-0005", title: "con" }
  ]);

  assert.deepEqual(bases, ["Report", "report-2", "Report-2-2", "_CON", "_con-2"]);
  assert.equal(new Set(bases.map((name) => name.toLowerCase())).size, bases.length);
});
