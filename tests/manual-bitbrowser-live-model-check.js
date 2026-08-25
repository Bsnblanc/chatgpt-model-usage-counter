const {
  Cdp,
  EXTENSION_ID,
  findTarget,
  sleep
} = require("./manual-bitbrowser-cdp-check");

if (process.env.RUN_LIVE_SUBMISSION !== "1") {
  throw new Error("Set RUN_LIVE_SUBMISSION=1 to perform one explicit signed-in ChatGPT submission.");
}

async function readEvents(workerCdp) {
  return workerCdp.evaluate(`chrome.storage.local.get("chatgptModelUsageStats.v1").then((stored) => {
    const stats = stored["chatgptModelUsageStats.v1"] || {};
    return Array.isArray(stats.events) ? stats.events : [];
  })`);
}

async function main() {
  const chatTarget = await findTarget((target) =>
    target.type === "page" &&
    /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)\//.test(target.url)
  );
  const workerTarget = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const chat = await new Cdp(chatTarget.webSocketDebuggerUrl).connect();
  const worker = await new Cdp(workerTarget.webSocketDebuggerUrl).connect();
  try {
    const before = await readEvents(worker);
    const beforeIds = new Set(before.map((event) => String(event && event.submissionId || "")));
    const composer = await chat.evaluate(`(function () {
      const editor = document.querySelector(
        '[contenteditable="true"][role="textbox"],textarea[data-testid*="prompt"],textarea'
      );
      if (!editor) return null;
      const modelButton = document.querySelector(
        '[data-testid="model-switcher-dropdown-button"],button[aria-haspopup="menu"][data-model]'
      );
      const effortButton = Array.from(document.querySelectorAll("button")).find((button) =>
        /^(?:Low|Medium|High|Extra High|Max|低|中|高|超高|最高)$/i.test(
          String(button.innerText || button.textContent || "").trim()
        )
      );
      editor.focus();
      return {
        modelText: String(modelButton && (modelButton.innerText || modelButton.textContent) || "").trim(),
        modelSlug: String(modelButton && modelButton.getAttribute("data-model") || ""),
        effortText: String(effortButton && (effortButton.innerText || effortButton.textContent) || "").trim()
      };
    })()`);
    if (!composer) throw new Error("The signed-in ChatGPT composer is unavailable.");

    const prompt = `Reply with exactly: usage counter verified ${Date.now()}`;
    await chat.send("Input.insertText", { text: prompt });
    await sleep(250);
    const sent = await chat.evaluate(`(function () {
      const button = document.querySelector(
        'button[data-testid="send-button"],button[aria-label*="Send" i],button[aria-label*="发送"]'
      );
      if (!button || button.disabled) return false;
      button.click();
      return true;
    })()`);
    if (!sent) throw new Error("The ChatGPT send button did not become available.");

    const deadline = Date.now() + 120000;
    let newEvent = null;
    let matchingEvents = [];
    while (Date.now() < deadline) {
      await sleep(1000);
      const events = await readEvents(worker);
      matchingEvents = events.filter((event) =>
        event && event.submissionId && !beforeIds.has(String(event.submissionId))
      );
      if (matchingEvents.length === 1 && matchingEvents[0].responseModel) {
        newEvent = matchingEvents[0];
        break;
      }
    }
    if (!newEvent) {
      throw new Error(`A single completed event was not observed: ${JSON.stringify(matchingEvents)}`);
    }
    const auditable = {
      submissionId: String(newEvent.submissionId || ""),
      conversationId: String(newEvent.conversationId || ""),
      selectedPublicModel: String(newEvent.selectedPublicModel || ""),
      selectedPublicMode: String(newEvent.selectedPublicMode || ""),
      selectedPublicModeLabel: String(newEvent.selectedPublicModeLabel || ""),
      selectedPublicModeSource: String(newEvent.selectedPublicModeSource || ""),
      requestModel: String(newEvent.requestModel || ""),
      responseModel: String(newEvent.responseModel || ""),
      reasoningEffort: String(
        newEvent.requestReasoningEffort ||
        newEvent.reasoningEffort ||
        newEvent.modelParameters && newEvent.modelParameters["reasoning.effort"] ||
        ""
      ),
      sourceMode: String(newEvent.sourceMode || ""),
      feature: String(newEvent.feature || "")
    };
    if (
      !auditable.requestModel ||
      !auditable.responseModel ||
      auditable.sourceMode !== "chat"
    ) {
      throw new Error(`The live Chat event is incomplete: ${JSON.stringify(auditable)}`);
    }
    console.log(JSON.stringify({
      composer,
      beforeRetainedEvents: before.length,
      newEventCount: matchingEvents.length,
      event: auditable
    }, null, 2));
  } finally {
    chat.close();
    worker.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
