const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const popupCss = () => fs.readFileSync(path.join(__dirname, "..", "src", "popup.css"), "utf8");
const dashboardSource = () => fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");

test("popup viewport is compact and delegates scrolling to the dashboard", () => {
  const css = popupCss();
  const dashboard = dashboardSource();

  assert.match(css, /html\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.shell\s*\{[\s\S]*width:\s*400px;[\s\S]*height:\s*560px;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*8px;/);
  assert.match(dashboard, /\.usage-dashboard-popup\{[^}]*height:100%;[^}]*overflow:auto/);
  assert.match(dashboard, /\.usage-dashboard-page\{[^}]*height:100%;[^}]*overflow:auto/);
});

test("popup palette uses restrained data-tool surfaces", () => {
  const css = popupCss();

  // 弹窗页面背景与页面内面板统一为 #fbfcfa(暗色 #2a2b32),避免 .shell 内边距露出旧色边框
  assert.match(css, /--usage-surface-page:\s*#fbfcfa;/);
  assert.match(css, /--usage-text-primary:\s*#18201c;/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|background-clip:\s*text/);
});
