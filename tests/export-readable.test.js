const assert = require("node:assert/strict");
const test = require("node:test");
const exporter = require("../src/exporter");

const MODEL = "future-family-2026-thinking";
const FILE_CITATION = "\uE200filecite\uE202turn0file0\uE201";
const WEB_CITATION = "\uE200cite\uE202turn480433view0\uE202turn531341search2\uE201";
const visibleAnswer = `Readable answer with source marker ${FILE_CITATION} ${WEB_CITATION} and plain text.`;
const readableConversations = [
  {
    id: "readable-c1",
    title: "Readable export contract",
    url: "https://chatgpt.com/c/readable-c1",
    createTime: "2026-05-31T10:00:00.000Z",
    messages: [
      {
        id: "readable-user",
        role: "user",
        text: "Create a readable export.",
        metadata: { attachments: [{ name: "notes.txt", size: 43299 }] },
        createTime: "2026-05-31T10:00:01.000Z"
      },
      {
        id: "hidden-tool",
        role: "tool",
        contentType: "tool",
        text: "INTERNAL_TOOL_TEXT turn0file0",
        createTime: "2026-05-31T10:00:02.000Z"
      },
      {
        id: "readable-assistant",
        role: "assistant",
        contentType: "text",
        text: visibleAnswer,
        selectedPublicModel: "GPT-5.6 Sol",
        selectedPublicMode: "thinking",
        selectedPublicModeLabel: "Thinking",
        responseModel: MODEL,
        requestModel: MODEL,
        requestReasoningEffort: "high",
        modelParameters: {
          model: MODEL,
          reasoning: { effort: "high" },
          text: { verbosity: "medium" }
        },
        createTime: "2026-05-31T10:00:03.000Z"
      }
    ]
  }
];

const unicodeTitle = "\u4e2d\u6587\u6807\u9898\uff1a\u56de\u590d\u6d4b\u8bd5";
const unicodePrompt = "\u8bf7\u53ea\u56de\u590d OK\u3002\u7528\u4e8e\u672c\u5730 Chrome \u6269\u5c55\u5bfc\u51fa\u683c\u5f0f\u5b9e\u9645\u9a8c\u8bc1\u3002";
const unicodeAnswer = "\u7ed3\u8bba\uff1aJSON\u3001Markdown\u3001PDF\u3001DOCX\u3001PNG \u90fd\u5fc5\u987b\u4fdd\u7559\u6e05\u6670\u53ef\u8bfb\u7684\u4e2d\u6587\u5185\u5bb9\u3002";
const unicodeConversations = [
  {
    id: "unicode-readable",
    title: unicodeTitle,
    url: "https://chatgpt.com/c/unicode-readable",
    createTime: "2026-05-31T12:00:00.000Z",
    messages: [
      {
        id: "unicode-user",
        role: "user",
        text: unicodePrompt,
        createTime: "2026-05-31T12:00:01.000Z"
      },
      {
        id: "unicode-assistant",
        role: "assistant",
        text: unicodeAnswer,
        createTime: "2026-05-31T12:00:02.000Z"
      }
    ]
  }
];

const structuredContent = [
  "请保留配置格式：",
  "proxies:",
  "  - name: 香港-节点",
  "    type: socks5",
  "rules:",
  "  - DOMAIN-SUFFIX,example.com,DIRECT"
].join("\n");

const structuredContentConversations = [
  {
    id: "structured-content",
    title: "Structured content export",
    url: "https://chatgpt.com/c/structured-content",
    createTime: "2026-05-31T13:00:00.000Z",
    messages: [
      {
        id: "structured-user",
        role: "user",
        text: structuredContent,
        createTime: "2026-05-31T13:00:01.000Z"
      },
      {
        id: "structured-assistant",
        role: "assistant",
        text: "结构化内容已保留。",
        createTime: "2026-05-31T13:00:02.000Z"
      }
    ]
  }
];

const flattenedMarkdownText = "## 需求复述 你问的是：**Intel Core Ultra 7 265K 和 AMD Ryzen 7 9700X 的性能差距，实际该怎么选。** ## 关键结论 | 场景 | 谁强 | 大致差距 | 判断 | |---|---:|---:|---| | 多线程跑分 / 渲染 / 编译 | **265K 强** | 约 **+58%** | 核心更多 | | 游戏 | **9700X 略强或接近持平** | 常见 **0-10%** | 功耗低 | ## 最终答案 **你主要打游戏买 9700X；你还要剪辑、编译、渲染、多开，买 265K。**";
const flattenedMarkdownConversations = [
  {
    id: "flattened-markdown",
    title: "Flattened markdown export",
    url: "https://chatgpt.com/c/flattened-markdown",
    createTime: "2026-05-31T15:00:00.000Z",
    messages: [
      {
        id: "flattened-user",
        role: "user",
        text: "Compare CPUs.",
        createTime: "2026-05-31T15:00:01.000Z"
      },
      {
        id: "flattened-assistant",
        role: "assistant",
        text: flattenedMarkdownText,
        createTime: "2026-05-31T15:00:02.000Z"
      }
    ]
  }
];

function parseStoredZip(buffer) {
  const entries = {};
  let offset = 0;

  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");

    assert.equal(method, 0, `${name} should use stored ZIP entries`);
    entries[name] = buffer.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
  }

  return entries;
}

function decodePdfHexString(hex) {
  const clean = String(hex || "").replace(/\s+/g, "");
  if (!clean.startsWith("FEFF")) return Buffer.from(clean, "hex").toString("latin1");

  const chars = [];
  for (let index = 4; index + 3 < clean.length; index += 4) {
    chars.push(String.fromCharCode(Number.parseInt(clean.slice(index, index + 4), 16)));
  }
  return chars.join("");
}

function pdfText(buffer) {
  return [...buffer.toString("latin1").matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)]
    .map((match) => decodePdfHexString(match[1]))
    .join("\n");
}

function pngText(buffer) {
  const texts = [];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "tEXt") {
      const split = data.indexOf(0);
      if (split !== -1) texts.push(data.subarray(split + 1).toString("latin1"));
    }
    if (type === "iTXt") {
      const split = data.indexOf(0);
      if (split !== -1) texts.push(data.subarray(split + 5).toString("utf8"));
    }

    offset = dataEnd + 4;
    if (type === "IEND") break;
  }

  return texts.join("\n");
}

function assertReadableSurface(format, text) {
  assert.match(text, /Readable export contract/, `${format} should include the conversation title`);
  // \u91CD\u65B0\u8BBE\u8BA1\u4E3A\u804A\u5929\u8BB0\u5F55:\u8BF4\u8BDD\u4EBA\u6807\u7B7E(\u52A9\u624B=ChatGPT),\u4E0D\u518D\u6709 "Message N - Role" \u5B57\u6BB5\u8868
  assert.match(text, /ChatGPT/, `${format} should label the assistant turn as ChatGPT`);
  assert.doesNotMatch(text, /Message \d+ - (?:User|Assistant)/, `${format} should not render messages as numbered fields`);
  assert.doesNotMatch(text, /\bMessage ID\b/, `${format} should not leak message IDs`);
  assert.doesNotMatch(text, /Content:/, `${format} should omit content labels`);
  assert.doesNotMatch(text, /Content boundary:/, `${format} should not expose internal content boundary labels`);
  assert.match(text, /Readable answer with source marker and plain text\./, `${format} should preserve cited visible text`);
  // \u6A21\u578B\u4F5C\u4E3A\u7B80\u77ED\u9644\u6CE8\u51FA\u73B0(\u7EAF\u6A21\u578B\u540D,\u4E0D\u5E26 "Model:" \u524D\u7F00;parameters \u4E0D\u5C55\u5F00\u5230\u53EF\u8BFB\u9762,\u53EA\u4FDD\u7559\u5728 JSON \u6570\u636E\u91CC)
  assert.match(text, new RegExp(MODEL.replace(/[-.]/g, "\\$&")), `${format} should show the model as a footnote`);
  assert.doesNotMatch(text, /reasoning\.effort:/, `${format} should not dump raw parameters in the readable surface`);
  assert.doesNotMatch(text, /INTERNAL_TOOL_TEXT/, `${format} leaked a tool message`);
  assert.doesNotMatch(text, /\bfilecite\b|\bcite\b|turn\d+(?:file|search|view)\d+|\uE200|\uE201|\uE202/, `${format} leaked an internal citation marker`);
  assert.doesNotMatch(text, /43299/, `${format} leaked attachment size as a parameter`);
}

function exportSurfaces(conversations, options = {}) {
  const json = JSON.parse(exporter.exportJson(conversations, options));
  const markdown = exporter.exportMarkdown(conversations, options);
  const pdf = Buffer.from(exporter.exportArtifact(conversations, "pdf", options).content);
  const docx = Buffer.from(exporter.exportArtifact(conversations, "docx", options).content);
  const png = Buffer.from(exporter.exportArtifact(conversations, "png", options).content);
  const docxDocument = parseStoredZip(docx)["word/document.xml"].toString("utf8");

  return {
    JSON: JSON.stringify(json),
    Markdown: markdown,
    PDF: pdfText(pdf),
    DOCX: docxDocument,
    PNG: pngText(png)
  };
}

function assertNoInvalidModelNames(format, text) {
  assert.doesNotMatch(text, /\bUnknown model\b/i, `${format} leaked Unknown model`);
}

test("all public export formats are readable and hide internal export artifacts", () => {
  const json = JSON.parse(exporter.exportJson(readableConversations, { exportedAt: "2026-05-31T11:00:00.000Z" }));
  const markdown = exporter.exportMarkdown(readableConversations, { title: "Readable Export" });
  const pdf = Buffer.from(exporter.exportArtifact(readableConversations, "pdf", { title: "Readable Export" }).content);
  const docx = Buffer.from(exporter.exportArtifact(readableConversations, "docx", { title: "Readable Export" }).content);
  const png = Buffer.from(exporter.exportArtifact(readableConversations, "png", { title: "Readable Export" }).content);
  const docxDocument = parseStoredZip(docx)["word/document.xml"].toString("utf8");

  assert.equal(json.conversationCount, 1);
  assert.equal(json.messageCount, 2);
  assert.equal(json.title, "ChatGPT Conversation Export");
  assert.deepEqual(json.conversations[0].messages.map((message) => message.id), ["readable-user", "readable-assistant"]);
  assert.deepEqual(json.conversations[0].messages.map((message) => message.sequence), [1, 2]);
  assert.equal(json.conversations[0].messages[1].text, "Readable answer with source marker and plain text.");
  assert.equal(json.conversations[0].messages[1].model, MODEL);
  assert.equal(json.conversations[0].messages[1].selectedPublicModel, "GPT-5.6 Sol");
  assert.equal(json.conversations[0].messages[1].selectedPublicMode, "thinking");
  assert.equal(json.conversations[0].messages[1].selectedPublicModeLabel, "Thinking");
  assert.equal(json.conversations[0].messages[1].requestModel, MODEL);
  assert.equal(json.conversations[0].messages[1].responseModel, MODEL);
  assert.equal(json.conversations[0].messages[1].parameters.model, undefined);
  assert.equal(json.conversations[0].messages[1].parameters["reasoning.effort"], "high");

  assertReadableSurface("Markdown", markdown);
  assertReadableSurface("PDF", pdfText(pdf));
  assertReadableSurface("DOCX", docxDocument);
  assertReadableSurface("PNG", pngText(png));
});

test("visible structured content keeps line breaks and indentation", () => {
  const surfaces = exportSurfaces(structuredContentConversations, { title: "Structured Content Export" });

  assert.match(surfaces.JSON, /请保留配置格式：\\nproxies:\\n  - name: 香港-节点\\n    type: socks5/);
  assert.match(surfaces.Markdown, /\*\*你\*\*\n\n请保留配置格式：\nproxies:\n  - name: 香港-节点\n    type: socks5\nrules:\n  - DOMAIN-SUFFIX,example\.com,DIRECT/);
  assert.doesNotMatch(surfaces.Markdown, /```text\n请保留配置格式：/);
  assert.match(surfaces.PDF, /请保留配置格式：\nproxies:\n  - name: 香港-节点\n    type: socks5/);
  assert.match(surfaces.DOCX, /请保留配置格式：[\s\S]*proxies:[\s\S]*  - name: 香港-节点[\s\S]*    type: socks5/);
  assert.match(surfaces.PNG, /请保留配置格式：\nproxies:\n  - name: 香港-节点\n    type: socks5/);
  for (const [format, text] of Object.entries(surfaces)) {
    assert.doesNotMatch(text, /请保留配置格式： proxies: - name:/, `${format} collapsed structured text`);
  }
});

test("all public export formats unwrap ChatGPT writing blocks without exposing directives", () => {
  const conversations = [{
    id: "writing-block",
    title: "Writing block export",
    messages: [
      {
        id: "writing-user",
        role: "user",
        text: "生成报告"
      },
      {
        id: "writing-assistant",
        role: "assistant",
        text: [
          ':::writing{variant="document" id="48317"}',
          "# 清晰报告",
          "",
          "正文内容",
          ":::"
        ].join("\n"),
        metadata: { model_slug: "gpt-5-6-thinking" }
      }
    ]
  }];
  const surfaces = exportSurfaces(conversations, { title: "Writing Block Export" });
  const json = JSON.parse(surfaces.JSON);

  assert.equal(json.conversations[0].messages[1].text, "# 清晰报告\n\n正文内容");
  for (const [format, text] of Object.entries(surfaces)) {
    assert.match(text, /清晰报告/, `${format} should preserve the writing-block content`);
    assert.match(text, /正文内容/, `${format} should preserve the writing-block body`);
    assert.doesNotMatch(text, /:::writing|variant="document"|id="48317"/, `${format} leaked a writing directive`);
  }
});

test("flattened ChatGPT markdown is restored into readable export lines", () => {
  const surfaces = exportSurfaces(flattenedMarkdownConversations, { title: "Flattened Markdown Export" });
  const expectedTable = /## 关键结论\n\| 场景 \| 谁强 \| 大致差距 \| 判断 \|\n\|---\|---:\|---:\|---\|\n\| 多线程跑分 \/ 渲染 \/ 编译 \| \*\*265K 强\*\* \| 约 \*\*\+58%\*\* \| 核心更多 \|\n\| 游戏 \| \*\*9700X 略强或接近持平\*\* \| 常见 \*\*0-10%\*\* \| 功耗低 \|\n[ \t]*\n## 最终答案/;

  assert.match(JSON.parse(surfaces.JSON).conversations[0].messages[1].text, expectedTable);
  assert.match(surfaces.Markdown, expectedTable);
  assert.match(surfaces.PDF, expectedTable);
  assert.match(surfaces.DOCX, /## 关键结论[\s\S]*\| 场景 \| 谁强 \| 大致差距 \| 判断 \|[\s\S]*\| 游戏 \| \*\*9700X 略强或接近持平\*\* \| 常见 \*\*0-10%\*\* \| 功耗低 \|[\s\S]*## 最终答案/);
  assert.match(surfaces.PNG, expectedTable);

  for (const [format, text] of Object.entries(surfaces)) {
    assert.doesNotMatch(text, /## 关键结论 \| 场景 \| 谁强/, `${format} kept table content collapsed`);
    assert.doesNotMatch(text, /\| 判断 \| \|---/, `${format} kept adjacent table rows collapsed`);
  }
});

test("all public export formats keep response, request, and public model identities distinct", () => {
  const conversations = [
    {
      id: "model-readable",
      title: "Model readable export",
      messages: [
        {
          id: "valid-thinking",
          role: "assistant",
          text: "Valid thinking model metadata remains visible.",
          metadata: {
            model_slug: "gpt_5_thinking",
            reasoning_effort: "high"
          },
          requestReasoningEffort: "high",
          createTime: "2026-05-31T14:00:01.000Z"
        },
        {
          id: "invalid-unknown",
          role: "assistant",
          text: "Invalid model metadata is removed from export metadata.",
          selectedPublicModel: "GPT-5.5",
          selectedPublicMode: "thinking",
          selectedPublicModeLabel: "Thinking",
          requestModel: "gpt-5-5",
          responseModel: "",
          requestReasoningEffort: "medium",
          modelParameters: {
            model: "gpt-5-5",
            reasoning: { effort: "medium" }
          },
          createTime: "2026-05-31T14:00:02.000Z"
        },
        {
          id: "exact-chatgpt-slug",
          role: "assistant",
          text: "Exact ChatGPT DOM split numeric model metadata remains visible.",
          metadata: {
            model_slug: "gpt_5_5_thinking",
            selected_model: "GPT-5 5",
            reasoning_effort: "low"
          },
          requestReasoningEffort: "low",
          createTime: "2026-05-31T14:00:03.000Z"
        }
      ]
    }
  ];
  const json = JSON.parse(exporter.exportJson(conversations, { exportedAt: "2026-05-31T14:30:00.000Z" }));
  const surfaces = exportSurfaces(conversations, { title: "Model Hygiene Export", exportedAt: "2026-05-31T14:30:00.000Z" });
  const messages = json.conversations[0].messages;

  assert.equal(messages[0].model, "gpt-5-thinking");
  assert.equal(messages[0].parameters.model, undefined);
  assert.equal(messages[1].model, "");
  assert.equal(messages[1].selectedPublicModel, "GPT-5.5");
  assert.equal(messages[1].selectedPublicMode, "thinking");
  assert.equal(messages[1].selectedPublicModeLabel, "Thinking");
  assert.equal(messages[1].requestModel, "gpt-5-5");
  assert.equal(messages[1].responseModel, null);
  assert.equal(messages[1].parameters.model, undefined);
  assert.equal(messages[1].parameters["reasoning.effort"], "medium");
  assert.equal(messages[2].model, "gpt-5-5-thinking");
  assert.equal(messages[2].parameters.model, undefined);
  assert.equal(messages[2].parameters["reasoning.effort"], "low");

  for (const [format, text] of Object.entries(surfaces)) {
    assert.match(text, /gpt-5-thinking/, `${format} should keep the valid thinking slug`);
    assert.match(text, /GPT-5\.5/, `${format} should keep the public dotted model label`);
    assert.match(text, /gpt-5-5/, `${format} should keep the exact request model`);
    assert.match(text, /gpt-5-5-thinking/, `${format} should keep the exact dash-versioned model slug`);
    assertNoInvalidModelNames(format, text);
  }
});

test("all human-readable formats describe equal, different, and missing request/response models without substitution", () => {
  const conversations = [
    {
      id: "model-relationships",
      title: "Model relationships",
      messages: [
        {
          id: "same",
          role: "assistant",
          text: "Same model.",
          requestModel: "gpt-5-6-thinking",
          responseModel: "gpt-5-6-thinking"
        },
        {
          id: "different",
          role: "assistant",
          text: "Different models.",
          requestModel: "gpt-5-6",
          responseModel: "gpt-5-6-thinking"
        },
        {
          id: "missing-request",
          role: "assistant",
          text: "Missing request.",
          responseModel: "gpt-5-6-mini"
        },
        {
          id: "missing-response",
          role: "assistant",
          text: "Missing response.",
          requestModel: "gpt-5-6-pro"
        }
      ]
    }
  ];
  const surfaces = exportSurfaces(conversations, { title: "Model Relationships Export" });

  for (const [format, text] of Object.entries(surfaces)) {
    if (format === "JSON") continue;
    assert.match(text, /请求型号：gpt-5-6-thinking · 实际回复型号：gpt-5-6-thinking/, `${format} should name both equal model fields without a redundant equality note`);
    assert.match(text, /请求型号：gpt-5-6 · 实际回复型号：gpt-5-6-thinking/, `${format} should show different models in request-to-response order`);
    assert.match(text, /请求型号：未知 · 实际回复型号：gpt-5-6-mini/, `${format} should keep a missing request unknown`);
    assert.match(text, /请求型号：gpt-5-6-pro · 实际回复型号：未知/, `${format} should keep a missing response unknown`);
    assert.doesNotMatch(text, /请求与实际回复型号一致/, `${format} should not add a redundant equality sentence`);
    assert.doesNotMatch(text, /未提供|待确认|未取得|未识别/, `${format} should use the single unknown label`);
  }
});

test("all public export formats preserve readable Chinese Unicode text", () => {
  const json = JSON.parse(exporter.exportJson(unicodeConversations, { exportedAt: "2026-05-31T12:30:00.000Z" }));
  const markdown = exporter.exportMarkdown(unicodeConversations, { title: "Unicode Export" });
  const pdf = Buffer.from(exporter.exportArtifact(unicodeConversations, "pdf", { title: "Unicode Export" }).content);
  const docx = Buffer.from(exporter.exportArtifact(unicodeConversations, "docx", { title: "Unicode Export" }).content);
  const png = Buffer.from(exporter.exportArtifact(unicodeConversations, "png", { title: "Unicode Export" }).content);
  const docxDocument = parseStoredZip(docx)["word/document.xml"].toString("utf8");
  const surfaces = {
    JSON: JSON.stringify(json),
    Markdown: markdown,
    PDF: pdfText(pdf),
    DOCX: docxDocument,
    PNG: pngText(png)
  };

  assert.equal(json.conversations[0].title, unicodeTitle);
  assert.equal(json.conversations[0].messages[0].text, unicodePrompt);
  assert.equal(json.conversations[0].messages[1].text, unicodeAnswer);

  for (const [format, text] of Object.entries(surfaces)) {
    assert.match(text, new RegExp(unicodeTitle), `${format} should keep the Chinese conversation title`);
    assert.match(text, new RegExp(unicodePrompt), `${format} should keep the Chinese user message`);
    assert.match(text, new RegExp(unicodeAnswer), `${format} should keep the Chinese assistant message`);
    assert.doesNotMatch(text, /\uFFFD|\u9354|\u74a7|\u9286/, `${format} contains replacement or common mojibake characters`);
  }
});
