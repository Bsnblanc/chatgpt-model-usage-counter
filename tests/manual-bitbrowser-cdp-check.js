const fs = require("node:fs");
const path = require("node:path");

const PROFILE = process.env.BITBROWSER_PROFILE;
const OUTPUT_DIR = process.env.BITBROWSER_CHECK_OUTPUT || path.join(__dirname, "..", "tmp-verify");
const EXTENSION_ID = process.env.EXTENSION_ID || "oggdnnamnbjjhbafkcaipcnmeodjhccn";

if (!PROFILE) {
  throw new Error("BITBROWSER_PROFILE is required.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function zipEntryNames(buffer) {
  const signature = 0x06054b50;
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP end record is missing.");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const names = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("ZIP central directory is invalid.");
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function readPort() {
  return fs.readFileSync(path.join(PROFILE, "DevToolsActivePort"), "utf8").split(/\r?\n/)[0].trim();
}

async function targets() {
  const response = await fetch(`http://127.0.0.1:${readPort()}/json/list`);
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`);
  return response.json();
}

async function browserTarget() {
  const response = await fetch(`http://127.0.0.1:${readPort()}/json/version`);
  if (!response.ok) throw new Error(`CDP browser target failed: ${response.status}`);
  return response.json();
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    return this;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed.");
    }
    return result.result && result.result.value;
  }

  close() {
    if (this.ws && this.ws.readyState < 2) this.ws.close();
  }
}

async function findTarget(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const match = (await targets()).find(predicate);
    if (match) return match;
    await sleep(250);
  }
  throw new Error("Required CDP target was not found.");
}

async function reloadExtension() {
  const worker = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const cdp = await new Cdp(worker.webSocketDebuggerUrl).connect();
  try {
    await cdp.evaluate("chrome.runtime.reload(); true").catch(() => true);
  } finally {
    cdp.close();
  }
  await sleep(1200);
}

async function refreshChatGPTTabsOnce() {
  const worker = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const cdp = await new Cdp(worker.webSocketDebuggerUrl).connect();
  try {
    const tabIds = await cdp.evaluate(`(async function () {
      const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
      for (const tab of tabs) await chrome.tabs.reload(tab.id);
      return tabs.map((tab) => tab.id);
    })()`);
    await sleep(2500);
    return tabIds;
  } finally {
    cdp.close();
  }
}

async function ensureUpdatedContentScript() {
  const worker = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const cdp = await new Cdp(worker.webSocketDebuggerUrl).connect();
  try {
    const result = await cdp.evaluate(`(async function () {
      const manifest = chrome.runtime.getManifest();
      const source = await fetch(chrome.runtime.getURL("src/dashboard.js")).then((response) => response.text());
      const tabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
      for (const tab of tabs) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: function resetUsageCounterForHotInjection() {
            const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
            const panel = document.getElementById("chatgpt-model-usage-counter-panel");
            if (host) host.remove();
            if (panel) panel.remove();
            delete window.__chatgptModelUsageCounterLoaded;
          }
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: manifest.content_scripts[0].js
        });
      }
      let popupTabs = await chrome.tabs.query({ url: chrome.runtime.getURL("src/popup.html") });
      if (!popupTabs.length) {
        popupTabs = [await chrome.tabs.create({
          url: chrome.runtime.getURL("src/popup.html"),
          active: false
        })];
      } else {
        await chrome.tabs.reload(popupTabs[0].id);
      }
      return {
        version: manifest.version,
        updatedLayout: source.includes("grid-template-rows:auto auto"),
        popupTabId: popupTabs[0].id,
        injectedTabs: tabs.map((tab) => ({ id: tab.id, url: tab.url }))
      };
    })()`);
    if (!result.updatedLayout) throw new Error("Reloaded extension does not contain the current dashboard layout.");
    await findTarget((target) =>
      target.type === "page" &&
      target.url === `chrome-extension://${EXTENSION_ID}/src/popup.html`
    );
    return result;
  } finally {
    cdp.close();
  }
}

async function inspectLoadedExtension() {
  const worker = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const cdp = await new Cdp(worker.webSocketDebuggerUrl).connect();
  try {
    const result = await cdp.evaluate(`(async function () {
      const manifest = chrome.runtime.getManifest();
      const source = await fetch(chrome.runtime.getURL("src/dashboard.js")).then((response) => response.text());
      const importedStore = await chrome.storage.local.get([
        "chatgptImportedConversations.index.v1",
        "chatgptModelUsageStats.v1"
      ]);
      const importedIndex = importedStore["chatgptImportedConversations.index.v1"] || null;
      const stats = importedStore["chatgptModelUsageStats.v1"] || {};
      const events = Array.isArray(stats.events) ? stats.events : [];
      const catalogStore = await chrome.storage.session.get("chatgptModelUsageCatalog.session.v1");
      const catalogEnvelope = catalogStore["chatgptModelUsageCatalog.session.v1"] || {};
      const catalog = catalogEnvelope.catalog || {};
      const sourceCounts = {};
      events.forEach((event) => {
        const sourceMode = String(event && event.sourceMode || "unknown");
        sourceCounts[sourceMode] = (sourceCounts[sourceMode] || 0) + 1;
      });
      const chatTabs = await chrome.tabs.query({ url: ["https://chatgpt.com/*", "https://chat.openai.com/*"] });
      if (chatTabs[0]) {
        await chrome.tabs.update(chatTabs[0].id, { active: true });
      }
      let popupTabs = await chrome.tabs.query({ url: chrome.runtime.getURL("src/popup.html") });
      if (!popupTabs.length) {
        popupTabs = [await chrome.tabs.create({
          url: chrome.runtime.getURL("src/popup.html"),
          active: false
        })];
      }
      return {
        version: manifest.version,
        updatedLayout: source.includes("grid-template-rows:auto auto"),
        importedConversationCount: importedIndex && Array.isArray(importedIndex.conversations)
          ? importedIndex.conversations.length
          : 0,
        statsAudit: {
          total: Number(stats.totals && stats.totals.total || 0),
          retainedEvents: events.length,
          sourceCounts,
          recent: events.slice(-12).map((event) => ({
            submissionId: event.submissionId || "",
            conversationId: event.conversationId || "",
            selectedPublicModel: event.selectedPublicModel || "",
            selectedPublicMode: event.selectedPublicMode || "",
            requestModel: event.requestModel || "",
            responseModel: event.responseModel || "",
            reasoningEffort: event.reasoningEffort || "",
            sourceMode: event.sourceMode || "",
            feature: event.feature || "",
            countedAt: event.countedAt || ""
          })),
          catalog: {
            observedAt: catalog.observedAt || "",
            models: (Array.isArray(catalog.models) ? catalog.models : []).map((model) => ({
              slug: model.slug || "",
              title: model.title || ""
            })),
            versions: (Array.isArray(catalog.versions) ? catalog.versions : []).map((version) => ({
              id: version.id || "",
              displayText: version.displayText || "",
              displayTextForIntelligence: version.displayTextForIntelligence || "",
              shortDisplayTextForIntelligence: version.shortDisplayTextForIntelligence || "",
              slugs: version.slugs || [],
              presets: version.intelligencePresets || []
            }))
          }
        },
        popupTabId: popupTabs[0].id,
        injectedTabs: chatTabs.map((tab) => ({ id: tab.id, url: tab.url }))
      };
    })()`);
    if (!result.updatedLayout) throw new Error("Loaded extension does not contain the current dashboard layout.");
    await findTarget((target) =>
      target.type === "page" &&
      target.url === `chrome-extension://${EXTENSION_ID}/src/popup.html`
    );
    return result;
  } finally {
    cdp.close();
  }
}

async function inspectChatEntry() {
  const target = await findTarget((item) => item.type === "page" && /^https:\/\/chatgpt\.com\//.test(item.url));
  const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();
  try {
    return await cdp.evaluate(`(function () {
      const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
      const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
      const projectId = (location.pathname.match(/\\/g\\/(g-p-[0-9a-f]{32})/i) || [])[1] || "";
      const projectLinks = projectId
        ? Array.from(document.querySelectorAll('a[href*="' + projectId + '"]')).slice(0, 20).map((link) => ({
            href: link.getAttribute("href") || "",
            text: (link.innerText || link.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 240),
            aria: link.getAttribute("aria-label") || "",
            title: link.getAttribute("title") || "",
            className: String(link.className || "").slice(0, 240)
          }))
        : [];
      return {
        url: location.href,
        togglePresent: Boolean(toggle),
        label: toggle ? toggle.textContent.trim() : "",
        hostClass: host ? host.className : "",
        extensionEntry: document.documentElement.getAttribute("data-chatgpt-model-usage-content-entry"),
        extensionStage: document.documentElement.getAttribute("data-chatgpt-model-usage-content-stage"),
        projectLinks
      };
    })()`);
  } finally {
    cdp.close();
  }
}

async function completedExtensionDownloadSince(startedAt, extension) {
  const worker = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const cdp = await new Cdp(worker.webSocketDebuggerUrl).connect();
  try {
    return await cdp.evaluate(`(async function () {
      const items = await chrome.downloads.search({ orderBy: ["-startTime"], limit: 30 });
      const startedAt = ${JSON.stringify(new Date(startedAt - 2000).toISOString())};
      const extension = ${JSON.stringify(extension)};
      return items.find((item) =>
        item.state === "complete" &&
        item.startTime >= startedAt &&
        String(item.filename || "").toLowerCase().endsWith(extension)
      ) || null;
    })()`);
  } finally {
    cdp.close();
  }
}

async function inspectPopup() {
  const target = await findTarget((item) =>
    item.type === "page" &&
    item.url === `chrome-extension://${EXTENSION_ID}/src/popup.html`
  );
  const cdp = await new Cdp(target.webSocketDebuggerUrl).connect();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  let before = null;
  let clearImportedFixture = false;
  try {
    await sleep(500);
    before = await cdp.evaluate(`(async function () {
      const stored = await chrome.storage.local.get("chatgptModelUsageSettings.v1");
      return {
        settings: stored["chatgptModelUsageSettings.v1"] || null,
        entries: performance.getEntriesByType("resource").map((entry) => entry.name)
      };
    })()`);
    const currentConversation = await cdp.evaluate(`(async function () {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== "number") return null;
      return new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { type: "conversation.current" }, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || null);
        });
      });
    })()`);

    await cdp.evaluate(`(async function () {
      const key = "chatgptModelUsageSettings.v1";
      const stored = await chrome.storage.local.get(key);
      const next = Object.assign({}, stored[key] || {}, {
        language: "zh",
        activeView: "usage",
        statisticsMode: "internal",
        showTrendChart: true,
        showLineChart: true,
        showDonutChart: true,
        showTextStatistics: true
      });
      await chrome.storage.local.set({ [key]: next });
      return true;
    })()`);
    await sleep(750);

    const usage = await cdp.evaluate(`(function () {
      const root = document.querySelector(".usage-dashboard");
      const headings = Array.from(document.querySelectorAll(".usage-internal-response-headings")).map((row) => {
        const labels = Array.from(row.children).map((node) => {
          const rect = node.getBoundingClientRect();
          return { text: node.textContent.trim(), top: rect.top, bottom: rect.bottom, left: rect.left };
        });
        return {
          labels,
          sameLine: labels.length === 2 && Math.abs(labels[0].top - labels[1].top) < 1 &&
            Math.abs(labels[0].bottom - labels[1].bottom) < 1
        };
      });
      return {
        title: document.title,
        language: document.documentElement.lang,
        dashboardHeight: root ? root.getBoundingClientRect().height : 0,
        dashboardScrollHeight: root ? root.scrollHeight : 0,
        responseHeadingRows: headings,
        view: document.querySelector("[data-view-tab][aria-selected='true']")?.getAttribute("data-view-tab") || "",
        settingsPresent: Boolean(document.querySelector(".usage-settings-menu"))
      };
    })()`);
    await cdp.evaluate(`document.querySelector('[data-view-tab="status"]')?.click(); true`);
    await sleep(500);
    const status = await cdp.evaluate(`(function () {
      const dashboard = document.querySelector(".usage-dashboard");
      const panel = document.querySelector(".usage-view-panel");
      return {
        active: document.querySelector("[data-view-tab][aria-selected='true']")?.getAttribute("data-view-tab") || "",
        dashboardClientHeight: dashboard ? dashboard.clientHeight : 0,
        dashboardScrollHeight: dashboard ? dashboard.scrollHeight : 0,
        dashboardOverflowY: dashboard ? getComputedStyle(dashboard).overflowY : "",
        panelClientHeight: panel ? panel.clientHeight : 0,
        panelScrollHeight: panel ? panel.scrollHeight : 0
      };
    })()`);

    await cdp.evaluate(`document.querySelector('[data-view-tab="export"]')?.click(); true`);
    await sleep(650);
    const exportView = await cdp.evaluate(`(function () {
      const rows = Array.from(document.querySelectorAll("[data-export-conv-row]"));
      const selected = Array.from(document.querySelectorAll("[data-export-conv]:checked"));
      const first = rows[0];
      return {
        active: document.querySelector("[data-view-tab][aria-selected='true']")?.getAttribute("data-view-tab") || "",
        rows: rows.length,
        selected: selected.length,
        firstCurrent: first ? Boolean(first.querySelector(".usage-export-conv-badge.current")) : false,
        formats: Array.from(document.querySelectorAll("[data-export-format]")).map((button) => ({
          format: button.getAttribute("data-export-format"),
          disabled: button.disabled
        })),
        importPresent: Boolean(document.querySelector("[data-export-import]"))
      };
    })()`);
    const afterEntries = await cdp.evaluate(`performance.getEntriesByType("resource").map((entry) => entry.name)`);
    const newConversationRequests = afterEntries.slice(before.entries.length).filter((url) =>
      /\/backend-api\/conversations(?:\/|\?|$)/.test(url)
    );
    let importCheck = null;
    if (process.env.RUN_IMPORT === "1") {
      if (Number(process.env.IMPORTED_CONVERSATION_COUNT || "0") !== 0) {
        throw new Error("Refusing to replace an existing imported conversation cache.");
      }
      const fixture = path.resolve(process.env.OFFICIAL_EXPORT_FIXTURE || "");
      if (!fixture || !fs.statSync(fixture, { throwIfNoEntry: false })?.isFile()) {
        throw new Error("OFFICIAL_EXPORT_FIXTURE must point to a readable ZIP or JSON file.");
      }
      clearImportedFixture = true;
      const documentNode = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
      const inputNode = await cdp.send("DOM.querySelector", {
        nodeId: documentNode.root.nodeId,
        selector: "[data-export-file]"
      });
      if (!inputNode.nodeId) throw new Error("The official-export file input is missing.");
      await cdp.send("DOM.setFileInputFiles", {
        nodeId: inputNode.nodeId,
        files: [fixture]
      });
      await cdp.evaluate(`(function () {
        const input = document.querySelector("[data-export-file]");
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`);
      const importDeadline = Date.now() + 30000;
      let importStatus = "";
      while (Date.now() < importDeadline) {
        await sleep(200);
        importStatus = await cdp.evaluate(`document.querySelector(".usage-export-status")?.textContent.trim() || ""`);
        if (/^(?:已在本地导入|Imported )/.test(importStatus)) break;
        if (/失败|failed|invalid|does not contain/i.test(importStatus)) {
          throw new Error(`Official export import failed: ${importStatus}`);
        }
      }
      if (!/^(?:已在本地导入|Imported )/.test(importStatus)) {
        throw new Error(`Official export import did not complete. Status: ${importStatus}`);
      }
      importCheck = await cdp.evaluate(`(function () {
        const groups = Array.from(document.querySelectorAll(".usage-export-group")).map((group) => ({
          title: group.querySelector("summary span")?.textContent.trim() || "",
          rows: group.querySelectorAll("[data-export-conv-row]").length,
          projectId: group.querySelector("[data-export-project-toggle]")?.getAttribute("data-export-project-toggle") || ""
        }));
        const project = groups.find((group) => group.title === "Research Project");
        const toggle = project && document.querySelector('[data-export-project-toggle="' + project.projectId + '"]');
        if (toggle) {
          toggle.checked = true;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return {
          status: ${JSON.stringify(importStatus)},
          rows: document.querySelectorAll("[data-export-conv-row]").length,
          groups,
          projectRows: project ? project.rows : 0
        };
      })()`);
      await sleep(150);
      importCheck.selectedAfterProjectToggle = await cdp.evaluate(
        `document.querySelectorAll("[data-export-conv]:checked").length`
      );
      if (process.env.MULTI_EXPORT !== "1") {
        await cdp.evaluate(`(function () {
          const toggle = Array.from(document.querySelectorAll("[data-export-project-toggle]"))
            .find((item) => item.closest(".usage-export-group")?.querySelector("summary span")?.textContent.trim() === "Research Project");
          if (toggle) {
            toggle.checked = false;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return true;
        })()`);
      }
      if (importCheck.rows !== 4 || importCheck.projectRows !== 2 || importCheck.selectedAfterProjectToggle !== 3) {
        throw new Error(`Imported project hierarchy is incorrect: ${JSON.stringify(importCheck)}`);
      }
    }
    const downloads = [];
    if (process.env.RUN_DOWNLOADS === "1" && exportView.rows > 0) {
      const downloadDir = path.resolve(OUTPUT_DIR, "downloads");
      const outputRoot = path.resolve(OUTPUT_DIR);
      if (!downloadDir.startsWith(outputRoot + path.sep)) {
        throw new Error("Unsafe download verification directory.");
      }
      fs.rmSync(downloadDir, { recursive: true, force: true });
      fs.mkdirSync(downloadDir, { recursive: true });
      const browser = await browserTarget();
      const browserCdp = await new Cdp(browser.webSocketDebuggerUrl).connect();
      try {
        await browserCdp.send("Browser.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: downloadDir,
          eventsEnabled: true
        });
      } finally {
        browserCdp.close();
      }

      for (const format of ["json", "markdown", "pdf", "png", "docx"]) {
        const priorFiles = new Set(fs.readdirSync(downloadDir));
        const startedAt = Date.now();
        await cdp.evaluate(`(function () {
          const button = document.querySelector('[data-export-format="${format}"]');
          if (!button || button.disabled) throw new Error("format unavailable: ${format}");
          button.click();
          return true;
        })()`);
        const deadline = Date.now() + 30000;
        let statusText = "";
        let newFile = "";
        while (Date.now() < deadline) {
          await sleep(200);
          statusText = await cdp.evaluate(`document.querySelector(".usage-export-status")?.textContent.trim() || ""`);
          const files = fs.readdirSync(downloadDir).filter((name) => !priorFiles.has(name) && !name.endsWith(".crdownload"));
          const exportSucceeded = /^(?:已导出|Exported|已将.+打包为)/.test(statusText);
          if (files.length && exportSucceeded) {
            newFile = files[0];
            break;
          }
          if (exportSucceeded) {
            const extension = process.env.MULTI_EXPORT === "1"
              ? ".zip"
              : (format === "markdown" ? ".md" : "." + format);
            const item = await completedExtensionDownloadSince(startedAt, extension);
            if (item && item.filename && fs.existsSync(item.filename)) {
              newFile = path.basename(item.filename);
              fs.copyFileSync(item.filename, path.join(downloadDir, newFile));
              break;
            }
          }
          if (/失败|failed|interrupted|cancel/i.test(statusText)) {
            throw new Error(`Export ${format} failed: ${statusText}`);
          }
        }
        if (!newFile) {
          throw new Error(`Export ${format} did not produce a completed file. Status: ${statusText}`);
        }
        const bytes = fs.readFileSync(path.join(downloadDir, newFile));
        if (!bytes.length) throw new Error(`Export ${format} produced an empty file.`);
        if (process.env.MULTI_EXPORT === "1") {
          const names = zipEntryNames(bytes);
          const expectedExtension = format === "markdown" ? ".md" : "." + format;
          const conversationFiles = names.filter((name) =>
            name !== "_export-report.json" && name.toLowerCase().endsWith(expectedExtension)
          );
          if (
            names.filter((name) => name === "_export-report.json").length !== 1 ||
            conversationFiles.length !== 3 ||
            new Set(conversationFiles.map((name) => name.toLowerCase())).size !== 3
          ) {
            throw new Error(`Multi-export ZIP ${format} has an invalid file plan: ${JSON.stringify(names)}`);
          }
          downloads.push({ format, file: newFile, bytes: bytes.length, statusText, entries: names });
          continue;
        }
        if (format === "json") JSON.parse(bytes.toString("utf8"));
        if (format === "markdown" && !/\*\*(?:You|你)\*\*/.test(bytes.toString("utf8"))) {
          throw new Error("Markdown export is not a readable transcript.");
        }
        if (format === "pdf" && bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
          throw new Error("PDF export signature is invalid.");
        }
        if (format === "png" && bytes.subarray(1, 4).toString("latin1") !== "PNG") {
          throw new Error("PNG export signature is invalid.");
        }
        if (format === "docx" && bytes.subarray(0, 2).toString("latin1") !== "PK") {
          throw new Error("DOCX export signature is invalid.");
        }
        downloads.push({ format, file: newFile, bytes: bytes.length, statusText });
      }
    }

    return { usage, status, exportView, currentConversation, newConversationRequests, importCheck, downloads };
  } finally {
    if (before) {
      await cdp.evaluate(`(async function () {
        const key = "chatgptModelUsageSettings.v1";
        const original = ${JSON.stringify(before.settings)};
        if (original) await chrome.storage.local.set({ [key]: original });
        else await chrome.storage.local.remove(key);
        return true;
      })()`).catch(() => null);
    }
    if (clearImportedFixture && process.env.PRESERVE_IMPORT !== "1") {
      const worker = await findTarget((item) =>
        item.type === "service_worker" &&
        item.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
      ).catch(() => null);
      if (worker) {
        const workerCdp = await new Cdp(worker.webSocketDebuggerUrl).connect().catch(() => null);
        if (workerCdp) {
          await workerCdp.evaluate(`(async function () {
            const all = await chrome.storage.local.get(null);
            const keys = Object.keys(all).filter((key) =>
              key === "chatgptImportedConversations.index.v1" ||
              key === "chatgptImportedConversations.staging.v1" ||
              key.startsWith("chatgptImportedConversations.record.v1.")
            );
            if (keys.length) await chrome.storage.local.remove(keys);
            return keys.length;
          })()`).catch(() => null);
          workerCdp.close();
        }
      }
    }
    cdp.close();
  }
}

async function main() {
  const skipReload = process.env.SKIP_EXTENSION_RELOAD === "1";
  if (!skipReload) {
    await reloadExtension();
  }
  const extension = skipReload
    ? await inspectLoadedExtension()
    : await ensureUpdatedContentScript();
  if (process.env.REFRESH_CHAT_ONCE === "1") {
    extension.refreshedChatTabIds = await refreshChatGPTTabsOnce();
  }
  process.env.IMPORTED_CONVERSATION_COUNT = String(extension.importedConversationCount || 0);
  const chatEntry = await inspectChatEntry();
  const popup = await inspectPopup();
  const result = { extension, chatEntry, popup };

  if (!chatEntry.togglePresent) throw new Error("The ChatGPT page entry is missing.");
  if (!popup.usage.settingsPresent) throw new Error("The settings entry is missing.");
  if (popup.usage.responseHeadingRows.some((row) => !row.sameLine)) {
    throw new Error("Actual response model and reasoning effort headings are not on one line.");
  }
  if (
    popup.status.dashboardScrollHeight > popup.status.dashboardClientHeight + 1 ||
    popup.status.panelScrollHeight > popup.status.panelClientHeight + 1
  ) {
    throw new Error("The status panel still scrolls vertically.");
  }
  if (popup.newConversationRequests.length) {
    throw new Error("Opening Export triggered a ChatGPT conversation-history request.");
  }
  if (!popup.exportView.importPresent || popup.exportView.formats.length !== 5) {
    throw new Error("The export view is incomplete.");
  }

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  Cdp,
  EXTENSION_ID,
  browserTarget,
  findTarget,
  readPort,
  sleep,
  targets,
  zipEntryNames
};
