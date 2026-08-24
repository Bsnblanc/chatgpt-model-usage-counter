const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const detector = require("../src/detector");
const modelCatalog = require("../src/model-catalog");
const conversationSource = require("../src/conversation-source");
const background = require("../src/background");

test("account-history reads use one worker and reserve a 1000 ms request-start gap", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  assert.match(script, /ACCOUNT_REQUEST_MAX_CONCURRENCY\s*=\s*1/);
  assert.match(script, /ACCOUNT_REQUEST_MIN_GAP_MS\s*=\s*1000/);
  assert.match(script, /ACCOUNT_REQUEST_FETCH_TIMEOUT_MS\s*=\s*45\s*\*\s*1000/);
  assert.match(script, /controller\.abort\(\)/);
  assert.match(script, /error\.code\s*=\s*"account-request-timeout"/);
  assert.match(
    script,
    /scheduledCatalogFetch[\s\S]{0,300}?accountFetchWithTimeout\(fetch,\s*url,\s*options\)/
  );
  assert.match(
    script,
    /scheduledSessionFetch[\s\S]{0,500}?accountFetchWithTimeout\(window\.fetch,\s*url,\s*options\)/
  );
  assert.match(
    script,
    /startAuthorizedFetch[\s\S]{0,1200}?accountFetchWithTimeout\(window\.fetch,\s*parsedUrl\.href,\s*options\)/
  );
  assert.match(script, /concurrency:\s*1,\s*[\s\S]{0,500}?requestGapMs:\s*ACCOUNT_REQUEST_MIN_GAP_MS/);
  assert.match(script, /ACCOUNT_HISTORY_MAX_REQUESTS_PER_OPERATION\s*=\s*60/);
  assert.match(script, /ACCOUNT_HISTORY_MAX_OPERATION_MS\s*=\s*90\s*\*\s*1000/);
  assert.match(script, /ACCOUNT_HISTORY_MAX_CONVERSATIONS_PER_OPERATION\s*=\s*50/);
  assert.match(script, /ACCOUNT_HISTORY_MAX_INDEX_PAGES_PER_SCOPE\s*=\s*6/);
  assert.match(script, /maxIndexPagesPerScope:\s*ACCOUNT_HISTORY_MAX_INDEX_PAGES_PER_SCOPE/);
  assert.match(script, /maxConversationsPerOperation:\s*ACCOUNT_HISTORY_MAX_CONVERSATIONS_PER_OPERATION/);
  assert.match(script, /maxMessagePagesPerConversation:\s*50/);
  assert.match(script, /maxMessagesPerConversation:\s*10000/);
});

test("account-history requests stay paced after concurrent workers share a delayed authorization lookup", async () => {
  const listeners = {};
  const requestStarts = [];
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
          await Promise.all([
            options.fetchImpl("https://chatgpt.com/backend-api/conversations/first-0001"),
            options.fetchImpl("https://chatgpt.com/backend-api/conversations/second-0002")
          ]);
          return { conversations: [], complete: true, warnings: [] };
        }
      },
      async fetch(url) {
        if (url === "/api/auth/session") {
          sessionFetches += 1;
          await new Promise((resolve) => setTimeout(resolve, 30));
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: "memory-only-token",
              account: { id: "account-0001" }
            })
          };
        }
        requestStarts.push(Date.now());
        return { ok: true, status: 200, json: async () => ({}) };
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
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  await context.window.__chatgptUsageListConversations();

  assert.equal(sessionFetches, 1);
  assert.equal(requestStarts.length, 2);
  assert.ok(
    requestStarts[1] - requestStarts[0] >= 900,
    `actual request gap was ${requestStarts[1] - requestStarts[0]} ms`
  );
});

test("a hung account fetch aborts before permit expiry and releases the permit only after fetch settles", async () => {
  const listeners = {};
  const runtimeMessages = [];
  let abortCount = 0;
  let accountTimeout = null;
  let fetchReject = null;
  let fetchStarted = false;
  let fetchSettled = false;
  let fetchCalls = 0;
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
          await options.fetchImpl("https://chatgpt.com/backend-api/conversations/hung-0001");
          return { conversations: [], complete: true, warnings: [] };
        }
      },
      fetch(_url, options) {
        fetchCalls += 1;
        fetchStarted = true;
        return new Promise((_resolve, reject) => {
          fetchReject = reject;
          options.signal.addEventListener("abort", () => {
            abortCount += 1;
          }, { once: true });
        });
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
        id: "extension-test-id",
        sendMessage(message, callback) {
          runtimeMessages.push({
            type: message.type,
            fetchSettled
          });
          if (message.type === "account.request.acquire") {
            if (callback) callback({ ok: true, granted: true, permitId: "permit-hung-1" });
            return;
          }
          if (message.type === "account.request.complete") {
            if (callback) callback({ ok: true, released: true });
            return;
          }
          if (callback) callback({ ok: true });
        },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      }
    },
    Headers,
    AbortController,
    Date,
    Math,
    String,
    Number,
    Promise,
    setTimeout(fn, delay) {
      if (Number(delay) === 45 * 1000) {
        accountTimeout = fn;
        return "account-timeout";
      }
      return setTimeout(fn, delay);
    },
    clearTimeout(timerId) {
      if (timerId === "account-timeout") {
        accountTimeout = null;
        return;
      }
      clearTimeout(timerId);
    }
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);

  const listPromise = context.window.__chatgptUsageListConversations();
  while (!fetchStarted) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(fetchCalls, 1);
  assert.equal(typeof accountTimeout, "function");
  assert.equal(
    runtimeMessages.filter((message) => message.type === "account.request.complete").length,
    0,
    "the global permit remains held while the real fetch is still pending"
  );

  accountTimeout();
  assert.equal(abortCount, 1, "the timeout must physically abort the hung fetch");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    runtimeMessages.filter((message) => message.type === "account.request.complete").length,
    0,
    "calling abort alone must not release the permit before fetch settles"
  );

  fetchSettled = true;
  const abortError = new Error("aborted");
  abortError.name = "AbortError";
  fetchReject(abortError);
  await assert.rejects(
    listPromise,
    (error) => Boolean(
      error &&
      error.code === "account-request-timeout" &&
      error.stopOperation === true &&
      error.incomplete === true
    )
  );
  const completions = runtimeMessages.filter((message) => message.type === "account.request.complete");
  assert.equal(completions.length, 1);
  assert.equal(completions[0].fetchSettled, true, "permit completion is sent only after the fetch promise settles");
  assert.equal(fetchCalls, 1, "a timeout marked stopOperation must not be retried");
});

test("cancelling and releasing an account operation invalidates delayed request slots", async () => {
  const listeners = {};
  let historyFetches = 0;
  let resolveFirstRequest;
  const firstRequestStarted = new Promise((resolve) => {
    resolveFirstRequest = resolve;
  });
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
          await Promise.all([
            options.fetchImpl("https://chatgpt.com/backend-api/conversations/first-0001"),
            options.fetchImpl("https://chatgpt.com/backend-api/conversations/second-0002")
          ]);
          return { conversations: [], complete: true, warnings: [] };
        }
      },
      async fetch(url) {
        if (url === "/api/auth/session") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: "memory-only-token",
              account: { id: "account-0001" }
            })
          };
        }
        historyFetches += 1;
        if (historyFetches === 1) {
          resolveFirstRequest();
        }
        return { ok: true, status: 200, json: async () => ({}) };
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
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  const listPromise = context.window.__chatgptUsageListConversations();
  await firstRequestStarted;
  context.window.__chatgptUsageCancelAccountOperation();
  context.window.__chatgptUsageReleaseAccountAuth();
  await assert.rejects(
    listPromise,
    (error) => Boolean(error && error.cancelled && error.stopOperation)
  );

  assert.equal(historyFetches, 1, "the delayed second request from the cancelled generation must never start");
});

test("operation runtime budget stops with an explicit incomplete result before the next request", async () => {
  const listeners = {};
  let now = 0;
  let sessionFetches = 0;
  let historyFetches = 0;
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
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
          await options.fetchImpl("https://chatgpt.com/backend-api/conversations/first-0001");
          await options.fetchImpl("https://chatgpt.com/backend-api/conversations/second-0002");
          return { conversations: [], complete: true, warnings: [] };
        }
      },
      async fetch(url) {
        if (url === "/api/auth/session") {
          sessionFetches += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: "runtime-budget-token",
              account: { id: "runtime-budget-account" }
            })
          };
        }
        historyFetches += 1;
        now += 90 * 1000 + 1;
        return { ok: true, status: 200, json: async () => ({}) };
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
    Date: FakeDate,
    Math,
    String,
    Number,
    Promise,
    setTimeout(fn, delay) {
      now += Math.max(0, Number(delay) || 0);
      Promise.resolve().then(fn);
      return 1;
    },
    clearTimeout() {}
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  await assert.rejects(
    context.window.__chatgptUsageListConversations(),
    (error) => error &&
      error.stopOperation === true &&
      error.incomplete === true &&
      error.code === "account-operation-time-limit"
  );

  assert.equal(sessionFetches, 1);
  assert.equal(historyFetches, 1, "the request after the runtime budget must never reach ChatGPT");
});

test("60-request account-operation cap stops before the next real ChatGPT request starts", async () => {
  const listeners = {};
  let now = 0;
  let sessionFetches = 0;
  let historyFetches = 0;
  let timerId = 0;
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
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
          for (let index = 0; index < 61; index += 1) {
            await options.fetchImpl(`https://chatgpt.com/backend-api/conversations/request-${String(index).padStart(4, "0")}`);
          }
          return { conversations: [], complete: true, warnings: [] };
        }
      },
      async fetch(url) {
        if (url === "/api/auth/session") {
          sessionFetches += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: "request-budget-token",
              account: { id: "request-budget-account" }
            })
          };
        }
        historyFetches += 1;
        return { ok: true, status: 200, json: async () => ({}) };
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
    Date: FakeDate,
    Math,
    String,
    Number,
    Promise,
    setTimeout(fn, delay) {
      timerId += 1;
      if (Number(delay) <= 1000) {
        now += Math.max(0, Number(delay) || 0);
        Promise.resolve().then(fn);
      }
      return timerId;
    },
    clearTimeout() {}
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  await assert.rejects(
    context.window.__chatgptUsageListConversations(),
    (error) => error &&
      error.stopOperation === true &&
      error.incomplete === true &&
      error.code === "account-request-limit"
  );

  assert.equal(sessionFetches, 1);
  assert.equal(historyFetches, 59, "the session read plus 59 history reads consume the 60-request cap");
  assert.ok(now < 90 * 1000, "the request-count cap must stop before the runtime cap");
});

test("conversation cap is enforced across multiple selected-export batches without requesting overflow ids", async () => {
  const listeners = {};
  const batches = [];
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
        async collectConversations(ids) {
          const received = Array.from(ids);
          batches.push(received);
          return {
            conversations: received.map((id) => ({ id, messages: [{ id: `${id}-message` }] })),
            failures: [],
            warnings: [],
            requestedCount: received.length,
            complete: true
          };
        }
      },
      fetch() {
        return Promise.reject(new Error("the source stub does not use account fetch"));
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/c/current-0000",
      origin: "https://chatgpt.com",
      pathname: "/c/current-0000"
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
    Object,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  const firstIds = Array.from({ length: 40 }, (_, index) => `first-${String(index).padStart(4, "0")}`);
  const secondIds = Array.from({ length: 20 }, (_, index) => `second-${String(index).padStart(4, "0")}`);
  const thirdIds = Array.from({ length: 3 }, (_, index) => `third-${String(index).padStart(4, "0")}`);

  vm.createContext(context);
  vm.runInContext(script, context);
  context.window.__chatgptUsageBeginAccountOperation();
  const first = await context.window.__chatgptUsageCollectMany(firstIds);
  const second = await context.window.__chatgptUsageCollectMany(secondIds);
  const third = await context.window.__chatgptUsageCollectMany(thirdIds);

  assert.equal(batches.length, 2, "a fully rejected batch must not call the account source");
  assert.deepEqual(batches.map((batch) => batch.length), [40, 10]);
  assert.equal(first.complete, true);
  assert.equal(first.attemptedCount, 40);
  assert.equal(second.complete, false);
  assert.equal(second.incomplete, true);
  assert.equal(second.requestedCount, 20);
  assert.equal(second.attemptedCount, 10);
  assert.equal(second.conversations.length, 10);
  assert.deepEqual(Array.from(second.failures, (failure) => failure.id), secondIds.slice(10));
  assert.equal(second.failures.every((failure) => failure.code === "conversation-count-limit"), true);
  assert.equal(second.warnings.some((warning) => warning.code === "conversation-count-limit"), true);
  assert.equal(third.complete, false);
  assert.equal(third.attemptedCount, 0);
  assert.equal(third.failures.length, 3);
  assert.equal(third.failures.every((failure) => failure.code === "conversation-count-limit"), true);

  const messageResult = await new Promise((resolve) => {
    listeners.runtimeMessage({ type: "conversation.collectMany", ids: thirdIds }, {}, resolve);
  });
  assert.equal(messageResult.ok, true);
  assert.equal(messageResult.incomplete, true);
  assert.equal(messageResult.attemptedCount, 0);
  assert.equal(messageResult.code, "conversation-count-limit");
});

test("final 429 stops later ids and DOM navigation while credentials stay out of messages and storage", async () => {
  const listeners = {};
  const runtimeMessages = [];
  const storageWrites = [];
  let permitSequence = 0;
  let sessionFetches = 0;
  let detailFetches = 0;
  let domClicks = 0;
  const secretToken = "credential-must-stay-in-content-memory";
  const secretAccount = "account-must-stay-in-content-memory";
  const link = {
    innerText: "Fallback target",
    textContent: "Fallback target",
    getAttribute(name) {
      return name === "href" ? "/c/first-0001" : "";
    },
    click() {
      domClicks += 1;
    }
  };
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector() { return link; },
    querySelectorAll(selector) {
      return selector.includes('a[href*="/c/"]') ? [link] : [];
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: { collectConversationFromDom() { return null; } },
      ChatGPTConversationSource: conversationSource,
      async fetch(url) {
        if (url === "/api/auth/session") {
          sessionFetches += 1;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              accessToken: secretToken,
              account: { id: secretAccount }
            })
          };
        }
        detailFetches += 1;
        return {
          ok: false,
          status: 429,
          headers: { get(name) { return String(name).toLowerCase() === "retry-after" ? "0" : ""; } },
          json: async () => ({})
        };
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/c/current-0000",
      origin: "https://chatgpt.com",
      pathname: "/c/current-0000"
    },
    chrome: {
      runtime: {
        id: "test-extension",
        lastError: null,
        sendMessage(message, callback) {
          runtimeMessages.push(message);
          if (message.type === "account.request.acquire") {
            permitSequence += 1;
            callback({ ok: true, granted: true, permitId: `permit-${permitSequence}` });
            return;
          }
          if (message.type === "account.request.complete") {
            callback({ ok: true, released: true });
            return;
          }
          if (callback) callback({ ok: true });
        },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      },
      storage: {
        local: { set(value, callback) { storageWrites.push(value); if (callback) callback(); } },
        session: { set(value, callback) { storageWrites.push(value); if (callback) callback(); } }
      }
    },
    Headers,
    AbortController,
    URL,
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
  context.window.__chatgptUsageBeginAccountOperation();
  await assert.rejects(
    context.window.__chatgptUsageCollectMany(["first-0001", "second-0002"]),
    (error) => error && error.stopOperation === true && error.status === 429
  );

  assert.equal(sessionFetches, 1);
  assert.equal(detailFetches, 2, "one id may retry once; the second id must never start");
  assert.equal(domClicks, 0, "429 must never enter rendered-page navigation fallback");
  const externalized = JSON.stringify({ runtimeMessages, storageWrites });
  assert.doesNotMatch(externalized, new RegExp(secretToken));
  assert.doesNotMatch(externalized, new RegExp(secretAccount));
  runtimeMessages
    .filter((message) => String(message.type || "").startsWith("account.request."))
    .forEach((message) => {
      assert.equal(Object.prototype.hasOwnProperty.call(message, "authorization"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(message, "token"), false);
      assert.equal(Object.prototype.hasOwnProperty.call(message, "accountId"), false);
    });
});

test("content script exits before touching directly opened ChatGPT data endpoints", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  assert.doesNotThrow(() => {
    vm.runInNewContext(script, {
      location: { pathname: "/backend-api/models" }
    });
  });
  assert.doesNotThrow(() => {
    vm.runInNewContext(script, {
      location: { pathname: "/api/auth/session" }
    });
  });
});

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

    if (
      selector.includes('[data-turn="assistant"]') &&
      this.attributes["data-turn"] === "assistant"
    ) {
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
    if (this._innerHTML.includes("chatgpt-model-usage-counter-panel-toggle")) {
      const toggle = new PanelTestElement({ tagName: "BUTTON", id: "chatgpt-model-usage-counter-panel-toggle" });
      const toggleLabel = new PanelTestElement({ tagName: "SPAN", className: "chatgpt-model-usage-counter-panel-toggle-label" });
      toggle.appendChild(toggleLabel);
      this.appendChild(toggle);
    }
    if (this._innerHTML.includes("chatgpt-model-usage-counter-panel-body")) {
      this.appendChild(new PanelTestElement({
        tagName: "DIV",
        id: "chatgpt-model-usage-counter-panel-body"
      }));
    }
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
  const head = new PanelTestElement({ tagName: "HEAD" });
  const body = new PanelTestElement({
    tagName: "BODY",
    rect: { top: 0, left: 0, width: 1280, height: 900, right: 1280, bottom: 900 }
  });
  documentElement.appendChild(head);
  documentElement.appendChild(body);

  const document = {
    title: "ChatGPT",
    readyState: "complete",
    documentElement,
    head,
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
  const runtimeListeners = [];
  const documentListeners = [];
  const windowListeners = [];
  const intervals = [];
  if (options.trackRegistrations && typeof document.addEventListener === "function") {
    const addDocumentListener = document.addEventListener;
    document.addEventListener = function trackDocumentListener(type, listener, listenerOptions) {
      documentListeners.push({ type, listener, options: listenerOptions });
      return addDocumentListener.call(this, type, listener, listenerOptions);
    };
  }
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
      ChatGPTUsageDashboard: options.dashboard || {
        init() {
          return { reload() {} };
        }
      },
      addEventListener(type, listener, listenerOptions) {
        if (options.trackRegistrations) {
          windowListeners.push({ type, listener, options: listenerOptions });
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
        },
        onMessage: options.trackRegistrations ? {
          addListener(listener) {
            runtimeListeners.push(listener);
          }
        } : undefined
      },
      storage: options.storageItems || options.trackRegistrations ? {
        local: {
          get(keys, callback) {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (
                options.storageItems &&
                Object.prototype.hasOwnProperty.call(options.storageItems, key)
              ) {
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
    setTimeout: options.setTimeout || setTimeout,
    clearTimeout: options.clearTimeout || clearTimeout,
    setInterval: options.trackRegistrations ? function trackInterval(listener, delay) {
      intervals.push({ listener, delay });
      return intervals.length;
    } : options.setInterval,
    fetch: options.fetch,
    AbortController,
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
  return {
    context,
    messages,
    registrations: {
      documentListeners,
      intervals,
      runtimeListeners,
      storageListeners,
      windowListeners
    },
    storageListeners
  };
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
  const dashboardReloadOptions = [];
  const { messages } = runPanelContentScript(document, {
    modelCatalog,
    dashboard: {
      init() {
        return {
          reload(options) {
            dashboardReloadOptions.push(options || {});
          }
        };
      }
    },
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
  assert.equal(dashboardReloadOptions.length, 1);
  assert.equal(
    dashboardReloadOptions[0].skipExportList,
    true,
    "catalog completion must not restart an export-index read already in progress"
  );

  toggle.listeners.click();
  toggle.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modelFetches, 1);
  assert.equal(
    dashboardReloadOptions.some((options) => options.restoreActiveView === true),
    true,
    "reopening the existing page panel must restore the main view last selected from either entry point"
  );
});

test("a failed hover-open model catalog read keeps the five-minute retry cooldown", async () => {
  const document = createPanelDocument({ titleBar: true });
  let modelFetches = 0;
  const { messages } = runPanelContentScript(document, {
    modelCatalog,
    fetch: async (url) => {
      if (String(url).includes("/backend-api/models")) {
        modelFetches += 1;
        throw new Error("temporary-network-failure");
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    onRuntimeMessage(message) {
      if (message.type === "usage.catalog.get") {
        return { ok: true, catalog: null };
      }
      if (message.type === "usage.catalog.refresh.claim") {
        return { ok: true, claimed: true };
      }
      return { ok: true };
    }
  });

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
  host.listeners.mouseenter();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  toggle.listeners.click();
  host.listeners.mouseenter();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(modelFetches, 1);
  assert.equal(
    messages.filter((message) => message.type === "usage.catalog.refresh.claim").length,
    1
  );
  assert.equal(
    messages.filter((message) => message.type === "usage.catalog.refresh.release").length,
    0
  );
});

test("an unmapped response stays passive until the user opens the statistics panel", async () => {
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

  assert.equal(modelFetches, 0, JSON.stringify(messages));
  assert.equal(
    messages.filter((message) => message.type === "usage.catalog.refresh.claim").length,
    0
  );

  toggle.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(modelFetches, 1, "the explicit panel open performs the one account-catalog read");
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

test("reinjection never starts a second active content-script instance while the first observer owns remounting", () => {
  const document = createPanelDocument({ titleBar: true });
  let observerCount = 0;
  const { context, registrations } = runPanelContentScript(document, {
    trackRegistrations: true,
    MutationObserver: class {
      constructor() {
        observerCount += 1;
      }
      observe() {}
      disconnect() {}
    }
  });
  const registrationCounts = () => ({
    mutationObservers: observerCount,
    runtimeMessageListeners: registrations.runtimeListeners.length,
    storageChangeListeners: registrations.storageListeners.length,
    documentListeners: registrations.documentListeners.length,
    windowListeners: registrations.windowListeners.length,
    intervals: registrations.intervals.length
  });
  const initialCounts = registrationCounts();
  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  host.parentNode.children = host.parentNode.children.filter((child) => child !== host);
  host.parentNode = null;
  host.parentElement = null;

  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  vm.runInContext(script, context);

  assert.deepEqual(
    initialCounts,
    {
      mutationObservers: 2,
      runtimeMessageListeners: 1,
      storageChangeListeners: 1,
      documentListeners: 9,
      windowListeners: 1,
      intervals: 1
    },
    "one active instance owns the complete observer, listener, and interval set"
  );
  assert.deepEqual(
    registrationCounts(),
    initialCounts,
    "reinjection must not duplicate any observer, runtime/storage listener, DOM listener, or interval"
  );
  assert.equal(
    document.documentElement.getAttribute("data-chatgpt-model-usage-content-skip"),
    "active-instance"
  );
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
  const style = document.getElementById("chatgpt-model-usage-counter-panel-style").textContent;
  const panel = document.getElementById("chatgpt-model-usage-counter-panel");
  assert.ok(host);
  assert.ok(panel);
  assert.equal(host.parentNode, document.body);
  assert.equal(panel.parentNode, document.body);
  assert.equal(host.classList.contains("is-fallback"), true);
  assert.match(style, /#chatgpt-model-usage-counter-panel-host\.is-fallback\{position:fixed;right:12px;top:12px\}/);
  assert.doesNotMatch(style, /#chatgpt-model-usage-counter-panel-host\.is-fallback\{[^}]*bottom:/);
});

test("usage panel host follows the system theme instead of the ChatGPT page theme", () => {
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
  const panel = document.getElementById("chatgpt-model-usage-counter-panel");
  const style = document.getElementById("chatgpt-model-usage-counter-panel-style").textContent;

  assert.equal(document.documentElement.classList.contains("dark"), false);
  assert.equal(document.documentElement.getAttribute("data-theme"), null);
  assert.equal(host.getAttribute("data-chatgpt-model-usage-theme"), "light");
  assert.equal(host.getAttribute("data-chatgpt-model-usage-theme-mode"), "system");
  assert.equal(panel.getAttribute("data-chatgpt-model-usage-theme"), "light");
  assert.equal(panel.getAttribute("data-chatgpt-model-usage-theme-mode"), "system");
  assert.match(style, /#chatgpt-model-usage-counter-panel-host\[data-chatgpt-model-usage-theme="dark"\]/);
});

test("usage panel host applies the persisted manual dark theme independently of system and page themes", () => {
  const document = createPanelDocument({ titleBar: true });
  runPanelContentScript(document, {
    storageItems: {
      "chatgptModelUsageSettings.v1": {
        language: "en",
        themeMode: "dark"
      }
    },
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
  const panel = document.getElementById("chatgpt-model-usage-counter-panel");

  assert.equal(host.getAttribute("data-chatgpt-model-usage-theme"), "dark");
  assert.equal(host.getAttribute("data-chatgpt-model-usage-theme-mode"), "dark");
  assert.equal(panel.getAttribute("data-chatgpt-model-usage-theme"), "dark");
});

test("usage panel opens as a single-scroll dashboard surface", () => {
  const document = createPanelDocument({ titleBar: true });
  runPanelContentScript(document);

  const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
  const style = document.getElementById("chatgpt-model-usage-counter-panel-style").textContent;

  assert.match(style, /#chatgpt-model-usage-counter-panel\{[^}]*width:min\(430px,calc\(100vw - 24px\)\)/);
  assert.match(style, /#chatgpt-model-usage-counter-panel\{[^}]*height:min\(600px,calc\(100vh - 76px\)\)/);
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
  const style = document.getElementById("chatgpt-model-usage-counter-panel-style").textContent;

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
  assert.equal(usage[0].payload.requestModel, "");
  assert.equal(usage[0].payload.chatgptModel, "");
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

  context.location.href = "https://chatgpt.com/c/new-conversation-0001";
  const reasoningTurn = new FakeElement({
    tagName: "SECTION",
    attributes: { "data-turn": "assistant", "data-turn-id": "reasoning-turn" }
  });
  const finalTurn = new FakeElement({
    tagName: "SECTION",
    attributes: { "data-turn": "assistant", "data-turn-id": "final-turn" }
  });
  elements.push(new FakeElement({
    tagName: "DIV",
    textContent: "Researching sources…",
    parent: reasoningTurn,
    attributes: {
      "data-message-author-role": "assistant",
      "data-message-id": "request-WEB:assistant-reasoning",
      "data-message-model-slug": "gpt-5-6-thinking"
    }
  }));
  mutationCallback();
  assert.equal(
    messages.filter((message) => message.type === "usage.response").length,
    0,
    "a text-bearing progress node must not become the actual response"
  );
  elements.push(new FakeElement({
    tagName: "DIV",
    textContent: "Final answer",
    parent: finalTurn,
    attributes: {
      "data-message-author-role": "assistant",
      "data-message-id": "assistant-final",
      "data-message-model-slug": "gpt-5-6-pro"
    }
  }));
  mutationCallback();

  const responses = messages.filter((message) => message.type === "usage.response");
  assert.equal(responses.length, 1, "reasoning and final assistant nodes reconcile one submission once");
  assert.equal(responses[0].payload.submissionId, usage[0].payload.submissionId);
  assert.equal(responses[0].payload.responseModel, "gpt-5-6-pro", "the content-bearing final response wins over a reasoning node");
  assert.equal(responses[0].payload.responseMessageId, "assistant-final");
  assert.equal(responses[0].payload.conversationId, "new-conversation-0001");
});

test("generated image output adds the image feature while the unavailable response model stays empty", () => {
  const listeners = {};
  const messages = [];
  let mutationCallback = null;
  const modelButton = new FakeElement({
    innerText: "GPT-5.6 Sol",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Create an image.",
    rect: { top: 720, left: 24, width: 560, height: 80, right: 584, bottom: 800 }
  });
  const elements = [modelButton, sendButton, textarea];
  const document = {
    title: "Image generation",
    body: new FakeElement({ tagName: "BODY" }),
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes("data-message-model-slug")) return [];
      if (selector.includes('[data-turn="assistant"]')) {
        return elements.filter((element) => element.getAttribute("data-turn") === "assistant");
      }
      if (selector.includes('[data-turn="user"]')) return [];
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
    location: { href: "https://chatgpt.com/c/image-output-0001" },
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
      constructor(callback) { mutationCallback = callback; }
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
  listeners.click({ target: sendButton });

  const imageTurn = new FakeElement({
    tagName: "SECTION",
    attributes: {
      "data-turn": "assistant",
      "data-turn-id": "request-WEB:image-output-0001"
    }
  });
  imageTurn.querySelector = (selector) =>
    selector.includes('img[alt^="Generated image:"')
      ? new FakeElement({ tagName: "IMG", attributes: { alt: "Generated image: test" } })
      : null;
  elements.push(imageTurn);
  mutationCallback();

  const outcomes = messages.filter((message) => message.type === "usage.response");
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].payload.responseModel, "");
  assert.deepEqual(Array.from(outcomes[0].payload.usageFeatures), ["image_generation"]);
  assert.equal(outcomes[0].payload.featureObservedSource, "message-dom:feature:image-generation");
});

test("a final response retries one rejected timer flush as a response-only event", () => {
  const listeners = {};
  const messages = [];
  const timers = [];
  let stats = background.createEmptyStats();
  let mutationCallback = null;
  const modelButton = new FakeElement({
    innerText: "GPT-5.6 Sol",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" }
  });
  const sendButton = new FakeElement({
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Resolve the delayed request route.",
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
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes("data-message-model-slug")) {
        return elements.filter((element) => element.getAttribute("data-message-model-slug"));
      }
      if (selector.includes("data-message-author-role")) {
        return elements.filter((element) => element.getAttribute("data-message-author-role"));
      }
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
    location: { href: "https://chatgpt.com/c/delayed-response-0001" },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (message.type === "usage.increment") {
            const before = background.totalCount(stats);
            stats = background.applyIncrement(
              stats,
              message.payload,
              new Date(message.payload.submittedAt)
            );
            const event = stats.events.find(
              (item) => item.submissionId === message.payload.submissionId
            ) || null;
            callback({
              ok: true,
              recorded: background.totalCount(stats) > before,
              duplicate: false,
              event,
              stats
            });
            return;
          }
          if (message.type === "usage.response") {
            const before = JSON.stringify(stats.events);
            stats = background.applyResponseObservation(
              stats,
              message.payload,
              new Date(message.payload.observedAt)
            );
            callback({
              ok: true,
              updated: JSON.stringify(stats.events) !== before,
              stats
            });
            return;
          }
          if (callback) callback({ ok: true });
        }
      }
    },
    MutationObserver: class FakeMutationObserver {
      constructor(callback) {
        mutationCallback = callback;
      }
      observe() {}
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms });
      return timers.length;
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

  assert.equal(usageMessages(messages).length, 0, "public-only selection waits for exact request evidence");
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(usageMessages(messages).length, 1, "the timer makes one request-evidence attempt");
  assert.equal(background.totalCount(stats), 0, "an untrusted DOM selection alone is not counted");
  const finalTurn = new FakeElement({
    tagName: "SECTION",
    attributes: { "data-turn": "assistant", "data-turn-id": "delayed-final-turn" }
  });
  elements.push(new FakeElement({
    tagName: "DIV",
    textContent: "Final answer",
    parent: finalTurn,
    attributes: {
      "data-message-author-role": "assistant",
      "data-message-id": "assistant-delayed-final",
      "data-message-model-slug": "gpt-5-6-thinking"
    }
  }));
  mutationCallback();

  const usage = usageMessages(messages);
  const responses = messages.filter((message) => message.type === "usage.response");
  assert.equal(usage.length, 2);
  assert.equal(usage[0].payload.submissionId, usage[1].payload.submissionId);
  assert.equal(usage[0].payload.responseModel, "");
  assert.equal(responses.length, 0, "the response-first race is stored atomically in the one increment");
  assert.equal(usage[1].payload.requestModel, "");
  assert.equal(usage[1].payload.responseModel, "gpt-5-6-thinking");
  assert.equal(usage[1].payload.modelIdentitySource, "response-model");
  assert.equal(usage[1].payload.responseObservedSource, "message-dom:model-slug");
  assert.equal(usage[1].payload.responseMessageId, "assistant-delayed-final");
  assert.equal(background.totalCount(stats), 1);
  assert.equal(stats.events.length, 1);
  assert.equal(stats.events[0].requestModel, "");
  assert.equal(stats.events[0].requestModelEvidence, "unavailable");
  assert.equal(stats.events[0].responseModel, "gpt-5-6-thinking");
  assert.equal(stats.events[0].responseMessageId, "assistant-delayed-final");
});

test("a final response arriving before the increment callback updates the same submission", () => {
  const messages = [];
  let incrementCallback = null;
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    body: new FakeElement({ tagName: "BODY" }),
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: {
      href: "https://chatgpt.com/c/increment-callback-race",
      pathname: "/c/increment-callback-race"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (message.type === "usage.increment") {
            incrementCallback = callback;
            return;
          }
          if (callback) callback({ ok: true, updated: true });
        }
      }
    },
    setTimeout() { return 1; },
    clearTimeout() {},
    Date,
    Math,
    String,
    Number,
    Set,
    Map
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  const script = source.replace(
    /\}\)\(\);\s*$/,
    [
      "window.__usageIncrementRaceTest = {",
      "  queue: queueSubmission,",
      "  finish: finishPendingSubmission,",
      "  send: sendAssistantOutcomeObservation",
      "};",
      "})();"
    ].join("\n")
  );
  vm.createContext(context);
  vm.runInContext(script, context);
  const api = context.window.__usageIncrementRaceTest;
  const submittedAt = Date.now();
  api.queue(
    "send-button",
    "callback race",
    {
      label: "GPT-5.6 Sol",
      apiModel: "gpt-5-6-thinking",
      parameters: { model: "gpt-5-6-thinking" },
      selectedPublicModel: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      observedSource: "message-dom:dom"
    },
    submittedAt,
    [],
    "chat",
    "user-callback-race"
  );
  api.finish();

  const increments = usageMessages(messages);
  assert.equal(increments.length, 1);
  assert.equal(typeof incrementCallback, "function");
  assert.equal(
    api.send(
      "gpt-5-6-thinking",
      [],
      "message-dom:model-slug",
      submittedAt + 100,
      "assistant-callback-race",
      "user-callback-race"
    ),
    true
  );
  assert.equal(
    messages.filter((message) => message.type === "usage.response").length,
    0,
    "the response waits while the first increment callback is outstanding"
  );

  incrementCallback({
    ok: true,
    recorded: true,
    event: {
      submissionId: increments[0].payload.submissionId,
      conversationId: "increment-callback-race",
      requestMessageId: "user-callback-race",
      model: "GPT-5.6 Sol"
    },
    stats: { totals: { "GPT-5.6 Sol": 1 } }
  });

  const responses = messages.filter((message) => message.type === "usage.response");
  assert.equal(responses.length, 1);
  assert.equal(responses[0].payload.submissionId, increments[0].payload.submissionId);
  assert.equal(responses[0].payload.requestMessageId, "user-callback-race");
  assert.equal(responses[0].payload.responseModel, "gpt-5-6-thinking");
  assert.equal(responses[0].payload.responseMessageId, "assistant-callback-race");
});

test("regeneration binds the latest user message id and the final response chooses the new submission", () => {
  const messages = [];
  const modelButton = new FakeElement({
    innerText: "GPT-5.6 Sol",
    attributes: {
      "data-testid": "model-switcher-dropdown-button",
      "aria-haspopup": "menu"
    }
  });
  const userMessage = new FakeElement({
    tagName: "DIV",
    textContent: "Original user prompt",
    attributes: {
      "data-message-author-role": "user",
      "data-message-id": "user-regenerate"
    }
  });
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    body: new FakeElement({ tagName: "BODY" }),
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector.includes("model-switcher")) return [modelButton];
      if (selector.includes('data-message-author-role="user"')) return [userMessage];
      if (selector.includes("button") || selector.includes('[role="button"]')) return [modelButton];
      return [];
    },
    getElementById() { return null; }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: {
      href: "https://chatgpt.com/c/regeneration-linkage",
      pathname: "/c/regeneration-linkage"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message) {
          messages.push(message);
        }
      }
    },
    setTimeout() { return 1; },
    clearTimeout() {},
    Date,
    Math,
    String,
    Number,
    Set,
    Map
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  const script = source.replace(
    /\}\)\(\);\s*$/,
    [
      "window.__usageRegenerationTest = {",
      "  remember: rememberPendingResponseObservation,",
      "  regenerate: recordRegeneration,",
      "  send: sendAssistantOutcomeObservation,",
      "  list: function () { return pendingResponseObservations; }",
      "};",
      "})();"
    ].join("\n")
  );
  vm.createContext(context);
  vm.runInContext(script, context);
  const api = context.window.__usageRegenerationTest;

  api.remember(
    "older-original-submission",
    Date.now() - 100,
    context.location.href,
    "user-regenerate"
  );
  api.regenerate("regenerate");
  const pending = api.list();
  assert.equal(pending.length, 2);
  const newest = pending[pending.length - 1];
  assert.equal(newest.requestMessageId, "user-regenerate");
  assert.notEqual(newest.submissionId, "older-original-submission");
  assert.equal(
    Object.prototype.hasOwnProperty.call(newest.submission || {}, "promptText"),
    false,
    "pending retries retain only a prompt hash and length, never the full prompt"
  );
  assert.match(String(newest.submission && newest.submission.promptHash), /^[0-9a-f]+$/);
  assert.equal(
    newest.submission && newest.submission.promptLength,
    "__regenerate__:regeneration-linkage".length,
    "regeneration retries retain only the synthetic operation identity length, not the user's prompt"
  );

  assert.equal(
    api.send(
      "gpt-5-6-thinking",
      [],
      "message-dom:model-slug",
      Date.now(),
      "assistant-regenerated",
      "user-regenerate"
    ),
    true
  );
  assert.equal(pending[0].responseCandidate, null);
  assert.equal(newest.responseCandidate.model, "gpt-5-6-thinking");
  const increments = usageMessages(messages);
  assert.equal(increments.length, 1);
  assert.equal(increments[0].payload.submissionId, newest.submissionId);
  assert.equal(increments[0].payload.requestMessageId, "user-regenerate");
  assert.equal(increments[0].payload.responseModel, "gpt-5-6-thinking");
});

test("an explicit unmatched request message id never falls back to an older same-conversation submission", () => {
  const messages = [];
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    body: new FakeElement({ tagName: "BODY" }),
    documentElement: { setAttribute() {}, getAttribute() { return null; } },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: {
      href: "https://chatgpt.com/c/exact-response-linkage",
      pathname: "/c/exact-response-linkage"
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (callback) callback({ ok: true, updated: true });
        }
      }
    },
    Date,
    Math,
    String,
    Number,
    Set,
    Map
  };
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  const script = source.replace(
    /\}\)\(\);\s*$/,
    [
      "window.__usageResponseLinkageTest = {",
      "  remember: rememberPendingResponseObservation,",
      "  find: pendingResponseObservationById,",
      "  markRecorded: markPendingResponseRecorded,",
      "  send: sendAssistantOutcomeObservation",
      "};",
      "})();"
    ].join("\n")
  );

  vm.createContext(context);
  vm.runInContext(script, context);
  const api = context.window.__usageResponseLinkageTest;

  api.remember("older-submission", 1_000, context.location.href, "user-older");
  api.markRecorded("older-submission");
  assert.equal(
    api.send(
      "gpt-5-6-thinking",
      [],
      "message-dom:model-slug",
      1_100,
      "assistant-older",
      "user-older"
    ),
    true
  );
  assert.equal(api.find("older-submission").completed, true);

  api.remember("current-submission", 2_000, context.location.href, "user-current");
  assert.equal(api.find("older-submission"), null, "a completed older entry is cleaned before the new submission");
  assert.ok(api.find("current-submission"));

  const before = messages.length;
  assert.equal(
    api.send(
      "gpt-5-6-pro",
      [],
      "message-dom:model-slug",
      2_100,
      "assistant-unmatched",
      "user-not-present"
    ),
    false
  );
  assert.equal(messages.length, before);
  assert.equal(api.find("current-submission").responseCandidate, null);
});

test("content startup passively recovers a stored pending event from exact visible user and assistant message ids", async () => {
  const listeners = {};
  const messages = [];
  const attributes = {};

  class TurnElement extends FakeElement {
    constructor(options = {}) {
      super(options);
      this.childrenByRole = options.childrenByRole || {};
      this.parentElement = options.parentElement || null;
    }
    querySelector(selector) {
      if (selector.includes('data-message-author-role="user"')) {
        return this.childrenByRole.user || null;
      }
      if (selector.includes('data-message-author-role="assistant"')) {
        return this.childrenByRole.assistant || null;
      }
      return null;
    }
  }

  const userMessage = new TurnElement({
    tagName: "DIV",
    textContent: "Manual user prompt",
    attributes: {
      "data-message-author-role": "user",
      "data-message-id": "visible-user-message-0001"
    }
  });
  const assistantMessage = new TurnElement({
    tagName: "DIV",
    textContent: "Final visible answer",
    attributes: {
      "data-message-author-role": "assistant",
      "data-message-id": "visible-assistant-message-0001",
      "data-message-model-slug": "gpt-5.6-luna-wm"
    }
  });
  const userTurn = new TurnElement({
    tagName: "SECTION",
    attributes: {
      "data-turn": "user",
      "data-turn-id": "visible-user-message-0001"
    },
    childrenByRole: { user: userMessage }
  });
  const assistantTurn = new TurnElement({
    tagName: "SECTION",
    attributes: {
      "data-turn": "assistant",
      "data-turn-id": "assistant-turn-0001"
    },
    childrenByRole: { assistant: assistantMessage }
  });
  userMessage.parentElement = userTurn;
  assistantMessage.parentElement = assistantTurn;
  assistantMessage.closest = (selector) =>
    selector.includes('data-turn="assistant"') ? assistantTurn : null;

  const document = {
    title: "Clarify Number",
    readyState: "complete",
    body: new FakeElement({ tagName: "BODY" }),
    documentElement: {
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return attributes[name] || null; }
    },
    addEventListener(type, listener) { listeners[type] = listener; },
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector.includes('[data-turn="user"]')) {
        return [userTurn, assistantTurn];
      }
      if (selector.includes("data-message-model-slug")) {
        return [assistantMessage];
      }
      if (selector.includes('data-message-author-role="user"')) {
        return [userMessage];
      }
      if (selector.includes('data-message-author-role="assistant"')) {
        return [assistantMessage];
      }
      return [];
    }
  };
  const context = {
    window: { ChatGPTUsageDetector: detector },
    document,
    location: {
      href: "https://chatgpt.com/c/recovery-conversation-0001",
      pathname: "/c/recovery-conversation-0001"
    },
    chrome: {
      runtime: {
        id: "test-extension",
        lastError: null,
        sendMessage(message, callback) {
          messages.push(message);
          if (message.type === "usage.pending.get") {
            callback({
              ok: true,
              events: [
                {
                  submissionId: "stored-submission-0001",
                  conversationId: "recovery-conversation-0001",
                  submittedAt: "2026-08-23T06:20:00.000Z",
                  requestMessageId: "visible-user-message-0001",
                  responseMessageId: "",
                  requestModel: "gpt-5.6-luna-wm",
                  responseModel: ""
                }
              ]
            });
            return;
          }
          if (message.type === "usage.response") {
            callback({ ok: true, updated: true });
            return;
          }
          if (callback) callback({ ok: true });
        }
      }
    },
    Date,
    Math,
    String,
    Number,
    Promise,
    Map,
    Set
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");
  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));

  const recovered = messages.filter((message) => message.type === "usage.response");
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].payload.submissionId, "stored-submission-0001");
  assert.equal(recovered[0].payload.requestMessageId, "visible-user-message-0001");
  assert.equal(recovered[0].payload.responseMessageId, "visible-assistant-message-0001");
  assert.equal(recovered[0].payload.responseModel, "gpt-5.6-luna-wm");
  assert.equal(recovered[0].payload.observedSource, "message-dom:model-slug:recovered");
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
  assert.equal(usage[0].payload.requestModel, "");
  assert.equal(usage[0].payload.chatgptModel, "");
  assert.deepEqual(Object.keys(usage[0].payload.modelParameters), []);
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
  assert.equal(usage[0].payload.requestModel, "");
  assert.equal(usage[0].payload.modelParameters.model, undefined);
  assert.equal(usage[0].payload.selectedPublicMode, "thinking");
  assert.equal(usage[0].payload.selectedPublicModeLabel, "Thinking");
  assert.equal(usage[0].payload.selectedPublicModeSource, "selector-dom:model-control");
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
  assert.equal(usage[0].payload.requestModel, "");
  assert.equal(usage[0].payload.chatgptModel, "");
  assert.equal(usage[0].payload.modelObservedSource, "message-dom:dom");
  assert.deepEqual(Array.from(usage[0].payload.usageFeatures), []);
  assert.equal(usage[0].payload.modelParameters.model, undefined);
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

test("a selected current conversation falls back to its already-rendered messages when account history fails", async () => {
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
  const result = await context.window.__chatgptUsageCollectMany(["shared-chat-0001"]);

  assert.equal(result.complete, false);
  assert.equal(result.failures.length, 0);
  assert.ok(result.warnings.length >= 1);
  assert.equal(result.warnings.some((warning) => warning.scope === "rendered-page-fallback"), true);
  assert.deepEqual(Array.from(result.conversations, (conversation) => conversation.id), ["shared-chat-0001"]);

  const messageResult = await new Promise((resolve) => {
    listeners.runtimeMessage({ type: "conversation.collectMany", ids: ["shared-chat-0001"] }, {}, resolve);
  });
  assert.equal(messageResult.ok, true);
  assert.equal(messageResult.complete, false);
  assert.equal(messageResult.warnings.some((warning) => warning.scope === "rendered-page-fallback"), true);
});

test("content script exposes only selected-id detail collection and no unselected whole-account shortcut", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "content.js"), "utf8");

  assert.match(script, /__chatgptUsageCollectMany\s*=\s*collectSelectedConversations/);
  assert.doesNotMatch(script, /__chatgptUsageCollectCurrent|__chatgptUsageCollectAll/);
  assert.doesNotMatch(script, /message\.type\s*===\s*"conversation\.collect"/);
  assert.doesNotMatch(script, /message\.type\s*===\s*"conversation\.collectAll"/);
});

test("account export index preserves project directories without expanding the ChatGPT sidebar", async () => {
  const listeners = {};
  const projectId = "g-p-1234567890abcdef1234567890abcdef";
  let collapsedFolderClicks = 0;
  let projectDirectoryRequests = 0;
  let reloads = 0;
  let networkRequests = 0;
  const link = (href, text, aria = "") => ({
    innerText: text,
    textContent: text,
    getAttribute(name) {
      if (name === "href") return href;
      if (name === "aria-label") return aria;
      return "";
    }
  });
  const projectRoot = link(`/g/${projectId}-invest/project`, "invest", "Open invest project");
  const projectChat = link(
    `/g/${projectId}/c/project-chat-0001`,
    "Project chat",
    "Project chat, chat in project invest"
  );
  const ordinaryChat = link("/c/ordinary-chat-0001", "Ordinary chat");
  const document = {
    title: "Project chat - ChatGPT",
    readyState: "loading",
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector(selector) {
      if (selector.includes("project-chat-0001")) return projectChat;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[href*="/c/"]') return [projectChat, ordinaryChat];
      if (selector === 'a[href*="/g/"][href*="/project"]') return [projectRoot];
      if (selector === 'nav [aria-expanded="false"]') {
        return [{ click() { collapsedFolderClicks += 1; } }];
      }
      return [];
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: { collectConversationFromDom() { return null; } },
      fetch() {
        networkRequests += 1;
        throw new Error("must not fetch project directories");
      },
      ChatGPTConversationSource: {
        listAccountConversations() {
          return Promise.resolve({
            conversations: [
              { id: "project-chat-0001", title: "Project chat", projectId },
              { id: "ordinary-chat-0001", title: "Ordinary chat" }
            ],
            complete: true,
            warnings: []
          });
        }
      }
    },
    document,
    location: {
      href: `https://chatgpt.com/g/${projectId}/c/project-chat-0001`,
      origin: "https://chatgpt.com",
      pathname: `/g/${projectId}/c/project-chat-0001`,
      reload() { reloads += 1; }
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          if (message.type === "conversation.projectDirectories.get") {
            projectDirectoryRequests += 1;
            callback({ ok: false, error: "MAIN-world mapping unavailable" });
            return;
          }
          if (callback) callback({ ok: true });
        },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      }
    },
    fetch() {
      networkRequests += 1;
      throw new Error("must not fetch project directories");
    },
    Headers,
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
  const result = await context.window.__chatgptUsageListConversations();
  const project = result.conversations.find((conversation) => conversation.id === "project-chat-0001");
  const ordinary = result.conversations.find((conversation) => conversation.id === "ordinary-chat-0001");

  assert.equal(project.projectId, projectId);
  assert.equal(project.projectName, "invest");
  assert.equal(project.projectOrder, 0);
  assert.equal(project.groupType, "project");
  assert.equal(ordinary.projectId, "");
  assert.equal(ordinary.projectOrder, null);
  assert.equal(ordinary.groupType, "");
  assert.equal(projectDirectoryRequests, 1);
  assert.equal(collapsedFolderClicks, 0, "reading the index must not mutate collapsed sidebar folders");
  assert.equal(reloads, 0, "reading the index must not refresh the page");
  assert.equal(networkRequests, 0, "project directory mapping must not issue a request");
});

test("account export index merges ordered MAIN-world project names in parallel with the account index", async () => {
  const listeners = {};
  const alphaId = "g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const betaId = "g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  let projectDirectoryRequested = false;
  let accountIndexStarted = false;
  let collapsedFolderClicks = 0;
  let reloads = 0;
  let networkRequests = 0;
  const runtimeMessages = [];
  const link = (href, text, aria = "") => ({
    innerText: text,
    textContent: text,
    getAttribute(name) {
      if (name === "href") return href;
      if (name === "aria-label") return aria;
      return "";
    }
  });
  const alphaRoot = link(`/g/${alphaId}-alpha-slug/project`, "alpha-slug", "Open alpha-slug project");
  const betaRoot = link(`/g/${betaId}-beta-slug/project`, "beta-slug", "Open beta-slug project");
  const alphaChat = link(
    `/g/${alphaId}/c/alpha-chat-0001`,
    "Alpha chat",
    "Alpha chat, chat in project alpha-slug"
  );
  const betaChat = link(
    `/g/${betaId}/c/beta-chat-0001`,
    "Beta chat",
    "Beta chat, chat in project beta-slug"
  );
  const document = {
    title: "Alpha chat - ChatGPT",
    readyState: "loading",
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector(selector) {
      if (selector.includes("alpha-chat-0001")) return alphaChat;
      if (selector.includes("beta-chat-0001")) return betaChat;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'a[href*="/c/"]') return [alphaChat, betaChat];
      if (selector === 'a[href*="/g/"][href*="/project"]') return [alphaRoot, betaRoot];
      if (selector === 'nav [aria-expanded="false"]') {
        return [{ click() { collapsedFolderClicks += 1; } }];
      }
      return [];
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: { collectConversationFromDom() { return null; } },
      fetch() {
        networkRequests += 1;
        throw new Error("must not fetch project directories");
      },
      ChatGPTConversationSource: {
        listAccountConversations() {
          accountIndexStarted = true;
          return Promise.resolve({
            conversations: [
              {
                id: "alpha-chat-0001",
                title: "Alpha chat",
                projectId: `${alphaId}-alpha-slug`,
                projectName: "过期 Alpha 名称"
              },
              {
                id: "beta-chat-0001",
                title: "Beta chat",
                gizmoId: `${betaId}-beta-slug`,
                projectName: "过期 Beta 名称"
              }
            ],
            complete: true,
            warnings: []
          });
        }
      }
    },
    document,
    location: {
      href: `https://chatgpt.com/g/${alphaId}/c/alpha-chat-0001`,
      origin: "https://chatgpt.com",
      pathname: `/g/${alphaId}/c/alpha-chat-0001`,
      reload() { reloads += 1; }
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          runtimeMessages.push(message);
          if (message.type === "conversation.projectDirectories.get") {
            projectDirectoryRequested = true;
            callback({
              ok: true,
              entries: [
                { gizmoId: betaId, projectName: "真实 Beta 项目", projectOrder: 0 },
                { gizmoId: alphaId, projectName: "真实 Alpha 项目", projectOrder: 1 }
              ],
              projectOrder: [betaId, alphaId]
            });
            return;
          }
          if (callback) callback({ ok: true });
        },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      }
    },
    fetch() {
      networkRequests += 1;
      throw new Error("must not fetch project directories");
    },
    Headers,
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
  const pending = context.window.__chatgptUsageListConversations();
  assert.equal(projectDirectoryRequested, true, "MAIN-world mapping starts immediately");
  assert.equal(accountIndexStarted, true, "account index starts without waiting for the mapping");
  const result = await pending;
  const alpha = result.conversations.find((conversation) => conversation.id === "alpha-chat-0001");
  const beta = result.conversations.find((conversation) => conversation.id === "beta-chat-0001");

  assert.equal(result.conversations[0].id, "alpha-chat-0001", "the current conversation remains first");
  assert.equal(alpha.projectId, alphaId);
  assert.equal(beta.projectId, betaId);
  assert.equal(alpha.projectName, "真实 Alpha 项目");
  assert.equal(beta.projectName, "真实 Beta 项目");
  assert.equal(alpha.projectNameSource, "main-world-react");
  assert.equal(beta.projectNameSource, "main-world-react");
  assert.equal(beta.projectOrder, 0, "project order follows the rendered MAIN-world sidebar snapshot");
  assert.equal(alpha.projectOrder, 1);
  assert.equal(collapsedFolderClicks, 0);
  assert.equal(reloads, 0);
  assert.equal(networkRequests, 0);
  assert.equal(
    runtimeMessages.filter((message) => message.type === "conversation.projectDirectories.get").length,
    1
  );
  assert.doesNotMatch(JSON.stringify(runtimeMessages), /authorization|cookie|bearer|account.?id/i);
});

test("account export index matches the real row-only sidebar names to project route slugs without clicking or fetching", async () => {
  const listeners = {};
  const symbolId = "g-p-6a4a938ff7888191bd120d64ef3a3b6e";
  const investId = "g-p-6a4c521f96a88191bddcaf82bb8081ae";
  const promptId = "g-p-6a4b8296bd608191b14b08be897b746a";
  const creaId = "g-p-6a7d3f0e0970819198b164ac76243cb4";
  const codeId = "g-p-6a4b80c229f8819185e39d411e12e893";
  let projectDirectoryRequests = 0;
  let networkRequests = 0;
  let sidebarClicks = 0;
  const projectRow = (name) => ({
    innerText: name,
    textContent: name,
    querySelector(selector) {
      if (selector === "[data-marquee-text]") {
        return { innerText: name, textContent: name };
      }
      if (selector.includes("aria-label")) {
        return {
          getAttribute(attribute) {
            return attribute === "aria-label" ? `Open project options for ${name}` : "";
          }
        };
      }
      return null;
    }
  });
  const rows = [
    projectRow("@#!#"),
    projectRow("invest"),
    projectRow("prompt"),
    projectRow("Crea"),
    projectRow("code")
  ];
  const document = {
    title: "ChatGPT",
    readyState: "loading",
    documentElement: { getAttribute() { return null; }, setAttribute() {} },
    addEventListener(type, listener) { listeners[type] = listener; },
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === "[class~='group/project-unfurl-row']") return rows;
      if (selector === 'nav [aria-expanded="false"]') {
        return [{ click() { sidebarClicks += 1; } }];
      }
      return [];
    }
  };
  const context = {
    window: {
      ChatGPTUsageDetector: detector,
      ChatGPTUsageExporter: { collectConversationFromDom() { return null; } },
      ChatGPTConversationSource: {
        listAccountConversations() {
          return Promise.resolve({
            conversations: [
              {
                id: "invest-chat-0001",
                title: "Invest",
                projectId: investId,
                projectRouteSlug: "invest",
                projectName: "stale-route-label"
              },
              {
                id: "symbol-chat-0001",
                title: "Symbols",
                projectId: symbolId,
                projectRouteSlug: "%40%23!%23"
              },
              {
                id: "prompt-chat-0001",
                title: "Prompt",
                projectId: promptId,
                projectRouteSlug: "prompt"
              },
              {
                id: "crea-chat-0001",
                title: "Create",
                projectId: creaId,
                projectRouteSlug: "crea"
              },
              {
                id: "code-chat-0001",
                title: "Code",
                projectId: codeId,
                projectRouteSlug: "code"
              }
            ],
            complete: true,
            warnings: []
          });
        }
      },
      fetch() {
        networkRequests += 1;
        throw new Error("must not fetch project names");
      }
    },
    document,
    location: {
      href: "https://chatgpt.com/",
      origin: "https://chatgpt.com",
      pathname: "/",
      reload() {}
    },
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          if (message.type === "conversation.projectDirectories.get") {
            projectDirectoryRequests += 1;
            callback({ ok: true, entries: [], projectOrder: [] });
            return;
          }
          if (callback) callback({ ok: true });
        },
        onMessage: { addListener(listener) { listeners.runtimeMessage = listener; } }
      }
    },
    fetch() {
      networkRequests += 1;
      throw new Error("must not fetch project names");
    },
    Headers,
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
  const result = await context.window.__chatgptUsageListConversations();
  const projects = Object.fromEntries(
    result.conversations.map((conversation) => [conversation.projectId, conversation])
  );

  assert.equal(projects[symbolId].projectName, "@#!#");
  assert.equal(projects[investId].projectName, "invest");
  assert.equal(projects[promptId].projectName, "prompt");
  assert.equal(projects[creaId].projectName, "Crea");
  assert.equal(projects[codeId].projectName, "code");
  assert.equal(projects[symbolId].projectOrder, 0);
  assert.equal(projects[investId].projectOrder, 1);
  assert.equal(projects[promptId].projectOrder, 2);
  assert.equal(projects[creaId].projectOrder, 3);
  assert.equal(projects[codeId].projectOrder, 4);
  assert.equal(projects[symbolId].projectNameSource, "sidebar-project-row");
  assert.equal(projects[investId].projectNameSource, "sidebar-project-row");
  assert.equal(projects[promptId].projectNameSource, "sidebar-project-row");
  assert.equal(projects[creaId].projectNameSource, "sidebar-project-row");
  assert.equal(projects[codeId].projectNameSource, "sidebar-project-row");
  assert.equal(projectDirectoryRequests, 1);
  assert.equal(sidebarClicks, 0);
  assert.equal(networkRequests, 0);
});

test("account-history credentials are reused only inside one operation and released immediately afterward", async () => {
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
          await options.fetchImpl("https://chatgpt.com/backend-api/conversations?offset=100&limit=100");
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
      if (delay < 30_000) {
        Promise.resolve().then(fn);
        return nextTimerId;
      }
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

  assert.equal(sessionFetches, 1, "requests inside one user-triggered operation reuse the in-memory session");
  assert.deepEqual(accountHeaders, ["Bearer memory-token-1", "Bearer memory-token-1"]);
  assert.equal(
    [...timers.values()].some((timer) => timer.delay === 30_000),
    false,
    "operation completion clears the idle-release timer and in-memory credentials"
  );

  await context.window.__chatgptUsageListConversations();
  assert.equal(sessionFetches, 2, "the next history read reloads authorization after idle release");
  assert.deepEqual(accountHeaders.slice(-2), ["Bearer memory-token-2", "Bearer memory-token-2"]);
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
    setTimeout(fn, delay) {
      if (delay < 30_000) Promise.resolve().then(fn);
      return 1;
    },
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
