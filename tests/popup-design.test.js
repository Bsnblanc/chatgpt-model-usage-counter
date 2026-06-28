const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const popupCss = () => fs.readFileSync(path.join(__dirname, "..", "src", "popup.css"), "utf8");
const dashboardSource = () => fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");

test("popup keeps one viewport-sized shell and one dashboard scroll layer", () => {
  const css = popupCss();
  const dashboard = dashboardSource();

  assert.match(css, /html\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.shell\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*8px;/);
  assert.match(dashboard, /\.usage-dashboard-popup\{[^}]*height:100%;[^}]*max-height:100%;[^}]*overflow:auto/);
  assert.doesNotMatch(dashboard, /\.usage-view-panel\{[^}]*overflow:auto/);
});

test("expanded model details stay flat without nested card treatments", () => {
  const dashboard = dashboardSource();

  assert.match(dashboard, /\.usage-count-record\{[^}]*border:0;[^}]*border-bottom:1px solid var\(--usage-border-divider\);[^}]*border-radius:0;[^}]*background:transparent/);
  assert.match(dashboard, /data-model-record-details/);
  assert.doesNotMatch(dashboard, /data-model-record-toggle/);
  assert.doesNotMatch(dashboard, /addEventListener\("pointerdown"/);
  assert.match(dashboard, /<div class="usage-count-row">/);
  assert.doesNotMatch(dashboard, /<button class="usage-count-row"/);
  assert.match(dashboard, /\.usage-count-row\{[^}]*border:0;[^}]*background:transparent;[^}]*font:inherit/);
  assert.match(dashboard, /\.usage-count-details\{[^}]*padding:0 0 8px 12px/);
  assert.match(dashboard, /\.usage-record-sessions\{[^}]*gap:0;[^}]*margin:0 0 4px 0;[^}]*padding:0/);
  assert.match(dashboard, /\.usage-record-session-row\{[^}]*grid-template-columns:16px minmax\(0,1fr\);[^}]*align-items:baseline;[^}]*padding:0;[^}]*border:0;[^}]*background:transparent;[^}]*line-height:17px/);
  assert.match(dashboard, /\.usage-index-content\{[^}]*display:flex;[^}]*align-items:baseline;[^}]*overflow:hidden/);
  assert.match(dashboard, /\.usage-index-content small\{[^}]*flex:0 0 auto;[^}]*white-space:nowrap/);
  assert.doesNotMatch(dashboard, /\.usage-record-session-row\{[^}]*box-shadow/);
  assert.doesNotMatch(dashboard, /\.usage-record-session-row\{[^}]*border-radius/);
  assert.doesNotMatch(dashboard, /\.usage-record-session-row\+\.usage-record-session-row/);
  assert.doesNotMatch(dashboard, /\.usage-record-sessions\{[^}]*border/);
  assert.doesNotMatch(dashboard, /usage-session-pills/);
  assert.doesNotMatch(dashboard, /usage-session-inline/);
  assert.doesNotMatch(dashboard, /<details class="usage-count-record">/);
  assert.doesNotMatch(dashboard, /<summary class="usage-count-row">/);
});

test("status panel stays flat and scoped to ChatGPT web components", () => {
  const dashboard = dashboardSource();

  assert.match(dashboard, /\.usage-openai-hero\{[^}]*border:0;[^}]*border-bottom:1px solid var\(--usage-border-divider\);[^}]*border-radius:0;[^}]*background:transparent/);
  assert.match(dashboard, /function isChatGPTWebStatusComponent/);
  assert.match(dashboard, /\\bchatgpt\\b/);
  assert.match(dashboard, /\\bconversations\?\\b/);
  assert.match(dashboard, /\\bimage generation\\b/);
  assert.match(dashboard, /\\bvoice mode\\b/);
  assert.match(dashboard, /\\bsearch\\b/);
  assert.match(dashboard, /api\|sora\|playground/);
});

test("interactive elements expose visible focus, hover, and reduced-motion handling", () => {
  const dashboard = dashboardSource();

  // 键盘焦点可见(无障碍 P1)
  assert.match(dashboard, /:focus-visible\{outline:2px solid/);
  // 标签页 / 输入 / 模型 chip 的交互态
  assert.match(dashboard, /\.usage-view-tab:hover:not\(\.active\)/);
  assert.match(dashboard, /\.usage-controls input:focus,\.usage-controls select:focus/);
  assert.match(dashboard, /\.usage-controls input:invalid/);
  assert.match(dashboard, /\.usage-model-chip:hover/);
  // 尊重系统减少动画偏好
  assert.match(dashboard, /@media \(prefers-reduced-motion:reduce\)/);
  // 导出面板按钮也有焦点环
  assert.match(dashboard, /\.usage-export-btn:focus-visible\{outline:2px solid/);
});

test("export tab is wired with all four conversation formats", () => {
  const dashboard = dashboardSource();

  assert.match(dashboard, /id: "export"/);
  assert.match(dashboard, /data-export-format=/);
  assert.match(dashboard, /exportFormatMarkdown/);
  assert.match(dashboard, /exportFormatPdf/);
  assert.match(dashboard, /exportFormatPng/);
  assert.match(dashboard, /exportFormatDocx/);
});

test("export shows one conversation list (no scope toggle, no verbose hint) and routes PNG+PDF via Canvas", () => {
  const dashboard = dashboardSource();
  // 多对话选择列表 + 全选
  assert.match(dashboard, /data-export-conv/);
  assert.match(dashboard, /data-export-selectall/);
  assert.match(dashboard, /collectConversationsForExport/);
  // 已移除"当前/选择"两种模式与废话提示
  assert.doesNotMatch(dashboard, /data-export-scope/);
  assert.doesNotMatch(dashboard, /exportConversationHint/);
  // PNG 与 PDF 都走 Canvas(系统中文字体 + Markdown 渲染),而非 ASCII 像素字体/不嵌字体 PDF
  assert.match(dashboard, /renderConversationsCanvas/);
});

test("bare GPT-5.x base is stored and counted as the instant variant", () => {
  const catalog = require("../src/model-catalog");
  assert.equal(catalog.resolveModelInfo("gpt-5-5").label, "gpt-5-5-instant");
  assert.equal(catalog.resolveModelInfo("gpt-5-5").mode, "instant");
  assert.equal(catalog.resolveModelInfo("gpt-5-3").label, "gpt-5-3-instant");
  // thinking 不受影响
  assert.equal(catalog.resolveModelInfo("gpt-5-5-thinking").label, "gpt-5-5-thinking");
});

test("background keeps a specific GPT variant over a bare base from the request body", () => {
  const background = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  assert.match(background, /isBareGptFamilyBase/);
  assert.match(background, /isMoreSpecificGptVariant/);
});
