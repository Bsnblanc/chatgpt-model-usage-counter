const assert = require("node:assert/strict");
const test = require("node:test");
const exporter = require("../src/exporter");

const MODEL_NAME = "future-family-2026-thinking";
const MODEL_PARAMETERS = {
  model: MODEL_NAME,
  reasoning: { effort: "high" },
  text: { verbosity: "medium" },
  temperature: 0.2
};
const MODEL_ONLY_NAME = "future-family-2026-instant";
const STRICT_IMAGE_SIZE = "1024x1024";
const ATTACHMENT_SIZE = 43299;

const formatConversations = [
  {
    id: "format-conversation-1",
    title: "Export format conversation",
    url: "https://chatgpt.com/c/format-conversation-1",
    createTime: "2026-05-30T12:00:00.000Z",
    internalDiagnostic: "createTime=raw-internal-value",
    messages: [
      {
        id: "format-user-1",
        role: "user",
        text: "Please summarize the export record.",
        createTime: "2026-05-30T12:00:05.000Z"
      },
      {
        id: "format-assistant-1",
        role: "assistant",
        text: "Export verification answer.",
        selectedPublicModel: "GPT-5.6 Sol",
        selectedPublicMode: "thinking",
        selectedPublicModeLabel: "Thinking",
        responseModel: MODEL_NAME,
        requestModel: MODEL_NAME,
        requestReasoningEffort: "high",
        modelParameters: MODEL_PARAMETERS,
        features: ["deep_search"],
        createTime: "2026-05-30T12:00:10.000Z",
        internalDiagnostic: "updateTime=raw-internal-value"
      }
    ]
  }
];

const strictReadableConversations = [
  {
    id: "strict-readable-conversation",
    title: "Strict readable export",
    url: "https://chatgpt.com/c/strict-readable-conversation",
    createTime: "2026-05-30T14:00:00.000Z",
    messages: [
      {
        id: "visible-user",
        role: "user",
        text: "Visible human prompt stays exported.",
        metadata: {
          attachments: [{ name: "private-source.txt", size: ATTACHMENT_SIZE }],
          size: ATTACHMENT_SIZE
        },
        createTime: "2026-05-30T14:00:05.000Z"
      },
      {
        id: "hidden-tool",
        role: "tool",
        contentType: "tool",
        content: {
          content_type: "tool",
          parts: ["INTERNAL_TOOL_SHOULD_NOT_EXPORT filecite"]
        },
        createTime: "2026-05-30T14:00:06.000Z"
      },
      {
        id: "hidden-code",
        role: "assistant",
        contentType: "code",
        content: {
          content_type: "code",
          parts: ["INTERNAL_CODE_SHOULD_NOT_EXPORT\nContent type code\nfilecite"]
        },
        createTime: "2026-05-30T14:00:07.000Z"
      },
      {
        id: "hidden-execution-output",
        role: "assistant",
        contentType: "execution_output",
        content: {
          content_type: "execution_output",
          parts: ["INTERNAL_EXECUTION_OUTPUT_SHOULD_NOT_EXPORT\nContent type execution_output\nfilecite"]
        },
        createTime: "2026-05-30T14:00:08.000Z"
      },
      {
        id: "visible-multimodal-text",
        role: "user",
        contentType: "multimodal_text",
        content: {
          content_type: "multimodal_text",
          parts: ["Visible multimodal prompt stays exported."]
        },
        createTime: "2026-05-30T14:00:09.000Z"
      },
      {
        id: "model-only-assistant",
        role: "assistant",
        text: "Model-only answer stays exported.",
        responseModel: MODEL_ONLY_NAME,
        requestModel: MODEL_ONLY_NAME,
        modelParameters: { model: MODEL_ONLY_NAME },
        createTime: "2026-05-30T14:00:10.000Z"
      },
      {
        id: "parameterized-assistant",
        role: "assistant",
        text: "Parameterized answer stays exported.",
        responseModel: MODEL_NAME,
        requestModel: MODEL_NAME,
        requestReasoningEffort: "high",
        modelParameters: {
          model: MODEL_NAME,
          reasoning: { effort: "high" },
          temperature: 0.2,
          image_generation_options: { size: STRICT_IMAGE_SIZE }
        },
        createTime: "2026-05-30T14:00:15.000Z"
      }
    ]
  }
];

const markdownStructureConversations = [
  {
    id: "markdown-structure-conversation",
    title: "Markdown structure conversation",
    url: "https://chatgpt.com/c/markdown-structure-conversation",
    createTime: "2026-06-02T08:25:40.000Z",
    messages: [
      {
        id: "markdown-structure-assistant",
        role: "assistant",
        responseModel: MODEL_NAME,
        text: "需求不完整：你只给了三个跌幅 **-86.79%、-83.68%、-77.57%**，但没说明空格要填什么。 按常见几种算法： | 你想问的内容 | 结果 | 依据 |\n|---|---:|---|\n| **平均跌幅** | **-82.68%** | ((-86.79-83.68-77.57)/3=-82.68) |\n| **平均亏损后需要回本涨幅** | **约 +477.19%** | 若按平均剩余本金 17.32% 回本，则需 +477.19% | 最可能你要填的是： **平均跌幅：-82.68%** 置信度：中。原因是你没有说明空格代表什么。\n\n## 依据与推理 先看相邻两项差值：\n| 项 | 数值 | 与前一项差值 |\n|---|---:|---:|\n| 第1项 | -86.79% | — |",
        createTime: "2026-06-02T08:25:41.000Z"
      }
    ]
  }
];

async function blobBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

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
    const dataEnd = dataStart + compressedSize;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");

    assert.equal(method, 0, `${name} should be stored without compression`);
    assert.ok(dataEnd <= buffer.length, `${name} exceeds ZIP size`);
    entries[name] = buffer.subarray(dataStart, dataEnd);
    offset = dataEnd;
  }

  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  return entries;
}

function parsePngChunks(buffer) {
  assert.deepEqual(
    Array.from(buffer.subarray(0, 8)),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  );

  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    assert.ok(dataEnd + 4 <= buffer.length, `${type} chunk exceeds PNG size`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") {
      break;
    }
  }

  assert.equal(chunks.at(-1).type, "IEND");
  return chunks;
}

function pngText(chunks) {
  return chunks.map((chunk) => {
    if (chunk.type === "tEXt") {
      const split = chunk.data.indexOf(0);
      return split === -1 ? "" : chunk.data.subarray(split + 1).toString("latin1");
    }
    if (chunk.type === "iTXt") {
      const split = chunk.data.indexOf(0);
      return split === -1 ? "" : chunk.data.subarray(split + 5).toString("utf8");
    }
    return "";
  }).join("\n");
}

function decodePdfHexString(hex) {
  const clean = String(hex || "").replace(/\s+/g, "");
  if (clean.startsWith("FEFF")) {
    const chars = [];
    for (let index = 4; index + 3 < clean.length; index += 4) {
      chars.push(String.fromCharCode(Number.parseInt(clean.slice(index, index + 4), 16)));
    }
    return chars.join("");
  }

  return Buffer.from(clean, "hex").toString("latin1");
}

function pdfTextObjects(buffer) {
  const pdf = buffer.toString("latin1");
  const streams = [...pdf.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map((match) => match[1]);
  const strings = [];

  for (const stream of streams) {
    for (const match of stream.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      strings.push(decodePdfHexString(match[1]));
    }
    for (const match of stream.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      strings.push(match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\"));
    }
  }

  return {
    raw: pdf,
    streams,
    strings,
    text: strings.join("\n")
  };
}

function assertTranscriptContent(text) {
  // 重新设计为聊天记录:对话标题 + 说话人(ChatGPT)+ 正文 + 模型/功能附注;不再有字段表与原始参数。
  assert.match(text, /Export format conversation/);
  assert.match(text, /ChatGPT/);
  assert.doesNotMatch(text, /Message \d+ - /);
  assert.doesNotMatch(text, /Content:/);
  assert.doesNotMatch(text, /Content boundary:/);
  assert.match(text, /future-family-2026-thinking/);
  assert.match(text, /deep_research/);
  assert.doesNotMatch(text, /reasoning\.effort:/);
  assert.doesNotMatch(text, /temperature:\s*0\.2/);
}

function readableTextLayers(conversations, options) {
  const markdown = exporter.exportMarkdown(conversations, options);
  const pdf = pdfTextObjects(Buffer.from(exporter.exportArtifact(conversations, "pdf", options).content)).text;
  const docxEntries = parseStoredZip(Buffer.from(exporter.exportArtifact(conversations, "docx", options).content));
  const pngChunks = parsePngChunks(Buffer.from(exporter.exportArtifact(conversations, "png", options).content));

  return {
    Markdown: markdown,
    PDF: pdf,
    DOCX: docxEntries["word/document.xml"].toString("utf8"),
    PNG: pngText(pngChunks)
  };
}

function assertStrictReadableText(format, text) {
  const label = `${format} text layer`;

  assert.match(text, /Visible human prompt stays exported\./, `${label} should keep visible user text`);
  assert.match(text, /Visible multimodal prompt stays exported\./, `${label} should keep visible multimodal text`);
  assert.match(text, /Model-only answer stays exported\./, `${label} should keep model-only assistant text`);
  assert.match(text, /Parameterized answer stays exported\./, `${label} should keep parameterized assistant text`);
  // 新设计:无 Content 标签、无 "Message N - Role" 字段、无原始参数展开(参数只保留在 JSON 数据里)。
  assert.doesNotMatch(text, /Content:/, `${label} should omit content labels`);
  assert.doesNotMatch(text, /Content boundary:/, `${label} should not expose internal content boundary labels`);
  assert.doesNotMatch(text, /Message \d+ - (?:User|Assistant|Tool)/, `${label} should not render numbered message headings`);
  assert.match(text, new RegExp(MODEL_ONLY_NAME.replace(/[-.]/g, "\\$&")), `${label} should show the model footnote`);
  assert.doesNotMatch(text, /INTERNAL_TOOL_SHOULD_NOT_EXPORT/, `${label} leaked tool content`);
  assert.doesNotMatch(text, /INTERNAL_CODE_SHOULD_NOT_EXPORT/, `${label} leaked code content`);
  assert.doesNotMatch(text, /INTERNAL_EXECUTION_OUTPUT_SHOULD_NOT_EXPORT/, `${label} leaked execution output`);
  assert.doesNotMatch(text, /\bfilecite\b/i, `${label} leaked file citation markup`);
  assert.doesNotMatch(
    text,
    /Content type(?:\s*\|\s*|\s*:\s*)(?:tool|code|execution_output|multimodal_text)\b/i,
    `${label} leaked an internal content type`
  );
  assert.doesNotMatch(text, /reasoning\.effort:/, `${label} should not dump raw parameters in the readable surface`);
  assert.doesNotMatch(text, /temperature:\s*0\.2/, `${label} should not dump raw parameters in the readable surface`);
  assert.doesNotMatch(text, new RegExp(String(ATTACHMENT_SIZE)), `${label} leaked attachment size`);
}

test("human-readable exports omit internal artifacts and keep real parameters", () => {
  const texts = readableTextLayers(strictReadableConversations, {
    title: "Strict Readable Export",
    exportedAt: "2026-05-30T15:00:00.000Z"
  });
  const failures = [];

  for (const [format, text] of Object.entries(texts)) {
    try {
      assertStrictReadableText(format, text);
    } catch (error) {
      failures.push(`${format}: ${error.message}`);
    }
  }

  assert.deepEqual(failures, []);
});

test("exports strip ChatGPT private citation markers from all public text layers", () => {
  const marker = "\uE200finance\uE202turn695688finance0\uE201";
  const conversations = [
    {
      id: "private-citation-conversation",
      title: "Private citation export",
      url: "https://chatgpt.com/c/private-citation-conversation",
      createTime: "2026-06-02T14:00:00.000Z",
      messages: [
        {
          id: "private-citation-user",
          role: "user",
          text: "Check the exported answer citation cleanup.",
          createTime: "2026-06-02T14:00:05.000Z"
        },
        {
          id: "private-citation-assistant",
          role: "assistant",
          text: `Current BTC price remains high volatility. ${marker}\n\nFinal answer stays readable.`,
          createTime: "2026-06-02T14:00:10.000Z"
        }
      ]
    }
  ];
  const options = {
    title: "Private Citation Export",
    exportedAt: "2026-06-02T14:01:00.000Z"
  };
  const json = JSON.parse(exporter.exportArtifact(conversations, "json", options).content);
  const textLayers = {
    JSON: JSON.stringify(json),
    ...readableTextLayers(conversations, options)
  };

  for (const [format, text] of Object.entries(textLayers)) {
    assert.match(text, /Current BTC price remains high volatility\./, `${format} should keep text before marker`);
    assert.match(text, /Final answer stays readable\./, `${format} should keep text after marker`);
    assert.doesNotMatch(text, /\uE200|\uE201|\uE202|turn695688finance0|finance\uE202/i, `${format} leaked private citation marker`);
  }
});

test("JSON export is structured and includes normalized messages", () => {
  const artifact = exporter.exportArtifact(formatConversations, "json", {
    title: "Format Verification Export",
    exportedAt: "2026-05-30T13:00:00.000Z"
  });
  const payload = JSON.parse(artifact.content);

  assert.equal(artifact.mimeType, exporter.MIME.json);
  assert.equal(payload.title, "Format Verification Export");
  assert.equal(payload.formatVersion, 4);
  assert.equal(payload.conversationCount, 1);
  assert.equal(payload.messageCount, 2);
  assert.deepEqual(payload.featureUsage, { total: 1, byFeature: { deep_research: 1 } });
  assert.ok(Array.isArray(payload.conversations));
  assert.ok(Array.isArray(payload.conversations[0].messages));
  assert.equal(payload.conversations[0].messages[0].sequence, 1);
  assert.equal(payload.conversations[0].messages[1].sequence, 2);
  assert.equal(payload.conversations[0].messages[1].role, "assistant");
  assert.equal(typeof payload.conversations[0].messages[1].text, "string");
  assert.equal(payload.conversations[0].messages[1].model, MODEL_NAME);
  assert.equal(payload.conversations[0].messages[1].selectedPublicModel, "GPT-5.6 Sol");
  assert.equal(payload.conversations[0].messages[1].selectedPublicMode, "thinking");
  assert.equal(payload.conversations[0].messages[1].selectedPublicModeLabel, "Thinking");
  assert.equal(payload.conversations[0].messages[1].requestModel, MODEL_NAME);
  assert.equal(payload.conversations[0].messages[1].responseModel, MODEL_NAME);
  assert.equal(payload.conversations[0].messages[1].parameters["reasoning.effort"], "high");
  assert.equal(payload.conversations[0].messages[1].parameters["text.verbosity"], "medium");
  assert.equal(payload.conversations[0].messages[1].parameters.temperature, 0.2);
  assert.equal(payload.conversations[0].messages[1].features[0], "deep_research");
  assert.equal(payload.conversations[0].time.createdAt, "2026-05-30T12:00:00.000Z");
});

test("Markdown frontmatter quotes YAML-special titles (colon/hash/brackets) so frontmatter stays valid", () => {
  const tricky = [
    { id: "y", title: "计划: 第#1版 [草稿]", url: "https://chatgpt.com/c/y", messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "ok" }] }
  ];
  const md = exporter.exportMarkdown(tricky, {});
  // 含冒号(后跟空格)/井号/方括号的标题必须被双引号包裹,否则 YAML frontmatter 解析会坏。
  assert.match(md, /^title: "计划: 第#1版 \[草稿\]"$/m);
  // 无特殊字符的标题保持不加引号(更干净)。
  const plain = [
    { id: "p", title: "普通标题", url: "https://x", messages: [{ role: "user", text: "hi" }, { role: "assistant", text: "ok" }] }
  ];
  assert.match(exporter.exportMarkdown(plain, {}), /^title: 普通标题$/m);
});

test("Markdown frontmatter keeps created and updated timestamps in separate fields", () => {
  const markdown = exporter.exportMarkdown([
    {
      id: "frontmatter-time",
      title: "Time fields",
      create_time: "2026-08-23T01:00:00.000Z",
      update_time: "2026-08-23T01:05:00.000Z",
      messages: [
        { role: "user", text: "Question" },
        { role: "assistant", text: "Answer" },
      ],
    },
  ]);

  assert.match(markdown, /^created: "2026-08-23T01:00:00\.000Z"$/m);
  assert.match(markdown, /^updated: "2026-08-23T01:05:00\.000Z"$/m);
  assert.doesNotMatch(markdown, /^created: .*Updated:/m);
});

test("multi-select export makes one separate single-conversation file per conversation (not concatenated)", () => {
  const convs = [
    { id: "a", title: "第一段对话", url: "https://chatgpt.com/c/a", messages: [{ role: "user", text: "问题A" }, { role: "assistant", text: "回答A" }] },
    { id: "b", title: "第二段对话", url: "https://chatgpt.com/c/b", messages: [{ role: "user", text: "问题B" }, { role: "assistant", text: "回答B" }] },
    { id: "c", title: "第三段对话", url: "https://chatgpt.com/c/c", messages: [{ role: "user", text: "问题C" }, { role: "assistant", text: "回答C" }] }
  ];
  // dashboard 的 downloadConversationsSeparately 逐对话调 exportArtifact([conv]);此处验证产物。
  const files = convs.map((c) => exporter.exportArtifact([c], "md", { filenameBase: exporter.safeName ? exporter.safeName(c.title) : c.title }));
  assert.equal(files.length, 3);
  // 文件名互不相同(各自单独下载,而非一个拼接文件)
  assert.equal(new Set(files.map((f) => f.filename)).size, 3);
  // 每个文件只含自己那段对话,绝不串入别段内容
  assert.match(files[0].content, /第一段对话/);
  assert.match(files[0].content, /回答A/);
  assert.doesNotMatch(files[0].content, /第二段对话|第三段对话|回答B|回答C/);
  assert.doesNotMatch(files[2].content, /第一段对话|回答A/);
  assert.match(files[2].content, /回答C/);
});

test("Markdown export contains hierarchy, model parameters, and no internal field leakage", () => {
  const markdown = exporter.exportMarkdown(formatConversations, {
    title: "Format Verification Export",
    exportedAt: "2026-05-30T13:00:00.000Z"
  });

  // 单对话:YAML frontmatter(Obsidian 属性)+ H1 对话标题 + 粗体说话人标签
  assert.match(markdown, /^---\ntitle: /m);
  assert.match(markdown, /^# Export format conversation/m);
  assert.match(markdown, /^\*\*你\*\*/m);
  assert.match(markdown, /^\*\*ChatGPT\*\*/m);
  // 正文紧跟说话人,不再有 Field/Value 表
  assert.match(markdown, /\*\*你\*\*\n\nPlease summarize the export record\./);
  assert.match(markdown, /Export verification answer\./);
  // 模型 + 功能作为简短附注(parameters 不展开,只保留在 JSON 数据里)
  assert.match(markdown, /\*请求型号：future-family-2026-thinking · 实际回复型号：future-family-2026-thinking · 思考强度：high · 公开选择：GPT-5\.6 Sol · 公开模式：Thinking · 功能：deep_research\*/);
  assert.equal((markdown.match(/future-family-2026-thinking/g) || []).length, 2);
  assert.doesNotMatch(markdown, /\| Model \|/);
  assert.doesNotMatch(markdown, /\| Parameters \|/);
  assert.doesNotMatch(markdown, /\| Features \|/);
  assert.doesNotMatch(markdown, /reasoning\.effort/);
  assert.doesNotMatch(markdown, /Message \d+ - /);
  assert.doesNotMatch(markdown, /Content:/);
  assert.doesNotMatch(markdown, /Content boundary:/);
  assert.doesNotMatch(markdown, /createTime=/);
  assert.doesNotMatch(markdown, /updateTime=/);
});

test("Markdown export restores inline tables and heading structure", () => {
  const markdown = exporter.exportMarkdown(markdownStructureConversations, {
    title: "Markdown Structure Export",
    exportedAt: "2026-06-02T09:00:00.000Z"
  });

  assert.match(markdown, /按常见几种算法：\n\n\| 你想问的内容 \| 结果 \| 依据 \|\n\|---\|---:\|---\|/);
  assert.match(
    markdown,
    /\| \*\*平均亏损后需要回本涨幅\*\* \| \*\*约 \+477\.19%\*\* \| 若按平均剩余本金 17\.32% 回本，则需 \+477\.19% \|\n\n最可能你要填的是： \*\*平均跌幅：-82\.68%\*\*\n置信度：中。原因是你没有说明空格代表什么。/
  );
  assert.match(markdown, /## 依据与推理\n先看相邻两项差值：\n\| 项 \| 数值 \| 与前一项差值 \|/);
  assert.doesNotMatch(markdown, /按常见几种算法： \|/);
  assert.doesNotMatch(markdown, /\| 最可能你要填的是/);
  assert.doesNotMatch(markdown, /## 依据与推理 先看/);
});

test("PDF export is a valid PDF with readable text objects", () => {
  const artifact = exporter.exportArtifact(formatConversations, "pdf", {
    title: "Format Verification Export",
    exportedAt: "2026-05-30T13:00:00.000Z"
  });
  const buffer = Buffer.from(artifact.content);
  const parsed = pdfTextObjects(buffer);
  const startXref = parsed.raw.match(/startxref\n(\d+)\n%%EOF$/);

  assert.equal(artifact.mimeType, exporter.MIME.pdf);
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(parsed.raw, /\/Type \/Catalog/);
  assert.match(parsed.raw, /\/Type \/Pages \/Count 1/);
  assert.ok(startXref, "PDF should include a startxref offset");
  assert.equal(parsed.raw.slice(Number(startXref[1]), Number(startXref[1]) + 4), "xref");
  assert.ok(parsed.streams.some((stream) => /BT[\s\S]*\bTj\b[\s\S]*ET/.test(stream)));
  assert.ok(parsed.strings.length >= 5);
  assert.match(parsed.text, /Export format conversation/);
  assertTranscriptContent(parsed.text);
});

test("DOCX export is a ZIP with document XML containing readable export text", async () => {
  const result = await exporter.createExport("docx", formatConversations);
  const buffer = await blobBuffer(result.blob);
  const entries = parseStoredZip(buffer);
  const documentXml = entries["word/document.xml"].toString("utf8");

  assert.equal(result.blob.type, exporter.MIME.docx);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "PK\u0003\u0004");
  assert.ok(entries["[Content_Types].xml"]);
  assert.ok(entries["_rels/.rels"]);
  assert.ok(entries["word/document.xml"]);
  assert.match(documentXml, /<w:document\b/);
  assert.match(documentXml, /Export format conversation/);
  assertTranscriptContent(documentXml);
  assert.doesNotMatch(documentXml, /createTime=/);
  assert.doesNotMatch(documentXml, /updateTime=/);
});

test("PNG export has a valid signature, required chunks, and text metadata", () => {
  const artifact = exporter.exportArtifact(formatConversations, "png", {
    title: "Format Verification Export",
    exportedAt: "2026-05-30T13:00:00.000Z"
  });
  const buffer = Buffer.from(artifact.content);
  const chunks = parsePngChunks(buffer);
  const types = chunks.map((chunk) => chunk.type);
  const ihdr = chunks[0];
  const idat = chunks.filter((chunk) => chunk.type === "IDAT");
  const text = pngText(chunks);

  assert.equal(artifact.mimeType, exporter.MIME.image);
  assert.equal(ihdr.type, "IHDR");
  assert.equal(ihdr.data.length, 13);
  assert.ok(ihdr.data.readUInt32BE(0) >= 640);
  assert.ok(ihdr.data.readUInt32BE(4) >= 180);
  assert.equal(ihdr.data[8], 8);
  assert.equal(ihdr.data[9], 6);
  assert.ok(idat.length > 0);
  assert.ok(idat.every((chunk) => chunk.data.length > 0));
  assert.equal(types.at(-1), "IEND");
  assert.ok(types.includes("tEXt") || types.includes("iTXt"));
  assert.match(text, /Export format conversation/);
  assertTranscriptContent(text);
});
