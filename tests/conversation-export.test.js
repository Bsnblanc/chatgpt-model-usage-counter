const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const exporter = require("../src/exporter");

function fakeNode(attrs, text) {
  return {
    getAttribute: (key) => (Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null),
    querySelector: () => null,
    innerText: text,
    textContent: text
  };
}

function fakeDoc(nodes, options) {
  const opts = options || {};
  return {
    title: opts.title || "",
    location: { href: opts.href || "" },
    querySelectorAll: (selector) => (selector === "[data-message-author-role]" ? nodes : [])
  };
}

test("collectConversationFromDom reads the open conversation from rendered DOM only", () => {
  const nodes = [
    fakeNode({ "data-message-author-role": "user", "data-message-id": "m1" }, "解释一下 Manifest V3"),
    fakeNode({ "data-message-author-role": "assistant", "data-message-id": "m2", "data-message-model-slug": "gpt-5-5-thinking" }, "Manifest V3 是 Chrome 扩展的新规范……"),
    fakeNode({ "data-message-author-role": "tool" }, "internal tool output should be ignored")
  ];
  const conversation = exporter.collectConversationFromDom(
    fakeDoc(nodes, { title: "MV3 讲解 - ChatGPT", href: "https://chatgpt.com/c/abc123def456" })
  );

  assert.equal(conversation.id, "abc123def456");
  assert.equal(conversation.title, "MV3 讲解");
  assert.equal(conversation.url, "https://chatgpt.com/c/abc123def456");
  assert.equal(conversation.messages.length, 2, "only user/assistant messages are kept");
  assert.equal(conversation.messages[0].role, "user");
  assert.equal(conversation.messages[1].role, "assistant");
  assert.equal(conversation.messages[1].model, "gpt-5-5-thinking");
  assert.match(conversation.messages[0].text, /Manifest V3/);
});

test("collectConversationFromDom returns an empty conversation when nothing is rendered", () => {
  const conversation = exporter.collectConversationFromDom(fakeDoc([], { href: "https://chatgpt.com/" }));
  assert.deepEqual(conversation.messages, []);
});

test("a single conversation exports to every selectable format with a valid artifact", () => {
  const conversation = {
    id: "abc123",
    title: "导出测试",
    url: "https://chatgpt.com/c/abc123",
    messages: [
      { id: "m1", role: "user", text: "写一个冒泡排序", model: "" },
      { id: "m2", role: "assistant", text: "```js\nfunction bubble(a){return a}\n```\n这是冒泡排序。", model: "gpt-5-5-thinking" }
    ]
  };

  const expectations = {
    json: { ext: "json", mime: /json/ },
    markdown: { ext: "md", mime: /markdown/ },
    pdf: { ext: "pdf", mime: /pdf/ },
    png: { ext: "png", mime: /png/ },
    docx: { ext: "docx", mime: /wordprocessingml/ }
  };

  Object.keys(expectations).forEach((format) => {
    const artifact = exporter.exportArtifact([conversation], format, { filenameBase: "export-test" });
    const expectation = expectations[format];
    assert.equal(artifact.filename, "export-test." + expectation.ext, format);
    assert.match(artifact.mimeType, expectation.mime, format);
    const size = typeof artifact.content === "string" ? artifact.content.length : artifact.content.byteLength;
    assert.ok(size > 0, `${format} artifact should not be empty`);
  });

  // Markdown 应清晰可读:含标题、角色、模型标注、代码块
  const markdown = exporter.exportMarkdown([conversation], {});
  assert.match(markdown, /导出测试/);
  assert.match(markdown, /```/);
  assert.match(markdown, /gpt-5-5-thinking/);
});

test("ACCOUNT SAFETY: the exporter never calls a backend API or touches credentials", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "exporter.js"), "utf8");
  // 不得调用任何 ChatGPT/OpenAI 后端接口
  assert.doesNotMatch(source, /backend-api/i, "exporter must not reference backend-api endpoints");
  assert.doesNotMatch(source, /\bfetch\s*\(/, "exporter must not perform network fetches");
  assert.doesNotMatch(source, /XMLHttpRequest/, "exporter must not use XMLHttpRequest");
  // 不得读取账号凭据
  assert.doesNotMatch(source, /document\.cookie/, "exporter must not read cookies");
  assert.doesNotMatch(source, /authorization|access_token|session_token/i, "exporter must not touch auth tokens");
});

test("normalizeConversations follows the selected current-node branch instead of exporting sibling branches", () => {
  const normalized = exporter.normalizeConversations([{
    id: "branch-123456",
    title: "Branched conversation",
    current_node: "assistant-current",
    mapping: {
      root: { parent: null, message: null },
      user: {
        parent: "root",
        message: {
          id: "user",
          author: { role: "user" },
          create_time: 1,
          content: { content_type: "text", parts: ["Original question"] }
        }
      },
      "assistant-old": {
        parent: "user",
        message: {
          id: "assistant-old",
          author: { role: "assistant" },
          create_time: 2,
          content: { content_type: "text", parts: ["Superseded answer"] }
        }
      },
      "assistant-current": {
        parent: "user",
        message: {
          id: "assistant-current",
          author: { role: "assistant" },
          create_time: 3,
          content: { content_type: "text", parts: ["Current answer"] }
        }
      }
    }
  }])[0];

  assert.deepEqual(normalized.messages.map((message) => message.id), ["user", "assistant-current"]);
  assert.doesNotMatch(normalized.messages.map((message) => message.text).join("\n"), /Superseded/);
});

test("buildZip creates one readable archive entry per supplied export file", () => {
  const bytes = exporter.buildZip([
    { name: "chat-one.json", content: "{\"ok\":true}\n" },
    { name: "对话二.md", content: "# 可读导出\n" }
  ]);
  const buffer = Buffer.from(bytes);

  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.match(buffer.toString("utf8"), /chat-one\.json/);
  assert.match(buffer.toString("utf8"), /对话二\.md/);
  assert.match(buffer.toString("utf8"), /可读导出/);
  assert.equal(exporter.MIME.zip, "application/zip");
});

test("ACCOUNT SAFETY: collecting a conversation triggers no network primitives", () => {
  // 即便环境提供了 fetch / XMLHttpRequest,读取对话也绝不能触发它们。
  let networkCalls = 0;
  const originalFetch = global.fetch;
  const originalXHR = global.XMLHttpRequest;
  global.fetch = () => { networkCalls += 1; return Promise.reject(new Error("blocked")); };
  global.XMLHttpRequest = function BlockedXHR() { networkCalls += 1; };
  try {
    const nodes = [fakeNode({ "data-message-author-role": "user" }, "hi")];
    exporter.collectConversationFromDom(fakeDoc(nodes, { href: "https://chatgpt.com/c/x123456" }));
  } finally {
    global.fetch = originalFetch;
    global.XMLHttpRequest = originalXHR;
  }
  assert.equal(networkCalls, 0, "reading the DOM must not hit the network");
});
