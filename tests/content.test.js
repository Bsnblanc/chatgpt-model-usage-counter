const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const detector = require("../src/detector");
const modelCatalog = require("../src/model-catalog");

class FakeElement {
  constructor(options = {}) {
    this.tagName = options.tagName || "BUTTON";
    this.innerText = options.innerText || "";
    this.textContent = options.textContent || "";
    this.value = options.value || "";
    this.disabled = Boolean(options.disabled);
    this.style = options.style || {};
    this.attributes = options.attributes || {};
    this.rect = options.rect || { top: 10, left: 10, width: 120, height: 32, right: 130, bottom: 42 };
    this.parent = options.parent || null;
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  closest(selector) {
    if (selector.includes("button") && this.tagName === "BUTTON") {
      return this;
    }

    if (selector.includes("textarea") && this.tagName === "TEXTAREA") {
      return this;
    }

    if (selector.includes("[contenteditable='true']") && this.attributes.contenteditable === "true") {
      return this;
    }

    if (this.parent) {
      return this.parent.closest(selector);
    }

    return null;
  }
}

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  set(value) {
    this.values = new Set(String(value || "").split(/\s+/).filter(Boolean));
    this.sync();
  }

  sync() {
    this.element.attributes.class = Array.from(this.values).join(" ");
  }

  add(...tokens) {
    tokens.filter(Boolean).forEach((token) => this.values.add(token));
    this.sync();
  }

  remove(...tokens) {
    tokens.forEach((token) => this.values.delete(token));
    this.sync();
  }

  contains(token) {
    return this.values.has(token);
  }

  toString() {
    return Array.from(this.values).join(" ");
  }
}

class PanelTestElement {
  constructor(options = {}) {
    this.tagName = (options.tagName || "DIV").toUpperCase();
    this.attributes = { ...(options.attributes || {}) };
    this.children = [];
    this.parentNode = null;
    this.parentElement = null;
    this.style = {};
    this.listeners = {};
    this.rect = options.rect || { top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0 };
    this.hidden = Boolean(options.hidden);
    this.textContent = options.textContent || "";
    this.innerText = options.innerText || "";
    this.classList = new FakeClassList(this);
    if (options.id) this.id = options.id;
    this.classList.set(options.className || this.attributes.class || "");
  }

  get id() {
    return this.attributes.id || "";
  }

  set id(value) {
    this.attributes.id = String(value || "");
  }

  get firstChild() {
    return this.children[0] || null;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || "");
    this.children = [];
    if (!this._innerHTML.includes("chatgpt-model-usage-counter-panel-toggle")) {
      return;
    }

    const toggle = new PanelTestElement({ tagName: "BUTTON", id: "chatgpt-model-usage-counter-panel-toggle" });
    const toggleLabel = new PanelTestElement({ tagName: "SPAN", className: "chatgpt-model-usage-counter-panel-toggle-label" });
    toggle.appendChild(toggleLabel);

    const panel = new PanelTestElement({ tagName: "ASIDE", id: "chatgpt-model-usage-counter-panel", hidden: true });
    const body = new PanelTestElement({ tagName: "DIV", id: "chatgpt-model-usage-counter-panel-body" });
    panel.appendChild(body);
    this.appendChild(toggle);
    this.appendChild(panel);
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    }
    child.parentNode = this;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((item) => item !== child);
    }
    child.parentNode = this;
    child.parentElement = this;
    const index = this.children.indexOf(reference);
    if (index === -1) {
      this.children.unshift(child);
    } else {
      this.children.splice(index, 0, child);
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "class") {
      this.classList.set(value);
    }
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === "class") {
      this.classList.set("");
    }
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    return queryPanelTree(this, selector, false);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelectorList(current, selector)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
}

function walkPanelTree(root, includeRoot = true) {
  const nodes = [];
  function visit(node) {
    nodes.push(node);
    node.children.forEach(visit);
  }
  if (includeRoot) {
    visit(root);
  } else {
    root.children.forEach(visit);
  }
  return nodes;
}

function matchesAttribute(element, expression) {
  const match = expression.match(/^([\w-]+)([*^$|~]?=)(["'])(.*?)\3(?:\s+i)?$/);
  if (!match) {
    return element.getAttribute(expression) !== null;
  }
  const [, name, operator, , expected] = match;
  const insensitive = /\s+i$/.test(expression);
  let actual = name === "class" ? element.classList.toString() : element.getAttribute(name);
  if (actual == null) return false;
  actual = String(actual);
  const left = insensitive ? actual.toLowerCase() : actual;
  const right = insensitive ? expected.toLowerCase() : expected;
  if (operator === "=") return left === right;
  if (operator === "*=") return left.includes(right);
  return false;
}

function matchesSimpleSelector(element, selector) {
  const clean = selector.trim();
  if (!clean) return false;
  if (clean.startsWith("#")) return element.id === clean.slice(1);
  if (clean.startsWith(".")) return element.classList.contains(clean.slice(1));

  const tag = clean.match(/^[a-z][a-z0-9-]*/i);
  if (tag && element.tagName.toLowerCase() !== tag[0].toLowerCase()) {
    return false;
  }

  const attributes = Array.from(clean.matchAll(/\[([^\]]+)\]/g));
  return attributes.every(([, expression]) => matchesAttribute(element, expression));
}

function matchesSelectorList(element, selector) {
  return String(selector || "")
    .split(",")
    .some((part) => matchesSimpleSelector(element, part));
}

function uniquePanelNodes(nodes) {
  return Array.from(new Set(nodes));
}

function queryPanelTree(root, selector, includeRoot = true) {
  const clean = String(selector || "").trim();
  if (!clean) return [];
  if (clean.includes(",")) {
    return uniquePanelNodes(clean.split(",").flatMap((part) => queryPanelTree(root, part, includeRoot)));
  }

  if (clean === "main > div:first-child") {
    return walkPanelTree(root, includeRoot)
      .filter((node) => node.tagName === "MAIN")
      .map((main) => main.children[0])
      .filter((node) => node && node.tagName === "DIV");
  }

  if (clean === "main > div > div:first-child") {
    return walkPanelTree(root, includeRoot)
      .filter((node) => node.tagName === "MAIN")
      .flatMap((main) => main.children.filter((child) => child.tagName === "DIV"))
      .map((div) => div.children[0])
      .filter((node) => node && node.tagName === "DIV");
  }

  if (clean.startsWith("main ")) {
    const childSelector = clean.slice("main ".length).trim();
    return walkPanelTree(root, includeRoot)
      .filter((node) => node.tagName === "MAIN")
      .flatMap((main) => walkPanelTree(main, false))
      .filter((node) => matchesSelectorList(node, childSelector));
  }

  return walkPanelTree(root, includeRoot).filter((node) => matchesSelectorList(node, clean));
}

function createPanelDocument(options = {}) {
  const documentElement = new PanelTestElement({ tagName: "HTML" });
  const body = new PanelTestElement({
    tagName: "BODY",
    rect: { top: 0, left: 0, width: 1280, height: 900, right: 1280, bottom: 900 }
  });
  documentElement.appendChild(body);

  const document = {
    title: "ChatGPT",
    readyState: "complete",
    documentElement,
    body,
    listeners: {},
    createElement(tagName) {
      return new PanelTestElement({ tagName });
    },
    getElementById(id) {
      return walkPanelTree(documentElement).find((node) => node.id === id) || null;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      return queryPanelTree(documentElement, selector);
    }
  };

  if (options.main !== false) {
    document.main = new PanelTestElement({
      tagName: "MAIN",
      rect: { top: 0, left: 260, width: 1020, height: 900, right: 1280, bottom: 900 }
    });
    body.appendChild(document.main);
  }

  if (options.titleBar) {
    document.titleBar = new PanelTestElement({
      tagName: "DIV",
      rect: { top: 0, left: 260, width: 1020, height: 56, right: 1280, bottom: 56 }
    });
    const group = new PanelTestElement({
      tagName: "DIV",
      rect: { top: 8, left: 276, width: 220, height: 40, right: 496, bottom: 48 }
    });
    const modelButton = new PanelTestElement({
      tagName: "BUTTON",
      attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
      rect: { top: 10, left: 284, width: 160, height: 36, right: 444, bottom: 46 }
    });
    group.appendChild(modelButton);
    document.titleBar.appendChild(group);
    document.main.appendChild(document.titleBar);
  }

  return document;
}

function runPanelContentScript(document, options = {}) {
  const messages = [];
  const storageListeners = [];
  const location = {
    href: options.href || "https://chatgpt.com/c/test",
    pathname: new URL(options.href || "https://chatgpt.com/c/test").pathname,
    reload() {
      if (typeof options.onReload === "function") {
        options.onReload();
      }
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTModelCatalog: options.modelCatalog,
      ChatGPTUsageDashboard: {
        init() {
          return { reload() {} };
        }
      }
    },
    document,
    location,
    chrome: {
      runtime: {
        lastError: null,
        id: options.runtimeId,
        sendMessage(message, callback) {
          messages.push(message);
          const response = typeof options.onRuntimeMessage === "function"
            ? options.onRuntimeMessage(message)
            : { ok: true };
          if (callback) callback(response);
        }
      },
      storage: options.storageItems ? {
        local: {
          get(keys, callback) {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(options.storageItems, key)) {
                result[key] = options.storageItems[key];
              }
            });
            callback(result);
          }
        },
        onChanged: {
          addListener(listener) {
            storageListeners.push(listener);
          }
        }
      } : undefined
    },
    getComputedStyle: options.getComputedStyle,
    MutationObserver: options.MutationObserver,
    setInterval: options.setInterval,
    fetch: options.fetch,
    Date,
    Math,
    String,
    Number
  };
  context.window.chrome = context.chrome;
  context.window.getComputedStyle = options.getComputedStyle;
  context.window.matchMedia = options.matchMedia;
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(script, context);
  return { context, messages, storageListeners };
}

function usageMessages(messages) {
  return messages.filter((message) => message.type === "usage.increment");
}

function conversationPayload(id, text = "Exported content") {
  return {
    conversation_id: id,
    title: `Conversation ${id}`,
    mapping: {
      [`${id}-message`]: {
        message: {
          id: `${id}-message`,
          author: { role: "user", name: "user" },
          create_time: 1760000000,
          content: { content_type: "text", parts: [text] },
          metadata: {}
        }
      }
    }
  };
}

function response(status, payload, headers = {}) {
  const headerValues = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [String(name).toLowerCase(), String(value)])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return headerValues[String(name).toLowerCase()] || null;
      }
    },
    json: async () => payload
  };
}

function createConversationFetchContext(fetchImpl, href = "https://chatgpt.com/c/current-conversation", options = {}) {
  const listeners = {};
  const attributes = {};
  const messages = [];
  const document = {
    title: "ChatGPT",
    readyState: "complete",
    cookie: "",
    documentElement: {
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute(name) {
        return attributes[name] || null;
      }
    },
    body: new FakeElement({ tagName: "BODY" }),
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getElementById() {
      return null;
    },
    createElement(tagName) {
      return new PanelTestElement({ tagName });
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true });
        }
      }
    },
    fetch: fetchImpl,
    setTimeout: options.setTimeout || function setTimeoutNow(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    Date,
    Math,
    String,
    Number,
    Promise,
    Error,
    AbortController
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(script, context);
  return { context, messages, attributes, listeners };
}

test("usage panel mounts into the ChatGPT main title bar", () => {
  const document = createPanelDocument({ titleBar: true });
  runPanelContentScript(document);

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  assert.ok(host);
  assert.equal(host.parentNode, document.titleBar);
  assert.equal(host.classList.contains("is-embedded"), true);
  assert.equal(host.classList.contains("is-fallback"), false);
});

test("page load makes no model-directory request and opening the statistics panel fetches it at most once", async () => {
  const document = createPanelDocument({ titleBar: true });
  let modelFetches = 0;
  let claimed = false;
  const { messages } = runPanelContentScript(document, {
    modelCatalog,
    fetch: async (url) => {
      if (String(url).includes("/backend-api/models")) {
        modelFetches += 1;
        return response(200, {
          models: [{ slug: "gpt-5-6", title: "GPT-5.6 Luna" }],
          versions: [],
          categories: []
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    onRuntimeMessage(message) {
      if (message.type === "usage.catalog.get") {
        return { ok: true, catalog: null };
      }
      if (message.type === "usage.catalog.refresh.claim") {
        const result = { ok: true, claimed: !claimed };
        claimed = true;
        return result;
      }
      return { ok: true };
    }
  });

  assert.equal(modelFetches, 0);
  assert.equal(messages.some((message) => message.type === "usage.catalog.get"), false);

  const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
  toggle.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modelFetches, 1, JSON.stringify(messages));

  toggle.listeners.click();
  toggle.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modelFetches, 1);
});

test("an immediately completed unmapped response requests one session catalog refresh", async () => {
  const document = createPanelDocument({ titleBar: true });
  const modelButton = document.querySelector('[data-testid="model-switcher-dropdown-button"]');
  modelButton.innerText = "GPT-6 Aurora";
  modelButton.setAttribute("data-model", "future-model-2027");
  const send = new PanelTestElement({
    tagName: "BUTTON",
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
    rect: { top: 720, left: 600, width: 40, height: 40, right: 640, bottom: 760 }
  });
  const textarea = new PanelTestElement({
    tagName: "TEXTAREA",
    rect: { top: 700, left: 280, width: 300, height: 60, right: 580, bottom: 760 }
  });
  textarea.value = "Test a newly returned model.";
  document.main.appendChild(send);
  document.main.appendChild(textarea);
  let modelFetches = 0;
  let claimed = false;
  const { messages } = runPanelContentScript(document, {
    modelCatalog,
    fetch: async (url) => {
      if (String(url).includes("/backend-api/models")) {
        modelFetches += 1;
        return response(200, {
          models: [{ slug: "future-model-2027", title: "GPT-6 Aurora" }],
          versions: [],
          categories: []
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    onRuntimeMessage(message) {
      if (message.type === "usage.increment") {
        return {
          ok: true,
          recorded: true,
          event: {
            model: "future-model-2027",
            responseModel: "future-model-2027",
            modelMappingStatus: "unmapped"
          },
          stats: { totals: { "future-model-2027": 1 } }
        };
      }
      if (message.type === "usage.catalog.get") {
        return { ok: true, catalog: null };
      }
      if (message.type === "usage.catalog.refresh.claim") {
        const result = { ok: true, claimed: !claimed };
        claimed = true;
        return result;
      }
      return { ok: true };
    }
  });

  const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
  document.listeners.pointerdown({ target: send });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(modelFetches, 1, JSON.stringify(messages));
  assert.equal(
    messages.filter((message) => message.type === "usage.catalog.refresh.claim").length,
    1
  );

  toggle.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modelFetches, 1, "the panel reuses the session catalog published by the response refresh");
});

test("usage panel re-attaches its entry after ChatGPT re-renders the title bar (export navigation)", () => {
  const document = createPanelDocument({ titleBar: true });
  const observers = [];
  runPanelContentScript(document, {
    getComputedStyle() { return { backgroundColor: "transparent" }; },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    MutationObserver: class { constructor(cb) { observers.push(cb); } observe() {} disconnect() {} }
  });

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  assert.equal(host.parentNode, document.titleBar);

  // 模拟导出时 ChatGPT 重渲染标题栏:把入口从 DOM 上摘掉。
  document.titleBar.children = document.titleBar.children.filter((c) => c !== host);
  host.parentNode = null;
  assert.notEqual(host.parentNode, document.titleBar);

  // 触发 DOM 变化观察者:入口必须被重新挂回去,而不是一次性 disconnect 后一去不返。
  observers.forEach((cb) => { try { cb([], {}); } catch (_) {} });
  assert.equal(host.parentNode, document.titleBar);
});

test("usage panel proactively flags context loss after the extension is reloaded", () => {
  const document = createPanelDocument({ titleBar: true });
  let intervalCb = null;
  const { context } = runPanelContentScript(document, {
    runtimeId: "ext-id-123",
    setInterval(fn) { intervalCb = fn; return 1; },
    getComputedStyle() { return { backgroundColor: "transparent" }; },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    MutationObserver: class { observe() {} disconnect() {} }
  });

  const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
  const label = toggle.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
  assert.equal(typeof intervalCb, "function");
  assert.notEqual(label.textContent, "刷新");

  // 模拟扩展被重载:本页旧内容脚本里的 chrome.runtime.id 变成 undefined。
  context.chrome.runtime.id = undefined;
  intervalCb();

  // 周期检查必须主动发现失效,把入口标成“刷新”并给出刷新本页的提示,而不是默默不再统计。
  assert.equal(label.textContent, "刷新");
  assert.match(toggle.title, /刷新本页/);
});

test("usage panel observes the document root and re-mounts after a non-conversation SPA route replaces main content", () => {
  const document = createPanelDocument({ titleBar: true });
  let intervalCb = null;
  let observedRoot = null;
  const { context } = runPanelContentScript(document, {
    setInterval(fn) { intervalCb = fn; return 1; },
    getComputedStyle() { return { backgroundColor: "transparent" }; },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe(root) { observedRoot = root; }
      disconnect() {}
    }
  });

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const oldMain = document.main;
  assert.equal(host.parentNode, document.titleBar);
  assert.equal(observedRoot, document.documentElement);
  assert.equal(typeof intervalCb, "function");

  document.body.children = document.body.children.filter((child) => child !== oldMain);
  oldMain.parentNode = null;
  oldMain.parentElement = null;
  document.main = new PanelTestElement({
    tagName: "MAIN",
    rect: { top: 0, left: 260, width: 1020, height: 900, right: 1280, bottom: 900 }
  });
  document.body.appendChild(document.main);
  context.location.href = "https://chatgpt.com/library";
  context.location.pathname = "/library";

  intervalCb();

  const mount = document.getElementById("chatgpt-model-usage-counter-panel-main-mount");
  assert.ok(mount);
  assert.equal(mount.parentNode, document.main);
  assert.equal(host.parentNode, mount);
  assert.equal(host.classList.contains("is-main-top"), true);
});

test("usage entry reloads the current page when its extension context is stale", () => {
  const document = createPanelDocument({ titleBar: true });
  let intervalCb = null;
  let reloads = 0;
  const { context } = runPanelContentScript(document, {
    runtimeId: "ext-id-123",
    setInterval(fn) { intervalCb = fn; return 1; },
    onReload() { reloads += 1; },
    getComputedStyle() { return { backgroundColor: "transparent" }; },
    matchMedia() { return { matches: false, addEventListener() {}, addListener() {} }; },
    MutationObserver: class { observe() {} disconnect() {} }
  });

  const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
  const panel = document.getElementById("chatgpt-model-usage-counter-panel");
  context.chrome.runtime.id = undefined;
  intervalCb();
  toggle.listeners.click();

  assert.equal(reloads, 1);
  assert.equal(panel.hidden, true);
});

test("usage panel creates a main top mount when ChatGPT has no explicit header", () => {
  const document = createPanelDocument();
  runPanelContentScript(document);

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const mount = document.getElementById("chatgpt-model-usage-counter-panel-main-mount");
  assert.ok(host);
  assert.ok(mount);
  assert.equal(mount.parentNode, document.main);
  assert.equal(host.parentNode, mount);
  assert.equal(document.main.firstChild, mount);
  assert.equal(host.classList.contains("is-embedded"), true);
  assert.equal(host.classList.contains("is-main-top"), true);
  assert.equal(host.classList.contains("is-fallback"), false);
});

test("usage panel fallback stays at the page top instead of the bottom", () => {
  const document = createPanelDocument({ main: false });
  runPanelContentScript(document);

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const style = host.querySelector("style").textContent;
  assert.ok(host);
  assert.equal(host.parentNode, document.body);
  assert.equal(host.classList.contains("is-fallback"), true);
  assert.match(style, /#chatgpt-model-usage-counter-panel-host\.is-fallback\{position:fixed;right:12px;top:12px\}/);
  assert.doesNotMatch(style, /#chatgpt-model-usage-counter-panel-host\.is-fallback\{[^}]*bottom:/);
});

test("usage panel host applies dark theme from computed ChatGPT background", () => {
  const document = createPanelDocument({ titleBar: true });
  runPanelContentScript(document, {
    getComputedStyle(element) {
      if (element === document.body || element === document.documentElement || element === document.main) {
        return { backgroundColor: "rgb(18, 18, 18)" };
      }
      return { backgroundColor: "transparent" };
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, addListener() {} };
    },
    MutationObserver: class FakeMutationObserver {
      observe() {}
    }
  });

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const style = host.querySelector("style").textContent;

  assert.equal(document.documentElement.classList.contains("dark"), false);
  assert.equal(document.documentElement.getAttribute("data-theme"), null);
  assert.equal(host.getAttribute("data-chatgpt-model-usage-theme"), "dark");
  assert.match(style, /#chatgpt-model-usage-counter-panel-host\[data-chatgpt-model-usage-theme="dark"\]/);
});

test("usage panel host treats a dark main surface as dark over light page chrome", () => {
  const document = createPanelDocument({ titleBar: true });
  runPanelContentScript(document, {
    getComputedStyle(element) {
      if (element === document.main) {
        return { backgroundColor: "rgb(18, 18, 18)" };
      }
      if (element === document.body || element === document.documentElement) {
        return { backgroundColor: "rgb(255, 255, 255)" };
      }
      return { backgroundColor: "transparent" };
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, addListener() {} };
    },
    MutationObserver: class FakeMutationObserver {
      observe() {}
    }
  });

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");

  assert.equal(host.getAttribute("data-chatgpt-model-usage-theme"), "dark");
});

test("usage panel opens as a single-scroll dashboard surface", () => {
  const document = createPanelDocument({ titleBar: true });
  runPanelContentScript(document);

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const style = host.querySelector("style").textContent;

  assert.match(style, /#chatgpt-model-usage-counter-panel\{[^}]*width:min\(400px,calc\(100vw - 24px\)\)/);
  assert.match(style, /#chatgpt-model-usage-counter-panel\{[^}]*height:min\(560px,calc\(100vh - 76px\)\)/);
  assert.match(style, /#chatgpt-model-usage-counter-panel\{[^}]*overflow:hidden/);
  assert.match(style, /#chatgpt-model-usage-counter-panel-body\{[^}]*height:100%;[^}]*padding:0;[^}]*overflow:hidden/);
  assert.doesNotMatch(style, /#chatgpt-model-usage-counter-panel\{[^}]*overflow:auto/);
});

test("usage panel entry reflects abnormal stored OpenAI status", () => {
  const document = createPanelDocument({ titleBar: true });
  const { storageListeners } = runPanelContentScript(document, {
    storageItems: {
      "chatgptModelUsageSettings.v1": { language: "en" },
      "chatgptModelUsageOpenAIStatus.v1": {
        version: 1,
        ok: true,
        checkedAt: "2026-06-04T04:00:00.000Z",
        sourceUrl: "https://status.openai.com/",
        state: "major",
        label: "Major outage",
        error: "",
        status: { status: { indicator: "major" }, components: [] }
      }
    }
  });

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
  const style = host.querySelector("style").textContent;

  assert.equal(host.getAttribute("data-openai-status-state"), "major");
  assert.equal(host.getAttribute("data-openai-status-label"), "Major outage");
  assert.equal(toggle.getAttribute("aria-label"), "Model Usage · OpenAI: Major outage");
  // 用户要求:入口不再随 OpenAI 状态变色(去掉奶油/红/灰警告底色),状态仍通过 host 属性 + aria-label + 面板状态页传达。
  assert.doesNotMatch(style, /panel-toggle\{[^}]*#fef3c7/);
  assert.doesNotMatch(style, /panel-toggle\{[^}]*#fee2e2/);

  storageListeners[0]({
    "chatgptModelUsageOpenAIStatus.v1": {
      newValue: {
        version: 1,
        ok: true,
        state: "operational",
        label: "Operational",
        error: "",
        status: { status: { indicator: "none" }, components: [] }
      }
    }
  }, "local");

  assert.equal(host.getAttribute("data-openai-status-state"), "operational");
  assert.equal(toggle.getAttribute("aria-label"), "Model Usage · OpenAI: Operational");
});

test("content script sends one usage.increment message for a send click", () => {
  const listeners = {};
  const messages = [];
  let mutationCallback = null;
  const modelButton = new FakeElement({
    innerText: "GPT-4o mini",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Summarize this conversation.",
    rect: { top: 720, left: 24, width: 560, height: 80, right: 584, bottom: 800 }
  });
  const elements = [modelButton, sendButton, textarea];
  const document = {
    title: "ChatGPT",
    body: new FakeElement({ tagName: "BODY" }),
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) {
        return [modelButton];
      }

      if (selector.includes("data-message-model-slug")) {
        return elements.filter((element) => element.getAttribute("data-message-model-slug"));
      }

      if (selector.includes("data-message-author-role")) {
        return elements.filter((element) => element.getAttribute("data-message-author-role"));
      }

      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) {
        return [modelButton, sendButton];
      }

      if (selector.includes("textarea")) {
        return [textarea];
      }

      return elements.filter((element) => element.getAttribute("contenteditable") === "true");
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) {
            callback(message.type === "usage.increment"
              ? { ok: true, recorded: true, event: { model: message.payload.model }, stats: { totals: {} } }
              : { ok: true, updated: true });
          }
        }
      }
    },
    MutationObserver: class FakeMutationObserver {
      constructor(callback) {
        mutationCallback = callback;
      }

      observe() {}
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);

  listeners.pointerdown({ target: sendButton });
  listeners.click({ target: sendButton });
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].type, "usage.increment");
  assert.equal(usage[0].payload.model, "gpt-4o-mini");
  assert.equal(usage[0].payload.chatgptModel, "gpt-4o-mini");
  assert.equal(usage[0].payload.modelObservedSource, "message-dom:dom");
  assert.equal(usage[0].payload.source, "send-button");
  assert.equal(usage[0].payload.promptLength, "Summarize this conversation.".length);
  assert.match(usage[0].payload.submissionId, /^usage-/);

  elements.push(new FakeElement({
    tagName: "DIV",
    textContent: "Summarize this conversation.",
    attributes: { "data-message-author-role": "user" }
  }));
  mutationCallback();
  assert.equal(usageMessages(messages).length, 1);

  elements.push(
    new FakeElement({
      tagName: "DIV",
      attributes: {
        "data-message-author-role": "assistant",
        "data-message-id": "assistant-reasoning",
        "data-message-model-slug": "gpt-5-6-thinking"
      }
    }),
    new FakeElement({
      tagName: "DIV",
      textContent: "Final answer",
      attributes: {
        "data-message-author-role": "assistant",
        "data-message-id": "assistant-final",
        "data-message-model-slug": "gpt-5-6-pro"
      }
    })
  );
  mutationCallback();

  const responses = messages.filter((message) => message.type === "usage.response");
  assert.equal(responses.length, 1, "reasoning and final assistant nodes reconcile one submission once");
  assert.equal(responses[0].payload.submissionId, usage[0].payload.submissionId);
  assert.equal(responses[0].payload.responseModel, "gpt-5-6-pro", "the content-bearing final response wins over a reasoning node");
  assert.equal(responses[0].payload.conversationId, "");
});

test("content script counts an intentional repeated prompt outside the direct-event dedupe window", () => {
  const listeners = {};
  const messages = [];
  const timers = [];
  let now = 1_000;
  class FakeDate extends Date {
    static now() {
      return now;
    }
  }
  const modelButton = new FakeElement({
    innerText: "GPT-5.6 Sol",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Repeat this exact prompt.",
    rect: { top: 720, left: 24, width: 560, height: 80, right: 584, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes("data-message-author-role")) return [];
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) {
        return [modelButton, sendButton];
      }
      if (selector.includes("textarea")) return [textarea];
      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/repeated-prompt" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: message.payload.model }, stats: { totals: {} } });
        }
      }
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout() {},
    Date: FakeDate,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);

  listeners.click({ target: sendButton });
  now = 1_100;
  listeners.click({ target: sendButton }); // duplicate browser event, ignored
  now = 5_000;
  listeners.click({ target: sendButton }); // intentional second submission

  const flush = timers.filter((timer) => timer.ms === 12_000).at(-1);
  assert.ok(flush);
  flush.fn();

  const usage = usageMessages(messages);
  assert.equal(usage.length, 2);
  assert.equal(usage[0].payload.promptHash, usage[1].payload.promptHash);
  assert.equal(usage[0].payload.model, "gpt-5.6-sol");
  assert.equal(usage[1].payload.model, "gpt-5.6-sol");
});

test("content script records Enter submission even when send button markup changes", () => {
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Count this Enter submission.",
    rect: { top: 720, left: 24, width: 560, height: 80, right: 584, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) {
        return [modelButton];
      }
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) {
        return [modelButton];
        return [modelButton];
      }

      if (selector.includes("textarea")) {
        return [textarea];
      }

      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.keydown({
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    target: textarea
  });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].payload.model, "gpt-5-thinking");
  assert.equal(usage[0].payload.chatgptModel, "gpt-5-thinking");
  assert.equal(usage[0].payload.modelMode, "thinking");
  assert.equal(usage[0].payload.modelObservedSource, "message-dom:dom");
  assert.equal(usage[0].payload.source, "enter-key");
});

test("content script does not record when model cannot be resolved", () => {
  const listeners = {};
  const messages = [];
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "This must not be counted without a model.",
    rect: { top: 720, left: 24, width: 560, height: 80, right: 584, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) {
        return [sendButton];
      }

      if (selector.includes("textarea")) {
        return [textarea];
      }

      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true });
        }
      }
    },
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  assert.equal(usageMessages(messages).length, 0);
});

test("content script sends DOM model when visible model switcher detected", () => {
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "This visible model must be counted.",
    rect: { top: 720, left: 24, width: 560, height: 80, right: 584, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) return [modelButton, sendButton];
      if (selector.includes("textarea")) return [textarea];
      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/dom-only" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking", apiModel: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].payload.model, "gpt-5-thinking");
  assert.equal(usage[0].payload.modelObservedSource, "message-dom:dom");
  assert.equal(usage[0].payload.modelParameters.model, "gpt-5-thinking");
});

test("visible selected Search control is not stored without exact request evidence", () => {
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
    rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
  });
  const searchChip = new FakeElement({
    innerText: "Search",
    attributes: {
      "aria-label": "Search, click to remove",
      "data-testid": "composer-selected-tool",
      role: "button"
    },
    rect: { top: 676, left: 24, width: 92, height: 32, right: 116, bottom: 708 }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Count this neutral submission.",
    rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
  });
  const elements = [modelButton, sendButton, searchChip, textarea];
  const document = {
    title: "ChatGPT",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) return [modelButton, sendButton, searchChip];
      if (selector.includes("aria-label") || selector.includes("data-testid") || selector.includes("title")) return [modelButton, sendButton, searchChip];
      if (selector.includes("textarea")) return [textarea];
      return elements.filter((element) => element.getAttribute("contenteditable") === "true");
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/search-chip" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].payload.model, "gpt-5-thinking");
  assert.equal(usage[0].payload.chatgptModel, "gpt-5-thinking");
  assert.equal(usage[0].payload.modelObservedSource, "message-dom:dom");
  assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  assert.equal(usage[0].payload.modelParameters.model, "gpt-5-thinking");
  assert.equal(usage[0].payload.modelParameters.web_search, undefined);
});

test("plain removable Search button is not stored without exact request evidence", () => {
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
    rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
  });
  const searchChip = new FakeElement({
    innerText: "Search, click to remove",
    rect: { top: 676, left: 24, width: 150, height: 32, right: 174, bottom: 708 }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Count this plain selected tool button.",
    rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector === "button") return [modelButton, sendButton, searchChip];
      if (selector.includes("button") && selector.includes("aria-label")) return [sendButton];
      if (selector.includes("button") && selector.includes("data-testid")) return [modelButton, sendButton];
      if (selector.includes("textarea")) return [textarea];
      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/plain-search-chip" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  assert.equal(usage[0].payload.modelParameters.web_search, undefined);
});

test("descendant Search accessibility label is not stored without exact request evidence", () => {
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
    rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
  });
  const searchChipLabel = new FakeElement({
    attributes: { "aria-label": "Search, click to remove" }
  });
  const searchChip = new FakeElement({
    innerText: "Search",
    rect: { top: 676, left: 24, width: 150, height: 32, right: 174, bottom: 708 }
  });
  searchChip.querySelectorAll = (selector) => selector.includes("aria-label") ? [searchChipLabel] : [];
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Count this descendant accessibility label.",
    rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector === "button") return [modelButton, sendButton, searchChip];
      if (selector.includes("button") && selector.includes("aria-label")) return [sendButton];
      if (selector.includes("button") && selector.includes("data-testid")) return [modelButton, sendButton];
      if (selector.includes("textarea")) return [textarea];
      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/descendant-search-chip" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  assert.equal(usage[0].payload.modelParameters.web_search, undefined);
});

test("selected sibling Search control is not stored without exact request evidence", () => {
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
    rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
  });
  const selectedSearchTool = new FakeElement({
    tagName: "DIV",
    innerText: "Search",
    attributes: {
      "aria-selected": "true",
      "data-state": "active",
      "data-testid": "composer-tool-search"
    },
    rect: { top: 676, left: 24, width: 92, height: 32, right: 116, bottom: 708 }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Count this selected sibling tool control.",
    rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
  });
  const document = {
    title: "ChatGPT",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector === "button") return [modelButton, sendButton];
      if (selector.includes("button") && selector.includes("aria-label")) return [sendButton];
      if (selector.includes("button") && selector.includes("data-testid")) return [modelButton, sendButton];
      if (selector.includes("aria-selected") || selector.includes("data-state") || selector.includes("data-selected")) return [selectedSearchTool];
      if (selector.includes("textarea")) return [textarea];
      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/selected-sibling-search-tool" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  assert.equal(usage[0].payload.modelParameters.web_search, undefined);
});

test("visible non-Search tool chips are not stored without exact request evidence", () => {
  for (const [toolText, expectedFeature] of [
    ["Image", "image_generation"],
    ["Images", "image_generation"],
    ["Imagegen", "image_generation"],
    ["DALL-E", "image_generation"],
    ["Deep research", "deep_research"],
    ["Research", "deep_research"],
    ["Agent mode", "agent_mode"]
  ]) {
    const listeners = {};
    const messages = [];
    const modelButton = new FakeElement({
      innerText: "GPT-5 Thinking",
      attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
      rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
    });
    const sendButton = new FakeElement({
      attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
      rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
    });
    const selectedTool = new FakeElement({
      innerText: toolText,
      attributes: {
        "aria-label": `${toolText}, click to remove`,
        "data-testid": "composer-selected-tool",
        role: "button"
      },
      rect: { top: 676, left: 24, width: 150, height: 32, right: 174, bottom: 708 }
    });
    const textarea = new FakeElement({
      tagName: "TEXTAREA",
      value: "Count this neutral selected tool submission.",
      rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
    });
    const elements = [modelButton, sendButton, selectedTool, textarea];
    const document = {
      title: "ChatGPT",
      documentElement: {
        getAttribute() {
          return null;
        }
      },
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
      querySelectorAll(selector) {
        if (selector.includes("model-switcher")) return [modelButton];
        if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) return [modelButton, sendButton, selectedTool];
        if (selector.includes("aria-label") || selector.includes("data-testid") || selector.includes("title")) return [modelButton, sendButton, selectedTool];
        if (selector.includes("textarea")) return [textarea];
        return elements.filter((element) => element.getAttribute("contenteditable") === "true");
      }
    };
    const context = {
      window: { ChatGPTUsageDetector: detector },
      document,
      location: { href: `https://chatgpt.com/c/${expectedFeature}-chip` },
      chrome: {
        runtime: {
          lastError: null,
          sendMessage(message, callback) {
            messages.push(message);
            if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
          }
        }
      },
      Date,
      Math,
      String,
      Number
    };
    const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

    vm.createContext(context);
    vm.runInContext(script, context);
    listeners.click({ target: sendButton });

    const usage = usageMessages(messages);
    assert.equal(usage.length, 1);
    assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
    assert.equal(usage[0].payload.modelParameters[expectedFeature], undefined);
  }
});

test("inline tool mention pills are not stored without exact request evidence", () => {
  // 实测:当前 ChatGPT 把已启用工具渲染成 composer 输入框里的内联 pill
  // <span data-symbol="ecosystemMention" data-id="search" data-system-hint-type="search" data-keyword="网页搜索">。
  for (const [pillAttrs, expectedFeature] of [
    [{ "data-system-hint-type": "search", "data-id": "search", "data-keyword": "网页搜索", "data-symbol": "ecosystemMention" }, "web_search"],
    // 深度研究实测是 connector 形态:data-system-hint-type/data-id = "connector:connector_openai_deep_research"
    [{ "data-system-hint-type": "connector:connector_openai_deep_research", "data-id": "connector:connector_openai_deep_research", "data-keyword": "深度研究", "data-symbol": "ecosystemMention" }, "deep_research"],
    [{ "data-system-hint-type": "agent", "data-keyword": "代理模式", "data-symbol": "ecosystemMention" }, "agent_mode"],
    [{ "data-system-hint-type": "image_gen", "data-keyword": "创建图片", "data-symbol": "ecosystemMention" }, "image_generation"]
  ]) {
    const listeners = {};
    const messages = [];
    const modelButton = new FakeElement({
      innerText: "GPT-5 Thinking",
      attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
      rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
    });
    const sendButton = new FakeElement({
      attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
      rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
    });
    const pill = new FakeElement({ tagName: "SPAN", innerText: pillAttrs["data-keyword"], attributes: pillAttrs });
    // composer 是 contenteditable,其 querySelectorAll 只在匹配 pill 选择器时返回该 pill。
    const composer = new FakeElement({
      tagName: "DIV",
      attributes: { contenteditable: "true", id: "prompt-textarea" },
      innerText: "请帮我查询",
      rect: { top: 700, left: 700, width: 384, height: 90, right: 1084, bottom: 790 }
    });
    composer.querySelectorAll = (selector) => (String(selector).includes("data-system-hint-type") || String(selector).includes("ecosystemMention") || String(selector).includes("data-inline-selection-pill") ? [pill] : []);
    const elements = [modelButton, sendButton, composer];
    const document = {
      title: "ChatGPT",
      documentElement: { getAttribute() { return null; } },
      addEventListener(type, listener) { listeners[type] = listener; },
      querySelectorAll(selector) {
        if (selector.includes("model-switcher")) return [modelButton];
        if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) return [modelButton, sendButton];
        if (selector.includes("aria-label") || selector.includes("data-testid") || selector.includes("title")) return [modelButton, sendButton];
        return elements.filter((element) => element.getAttribute("contenteditable") === "true");
      }
    };
    const context = {
      window: { ChatGPTUsageDetector: detector },
      document,
      location: { href: `https://chatgpt.com/c/${expectedFeature}-pill` },
      chrome: {
        runtime: {
          lastError: null,
          sendMessage(message, callback) {
            messages.push(message);
            if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
          }
        }
      },
      Date,
      Math,
      String,
      Number
    };
    const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

    vm.createContext(context);
    vm.runInContext(script, context);
    listeners.click({ target: sendButton });

    const usage = usageMessages(messages);
    assert.equal(usage.length, 1, expectedFeature);
    assert.deepEqual(Array.from(usage[0].payload.usageFeatures), [], expectedFeature);
  }
});

test("content script survives extension context invalidation without throwing uncaught", () => {
  // 扩展被重载/更新后,旧内容脚本调用 chrome.runtime.sendMessage 会同步抛
  // "Extension context invalidated."。必须捕获、记诊断、并短路后续提交,而不是抛未捕获错误。
  const listeners = {};
  const attributes = {};
  let sendCalls = 0;
  const sendButton = new FakeElement({ attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }, rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 } });
  const textarea = new FakeElement({ tagName: "TEXTAREA", value: "Trigger a submission.", rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 } });
  // 面板入口按钮 + 文案,验证失效后是否提示"刷新"
  const toggleLabel = new FakeElement({ tagName: "SPAN", textContent: "统计" });
  const toggle = new FakeElement({ tagName: "BUTTON", attributes: { id: "chatgpt-model-usage-counter-panel-toggle" } });
  toggle.querySelector = (sel) => (String(sel).includes("panel-toggle-label") ? toggleLabel : null);
  const elements = [sendButton, textarea];
  const document = {
    title: "ChatGPT",
    documentElement: { setAttribute(n, v) { attributes[n] = String(v); }, getAttribute(n) { return attributes[n] || null; } },
    addEventListener(type, listener) { listeners[type] = listener; },
    getElementById(id) { return id === "chatgpt-model-usage-counter-panel-toggle" ? toggle : null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) return [sendButton];
      if (selector.includes("textarea")) return [textarea];
      return elements.filter((e) => e.getAttribute("contenteditable") === "true");
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/ctx-invalidated" },
    chrome: { runtime: { lastError: null, sendMessage() { sendCalls += 1; throw new Error("Extension context invalidated."); } } },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(script, context);

  // 第一次提交:sendMessage 抛错,必须被内部捕获(测试不应见到未捕获异常)
  assert.doesNotThrow(() => listeners.click({ target: sendButton }));
  assert.equal(sendCalls, 1);
  assert.match(attributes["data-chatgpt-model-usage-last-record-status"] || "", /invalidated/);
  // 用户可见提示:面板入口文案变为"刷新"
  assert.equal(toggleLabel.textContent, "刷新");
  // 第二次提交:已知失效 → 短路,不再调用 sendMessage
  assert.doesNotThrow(() => listeners.click({ target: sendButton }));
  assert.equal(sendCalls, 1);
});

test("content script ignores sidebar/containers and never false-counts features from conversation titles", () => {
  // 真机 bug:侧边栏对话列表(role=tabpanel, data-state=active)文本里有对话标题
  // "Image description generation",旧逻辑把里面的 "image" 当成图片生成功能误报。
  const listeners = {};
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
    rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
  });
  // 侧边栏:容器角色 + active 状态 + 超长文本(含 Image/GPT/搜索/研究/agent 等会误触发的词)
  const sidebar = new FakeElement({
    tagName: "DIV",
    attributes: { role: "tabpanel", "data-state": "active" },
    innerText: ("项目搜索与实现方法 Image description generation BTC走势分析 深度研究 agent GPT-5.5定价 网络搜索策略 " + "x".repeat(300)),
    rect: { top: 0, left: 0, width: 260, height: 900, right: 260, bottom: 900 }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Plain question with no tool.",
    rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
  });
  const elements = [modelButton, sendButton, sidebar, textarea];
  const document = {
    title: "ChatGPT",
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    addEventListener(type, listener) { listeners[type] = listener; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]') || selector.includes("tabpanel") || selector.includes("data-state")) return [modelButton, sendButton, sidebar];
      if (selector.includes("aria-label") || selector.includes("data-testid") || selector.includes("title")) return [modelButton, sendButton, sidebar];
      if (selector.includes("textarea")) return [textarea];
      return elements.filter((element) => element.getAttribute("contenteditable") === "true");
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: { href: "https://chatgpt.com/c/no-tool" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
        }
      }
    },
    Date,
    Math,
    String,
    Number
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(script, context);
  listeners.click({ target: sendButton });

  const usage = usageMessages(messages);
  assert.equal(usage.length, 1);
  // 没启用任何工具 → 不应误报任何功能(尤其不能从对话标题里的 "Image" 推出 image_generation)
  assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
});

test("visible realtime audio and canvas aliases are not stored without exact request evidence", () => {
  for (const [toolText, expectedFeature] of [
    ["real-time", "realtime"],
    ["input_audio", "audio"],
    ["output_audio", "audio"],
    ["canvases", "canvas"]
  ]) {
    const listeners = {};
    const messages = [];
    const modelButton = new FakeElement({
      innerText: "GPT-5 Thinking",
      attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
      rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
    });
    const sendButton = new FakeElement({
      attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
      rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
    });
    const selectedTool = new FakeElement({
      innerText: toolText,
      attributes: {
        "aria-label": `${toolText}, click to remove`,
        "data-testid": "composer-selected-tool",
        role: "button"
      },
      rect: { top: 676, left: 24, width: 150, height: 32, right: 174, bottom: 708 }
    });
    const textarea = new FakeElement({
      tagName: "TEXTAREA",
      value: `Count ${toolText} selected tool submission.`,
      rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
    });
    const elements = [modelButton, sendButton, selectedTool, textarea];
    const document = {
      title: "ChatGPT",
      documentElement: {
        getAttribute() {
          return null;
        }
      },
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
      querySelectorAll(selector) {
        if (selector.includes("model-switcher")) return [modelButton];
        if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) return [modelButton, sendButton, selectedTool];
        if (selector.includes("aria-label") || selector.includes("data-testid") || selector.includes("title")) return [modelButton, sendButton, selectedTool];
        if (selector.includes("textarea")) return [textarea];
        return elements.filter((element) => element.getAttribute("contenteditable") === "true");
      }
    };
    const context = {
      window: { ChatGPTUsageDetector: detector },
      document,
      location: { href: `https://chatgpt.com/c/${expectedFeature}-alias-chip` },
      chrome: {
        runtime: {
          lastError: null,
          sendMessage(message, callback) {
            messages.push(message);
            if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
          }
        }
      },
      Date,
      Math,
      String,
      Number
    };
    const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

    vm.createContext(context);
    vm.runInContext(script, context);
    listeners.click({ target: sendButton });

    const usage = usageMessages(messages);
    assert.equal(usage.length, 1);
    assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  }
});

test("content script does not map bare Search or Live controls without tool context", () => {
  for (const toolText of ["Search", "Live"]) {
    const listeners = {};
    const messages = [];
    const modelButton = new FakeElement({
      innerText: "GPT-5 Thinking",
      attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
      rect: { top: 14, left: 88, width: 150, height: 34, right: 238, bottom: 48 }
    });
    const sendButton = new FakeElement({
      attributes: { "data-testid": "send-button", "aria-label": "Send prompt" },
      rect: { top: 728, left: 1040, width: 44, height: 44, right: 1084, bottom: 772 }
    });
    const neutralControl = new FakeElement({
      innerText: toolText,
      attributes: { role: "button" },
      rect: { top: 676, left: 24, width: 92, height: 32, right: 116, bottom: 708 }
    });
    const textarea = new FakeElement({
      tagName: "TEXTAREA",
      value: `Count neutral ${toolText} control.`,
      rect: { top: 720, left: 700, width: 384, height: 80, right: 1084, bottom: 800 }
    });
    const document = {
      title: "ChatGPT",
      documentElement: {
        getAttribute() {
          return null;
        }
      },
      addEventListener(type, listener) {
        listeners[type] = listener;
      },
      querySelectorAll(selector) {
        if (selector.includes("model-switcher")) return [modelButton];
        if (selector === "button") return [modelButton, sendButton, neutralControl];
        if (selector.includes("button") && selector.includes("aria-label")) return [sendButton];
        if (selector.includes("button") && selector.includes("data-testid")) return [modelButton, sendButton];
        if (selector.includes("textarea")) return [textarea];
        return [];
      }
    };
    const context = {
      window: { ChatGPTUsageDetector: detector },
      document,
      location: { href: `https://chatgpt.com/c/bare-${toolText.toLowerCase()}` },
      chrome: {
        runtime: {
          lastError: null,
          sendMessage(message, callback) {
            messages.push(message);
            if (callback) callback({ ok: true, recorded: true, event: { model: "gpt-5-thinking" }, stats: { totals: { "gpt-5-thinking": 1 } } });
          }
        }
      },
      Date,
      Math,
      String,
      Number
    };
    const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

    vm.createContext(context);
    vm.runInContext(script, context);
    listeners.click({ target: sendButton });

    const usage = usageMessages(messages);
    assert.equal(usage.length, 1);
    assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  }
});

test("current export falls back to the already-rendered chat when account history fails and no sidebar link exists", async () => {
  const listeners = {};
  const currentConversation = {
    id: "shared-chat-0001",
    title: "Shared conversation",
    messages: [
      { id: "u1", role: "user", text: "Question" },
      { id: "a1", role: "assistant", text: "Answer" }
    ]
  };
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: {
        collectConversationFromDom() {
          return currentConversation;
        }
      },
      ChatGPTConversationSource: {
        collectConversations() {
          return Promise.reject(new Error("history unavailable"));
        }
      },
      fetch() {
        return Promise.reject(new Error("not called directly"));
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/c/shared-chat-0001",
      origin: "https://chatgpt.com",
      pathname: "/c/shared-chat-0001"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          if (callback) callback({ ok: true });
        },
        onMessage: {
          addListener(listener) {
            listeners.runtimeMessage = listener;
          }
        }
      }
    },
    Date,
    Math,
    String,
    Number,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  const result = await context.window.__chatgptUsageCollectCurrent();

  assert.equal(result.complete, false);
  assert.equal(result.failures.length, 0);
  assert.ok(result.warnings.length >= 1);
  assert.equal(result.warnings.some((warning) => warning.scope === "rendered-page-fallback"), true);
  assert.deepEqual(Array.from(result.conversations, (conversation) => conversation.id), ["shared-chat-0001"]);

  const messageResult = await new Promise((resolve) => {
    listeners.runtimeMessage({ type: "conversation.collect" }, {}, resolve);
  });
  assert.equal(messageResult.ok, true);
  assert.equal(messageResult.complete, false);
  assert.equal(messageResult.warnings.some((warning) => warning.scope === "rendered-page-fallback"), true);
});

test("all export preserves rendered-page fallback warnings and stays incomplete", async () => {
  const listeners = {};
  const currentConversation = {
    id: "chat-0001",
    title: "Recovered conversation",
    messages: [
      { id: "u1", role: "user", text: "Question" },
      { id: "a1", role: "assistant", text: "Answer" }
    ]
  };
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    documentElement: {
      getAttribute() {
        return null;
      }
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: {
        collectConversationFromDom() {
          return currentConversation;
        }
      },
      ChatGPTConversationSource: {
        collectAllConversations() {
          return Promise.resolve({
            index: [{ id: "chat-0001", title: "Recovered conversation" }],
            conversations: [],
            failures: [{ id: "chat-0001", error: "history detail unavailable" }],
            warnings: [],
            requestedCount: 1,
            indexComplete: true,
            complete: false
          });
        }
      },
      fetch() {
        return Promise.reject(new Error("not called directly"));
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/c/chat-0001",
      origin: "https://chatgpt.com",
      pathname: "/c/chat-0001"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          if (callback) callback({ ok: true });
        },
        onMessage: {
          addListener(listener) {
            listeners.runtimeMessage = listener;
          }
        }
      }
    },
    Date,
    Math,
    String,
    Number,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  const result = await context.window.__chatgptUsageCollectAll();

  assert.equal(result.complete, false);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(Array.from(result.conversations, (conversation) => conversation.id), ["chat-0001"]);
  assert.equal(result.warnings.some((warning) => warning.scope === "rendered-page-fallback"), true);
});

test("account-history credentials stay in memory only and are released after 30 seconds idle", async () => {
  const listeners = {};
  const timers = new Map();
  const clearedTimers = new Set();
  const accountHeaders = [];
  let nextTimerId = 0;
  let sessionFetches = 0;

  const document = {
    title: "ChatGPT",
    readyState: "loading",
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: { collectConversationFromDom() { return null; } },
      ChatGPTConversationSource: {
        async listAccountConversations(options) {
          await options.fetchImpl("https://chatgpt.com/backend-api/conversations?offset=0&limit=100");
          return {
            conversations: [{ id: "chat-0001", title: "One" }],
            complete: true,
            warnings: []
          };
        }
      },
      async fetch(url, options = {}) {
        if (url === "/api/auth/session") {
          sessionFetches += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: `memory-token-${sessionFetches}`,
              account: { id: "account-0001" }
            })
          };
        }
        const authorization = typeof options.headers?.get === "function"
          ? options.headers.get("authorization")
          : options.headers?.authorization;
        accountHeaders.push(authorization);
        return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) };
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/",
      origin: "https://chatgpt.com",
      pathname: "/"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) { if (callback) callback({ ok: true }); },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      }
    },
    Headers,
    Date,
    Math,
    String,
    Number,
    Promise,
    setTimeout(fn, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { fn, delay });
      return nextTimerId;
    },
    clearTimeout(id) {
      clearedTimers.add(id);
      timers.delete(id);
    }
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  await context.window.__chatgptUsageListConversations();
  await context.window.__chatgptUsageListConversations();

  assert.equal(sessionFetches, 1, "active user-triggered history reads reuse only the in-memory session");
  assert.deepEqual(accountHeaders, ["Bearer memory-token-1", "Bearer memory-token-1"]);

  const idleTimer = [...timers.entries()].find(([, timer]) => timer.delay === 30_000);
  assert.ok(idleTimer, "the 30-second credential release timer is scheduled");
  timers.delete(idleTimer[0]);
  idleTimer[1].fn();

  await context.window.__chatgptUsageListConversations();
  assert.equal(sessionFetches, 2, "the next history read reloads authorization after idle release");
  assert.equal(accountHeaders.at(-1), "Bearer memory-token-2");
  assert.equal(
    Object.values(context).some((value) => String(value).includes("memory-token-")),
    false,
    "credentials are not exposed through the page-level test context"
  );
});

test("every 401 or 403 clears account-history credentials without automatic retry", async () => {
  const listeners = {};
  let sessionFetches = 0;
  let historyFetches = 0;
  const accountHeaders = [];
  const historyStatuses = [401, 403, 200];

  const document = {
    title: "ChatGPT",
    readyState: "loading",
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: { collectConversationFromDom() { return null; } },
      ChatGPTConversationSource: {
        async listAccountConversations(options) {
          await options.fetchImpl("https://chatgpt.com/backend-api/conversations?offset=0&limit=100");
          return {
            conversations: [{ id: "chat-0001", title: "One" }],
            complete: true,
            warnings: []
          };
        }
      },
      async fetch(url, options = {}) {
        if (url === "/api/auth/session") {
          sessionFetches += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: `refresh-token-${sessionFetches}`,
              account: { id: "account-0001" }
            })
          };
        }
        historyFetches += 1;
        const authorization = typeof options.headers?.get === "function"
          ? options.headers.get("authorization")
          : options.headers?.authorization;
        accountHeaders.push(authorization);
        const status = historyStatuses.shift() ?? 200;
        return { ok: status === 200, status, json: async () => ({ items: [], total: 0 }) };
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/",
      origin: "https://chatgpt.com",
      pathname: "/"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) { if (callback) callback({ ok: true }); },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      }
    },
    Headers,
    Date,
    Math,
    String,
    Number,
    Promise,
    setTimeout() { return 1; },
    clearTimeout() {}
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  await context.window.__chatgptUsageListConversations();
  assert.equal(historyFetches, 1, "an authorization failure is not retried automatically");
  assert.equal(sessionFetches, 1);
  assert.deepEqual(accountHeaders, ["Bearer refresh-token-1"]);

  await context.window.__chatgptUsageListConversations();
  assert.equal(
    sessionFetches,
    2,
    "the next explicit user action obtains a fresh in-memory credential"
  );
  assert.equal(historyFetches, 2);
  assert.equal(accountHeaders.at(-1), "Bearer refresh-token-2");

  await context.window.__chatgptUsageListConversations();
  assert.equal(sessionFetches, 3);
  assert.equal(historyFetches, 3);
  assert.equal(accountHeaders.at(-1), "Bearer refresh-token-3");
});
