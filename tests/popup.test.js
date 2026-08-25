const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const popupCss = () => fs.readFileSync(path.join(__dirname, "..", "src", "popup.css"), "utf8");
const dashboardSource = () => fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");
const popupSource = () => fs.readFileSync(path.join(__dirname, "..", "src", "popup.js"), "utf8");

function runPopup(options = {}) {
  const calls = {
    init: 0,
    cancelledPendingIndex: 0,
    windowListeners: {},
    query: [],
    messages: []
  };
  const root = {};
  const runtime = { lastError: null };
  const activeTabs = Object.prototype.hasOwnProperty.call(options, "tabs")
    ? options.tabs
    : [{ id: 17, url: "https://chatgpt.com/c/example" }];
  const chrome = options.withChrome === false ? undefined : {
    runtime,
    tabs: {
      query(queryInfo, callback) {
        calls.query.push(queryInfo);
        if (options.queryThrows) {
          throw new Error("query unavailable");
        }
        runtime.lastError = options.queryError ? { message: "query failed" } : null;
        callback(activeTabs);
        runtime.lastError = null;
      },
      sendMessage(tabId, message, callback) {
        calls.messages.push({ tabId, message });
        if (options.sendThrows) {
          throw new Error("no receiver");
        }
        runtime.lastError = options.sendError ? { message: "no receiver" } : null;
        callback(options.response);
        runtime.lastError = null;
      }
    }
  };
  const context = {
    URL,
    document: {
      documentElement: { lang: "en" },
      getElementById(id) {
        return id === "dashboard-root" ? root : null;
      }
    },
    window: {
      addEventListener(type, listener) {
        calls.windowListeners[type] = listener;
      },
      ChatGPTUsageDashboard: {
        init(receivedRoot, config) {
          calls.init += 1;
          calls.initRoot = receivedRoot;
          calls.initConfig = config;
          return {
            cancelPendingExportConversationList() {
              calls.cancelledPendingIndex += 1;
            }
          };
        }
      }
    }
  };
  if (chrome) {
    context.chrome = chrome;
  }
  vm.runInNewContext(popupSource(), context, { filename: "src/popup.js" });
  return calls;
}

test("popup initializes without reading the model catalog until the Usage view activates", () => {
  const calls = runPopup();

  assert.equal(calls.init, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.query)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.messages)), []);

  calls.initConfig.onUsageViewActivate();

  assert.deepEqual(JSON.parse(JSON.stringify(calls.query)), [{ active: true, currentWindow: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.messages)), [{
    tabId: 17,
    message: { type: "usage.catalog.ensure" }
  }]);
  calls.initConfig.onUsageViewActivate();
  assert.equal(calls.query.length, 1, "one popup session ensures the catalog only once");
  assert.equal(calls.messages.length, 1, "re-rendering the Usage view does not add another request");
  assert.equal(typeof calls.windowListeners.pagehide, "function");
});

test("closing the popup cancels only its still-pending export index through the dashboard handle", () => {
  const calls = runPopup();

  calls.windowListeners.pagehide();

  assert.equal(calls.cancelledPendingIndex, 1);
});

test("popup catalog assurance silently skips non-ChatGPT and missing active tabs", () => {
  for (const tabs of [
    [],
    [{ id: 4, url: "https://example.com/" }],
    [{ id: 5 }],
    [{ id: 6, url: "http://chatgpt.com/" }]
  ]) {
    const calls = runPopup({ tabs });
    assert.equal(calls.init, 1);
    assert.equal(calls.messages.length, 0);
  }
});

test("popup remains initialized when tab lookup or catalog messaging is unavailable", () => {
  for (const options of [
    { withChrome: false },
    { queryThrows: true },
    { queryError: true },
    { sendThrows: true },
    { sendError: true }
  ]) {
    const calls = runPopup(options);
    assert.equal(calls.init, 1);
    calls.initConfig.onUsageViewActivate();
  }
});

test("popup viewport is fixed at 430x600 and delegates scrolling to the dashboard", () => {
  const css = popupCss();
  const dashboard = dashboardSource();

  assert.match(css, /html\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /body\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.shell\s*\{[\s\S]*width:\s*430px;[\s\S]*height:\s*600px;[\s\S]*overflow:\s*hidden;[\s\S]*padding:\s*8px;/);
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
