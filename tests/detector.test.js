const assert = require("node:assert/strict");
const test = require("node:test");
const detector = require("../src/detector");

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
    if (selector.includes('a[href*="/c/"]') && this.tagName === "A" && /\/c\//.test(this.attributes.href || "")) {
      return this;
    }

    if (selector.includes("[data-message-author-role]") && this.attributes["data-message-author-role"]) {
      return this;
    }

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

class FakeDocument {
  constructor(elements) {
    this.elements = elements;
  }

  querySelectorAll(selector) {
    if (selector.includes("model-switcher")) {
      return this.elements.filter((element) => /model-switcher/i.test(element.getAttribute("data-testid") || ""));
    }

    if (selector.includes("aria-selected") || selector.includes("aria-current")) {
      return this.elements.filter((element) =>
        element.getAttribute("aria-selected") === "true" || element.getAttribute("aria-current") === "true"
      );
    }

    if (selector.includes("button") || selector.includes("[role='button']") || selector.includes('[role="button"]')) {
      return this.elements.filter((element) => element.tagName === "BUTTON" || element.getAttribute("role") === "button");
    }

    if (selector.includes("textarea")) {
      return this.elements.filter((element) => element.tagName === "TEXTAREA");
    }

    if (selector.includes("contenteditable")) {
      return this.elements.filter((element) => element.getAttribute("contenteditable") === "true");
    }

    if (selector.includes("[data-message-author-role]")) {
      return this.elements.filter((element) => Boolean(element.getAttribute("data-message-author-role")));
    }

    if (/^(main|article|p|li|div|span)$/i.test(selector)) {
      return this.elements.filter((element) => element.tagName.toLowerCase() === selector.toLowerCase());
    }

    return [];
  }
}

test("extractModelLabel normalizes common ChatGPT model labels", () => {
  assert.equal(detector.extractModelLabel("Current model GPT-5 Thinking"), "gpt-5-thinking");
  assert.equal(detector.extractModelLabel("Current model future-family-2026-thinking"), "future-family-2026-thinking");
  assert.equal(detector.extractModelLabel("Model selector GPT-4o mini"), "gpt-4o-mini");
  assert.equal(detector.extractModelLabel("o4-mini"), "o4-mini");
  assert.equal(detector.extractModelLabel("Auto"), "");
  assert.equal(detector.extractModelLabel("Unknown model"), "");
  assert.equal(detector.extractModelLabel("gpt-5-5-thinking"), "gpt-5-5-thinking");
  assert.equal(detector.extractModelLabel("gpt_5_5_thinking"), "gpt-5-5-thinking");
  assert.equal(detector.extractModelLabel("GPT-5.5 Thinking"), "gpt-5.5-thinking");
  assert.equal(detector.extractModelLabel("GPT-5.6 Sol"), "gpt-5.6-sol");
  assert.equal(detector.extractModelLabel("GPT-5.6 Sol Pro"), "gpt-5.6-sol-pro");
  assert.equal(detector.extractModelLabel("GPT-5.6 Luna"), "gpt-5.6-luna");
  assert.equal(detector.extractModelLabel("GPT-5.6 Luna Max"), "gpt-5.6-luna-max");
  assert.equal(detector.extractModelLabel("GPT-5.6 Terra"), "gpt-5.6-terra");
  assert.equal(detector.extractModelLabel("GPT-5.6 Terra Max"), "gpt-5.6-terra-max");
  assert.equal(detector.extractModelLabel("gptLastUsedModel"), "");
  assert.equal(detector.extractModelLabel("image_generation_options"), "");
  assert.equal(detector.extractModelLabel("text-verbosity"), "");
  assert.equal(detector.extractModelLabel("tools.deep_research"), "");
  assert.equal(detector.extractModelLabel("Current model agent-mode-v2"), "");
  assert.equal(detector.extractModelLabel("Current model deepsearch-v2"), "");
  assert.equal(detector.extractModelLabel("Current model image-generation-v1"), "");
});

test("resolveModelInfo accepts exact ChatGPT thinking request slugs without inventing GPT-5.5", () => {
  const hyphen = detector.resolveModelInfo("gpt-5-thinking");
  assert.equal(hyphen.apiModel, "gpt-5-thinking");
  assert.equal(hyphen.mode, "thinking");

  const exactChatGPTSlug = detector.resolveModelInfo("gpt-5-5-thinking");
  assert.equal(exactChatGPTSlug.label, "gpt-5-5-thinking");
  assert.equal(exactChatGPTSlug.apiModel, "gpt-5-5-thinking");
  assert.equal(exactChatGPTSlug.mode, "thinking");
  assert.equal(detector.resolveModelInfo("gptLastUsedModel"), null);
  assert.equal(detector.resolveModelInfo("GPT-5.5 Thinking").label, "gpt-5.5-thinking");
  assert.equal(detector.resolveModelInfo("agent-mode-v2"), null);
  assert.equal(detector.resolveModelInfo("deepsearch-v2"), null);
  assert.equal(detector.resolveModelInfo("image-generation-v1"), null);
});

test("findCurrentModelInfo returns API model parameters for current models", () => {
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 16, left: 90, width: 160, height: 36, right: 250, bottom: 52 }
  });
  const doc = new FakeDocument([modelButton]);
  const info = detector.findCurrentModelInfo(doc);

  assert.equal(info.label, "gpt-5-thinking");
  assert.equal(info.apiModel, "gpt-5-thinking");
  assert.equal(info.mode, "thinking");
  assert.equal(info.parameters.model, "gpt-5-thinking");
  assert.equal(info.parameters["reasoning.effort"], undefined);
  assert.equal(info.parameters["text.verbosity"], undefined);
});

test("findCurrentModelInfo recognizes future explicit model slugs from model switcher text", () => {
  const modelButton = new FakeElement({
    innerText: "future-family-2026-thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 16, left: 90, width: 210, height: 36, right: 300, bottom: 52 }
  });
  const doc = new FakeDocument([modelButton]);
  const info = detector.findCurrentModelInfo(doc);

  assert.equal(info.label, "future-family-2026-thinking");
  assert.equal(info.apiModel, "future-family-2026-thinking");
  assert.equal(info.mode, "thinking");
  assert.equal(info.parameters.model, "future-family-2026-thinking");
});

test("findCurrentModelInfo accepts an unknown versioned slug from an explicit data-model field", () => {
  const modelButton = new FakeElement({
    innerText: "Aurora",
    attributes: {
      "data-testid": "model-switcher-dropdown-button",
      "data-model": "aurora-7",
      "aria-haspopup": "menu"
    }
  });
  const info = detector.findCurrentModelInfo(new FakeDocument([modelButton]));

  assert.equal(info.label, "aurora-7");
  assert.equal(info.apiModel, "aurora-7");
  assert.deepEqual(info.parameters, { model: "aurora-7" });
});

test("resolveModelInfo normalizes future O-series visible labels", () => {
  // 未来 O 系列的可见标签会被规范成可存储 slug，而不依赖硬编码型号清单。
  const future = detector.resolveModelInfo("o5 hyper");
  assert.ok(future && future.label, "目录没收录也应按模式抽取型号,而不是返回 null");
  assert.equal(future.label, "o5-hyper");
  assert.equal(future.apiModel, "o5-hyper");
  assert.equal(future.parameters.model, "o5-hyper");

  // 但非型号文本仍返回 null,不会把普通按钮误计成模型。
  assert.equal(detector.resolveModelInfo("Share"), null);
  assert.equal(detector.resolveModelInfo("New chat"), null);
});

test("findCurrentModel prefers visible model switcher candidates", () => {
  const modelButton = new FakeElement({
    innerText: "GPT-5 Thinking",
    attributes: { "data-testid": "model-switcher-dropdown-button", "aria-haspopup": "menu" },
    rect: { top: 16, left: 90, width: 160, height: 36, right: 250, bottom: 52 }
  });
  const otherButton = new FakeElement({ innerText: "Send prompt", attributes: { "data-testid": "send-button" } });
  const doc = new FakeDocument([otherButton, modelButton]);

  assert.equal(detector.findCurrentModel(doc), "gpt-5-thinking");
});

test("findCurrentModelInfo ignores selected conversation titles that look like model labels", () => {
  const conversationLink = new FakeElement({
    tagName: "A",
    innerText: "GPT-5.6 Sol",
    attributes: {
      href: "/c/conversation-1234",
      "aria-current": "page"
    },
    rect: { top: 300, left: 10, width: 220, height: 32, right: 230, bottom: 332 }
  });

  assert.equal(detector.findCurrentModelInfo(new FakeDocument([conversationLink])), null);
});

test("findCurrentModelInfo returns null when ChatGPT exposes no model label", () => {
  const doc = new FakeDocument([]);
  const info = detector.findCurrentModelInfo(doc);

  assert.equal(info, null);
});

test("findCurrentModelInfo does not reuse a stale model stored by an earlier selection", () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    length: 1,
    key() {
      return "lastSelectedModel";
    },
    getItem() {
      return "gpt-5.6-sol";
    }
  };

  try {
    assert.equal(detector.findCurrentModelInfo(new FakeDocument([])), null);
  } finally {
    if (typeof previousLocalStorage === "undefined") {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousLocalStorage;
    }
  }
});

test("findCurrentModelInfo reads explicit current model declarations", () => {
  const declaration = new FakeElement({
    tagName: "DIV",
    innerText: "当前模型：GPT-4o mini",
    rect: { top: 260, left: 320, width: 280, height: 28, right: 600, bottom: 288 }
  });
  const doc = new FakeDocument([declaration]);
  const info = detector.findCurrentModelInfo(doc);

  assert.equal(info.label, "gpt-4o-mini");
  assert.equal(info.apiModel, "gpt-4o-mini");
});

test("findCurrentModelInfo ignores model-like declarations inside conversation messages", () => {
  const userMessage = new FakeElement({
    tagName: "DIV",
    innerText: "Current model: GPT-6.1 Aurora",
    attributes: { "data-message-author-role": "user" },
    rect: { top: 260, left: 320, width: 480, height: 48, right: 800, bottom: 308 }
  });

  assert.equal(detector.findCurrentModelInfo(new FakeDocument([userMessage])), null);
});

test("isSendButton accepts enabled send controls and rejects stop controls", () => {
  const sendButton = new FakeElement({
    innerText: "",
    attributes: { "data-testid": "send-button", "aria-label": "Send prompt" }
  });
  const stopButton = new FakeElement({
    innerText: "",
    attributes: { "data-testid": "stop-button", "aria-label": "Stop generating" }
  });

  assert.equal(detector.isSendButton(sendButton), true);
  assert.equal(detector.isSendButton(stopButton), false);
});

test("getComposerText reads textarea prompt text", () => {
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "Explain MV3 storage.",
    rect: { top: 700, left: 20, width: 500, height: 80, right: 520, bottom: 780 }
  });
  const doc = new FakeDocument([textarea]);

  assert.equal(detector.getComposerText(doc), "Explain MV3 storage.");
});

test("isComposerElement accepts nested text nodes inside the composer", () => {
  const composer = new FakeElement({
    tagName: "DIV",
    attributes: { contenteditable: "true", role: "textbox" },
    rect: { top: 700, left: 20, width: 500, height: 80, right: 520, bottom: 780 }
  });
  const textNode = { parentElement: composer };

  assert.equal(detector.isComposerElement(textNode), true);
});

test("getComposerText ignores control attributes on an empty composer", () => {
  const textarea = new FakeElement({
    tagName: "TEXTAREA",
    value: "",
    attributes: { "aria-label": "Message ChatGPT", "data-testid": "prompt-textarea" },
    rect: { top: 700, left: 20, width: 500, height: 80, right: 520, bottom: 780 }
  });
  const doc = new FakeDocument([textarea]);

  assert.equal(detector.getComposerText(doc), "");
});
