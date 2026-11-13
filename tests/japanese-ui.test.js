"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const dashboard = require("../src/dashboard.js");

function settings(language, showPageButton) {
  return {
    language,
    showPageButton,
    settingsSubmenu: "",
    sourceModeFilter: "all",
    statisticsMode: "mapped",
    themeMode: "system",
    showLineChart: true,
    showDonutChart: false,
    showTextStatistics: true,
    statisticsSectionOrder: ["line", "donut", "text"]
  };
}

test("Japanese dashboard translates its empty state and settings, retaining EN/ZH", () => {
  assert.match(
    dashboard.renderModelTextList({ totals: {}, byDate: {}, events: [] }, { language: "ja" }),
    /モデルの記録はまだありません/
  );
  const ja = dashboard.renderSettingsMenu(settings("ja", false));
  assert.match(ja, /data-language-select="ja"/);
  assert.match(ja, /日本語/);
  assert.match(ja, /data-page-button-select="hide" aria-pressed="true"/);
  assert.match(ja, /ページ内ボタン/);
  assert.match(ja, /非表示/);
  const en = dashboard.renderSettingsMenu(settings("en", true));
  const zh = dashboard.renderSettingsMenu(settings("zh", true));
  assert.match(en, /In-page button/);
  assert.match(zh, /网页内入口/);
  assert.match(en, /data-language-select="en"/);
  assert.match(zh, /data-language-select="zh"/);
});

test("Japanese locale includes every English dictionary key with matching substitutions", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/dashboard.js"), "utf8");
  const chunk = source.slice(source.indexOf("  var I18N = {"), source.indexOf("  function normalizeLanguage("));
  const enBase = chunk.match(/    en: \{([\s\S]*?)\n    \}/)[1];
  const enExtra = chunk.match(/  I18N\.en = Object\.assign\(\{\}, I18N\.en, \{([\s\S]*?)\n  \}\);/)[1];
  const ja = chunk.match(/  I18N\.ja = Object\.assign\(\{\}, I18N\.en, \{([\s\S]*?)\n  \}\);/)[1];
  function entries(input) {
    const result = new Map();
    for (const match of input.matchAll(/^\s*(?:"(\w+)"|(\w+)):\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/gm)) {
      result.set(match[1] || match[2], JSON.parse(match[3]));
    }
    return result;
  }
  const en = new Map([...entries(enBase), ...entries(enExtra)]);
  const jp = entries(ja);
  assert.ok(en.size >= 190);
  for (const [key, value] of en) {
    assert.ok(jp.has(key), "Missing Japanese string for " + key);
    const tokens = (input) => [...input.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort();
    assert.deepEqual(tokens(jp.get(key)), tokens(value), "Template tokens mismatch: " + key);
  }
});

test("Chrome entry point and background both recognize Japanese", () => {
  const popup = fs.readFileSync(path.join(__dirname, "../src/popup.js"), "utf8");
  const background = fs.readFileSync(path.join(__dirname, "../src/background.js"), "utf8");
  const content = fs.readFileSync(path.join(__dirname, "../src/content.js"), "utf8");
  assert.match(popup, /\^ja/);
  assert.match(popup, /language === "ja" \? "ja"/);
  assert.match(background, /value === "zh" \|\| value === "ja"/);
  assert.match(content, /"モデル使用量"/);
  assert.match(content, /showPageButton !== false/);
});

test("Japanese readable exports preserve localized labels and role names", () => {
  const exporter = require("../src/exporter.js");
  const conversations = [{ id: "japanese-fixture", title: "日本語の会話", messages: [
    { id: "japanese-user", role: "user", text: "こんにちは" },
    { id: "japanese-assistant", role: "assistant", text: "こんにちは！" }
  ] }];
  const markdown = exporter.exportMarkdown(conversations, { language: "ja" });
  assert.match(markdown, /\*\*あなた\*\*/);
  assert.match(markdown, /リクエストモデル: 不明/);
  assert.match(markdown, /実際の応答モデル: 不明/);
  assert.match(markdown, /思考強度: 不明/);
  assert.doesNotMatch(markdown, /Request model: Unknown/);
});

test("Japanese settings survive sanitization while hidden page button stays disabled", () => {
  const background = require("../src/background.js");
  const sanitized = background.sanitizeSettings({ language: "ja", showPageButton: false });
  assert.equal(sanitized.language, "ja");
  assert.equal(sanitized.showPageButton, false);
  assert.equal(background.sanitizeSettings({ language: "fr" }).language, "en");
  assert.equal(background.sanitizeSettings({}).showPageButton, true);
});
