const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe")
];
const STORAGE_KEY = "chatgptModelUsageStats.v1";
const SETTINGS_KEY = "chatgptModelUsageSettings.v1";

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
    this.child = spawn(
      chromePath,
      [
        "--remote-debugging-pipe",
        "--enable-unsafe-extension-debugging",
        `--user-data-dir=${profilePath}`,
        "--no-first-run",
        "--no-default-browser-check",
        "about:blank"
      ],
      { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] }
    );

    this.child.stdio[4].on("data", (chunk) => this.handleData(chunk));
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
    if (message.error) {
      callbacks.reject(new Error(JSON.stringify(message.error)));
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
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const message = { id, method, params };
      if (sessionId) {
        message.sessionId = sessionId;
      }

      this.pending.set(id, { resolve, reject });
      this.child.stdio[3].write(JSON.stringify(message) + "\0");
    });
  }

  async close() {
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
        models: document.querySelector(".usage-models")?.textContent || "",
        chart: Boolean(document.querySelector(".usage-chart")),
        modelTextVisible: Boolean(document.querySelector(".usage-model-text-list")),
        sessionsVisible: Boolean(document.querySelector(".usage-sessions")),
        startDate: document.querySelector(".usage-start-date")?.value || "",
        endDate: document.querySelector(".usage-end-date")?.value || "",
        tabs: Array.from(document.querySelectorAll("[data-view-tab]")).map((button) => ({
          view: button.getAttribute("data-view-tab"),
          selected: button.getAttribute("aria-selected"),
          text: button.textContent || ""
        })),
        language: document.querySelector(".usage-language-toggle")?.getAttribute("data-language-toggle") === "en" ? "zh" : "en"
      }))()`
    );
    lastState = state;

    if (
      state.language === "zh" &&
      state.headline.includes("2") &&
      state.models.includes("gpt-4o-mini") &&
      state.models.includes("future-family-2026-thinking") &&
      state.chart &&
      !state.modelTextVisible &&
      !state.sessionsVisible &&
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
      `(() => ({
        url: location.href,
        readyState: document.readyState,
        contentEntry: document.documentElement.getAttribute("data-chatgpt-model-usage-content-entry") || "",
        contentMarker: document.documentElement.getAttribute("data-chatgpt-model-usage-content-loaded") || "",
        contentStage: document.documentElement.getAttribute("data-chatgpt-model-usage-content-stage") || "",
        contentSkip: document.documentElement.getAttribute("data-chatgpt-model-usage-content-skip") || "",
        panelHost: Boolean(document.querySelector("#chatgpt-model-usage-counter-panel-host"))
      }))()`
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
      modelTextList: document.querySelector(".usage-model-text-list")?.textContent || "",
      eventTextList: document.querySelector(".usage-event-text-list")?.textContent || "",
      countList: document.querySelector(".usage-count-list")?.textContent || "",
      recordSessions: document.querySelector(".usage-record-sessions")?.textContent || "",
      sessions: document.querySelector(".usage-sessions")?.textContent || "",
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

async function main() {
  const chromePath = findChrome();
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "chatgpt-usage-e2e-"));
  const cdp = new CdpPipe(chromePath, profilePath);

  try {
    await cdp.send("Browser.getVersion");
    const extension = await cdp.send("Extensions.loadUnpacked", { path: EXTENSION_ROOT });
    const workerTarget = await findExtensionWorker(cdp, extension.id);
    const workerSessionId = await attach(cdp, workerTarget.targetId);
    await cdp.send("Runtime.enable", {}, workerSessionId);
    await waitForExtensionStorage(cdp, workerSessionId);
    await evaluate(cdp, workerSessionId, "new Promise(resolve => chrome.storage.local.clear(() => resolve(true)))");

    const pageTarget = await cdp.send("Target.createTarget", { url: "about:blank" });
    const pageSessionId = await attach(cdp, pageTarget.targetId);
    await cdp.send("Runtime.enable", {}, pageSessionId);
    await cdp.send("Page.enable", {}, pageSessionId);
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
        const userMessage = document.createElement("div");
        userMessage.setAttribute("data-message-author-role", "user");
        userMessage.textContent = ${JSON.stringify(prompt)};
        const assistantMessage = document.createElement("div");
        assistantMessage.setAttribute("data-message-author-role", "assistant");
        assistantMessage.textContent = "E2E assistant response";
        app.append(userMessage, assistantMessage);
        fetch("/local-codex-dom-model-probe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o-mini"
          })
        }).catch(() => {});
        return true;
      })()`
    );

    await wait(13000);
    const storage = await readStorage(cdp, workerSessionId);
    const stats = storage[STORAGE_KEY];
    assert.equal(stats.totals["gpt-4o-mini"], 1);
    assert.equal(stats.models["gpt-4o-mini"].apiModel, "gpt-4o-mini");
    assert.equal(stats.sessionsByModel["gpt-4o-mini"]["e2e-conversation"].count, 1);
    assert.equal(stats.events[0].source, "send-button");
    assert.equal(stats.events[0].apiModel, "gpt-4o-mini");
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
      assert.equal(domRecordDiagnostic.model, "gpt-4o-mini");
      assert.equal(domRecordDiagnostic.apiModel, "gpt-4o-mini");
    }

    const networkPrompt = `codex-network-model-e2e-${Date.now()}`;
    await evaluate(
      cdp,
      pageSessionId,
      `(() => {
        history.pushState({}, "", "/c/e2e-network-conversation");
        document.body.innerHTML = '<main id="app"></main>';
        const app = document.querySelector("#app");
        const form = document.createElement("form");
        form.setAttribute("data-testid", "composer-form");
        const composer = document.createElement("div");
        composer.id = "prompt-textarea";
        composer.setAttribute("contenteditable", "true");
        composer.setAttribute("role", "textbox");
        composer.textContent = ${JSON.stringify(networkPrompt)};
        const send = document.createElement("button");
        send.type = "button";
        send.setAttribute("data-testid", "send-button");
        send.setAttribute("aria-label", "Send prompt");
        send.textContent = "Send";
        form.append(composer, send);
        app.append(form);
        send.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
        send.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
        const userMessage = document.createElement("div");
        userMessage.setAttribute("data-message-author-role", "user");
        userMessage.textContent = ${JSON.stringify(networkPrompt)};
        const assistantMessage = document.createElement("div");
        assistantMessage.setAttribute("data-message-author-role", "assistant");
        assistantMessage.textContent = "E2E network assistant response";
        app.append(userMessage, assistantMessage);
        fetch("/local-codex-model-probe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: "future-family-2026-thinking",
            reasoning: { effort: "high" },
            text: { verbosity: "medium" },
            temperature: 0.2,
            image_generation_options: { size: "1024x1024" },
            conversation_mode: { kind: "agent_mode" },
            web_search_options: { search_context_size: "low" },
            realtime_mode: true,
            audio_mode: true,
            voice_mode: true,
            input_audio_transcription: { model: "gpt-realtime-whisper" },
            modalities: ["text", "audio"],
            tools: [{ type: "deep_research" }, { type: "web_search" }]
          })
        }).catch(() => {});
        return true;
      })()`
    );
    await wait(13000);
    const networkStorage = await readStorage(cdp, workerSessionId);
    const networkStats = networkStorage[STORAGE_KEY];
    assert.equal(networkStats.totals["future-family-2026-thinking"], 1, JSON.stringify({
      total: networkStats.totals["future-family-2026-thinking"],
      events: networkStats.events.filter((event) => event.model === "future-family-2026-thinking").map((event) => ({
        source: event.source,
        observedSource: event.modelObservedSource,
        promptHash: event.promptHash,
        submittedAt: event.submittedAt,
        parameters: event.modelParameters
      }))
    }));
    assert.equal(networkStats.models["future-family-2026-thinking"].apiModel, "future-family-2026-thinking");
    assert.equal(networkStats.models["future-family-2026-thinking"].chatgptModel, "future-family-2026-thinking");
    assert.equal(networkStats.sessionsByModel["future-family-2026-thinking"]["e2e-network-conversation"].count, 1);
    assert.equal(networkStats.events[0].modelParameters.model, "future-family-2026-thinking");
    assert.equal(networkStats.events[0].modelParameters["reasoning.effort"], "high");
    assert.equal(networkStats.events[0].modelParameters["text.verbosity"], "medium");
    assert.equal(networkStats.events[0].modelParameters.temperature, 0.2);
    assert.equal(networkStats.parametersByModel["future-family-2026-thinking"].total, 1);
    assert.deepEqual(networkStats.parametersByModel["future-family-2026-thinking"].fields["reasoning.effort"], { high: 1 });
    assert.deepEqual(networkStats.parametersByModel["future-family-2026-thinking"].fields["text.verbosity"], { medium: 1 });
    assert.equal(networkStats.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 1);
    assert.equal(networkStats.featuresByModel["future-family-2026-thinking"].features.deep_research.count, 1);
    assert.equal(networkStats.featuresByModel["future-family-2026-thinking"].features.image_generation.count, 1);
    assert.equal(networkStats.featuresByModel["future-family-2026-thinking"].features.web_search.count, 1);
    assert.equal(networkStats.featuresByModel["future-family-2026-thinking"].features.realtime.count, 1);
    assert.equal(networkStats.featuresByModel["future-family-2026-thinking"].features.audio.count, 1);
    assert.deepEqual(networkStats.events[0].usageFeatures, ["agent_mode", "audio", "deep_research", "image_generation", "realtime", "web_search"]);
    const networkRecordDiagnostic = await evaluate(
      cdp,
      pageSessionId,
      `(() => ({
        status: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-status") || "",
        model: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-model") || "",
        apiModel: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-api-model") || "",
        chatgptModel: document.documentElement.getAttribute("data-chatgpt-model-usage-last-record-chatgpt-model") || ""
      }))()`
    );
    if (networkRecordDiagnostic.status) {
      assert.match(networkRecordDiagnostic.status, /^(ok|duplicate)$/);
      assert.equal(networkRecordDiagnostic.model, "future-family-2026-thinking");
      assert.equal(networkRecordDiagnostic.apiModel, "future-family-2026-thinking");
      assert.equal(networkRecordDiagnostic.chatgptModel, "future-family-2026-thinking");
    }

    await evaluate(
      cdp,
      pageSessionId,
      `(() => {
        const nav = document.createElement("nav");
        nav.setAttribute("aria-label", "Chat history");
        [
          ["e2e-conversation", "E2E counted conversation"],
          ["e2e-network-conversation", "E2E network conversation"],
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

    const popupTarget = await cdp.send("Target.createTarget", {
      url: `chrome-extension://${extension.id}/src/popup.html`
    });
    const popupSessionId = await attach(cdp, popupTarget.targetId);
    await cdp.send("Runtime.enable", {}, popupSessionId);
    await cdp.send("Page.enable", {}, popupSessionId);
    await wait(750);
    const popup = await pollPopup(cdp, popupSessionId);
    const e2eDate = localDateKey();
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
    const settingsAfterDates = await readStorage(cdp, workerSessionId);
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

    const chartPopup = await switchPopupView(cdp, reopenedPopupSessionId, "chart");
    assert.equal(chartPopup.activeView, "true");
    assert.equal(chartPopup.chart, true);
    assert.equal(chartPopup.modelTextList, "");
    assert.match(chartPopup.countList, /future-family-2026-thinking/);
    assert.match(chartPopup.countList, /reasoning\.effort/);
    assert.match(chartPopup.countList, /high/);
    assert.doesNotMatch(chartPopup.countList, /model=future-family-2026-thinking/);
    assert.match(chartPopup.countList, /Deep Research/);
    assert.match(chartPopup.countList, /对话|Conversations/);
    assert.match(chartPopup.countList, /ChatGPT/);
    assert.equal(chartPopup.sessions, "");
    assert.ok(chartPopup.points > 0);

    await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => {
        document.querySelector(".usage-language-toggle").click();
        return true;
      })()`
    );
    await wait(750);
    const englishPopup = await evaluate(
      cdp,
      reopenedPopupSessionId,
      `(() => ({
        headline: document.querySelector(".usage-topline")?.textContent || "",
        language: document.querySelector(".usage-language-toggle")?.getAttribute("data-language-toggle") === "zh" ? "en" : "zh"
      }))()`
    );
    assert.equal(englishPopup.language, "en");
    assert.match(englishPopup.headline, /Usage|Model usage/);
    const settingsStorage = await readStorage(cdp, workerSessionId);
    assert.equal(settingsStorage[SETTINGS_KEY].language, "en");
    assert.equal(settingsStorage[SETTINGS_KEY].startDate, e2eDate);
    assert.equal(settingsStorage[SETTINGS_KEY].endDate, e2eDate);

    console.log(
      JSON.stringify(
        {
          ok: true,
          extensionId: extension.id,
          recordedTotal: stats.totals["gpt-4o-mini"],
          popup,
          reopenedPopup,
          chartPopup,
          englishPopup
        },
        null,
        2
      )
    );
  } finally {
    await cdp.close();
    try {
      fs.rmSync(profilePath, { recursive: true, force: true });
    } catch (_) {
      // Chrome can keep cache files locked briefly after exit.
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
