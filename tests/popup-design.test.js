const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const popupCss = () => fs.readFileSync(path.join(__dirname, "..", "src", "popup.css"), "utf8");
const dashboardSource = () => fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");

test("popup keeps one viewport-sized shell and one dashboard scroll layer", () => {
  const css = popupCss();
  const dashboard = dashboardSource();

  assert.match(css, /html\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.shell\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*8px;/);
  assert.match(dashboard, /\.usage-dashboard-popup\{[^}]*height:100%;[^}]*max-height:100%;[^}]*overflow:auto/);
  assert.doesNotMatch(dashboard, /\.usage-view-panel\{[^}]*overflow:auto/);
});

test("expanded model details stay flat without nested card treatments", () => {
  const dashboard = dashboardSource();

  assert.match(dashboard, /\.usage-count-record\{[^}]*border:0;[^}]*border-bottom:1px solid var\(--usage-border-divider\);[^}]*border-radius:0;[^}]*background:transparent/);
  assert.match(dashboard, /data-model-record-details/);
  assert.doesNotMatch(dashboard, /data-model-record-toggle/);
  assert.doesNotMatch(dashboard, /addEventListener\("pointerdown"/);
  assert.match(dashboard, /<summary class="usage-count-row">/);
  assert.doesNotMatch(dashboard, /<div class="usage-count-row">/);
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
});

test("statistics typography has a stable primary, secondary, and dimension hierarchy", () => {
  const dashboard = dashboardSource();

  assert.match(dashboard, /\.usage-topline h2\{[^}]*font-size:15px;[^}]*line-height:1\.25;[^}]*font-weight:750/);
  assert.match(dashboard, /\.usage-chart-head strong\{[^}]*font-size:14px;[^}]*line-height:1\.35;[^}]*font-weight:700/);
  assert.match(dashboard, /\.usage-export-title\{[^}]*font-size:14px;[^}]*line-height:1\.35;[^}]*font-weight:700/);
  assert.match(
    dashboard,
    /\.usage-count-row strong,\.usage-count-numbers b,\.usage-internal-request-head \.usage-internal-model-copy code,\.usage-internal-count\{font-size:13px;line-height:1\.35;font-weight:750\}/
  );
  assert.match(
    dashboard,
    /\.usage-internal-response-value code,\.usage-internal-effort-values>span,\.usage-internal-effort-values b,\.usage-internal-subcount,\.usage-subcount\{font-size:12px;line-height:1\.4;font-weight:650\}/
  );
  assert.match(
    dashboard,
    /\.usage-internal-request-head \.usage-internal-model-copy small,\.usage-internal-response-heading,\.usage-record-label,\.usage-relation-model small\{font-size:11px;line-height:1\.35;font-weight:650\}/
  );
  assert.match(
    dashboard,
    /\.usage-count-row strong,\.usage-internal-request-head \.usage-internal-model-copy code,\.usage-internal-response-value code,\.usage-relation-head code\{font-family:system-ui,sans-serif!important;font-style:normal;letter-spacing:normal\}/
  );
  assert.match(dashboard, /\.usage-internal-request-head\{[^}]*align-items:end/);
  assert.match(dashboard, /\.usage-internal-request\{[^}]*gap:0;[^}]*padding:0;[^}]*border-bottom:1px solid/);
  assert.match(dashboard, /\.usage-internal-request-head\{[^}]*padding:5px 0/);
  assert.match(dashboard, /\.usage-internal-response-section\{display:grid;gap:1px;padding:3px 0 8px 12px\}/);
  assert.match(dashboard, /\.usage-count-details\{display:grid;gap:5px;padding:0 0 8px 12px\}/);
  assert.match(dashboard, /\.usage-internal-response\{display:grid;gap:4px;padding:3px 0 4px;[^}]*border:0;[^}]*border-top:1px solid[^}]*border-radius:0;[^}]*background:transparent/);
  assert.doesNotMatch(dashboard, /\.usage-count-details\{[^}]*animation:/);
  assert.match(dashboard, /\.usage-view-model-option\{[^}]*font:650 11px\/1\.35 system-ui,sans-serif;[^}]*text-overflow:ellipsis;[^}]*white-space:nowrap/);
  assert.match(dashboard, /\.usage-view-model-option\.active\{[^}]*color:var\(--series\);[^}]*font-weight:750/);
  assert.doesNotMatch(dashboard, /\.usage-view-model-option (?:i|span|b|small)\{/);
  assert.match(dashboard, /\.usage-chart-head small\{font-size:9px;line-height:1\.3;font-weight:650/);
  assert.match(dashboard, /\.usage-axis\{[^}]*font-size:9px;[^}]*font-weight:500/);
  assert.match(dashboard, /\.usage-axis-label\{font-size:9px;font-weight:650\}/);
  assert.match(dashboard, /\.usage-relation-head code,\.usage-relation-head>span\{font-size:12px;line-height:1\.4;font-weight:650\}/);
  assert.match(dashboard, /\.usage-relation-values>span,\.usage-relation-values b\{font-size:12px;line-height:1\.4;font-weight:650\}/);
  assert.match(dashboard, /\.usage-param-row b,\.usage-param-row span,\.usage-variant-row b,\.usage-variant-row span\{font-size:11px;line-height:1\.4;font-weight:650\}/);
  assert.match(dashboard, /\.usage-index-link\{[^}]*font-size:12px;[^}]*line-height:1\.4;[^}]*font-weight:650/);
  assert.match(dashboard, /\.usage-internal-response \.usage-index-link\{font-size:11px;line-height:1\.35;font-weight:600\}/);
  assert.match(
    dashboard,
    /\.usage-internal-response-value>\.usage-internal-response-copy\{[^}]*display:grid;[^}]*grid-template-rows:auto auto;[^}]*align-items:baseline/
  );
  assert.match(
    dashboard,
    /\.usage-internal-response-headings,\.usage-internal-response-data\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(96px,1fr\);align-items:baseline;column-gap:10px;min-width:0\}/
  );
  assert.match(dashboard, /\.usage-internal-response-headings\{grid-row:1;white-space:nowrap\}/);
  assert.match(dashboard, /\.usage-internal-response-data\{grid-row:2\}/);
  assert.match(dashboard, /\.usage-internal-response-heading\{grid-column:1;[^}]*white-space:nowrap\}/);
  assert.match(dashboard, /\.usage-internal-effort-heading\{grid-column:2\}/);
  assert.match(dashboard, /\.usage-internal-response-data>code\{grid-column:1\}/);
  assert.match(dashboard, /\.usage-internal-effort-values\{grid-column:2;display:inline-flex;[^}]*align-items:baseline;[^}]*flex-wrap:wrap/);
  assert.match(dashboard, /\.usage-relation-dimension\{[^}]*grid-template-columns:72px minmax\(0,1fr\);[^}]*align-items:baseline/);
  assert.match(dashboard, /\.usage-internal-response-summary\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(dashboard, /\.usage-internal-response-model-row\{[^}]*display:block/);
  assert.match(dashboard, /<details class="usage-settings-menu"/);
  assert.match(dashboard, /class="usage-settings-popover"/);
  assert.match(dashboard, /renderSettingsCategory\(\s*state,\s*"sections"/);
  assert.doesNotMatch(dashboard, /usage-statistics-display-menu|usage-statistics-display-popover/);
  assert.match(dashboard, /"data-statistics-section"/);
  assert.match(dashboard, /return '<button type="button" class="usage-settings-option/);
  assert.doesNotMatch(dashboard, /<input[^>]*data-statistics-section=/);
  assert.match(dashboard, /return '<button type="button" class="usage-view-model-option/);
  assert.doesNotMatch(dashboard, /<input[^>]*data-model-toggle=/);
  assert.doesNotMatch(dashboard, /usage-chart-legend/);
  const fractionalStatisticsFonts = Array.from(
    dashboard.matchAll(
      /"(\.usage-(?:statistics-warning|empty|donut-legend-row small|count-features span,\.usage-count-features b|index-number|index-content small)\{[^"]*?font-size:(\d+\.\d+)px[^"]*?\})"/g
    ),
    (match) => `${match[1].match(/^([^{]+)/)[1]}: ${match[2]}px`
  );
  assert.deepEqual(
    fractionalStatisticsFonts,
    [],
    `statistics typography must use integer font-size levels; found ${fractionalStatisticsFonts.join(", ")}`
  );
  assert.doesNotMatch(dashboard, /ui-monospace|SFMono-Regular|Consolas,monospace/);
  assert.doesNotMatch(dashboard, /usage-internal-same-note|responseModelSame/);
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

  assert.match(dashboard, /:focus-visible\{outline:2px solid/);
  assert.match(dashboard, /\.usage-view-tab:hover:not\(\.active\)/);
  assert.match(dashboard, /\.usage-date-controls input:focus/);
  assert.match(dashboard, /\.usage-date-controls input:invalid/);
  assert.match(
    dashboard,
    /\.usage-settings-menu \.usage-settings-item\[open\]:not\(\.is-closing\)>\.usage-settings-submenu,\.usage-settings-menu:not\(\[data-interaction-mode=\\"click\\"\]\) \.usage-settings-item:not\(\.is-closing\):hover>\.usage-settings-submenu,\.usage-settings-menu:not\(\[data-interaction-mode=\\"click\\"\]\) \.usage-settings-item:not\(\.is-closing\):focus-within>\.usage-settings-submenu/
  );
  assert.match(
    dashboard,
    /\.usage-view-tab-item-chart\[data-model-menu-open=\\"true\\"\]>\.usage-view-model-menu/
  );
  assert.match(dashboard, /\.usage-view-model-menu\{[^}]*top:100%;[^}]*width:100%;/);
  assert.match(dashboard, /\.usage-view-model-option:hover,\.usage-view-model-option:focus-visible/);
  assert.match(dashboard, /\.usage-line-direct-label-hit\{fill:transparent;pointer-events:all\}/);
  assert.match(dashboard, /data-view-preview="' \+ \(state\.viewPreviewActive \? "true" : "false"\)/);
  assert.match(dashboard, /data-interaction-mode="' \+/);
  assert.match(
    dashboard,
    /\.usage-settings-submenu\{[^}]*top:-5px;[^}]*right:calc\(100% - 1px\);[^}]*width:192px;[^}]*max-height:min\(320px,calc\(100vh - 96px\)\);[^}]*overflow:auto/
  );
  assert.match(dashboard, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(dashboard, /\.usage-export-btn:focus-visible\{outline:2px solid/);
});

test("chart trajectory and points use synchronized, position-stable animation", () => {
  const dashboard = dashboardSource();

  const colors = Array.from(
    dashboard.match(/var COLORS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g),
    (match) => match[1]
  );
  const lineStyles = Array.from(
    dashboard.match(/var LINE_STYLES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g),
    (match) => match[1]
  );

  assert.equal(colors.length, 16);
  assert.equal(new Set(colors).size, colors.length);
  assert.ok(colors.every((color, index) => color.includes(`--usage-chart-series-${index + 1}`)));
  assert.deepEqual(lineStyles, ["none", "8 4", "2 3", "10 3 2 3", "14 4", "4 3 1 3", "1 4", "7 2 1 2"]);
  assert.equal(new Set(lineStyles).size, lineStyles.length);
  assert.match(dashboard, /function stableVisualIndex\(value, size\)/);
  assert.match(dashboard, /var preferred = stableVisualIndex\(key, COLORS\.length\)/);
  assert.match(dashboard, /while \(occupied\[index\] && attempts < COLORS\.length\)/);
  assert.match(dashboard, /result\[key\] = COLORS\[index\]/);
  assert.match(dashboard, /result\[key\] = "hsl\(" \+ hue\.toFixed\(1\) \+ " 72% 48%\)"/);
  assert.match(dashboard, /var CHART_SIZE = \{ width: 360, height: 174 \}/);
  assert.match(
    dashboard,
    /lineStyleByModel\[series\.model\] = LINE_STYLES\[\s*stableVisualIndex\(interactionType \+ ":" \+ series\.model, LINE_STYLES\.length\)\s*\]/
  );
  assert.match(dashboard, /series\.lineStyle = interactionType === "effort" && series\.model === "unknown"[\s\S]*\? "3 3"[\s\S]*: \(lineStyleByModel\[series\.model\] \|\| "none"\)/);
  assert.match(dashboard, /<g class="usage-series"[^>]*style="--usage-line-dash:/);
  assert.match(dashboard, /\.usage-line\{[^}]*stroke-dasharray:var\(--usage-line-dash,none\)/);
  assert.match(dashboard, /class="usage-plot-background"/);
  assert.match(dashboard, /\.usage-grid-horizontal\{stroke-opacity:\.72\}/);
  assert.match(dashboard, /\.usage-grid-vertical\{stroke-opacity:\.34\}/);
  assert.match(dashboard, /class="usage-overlap-ring"[^>]*data-overlap-count=/);
  assert.match(dashboard, /\.usage-overlap-ring\{[^}]*stroke-dasharray:2 2/);
  assert.match(dashboard, /class="usage-line-focus usage-line-focus-halo"/);
  assert.match(dashboard, /class="usage-line-focus usage-line-focus-color"/);
  assert.match(dashboard, /class="usage-line-direct-label"/);
  assert.match(dashboard, /class="usage-donut-labels"/);
  assert.match(dashboard, /class="usage-donut-label"/);
  assert.match(dashboard, /\.usage-line-direct-label text\{font-size:9px;font-weight:750/);
  assert.match(dashboard, /\.usage-donut-label span\{[^}]*font-size:12px;[^}]*font-weight:700/);
  assert.match(dashboard, /\.usage-donut-label b\{font-size:17px;[^}]*font-weight:780/);
  assert.match(dashboard, /\.usage-donut-label small\{[^}]*font-size:14px;[^}]*font-weight:700/);
  assert.doesNotMatch(dashboard, /usage-chart-legend/);

  assert.match(dashboard, /<mask id="' \+ maskId[\s\S]*?<path class="usage-line-mask"/);
  assert.match(dashboard, /mask="url\(#' \+ maskId/);
  assert.match(dashboard, /var progress = pointCount > 1 \? pointIndex \/ \(pointCount - 1\) : 0/);
  assert.match(dashboard, /var pointDelay = \(0\.04 \+ progress \* 0\.52\)\.toFixed\(3\)/);
  assert.match(dashboard, /style="--usage-point-delay:/);
  assert.match(dashboard, /function nearestPathProgress\(path, x, y\)/);
  assert.match(dashboard, /path\.getTotalLength\(\)/);
  assert.match(dashboard, /path\.getPointAtLength\(length\)/);
  assert.match(dashboard, /var progress = nearestPathProgress\(/);
  assert.match(dashboard, /point\.style\.setProperty\("--usage-point-delay", \(progress \* 0\.56\)\.toFixed\(3\) \+ "s"\)/);
  assert.match(dashboard, /\.usage-line-mask\{[^}]*stroke-dasharray:1;[^}]*stroke-dashoffset:1;[^}]*animation:usage-line-reveal \.56s linear forwards\}/);
  assert.match(dashboard, /\.usage-point\{[^}]*animation:usage-point-in \.18s ease-out var\(--usage-point-delay,\.06s\)/);
  assert.match(dashboard, /\.usage-donut-slice\{[^}]*animation:usage-donut-draw \.52s cubic-bezier\(\.22,\.72,\.25,1\)/);
  assert.match(dashboard, /\.usage-view-panel\{[^}]*animation:usage-panel-in \.16s ease-out both\}/);
  assert.match(dashboard, /\.usage-settings-popover\{[^}]*transition:opacity \.16s ease,transform \.16s ease,visibility 0s linear \.16s/);
  assert.match(dashboard, /\.usage-settings-submenu\{[^}]*transition:opacity \.15s ease,transform \.15s ease,visibility 0s linear \.15s/);
  assert.doesNotMatch(dashboard, /\.usage-point\{[^}]*transform:/);
  assert.match(dashboard, /@keyframes usage-line-reveal\{to\{stroke-dashoffset:0\}\}/);
  assert.match(dashboard, /@keyframes usage-point-in\{from\{opacity:0\}to\{opacity:1\}\}/);
  assert.doesNotMatch(dashboard, /@keyframes usage-point-in\{[^}]*transform:/);
  assert.match(
    dashboard,
    /@media \(prefers-reduced-motion:reduce\)\{[^}]*\.usage-line-mask,[^}]*\.usage-point,[^}]*\{animation:none\}[^}]*\.usage-line-mask\{stroke-dashoffset:0\}[^}]*\.usage-point\{opacity:1\}/
  );
});

test("export tab is wired with all five conversation formats", () => {
  const dashboard = dashboardSource();

  assert.match(dashboard, /id: "export"/);
  assert.match(dashboard, /data-export-format=/);
  assert.match(dashboard, /exportFormatJson/);
  assert.match(dashboard, /exportFormatMarkdown/);
  assert.match(dashboard, /exportFormatPdf/);
  assert.match(dashboard, /exportFormatPng/);
  assert.match(dashboard, /exportFormatDocx/);
});

test("export keeps the conversation checkbox list, uses Canvas for PNG, and searchable text for PDF", () => {
  const dashboard = dashboardSource();
  // 用户从同一个列表明确选择一个或多个对话；全选/清空只是辅助操作。
  assert.match(dashboard, /data-export-conv/);
  assert.match(dashboard, /data-export-selectall/);
  assert.match(dashboard, /data-export-selectnone/);
  assert.doesNotMatch(dashboard, /data-export-scope/);
  assert.doesNotMatch(dashboard, /exportScopeCurrent/);
  assert.doesNotMatch(dashboard, /exportScopeSelected/);
  assert.doesNotMatch(dashboard, /exportScopeAll/);
  assert.match(dashboard, /collectConversationChunk/);
  assert.match(dashboard, /chunkSize = 6/);
  assert.match(dashboard, /buildZip/);
  // PNG 走 Canvas；PDF 走独立文本生成器，保留可搜索、可选择、可复制的文字层。
  assert.match(dashboard, /renderConversationsCanvas/);
  assert.match(dashboard, /format === "pdf"/);
  assert.match(dashboard, /exporter\.buildPdf/);
  assert.doesNotMatch(dashboard, /format === "pdf" && typeof exporter\.buildPdfBlobFromConversations/);
});

test("bare GPT request slugs are stored exactly", () => {
  const catalog = require("../src/model-catalog");
  assert.equal(catalog.resolveModelInfo("gpt-5-5").label, "gpt-5-5");
  assert.equal(catalog.resolveModelInfo("gpt-5-5").mode, "");
  assert.equal(catalog.resolveModelInfo("gpt-5-3").label, "gpt-5-3");
  // thinking 不受影响
  assert.equal(catalog.resolveModelInfo("gpt-5-5-thinking").label, "gpt-5-5-thinking");
});

test("background treats the current request model as authoritative over stale DOM metadata", () => {
  const background = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  assert.match(background, /current request and is authoritative/i);
  assert.doesNotMatch(background, /isBareGptFamilyBase/);
  assert.doesNotMatch(background, /isMoreSpecificGptVariant/);
});
