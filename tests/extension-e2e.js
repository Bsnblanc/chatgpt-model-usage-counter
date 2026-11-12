const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXTENSION_ROOT = process.env.EXTENSION_ROOT
  ? path.resolve(process.env.EXTENSION_ROOT)
  : path.resolve(__dirname, "..");
const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe")
].filter(Boolean);
const STORAGE_KEY = "chatgptModelUsageStats.v1";
const SETTINGS_KEY = "chatgptModelUsageSettings.v1";
const COMPLETION_MARKER = "CHATGPT_MODEL_USAGE_COUNTER_EXTENSION_E2E_COMPLETE";
const CDP_PIPE_TEST_MARKER = "CHATGPT_MODEL_USAGE_COUNTER_CDP_PIPE_TEST_COMPLETE";

function findChrome() {
  const chromePath = CHROME_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!chromePath) {
    throw new Error("Google Chrome executable not found.");
  }

  return chromePath;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

class CdpPipe {
  constructor(chromePath, profilePath) {
    this.nextId = 0;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.closed = false;
    this.closing = false;
    this.failure = null;
    this.stderr = "";
    this.child = spawn(
      chromePath,
      [
        "--remote-debugging-pipe",
        "--enable-unsafe-extension-debugging",
        `--user-data-dir=${profilePath}`,
        "--no-sandbox",
        "--disable-gpu-sandbox",
        "--disable-features=RendererCodeIntegrity",
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
      ],
      { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] }
    );

    this.child.stdio[4].on("data", (chunk) => this.handleData(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-4000);
    });
    this.child.on("error", (error) => {
      this.fail(new Error(`Chrome process error: ${error.message}`, { cause: error }));
    });
    this.child.on("exit", (code, signal) => {
      const exitDescription = signal ? `signal ${signal}` : `code ${code}`;
      const stderr = this.stderr.trim();
      this.fail(new Error(
        `Chrome process exited ${this.closing ? "during cleanup" : "unexpectedly"} with ${exitDescription}.` +
        (stderr ? `\nChrome stderr:\n${stderr}` : "")
      ));
    });
    this.child.stdio[3].on("error", (error) => {
      this.fail(new Error(`Chrome CDP command pipe failed: ${error.message}`, { cause: error }));
    });
    this.child.stdio[4].on("error", (error) => {
      this.fail(new Error(`Chrome CDP response pipe failed: ${error.message}`, { cause: error }));
    });
  }

  fail(error) {
    if (this.failure) {
      return;
    }

    this.failure = error instanceof Error ? error : new Error(String(error));
    this.closed = true;
    const pending = Array.from(this.pending.values());
    this.pending.clear();
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer);
      reject(this.failure);
    });
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let index = this.buffer.indexOf(0);

    while (index !== -1) {
      const raw = this.buffer.slice(0, index).toString();
      this.buffer = this.buffer.slice(index + 1);
      if (raw) {
        this.handleMessage(JSON.parse(raw));
      }
      index = this.buffer.indexOf(0);
    }
  }

  handleMessage(message) {
    if (!message.id) {
      this.dispatchEvent(message);
      return;
    }

    if (!this.pending.has(message.id)) {
      return;
    }

    const callbacks = this.pending.get(message.id);
    this.pending.delete(message.id);
    clearTimeout(callbacks.timer);
    if (message.error) {
      callbacks.reject(new Error(
        `Chrome CDP command failed: ${callbacks.method}: ${JSON.stringify(message.error)}`
      ));
      return;
    }

    callbacks.resolve(message.result);
  }

  dispatchEvent(message) {
    const handlers = this.eventHandlers.get(message.method);
    if (!handlers) {
      return;
    }

    handlers.slice().forEach((handler) => {
      try {
        const result = handler(message.params || {}, message.sessionId);
        if (result && typeof result.catch === "function") {
          result.catch((error) => {
            console.error(`CDP event handler failed for ${message.method}: ${error.stack || error.message}`);
          });
        }
      } catch (error) {
        console.error(`CDP event handler failed for ${message.method}: ${error.stack || error.message}`);
      }
    });
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) || [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
    return () => {
      const nextHandlers = (this.eventHandlers.get(method) || []).filter((candidate) => candidate !== handler);
      if (nextHandlers.length) {
        this.eventHandlers.set(method, nextHandlers);
      } else {
        this.eventHandlers.delete(method);
      }
    };
  }

  send(method, params = {}, sessionId) {
    if (this.closed) {
      return Promise.reject(this.failure || new Error("Chrome CDP pipe is closed."));
    }

    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const message = { id, method, params };
      if (sessionId) {
        message.sessionId = sessionId;
      }

      const timer = setTimeout(() => {
        if (!this.pending.has(id)) {
          return;
        }
        this.pending.delete(id);
        reject(new Error(`Chrome CDP command timed out: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.child.stdio[3].write(JSON.stringify(message) + "\0", (error) => {
          if (error && this.pending.has(id)) {
            this.fail(new Error(`Chrome CDP command write failed: ${error.message}`, { cause: error }));
          }
        });
      } catch (error) {
        this.fail(new Error(`Chrome CDP command write failed: ${error.message}`, { cause: error }));
      }
    });
  }

  async close() {
    if (this.closing) {
      return;
    }
    this.closing = true;
    this.closed = true;
    if (this.pending.size) {
      const error = new Error("Chrome CDP pipe closed before pending requests completed.");
      const pending = Array.from(this.pending.values());
      this.pending.clear();
      pending.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(error);
      });
    }
    if (this.child.exitCode !== null || this.child.signalCode) {
      return;
    }

    try {
      this.child.kill("SIGTERM");
    } catch (_) {
      return;
    }

    await wait(750);
    try {
      this.child.kill("SIGKILL");
    } catch (_) {
      return;
    }
  }
}

async function attach(cdp, targetId) {
  const result = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  return result.sessionId;
}

async function evaluate(cdp, sessionId, expression) {
  const result = await cdp.send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true
    },
    sessionId
  );

  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }

  return result.result.value;
}

async function findExtensionWorker(cdp, extensionId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const targets = await cdp.send("Target.getTargets");
    const worker = targets.targetInfos.find((target) => target.type === "service_worker" && target.url.includes(extensionId));
    if (worker) {
      return worker;
    }
    await wait(250);
  }

  throw new Error("Extension service worker target not found.");
}

async function waitForExtensionStorage(cdp, workerSessionId) {
  var lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const ready = await evaluate(
        cdp,
        workerSessionId,
        "Boolean(globalThis.chrome && chrome.storage && chrome.storage.local)"
      );
      if (ready) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }

  throw new Error(`Extension storage API was not ready in service worker.${lastError ? " Last error: " + lastError.message : ""}`);
}

async function readStorage(cdp, workerSessionId) {
  await waitForExtensionStorage(cdp, workerSessionId);
  return evaluate(cdp, workerSessionId, "new Promise(resolve => chrome.storage.local.get(null, resolve))");
}

async function pollPopup(cdp, popupSessionId) {
  let lastState = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await evaluate(
      cdp,
      popupSessionId,
      `(() => ({
        headline: document.querySelector(".usage-topline")?.textContent || "",
        models: Array.from(document.querySelectorAll(
          ".usage-line-direct-label,.usage-donut-label,.usage-view-model-option,.usage-count-list"
        )).map((node) => node.textContent || "").join(" "),
        chart: Boolean(document.querySelector(".usage-chart")),
        countListVisible: Boolean(document.querySelector(".usage-count-list")),
        externalLegendVisible: Boolean(document.querySelector(".usage-chart-legend")),
        startDate: document.querySelector(".usage-start-date")?.value || "",
        endDate: document.querySelector(".usage-end-date")?.value || "",
        tabs: Array.from(document.querySelectorAll("[data-view-tab]")).map((button) => ({
          view: button.getAttribute("data-view-tab"),
          selected: button.getAttribute("aria-selected"),
          text: button.textContent || ""
        })),
        language: document.querySelector('[data-language-select="en"]')?.getAttribute("aria-pressed") === "true"
          ? "en"
          : "zh"
      }))()`
    );
    lastState = state;

    if (
      state.language === "en" &&
      state.headline.includes("Model usage") &&
      state.models.includes("GPT-4o mini") &&
      state.chart &&
      state.countListVisible &&
      !state.externalLegendVisible &&
      state.tabs.some((tab) => tab.view === "chart" && tab.selected === "true") &&
      state.tabs.some((tab) => tab.view === "status") &&
      state.tabs.some((tab) => tab.view === "export") &&
      !state.tabs.some((tab) => tab.view === "text") &&
      !state.tabs.some((tab) => tab.view === "conversations")
    ) {
      return state;
    }

    await wait(250);
  }

  throw new Error(`Popup did not render the recorded usage: ${JSON.stringify(lastState)}`);
}

async function waitForRealChatGPTInjection(cdp, pageSessionId) {
  let lastState = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = await evaluate(
      cdp,
      pageSessionId,
      `(() => {
        const root = document.documentElement;
        return {
          url: location.href,
          readyState: document.readyState,
          contentEntry: root?.getAttribute("data-chatgpt-model-usage-content-entry") || "",
          contentMarker: root?.getAttribute("data-chatgpt-model-usage-content-loaded") || "",
          contentStage: root?.getAttribute("data-chatgpt-model-usage-content-stage") || "",
          contentSkip: root?.getAttribute("data-chatgpt-model-usage-content-skip") || "",
          panelHost: Boolean(document.querySelector("#chatgpt-model-usage-counter-panel-host"))
        };
      })()`
    );
    lastState = state;
    if (state.contentMarker === "true" && state.panelHost) {
      return state;
    }
    await wait(250);
  }

  throw new Error(`ChatGPT content script and panel did not load: ${JSON.stringify(lastState)}`);
}

async function readPopupViewState(cdp, popupSessionId, view) {
  return evaluate(
    cdp,
    popupSessionId,
    `(() => ({
      activeView: document.querySelector(${JSON.stringify(`[data-view-tab="${view}"]`)})?.getAttribute("aria-selected") || "",
      chart: Boolean(document.querySelector(".usage-chart")),
      points: document.querySelectorAll(".usage-point").length,
      directLabels: Array.from(document.querySelectorAll(
        ".usage-line-direct-label,.usage-donut-label"
      )).map((node) => node.textContent || "").join(" "),
      externalLegendVisible: Boolean(document.querySelector(".usage-chart-legend")),
      countList: document.querySelector(".usage-count-list")?.textContent || "",
      recordSessions: document.querySelector(".usage-record-sessions")?.textContent || "",
      startDate: document.querySelector(".usage-start-date")?.value || "",
      endDate: document.querySelector(".usage-end-date")?.value || ""
    }))()`
  );
}

async function switchPopupView(cdp, popupSessionId, view) {
  await evaluate(
    cdp,
    popupSessionId,
    `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-view-tab="${view}"]`)});
      button.click();
      return true;
    })()`
  );

  let lastState = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await readPopupViewState(cdp, popupSessionId, view);
    lastState = state;
    if (state.activeView === "true") {
      return state;
    }
    await wait(250);
  }

  throw new Error(`Popup view did not switch to ${view}: ${JSON.stringify(lastState)}`);
}

async function refreshPopup(cdp, popupSessionId) {
  await evaluate(
    cdp,
    popupSessionId,
    `(() => {
      const button = document.querySelector(".usage-refresh");
      if (!button) throw new Error("Missing refresh button");
      button.click();
      return true;
    })()`
  );
}

async function testCdpPipeFailureHandling() {
  const missingChrome = path.join(
    os.tmpdir(),
    `chatgpt-usage-missing-chrome-${process.pid}-${Date.now()}.exe`
  );
  const spawnFailure = new CdpPipe(missingChrome, "unused-profile");
  await assert.rejects(
    spawnFailure.send("Browser.getVersion"),
    /Chrome process error|Chrome CDP command (?:pipe|write) failed/
  );
  assert.equal(spawnFailure.pending.size, 0);
  await spawnFailure.close();

  const earlyExit = new CdpPipe(process.execPath, "unused-profile");
  await assert.rejects(
    earlyExit.send("Browser.getVersion"),
    /Chrome process exited unexpectedly|Chrome CDP (?:command|response) pipe failed/
  );
  assert.equal(earlyExit.pending.size, 0);
  await assert.rejects(
    earlyExit.send("Target.getTargets"),
    /closed|failed|exited/
  );
  await earlyExit.close();

  console.log(JSON.stringify({
    ok: true,
    completionMarker: CDP_PIPE_TEST_MARKER
  }));
}

async function main() {
  // Keep the process failed until every E2E assertion reaches the explicit
  // completion checkpoint. This prevents an abandoned Promise from producing
  // a successful exit merely because Chrome has already terminated.
  process.exitCode = 1;
  const chromePath = findChrome();
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-usage-e2e-"));
  const cdp = new CdpPipe(chromePath, profilePath);

  try {
    await cdp.send("Browser.getVersion");
    const extension = await cdp.send("Extensions.loadUnpacked", { path: EXTENSION_ROOT });
    const startupTarget = await cdp.send("Target.createTarget", {
      url: `chrome-extension://${extension.id}/src/popup.html`
    });
    const storageSessionId = await attach(cdp, startupTarget.targetId);
    await cdp.send("Runtime.enable", {}, storageSessionId);
    await cdp.send("Page.enable", {}, storageSessionId);
    await waitForExtensionStorage(cdp, storageSessionId);
    await findExtensionWorker(cdp, extension.id);
    await evaluate(cdp, storageSessionId, "new Promise(resolve => chrome.storage.local.clear(() => resolve(true)))");
    // Keep one extension page alive for the whole run so Chrome does not
    // suspend the MV3 worker while assertions still use its CDP session.

    const pageTarget = await cdp.send("Target.createTarget", { url: "about:blank" });
    const pageSessionId = await attach(cdp, pageTarget.targetId);
    await cdp.send("Runtime.enable", {}, pageSessionId);
    await cdp.send("Page.enable", {}, pageSessionId);
    await cdp.send("Network.enable", {}, pageSessionId);
    const observedConversationRequests = [];
    const fulfilledChatGPTNetworkIds = new Set();
    const interceptedChatGPTRequests = [];
    cdp.on("Fetch.requestPaused", async (params, sessionId) => {
      if (sessionId !== pageSessionId || !params?.request?.url) {
        return;
      }

      const requestUrl = new URL(params.request.url);
      if (requestUrl.hostname !== "chatgpt.com") {
        await cdp.send("Fetch.continueRequest", { requestId: params.requestId }, pageSessionId);
        return;
      }

      const isDocument = params.resourceType === "Document";
      const isConversationRequest =
        params.request.method === "POST" &&
        /\/backend-api\/(?:f\/)?conversation\/?$/.test(requestUrl.pathname);
      interceptedChatGPTRequests.push({
        url: params.request.url,
        method: params.request.method,
        resourceType: params.resourceType,
        networkId: params.networkId || ""
      });
      if (params.networkId) {
        fulfilledChatGPTNetworkIds.add(params.networkId);
      }

      const body = isDocument
        ? Buffer.from(
          "<!doctype html><html><head><meta charset=\"utf-8\"><title>ChatGPT E2E Fixture</title></head><body><main id=\"app\"></main></body></html>"
        ).toString("base64")
        : "";
      await cdp.send(
        "Fetch.fulfillRequest",
        {
          requestId: params.requestId,
          responseCode: isDocument ? 200 : (isConversationRequest ? 204 : 200),
          responseHeaders: [
            { name: "content-type", value: isDocument ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" },
            { name: "cache-control", value: "no-store" }
          ],
          body
        },
        pageSessionId
      );
    });
    await cdp.send(
      "Fetch.enable",
      {
        patterns: [
          {
            urlPattern: "https://chatgpt.com/*",
            requestStage: "Request"
          }
        ]
      },
      pageSessionId
    );
    cdp.on("Network.requestWillBeSent", (params, sessionId) => {
      const request = params && params.request;
      if (
        sessionId === pageSessionId &&
        request &&
        request.method === "POST" &&
        /\/backend-api\/(?:f\/)?conversation\/?$/.test(new URL(request.url).pathname)
      ) {
        observedConversationRequests.push({
          requestId: params.requestId || "",
          url: request.url,
          method: request.method,
          postData: request.postData || ""
        });
      }
    });
    await cdp.send("Page.navigate", { url: "https://chatgpt.com/" }, pageSessionId);
    await waitForRealChatGPTInjection(cdp, pageSessionId);

    const prompt = `codex-extension-e2e-${Date.now()}`;
    await evaluate(
      cdp,
      pageSessionId,
      `(() => {
        history.pushState({}, "", "/c/e2e-conversation");
        document.body.innerHTML = '<main id="app"></main>';
        const app = document.querySelector("#app");
        const model = document.createElement("button");
        model.setAttribute("data-testid", "model-switcher-dropdown-button");
        model.setAttribute("aria-haspopup", "menu");
        model.textContent = "GPT-4o mini";

        const form = document.createElement("form");
        form.setAttribute("data-testid", "composer-form");
        const composer = document.createElement("div");
        composer.id = "prompt-textarea";
        composer.setAttribute("contenteditable", "true");
        composer.setAttribute("role", "textbox");
        composer.textContent = ${JSON.stringify(prompt)};

        const send = document.createElement("button");
        send.type = "button";
        send.setAttribute("data-testid", "send-button");
        send.setAttribute("aria-label", "Send prompt");
        send.textContent = "Send";

        form.append(composer, send);
        app.append(model, form);
        send.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
        send.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
        const userTurn = document.createElement("div");
        userTurn.setAttribute("data-turn", "user");
        const userMessage = document.createElement("div");
        userMessage.setAttribute("data-message-author-role", "user");
        userMessage.setAttribute("data-message-id", "e2e-user-message");
        userMessage.textContent = ${JSON.stringify(prompt)};
        userTurn.append(userMessage);
        app.append(userTurn);
        fetch("/backend-api/f/conversation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini"
          })
        }).catch(() => {});
        setTimeout(() => {
          const assistantTurn = document.createElement("div");
          assistantTurn.setAttribute("data-turn", "assistant");
          const assistantMessage = document.createElement("div");
          assistantMessage.setAttribute("data-message-author-role", "assistant");
          assistantMessage.setAttribute("data-message-id", "e2e-assistant-message");
          assistantMessage.setAttribute("data-message-model-slug", "gpt-4o-mini");
          assistantMessage.textContent = "E2E assistant response";
          assistantTurn.append(assistantMessage);
          app.append(assistantTurn);
        }, 500);
        return true;
      })()`
    );

    await wait(13000);
    const storage = await readStorage(cdp, storageSessionId);
    const stats = storage[STORAGE_KEY];
    const firstRecordDiagnostic = await evaluate(
      cdp,
      pageSessionId,
      `(() => ({
        status: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-status") || "",
        model: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-model") || "",
        apiModel: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-api-model") || "",
        responseModel: document.documentElement.getAttribute("data-chatgpt-model-usage-last-response-model") || "",
        error: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-error") || ""
      }))()`
    );
    const firstObservedRequest = observedConversationRequests.find((request) =>
      request.postData.includes('"model":"gpt-4o-mini"')
    );
    assert.ok(firstObservedRequest, JSON.stringify(observedConversationRequests));
    assert.equal(fulfilledChatGPTNetworkIds.has(firstObservedRequest.requestId), true);
    assert.equal(new URL(firstObservedRequest.url).pathname, "/backend-api/f/conversation");
    assert.equal(firstObservedRequest.method, "POST");
    assert.equal(stats.totals["GPT-4o mini"], 1, JSON.stringify({
      totals: stats.totals,
      events: stats.events,
      diagnostic: firstRecordDiagnostic
    }));
    assert.equal(stats.models["GPT-4o mini"].apiModel, "gpt-4o-mini");
    assert.equal(stats.sessionsByModel["GPT-4o mini"]["e2e-conversation"].count, 1);
    assert.equal(stats.events[0].source, "send-button");
    assert.equal(stats.events[0].apiModel, "gpt-4o-mini");
    assert.equal(stats.events[0].requestModel, "gpt-4o-mini");
    assert.equal(stats.events[0].responseModel, "gpt-4o-mini");
    if (firstRecordDiagnostic.responseModel) {
      assert.equal(firstRecordDiagnostic.responseModel, "gpt-4o-mini");
    }
    const domRecordDiagnostic = await evaluate(
      cdp,
      pageSessionId,
      `(() => ({
        status: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-status") || "",
        model: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-model") || "",
        apiModel: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-api-model") || ""
      }))()`
    );
    if (domRecordDiagnostic.status) {
      assert.equal(domRecordDiagnostic.status, "ok");
      assert.equal(domRecordDiagnostic.model, "GPT-4o mini");
      assert.equal(domRecordDiagnostic.apiModel, "gpt-4o-mini");
    }

    await evaluate(
      cdp,
      pageSessionId,
      `(() => {
        const nav = document.createElement("nav");
        nav.setAttribute("aria-label", "Chat history");
        [
          ["e2e-conversation", "E2E counted conversation"],
          ["history-only-conversation", "History only conversation"]
        ].forEach(([id, title]) => {
          const link = document.createElement("a");
          link.href = "/c/" + id;
          link.textContent = title;
          nav.append(link);
        });
        document.body.prepend(nav);
        return true;
      })()`
    );

    const e2eDate = localDateKey();
    await evaluate(
      cdp,
      storageSessionId,
      `new Promise((resolve) => chrome.runtime.sendMessage({
        type:"settings.set",
        settings:{
          startDate:${JSON.stringify(e2eDate)},
          endDate:${JSON.stringify(e2eDate)}
        }
      }, resolve))`
    );
    const popupTarget = await cdp.send("Target.createTarget", {
      url: `chrome-extension://${extension.id}/src/popup.html`
    });
    const popupSessionId = await attach(cdp, popupTarget.targetId);
    await cdp.send("Runtime.enable", {}, popupSessionId);
    await cdp.send("Page.enable", {}, popupSessionId);
    await wait(750);
    const popup = await pollPopup(cdp, popupSessionId);
    assert.equal(popup.startDate, e2eDate);
    assert.equal(popup.endDate, e2eDate);
    await evaluate(
      cdp,
      popupSessionId,
      `(() => {
        const start = document.querySelector(".usage-start-date");
        const end = document.querySelector(".usage-end-date");
        start.value = ${JSON.stringify(e2eDate)};
        end.value = ${JSON.stringify(e2eDate)};
        start.dispatchEvent(new Event("change", { bubbles: true }));
        end.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`
    );
    await wait(750);
    const settingsAfterDates = await readStorage(cdp, storageSessionId);
    assert.equal(settingsAfterDates[SETTINGS_KEY].startDate, e2eDate);
    assert.equal(settingsAfterDates[SETTINGS_KEY].endDate, e2eDate);
    await cdp.send("Target.closeTarget", { targetId: popupTarget.targetId });

    const reopenedPopupTarget = await cdp.send("Target.createTarget", {
      url: `chrome-extension://${extension.id}/src/popup.html`
    });
    const reopenedPopupSessionId = await attach(cdp, reopenedPopupTarget.targetId);
    await cdp.send("Runtime.enable", {}, reopenedPopupSessionId);
    await cdp.send("Page.enable", {}, reopenedPopupSessionId);
    await wait(750);
    const reopenedPopup = await pollPopup(cdp, reopenedPopupSessionId);
    assert.equal(reopenedPopup.startDate, e2eDate);
    assert.equal(reopenedPopup.endDate, e2eDate);

    await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => {
        const textStatistics = document.querySelector('[data-statistics-section="text"]');
        if (!textStatistics) throw new Error("Missing text statistics visibility control");
        if (textStatistics.getAttribute("aria-pressed") !== "true") {
          textStatistics.click();
        }
        return true;
      })()`
    );
    await wait(750);
    const chartPopup = await switchPopupView(cdp, reopenedPopupSessionId, "chart");
    assert.equal(chartPopup.activeView, "true");
    assert.equal(chartPopup.chart, true);
    assert.equal(chartPopup.externalLegendVisible, false);
    assert.match(chartPopup.directLabels, /GPT-4o mini/);
    assert.match(chartPopup.countList, /GPT-4o mini/);
    assert.match(chartPopup.countList, /ChatGPT/);
    assert.doesNotMatch(chartPopup.countList, /关联对话|Conversations/);
    assert.doesNotMatch(chartPopup.countList, /Request model|请求型号/);
    assert.ok(chartPopup.points > 0);

    await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => {
        const internal = document.querySelector('[data-statistics-mode="internal"]');
        if (!internal) throw new Error("Missing internal statistics mode option");
        internal.click();
        return true;
      })()`
    );
    await wait(750);
    const internalPopup = await readPopupViewState(cdp, reopenedPopupSessionId, "chart");
    assert.equal(internalPopup.activeView, "true");
    assert.equal(internalPopup.chart, true);
    assert.match(internalPopup.countList, /Request model/);
    assert.match(internalPopup.countList, /gpt-4o-mini/);
    assert.match(internalPopup.countList, /Actual response model/);
    assert.match(internalPopup.countList, /gpt-4o-mini/);
    assert.ok(internalPopup.points > 0);

    await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => {
        const chinese = document.querySelector('[data-language-select="zh"]');
        if (!chinese) throw new Error("Missing Chinese language option");
        chinese.click();
        return true;
      })()`
    );
    await wait(750);
    const chinesePopup = await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => ({
        headline: document.querySelector(".usage-topline")?.textContent || "",
        language: document.querySelector('[data-language-select="zh"]')?.getAttribute("aria-pressed") === "true"
          ? "zh"
          : "en"
      }))()`
    );
    assert.equal(chinesePopup.language, "zh");
    assert.match(chinesePopup.headline, /模型使用/);
    await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => {
        const english = document.querySelector('[data-language-select="en"]');
        if (!english) throw new Error("Missing English language option");
        english.click();
        return true;
      })()`
    );
    await wait(750);
    const englishPopup = await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => ({
        headline: document.querySelector(".usage-topline")?.textContent || "",
        language: document.querySelector('[data-language-select="en"]')?.getAttribute("aria-pressed") === "true"
          ? "en"
          : "zh"
      }))()`
    );
    assert.equal(englishPopup.language, "en");
    assert.match(englishPopup.headline, /Model usage/);
    const settingsStorage = await readStorage(cdp, storageSessionId);
    assert.equal(settingsStorage[SETTINGS_KEY].language, "en");
    assert.equal(settingsStorage[SETTINGS_KEY].startDate, e2eDate);
    assert.equal(settingsStorage[SETTINGS_KEY].endDate, e2eDate);
    const completed = Boolean(
      extension.id &&
      stats.totals["GPT-4o mini"] === 1 &&
      chartPopup.points > 0 &&
      internalPopup.points > 0 &&
      englishPopup.language === "en"
    );
    assert.equal(completed, true, "Extension E2E did not reach the final completion checkpoint.");
    assert.equal(
      interceptedChatGPTRequests.filter((request) =>
        request.method === "POST" &&
        /\/backend-api\/(?:f\/)?conversation\/?$/.test(new URL(request.url).pathname)
      ).length,
      1,
      JSON.stringify(interceptedChatGPTRequests)
    );
    assert.equal(
      observedConversationRequests.every((request) => fulfilledChatGPTNetworkIds.has(request.requestId)),
      true,
      "Every simulated ChatGPT backend request must be fulfilled by CDP before it can reach production."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          completionMarker: COMPLETION_MARKER,
          extensionId: extension.id,
          recordedTotal: stats.totals["GPT-4o mini"],
          popup,
          reopenedPopup,
          chartPopup,
          internalPopup,
          chinesePopup,
          englishPopup
        },
        null,
        2
      )
    );
    process.exitCode = 0;
  } finally {
    await cdp.close();
    try {
      fs.rmSync(profilePath, { recursive: true, force: true });
    } catch (_) {
      // Chrome can keep cache files locked briefly after exit.
    }
  }
}

const run = process.argv.includes("--self-test-cdp-pipe")
  ? testCdpPipeFailureHandling
  : main;

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
