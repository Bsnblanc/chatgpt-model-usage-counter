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
        requestModel: "future-family-2026-thinking",
        responseModel: "future-family-2026-thinking",
        modelParameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high",
          "text.verbosity": "medium"
        },
        usageFeatures: ["deep_research"],
        sourceMode: "chat",
        conversationId: "conversation-alpha",
        pageTitle: "Thinking conversation",
        pageUrl: "https://chatgpt.com/c/conversation-alpha",
        submittedAt: "2026-05-30T15:10:00.000Z"
      },
      {
        model: "future-family-2026-thinking",
        requestModel: "future-family-2026-thinking",
        responseModel: "future-family-2026-thinking",
        modelParameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high",
          "text.verbosity": "medium"
        },
        usageFeatures: ["deep_research"],
        sourceMode: "chat",
        conversationId: "conversation-alpha",
        pageTitle: "Thinking conversation",
        pageUrl: "https://chatgpt.com/c/conversation-alpha",
        submittedAt: "2026-05-30T15:00:00.000Z"
      },
      {
        model: "future-family-2026-instant",
        requestModel: "future-family-2026-instant",
        responseModel: "future-family-2026-instant",
        modelParameters: {
          model: "future-family-2026-instant",
          "reasoning.effort": "medium",
          "text.verbosity": "low"
        },
        usageFeatures: ["image_generation"],
        sourceMode: "chat",
        conversationId: "conversation-beta",
        pageTitle: "Instant conversation",
        pageUrl: "https://chatgpt.com/c/conversation-beta",
        submittedAt: "2026-05-30T14:00:00.000Z"
      }
    ]
  };
}

function createStatisticsModeStats() {
  const date = "2026-08-23";
  const event = (model, requestModel, responseModel, minute) => ({
    model,
    requestModel,
    responseModel,
    modelParameters: {
      model: requestModel,
      "reasoning.effort": "medium"
    },
    requestReasoningEffort: "medium",
    sourceMode: "chat",
    conversationId: `statistics-mode-${minute}`,
    pageTitle: `Statistics mode ${minute}`,
    pageUrl: `https://chatgpt.com/c/statistics-mode-${minute}`,
    submittedAt: `${date}T10:${minute}:00.000Z`
  });

  return {
    totals: {
      "GPT-5.6 Sol": 4,
      "GPT-5.6 Luna": 1
    },
    byDate: {
      [date]: {
        "GPT-5.6 Sol": 4,
        "GPT-5.6 Luna": 1
      }
    },
    models: {
      "GPT-5.6 Sol": {
        label: "GPT-5.6 Sol",
        publicModel: "GPT-5.6 Sol"
      },
      "GPT-5.6 Luna": {
        label: "GPT-5.6 Luna",
        publicModel: "GPT-5.6 Luna"
      }
    },
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {},
    parametersByModel: {},
    relationsByModel: {},
    events: [
      event("GPT-5.6 Sol", "gpt-5-6-thinking", "gpt-5-6-thinking", "00"),
      event("GPT-5.6 Sol", "gpt-5-6-thinking", "gpt-5-6-pro", "01"),
      event("GPT-5.6 Sol", "gpt-5-6-pro", "gpt-5-6-pro", "02"),
      event("GPT-5.6 Sol", "", "gpt-5-6-thinking", "03"),
      event("GPT-5.6 Luna", "gpt-5.6-luna-wm", "", "04")
    ]
  };
}

function renderStatisticsModeDashboard(statisticsMode, language = "en") {
  const container = new DashboardTestContainer();
  const state = {
    container,
    options: { surface: "popup" },
    language,
    activeView: "chart",
    statisticsMode,
    sourceModeFilter: "all",
    loading: false,
    stats: createStatisticsModeStats(),
    selectedModels: {},
    knownModels: {},
    startDate: "2026-08-23",
    endDate: "2026-08-23",
    statusText: "",
    statusError: false,
    statusScope: "global",
    showLineChart: true,
    showDonutChart: false,
    showTrendChart: true,
    showTextStatistics: true
  };

  dashboard._test.render(state);
  return { container, state };
}

function usageModelChips(html) {
  return Array.from(String(html || "").matchAll(
    /<label class="usage-chart-legend-row([^"]*)"([^>]*)>([\s\S]*?)<\/label>/g
  )).map((match) => {
    const classes = match[1];
    const attributes = match[2];
    const body = match[3];
    const input = body.match(/<input\b([^>]*\bdata-model-toggle="([^"]+)"[^>]*)>/);
    const label = body.match(/<span style="color:([^"]+)">([^<]+)<\/span>/);
    const count = body.match(/<b>([^<]+)<\/b>/);
    const percentage = body.match(/<small[^>]*>([^<]*)<\/small>/);
    return {
      key: input?.[2] || attributes.match(/\bdata-chart-model="([^"]+)"/)?.[1] || "",
      label: label?.[2] || "",
      count: count?.[1] || "",
      percentage: percentage?.[1] || "",
      color: label?.[1] || attributes.match(/--series:([^"]+)/)?.[1] || "",
      active: /\bactive\b/.test(classes),
      checked: Boolean(input && /\bchecked\b/.test(input[1]))
    };
  });
}

function usageCountRecords(html) {
  const source = String(html || "");
  const listStart = source.indexOf('<div class="usage-count-list">');
  if (listStart < 0) {
    return [];
  }
  const list = source.slice(listStart);
  const starts = Array.from(list.matchAll(
    /<(?:details)\b[^>]*class="[^"]*\busage-count-record\b[^"]*"[^>]*>|<(?:section)\b[^>]*class="[^"]*\busage-internal-request\b[^"]*"[^>]*>/g
  ));
  return starts.map((match, index) => {
    const start = match.index;
    const record = list.slice(start, starts[index + 1] === undefined ? list.length : starts[index + 1].index);
    const mappedHeading = record.match(/<summary class="usage-count-row">[\s\S]*?<strong(?:\s+[^>]*)?>([^<]+)<\/strong>/);
    const internalHeading = record.match(
      /<div class="usage-internal-request-head">[\s\S]*?<span class="usage-internal-model-copy">[\s\S]*?<code(?:\s+[^>]*)?>([^<]+)<\/code>/
    );
    return {
      heading: mappedHeading?.[1] || internalHeading?.[1] || "",
      html: record
    };
  });
}

function usageCountRecord(html, heading) {
  return usageCountRecords(html).find((record) => record.heading === heading);
}

function usageCountRecordTotal(record) {
  const html = record && record.html || "";
  const mapped = html.match(/usage-count-numbers"><b>(\d+)\s/);
  const internal = html.match(
    /<div class="usage-internal-request-head">[\s\S]*?<b class="usage-internal-count">(\d+)\s/
  );
  return Number(mapped?.[1] || internal?.[1] || 0);
}

function chartPointTotals(html) {
  const totals = {};
  for (const match of String(html || "").matchAll(/<circle\b([^>]*\bclass="usage-point"[^>]*)>/g)) {
    const attributes = match[1];
    const model = attributes.match(/\bdata-model="([^"]+)"/)?.[1] || "";
    const value = Number(attributes.match(/\bdata-value="([^"]+)"/)?.[1]);
    if (model && Number.isFinite(value)) {
      totals[model] = (totals[model] || 0) + value;
    }
  }
  return totals;
}

function visibleUsageText(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:[a-z]+|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function utcDateKey(date = new Date()) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
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
    this.tagName = String(attributes.tagName || "BUTTON").toUpperCase();
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

  dispatch(type, event = {}) {
    if (this.listeners[type]) {
      this.listeners[type]({
        target: this,
        key: event.key,
        preventDefault() {},
        stopPropagation() {},
        ...event
      });
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

    const statisticsModeButtons = html.matchAll(
      /<button\b([^>]*\bdata-statistics-mode="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g
    );
    for (const match of statisticsModeButtons) {
      const attributes = match[1];
      this.nodes.push(new DashboardTestElement({
        selector: "[data-statistics-mode]",
        "data-statistics-mode": match[2],
        class: attributes.match(/\bclass="([^"]*)"/)?.[1] || "",
        "aria-pressed": attributes.match(/\baria-pressed="([^"]*)"/)?.[1] || "",
        textContent: match[3].replace(/<[^>]+>/g, "")
      }));
    }

    const themeModeButtons = html.matchAll(
      /<button\b([^>]*\bdata-theme-select="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g
    );
    for (const match of themeModeButtons) {
      const attributes = match[1];
      this.nodes.push(new DashboardTestElement({
        selector: "[data-theme-select]",
        "data-theme-select": match[2],
        class: attributes.match(/\bclass="([^"]*)"/)?.[1] || "",
        "aria-pressed": attributes.match(/\baria-pressed="([^"]*)"/)?.[1] || "",
        textContent: match[3].replace(/<[^>]+>/g, "")
      }));
    }

    const viewButtons = html.matchAll(
      /<button\b([^>]*\bdata-view-tab="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g
    );
    for (const match of viewButtons) {
      const attributes = match[1];
      this.nodes.push(new DashboardTestElement({
        selector: "[data-view-tab]",
        "data-view-tab": match[2],
        class: attributes.match(/\bclass="([^"]*)"/)?.[1] || "",
        "aria-selected": attributes.match(/\baria-selected="([^"]*)"/)?.[1] || "",
        textContent: match[3].replace(/<[^>]+>/g, "")
      }));
    }

    const statisticsSectionInputs = html.matchAll(
      /<input\b([^>]*\bdata-statistics-section="([^"]+)"[^>]*)>/g
    );
    for (const match of statisticsSectionInputs) {
      const attributes = match[1];
      this.nodes.push(new DashboardTestElement({
        selector: "[data-statistics-section]",
        "data-statistics-section": match[2],
        checked: /\bchecked\b/.test(attributes)
      }));
    }

    const modelToggleInputs = html.matchAll(
      /<input\b([^>]*\bdata-model-toggle="([^"]+)"[^>]*)>/g
    );
    for (const match of modelToggleInputs) {
      const attributes = match[1];
      this.nodes.push(new DashboardTestElement({
        tagName: "INPUT",
        selector: "[data-model-toggle]",
        "data-model-toggle": match[2],
        checked: /\bchecked\b/.test(attributes)
      }));
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
    requestModel: "future-family-2026-thinking",
    responseModel: "future-family-2026-thinking",
    modelParameters: { model: "future-family-2026-thinking" },
    usageFeatures: ["canvas"],
    sourceMode: "chat",
    submittedAt: "2026-05-30T15:20:00.000Z"
  });

  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "chart",
    loading: false,
    stats,
    selectedModels: { "future-family-2026-thinking": true },
    startDate: "2026-05-30",
    endDate: "2026-05-30"
  }, ["future-family-2026-thinking"]);

  assert.match(html, /usage-count-features[\s\S]*Canvas <b>1<\/b>/);
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

test("dashboard does not infer range feature counts from all-time aggregates", () => {
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

  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "chart",
    loading: false,
    stats,
    selectedModels: { [model]: true },
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  }, [model]);

  assert.doesNotMatch(html, /Web search/);
  assert.doesNotMatch(html, /usage-feature-row|<span class="usage-record-label">Features<\/span>/);
});

test("dashboard model rows show one count without repeating range, all-time, or today labels", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.totals[model] = 5;
  stats.byDate["2026-06-03"] = { [model]: 2 };
  const html = dashboard.renderModelTextList(stats, {
    language: "en",
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  });

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2 times<\/b>/);
  assert.doesNotMatch(html, /Range 2|All time 5|Today/);
});

test("dashboard does not assign all-time sessions to a selected range without dated relation evidence", () => {
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

  assert.doesNotMatch(html, /Stored session outside event cache/);
  assert.match(html, /Historical records not linked/);
  assert.match(html, /No conversations for this record/);
});

test("dashboard does not infer a selected-range conversation from firstSubmittedAt alone", () => {
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

  assert.doesNotMatch(html, /Stored session first date in range/);
  assert.match(html, /Historical records not linked/);
});

test("dashboard preserves an unlinked remainder without inflating a dated conversation", () => {
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
      requestModel: model,
      responseModel: model,
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

  assert.match(html, /Event capped session/);
  assert.match(html, /Historical records not linked/);
  assert.doesNotMatch(html, /Stored capped session/);
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

test("dashboard does not show lifetime feature pills as selected-range counts", () => {
  const stats = createStats();
  const model = "future-family-2026-thinking";
  stats.byDate["2026-06-03"] = { [model]: 1 };
  stats.events = [];
  stats.featuresByModel[model].features.web_search = {
    id: "web_search",
    count: 1,
    lastSubmittedAt: "2026-06-03T09:00:00.000Z"
  };

  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "chart",
    loading: false,
    stats,
    selectedModels: { [model]: true },
    startDate: "2026-06-03",
    endDate: "2026-06-03"
  }, [model]);

  assert.match(html, /future-family-2026-thinking/);
  assert.doesNotMatch(html, /Web search/);
  assert.doesNotMatch(html, /usage-feature-row|<span class="usage-record-label">Features<\/span>/);
  assert.doesNotMatch(html, /Deep research/);
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
  stats.events[0].usageFeatures = ["image_generation"];

  const visibleModels = [
    "image-2",
    "image-1",
    "dall-e",
    "future-family-2026-thinking",
    "future-family-2026-instant",
    "gpt-image"
  ];
  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "chart",
    loading: false,
    stats,
    selectedModels: Object.fromEntries(visibleModels.map((model) => [model, true])),
    startDate: "2026-05-30",
    endDate: "2026-05-30"
  }, visibleModels);

  imageModels.forEach((model) => {
    assert.match(html, new RegExp(`data-model-toggle="${model}"`), `${model} is available in the shared legend`);
    assert.match(
      html,
      new RegExp(`<strong style="color:[^"]+">${model}<\\/strong>`),
      `${model} remains a real text-statistics model row`
    );
  });
  assert.match(html, /usage-count-features[\s\S]*Image generation <b>1<\/b>/);
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

test("popup theme: the shared manual theme mode drives popup CSS variables", () => {
  const applied = {};
  const popupEl = { style: { setProperty(name, value) { applied[name] = value; } } };
  const container = { querySelector(sel) { return sel === ".usage-dashboard-popup" ? popupEl : null; } };
  const state = { options: { surface: "popup" }, container, themeMode: "dark" };

  dashboard._test.applyPopupThemeVariables(state);
  // 暗色:surface-page 与 surface-panel 同为 #2a2b32(原来 page 是 #1a1a2e navy,与页面内面板有色差);
  // 统一后弹窗与页面内面板背景真正一致,且不是纯黑(用户:两个面板色差不一样、别黑)。
  assert.equal(applied["--usage-surface-page"], "#2a2b32");
  assert.equal(applied["--usage-text-primary"], "#ececf1");
  assert.equal(applied["--usage-chart-series-1"], "#60a5fa");
  const darkEffortColors = [
    "--usage-effort-max",
    "--usage-effort-extended",
    "--usage-effort-high",
    "--usage-effort-standard",
    "--usage-effort-medium",
    "--usage-effort-low",
    "--usage-effort-min",
    "--usage-effort-none",
    "--usage-effort-unknown"
  ].map((name) => applied[name]);
  assert.equal(new Set(darkEffortColors).size, darkEffortColors.length);
  assert.equal(applied["color-scheme"], "dark");

  state.themeMode = "light";
  dashboard._test.applyPopupThemeVariables(state);
  // 亮色:surface-page 也统一成 #fbfcfa(原来是 #f7f8f6,与页面内面板 #fbfcfa 有细微色差)
  assert.equal(applied["--usage-surface-page"], "#fbfcfa");
  assert.equal(applied["--usage-text-primary"], "#18201c");
  assert.equal(applied["--usage-chart-series-1"], "#2563eb");
  const lightEffortColors = [
    "--usage-effort-max",
    "--usage-effort-extended",
    "--usage-effort-high",
    "--usage-effort-standard",
    "--usage-effort-medium",
    "--usage-effort-low",
    "--usage-effort-min",
    "--usage-effort-none",
    "--usage-effort-unknown"
  ].map((name) => applied[name]);
  assert.equal(new Set(lightEffortColors).size, lightEffortColors.length);
  assert.equal(applied["color-scheme"], "light");

  // 非 popup 表面不受影响(该函数只服务弹窗)
  const pageApplied = {};
  const pageEl = { style: { setProperty(n, v) { pageApplied[n] = v; } } };
  const pageState = { options: { surface: "page" }, container: { querySelector() { return pageEl; } }, themeMode: "dark" };
  dashboard._test.applyPopupThemeVariables(pageState);
  assert.equal(Object.keys(pageApplied).length, 0);
});

test("theme mode supports system, light, and dark without inheriting the host page theme", () => {
  const previousMatchMedia = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    assert.equal(dashboard._test.normalizeThemeMode("unsupported"), "system");
    assert.equal(dashboard._test.resolveDashboardTheme({ themeMode: "system" }), "dark");
    assert.equal(dashboard._test.resolveDashboardTheme({ themeMode: "light" }), "light");
    assert.equal(dashboard._test.resolveDashboardTheme({ themeMode: "dark" }), "dark");
  } finally {
    globalThis.matchMedia = previousMatchMedia;
  }
});

test("every reasoning effort strength receives its own visual color class", () => {
  const mapped = {
    max: dashboard._test.reasoningEffortClass("max"),
    extended: dashboard._test.reasoningEffortClass("extended"),
    high: dashboard._test.reasoningEffortClass("high"),
    standard: dashboard._test.reasoningEffortClass("standard"),
    medium: dashboard._test.reasoningEffortClass("medium"),
    low: dashboard._test.reasoningEffortClass("low"),
    min: dashboard._test.reasoningEffortClass("min"),
    none: dashboard._test.reasoningEffortClass("none"),
    unknown: dashboard._test.reasoningEffortClass("unspecified")
  };

  assert.deepEqual(mapped, {
    max: "max",
    extended: "extended",
    high: "high",
    standard: "standard",
    medium: "medium",
    low: "low",
    min: "min",
    none: "none",
    unknown: "unknown"
  });
  assert.equal(new Set(Object.values(mapped)).size, Object.keys(mapped).length);
  assert.equal(dashboard._test.reasoningEffortClass("xhigh"), "extended");
  assert.equal(dashboard._test.reasoningEffortClass("minimal"), "min");
});

test("reasoning effort click and keyboard activation filter only matching conversations", () => {
  class FakeNode {
    constructor(attributes = {}) {
      this.attributes = { ...attributes };
      this.listeners = {};
      this.hidden = false;
      this.open = false;
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }

    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }

    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }

    trigger(type, event = {}) {
      this.listeners[type]?.({
        target: this,
        preventDefault() {},
        stopPropagation() {},
        ...event
      });
    }
  }

  const lowRow = new FakeNode({ "data-efforts": "low" });
  const highRow = new FakeNode({ "data-efforts": "high" });
  const mixedRow = new FakeNode({ "data-efforts": "low high" });
  const list = new FakeNode();
  list.insertAdjacentHTML = () => {};
  const details = new FakeNode();
  const lowToken = new FakeNode({ "data-effort-filter": "low" });
  const highToken = new FakeNode({ "data-effort-filter": "high" });
  const rows = [lowRow, highRow, mixedRow];
  const tokens = [lowToken, highToken];
  details.querySelectorAll = (selector) => {
    if (selector === ".usage-relation-conversation,.usage-record-session-row") return rows;
    if (selector === "[data-effort-filter]") return tokens;
    if (selector === ".usage-effort-filter-empty") return [];
    return [];
  };
  details.querySelector = (selector) => {
    if (selector === ".usage-relation-conversation-list,.usage-count-details") return list;
    if (selector === '[data-effort-active="true"]') {
      return tokens.find((token) => token.getAttribute("data-effort-active") === "true") || null;
    }
    return null;
  };
  lowToken.closest = highToken.closest = (selector) =>
    selector === ".usage-internal-response,.usage-model-relation" ? details : null;

  const summary = new FakeNode();
  summary.closest = (selector) =>
    selector === ".usage-internal-response,.usage-model-relation,.usage-count-record" ? details : null;
  const container = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-effort-filter]") return tokens;
      if (selector === ".usage-internal-response-summary,.usage-relation-summary,.usage-count-row") {
        return [summary];
      }
      return [];
    }
  };

  dashboard._test.bindEvents({
    container,
    language: "en",
    stats: createStats(),
    selectedModels: {},
    activeView: "chart"
  });

  lowToken.trigger("click");
  assert.equal(details.open, true);
  assert.equal(lowRow.hidden, false);
  assert.equal(highRow.hidden, true);
  assert.equal(mixedRow.hidden, false);
  assert.equal(lowToken.getAttribute("data-effort-active"), "true");
  assert.equal(highToken.getAttribute("data-effort-active"), null);

  summary.trigger("click", { target: summary });
  assert.equal(rows.every((row) => row.hidden === false), true);
  assert.equal(tokens.every((token) => token.getAttribute("data-effort-active") === null), true);
  assert.equal(details.open, true, "clearing an effort filter keeps the complete list expanded");

  highToken.trigger("keydown", { key: "Enter" });
  assert.equal(lowRow.hidden, true);
  assert.equal(highRow.hidden, false);
  assert.equal(mixedRow.hidden, false);
  assert.equal(highToken.getAttribute("data-effort-active"), "true");
});

test("donut effort drilldown opens matching mapped relations instead of only the outer model group", () => {
  class FakeNode {
    constructor(attributes = {}) {
      this.attributes = { ...attributes };
      this.hidden = false;
      this.open = false;
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }

    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name);
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    removeAttribute(name) {
      delete this.attributes[name];
    }
  }

  const makeDetails = (effort) => {
    const row = new FakeNode({ "data-efforts": effort });
    const token = new FakeNode({ "data-effort-filter": effort });
    const list = new FakeNode();
    list.insertAdjacentHTML = () => {};
    const details = new FakeNode();
    details.matches = (selector) => selector === ".usage-model-relation";
    details.querySelectorAll = (selector) => {
      if (selector === ".usage-relation-conversation,.usage-record-session-row") return [row];
      if (selector === "[data-effort-filter]") return [token];
      if (selector === ".usage-effort-filter-empty") return [];
      return [];
    };
    details.querySelector = (selector) =>
      selector === ".usage-relation-conversation-list,.usage-count-details" ? list : null;
    details.scrollIntoView = () => {};
    return { details, row, token };
  };

  const low = makeDetails("low");
  const high = makeDetails("high");
  const group = new FakeNode();
  group.matches = (selector) => selector === ".usage-mapped-record";
  group.querySelectorAll = (selector) => {
    if (selector === ".usage-model-relation") return [low.details, high.details];
    if (selector === "[data-effort-filter]") return [low.token, high.token];
    return [];
  };
  const donutToken = new FakeNode({ "data-donut-effort": "low" });
  const container = {
    querySelector(selector) {
      return selector.includes("data-mapped-model") ? group : null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-donut-effort],.usage-donut-legend-row[data-effort-filter]") {
        return [donutToken];
      }
      return [];
    }
  };

  dashboard._test.focusDonutEffortConversations({
    container,
    language: "en",
    donutModel: "GPT-5.6 Sol",
    statisticsMode: "mapped",
    showTextStatistics: true
  }, "low");

  assert.equal(group.open, true);
  assert.equal(low.details.open, true);
  assert.equal(high.details.open, false);
  assert.equal(low.row.hidden, false);
  assert.equal(high.row.hidden, true);
  assert.equal(low.token.getAttribute("data-effort-active"), "true");
  assert.equal(donutToken.getAttribute("data-effort-active"), "true");

  const directLowRow = new FakeNode({ "data-efforts": "low" });
  const directHighRow = new FakeNode({ "data-efforts": "high" });
  const directLowToken = new FakeNode({ "data-effort-filter": "low" });
  const directHighToken = new FakeNode({ "data-effort-filter": "high" });
  const directList = new FakeNode();
  directList.insertAdjacentHTML = () => {};
  const directGroup = new FakeNode();
  directGroup.matches = (selector) => selector === ".usage-mapped-record";
  directGroup.querySelectorAll = (selector) => {
    if (selector === ".usage-model-relation") return [];
    if (selector === ".usage-relation-conversation,.usage-record-session-row") {
      return [directLowRow, directHighRow];
    }
    if (selector === "[data-effort-filter]") return [directLowToken, directHighToken];
    if (selector === ".usage-effort-filter-empty") return [];
    return [];
  };
  directGroup.querySelector = (selector) =>
    selector === ".usage-relation-conversation-list,.usage-count-details" ? directList : null;
  directGroup.scrollIntoView = () => {};

  dashboard._test.focusDonutEffortConversations({
    container: {
      querySelector(selector) {
        return selector.includes("data-mapped-model") ? directGroup : null;
      },
      querySelectorAll() {
        return [];
      }
    },
    language: "en",
    donutModel: "GPT-5.6 Sol",
    statisticsMode: "mapped",
    showTextStatistics: true
  }, "low");

  assert.equal(directGroup.open, true);
  assert.equal(directLowRow.hidden, false);
  assert.equal(directHighRow.hidden, true);
  assert.equal(directLowToken.getAttribute("data-effort-active"), "true");
});

function createStatusLayoutHarness(options) {
  const classes = new Set();
  const dashboardStyles = new Map();
  const panelStyles = new Map();
  const clientHeight = Number(options.clientHeight);
  const clientWidth = Number(options.clientWidth);
  const layout = () => options.measure({
    classes,
    columns: Number(dashboardStyles.get("--usage-status-columns") || 1),
    scale: Number(panelStyles.get("zoom") || 1)
  });
  const styleMap = (styles) => ({
    setProperty(name, value) {
      styles.set(name, value);
    },
    removeProperty(name) {
      styles.delete(name);
    }
  });
  const panelNode = {
    get scrollHeight() {
      return Number(layout().panelHeight);
    },
    get scrollWidth() {
      return Number(layout().panelWidth || clientWidth);
    },
    style: styleMap(panelStyles)
  };
  const dashboardNode = {
    clientHeight,
    clientWidth,
    get scrollHeight() {
      return Number(layout().height);
    },
    get scrollWidth() {
      return Number(layout().width || clientWidth);
    },
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      }
    },
    querySelector(selector) {
      return selector === ".usage-view-panel" ? panelNode : null;
    },
    style: styleMap(dashboardStyles)
  };
  return { classes, dashboardNode, dashboardStyles, panelNode, panelStyles };
}

function fitStatusHarness(harness, surface = "popup") {
  dashboard._test.fitStatusPanel({
    activeView: "status",
    options: { surface },
    container: {
      querySelector(selector) {
        return selector === ".usage-dashboard" ? harness.dashboardNode : null;
      }
    }
  });
}

test("status layout reaches a readable three-column fit before dense mode", () => {
  const harness = createStatusLayoutHarness({
    clientHeight: 300,
    clientWidth: 400,
    measure({ classes, columns }) {
      let height = 420;
      if (classes.has("usage-status-compact")) height = 360;
      if (classes.has("usage-status-columns")) {
        height = columns === 2 ? 330 : 280;
      }
      return { height, width: 400, panelHeight: height - 80, panelWidth: 400 };
    }
  });

  fitStatusHarness(harness);

  assert.equal(harness.classes.has("usage-status-compact"), true);
  assert.equal(harness.classes.has("usage-status-columns"), true);
  assert.equal(harness.dashboardStyles.get("--usage-status-columns"), "3");
  assert.equal(harness.classes.has("usage-status-dense"), false);
  assert.equal(harness.dashboardNode.scrollHeight <= harness.dashboardNode.clientHeight + 1, true);
});

test("status layout enables dense mode only after the three-column compact layout still overflows", () => {
  const harness = createStatusLayoutHarness({
    clientHeight: 300,
    clientWidth: 400,
    measure({ classes, columns }) {
      let height = 440;
      if (classes.has("usage-status-compact")) height = 390;
      if (classes.has("usage-status-columns")) height = columns === 2 ? 360 : 330;
      if (classes.has("usage-status-dense")) {
        height = classes.has("usage-status-columns")
          ? (columns === 2 ? 315 : 292)
          : 335;
      }
      return { height, width: 400, panelHeight: height - 80, panelWidth: 400 };
    }
  });

  fitStatusHarness(harness, "page");

  assert.equal(harness.classes.has("usage-status-dense"), true);
  assert.equal(harness.classes.has("usage-status-ultra"), false);
  assert.equal(harness.dashboardStyles.get("--usage-status-columns"), "3");
  assert.equal(harness.dashboardNode.scrollHeight <= harness.dashboardNode.clientHeight + 1, true);
});

test("status layout uses ultra mode and a fourth column only when dense mode cannot fit", () => {
  const harness = createStatusLayoutHarness({
    clientHeight: 300,
    clientWidth: 400,
    measure({ classes, columns }) {
      let height = 470;
      if (classes.has("usage-status-compact")) height = 420;
      if (classes.has("usage-status-columns")) height = columns === 2 ? 390 : 350;
      if (classes.has("usage-status-dense")) height = columns === 2 ? 350 : 325;
      if (classes.has("usage-status-ultra")) height = columns >= 4 ? 294 : 315;
      return { height, width: 400, panelHeight: height - 80, panelWidth: 400 };
    }
  });

  fitStatusHarness(harness);

  assert.equal(harness.classes.has("usage-status-ultra"), true);
  assert.equal(harness.dashboardStyles.get("--usage-status-columns"), "4");
  assert.equal(harness.classes.has("usage-status-scaled"), false);
  assert.equal(harness.dashboardNode.scrollHeight <= harness.dashboardNode.clientHeight + 1, true);
});

test("status layout fits 430x600 popup and page surfaces without adding a status scrollbar", () => {
  ["popup", "page"].forEach((surface) => {
    const harness = createStatusLayoutHarness({
      clientHeight: 600,
      clientWidth: 430,
      measure({ classes, columns }) {
        let panelHeight = 620;
        if (classes.has("usage-status-compact")) panelHeight = 570;
        if (classes.has("usage-status-columns")) {
          panelHeight = columns === 2 ? 420 : 330;
        }
        return {
          height: 80 + panelHeight,
          width: 430,
          panelHeight,
          panelWidth: 430
        };
      }
    });

    fitStatusHarness(harness, surface);

    assert.equal(harness.dashboardNode.scrollHeight <= harness.dashboardNode.clientHeight + 1, true);
    assert.equal(harness.dashboardNode.scrollWidth <= harness.dashboardNode.clientWidth + 1, true);
    assert.equal(harness.panelStyles.has("zoom"), false);
  });
});

test("status layout applies a controlled body-only fit after ultra mode without clipping rows", () => {
  const fixedHeight = 80;
  const panelHeight = 260;
  const harness = createStatusLayoutHarness({
    clientHeight: 300,
    clientWidth: 400,
    measure({ scale }) {
      return {
        height: fixedHeight + panelHeight * scale,
        width: 400,
        panelHeight: panelHeight * scale,
        panelWidth: 400
      };
    }
  });

  fitStatusHarness(harness);

  const scale = Number(harness.panelStyles.get("zoom"));
  assert.equal(harness.classes.has("usage-status-ultra"), true);
  assert.equal(harness.classes.has("usage-status-scaled"), true);
  assert.ok(scale >= 0.82 && scale < 1);
  assert.equal(harness.dashboardStyles.has("zoom"), false);
  assert.ok(Number(harness.dashboardStyles.get("--usage-status-font-compensation")) > 1);
  assert.equal(harness.dashboardNode.scrollHeight <= harness.dashboardNode.clientHeight + 1, true);
  assert.equal(harness.dashboardNode.scrollWidth <= harness.dashboardNode.clientWidth + 1, true);
});

test("status layout resets stale fit state when the same surface is rendered again", () => {
  const classes = new Set();
  const dashboardStyles = new Map([
    ["--usage-status-columns", "4"],
    ["--usage-status-font-compensation", "1.2"],
    ["zoom", "0.8"]
  ]);
  const panelStyles = new Map([["zoom", "0.8"]]);
  const dashboardNode = {
    clientHeight: 300,
    clientWidth: 400,
    scrollWidth: 400,
    scrollHeight: 240,
    classList: {
      add(...names) {
        names.forEach((name) => classes.add(name));
      },
      remove(...names) {
        names.forEach((name) => classes.delete(name));
      }
    },
    querySelector(selector) {
      return selector === ".usage-view-panel"
        ? {
          scrollHeight: 160,
          scrollWidth: 400,
          style: {
            removeProperty(name) {
              panelStyles.delete(name);
            }
          }
        }
        : null;
    },
    style: {
      setProperty(name, value) {
        dashboardStyles.set(name, value);
      },
      removeProperty(name) {
        dashboardStyles.delete(name);
      }
    }
  };
  classes.add("usage-status-compact");
  classes.add("usage-status-columns");
  classes.add("usage-status-dense");
  classes.add("usage-status-ultra");
  classes.add("usage-status-scaled");

  dashboard._test.fitStatusPanel({
    activeView: "status",
    container: {
      querySelector(selector) {
        return selector === ".usage-dashboard" ? dashboardNode : null;
      }
    }
  });
  assert.deepEqual(Array.from(classes), []);
  assert.equal(dashboardStyles.has("--usage-status-columns"), false);
  assert.equal(dashboardStyles.has("--usage-status-font-compensation"), false);
  assert.equal(dashboardStyles.has("zoom"), false);
  assert.equal(panelStyles.has("zoom"), false);
});

test("internal statistics order reasoning effort from low to high and keeps units only on the request group", () => {
  const requestModel = "gpt-5-6-thinking";
  const responseModel = "gpt-5-6-thinking";
  const efforts = ["max", "low", "standard", "", "none", "extended", "medium", "min", "high"];
  const stats = createStats();
  stats.totals = { "GPT-5.6 Sol": efforts.length };
  stats.byDate = { "2026-08-23": { "GPT-5.6 Sol": efforts.length } };
  stats.events = efforts.map((effort, index) => ({
    model: "GPT-5.6 Sol",
    requestModel,
    responseModel,
    requestReasoningEffort: effort,
    usageFeatures: index === 0 ? ["web_search"] : [],
    conversationId: "effort-order",
    pageTitle: "Effort order",
    submittedAt: `2026-08-23T10:${String(index).padStart(2, "0")}:00.000Z`
  }));
  const html = dashboard._test.renderModelCountRows({
    language: "en",
    stats,
    statisticsMode: "internal",
    sourceModeFilter: "all",
    startDate: "2026-08-23",
    endDate: "2026-08-23",
    loading: false
  }, [requestModel]);
  const visible = visibleUsageText(html);
  const orderedLabels = ["none", "min", "low", "medium", "standard", "high", "extended", "max", "Unknown"];
  const positions = orderedLabels.map((label) => visible.indexOf(label));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.match(html, /usage-internal-count">9 times<\/b>/);
  assert.match(
    html,
    /usage-internal-response-value"><span class="usage-internal-response-copy"><code style="color:[^"]+">gpt-5-6-thinking<\/code><span class="usage-internal-efforts-inline" aria-label="Reasoning effort">[\s\S]*<\/span><\/span><b class="usage-internal-subcount">9<\/b>/
  );
  assert.doesNotMatch(html, /<span class="usage-record-label">Reasoning effort<\/span>/);
  assert.match(html, /Web search <b>1<\/b>/);
  assert.equal((html.match(/\btimes\b/g) || []).length, 1);
});

test("statistics mode keeps one stable chart title while changing the plotted classification", () => {
  const stats = createStatisticsModeStats();
  ["mapped", "internal"].forEach((statisticsMode) => {
    const models = statisticsMode === "mapped"
      ? ["GPT-5.6 Sol", "GPT-5.6 Luna"]
      : ["gpt-5-6-thinking", "gpt-5-6-pro", "__unknown_request_model__", "gpt-5.6-luna-wm"];
    const html = dashboard.renderActiveView({
      language: "en",
      activeView: "chart",
      statisticsMode,
      startDate: "2026-08-23",
      endDate: "2026-08-23",
      selectedModels: Object.fromEntries(models.map((model) => [model, true])),
      stats
    }, models);

    assert.match(html, /<div class="usage-chart-head"><strong>Model usage trend<\/strong>/);
    assert.doesNotMatch(html, /Mapped model usage trend|Internal request model usage trend/);
  });
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
  assert.doesNotMatch(container.innerHTML, /answered|pending|related conversations|historical records not linked/);
  ["gpt-image", "dall-e", "image-1", "image-2"].forEach((model) => {
    assert.match(container.innerHTML, new RegExp(`data-model-toggle="${model}" checked`), `${model} legend item is selected`);
    assert.match(container.innerHTML, new RegExp(`data-model="${model}"`), `${model} chart series is rendered`);
    assert.match(
      container.innerHTML,
      new RegExp(`<span style="color:[^"]+">${model}<\\/span>`),
      `${model} shared legend label is rendered`
    );
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
  assert.doesNotMatch(container.innerHTML, /Choose one or more conversations from the list/);
  assert.match(container.innerHTML, /data-export-conv="chat-0001"/);
  assert.match(container.innerHTML, /data-export-conv="chat-0002"/);
  assert.match(container.innerHTML, /Archived/);
  assert.match(container.innerHTML, /One selection downloads one file/);
  assert.doesNotMatch(container.innerHTML, /data-export-scope=/);
  assert.match(container.innerHTML, /data-export-format="json" disabled/);
  assert.doesNotMatch(container.innerHTML, /\d+ total \| \d+ selected/);
});

test("popup and page dashboards share aligned header controls and popup spacing", () => {
  const popupContainer = new DashboardTestContainer();
  const pageContainer = new DashboardTestContainer();
  const base = {
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

  dashboard._test.render({
    ...base,
    container: popupContainer,
    options: { surface: "popup" }
  });
  dashboard._test.render({
    ...base,
    container: pageContainer,
    options: { surface: "page", onClose() {} }
  });

  assert.match(popupContainer.innerHTML, /usage-header-action usage-refresh/);
  assert.match(popupContainer.innerHTML, /usage-header-action usage-settings-trigger/);
  assert.equal((popupContainer.innerHTML.match(/class="usage-settings-menu"/g) || []).length, 1);
  assert.doesNotMatch(popupContainer.innerHTML, /usage-language-toggle|data-language-toggle/);
  assert.doesNotMatch(popupContainer.innerHTML, /usage-panel-close/);
  assert.match(pageContainer.innerHTML, /usage-header-action usage-refresh/);
  assert.match(pageContainer.innerHTML, /usage-header-action usage-settings-trigger/);
  assert.equal((pageContainer.innerHTML.match(/class="usage-settings-menu"/g) || []).length, 1);
  assert.doesNotMatch(pageContainer.innerHTML, /usage-language-toggle|data-language-toggle/);
  assert.match(pageContainer.innerHTML, /usage-header-action usage-panel-close/);
  const expectedSettingsOrder = ["language", "theme", "source", "statistics", "sections", "data"];
  [popupContainer.innerHTML, pageContainer.innerHTML].forEach((html) => {
    assert.deepEqual(
      Array.from(html.matchAll(/data-settings-category="([^"]+)"/g), (match) => match[1]),
      expectedSettingsOrder
    );
    expectedSettingsOrder.forEach((category) => {
      assert.match(
        html,
        new RegExp(
          `data-settings-category="${category}"[^>]*><summary>` +
          `[\\s\\S]*?<span class="usage-settings-current"[^>]*>[\\s\\S]*?<\\/span>` +
          `[\\s\\S]*?<span class="usage-settings-arrow"[^>]*>‹<\\/span><\\/summary>`
        ),
        `${category} must keep aligned current-value and arrow columns`
      );
    });
    assert.deepEqual(
      Array.from(html.matchAll(/data-statistics-section="([^"]+)"/g), (match) => match[1]),
      ["line", "donut", "text"]
    );
  });
  ["language", "theme", "source", "statistics", "sections", "data"].forEach((category) => {
    assert.match(popupContainer.innerHTML, new RegExp(`data-settings-category="${category}"`));
    assert.match(pageContainer.innerHTML, new RegExp(`data-settings-category="${category}"`));
  });
  assert.doesNotMatch(popupContainer.innerHTML, /data-settings-category="dates"/);

  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "dashboard.js"), "utf8");
  assert.match(source, /\.usage-dashboard-page\{[^}]*padding:8px/);
  assert.match(source, /\.usage-topline\{[^}]*align-items:center;[^}]*min-height:30px/);
  assert.match(source, /\.usage-header-action\{[^}]*height:30px;[^}]*border:0/);
  assert.match(source, /\.usage-dashboard button,\.usage-dashboard select,\.usage-dashboard input\{font:inherit\}/);
  assert.match(source, /\.usage-settings-item:not\(\.is-closing\):hover>\.usage-settings-submenu,\.usage-settings-item:not\(\.is-closing\):focus-within>\.usage-settings-submenu/);
  assert.match(source, /\.usage-settings-submenu\{[^}]*right:calc\(100% - 1px\)/);
  assert.doesNotMatch(source, /\.usage-dashboard-page \.usage-view-tabs\{/);
  assert.doesNotMatch(source, /\.usage-dashboard-page \.usage-view-panel\{/);

  const popupSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "popup.js"), "utf8");
  assert.match(popupSource, /onLanguageChange[\s\S]*document\.documentElement\.lang/);
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
  assert.doesNotMatch(container.innerHTML, /total ·|answered|pending/);
  assert.match(container.innerHTML, /No model records yet\./);
  assert.doesNotMatch(container.innerHTML, /data-model-toggle=/);
  assert.doesNotMatch(container.innerHTML, /data-model="image-2-image"/);
  assert.doesNotMatch(container.innerHTML, />image-2-image</);
});

test("model toggles are the single chart visibility and legend control", () => {
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

  assert.match(html, /Model usage trend/);
  assert.doesNotMatch(html, /Mapped model usage trend|Internal request model usage trend/);
  assert.match(html, /<small>Count<\/small>/);
  assert.match(html, />Date<\/text>/);
  assert.match(html, /data-model-toggle="future-family-2026-thinking" checked/);
  assert.doesNotMatch(html, />Legend<\/text>|usage-chart-legend-item/);
  assert.ok(Number.isFinite(dateY), "date tick y position should be rendered");
  assert.ok(Number.isFinite(xAxisY), "x-axis label y position should be rendered");
  assert.ok(xAxisY - dateY >= 10, "x-axis label should not overlap date ticks");
});

test("model legend toggles support Enter without relying on checkbox browser defaults", () => {
  const { container, state } = renderStatisticsModeDashboard("mapped");
  const control = container.querySelectorAll("[data-model-toggle]")
    .find((item) => item.getAttribute("data-model-toggle") === "GPT-5.6 Sol");

  assert.ok(control);
  assert.equal(control.checked, true);
  control.dispatch("keydown", { key: "Enter" });
  assert.equal(state.selectedModels["GPT-5.6 Sol"], false);
});

test("model colors stay stable across selection order and align in legend, chart, donut, and text", () => {
  const model = "future-family-2026-instant";
  const fullHtml = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      loading: false,
      stats: createStats(),
      selectedModels: {
        "future-family-2026-thinking": true,
        [model]: true
      },
      showLineChart: true,
      showDonutChart: true,
      showTextStatistics: true,
      startDate: "2026-05-30",
      endDate: "2026-05-30"
    },
    ["future-family-2026-thinking", model]
  );
  const filteredHtml = dashboard.renderActiveView(
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
  const fullLegend = usageModelChips(fullHtml).find((entry) => entry.key === model);
  const filteredLegend = usageModelChips(filteredHtml).find((entry) => entry.key === model);

  assert.ok(fullLegend);
  assert.ok(filteredLegend);
  assert.equal(fullLegend.color, filteredLegend.color, "the full model slug must hash to one stable color");
  assert.equal(fullLegend.active, true);
  assert.equal(fullLegend.checked, true);
  const escapedColor = fullLegend.color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(fullHtml, new RegExp(`fill="${escapedColor}" data-model="${model}"`));
  assert.match(fullHtml, new RegExp(`stroke="${escapedColor}"[^>]*data-donut-model="${model}"`));
  assert.match(fullHtml, new RegExp(`<strong style="color:${escapedColor}">${model}<\\/strong>`));
  assert.equal(
    (fullHtml.match(/class="usage-chart-legend"/g) || []).length,
    2,
    "line and donut charts must each embed the same model toggle legend"
  );
});

test("simultaneously visible models receive distinct stable palette colors", () => {
  const models = Array.from({ length: 12 }, (_, index) => `future-model-${index + 1}`);
  const totals = Object.fromEntries(models.map((model) => [model, 1]));
  const state = {
    language: "en",
    statisticsMode: "mapped",
    sourceModeFilter: "all",
    stats: {
      totals,
      byDate: { "2026-08-24": { ...totals } },
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      parametersByModel: {},
      relationsByModel: {},
      events: []
    },
    selectedModels: Object.fromEntries(models.map((model) => [model, true])),
    startDate: "2026-08-24",
    endDate: "2026-08-24"
  };

  const first = dashboard._test.statisticsColorMap(state);
  const second = dashboard._test.statisticsColorMap({
    ...state,
    selectedModels: Object.fromEntries(models.slice().reverse().map((model) => [model, true]))
  });

  assert.equal(new Set(models.map((model) => first[model])).size, models.length);
  models.forEach((model) => assert.equal(first[model], second[model]));
});

test("chart path and points animate in trajectory order without shifting point positions", () => {
  const model = "future-family-2026-thinking";
  const stats = createStats();
  stats.totals = { [model]: 6 };
  stats.byDate = {
    "2026-05-28": { [model]: 1 },
    "2026-05-29": { [model]: 2 },
    "2026-05-30": { [model]: 3 }
  };
  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "chart",
      loading: false,
      stats,
      selectedModels: { [model]: true },
      startDate: "2026-05-28",
      endDate: "2026-05-30"
    },
    [model]
  );
  const delays = Array.from(
    html.matchAll(/class="usage-point"[^>]*style="--usage-point-delay:([0-9.]+)s"/g),
    (match) => Number(match[1])
  );
  const source = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "src", "dashboard.js"),
    "utf8"
  );

  assert.match(html, /<g class="usage-series"[^>]*><path class="usage-line"/);
  assert.deepEqual(delays, [0.04, 0.3, 0.56]);
  assert.match(html, /<mask id="usage-line-reveal-0"[\s\S]*?<path class="usage-line-mask"[^>]*pathLength="1"/);
  assert.match(html, /<path class="usage-line"[^>]*mask="url\(#usage-line-reveal-0\)"/);
  assert.match(source, /function nearestPathProgress\(path, x, y\)/);
  assert.match(source, /path\.getTotalLength\(\)/);
  assert.match(source, /path\.getPointAtLength\(length\)/);
  assert.match(source, /var progress = nearestPathProgress\(/);
  assert.match(source, /point\.style\.setProperty\("--usage-point-delay", \(progress \* 0\.56\)\.toFixed\(3\) \+ "s"\)/);
  assert.match(source, /\.usage-line-mask\{[^}]*stroke-dasharray:1;[^}]*stroke-dashoffset:1;[^}]*animation:usage-line-reveal \.56s linear/);
  assert.match(source, /\.usage-line\{[^}]*stroke-dasharray:var\(--usage-line-dash,none\)/);
  assert.match(source, /\.usage-point\{[^}]*animation:usage-point-in \.18s ease-out var\(--usage-point-delay,\.06s\)/);
  assert.match(source, /@keyframes usage-point-in\{from\{opacity:0\}to\{opacity:1\}\}/);
  assert.doesNotMatch(source, /@keyframes usage-point-in\{[^}]*transform:/);
});

test("the default date range ends on the current UTC calendar day", () => {
  const today = utcDateKey();
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

test("saved or entered future dates are clamped to the current UTC calendar day", () => {
  const today = utcDateKey();
  const tomorrowDate = new Date();
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = utcDateKey(tomorrowDate);

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
  assert.doesNotMatch(html, /Features|usage-feature-list|usage-feature-row/);
  assert.doesNotMatch(html, />Related conversations · \d+<\/summary>/);
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
  const row = html.match(/<div class="usage-relation-conversation"[^>]*>[\s\S]*?<\/div><\/div>/)?.[0] || "";

  assert.notEqual(row, "");
  assert.match(row, /usage-index-link/);
  assert.match(row, /data-session-id="conversation-alpha"/);
  assert.match(row, /Thinking conversation/);
  assert.doesNotMatch(row, /usage-session-titlebar/);
  assert.doesNotMatch(row, /<input\b/);
  assert.doesNotMatch(row, />Open</);
});

test("relation cards hide the related-conversation label and reveal the list when the card is opened", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const chineseHtml = dashboard.renderModelTextList(createStats(), { language: "zh" });
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "dashboard.js"), "utf8");

  assert.match(
    html,
    /<details class="usage-model-relation(?: legacy-unlinked)?"><summary class="usage-relation-summary" data-relation-toggle aria-label="Related conversations · 1">/
  );
  assert.doesNotMatch(html, />Related conversations · 1<\/summary>/);
  assert.doesNotMatch(chineseHtml, />关联对话 · 1<\/summary>/);
  assert.doesNotMatch(html, /<details class="usage-model-relation" open/);
  assert.match(
    source,
    /\.usage-relation-conversation-list,\.usage-count-details\{display:grid;[^}]*max-height:0;[^}]*opacity:0;[^}]*transform:translateY\(-4px\);[^}]*transition:/
  );
  assert.match(
    source,
    /\.usage-internal-response\[open\]>\.usage-relation-conversation-list,\.usage-model-relation\[open\]>\.usage-relation-conversation-list,\.usage-count-record\[open\]>\.usage-count-details\{max-height:520px;opacity:1;transform:translateY\(0\)\}/
  );
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
  assert.match(html, /<summary class="usage-count-row">/);
  assert.doesNotMatch(html, /data-model-record-toggle/);
  assert.doesNotMatch(html, /usage-count-caret/);
  assert.doesNotMatch(details, /Request model|Response model|Reasoning effort/);
  assert.doesNotMatch(details, />Related conversations · \d+<\/summary>/);
  assert.match(details, /usage-record-session-row/);
  assert.match(details, /Thinking conversation/);
  assert.doesNotMatch(details, /usage-session-titlebar/);
  assert.match(source, /\.usage-count-record\{[^}]*border:0;[^}]*border-bottom:1px solid var\(--usage-border-divider\);[^}]*background:transparent/);
  assert.match(source, /\.usage-mapped-record>\.usage-count-row\{cursor:pointer\}/);
});

test("relation cards omit feature detail rows in both languages while title pills remain", () => {
  ["en", "zh"].forEach((language) => {
    const html = dashboard.renderActiveView(
      {
        language,
        activeView: "chart",
        loading: false,
        stats: createStats(),
        selectedModels: { "future-family-2026-thinking": true },
        startDate: "2026-05-30",
        endDate: "2026-05-30"
      },
      ["future-family-2026-thinking"]
    );
    const details = html.slice(html.indexOf('data-model-record-details="future-family-2026-thinking"'));

    assert.match(html, /usage-count-features/);
    assert.match(html, /Deep Research/);
    assert.doesNotMatch(details, /<span class="usage-record-label">(?:Features|功能)<\/span>/);
    assert.doesNotMatch(details, /usage-feature-row|usage-feature-list/);
  });
});

test("GPTs feature counts stay only in title pills across chart, text, page, and popup surfaces", () => {
  const model = "future-family-2026-thinking";
  const stats = createStats();
  stats.totals = { [model]: 15 };
  stats.byDate = { "2026-05-30": { [model]: 15 } };
  stats.events = Array.from({ length: 15 }, (_, index) => ({
    model,
    requestModel: model,
    responseModel: "future-family-2026-pro",
    requestReasoningEffort: "high",
    usageFeatures: ["gpts"],
    sourceMode: "chat",
    submittedAt: `2026-05-30T15:${String(index).padStart(2, "0")}:00.000Z`
  }));
  stats.featuresByModel = {
    [model]: {
      total: 15,
      features: {
        gpts: {
          id: "gpts",
          count: 15,
          lastSubmittedAt: "2026-05-30T15:10:00.000Z"
        }
      }
    }
  };
  stats.relationsByModel = {
    [model]: {
      relation: {
        requestModel: model,
        responseModel: "future-family-2026-pro",
        count: 15,
        efforts: { high: 15 },
        features: { gpts: 15 },
        conversations: {}
      }
    }
  };

  ["en", "zh"].forEach((language) => {
    const state = {
      language,
      activeView: "chart",
      loading: false,
      stats,
      selectedModels: { [model]: true },
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      statusText: "",
      statusError: false,
      statusScope: "global"
    };
    const chartHtml = dashboard.renderActiveView(state, [model]);
    const textHtml = dashboard.renderModelTextList(stats, state);
    const relationStart = chartHtml.indexOf('<div class="usage-model-relations">');
    const relationHtml = chartHtml.slice(relationStart);

    assert.match(chartHtml, /usage-count-features"><span>GPTs <b>15<\/b><\/span>/);
    assert.match(textHtml, /usage-count-features"><span>GPTs <b>15<\/b><\/span>/);
    assert.doesNotMatch(relationHtml, /<span class="usage-record-label">(?:Features|功能)<\/span>/);
    assert.doesNotMatch(relationHtml, /GPTs 15 (?:times|次)|usage-feature-row|usage-feature-list/);
    assert.doesNotMatch(relationHtml, /(?:Features|功能)[\s\S]*>—</);

    ["popup", "page"].forEach((surface) => {
      const container = new DashboardTestContainer();
      dashboard._test.render({
        ...state,
        container,
        options: surface === "page"
          ? { surface, onClose() {} }
          : { surface }
      });
      const renderedRelation = container.innerHTML.slice(
        container.innerHTML.indexOf('<div class="usage-model-relations">')
      );

      assert.match(container.innerHTML, /usage-count-features"><span>GPTs <b>15<\/b><\/span>/);
      assert.doesNotMatch(renderedRelation, /<span class="usage-record-label">(?:Features|功能)<\/span>/);
      assert.doesNotMatch(renderedRelation, /GPTs 15 (?:times|次)|usage-feature-row|usage-feature-list/);
    });
  });
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
  assert.match(container.innerHTML, /<details class="usage-count-record usage-mapped-record"/);
  assert.match(container.innerHTML, /<summary class="usage-count-row">/);
  assert.doesNotMatch(container.innerHTML, /<button class="usage-count-row"/);
  assert.doesNotMatch(container.innerHTML, /<div class="usage-count-row">/);
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
    requestModel: "future-family-2026-thinking",
    responseModel: "future-family-2026-thinking",
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

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2 times<\/b>/);
  assert.match(html, /Deep Research <b>2<\/b>/);
  assert.doesNotMatch(html, /Reasoning effort/);
  assert.match(html, /Thinking conversation/);
  assert.doesNotMatch(html, /Web search/);
  assert.doesNotMatch(html, /reasoning\.effort=low/);
  assert.doesNotMatch(html, /Old conversation/);
});

test("dashboard normalizes raw event feature aliases before display", () => {
  const stats = createStats();
  stats.featuresByModel["future-family-2026-thinking"] = {
    total: 1,
    features: {}
  };
  stats.events = [
    {
      model: "future-family-2026-thinking",
      requestModel: "future-family-2026-thinking",
      responseModel: "future-family-2026-thinking",
      usageFeatures: ["websearch", "dalle", "canvases"],
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
  assert.match(html, /Image generation/);
  assert.match(html, /Canvas/);
  assert.doesNotMatch(html, /websearch/);
  assert.doesNotMatch(html, /dalle/);
});

test("explicit date range uses dated relations and ignores cached sessions outside the range", () => {
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

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2 times<\/b>/);
  assert.match(html, /Thinking conversation/);
  assert.doesNotMatch(html, /Outside cached conversation/);
  assert.doesNotMatch(html, /2026-06-01/);
});

test("model rows use the selected range count without repeating today's or all-time count", () => {
  const stats = createStats();
  const today = utcDateKey();
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

  assert.match(html, /future-family-2026-thinking[\s\S]*<b>2 times<\/b>/);
  assert.doesNotMatch(html, /Range|All time|Today/);
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

test("one statisticsMode switch changes both chart series and lower statistics", () => {
  const { container, state } = renderStatisticsModeDashboard("mapped");
  const controls = container.querySelectorAll("[data-statistics-mode]");
  const mappedControl = controls.find((control) => control.getAttribute("data-statistics-mode") === "mapped");
  const internalControl = controls.find((control) => control.getAttribute("data-statistics-mode") === "internal");

  assert.equal(controls.length, 2, "the dashboard should render one two-choice statisticsMode switch");
  assert.ok(mappedControl, "the shared switch should include mapped mode");
  assert.ok(internalControl, "the shared switch should include internal mode");
  assert.equal(mappedControl.getAttribute("aria-pressed"), "true");
  assert.deepEqual(
    usageModelChips(container.innerHTML).map((chip) => chip.label).sort(),
    ["GPT-5.6 Luna", "GPT-5.6 Sol"]
  );
  assert.deepEqual(
    usageCountRecords(container.innerHTML).map((record) => record.heading).sort(),
    ["GPT-5.6 Luna", "GPT-5.6 Sol"]
  );

  internalControl.dispatch("click");

  assert.equal(state.statisticsMode, "internal");
  assert.deepEqual(
    usageModelChips(container.innerHTML).map((chip) => chip.label).sort(),
    ["Unknown", "gpt-5-6-pro", "gpt-5-6-thinking", "gpt-5.6-luna-wm"].sort(),
    "one switch action should replace the chart series with requestModel series"
  );
  assert.deepEqual(
    usageCountRecords(container.innerHTML).map((record) => record.heading).sort(),
    ["Unknown", "gpt-5-6-pro", "gpt-5-6-thinking", "gpt-5.6-luna-wm"].sort(),
    "the same switch action should replace the lower statistics with requestModel groups"
  );
  const rerenderedControls = container.querySelectorAll("[data-statistics-mode]");
  assert.equal(rerenderedControls.length, 2);
  assert.equal(
    rerenderedControls.find((control) => control.getAttribute("data-statistics-mode") === "internal")
      ?.getAttribute("aria-pressed"),
    "true"
  );
});

test("line, donut, and text statistics can be combined or hidden independently", () => {
  const { container, state } = renderStatisticsModeDashboard("internal", "en");
  const controls = container.querySelectorAll("[data-statistics-section]");
  const line = controls.find((control) => control.getAttribute("data-statistics-section") === "line");
  const donut = controls.find((control) => control.getAttribute("data-statistics-section") === "donut");
  const textStatistics = controls.find((control) => control.getAttribute("data-statistics-section") === "text");

  assert.equal(controls.length, 3);
  assert.equal(line.checked, true);
  assert.equal(donut.checked, false);
  assert.equal(textStatistics.checked, true);
  assert.match(container.innerHTML, /class="usage-settings-menu"/);
  assert.match(container.innerHTML, /data-settings-category="sections"/);
  assert.doesNotMatch(container.innerHTML, /usage-statistics-display-menu|usage-statistics-display-popover/);
  assert.doesNotMatch(container.innerHTML, /<button[^>]*data-statistics-section=/);
  assert.match(container.innerHTML, /class="usage-chart-wrap usage-line-chart-wrap"/);
  assert.doesNotMatch(container.innerHTML, /class="usage-chart-wrap usage-donut-wrap"/);
  assert.match(container.innerHTML, /class="usage-count-list"/);
  assert.equal((container.innerHTML.match(/class="usage-chart-legend"/g) || []).length, 1);

  donut.checked = true;
  donut.dispatch("change");
  assert.equal(state.showLineChart, true);
  assert.equal(state.showDonutChart, true);
  assert.equal(state.showTrendChart, true);
  assert.match(container.innerHTML, /class="usage-chart-wrap usage-line-chart-wrap"/);
  assert.match(container.innerHTML, /class="usage-chart-wrap usage-donut-wrap"/);
  assert.match(container.innerHTML, /class="usage-count-list"/);
  assert.equal(
    (container.innerHTML.match(/class="usage-chart-legend"/g) || []).length,
    2,
    "each selected chart owns the same direct model toggle legend"
  );

  const rerenderedLine = container.querySelectorAll("[data-statistics-section]")
    .find((control) => control.getAttribute("data-statistics-section") === "line");
  rerenderedLine.checked = false;
  rerenderedLine.dispatch("change");
  assert.equal(state.showLineChart, false);
  assert.equal(state.showDonutChart, true);
  assert.equal(state.showTrendChart, true);
  assert.doesNotMatch(container.innerHTML, /<div class="usage-chart-wrap usage-line-chart-wrap"><div class="usage-chart-head"><strong>Model usage trend/);
  assert.match(container.innerHTML, /class="usage-chart-wrap usage-donut-wrap"/);
  assert.match(container.innerHTML, /class="usage-count-list"/);
  assert.equal(
    container.querySelectorAll("[data-statistics-section]")
      .find((control) => control.getAttribute("data-statistics-section") === "line")
      .checked,
    false
  );

  const rerenderedText = container.querySelectorAll("[data-statistics-section]")
    .find((control) => control.getAttribute("data-statistics-section") === "text");
  rerenderedText.checked = false;
  rerenderedText.dispatch("change");
  assert.equal(state.showTextStatistics, false);
  assert.match(container.innerHTML, /class="usage-chart-wrap usage-donut-wrap"/);
  assert.doesNotMatch(container.innerHTML, /class="usage-count-list"/);
  assert.equal(container.querySelectorAll("[data-statistics-section]").length, 3);

  const rerenderedDonut = container.querySelectorAll("[data-statistics-section]")
    .find((control) => control.getAttribute("data-statistics-section") === "donut");
  rerenderedDonut.checked = false;
  rerenderedDonut.dispatch("change");
  assert.equal(state.showLineChart, false);
  assert.equal(state.showDonutChart, false);
  assert.equal(state.showTrendChart, false);
  assert.doesNotMatch(container.innerHTML, /class="usage-chart-legend"/);
  assert.doesNotMatch(container.innerHTML, /class="usage-chart-wrap/);
  assert.doesNotMatch(container.innerHTML, /class="usage-count-list"/);

  const finalLine = container.querySelectorAll("[data-statistics-section]")
    .find((control) => control.getAttribute("data-statistics-section") === "line");
  finalLine.checked = true;
  finalLine.dispatch("change");
  assert.equal(state.showLineChart, true);
  assert.equal(state.showDonutChart, false);
  assert.equal(state.showTrendChart, true);
  assert.match(container.innerHTML, /<div class="usage-chart-wrap usage-line-chart-wrap"><div class="usage-chart-head"><strong>Model usage trend/);
  assert.doesNotMatch(container.innerHTML, /class="usage-chart-wrap usage-donut-wrap"/);
  assert.doesNotMatch(container.innerHTML, /class="usage-count-list"/);
});

test("mapped statisticsMode aggregates only public models and hides every internal slug", () => {
  const { container } = renderStatisticsModeDashboard("mapped");
  const html = container.innerHTML;
  const chips = usageModelChips(html);
  const records = usageCountRecords(html);

  assert.deepEqual(
    Object.fromEntries(chips.map((chip) => [chip.label, chip.count])),
    {
      "GPT-5.6 Sol": "4",
      "GPT-5.6 Luna": "1"
    }
  );
  assert.deepEqual(chartPointTotals(html), {
    "GPT-5.6 Sol": 4,
    "GPT-5.6 Luna": 1
  });
  assert.deepEqual(
    records.map((record) => record.heading).sort(),
    ["GPT-5.6 Luna", "GPT-5.6 Sol"]
  );
  ["gpt-5-6-thinking", "gpt-5-6-pro", "gpt-5.6-luna-wm"].forEach((slug) => {
    assert.equal(html.includes(slug), false, `mapped mode must not expose internal slug ${slug}`);
  });
});

test("internal statisticsMode charts requestModel and renders one request heading with responseModel children", () => {
  const { container } = renderStatisticsModeDashboard("internal");
  const html = container.innerHTML;
  const chips = usageModelChips(html);
  const records = usageCountRecords(html);
  const chipByLabel = Object.fromEntries(chips.map((chip) => [chip.label, chip]));
  const chartTotals = chartPointTotals(html);

  assert.deepEqual(
    Object.fromEntries(chips.map((chip) => [chip.label, chip.count])),
    {
      "gpt-5-6-thinking": "2",
      "gpt-5-6-pro": "1",
      Unknown: "1",
      "gpt-5.6-luna-wm": "1"
    }
  );
  assert.equal(chartTotals[chipByLabel["gpt-5-6-thinking"].key], 2);
  assert.equal(chartTotals[chipByLabel["gpt-5-6-pro"].key], 1);
  assert.equal(chartTotals[chipByLabel.Unknown.key], 1);
  assert.equal(chartTotals[chipByLabel["gpt-5.6-luna-wm"].key], 1);
  assert.equal(chartTotals["GPT-5.6 Sol"], undefined);
  assert.equal(chartTotals["GPT-5.6 Luna"], undefined);

  assert.equal(records.filter((record) => record.heading === "gpt-5-6-thinking").length, 1);
  assert.equal(records.filter((record) => record.heading === "gpt-5-6-pro").length, 1);
  const thinkingRecord = usageCountRecord(html, "gpt-5-6-thinking");
  assert.ok(thinkingRecord);
  assert.equal(usageCountRecordTotal(thinkingRecord), 2);
  assert.equal(
    (thinkingRecord.html.match(/class="usage-internal-response-heading">Actual response model<\/small>/g) || []).length,
    1,
    "one request-model group should render the actual-response heading once"
  );
  assert.match(
    thinkingRecord.html,
    /data-response-model-child="gpt-5-6-thinking"[\s\S]*?<span class="usage-internal-response-copy"><code style="color:[^"]+">gpt-5-6-thinking<\/code><span class="usage-internal-efforts-inline" aria-label="Reasoning effort">/
  );
  assert.doesNotMatch(thinkingRecord.html, /usage-internal-effort-label|>Effort<\/small>/);
  assert.equal(
    (visibleUsageText(thinkingRecord.html).match(/gpt-5-6-thinking/g) || []).length,
    2,
    "the request heading and actual response row must each show the exact slug"
  );
  assert.doesNotMatch(thinkingRecord.html, /Same as request model|usage-internal-same-note/);
  assert.doesNotMatch(thinkingRecord.html, /<span class="usage-record-label">Reasoning effort<\/span>/);
  assert.match(
    thinkingRecord.html,
    /data-response-model-child="gpt-5-6-pro"[\s\S]*?<span class="usage-internal-response-copy"><code style="color:[^"]+">gpt-5-6-pro<\/code>/
  );

  const chineseHtml = renderStatisticsModeDashboard("internal", "zh").container.innerHTML;
  const chineseThinkingRecord = usageCountRecord(chineseHtml, "gpt-5-6-thinking");
  assert.ok(chineseThinkingRecord);
  assert.equal(
    (chineseThinkingRecord.html.match(/class="usage-internal-response-heading">实际回复型号<\/small>/g) || []).length,
    1
  );
  assert.match(
    chineseThinkingRecord.html,
    /data-response-model-child="gpt-5-6-thinking"[\s\S]*?<span class="usage-internal-response-copy"><code style="color:[^"]+">gpt-5-6-thinking<\/code><span class="usage-internal-efforts-inline" aria-label="思考强度">/
  );
  assert.doesNotMatch(chineseThinkingRecord.html, /usage-internal-effort-label|>强度<\/small>/);
  assert.doesNotMatch(chineseThinkingRecord.html, /与请求型号一致|usage-internal-same-note/);
  assert.doesNotMatch(chineseThinkingRecord.html, /<span class="usage-record-label">思考强度<\/span>/);
  assert.equal(
    (visibleUsageText(chineseThinkingRecord.html).match(/gpt-5-6-thinking/g) || []).length,
    2
  );
});

test("internal statisticsMode shows unknown request and response independently in both languages", () => {
  [
    { language: "en", unknown: "Unknown" },
    { language: "zh", unknown: "未知" }
  ].forEach(({ language, unknown }) => {
    const { container } = renderStatisticsModeDashboard("internal", language);
    const html = container.innerHTML;
    const unknownRequest = usageCountRecord(html, unknown);
    const unknownResponse = usageCountRecord(html, "gpt-5.6-luna-wm");

    assert.ok(unknownRequest, `${language}: missing requestModel should have its own ${unknown} heading`);
    assert.match(
      visibleUsageText(unknownRequest.html),
      new RegExp(`${unknown}[\\s\\S]*gpt-5-6-thinking`)
    );
    assert.ok(unknownResponse, `${language}: known requestModel should keep its exact heading`);
    assert.match(
      visibleUsageText(unknownResponse.html),
      new RegExp(`gpt-5\\.6-luna-wm[\\s\\S]*${unknown}`)
    );
    assert.equal(
      (visibleUsageText(unknownResponse.html).match(/gpt-5\.6-luna-wm/g) || []).length,
      1,
      `${language}: a missing responseModel must not be filled with requestModel`
    );
  });
});

test("Pro and Thinking can share one mapped public model while remaining separate internal groups", () => {
  const mapped = renderStatisticsModeDashboard("mapped").container.innerHTML;
  const internal = renderStatisticsModeDashboard("internal").container.innerHTML;
  const mappedSol = usageCountRecord(mapped, "GPT-5.6 Sol");
  const internalThinking = usageCountRecord(internal, "gpt-5-6-thinking");
  const internalPro = usageCountRecord(internal, "gpt-5-6-pro");

  assert.ok(mappedSol);
  assert.equal(usageCountRecordTotal(mappedSol), 4);
  assert.equal(usageCountRecords(mapped).filter((record) => record.heading === "GPT-5.6 Sol").length, 1);
  assert.ok(internalThinking);
  assert.ok(internalPro);
  assert.equal(usageCountRecordTotal(internalThinking), 2);
  assert.equal(usageCountRecordTotal(internalPro), 1);
  assert.equal(usageCountRecords(internal).filter((record) => record.heading === "gpt-5-6-thinking").length, 1);
  assert.equal(usageCountRecords(internal).filter((record) => record.heading === "gpt-5-6-pro").length, 1);
});

test("internal statistics keeps unavailable request evidence unknown instead of reusing legacy fields", () => {
  const stats = createStatisticsModeStats();
  stats.totals = { "GPT-5.6 Sol": 1 };
  stats.byDate = { "2026-08-23": { "GPT-5.6 Sol": 1 } };
  stats.events = [{
    model: "GPT-5.6 Sol",
    requestModel: "gpt-should-not-be-used",
    requestModelEvidence: "unavailable",
    apiModel: "gpt-should-not-be-used",
    modelParameters: { model: "gpt-should-not-be-used" },
    responseModel: "gpt-5-6-thinking",
    submittedAt: "2026-08-23T10:00:00.000Z"
  }];
  const state = {
    language: "en",
    statisticsMode: "internal",
    sourceModeFilter: "all",
    startDate: "2026-08-23",
    endDate: "2026-08-23"
  };

  assert.deepEqual(dashboard._test.statisticsTotalsInRange(stats, state), {
    __unknown_request_model__: 1
  });
  const html = dashboard._test.renderModelCountRows(
    Object.assign({ stats, loading: false }, state),
    ["__unknown_request_model__"]
  );
  assert.match(html, /data-request-model-group="__unknown_request_model__"/);
  assert.doesNotMatch(html, /gpt-should-not-be-used/);
  assert.match(html, /gpt-5-6-thinking/);
});

test("internal statistics retains exact new request and response slugs even when public mapping is absent", () => {
  const stats = {
    totals: {},
    byDate: {},
    models: {},
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {},
    parametersByModel: {},
    relationsByModel: {},
    events: [{
      model: "",
      requestModel: "gpt-9-1-thinking",
      requestModelEvidence: "trusted",
      responseModel: "gpt-9-1-pro",
      submittedAt: "2026-08-23T10:00:00.000Z"
    }]
  };
  const state = {
    language: "en",
    statisticsMode: "internal",
    sourceModeFilter: "all",
    startDate: "2026-08-23",
    endDate: "2026-08-23"
  };

  assert.deepEqual(dashboard._test.statisticsTotalsInRange(stats, state), {
    "gpt-9-1-thinking": 1
  });
  const html = dashboard._test.renderModelCountRows(
    Object.assign({ stats, loading: false }, state),
    ["gpt-9-1-thinking"]
  );
  assert.match(html, /data-request-model-group="gpt-9-1-thinking"/);
  assert.match(html, /data-response-model-child="gpt-9-1-pro"/);
});

test("event-backed statistics warns once when retained event history is incomplete", () => {
  const stats = Object.assign(createStatisticsModeStats(), { eventHistoryComplete: false });
  const base = {
    language: "en",
    stats,
    sourceModeFilter: "all",
    statisticsMode: "mapped"
  };

  assert.equal(dashboard._test.renderStatisticsCompletenessWarning(base), "");
  assert.match(
    dashboard._test.renderStatisticsCompletenessWarning(
      Object.assign({}, base, { statisticsMode: "internal" })
    ),
    /does not represent the full history/
  );
  assert.match(
    dashboard._test.renderStatisticsCompletenessWarning(
      Object.assign({}, base, { sourceModeFilter: "chat" })
    ),
    /does not represent the full history/
  );
});

test("internal response children keep feature pills and mixed Chat Work conversation contributions", () => {
  const stats = createStatisticsModeStats();
  stats.totals = { "GPT-5.6 Sol": 2 };
  stats.byDate = { "2026-08-23": { "GPT-5.6 Sol": 2 } };
  stats.events = [
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-pro",
      requestReasoningEffort: "high",
      usageFeatures: ["web_search"],
      sourceMode: "chat",
      conversationId: "mixed-source",
      pageTitle: "Mixed source",
      submittedAt: "2026-08-23T10:00:00.000Z"
    },
    {
      model: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-pro",
      requestReasoningEffort: "max",
      usageFeatures: ["image_generation"],
      sourceMode: "work",
      conversationId: "mixed-source",
      pageTitle: "Mixed source",
      submittedAt: "2026-08-23T10:01:00.000Z"
    }
  ];
  const state = {
    language: "en",
    stats,
    statisticsMode: "internal",
    sourceModeFilter: "all",
    startDate: "2026-08-23",
    endDate: "2026-08-23",
    loading: false
  };
  const html = dashboard._test.renderModelCountRows(state, ["gpt-5-6-thinking"]);

  assert.match(html, /Web search <b>1<\/b>/);
  assert.match(html, /Image generation <b>1<\/b>/);
  assert.match(html, /usage-source-mode chat">Chat 1<\/span>/);
  assert.match(html, /usage-source-mode work">Work 1<\/span>/);
});

test("request-only events show an unknown actual response without inventing a model", () => {
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
  assert.match(html, /gpt-5-6-thinking<\/code>[\s\S]*?&rarr;[\s\S]*?<code style="color:[^"]+">gpt-5-6-pro/);
  assert.match(html, /请求型号<\/small><code style="color:[^"]+">gpt-5-6-thinking<\/code>[\s\S]*?实际回复型号<\/small><code style="color:[^"]+">未知<\/code>/);
  assert.match(html, /data-effort-filter="unknown"[\s\S]*?<b class="usage-effort-unknown">未知<\/b>/);
  assert.equal((html.match(/gpt-5-6-pro/g) || []).length, 1);
});

test("a response-only event keeps the exact response relation and labels every missing dimension as unknown", () => {
  const model = "GPT-5.6 Sol";
  const stats = createStats();
  stats.totals = { [model]: 1 };
  stats.byDate = { "2026-05-30": { [model]: 1 } };
  stats.events = [{
    model,
    requestModel: "",
    responseModel: "gpt-5-6-thinking",
    sourceMode: "",
    conversationId: "response-only",
    pageTitle: "Response only",
    pageUrl: "https://chatgpt.com/c/response-only",
    submittedAt: "2026-05-30T15:00:00.000Z"
  }];

  const relations = dashboard._test.modelRelations(stats, model, {
    startDate: "2026-05-30",
    endDate: "2026-05-30"
  });
  const html = dashboard.renderModelTextList(stats, {
    language: "zh",
    startDate: "2026-05-30",
    endDate: "2026-05-30"
  });

  assert.equal(relations.length, 1);
  assert.equal(relations[0].requestModel, "");
  assert.equal(relations[0].responseModel, "gpt-5-6-thinking");
  assert.match(html, /请求型号<\/small><code style="color:[^"]+">未知<\/code>/);
  assert.match(html, /实际回复型号<\/small><code style="color:[^"]+">gpt-5-6-thinking<\/code>/);
  assert.match(html, /data-effort-filter="unknown"[\s\S]*?<b class="usage-effort-unknown">未知<\/b>/);
  assert.match(html, /usage-source-mode unknown">未知<\/span>/);
});

test("chart count details show exact request-response pairs and the unknown pair together", () => {
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
      statisticsMode: "internal",
      startDate: "2026-05-30",
      endDate: "2026-05-30",
      selectedModels: {
        "gpt-5-6-thinking": true,
        "gpt-5-6": true
      },
      stats
    },
    ["gpt-5-6-thinking", "gpt-5-6"]
  );

  assert.match(html, /data-request-model-group="gpt-5-6-thinking"/);
  assert.match(html, /data-response-model-child="gpt-5-6-thinking"[\s\S]*<code style="color:[^"]+">gpt-5-6-thinking<\/code>/);
  assert.match(html, /data-request-model-group="gpt-5-6"/);
  assert.match(html, /data-response-model-child="gpt-5-6"[\s\S]*<code style="color:[^"]+">gpt-5-6<\/code>/);
  assert.doesNotMatch(html, /与请求型号一致|usage-internal-same-note/);
  assert.equal(
    (html.match(/class="usage-internal-response-heading">实际回复型号<\/small>/g) || []).length,
    2,
    "each request-model group should show the actual-response heading once"
  );
  assert.equal((html.match(/<code style="color:[^"]+">gpt-5-6-thinking<\/code>/g) || []).length, 2);
  assert.equal((html.match(/<code style="color:[^"]+">gpt-5-6<\/code>/g) || []).length, 2);
  assert.match(html, /未知/);
  assert.equal((html.match(/class="usage-internal-response"/g) || []).length, 3);
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
  assert.match(html, /Response model<\/small><code style="color:[^"]+">gpt-5\.6-terra-wm<\/code>/);
  assert.doesNotMatch(
    html,
    /gpt-5\.6-terra-wm<\/code>[\s\S]*?&rarr;[\s\S]*?<code>gpt-5\.6-terra-wm/
  );
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
    const instance = dashboard.init(container, { surface: "popup" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(storageListeners.length, 2);
    assert.match(container.innerHTML, /data-model-toggle="future-family-2026-thinking" checked[\s\S]*2 times/);

    instance.state.statisticsDataBusy = true;
    instance.state.statusText = "Restored 41 usage records";
    dashboard._test.render(instance.state);
    storageListeners.forEach((listener) => {
      listener({ "chatgptModelUsageStats.v1": { newValue: updatedStats } }, "local");
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    instance.state.statisticsDataBusy = false;
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
  assert.match(container.innerHTML, /data-model-toggle="future-family-2026-thinking" checked[\s\S]*3 times/);
  assert.match(container.innerHTML, /future-family-2026-thinking/);
  assert.match(container.innerHTML, /Restored 41 usage records/);
});

test("the page entry and toolbar popup restore and synchronize one shared last main view", async () => {
  const previousHandler = globalThis.ChatGPTUsageDashboardMessageHandler;
  const previousList = globalThis.__chatgptUsageListConversations;
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const storageListeners = [];
  const popupContainer = new DashboardTestContainer();
  const pageContainer = new DashboardTestContainer();
  let storedSettings = {
    language: "en",
    activeView: "status",
    statisticsMode: "mapped",
    chartType: "line",
    themeMode: "system",
    sourceModeFilter: "all",
    showLineChart: true,
    showDonutChart: false,
    showTrendChart: true,
    showTextStatistics: true,
    startDate: "2026-05-30",
    endDate: "2026-05-30"
  };
  let exportListRequests = 0;
  const settingsSetPayloads = [];

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
    runtime: {
      lastError: null
    },
    storage: {
      onChanged: {
        addListener(listener) {
          storageListeners.push(listener);
        }
      }
    },
    tabs: {
      query(_query, callback) {
        callback([{ id: 7 }]);
      },
      sendMessage(_tabId, message, callback) {
        if (message.type === "conversation.list") {
          exportListRequests += 1;
          callback({
            ok: true,
            conversations: [{ id: "shared-view-chat", title: "Shared view chat" }],
            complete: true,
            source: "account"
          });
          return;
        }
        callback({ ok: true });
      }
    }
  };
  globalThis.ChatGPTUsageDashboardMessageHandler = (message) => {
    if (message.type === "usage.get") {
      return { ok: true, stats: createStats() };
    }
    if (message.type === "settings.get") {
      return { ok: true, settings: { ...storedSettings } };
    }
    if (message.type === "settings.set") {
      settingsSetPayloads.push({ ...message.settings });
      storedSettings = { ...storedSettings, ...message.settings };
      storageListeners.forEach((listener) => {
        listener({
          "chatgptModelUsageSettings.v1": {
            newValue: { ...storedSettings }
          }
        }, "local");
      });
      return { ok: true, settings: { ...storedSettings } };
    }
    if (message.type === "openai.status.get") {
      return {
        ok: true,
        status: {
          fetchedAt: "2026-08-23T12:00:00.000Z",
          sourceUrl: "https://status.openai.com/",
          page: { name: "OpenAI", updatedAt: "2026-08-23T12:00:00.000Z" },
          status: { indicator: "none", description: "All Systems Operational" },
          components: [],
          incidents: []
        }
      };
    }
    return undefined;
  };
  globalThis.__chatgptUsageListConversations = () => {
    exportListRequests += 1;
    return {
      conversations: [{ id: "shared-view-chat", title: "Shared view chat" }],
      complete: true,
      source: "account"
    };
  };

  try {
    const popup = dashboard.init(popupContainer, { surface: "popup" });
    await flushDashboardPromises();
    assert.equal(popup.state.activeView, "status");
    assert.equal(popup.state.endDate, "2026-05-30");
    assert.equal(
      popupContainer.querySelectorAll("[data-view-tab]")
        .find((button) => button.getAttribute("data-view-tab") === "status")
        .getAttribute("aria-selected"),
      "true"
    );

    popupContainer.querySelectorAll("[data-view-tab]")
      .find((button) => button.getAttribute("data-view-tab") === "export")
      .dispatch("click");
    await flushDashboardPromises();
    assert.equal(storedSettings.activeView, "export");
    assert.deepEqual(settingsSetPayloads.at(-1), { activeView: "export" });
    assert.equal(popup.state.activeView, "export");
    assert.deepEqual(
      popup.state.exportConversationList.map((conversation) => conversation.id),
      ["shared-view-chat"]
    );

    const page = dashboard.init(pageContainer, { surface: "page" });
    await flushDashboardPromises();
    assert.equal(page.state.activeView, "export");
    assert.equal(page.state.endDate, "2026-05-30");
    assert.deepEqual(
      page.state.exportConversationList.map((conversation) => conversation.id),
      ["shared-view-chat"]
    );
    assert.equal(exportListRequests, 2, "each newly opened surface loads the restored export view");

    pageContainer.querySelectorAll("[data-view-tab]")
      .find((button) => button.getAttribute("data-view-tab") === "chart")
      .dispatch("click");
    await flushDashboardPromises();
    assert.equal(storedSettings.activeView, "chart");
    assert.equal(page.state.activeView, "chart");
    assert.equal(popup.state.activeView, "chart");

    const popupLine = popupContainer.querySelectorAll("[data-statistics-section]")
      .find((button) => button.getAttribute("data-statistics-section") === "line");
    popupLine.checked = false;
    popupLine.dispatch("change");
    await flushDashboardPromises();
    assert.equal(storedSettings.showLineChart, false);
    assert.equal(storedSettings.showTrendChart, false);
    assert.deepEqual(settingsSetPayloads.at(-1), {
      showLineChart: false,
      showTrendChart: false
    });
    assert.equal(page.state.showLineChart, false);
    assert.equal(popup.state.showLineChart, false);
    assert.equal(page.state.showTrendChart, false);
    assert.equal(popup.state.showTrendChart, false);

    const pageDonut = pageContainer.querySelectorAll("[data-statistics-section]")
      .find((button) => button.getAttribute("data-statistics-section") === "donut");
    pageDonut.checked = true;
    pageDonut.dispatch("change");
    await flushDashboardPromises();
    assert.equal(storedSettings.showDonutChart, true);
    assert.equal(storedSettings.showTrendChart, true);
    assert.deepEqual(settingsSetPayloads.at(-1), {
      showDonutChart: true,
      showTrendChart: true
    });
    assert.equal(page.state.showDonutChart, true);
    assert.equal(popup.state.showDonutChart, true);
    assert.equal(page.state.showTrendChart, true);
    assert.equal(popup.state.showTrendChart, true);

    const popupText = popupContainer.querySelectorAll("[data-statistics-section]")
      .find((button) => button.getAttribute("data-statistics-section") === "text");
    popupText.checked = false;
    popupText.dispatch("change");
    await flushDashboardPromises();
    assert.equal(storedSettings.showTextStatistics, false);
    assert.deepEqual(settingsSetPayloads.at(-1), {
      showTextStatistics: false,
      showTrendChart: true
    });
    assert.equal(page.state.showTextStatistics, false);
    assert.equal(popup.state.showTextStatistics, false);
    assert.equal(pageContainer.querySelectorAll("[data-statistics-section]").length, 3);

    pageContainer.querySelectorAll("[data-statistics-mode]")
      .find((button) => button.getAttribute("data-statistics-mode") === "internal")
      .dispatch("click");
    await flushDashboardPromises();
    assert.equal(storedSettings.statisticsMode, "internal");
    assert.equal(page.state.statisticsMode, "internal");
    assert.equal(popup.state.statisticsMode, "internal");

    popupContainer.querySelectorAll("[data-theme-select]")
      .find((button) => button.getAttribute("data-theme-select") === "dark")
      .dispatch("click");
    await flushDashboardPromises();
    assert.equal(storedSettings.themeMode, "dark");
    assert.deepEqual(settingsSetPayloads.at(-1), { themeMode: "dark" });
    assert.equal(page.state.themeMode, "dark");
    assert.equal(popup.state.themeMode, "dark");

    popupContainer.querySelectorAll("[data-view-tab]")
      .find((button) => button.getAttribute("data-view-tab") === "status")
      .dispatch("click");
    await flushDashboardPromises();
    assert.equal(storedSettings.activeView, "status");
    assert.equal(page.state.activeView, "status");
    assert.equal(popup.state.activeView, "status");

    page.state.activeView = "chart";
    await page.reload({ restoreActiveView: true });
    assert.equal(page.state.activeView, "status", "reopening an existing page panel restores the shared last view");
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

test("dashboard reuses the loaded conversation list until the user explicitly refreshes it", async () => {
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

    await instance.reload({ skipExportList: true });
    assert.equal(
      listRequestCount,
      1,
      "a statistics-only reload must not supersede the active export index"
    );

    instance.state.exportSelected = { "chat-1": true };
    await instance.reload();
    assert.equal(listRequestCount, 1);
    assert.deepEqual(instance.state.exportConversationList.map((conversation) => conversation.id), ["chat-1"]);

    await instance.reload({ forceExportList: true });
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

test("dashboard refresh keeps in-range aggregate feature rows without exposing internal parameters in mapped mode", async () => {
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
    analyticsByDate: {
      "2026-05-30": {
        chat: {
          [model]: {
            [`${model}\u0001${model}`]: {
              requestModel: model,
              responseModel: model,
              count: 5,
              efforts: { high: 5 },
              features: { web_search: 5 },
              sourceModes: { chat: 5 },
              conversations: {},
              firstSubmittedAt: "2026-05-30T18:00:00.000Z",
              lastSubmittedAt: "2026-05-30T18:00:00.000Z"
            }
          }
        }
      }
    },
    analyticsHistoryComplete: true,
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

    assert.equal(storageListeners.length, 2);
    storageListeners.forEach((listener) => {
      listener({ "chatgptModelUsageStats.v1": { newValue: updatedStats } }, "local");
    });
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
  assert.match(container.innerHTML, /class="usage-count-features"/);
  assert.match(container.innerHTML, /Web search/);
  assert.match(container.innerHTML, /Web search[\s\S]*5/);
  assert.doesNotMatch(container.innerHTML, /class="usage-feature-row"/);
  assert.doesNotMatch(container.innerHTML, /class="usage-param-row"/);
  assert.doesNotMatch(container.innerHTML, /reasoning\.effort=high/);
  assert.doesNotMatch(container.innerHTML, /web_search_options\.search_context_size=low/);
});

test("date range stays in the usage view while other settings stay in the title-bar menu", () => {
  const state = {
    language: "en",
    activeView: "chart",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    selectedModels: { "future-family-2026-thinking": true },
    stats: createStats()
  };

  const chartHtml = dashboard.renderActiveView(state, ["future-family-2026-thinking"]);
  const chartSettings = dashboard.renderSettingsMenu(state);
  assert.match(chartHtml, /usage-start-date|Custom dates/);
  assert.match(chartSettings, /class="usage-settings-menu"/);
  assert.doesNotMatch(chartSettings, /usage-start-date|usage-settings-date-submenu|Custom dates/);
  assert.match(chartSettings, /data-theme-select="system"/);
  assert.match(chartSettings, /data-theme-select="light"/);
  assert.match(chartSettings, /data-theme-select="dark"/);
  assert.match(chartHtml, /viewBox="0 0 360 192"/);
  assert.doesNotMatch(chartHtml, /usage-event-text-list/);
  assert.doesNotMatch(chartHtml, /Recent records/);

  state.activeView = "status";
  state.openaiStatus = {
    sourceUrl: "https://status.openai.com/",
    status: { indicator: "none", description: "All Systems Operational" },
    components: []
  };
  const statusSettings = dashboard.renderSettingsMenu(state);
  assert.doesNotMatch(dashboard.renderActiveView(state, []), /usage-start-date|Custom dates/);
  assert.doesNotMatch(statusSettings, /usage-start-date|data-source-filter|data-statistics-mode|data-statistics-section/);
  assert.match(statusSettings, /data-language-select="zh"/);
  assert.match(statusSettings, /data-theme-select="system"/);
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

test("export list keeps the current chat first and groups remaining chats by project directory", () => {
  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "export",
    exportConversationList: [
      {
        id: "current-project-chat",
        title: "Current project chat",
        current: true,
        groupType: "project",
        projectId: "project-alpha",
        projectName: "Alpha project"
      },
      {
        id: "project-chat",
        title: "Another project chat",
        groupType: "project",
        projectId: "project-alpha",
        projectName: "Alpha project"
      },
      {
        id: "regular-chat",
        title: "Regular chat"
      }
    ],
    exportSelected: { "current-project-chat": true },
    exportSearch: ""
  }, []);

  const currentIndex = html.indexOf('data-export-conv-row="current-project-chat"');
  const projectIndex = html.indexOf('data-export-group="project:project-alpha"');
  const regularIndex = html.indexOf('data-export-group="ungrouped"');
  const projectSummary = html.slice(
    html.indexOf("<summary>", projectIndex),
    html.indexOf("</summary>", projectIndex)
  );

  assert.ok(currentIndex >= 0 && currentIndex < projectIndex, "current chat must be globally first");
  assert.ok(projectIndex >= 0 && projectIndex < regularIndex, "project directory must precede regular chats");
  assert.match(html, /<details class="usage-export-group" data-export-group="project:project-alpha" open>/);
  assert.match(projectSummary, /Alpha project/);
  assert.match(projectSummary, /type="checkbox" data-export-project-toggle="project-alpha"/);
  assert.match(html, /Not in a project \/ regular chats/);
  assert.equal((html.match(/data-export-conv="current-project-chat"/g) || []).length, 1);
  assert.match(html, /data-export-conv="current-project-chat"[^>]*checked/);
  assert.doesNotMatch(html, /data-export-conv="project-chat"[^>]*checked/);
  assert.doesNotMatch(html, /data-export-conv="regular-chat"[^>]*checked/);
});

test("export search includes project directory names without replacing item checkboxes", () => {
  assert.equal(
    dashboard._test.exportConversationMatchesSearch(
      {
        id: "project-chat",
        title: "Conversation",
        groupType: "project",
        projectId: "project-alpha",
        projectName: "Alpha project"
      },
      "alpha project"
    ),
    true
  );
});

test("export project grouping keeps the highest-trust rendered project name", () => {
  const projectId = "g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const html = dashboard.renderActiveView({
    language: "zh",
    activeView: "export",
    exportConversationList: [
      {
        id: "exact-chat",
        title: "Exact",
        groupType: "project",
        projectId,
        projectName: "@#!#",
        projectNameSource: "main-world-react",
        projectOrder: 0
      },
      {
        id: "stale-chat",
        title: "Stale",
        groupType: "project",
        projectId,
        projectName: "old-route-slug",
        projectNameSource: "account-index",
        projectOrder: 0
      }
    ],
    exportSelected: {},
    exportSearch: ""
  }, []);

  const groupIndex = html.indexOf(`data-export-group="project:${projectId}"`);
  const summary = html.slice(html.indexOf("<summary>", groupIndex), html.indexOf("</summary>", groupIndex));
  assert.match(summary, /@#!#/);
  assert.doesNotMatch(summary, /old-route-slug/);
});

test("export project grouping keeps an unresolved project selectable without showing its raw id as the title", () => {
  const projectId = "g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const html = dashboard.renderActiveView({
    language: "en",
    activeView: "export",
    exportConversationList: [
      {
        id: "unresolved-project-chat",
        title: "Still readable",
        groupType: "project",
        projectId,
        projectName: "Unnamed project"
      }
    ],
    exportSelected: {},
    exportSearch: ""
  }, []);

  const groupIndex = html.indexOf(`data-export-group="project:${projectId}"`);
  const summary = html.slice(html.indexOf("<summary>", groupIndex), html.indexOf("</summary>", groupIndex));
  assert.match(summary, /Unknown project/);
  assert.doesNotMatch(summary, /Unnamed project/);
  assert.doesNotMatch(summary, new RegExp(`>${projectId}<`));
  assert.match(summary, new RegExp(`data-export-project-toggle="${projectId}"`));
});

test("project checkbox selects and clears every conversation in that project only", () => {
  const projectToggle = new DashboardTestElement({
    "data-export-project-toggle": "project-alpha"
  });
  const first = new DashboardTestElement({ "data-export-conv": "project-chat-1" });
  const second = new DashboardTestElement({ "data-export-conv": "project-chat-2" });
  const ordinary = new DashboardTestElement({ "data-export-conv": "ordinary-chat" });
  const count = new DashboardTestElement({ selector: ".usage-export-selcount" });
  const format = new DashboardTestElement({ "data-export-format": "json" });
  const container = {
    querySelector(selector) {
      return selector === ".usage-export-selcount" ? count : null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-export-project-toggle]") return [projectToggle];
      if (selector === "[data-export-conv]") return [first, second, ordinary];
      if (selector === "[data-export-format]") return [format];
      if (selector === "[data-export-selectall],[data-export-selectnone]") return [];
      return [];
    }
  };
  const state = {
    language: "en",
    container,
    options: {},
    exportConversationList: [
      {
        id: "project-chat-1",
        groupType: "project",
        projectId: "project-alpha",
        projectName: "Alpha project"
      },
      {
        id: "project-chat-2",
        groupType: "project",
        projectId: "project-alpha",
        projectName: "Alpha project"
      },
      {
        id: "ordinary-chat",
        title: "Ordinary"
      }
    ],
    exportSelected: {},
    exportBusy: false
  };

  dashboard._test.bindEvents(state);
  projectToggle.checked = true;
  projectToggle.dispatch("change");
  assert.deepEqual(state.exportSelected, {
    "project-chat-1": true,
    "project-chat-2": true
  });
  assert.equal(first.checked, true);
  assert.equal(second.checked, true);
  assert.equal(ordinary.checked, false);
  assert.equal(count.textContent, "2 selected");

  projectToggle.checked = false;
  projectToggle.dispatch("change");
  assert.deepEqual(state.exportSelected, {});
  assert.equal(first.checked, false);
  assert.equal(second.checked, false);
  assert.equal(ordinary.checked, false);
  assert.equal(count.textContent, "0 selected");
});

test("export bulk buttons use equal compact dimensions", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "dashboard.js"), "utf8");

  assert.match(
    source,
    /\.usage-export-selectbar\{display:grid;grid-template-columns:minmax\(96px,1fr\) 72px 72px auto/
  );
  assert.match(
    source,
    /\.usage-export-mini\{[^}]*width:72px;min-height:28px/
  );
});

test("export completion status survives a dashboard re-render", () => {
  const classes = new Set();
  const statusNode = {
    textContent: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
  const state = {
    container: {
      querySelector(selector) {
        return selector === "[data-export-status]" ? statusNode : null;
      }
    },
    language: "en",
    activeView: "export",
    exportConversationList: [],
    exportSelected: {},
    exportSearch: "",
    exportStatusText: "",
    exportStatusError: false
  };

  dashboard._test.setExportStatus(state, "2 conversations exported", true);
  assert.equal(state.exportStatusText, "2 conversations exported");
  assert.equal(state.exportStatusError, true);
  assert.equal(statusNode.textContent, "2 conversations exported");
  assert.equal(classes.has("error"), true);

  const html = dashboard.renderActiveView(state, []);
  assert.match(
    html,
    /class="usage-export-status error" data-export-status aria-live="polite">2 conversations exported<\/p>/
  );
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

test("the export cancel control is hidden again after an operation finishes", () => {
  const cancel = new DashboardTestElement({ "data-export-cancel": "" });
  cancel.hidden = true;
  const format = new DashboardTestElement({ "data-export-format": "json" });
  const container = {
    querySelector(selector) {
      return selector === "[data-export-cancel]" ? cancel : null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-export-format]") return [format];
      if (selector === "[data-export-conv]") return [];
      if (selector === "[data-export-selectall],[data-export-selectnone]") return [];
      if (selector === "[data-export-format],[data-export-selectall],[data-export-selectnone],[data-export-conv]") {
        return [format];
      }
      return [];
    }
  };
  const state = {
    language: "en",
    container,
    exportConversationList: [{ id: "chat-0001", title: "One" }],
    exportSelected: { "chat-0001": true },
    exportBusy: true,
    exportCancelRequested: false
  };

  dashboard._test.setExportControlsDisabled(state, true);
  assert.equal(cancel.hidden, false);
  state.exportBusy = false;
  dashboard._test.setExportControlsDisabled(state, false);
  assert.equal(cancel.hidden, true);
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

test("an unavailable first export index does not consume the current-conversation default", () => {
  const state = {
    container: new DashboardTestContainer(),
    options: { surface: "page" },
    language: "en",
    activeView: "export",
    startDate: "2026-08-01",
    endDate: "2026-08-24",
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

  dashboard._test.applyExportConversationList(state, {
    conversations: [],
    complete: false,
    source: "unavailable"
  });
  assert.equal(state.exportSelectionInitialized, false);
  assert.deepEqual(state.exportSelected, {});

  dashboard._test.applyExportConversationList(state, {
    currentConversationId: "chat-current",
    conversations: [
      { id: "chat-old", title: "Older" },
      { id: "chat-current", title: "Current" }
    ],
    complete: true,
    source: "account"
  });
  assert.equal(state.exportSelectionInitialized, true);
  assert.deepEqual(state.exportSelected, { "chat-current": true });
  assert.equal(state.exportConversationList[0].id, "chat-current");
});

test("full-list select all automatically includes conversations discovered by an explicit refresh", () => {
  const state = {
    container: new DashboardTestContainer(),
    options: { surface: "page" },
    language: "en",
    activeView: "export",
    startDate: "2026-08-01",
    endDate: "2026-08-23",
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
    exportSelected: { "chat-1": true, "chat-2": true },
    exportSelectAllMode: true,
    exportSelectionInitialized: true,
    exportSearch: "",
    exportBusy: false,
    statusText: "",
    statusError: false
  };

  dashboard._test.applyExportConversationList(state, {
    conversations: [
      { id: "chat-1", title: "One" },
      { id: "chat-2", title: "Two" },
      { id: "chat-3", title: "Newly discovered" }
    ],
    complete: true,
    source: "account"
  });

  assert.deepEqual(state.exportSelected, {
    "chat-1": true,
    "chat-2": true,
    "chat-3": true
  });
});

function usagePromptHash(value) {
  let hash = 2166136261;
  const text = String(value || "")
    .replace(/[\u200b-\u200f\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

test("export enrichment uses the final response message id to keep Chat and Work evidence on the same turn", () => {
  const conversation = {
    id: "work-conversation",
    messages: [
      { id: "user-1", role: "user", text: "Build the report." },
      { id: "assistant-final", role: "assistant", text: "Finished." }
    ]
  };
  const enriched = dashboard._test.enrichConversationWithUsageEvents(conversation, {
    events: [{
      conversationId: "work-conversation",
      responseMessageId: "assistant-final",
      selectedPublicModel: "5.6 Terra",
      selectedPublicModelSource: "work-selector-dom",
      requestModel: "gpt-5.6-terra-wm",
      requestModelEvidence: "trusted",
      responseModel: "gpt-5.6-terra-wm",
      responseObservedAt: "2026-08-23T12:00:10.000Z",
      responseObservedSource: "message-dom:model-slug",
      requestReasoningEffort: "high",
      modelParameters: { model: "gpt-5.6-terra-wm", "reasoning.effort": "high" },
      usageFeatures: ["web_search"],
      sourceMode: "work"
    }]
  });
  const assistant = enriched.messages[1];

  assert.equal(assistant.selectedPublicModel, "5.6 Terra");
  assert.equal(assistant.requestModel, "gpt-5.6-terra-wm");
  assert.equal(assistant.responseModel, "gpt-5.6-terra-wm");
  assert.equal(assistant.model, "gpt-5.6-terra-wm");
  assert.equal(assistant.requestReasoningEffort, "high");
  assert.equal(assistant.parameters.model, "gpt-5.6-terra-wm");
  assert.deepEqual(assistant.features, ["web_search"]);
});

test("export enrichment matches repeated prompts to their nearest turns without crossing conversations", () => {
  const prompt = "Repeat   this prompt";
  const conversation = {
    id: "repeat-conversation",
    messages: [
      { id: "u1", role: "user", text: "Repeat this prompt", createTime: "2026-08-23T12:00:00.000Z" },
      { id: "a1", role: "assistant", text: "First" },
      { id: "u2", role: "user", text: prompt, createTime: "2026-08-23T12:10:00.000Z" },
      { id: "a2", role: "assistant", text: "Second" }
    ]
  };
  const hash = usagePromptHash(prompt);
  const event = (submittedAt, requestModel, responseModel) => ({
    conversationId: "repeat-conversation",
    promptHash: hash,
    submittedAt,
    requestModel,
    requestModelEvidence: "trusted",
    responseModel,
    responseObservedAt: submittedAt,
    responseObservedSource: "message-dom:model-slug"
  });
  const enriched = dashboard._test.enrichConversationWithUsageEvents(conversation, {
    events: [
      event("2026-08-23T12:10:02.000Z", "request-second", "response-second"),
      {
        ...event("2026-08-23T12:00:02.000Z", "request-first", "response-first"),
        conversationId: "different-conversation"
      },
      event("2026-08-23T12:00:02.000Z", "request-first", "response-first")
    ]
  });

  assert.equal(enriched.messages[1].requestModel, "request-first");
  assert.equal(enriched.messages[1].responseModel, "response-first");
  assert.equal(enriched.messages[3].requestModel, "request-second");
  assert.equal(enriched.messages[3].responseModel, "response-second");
});

test("export enrichment repairs prompt hashes produced by the legacy duplicated contenteditable text bug", () => {
  const prompt = "拖动windows窗口慢动作原因";
  const duplicatedPrompt = `${prompt} ${prompt}`;
  const enriched = dashboard._test.enrichConversationWithUsageEvents({
    id: "legacy-duplicated-prompt",
    messages: [
      {
        id: "user-current",
        role: "user",
        text: prompt,
        createTime: "2026-08-23T01:29:16.481Z"
      },
      {
        id: "assistant-current",
        role: "assistant",
        text: "Answer",
        metadata: { model_slug: "gpt-5-6-thinking" }
      }
    ]
  }, {
    events: [{
      conversationId: "legacy-duplicated-prompt",
      submittedAt: "2026-08-23T01:29:16.464Z",
      promptHash: usagePromptHash(duplicatedPrompt),
      promptLength: duplicatedPrompt.length,
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "request+account-catalog",
      requestModel: "gpt-5-6-thinking",
      requestModelEvidence: "trusted",
      modelObservedSource: "webRequest"
    }]
  });
  const assistant = enriched.messages[1];

  assert.equal(assistant.selectedPublicModel, "GPT-5.6 Sol");
  assert.equal(assistant.requestModel, "gpt-5-6-thinking");
  assert.equal(assistant.responseModel, "gpt-5-6-thinking");
});

test("export enrichment keeps untrusted request evidence unavailable and never treats a generic model field as the response", () => {
  const enriched = dashboard._test.enrichConversationWithUsageEvents({
    id: "untrusted-conversation",
    messages: [
      { id: "u1", role: "user", text: "Question" },
      { id: "a1", role: "assistant", text: "Answer", model: "generic-untrusted-model" }
    ]
  }, {
    events: [{
      conversationId: "untrusted-conversation",
      responseMessageId: "a1",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "request+account-catalog",
      requestModel: "untrusted-request",
      requestModelEvidence: "unavailable",
      responseModel: "trusted-response",
      responseObservedAt: "2026-08-23T12:00:10.000Z",
      responseObservedSource: "message-dom:model-slug",
      requestReasoningEffort: "high",
      modelParameters: { model: "untrusted-request", "reasoning.effort": "high" },
      usageFeatures: ["web_search"]
    }]
  });
  const assistant = enriched.messages[1];

  assert.equal(assistant.selectedPublicModel || "", "");
  assert.equal(assistant.requestModel || "", "");
  assert.equal(assistant.responseModel, "trusted-response");
  assert.equal(assistant.requestReasoningEffort || "", "");
  assert.deepEqual(assistant.parameters, {});
  assert.deepEqual(assistant.features, []);
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

test("dashboard PDF export always uses the searchable text PDF path", async () => {
  const calls = [];
  const pdfBlob = new Blob(["%PDF-text"], { type: "application/pdf" });
  const fakeExporter = {
    renderConversationsCanvas() {
      calls.push("canvas");
      throw new Error("PDF must not use the canvas path");
    },
    buildPdfBlobFromConversations() {
      calls.push("image-pdf");
      throw new Error("PDF must not use the image-only path");
    },
    buildPdf(conversations, options) {
      calls.push({ type: "text-pdf", conversations, options });
      return pdfBlob;
    }
  };
  const conversations = [{
    id: "chat-0001",
    title: "Searchable PDF",
    messages: [{ id: "m1", role: "user", text: "Searchable content" }]
  }];

  const artifacts = await dashboard._test.buildExportArtifacts(
    fakeExporter,
    conversations,
    "pdf",
    "Searchable PDF"
  );

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].blob, pdfBlob);
  assert.equal(artifacts[0].filename, "Searchable PDF.pdf");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "text-pdf");
  assert.equal(calls[0].conversations, conversations);
  assert.deepEqual(calls[0].options, { filenameBase: "Searchable PDF" });
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

test("an operation-stop response aborts later export chunks and creates no partial archive", async () => {
  let collectionCalls = 0;
  let downloadCalls = 0;
  const previousCollector = globalThis.__chatgptUsageCollectMany;
  globalThis.__chatgptUsageCollectMany = async () => {
    collectionCalls += 1;
    const error = new Error("ChatGPT history request failed (429)");
    error.status = 429;
    error.stopOperation = true;
    error.incomplete = true;
    throw error;
  };
  const archiveExporter = Object.assign({}, exporter, {
    downloadBlob() {
      downloadCalls += 1;
    }
  });
  const state = {
    language: "en",
    options: { surface: "page" },
    container: { querySelector: () => null }
  };

  try {
    await assert.rejects(
      dashboard._test.downloadConversationArchiveByIds(
        state,
        archiveExporter,
        {
          ids: Array.from({ length: 13 }, (_, index) => `chat-${String(index + 1).padStart(4, "0")}`),
          complete: true,
          warnings: []
        },
        "json"
      ),
      (error) => error && error.stopOperation === true && error.status === 429
    );
  } finally {
    if (typeof previousCollector === "undefined") {
      delete globalThis.__chatgptUsageCollectMany;
    } else {
      globalThis.__chatgptUsageCollectMany = previousCollector;
    }
  }

  assert.equal(collectionCalls, 1, "no later six-item chunk may start");
  assert.equal(downloadCalls, 0);
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

test("archive filenames use the current UTC calendar date", () => {
  assert.equal(
    dashboard._test.localExportDateStamp(new Date("2026-08-24T00:30:00.000Z")),
    "2026-08-24",
  );
});

test("conversation archive basenames avoid case-insensitive and generated-suffix collisions", () => {
  const bases = dashboard._test.uniqueConversationBases(exporter, [
    { id: "chat-0001", title: "Report" },
    { id: "chat-0002", title: "report" },
    { id: "chat-0003", title: "Report-2" },
    { id: "chat-0004", title: "CON" },
    { id: "chat-0005", title: "con" }
  ]);

  assert.deepEqual(bases, ["Report", "report-chat0002", "Report-2", "_CON", "_con-chat0005"]);
  assert.equal(new Set(bases.map((name) => name.toLowerCase())).size, bases.length);
});
