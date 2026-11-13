const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const dashboard = require("../src/dashboard");

function createStats() {
  return {
    totals: {
      "future-family-2026-thinking": 3
    },
    byDate: {},
    models: {
      "future-family-2026-thinking": {
        mode: "thinking",
        parameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high"
        }
      }
    },
    sessionsByModel: {
      "future-family-2026-thinking": {
        "conversation-alpha": {
          conversationId: "conversation-alpha",
          title: "Alpha research",
          count: 3,
          models: { "future-family-2026-thinking": 3 },
          lastSubmittedAt: "2026-05-30T15:00:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/conversation-alpha"
        }
      }
    },
    relationsByModel: {
      "future-family-2026-thinking": {
        "future-family-2026-thinking\u0001future-family-2026-thinking": {
          requestModel: "future-family-2026-thinking",
          responseModel: "future-family-2026-thinking",
          count: 3,
          efforts: { high: 3 },
          features: { web_search: 1 },
          sourceModes: { chat: 3 },
          conversations: {
            "conversation-alpha": {
              conversationId: "conversation-alpha",
              title: "Alpha research",
              count: 3,
              lastSubmittedAt: "2026-05-30T15:00:00.000Z",
              lastPageUrl: "https://chatgpt.com/c/conversation-alpha",
              sourceMode: "chat"
            }
          }
        }
      }
    },
    events: []
  };
}

function createDirtyStats() {
  return {
    totals: {
      "gpt-5-5-preview": 31,
      "GPT-5.5": 2,
      "GPT-5 5": 1,
      "Unknown model": 4,
      "gpt-5-thinking": 3
    },
    byDate: {
      "2026-05-30": {
        "gpt-5-5-preview": 31,
        "GPT-5.5": 2,
        "GPT-5 5": 1,
        "Unknown model": 4,
        "gpt-5-thinking": 3
      }
    },
    models: {
      "gpt-5-5-preview": {
        apiModel: "gpt-5-thinking",
        chatgptModel: "gpt-5-5-preview",
        parameters: { model: "gpt-5-thinking" }
      },
      "gpt-5-thinking": {
        apiModel: "gpt-5-thinking",
        chatgptModel: "gpt-5-thinking",
        mode: "thinking",
        parameters: { model: "gpt-5-thinking" }
      }
    },
    sessionsByModel: {
      "gpt-5-5-preview": {
        dirty: { conversationId: "dirty", title: "Dirty", count: 31, models: { "gpt-5-5-preview": 31 } }
      },
      "gpt-5-thinking": {
        clean: { conversationId: "clean", title: "Clean", count: 3, models: { "gpt-5-thinking": 3 }, lastSubmittedAt: "2026-05-30T15:00:00.000Z" }
      }
    },
    variantsByModel: {},
    parametersByModel: {},
    featuresByModel: {},
    events: [
      {
        model: "gpt-5-5-preview",
        requestModel: "gpt-5-thinking",
        responseModel: "gpt-5-5-preview",
        apiModel: "gpt-5-thinking",
        modelParameters: { model: "gpt-5-thinking" },
        dateKeyBasis: "utc",
        submittedAt: "2026-05-30T14:00:00.000Z",
        conversationId: "dirty",
        pageTitle: "Dirty",
        pageUrl: "https://chatgpt.com/c/dirty"
      },
      {
        model: "gpt-5-thinking",
        requestModel: "gpt-5-thinking",
        responseModel: "gpt-5-thinking",
        apiModel: "gpt-5-thinking",
        modelParameters: { model: "gpt-5-thinking" },
        dateKeyBasis: "utc",
        submittedAt: "2026-05-30T15:00:00.000Z",
        conversationId: "clean",
        pageTitle: "Clean",
        pageUrl: "https://chatgpt.com/c/clean"
      }
    ]
  };
}

test("popup shell uses an expanded extension popup viewport", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "src", "popup.css"), "utf8");

  assert.match(css, /html\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.shell\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*8px;/);
});

test("dashboard popup owns the single scroll layer", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");

  assert.match(source, /\.usage-dashboard-popup\{[^}]*overflow:auto/);
  assert.doesNotMatch(source, /\.usage-view-panel\{[^}]*overflow:auto/);
});

test("status view uses staged fitting and never falls back to a scrollbar or hidden-row layout", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");

  assert.match(source, /function fitStatusPanel\(state\)/);
  assert.match(source, /tryColumnRange\(columnLimit\(128, 3\)\)/);
  assert.match(source, /usage-status-dense/);
  assert.match(source, /tryColumnRange\(columnLimit\(108, 3\)\)/);
  assert.match(source, /usage-status-ultra/);
  assert.match(source, /tryColumnRange\(columnLimit\(92, 4\)\)/);
  assert.match(source, /statusPanel\.style\.setProperty\("zoom", scale\.toFixed\(3\)\)/);
  assert.match(source, /--usage-status-font-compensation/);
  assert.doesNotMatch(source, /usage-status-overflow/);
  assert.doesNotMatch(source, /\.usage-active-status[^}]*overflow:auto/);
});

test("model conversations stay inside their request-response relation and are not selection controls", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");
  const sessionsStart = html.indexOf('<div class="usage-relation-conversation-list">');
  const sessionsEnd = html.indexOf("</details>", sessionsStart);
  const sessionsHtml = html.slice(sessionsStart, sessionsEnd);

  assert.notEqual(sessionsStart, -1);
  assert.match(html, /usage-model-relation/);
  assert.match(html, /future-family-2026-thinking/);
  assert.doesNotMatch(html, /future-family-2026-pro/);
  assert.match(html, /usage-effort-high">high<\/b>/);
  assert.doesNotMatch(html, />Reasoning effort</);
  assert.doesNotMatch(html, /usage-feature-row|usage-feature-list/);
  assert.match(sessionsHtml, /usage-relation-conversation/);
  assert.match(sessionsHtml, /usage-source-mode/);
  assert.match(sessionsHtml, /usage-index-link/);
  assert.match(sessionsHtml, /data-session-id="conversation-alpha"/);
  assert.match(sessionsHtml, /Alpha research/);
  // 日期改为紧凑格式 MM-DD HH:mm,窄面板里完整显示、不再被截成省略号;不再是 5/30/2026, 11:00:00 PM 长格式
  assert.match(sessionsHtml, /\d{2}-\d{2} \d{2}:\d{2}/);
  assert.doesNotMatch(sessionsHtml, /\d{1,2}\/\d{1,2}\/\d{4}/);
  assert.doesNotMatch(sessionsHtml, /\b(AM|PM)\b/);
  assert.doesNotMatch(sessionsHtml, /<input\b/);
  assert.doesNotMatch(sessionsHtml, /type="checkbox"/);
  assert.doesNotMatch(sessionsHtml, /usage-session-titlebar/);
  assert.doesNotMatch(html, /usage-session-pill/);
  assert.match(source, /\.usage-relation-conversation\{[^}]*grid-template-columns:auto minmax\(0,1fr\);[^}]*align-items:start/);
  assert.match(source, /\.usage-index-content\{[^}]*display:flex;[^}]*align-items:baseline;[^}]*overflow:hidden/);
  assert.match(source, /\.usage-index-content small\{[^}]*flex:0 0 auto;[^}]*white-space:nowrap/);
  assert.doesNotMatch(source, /\.usage-relation-conversation\{[^}]*border-radius/);
  assert.doesNotMatch(source, /\.usage-relation-conversation\{[^}]*box-shadow/);
});

test("mapped usage view shows only the selected public model and omits internal or unresolved aliases", () => {
  const html = dashboard.renderActiveView(
    {
      language: "en",
      activeView: "usage",
      loading: false,
      stats: createDirtyStats(),
      selectedModels: { "gpt-5-thinking": true },
      startDate: "2026-05-30",
      endDate: "2026-05-30"
    },
    ["gpt-5-thinking"]
  );

  assert.match(html, /gpt-5-thinking/);
  assert.match(html, /Clean/);
  ["gpt-5-5-preview", "GPT-5.5", "GPT-5 5", "Unknown model", "Dirty"].forEach((value) => {
    assert.doesNotMatch(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), value);
  });
  assert.doesNotMatch(html, /usage-chart-legend|data-model-toggle=/);
});
