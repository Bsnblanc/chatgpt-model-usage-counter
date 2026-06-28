const assert = require("node:assert/strict");
const test = require("node:test");
const dashboard = require("../src/dashboard");

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

test("dashboard text view keeps exact thinking slug and hides invalid historical labels", () => {
  const html = dashboard.renderModelTextList(createDirtyStats(), { language: "en" });

  assert.match(html, /gpt-5-thinking/);
  assert.match(html, /Clean exact thinking session/);
  ["gpt-5-5-preview", "gpt_5_5", "GPT-5.5", "GPT-5 5", "Unknown model", "Dirty session"].forEach((value) => {
    assert.doesNotMatch(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), value);
  });
});

test("dashboard helpers filter invalid variants and parameter aggregates", () => {
  const variants = dashboard.modelVariants(createDirtyStats(), "gpt-5-thinking");
  const combinations = dashboard.parameterCombinations(createDirtyStats(), "gpt-5-thinking");

  assert.deepEqual(variants.map((variant) => variant.name), ["gpt-5-thinking"]);
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
  assert.match(html, /3 times/);
  assert.doesNotMatch(html, /Event capped session/);
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
    exportConversationList: []
  };

  dashboard._test.render(state);

  // 导出页标题应是 Export,而不是统计页的 "Model usage" + "X total | N selected"(用户:导出界面标题不对)。
  assert.match(container.innerHTML, /<h2>Export<\/h2>/);
  assert.match(container.innerHTML, /Pick conversations/);
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

test("renderModelTextList keeps parameters and conversation index inside each exact model record", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });

  assert.match(html, /usage-model-record/);
  assert.match(html, /future-family-2026-thinking/);
  assert.match(html, /future-family-2026-instant/);
  // 同名变体("调用型号"又写一遍同型号)不再重复显示
  assert.doesNotMatch(html, /usage-variant-row/);
  assert.match(html, /Parameters/);
  assert.match(html, /2 times/);
  assert.match(html, /reasoning.effort=high/);
  assert.match(html, /text.verbosity=medium/);
  assert.doesNotMatch(html, /model=future-family-2026-thinking/);
  assert.match(html, /Features/);
  assert.match(html, /Deep Research/);
  assert.match(html, /Image generation/);
  assert.match(html, /Conversations/);
  assert.match(html, /Thinking conversation/);
  assert.match(html, /Instant conversation/);
  assert.match(html, /usage-record-sessions/);
});

test("renderModelTextList nests the conversation index in the matching exact model record", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const recordStart = html.indexOf('<div class="usage-model-record">');
  const nextRecordStart = html.indexOf('<div class="usage-model-record">', recordStart + 1);
  const modelRecord = nextRecordStart === -1 ? html.slice(recordStart) : html.slice(recordStart, nextRecordStart);

  assert.notEqual(recordStart, -1);
  assert.match(modelRecord, /future-family-2026-thinking/);
  assert.match(modelRecord, /usage-record-sessions/);
  assert.match(modelRecord, /data-session-id="conversation-alpha"/);
  assert.doesNotMatch(modelRecord, /data-session-id="conversation-beta"/);
});

test("model conversation index renders title links without selection controls", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const rowStart = html.indexOf('<div class="usage-record-session-row">');
  const metaStart = html.indexOf("<small>", rowStart);
  const indexRow = html.slice(rowStart, metaStart);

  assert.notEqual(rowStart, -1);
  assert.match(indexRow, /usage-index-number/);
  assert.match(indexRow, /usage-index-link/);
  assert.match(indexRow, /data-session-id="conversation-alpha"/);
  assert.match(indexRow, /Thinking conversation/);
  assert.doesNotMatch(indexRow, /usage-session-titlebar/);
  assert.doesNotMatch(indexRow, /<input\b/);
  assert.doesNotMatch(indexRow, />Open</);
});

test("usage count details keep model index in one flat hierarchy", () => {
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
  assert.match(details, /Parameters/);
  assert.match(details, /Features/);
  assert.match(details, /Conversations/);
  assert.match(details, /usage-record-sessions/);
  assert.doesNotMatch(details, /usage-session-titlebar/);
  assert.match(source, /\.usage-count-record\{[^}]*border:0;[^}]*border-bottom:1px solid var\(--usage-border-divider\);[^}]*background:transparent/);
  assert.match(source, /\.usage-record-session-row\{[^}]*border:0;[^}]*background:transparent/);
  assert.doesNotMatch(source, /\.usage-record-session-row\{[^}]*box-shadow/);
  assert.doesNotMatch(source, /\.usage-record-session-row\{[^}]*border-radius/);
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
  assert.match(html, /reasoning\.effort=high/);
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

test("modelVariants returns exact request model counts", () => {
  const variants = dashboard.modelVariants(createStats(), "future-family-2026-thinking");

  assert.equal(variants.length, 1);
  assert.equal(variants[0].name, "future-family-2026-thinking");
  assert.equal(variants[0].count, 2);
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

  assert.match(html, /ChatGPT web status/);
  assert.match(html, /Partially degraded service/);
  assert.match(html, /Last checked/);
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

