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
        apiModel: "gpt-5-thinking",
        modelParameters: { model: "gpt-5-thinking" },
        submittedAt: "2026-05-30T14:00:00.000Z",
        conversationId: "dirty",
        pageTitle: "Dirty",
        pageUrl: "https://chatgpt.com/c/dirty"
      },
      {
        model: "gpt-5-thinking",
        apiModel: "gpt-5-thinking",
        modelParameters: { model: "gpt-5-thinking" },
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

  assert.match(css, /html\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.shell\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*8px;/);
});

test("dashboard popup owns the single scroll layer", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");

  assert.match(source, /\.usage-dashboard-popup\{[^}]*overflow:auto/);
  assert.doesNotMatch(source, /\.usage-view-panel\{[^}]*overflow:auto/);
});

test("model conversation index renders as an index, not selection controls", () => {
  const html = dashboard.renderModelTextList(createStats(), { language: "en" });
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");
  const sessionsStart = html.indexOf('<div class="usage-record-sessions">');
  const sessionsEnd = html.indexOf("</div></div>", sessionsStart);
  const sessionsHtml = html.slice(sessionsStart, sessionsEnd);

  assert.notEqual(sessionsStart, -1);
  assert.match(sessionsHtml, /usage-index-number/);
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
  assert.match(source, /\.usage-record-session-row\{[^}]*border:0/);
  assert.match(source, /\.usage-record-session-row\{[^}]*grid-template-columns:16px minmax\(0,1fr\);[^}]*align-items:baseline;[^}]*padding:0;[^}]*background:transparent;[^}]*line-height:17px/);
  assert.match(source, /\.usage-index-content\{[^}]*display:flex;[^}]*align-items:baseline;[^}]*overflow:hidden/);
  assert.match(source, /\.usage-index-content small\{[^}]*flex:0 0 auto;[^}]*white-space:nowrap/);
  assert.doesNotMatch(source, /\.usage-record-session-row\{[^}]*border-radius/);
  assert.doesNotMatch(source, /\.usage-record-session-row\{[^}]*box-shadow/);
  assert.doesNotMatch(source, /\.usage-record-session-row\+\.usage-record-session-row/);
  assert.doesNotMatch(source, /\.usage-record-sessions\{[^}]*border/);
});

test("usage view keeps exact thinking slug and omits invalid historical labels", () => {
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
});

