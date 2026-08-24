const assert = require("node:assert/strict");
const test = require("node:test");
const zlib = require("node:zlib");
const exporter = require("../src/exporter");

const conversations = [
  {
    id: "c1",
    title: "Escaping <check>",
    url: "https://chatgpt.com/c/c1",
    create_time: 1710000000,
    messages: [
      { id: "m1", role: "user", content: "Hello **world**" },
      { id: "m2", author: { role: "assistant" }, content: { parts: ["Line 1", "Line <2>"] } }
    ]
  },
  {
    id: "c2",
    title: "Second conversation",
    url: "https://chatgpt.com/c/c2",
    messages: [
      { id: "m3", role: "user", text: "Question line A\nQuestion line B", createTime: "2026-05-30T12:00:00.000Z" },
      {
        id: "m4",
        role: "assistant",
        text: "Assistant answer with export details.",
        createTime: "2026-05-30T12:01:00.000Z",
        metadata: {
          model_slug: "future-family-2026-thinking",
          reasoning_effort: "high",
          text: { verbosity: "medium" },
          image_generation_options: { size: "1024x1024" }
        },
        requestReasoningEffort: "high"
      }
    ]
  }
];

const chineseConversations = [
  {
    id: "cn-1",
    title: "中文标题：导出检查",
    url: "https://chatgpt.com/c/cn-1",
    create_time: 1710000200,
    messages: [
      {
        id: "cn-user",
        role: "user",
        text: "请总结：模型、角色、参数需要清晰，不要乱码。"
      },
      {
        id: "cn-assistant",
        role: "assistant",
        text: "结论：中文内容应在 JSON、Markdown、PDF、DOCX、PNG 中保持可读。",
        metadata: {
          model_slug: "gpt-6-1-aurora",
          reasoning_effort: "medium",
          top_p: 0.8
        },
        requestReasoningEffort: "medium"
      }
    ]
  }
];

const featureConversations = [
  {
    id: "features-1",
    title: "功能统计导出",
    url: "https://chatgpt.com/c/features-1",
    messages: [
      {
        id: "features-user",
        role: "user",
        text: "请用深度研究和 agent mode 汇总材料。"
      },
      {
        id: "features-assistant",
        role: "assistant",
        text: "已使用深度研究、agent mode、网页搜索和图片生成能力。",
        metadata: {
          model_slug: "future-family-2026-thinking",
          reasoning: { effort: "high" },
          web_search_options: { search_context_size: "medium" },
          image_generation_options: { size: "1024x1024" },
          conversation_mode: "agentmode",
          canvas: true
        },
        requestReasoningEffort: "high",
        features: ["deepsearch", "canvas-v2"]
      }
    ]
  }
];

async function blobBuffer(blob) {
  return Buffer.from(await blob.arrayBuffer());
}

function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = [];
    for (let i = 0; i < 256; i += 1) {
      let value = i;
      for (let j = 0; j < 8; j += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      table[i] = value >>> 0;
    }
    crc32.table = table;
  }

  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parseStoredZip(buffer) {
  const entries = {};
  const centralEntries = parseZipCentralDirectory(buffer);
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    const central = centralEntries.get(name);

    assert.equal(method, 0, `${name} should use stored ZIP entries`);
    assert.ok(central, `${name} missing from central directory`);
    assert.equal(central.method, method, `${name} central directory method mismatch`);
    assert.equal(central.compressedSize, compressedSize, `${name} central directory size mismatch`);
    assert.equal(central.localOffset, offset, `${name} central directory offset mismatch`);
    entries[name] = buffer.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
  }
  assert.deepEqual(Object.keys(entries).sort(), Array.from(centralEntries.keys()).sort(), "ZIP local entries and central directory differ");
  return entries;
}

function parseZipCentralDirectory(buffer) {
  const end = findZipEnd(buffer);
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "ZIP central directory header missing");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findZipEnd(buffer) {
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error("ZIP end of central directory not found");
}

function parsePngChunks(buffer) {
  assert.deepEqual(Array.from(buffer.subarray(0, 8)), [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= buffer.length, `${type} chunk exceeds PNG size`);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(buffer.subarray(offset + 4, dataEnd));
    assert.equal(actualCrc, expectedCrc, `${type} chunk CRC mismatch`);
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd + 4;
    if (type === "IEND") {
      break;
    }
  }
  assert.equal(chunks.at(-1).type, "IEND");
  return chunks;
}

function pngTextEntries(buffer) {
  return parsePngChunks(buffer).flatMap((chunk) => {
    if (chunk.type === "tEXt") {
      const split = chunk.data.indexOf(0);
      return split === -1 ? [] : [{ type: "tEXt", keyword: chunk.data.subarray(0, split).toString("latin1"), text: chunk.data.subarray(split + 1).toString("latin1") }];
    }
    if (chunk.type === "iTXt") {
      const split = chunk.data.indexOf(0);
      return split === -1 ? [] : [{ type: "iTXt", keyword: chunk.data.subarray(0, split).toString("latin1"), text: chunk.data.subarray(split + 5).toString("utf8") }];
    }
    return [];
  });
}

function pngText(buffer) {
  return pngTextEntries(buffer).map((entry) => entry.text).join("\n");
}

function assertPngExportTextChunks(chunks, textEntries) {
  assert.equal(chunks[0], "IHDR");
  assert.ok(chunks.includes("IDAT"));
  assert.equal(chunks.at(-1), "IEND");
  assert.ok(chunks.indexOf("iTXt") > 0 && chunks.indexOf("iTXt") < chunks.length - 1);
  assert.deepEqual(textEntries.map((entry) => [entry.type, entry.keyword]), [["iTXt", "ChatGPTExport"], ["iTXt", "ChatGPTExportSvgPreview"]]);
}

function pngDimensions(buffer) {
  const ihdr = parsePngChunks(buffer).find((chunk) => chunk.type === "IHDR");
  assert.ok(ihdr, "PNG missing IHDR");
  return {
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4)
  };
}

function pngHasDarkPixel(buffer) {
  const chunks = parsePngChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const data = zlib.inflateSync(idat);
  const rowLength = width * 4 + 1;

  for (let y = 0; y < height; y += 1) {
    assert.equal(data[y * rowLength], 0, "PNG rows should use filter 0 in Node renderer");
    for (let x = 0; x < width; x += 1) {
      const pixel = y * rowLength + 1 + x * 4;
      if (data[pixel + 3] > 0 && data[pixel] < 120 && data[pixel + 1] < 120 && data[pixel + 2] < 120) {
        return true;
      }
    }
  }
  return false;
}

function pngContainsRgb(buffer, expected) {
  const chunks = parsePngChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === "IHDR");
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const data = zlib.inflateSync(idat);
  const rowLength = width * 4 + 1;

  for (let y = 0; y < height; y += 1) {
    assert.equal(data[y * rowLength], 0, "PNG rows should use filter 0 in Node renderer");
    for (let x = 0; x < width; x += 1) {
      const pixel = y * rowLength + 1 + x * 4;
      if (
        data[pixel] === expected[0] &&
        data[pixel + 1] === expected[1] &&
        data[pixel + 2] === expected[2] &&
        data[pixel + 3] === 255
      ) {
        return true;
      }
    }
  }
  return false;
}

function assertBrandPalette(colors) {
  for (const color of ["#172554", "#22D3EE", "#60A5FA", "#A78BFA", "#FFFFFF"]) {
    assert.ok(colors.includes(color), `canvas watermark should paint brand color ${color}`);
  }
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function bareMockPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.from([0, 255, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND")
  ]);
}

const MOCK_CANVAS_PNG = bareMockPng();

async function withMockCanvasDocument(assertion) {
  const previousDocument = globalThis.document;
  const drawnText = [];
  drawnText.fillColors = [];

  class MockCanvas {
    constructor() {
      this.width = 0;
      this.height = 0;
    }

    getContext(type) {
      assert.equal(type, "2d");
      const canvas = this;
      return {
        fillStyle: "#000000",
        font: "24px sans-serif",
        strokeStyle: "#000000",
        arcTo() {},
        beginPath() {},
        closePath() {},
        drawImage() {},
        fill() {
          drawnText.fillColors.push(String(this.fillStyle));
        },
        fillRect() {},
        fillText(text) {
          drawnText.push(String(text));
        },
        getImageData() {
          const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
          for (let index = 0; index < data.length; index += 4) {
            data[index] = 255;
            data[index + 1] = 255;
            data[index + 2] = 255;
            data[index + 3] = 255;
          }
          return { data };
        },
        lineTo() {},
        measureText(text) {
          return { width: Array.from(String(text || "")).length * 12 };
        },
        moveTo() {},
        restore() {},
        save() {},
        scale() {},
        stroke() {},
        strokeRect() {},
        translate() {}
      };
    }

    toBlob(callback, type) {
      callback(new Blob([MOCK_CANVAS_PNG], { type }));
    }
  }

  globalThis.document = {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      return new MockCanvas();
    }
  };

  try {
    await assertion(drawnText);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
}

function pdfUtf16Text(buffer) {
  const pdf = buffer.toString("latin1");
  return Array.from(pdf.matchAll(/<FEFF([0-9A-F]+)> Tj/g)).map((match) => {
    const hex = match[1];
    const chars = [];
    for (let index = 0; index + 3 < hex.length; index += 4) {
      chars.push(String.fromCharCode(Number.parseInt(hex.slice(index, index + 4), 16)));
    }
    return chars.join("");
  }).join("\n");
}

function assertPdfStructure(buffer) {
  const pdf = buffer.toString("latin1");
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(pdf, /xref\n/);
  assert.match(pdf, /trailer\n/);
  assert.match(pdf, /%%EOF$/);
  const startxref = Number((pdf.match(/startxref\n(\d+)\n%%EOF$/) || [])[1]);
  assert.ok(Number.isInteger(startxref) && startxref > 0, "PDF startxref missing");
  assert.equal(pdf.slice(startxref, startxref + 4), "xref", "PDF startxref does not point to xref");
  const xref = pdf.slice(startxref).match(/^xref\n0 (\d+)\n([\s\S]*?)\ntrailer\n/);
  assert.ok(xref, "PDF xref table missing");
  const lines = xref[2].split("\n");
  lines.slice(1).forEach((line, index) => {
    const offset = Number(line.slice(0, 10));
    const inUse = line.slice(17, 18);
    if (inUse !== "n") {
      return;
    }
    assert.ok(pdf.slice(offset).startsWith(`${index + 1} 0 obj\n`), `PDF xref object ${index + 1} offset invalid`);
  });
}

function assertPublicJsonShape(payload) {
  assert.deepEqual(Object.keys(payload).sort(), [
    "conversationCount",
    "conversations",
    "exportedAt",
    "featureUsage",
    "formatVersion",
    "generatedBy",
    "messageCount",
    "title"
  ]);
  assert.deepEqual(Object.keys(payload.generatedBy).sort(), ["description", "name", "url"]);
  assert.deepEqual(Object.keys(payload.featureUsage).sort(), ["byFeature", "total"]);
  assert.equal(typeof payload.featureUsage.total, "number");
  assert.equal(typeof payload.featureUsage.byFeature, "object");
  for (const conversation of payload.conversations) {
    assert.deepEqual(Object.keys(conversation).sort(), ["id", "messageCount", "messages", "time", "title", "url"]);
    assert.deepEqual(Object.keys(conversation.time).sort(), ["createdAt", "updatedAt"]);
    for (const message of conversation.messages) {
      assert.deepEqual(Object.keys(message).sort(), [
        "features",
        "id",
        "model",
        "parameters",
        "reasoningEffort",
        "requestModel",
        "responseModel",
        "role",
        "selectedPublicMode",
        "selectedPublicModeLabel",
        "selectedPublicModel",
        "sequence",
        "text",
        "time"
      ]);
      assert.deepEqual(Object.keys(message.time).sort(), ["createdAt", "updatedAt"]);
    }
  }
}

function assertNoInternalExportFields(text) {
  assert.doesNotMatch(text, /\bauthorName\b/);
  assert.doesNotMatch(text, /\bcontentType\b/);
  assert.doesNotMatch(text, /\bContent type\b/i);
  assert.doesNotMatch(text, /\bcreateTime\b/);
  assert.doesNotMatch(text, /\bupdateTime\b/);
  assert.doesNotMatch(text, /\bsource\b/);
  assert.doesNotMatch(text, /\bfilecite\b|turn\d+file\d+|\uE200|\uE201|\uE202/i);
}

function assertReadableContentBlocks(text, label) {
  const value = String(text || "");

  // 新设计:所有格式都不再有 Content 标签/字段表,内容直接跟在说话人后面。
  assert.doesNotMatch(value, /Content boundary:/, `${label} exposes internal content boundary labels`);
  assert.doesNotMatch(value, /\*\*Content\*\*/, `${label} uses old markdown content label`);
  assert.doesNotMatch(value, /Content:/, `${label} uses old content label`);
}

function countOccurrences(text, pattern) {
  return Array.from(String(text).matchAll(pattern)).length;
}

test("normalizeConversations accepts common conversation and message fields", () => {
  const normalized = exporter.normalizeConversations(conversations);

  assert.equal(normalized[0].id, "c1");
  assert.equal(normalized[0].title, "Escaping <check>");
  assert.equal(normalized[0].createdAt, "2024-03-09T16:00:00.000Z");
  assert.deepEqual(normalized[0].time, { createTime: "2024-03-09T16:00:00.000Z", updateTime: "" });
  assert.equal(normalized[0].messages[1].role, "assistant");
  assert.equal(normalized[0].messages[1].content, "Line 1\nLine <2>");
});

test("normalizeConversations strips inline ChatGPT content boundary wrappers", () => {
  const normalized = exporter.normalizeConversations([
    {
      id: "inline-boundary",
      messages: [
        {
          role: "assistant",
          text: "Content: Content boundary: BEGIN ```text Clean answer ``` Content boundary: END"
        }
      ]
    }
  ]);

  assert.equal(normalized[0].messages[0].text, "Clean answer");
});

test("normalizeConversations extracts ChatGPT mapping exports", () => {
  const normalized = exporter.normalizeConversations([
    {
      title: "Mapping",
      mapping: {
        root: {
          message: {
            id: "root",
            author: { role: "user" },
            content: { parts: ["Question"] },
            create_time: 1710000001
          }
        }
      }
    }
  ]);

  assert.equal(normalized[0].messages.length, 1);
  assert.equal(normalized[0].messages[0].content, "Question");
  assert.equal(normalized[0].messages[0].createdAt, "2024-03-09T16:00:01.000Z");
});

test("exportJson returns stable normalized JSON payload", () => {
  const json = exporter.exportJson(conversations, { exportedAt: "2026-05-30T00:00:00.000Z" });
  const payload = JSON.parse(json);

  assert.equal(payload.title, "ChatGPT Conversation Export");
  assert.equal(payload.exportedAt, "2026-05-30T00:00:00.000Z");
  assert.equal(payload.formatVersion, 4);
  assert.equal(payload.conversationCount, 2);
  assert.equal(payload.messageCount, 4);
  assert.deepEqual(payload.featureUsage, { total: 1, byFeature: { image_generation: 1 } });
  assert.ok(Array.isArray(payload.conversations));
  assertPublicJsonShape(payload);
  assert.equal(payload.conversations[0].id, "c1");
  assert.equal(payload.conversations[0].title, "Escaping <check>");
  assert.equal(payload.conversations[0].url, "https://chatgpt.com/c/c1");
  assert.deepEqual(payload.conversations[0].time, { createdAt: "2024-03-09T16:00:00.000Z", updatedAt: "" });
  assert.equal(payload.conversations[0].messages[0].sequence, 1);
  assert.equal(payload.conversations[0].messages[1].sequence, 2);
  assert.equal(payload.conversations[0].messages[0].role, "user");
  assert.equal(payload.conversations[0].messages[0].text, "Hello **world**");
  assert.deepEqual(payload.conversations[0].messages[0].time, { createdAt: "", updatedAt: "" });
  assert.equal(payload.conversations[0].messages[0].content, undefined);
  assert.equal(payload.conversations[1].messages[1].text, "Assistant answer with export details.");
  assert.equal(payload.conversations[1].messages[1].model, "future-family-2026-thinking");
  assert.deepEqual(payload.conversations[1].messages[1].parameters, {
    "image_generation_options.size": "1024x1024",
    "reasoning.effort": "high",
    "text.verbosity": "medium"
  });
  assert.deepEqual(payload.conversations[1].messages[0].parameters, {});
  assert.doesNotMatch(json, /"createTime"/);
  assert.doesNotMatch(json, /"updateTime"/);
  assertNoInternalExportFields(json);
});

test("exports keep exact slugs and public dotted GPT labels distinct", () => {
  const modelConversations = [
    {
      id: "model-metadata-conversation",
      title: "Model metadata",
      messages: [
        {
          id: "chatgpt-thinking-message",
          role: "assistant",
          text: "The model metadata names a real ChatGPT thinking request slug.",
          metadata: {
            model_slug: "gpt_5_thinking",
            reasoning_effort: "high",
            text: { verbosity: "medium" }
          },
          requestReasoningEffort: "high"
        },
        {
          id: "exact-chatgpt-model-message",
          role: "assistant",
          text: "The model metadata names the exact ChatGPT DOM slug.",
          metadata: {
            model_slug: "gpt_5_5_thinking",
            reasoning_effort: "medium"
          },
          requestReasoningEffort: "medium"
        },
        {
          id: "public-model-message",
          role: "assistant",
          text: "The model metadata names a public dotted GPT label.",
          metadata: {
            model_slug: "GPT-5.5 Thinking",
            reasoning_effort: "medium"
          },
          requestReasoningEffort: "medium"
        },
        {
          id: "valid-model-message",
          role: "assistant",
          text: "A valid future model slug remains exportable.",
          metadata: {
            model_slug: "future-family-2026-thinking",
            reasoning_effort: "low"
          },
          requestReasoningEffort: "low"
        }
      ]
    }
  ];
  const payload = JSON.parse(exporter.exportJson(modelConversations));
  const markdown = exporter.exportMarkdown(modelConversations);

  assert.equal(payload.conversations[0].messages[0].model, "gpt-5-thinking");
  assert.deepEqual(payload.conversations[0].messages[0].parameters, {
    "reasoning.effort": "high",
    "text.verbosity": "medium"
  });
  assert.equal(payload.conversations[0].messages[1].model, "gpt-5-5-thinking");
  assert.deepEqual(payload.conversations[0].messages[1].parameters, {
    "reasoning.effort": "medium"
  });
  assert.equal(payload.conversations[0].messages[2].model, "gpt-5.5-thinking");
  assert.deepEqual(payload.conversations[0].messages[2].parameters, {
    "reasoning.effort": "medium"
  });
  assert.equal(payload.conversations[0].messages[3].model, "future-family-2026-thinking");
  assert.equal(payload.conversations[0].messages[3].parameters.model, undefined);
  assert.match(markdown, /gpt-5-thinking/);
  assert.match(markdown, /gpt-5-5-thinking/);
  assert.match(markdown, /gpt-5\.5-thinking/);
  assert.match(markdown, /future-family-2026-thinking/);
});

test("exports preserve direct request model separately from the unconfirmed response model", () => {
  const output = JSON.parse(exporter.exportJson([
    {
      id: "direct-aliases",
      title: "Direct aliases",
      messages: [
        { id: "u1", role: "user", text: "Question" },
        {
          id: "a1",
          role: "assistant",
          text: "Answer",
          requestModel: "aurora-7",
          usageFeatures: ["web_search", "code_interpreter"]
        }
      ]
    }
  ]));
  const assistant = output.conversations[0].messages[1];

  assert.equal(assistant.model, "");
  assert.equal(assistant.requestModel, "aurora-7");
  assert.equal(assistant.responseModel, null);
  assert.deepEqual(assistant.features, ["code_interpreter", "web_search"]);
  assert.deepEqual(output.featureUsage.byFeature, { code_interpreter: 1, web_search: 1 });
});

test("JSON export preserves every model identity field without substituting missing values", () => {
  const output = JSON.parse(exporter.exportJson([
    {
      id: "model-identity-fields",
      title: "Model identity fields",
      messages: [
        {
          id: "a1",
          role: "assistant",
          text: "Complete metadata",
          selectedPublicModel: "GPT-5.6 Sol",
          selectedPublicMode: "thinking",
          selectedPublicModeLabel: "Thinking",
          requestModel: "gpt-5-6-thinking",
          responseModel: "gpt-5-6-thinking"
        },
        {
          id: "a2",
          role: "assistant",
          text: "Missing metadata"
        },
        {
          id: "a3",
          role: "assistant",
          text: "Metadata aliases",
          metadata: {
            selected_public_model: "GPT-5.6 Luna",
            selected_public_mode: "instant",
            selected_public_mode_label: "Instant",
            request_model: "gpt-5-6",
            response_model: "gpt-5-6-mini"
          }
        }
      ]
    }
  ]));
  const complete = output.conversations[0].messages[0];
  const missing = output.conversations[0].messages[1];
  const aliases = output.conversations[0].messages[2];

  assert.equal(complete.selectedPublicModel, "GPT-5.6 Sol");
  assert.equal(complete.selectedPublicMode, "thinking");
  assert.equal(complete.selectedPublicModeLabel, "Thinking");
  assert.equal(complete.requestModel, "gpt-5-6-thinking");
  assert.equal(complete.responseModel, "gpt-5-6-thinking");
  assert.equal(missing.selectedPublicModel, null);
  assert.equal(missing.selectedPublicMode, null);
  assert.equal(missing.selectedPublicModeLabel, null);
  assert.equal(missing.requestModel, null);
  assert.equal(missing.responseModel, null);
  assert.equal(aliases.selectedPublicModel, "GPT-5.6 Luna");
  assert.equal(aliases.selectedPublicMode, "instant");
  assert.equal(aliases.selectedPublicModeLabel, "Instant");
  assert.equal(aliases.requestModel, "gpt-5-6");
  assert.equal(aliases.responseModel, "gpt-5-6-mini");
});

test("readable exports label every unavailable model dimension and reasoning effort as unknown", () => {
  const markdown = exporter.exportMarkdown([
    {
      id: "unknown-export-fields",
      title: "Unknown export fields",
      messages: [
        { id: "u1", role: "user", text: "Question" },
        { id: "a1", role: "assistant", text: "Answer" }
      ]
    }
  ]);

  assert.match(
    markdown,
    /\*请求型号：未知 · 实际回复型号：未知 · 思考强度：未知\*/
  );
  assert.doesNotMatch(markdown, /未提供|待确认|未取得|未识别/);
});

test("exports never fill a missing assistant response model from a neighboring turn", () => {
  const output = JSON.parse(exporter.exportJson([
    {
      id: "model-neighbor",
      title: "Model neighbor fallback",
      messages: [
        { id: "u1", role: "user", text: "First prompt" },
        { id: "a1", role: "assistant", text: "First answer without metadata" },
        { id: "u2", role: "user", text: "Second prompt" },
        { id: "a2", role: "assistant", text: "Second answer with metadata", metadata: { model_slug: "gpt-5-thinking" } }
      ]
    },
    {
      id: "isolated-model-missing",
      title: "No model source",
      messages: [
        { id: "u3", role: "user", text: "Prompt" },
        { id: "a3", role: "assistant", text: "Assistant text" }
      ]
    },
    {
      id: "invalid-candidate",
      title: "Public dotted model candidate",
      messages: [
        { id: "u4", role: "user", text: "Prompt" },
        { id: "a4", role: "assistant", text: "Valid answer", metadata: { model_slug: "gpt-5-thinking" } },
        { id: "u5", role: "user", text: "Prompt" },
        { id: "a5", role: "assistant", text: "Public dotted model", metadata: { model_slug: "GPT-5.5 Thinking" } }
      ]
    }
  ]));

  assert.equal(output.conversations[0].messages[1].model, "");
  assert.equal(output.conversations[0].messages[3].model, "gpt-5-thinking");
  assert.equal(output.conversations[1].messages[1].model, "");
  assert.equal(output.conversations[2].messages[1].model, "gpt-5-thinking");
  assert.equal(output.conversations[2].messages[3].model, "gpt-5.5-thinking");
});

test("exports omit ChatGPT thinking preambles and keep the final assistant reply", () => {
  const conversation = [
    {
      id: "thinking-preamble",
      title: "Thinking preamble",
      messages: [
        { id: "u1", role: "user", text: "Check the final answer only." },
        {
          id: "preamble",
          role: "assistant",
          text: "I will first inspect the source.",
          metadata: {
            is_thinking_preamble_message: true,
            model_slug: "gpt-5-6-thinking",
          },
        },
        {
          id: "final",
          role: "assistant",
          text: "This is the final answer.",
          metadata: {
            model_slug: "gpt-5-6-thinking",
          },
        },
      ],
    },
  ];
  const payload = JSON.parse(exporter.exportJson(conversation));
  const markdown = exporter.exportMarkdown(conversation);

  assert.deepEqual(
    payload.conversations[0].messages.map((message) => message.id),
    ["u1", "final"],
  );
  assert.equal(payload.messageCount, 2);
  assert.doesNotMatch(markdown, /I will first inspect the source/);
  assert.match(markdown, /This is the final answer/);
});

test("exports keep model parameters separate from attachment metadata", () => {
  const payload = JSON.parse(exporter.exportJson([
    {
      id: "attachment-metadata",
      title: "Attachment metadata",
      messages: [
        {
          id: "attachment-user",
          role: "user",
          text: "Attached file should not turn file size into a model parameter.",
          metadata: {
            size: 43299,
            format: "text/plain",
            language: "zh"
          }
        },
        {
          id: "attachment-assistant",
          role: "assistant",
          text: "Image option remains a model parameter when it is inside image_generation_options.",
          metadata: {
            model_slug: "future-family-2026-thinking",
            image_generation_options: {
              size: "1024x1024",
              quality: "high"
            }
          }
        }
      ]
    }
  ]));

  const userParameters = payload.conversations[0].messages[0].parameters;
  const assistantParameters = payload.conversations[0].messages[1].parameters;

  assert.deepEqual(userParameters, {});
  assert.equal(payload.conversations[0].messages[1].model, "future-family-2026-thinking");
  assert.equal(assistantParameters.model, undefined);
  assert.equal(assistantParameters["image_generation_options.size"], "1024x1024");
  assert.equal(assistantParameters["image_generation_options.quality"], "high");
});

test("text exports preserve readable Chinese content and normalized parameters", () => {
  const json = exporter.exportJson(chineseConversations, { exportedAt: "2026-05-31T00:00:00.000Z" });
  const payload = JSON.parse(json);
  const markdown = exporter.exportMarkdown(chineseConversations, { title: "中文归档" });

  assertPublicJsonShape(payload);
  assert.equal(payload.conversations[0].title, "中文标题：导出检查");
  assert.equal(payload.conversations[0].messages[0].text, "请总结：模型、角色、参数需要清晰，不要乱码。");
  assert.equal(payload.conversations[0].messages[1].model, "gpt-6-1-aurora");
  assert.deepEqual(payload.conversations[0].messages[1].parameters, {
    "reasoning.effort": "medium",
    top_p: 0.8
  });
  assert.doesNotMatch(json, /\uFFFD|\?{2,}/);
  assert.match(markdown, /^# 中文标题：导出检查/m);
  assert.match(markdown, /^title: 中文标题：导出检查/m);
  assert.match(markdown, /\*\*你\*\*\n\n请总结：模型、角色、参数需要清晰，不要乱码。/);
  assert.doesNotMatch(markdown, /\*\*Content\*\*/);
  assert.doesNotMatch(markdown, /```text\n请总结：模型、角色、参数需要清晰，不要乱码。/);
  // 模型作为附注;参数只保留在 JSON 数据里,可读面不展开
  assert.match(markdown, /\*请求型号：未知 · 实际回复型号：gpt-6-1-aurora · 思考强度：medium\*/);
  assert.doesNotMatch(markdown, /reasoning\.effort/);
  assertNoInternalExportFields(json);
  assertNoInternalExportFields(markdown);
});

test("exports show feature usage and model parameters without internal fields", async () => {
  const json = exporter.exportJson(featureConversations, { exportedAt: "2026-05-31T00:00:00.000Z" });
  const payload = JSON.parse(json);
  const markdown = exporter.exportMarkdown(featureConversations);
  const pdf = Buffer.from(exporter.exportArtifact(featureConversations, "pdf", { filenameBase: "features" }).content);
  const docx = await exporter.createExport("docx", featureConversations).then(async (result) => parseStoredZip(await blobBuffer(result.blob))["word/document.xml"].toString("utf8"));
  const image = await exporter.createExport("image", featureConversations).then(async (result) => pngText(await blobBuffer(result.blob)));
  const pdfText = pdfUtf16Text(pdf);

  assertPublicJsonShape(payload);
  assert.equal(payload.conversations[0].messages[1].model, "future-family-2026-thinking");
  assert.deepEqual(payload.conversations[0].messages[1].parameters, {
    "image_generation_options.size": "1024x1024",
    "reasoning.effort": "high",
    "web_search_options.search_context_size": "medium"
  });
  assert.deepEqual(payload.conversations[0].messages[1].features, [
    "agent_mode",
    "canvas",
    "deep_research",
    "image_generation",
    "web_search"
  ]);
  assert.deepEqual(payload.featureUsage, {
    total: 5,
    byFeature: {
      agent_mode: 1,
      canvas: 1,
      deep_research: 1,
      image_generation: 1,
      web_search: 1
    }
  });

  assertNoInternalExportFields(json);
  for (const text of [markdown, pdfText, docx, image]) {
    // 模型 + 功能作为附注;原始参数不进入可读面(只保留在 JSON 数据里)。
    assert.match(text, /future-family-2026-thinking/);
    assert.match(text, /agent_mode, canvas, deep_research, image_generation, web_search/);
    assert.match(text, /已使用深度研究、agent mode、网页搜索和图片生成能力。/);
    assert.doesNotMatch(text, /reasoning\.effort:/);
    assert.doesNotMatch(text, /image_generation_options\.size:/);
    assert.doesNotMatch(text, /web_search_options\.search_context_size:/);
    assertNoInternalExportFields(text);
  }
});

test("exportMarkdown renders conversations and messages", () => {
  const markdown = exporter.exportMarkdown(conversations, { title: "Archive" });

  assert.match(markdown, /^# Archive/);
  assert.match(markdown, /导出于 .* · 2 段对话 · 4 条消息/);
  assert.match(markdown, /## Escaping <check>/);
  assert.match(markdown, /<https:\/\/chatgpt\.com\/c\/c1>/);
  assert.doesNotMatch(markdown, /createTime=/);
  assert.doesNotMatch(markdown, /updateTime=/);
  assert.match(markdown, /\*\*你\*\*\n\nHello \*\*world\*\*/);
  assert.doesNotMatch(markdown, /\*\*Content\*\*/);
  assert.doesNotMatch(markdown, /```text\nHello \*\*world\*\*/);
  assert.match(markdown, /\*\*ChatGPT\*\*/);
  assert.match(markdown, /Line <2>/);
  assert.match(markdown, /## Second conversation/);
  assert.match(markdown, /\*\*你\*\*\n\nQuestion line A\nQuestion line B/);
  assert.doesNotMatch(markdown, /```text\nQuestion line A\nQuestion line B/);
  // 模型 + 功能作为附注;参数与字段表不出现在可读面
  assert.match(markdown, /future-family-2026-thinking/);
  assert.match(markdown, /image_generation/);
  assert.match(markdown, /Assistant answer with export details\./);
  assert.doesNotMatch(markdown, /\| Model \|/);
  assert.doesNotMatch(markdown, /\| Parameters \|/);
  assert.doesNotMatch(markdown, /reasoning\.effort/);
  assertReadableContentBlocks(markdown, "markdown");
  assertNoInternalExportFields(markdown);
});

test("exportMarkdown preserves long message lines inside content blocks", () => {
  const longText = Array.from({ length: 36 }, (_, index) => `segment${index + 1}`).join(" ");
  const markdown = exporter.exportMarkdown([
    {
      id: "long-md",
      title: "Long markdown",
      messages: [{ id: "long-md-message", role: "user", text: longText }]
    }
  ]);
  const contentBlock = markdown.match(/**你**\n\n([\s\S]*?)\n$/);
  assert.ok(contentBlock);
  assert.equal(contentBlock[1], longText);
  assert.doesNotMatch(markdown, /```text/);
});

test("exportMarkdown renders short user text without fences or empty metadata rows", () => {
  const markdown = exporter.exportMarkdown([
    {
      id: "short-md",
      title: "Short markdown",
      messages: [{ id: "short-md-message", role: "user", text: "OK" }]
    }
  ]);

  assert.match(markdown, /**你**\n\nOK\n$/);
  assert.doesNotMatch(markdown, /\*\*Content\*\*/);
  assert.doesNotMatch(markdown, /```text\nOK/);
  assert.doesNotMatch(markdown, /^\| Model \|/m);
  assert.doesNotMatch(markdown, /^\| Parameters \|/m);
  assert.doesNotMatch(markdown, /^\| Features \|/m);
});

test("exportHtml escapes user content and supports print pages", () => {
  const html = exporter.exportHtml(conversations, { title: "Archive" });
  const printHtml = exporter.exportPrintHtml(conversations, { autoPrint: true });

  assert.match(html, /Escaping &lt;check&gt;/);
  assert.match(html, /Line &lt;2&gt;/);
  assert.doesNotMatch(html, /Line <2>/);
  assert.match(printHtml, /@media print/);
  assert.match(printHtml, /window\.print/);
});

test("exportDocxHtml adds Word-compatible document metadata", () => {
  const html = exporter.exportDocxHtml(conversations);

  assert.match(html, /schemas-microsoft-com:office:word/);
  assert.match(html, /<w:WordDocument>/);
});

test("exportSvg returns standalone escaped SVG", () => {
  const svg = exporter.exportSvg(conversations, { width: 640 });

  assert.match(svg, /^<svg /);
  assert.match(svg, /width="640"/);
  assert.match(svg, /Escaping &lt;check&gt;/);
  assert.match(svg, /Second conversation/);
  assert.match(svg, /Assistant answer with export details\./);
  assert.match(svg, /ChatGPT Model Usage Counter/);
  assert.match(svg, /fill="#172554"/);
  assert.match(svg, /fill="#22D3EE"/);
  assert.match(svg, /fill="#60A5FA"/);
  assert.match(svg, /fill="#A78BFA"/);
});

test("exported brand geometry keeps the compact chat-and-counter identity", () => {
  assert.equal(exporter.BRAND_ICON.viewBox, 128);
  assert.equal(exporter.BRAND_ICON.background.color, "#172554");
  assert.equal(exporter.BRAND_ICON.bubble.color, "#FFFFFF");
  assert.deepEqual(
    exporter.BRAND_ICON.bars.map((bar) => [bar.height, bar.color]),
    [[14, "#22D3EE"], [23, "#60A5FA"], [33, "#A78BFA"]]
  );
});

test("exportArtifact returns content, dataUrl, blob, filename, and mime type", async () => {
  const artifact = exporter.exportArtifact(conversations, "md", { filenameBase: "archive" });

  assert.equal(artifact.format, "markdown");
  assert.equal(artifact.filename, "archive.md");
  assert.equal(artifact.mimeType, exporter.MIME.markdown);
  assert.match(artifact.dataUrl, /^data:text\/markdown;charset=utf-8;base64,/);
  assert.equal(await artifact.blob.text(), artifact.content);
});

test("exportArtifact returns real binary PDF bytes", async () => {
  const artifact = exporter.exportArtifact(conversations, "pdf", { filenameBase: "archive" });
  const buffer = Buffer.from(artifact.content);
  const pdfText = buffer.toString("utf8");
  const streamText = pdfUtf16Text(buffer);

  assert.equal(artifact.filename, "archive.pdf");
  assert.equal(artifact.mimeType, exporter.MIME.pdf);
  assert.match(artifact.dataUrl, /^data:application\/pdf;base64,/);
  assertPdfStructure(buffer);
  assert.equal((await blobBuffer(artifact.blob)).subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(pdfText, /\/Type \/Catalog/);
  // 新设计:清爽对话(说话人+正文+模型/功能附注),无 Conversation/Message/Role/Content/Parameters 字段
  assert.match(streamText, /Escaping <check>/);
  assert.match(streamText, /Second conversation/);
  assert.match(streamText, /ChatGPT/);
  assert.match(streamText, /future-family-2026-thinking/);
  assert.match(streamText, /image_generation/);
  assert.match(streamText, /Assistant answer with export details\./);
  assert.doesNotMatch(streamText, /Message \d+ - /);
  assert.doesNotMatch(streamText, /Role: (?:user|assistant)/);
  assert.doesNotMatch(streamText, /reasoning\.effort:/);
  assert.doesNotMatch(streamText, /Feature usage:/);
  assertReadableContentBlocks(streamText, "pdf");
  assertNoInternalExportFields(streamText);
});

test("exportArtifact image returns a PNG with selected content metadata", async () => {
  const artifact = exporter.exportArtifact(conversations, "image", { filenameBase: "archive" });
  const buffer = Buffer.from(artifact.content);
  const chunks = parsePngChunks(buffer).map((chunk) => chunk.type);
  const textEntries = pngTextEntries(buffer);
  const text = pngText(buffer);
  const dimensions = pngDimensions(buffer);

  assert.equal(artifact.filename, "archive.png");
  assert.equal(artifact.mimeType, exporter.MIME.image);
  assert.match(artifact.dataUrl, /^data:image\/png;base64,/);
  assertPngExportTextChunks(chunks, textEntries);
  assert.ok(dimensions.width >= 640);
  assert.ok(dimensions.height > 180);
  assert.equal(pngHasDarkPixel(buffer), true);
  assert.equal(pngContainsRgb(buffer, [23, 37, 84]), true, "PNG pixels should contain the navy icon body");
  assert.equal(pngContainsRgb(buffer, [34, 211, 238]), true, "PNG pixels should contain the cyan counter bar");
  assert.equal(pngContainsRgb(buffer, [96, 165, 250]), true, "PNG pixels should contain the blue counter bar");
  assert.equal(pngContainsRgb(buffer, [167, 139, 250]), true, "PNG pixels should contain the violet counter bar");
  assert.match(text, /Escaping <check>/);
  assert.match(text, /Second conversation/);
  assert.match(text, /ChatGPT/);
  assert.match(text, /future-family-2026-thinking/);
  assert.match(text, /image_generation/);
  assert.doesNotMatch(text, /Message \d+ - /);
  assert.doesNotMatch(text, /reasoning\.effort:/);
  assertReadableContentBlocks(text, "png");
  assert.match(text, /Assistant answer with export details\./);
  assertNoInternalExportFields(text);
});

test("PDF export keeps Chinese readable in metadata and UTF-16 text stream", async () => {
  const artifact = exporter.exportArtifact(chineseConversations, "pdf", { filenameBase: "中文归档" });
  const buffer = Buffer.from(artifact.content);
  const pdfText = buffer.toString("utf8");
  const streamText = pdfUtf16Text(buffer);

  assert.equal(artifact.filename, "中文归档.pdf");
  assert.equal(artifact.mimeType, exporter.MIME.pdf);
  assertPdfStructure(buffer);
  assert.match(pdfText, /<dc:description>/);
  assert.match(pdfText, /中文标题：导出检查/);
  assert.match(pdfText, /请总结：模型、角色、参数需要清晰，不要乱码。/);
  assert.match(pdfText, /结论：中文内容应在 JSON、Markdown、PDF、DOCX、PNG 中保持可读。/);
  assert.match(buffer.toString("latin1"), /\/Subtype \/Type0/);
  assert.match(buffer.toString("latin1"), /\/Encoding \/UniGB-UCS2-H/);
  assert.match(streamText, /中文标题：导出检查/);
  assert.match(streamText, /gpt-6-1-aurora/);
  assert.doesNotMatch(streamText, /Role: (?:user|assistant)/);
  assert.doesNotMatch(streamText, /reasoning\.effort:/);
  assert.match(streamText, /结论：中文内容应在 JSON、Markdown、PDF、DOCX、PNG 中保持可读。/);
  assert.doesNotMatch(streamText, /\?{2,}/);
  assertNoInternalExportFields(streamText);
});

test("PNG export stores Chinese source text in UTF-8 iTXt metadata", async () => {
  const result = await exporter.createExport("image", chineseConversations);
  const buffer = await blobBuffer(result.blob);
  const text = pngText(buffer);

  assert.match(result.filename, /\.png$/);
  assert.equal(result.blob.type, exporter.MIME.image);
  assert.equal(pngHasDarkPixel(buffer), true);
  assert.match(text, /中文标题：导出检查/);
  assert.match(text, /请总结：模型、角色、参数需要清晰，不要乱码。/);
  assert.match(text, /结论：中文内容应在 JSON、Markdown、PDF、DOCX、PNG 中保持可读。/);
  assert.match(text, /gpt-6-1-aurora/);
  assert.doesNotMatch(text, /\uFFFD|\?{2,}/);
  assertNoInternalExportFields(text);
});

test("PNG browser export draws Chinese text directly instead of Unicode codepoint escapes", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const result = await exporter.createExport("image", chineseConversations);
    const buffer = await blobBuffer(result.blob);
    const metadataText = pngText(buffer);
    const visualText = drawnText.join("\n");

    assert.match(result.filename, /\.png$/);
    assert.equal(result.blob.type, exporter.MIME.image);
    assert.match(metadataText, /中文标题：导出检查/);
    assert.match(visualText, /中文标题：导出检查/);
    assert.match(visualText, /请总结：模型、角色、参数需要清晰，不要乱码。/);
    assert.match(visualText, /结论：中文内容应在 JSON、Markdown、PDF、DOCX、PNG 中保持可读。/);
    assert.doesNotMatch(visualText, /U\+[0-9A-F]{4}/);
  });
});

test("single-conversation browser PDF and PNG layout renders the conversation title once", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const title = "Single conversation title";
    const conversations = [{
      id: "single-title",
      title,
      messages: [
        { id: "single-user", role: "user", text: "Question" },
        { id: "single-assistant", role: "assistant", text: "Answer" }
      ]
    }];

    exporter.renderConversationsCanvas(conversations);

    assert.equal(
      drawnText.filter((text) => text === title).length,
      1,
      "the document title already represents the only conversation"
    );
  });
});

test("multi-conversation browser PDF and PNG layout keeps one heading for each conversation", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const conversations = [
      {
        id: "multi-a",
        title: "Conversation A",
        messages: [{ id: "multi-a-user", role: "user", text: "Question A" }]
      },
      {
        id: "multi-b",
        title: "Conversation B",
        messages: [{ id: "multi-b-user", role: "user", text: "Question B" }]
      }
    ];

    exporter.renderConversationsCanvas(conversations);

    assert.equal(drawnText.filter((text) => text === "Conversation A").length, 1);
    assert.equal(drawnText.filter((text) => text === "Conversation B").length, 1);
  });
});

test("browser canvas export wraps long code lines instead of clipping them", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const longCode = "X".repeat(180);
    const longParagraph = "Y".repeat(180);
    exporter.renderConversationsCanvas([
      {
        id: "long-code",
        title: "Long code",
        messages: [
          { role: "assistant", text: longParagraph + "\n\n```text\n" + longCode + "\n```" }
        ]
      }
    ]);

    const codeChunks = drawnText.filter((text) => /^X+$/.test(text));
    const paragraphChunks = drawnText.filter((text) => /^Y+$/.test(text));
    assert.ok(codeChunks.length >= 3);
    assert.ok(paragraphChunks.length >= 3);
    assert.equal(codeChunks.join(""), longCode);
    assert.equal(paragraphChunks.join(""), longParagraph);
    assert.ok(codeChunks.every((text) => text.length <= 64));
    assert.ok(paragraphChunks.every((text) => text.length <= 66));
  });
});

test("browser canvas export renders Markdown links as readable labels and URLs", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    exporter.renderConversationsCanvas([{
      id: "canvas-link",
      title: "Canvas link",
      messages: [{
        id: "answer",
        role: "assistant",
        text: "参考：[ChatGPT](https://chatgpt.com/)"
      }]
    }]);

    const visualText = drawnText.join("");
    assert.match(visualText, /ChatGPT/);
    assert.match(visualText, /https:\/\/chatgpt\.com\//);
    assert.doesNotMatch(visualText, /\[ChatGPT\]\(/);
  });
});

test("renderConversationsCanvasPages splits super-long readable exports before browser canvas limits", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const longConversation = [{
      id: "long-canvas",
      title: "Super-long export",
      messages: [{
        id: "long-answer",
        role: "assistant",
        text: Array.from({ length: 900 }, (_, index) => `Readable line ${index + 1}`).join("\n")
      }]
    }];
    const pages = exporter.renderConversationsCanvasPages(longConversation, { pageHeight: 700 });

    assert.ok(pages.length > 10, "long output should be split into many bounded pages");
    pages.forEach((page) => {
      assert.equal(page.width, 1720);
      assert.ok(page.height > 0 && page.height <= 1400, "DPR-scaled page height must stay bounded");
    });
    const readableLineNumbers = drawnText
      .filter((text) => /^\d+$/.test(text))
      .map(Number)
      .filter((value) => value >= 1 && value <= 900);
    const firstMismatch = readableLineNumbers.findIndex((value, index) => value !== index + 1);
    assert.equal(
      firstMismatch,
      -1,
      `source line order diverged near ${JSON.stringify(readableLineNumbers.slice(Math.max(0, firstMismatch - 3), firstMismatch + 5))}`
    );
    assert.equal(readableLineNumbers.length, 900, "every source line must be rendered exactly once across pages");
    assert.equal(readableLineNumbers[0], 1);
    assert.equal(readableLineNumbers.at(-1), 900);
    assert.equal(new Set(readableLineNumbers).size, 900);

    const tallPages = exporter.renderConversationsCanvasPages(longConversation, { pageHeight: 14000 });
    assert.equal(tallPages[0].width, 860, "very tall PNG pages must use DPR 1 to avoid excessive canvas memory");
  });
});

test("buildPdfBlobFromCanvases creates one PDF page per rendered canvas", async () => {
  function canvas(width, height, shade) {
    return {
      width,
      height,
      getContext() {
        return {
          getImageData() {
            const data = new Uint8ClampedArray(width * height * 4);
            for (let index = 0; index < data.length; index += 4) {
              data[index] = shade;
              data[index + 1] = shade;
              data[index + 2] = shade;
              data[index + 3] = 255;
            }
            return { data };
          }
        };
      }
    };
  }

  const blob = await exporter.buildPdfBlobFromCanvases([canvas(4, 6, 255), canvas(4, 3, 220)]);
  const buffer = await blobBuffer(blob);
  const pdf = buffer.toString("latin1");

  assert.equal(blob.type, exporter.MIME.pdf);
  assertPdfStructure(buffer);
  assert.match(pdf, /\/Type \/Pages \/Kids \[3 0 R 6 0 R\] \/Count 2/);
});

test("memory-safe browser renderers create paged PDF and PNG output directly from conversations", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const longConversation = [{
      id: "streamed-pages",
      title: "Memory-safe pages",
      messages: [{
        id: "answer",
        role: "assistant",
        text: Array.from({ length: 90 }, (_, index) => `Page line ${index + 1}`).join("\n")
      }]
    }];

    const pngPages = await exporter.renderConversationsPngBlobs(longConversation, { pageHeight: 700 });
    assert.ok(pngPages.length > 2);
    pngPages.forEach((blob) => assert.equal(blob.type, exporter.MIME.png));
    assertBrandPalette(drawnText.fillColors);

    const pdfBlob = await exporter.buildPdfBlobFromConversations(longConversation, { pageHeight: 700 });
    const pdf = (await blobBuffer(pdfBlob)).toString("latin1");
    const pageCount = Number((pdf.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/) || [])[1]);
    assert.equal(pdfBlob.type, exporter.MIME.pdf);
    assert.ok(pageCount > 2);
    assertPdfStructure(Buffer.from(await pdfBlob.arrayBuffer()));
  });
});

test("one long selected conversation is streamed into one complete PNG file", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const longConversation = [{
      id: "single-long-png",
      title: "Single long PNG",
      messages: [{
        id: "answer",
        role: "assistant",
        text: Array.from({ length: 120 }, (_, index) => `Single PNG line ${index + 1}`).join("\n")
      }]
    }];

    const blob = await exporter.buildPngBlobFromConversations(longConversation, { pageHeight: 700 });
    const buffer = await blobBuffer(blob);
    const dimensions = pngDimensions(buffer);
    const metadata = pngText(buffer);

    assert.equal(blob.type, exporter.MIME.png);
    assert.equal(buffer.subarray(0, 8).toString("latin1"), "\x89PNG\r\n\x1A\n");
    assert.equal(dimensions.width, 860);
    assert.ok(dimensions.height > 700, "the one PNG should contain the full multi-slice transcript");
    assert.match(metadata, /Single PNG line 1/);
    assert.match(metadata, /Single PNG line 120/);
    assertBrandPalette(drawnText.fillColors);
    assert.equal(
      drawnText.filter((value) => /^120$/.test(value)).length,
      1,
      "the final source line should be painted exactly once"
    );
  });
});

test("createExport docx returns an Office docx ZIP with selected content", async () => {
  const result = await exporter.createExport("docx", conversations);
  const buffer = await blobBuffer(result.blob);
  const entries = parseStoredZip(buffer);
  const documentXml = entries["word/document.xml"].toString("utf8");

  assert.match(result.filename, /\.docx$/);
  assert.equal(result.blob.type, exporter.MIME.docx);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "PK\u0003\u0004");
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.ok(entries["[Content_Types].xml"]);
  assert.ok(entries["_rels/.rels"]);
  assert.ok(entries["word/_rels/document.xml.rels"]);
  assert.ok(entries["word/styles.xml"]);
  assert.ok(entries["word/footer1.xml"]);
  assert.match(entries["word/styles.xml"].toString("utf8"), /w:styleId="Heading2"/);
  assert.match(entries["word/styles.xml"].toString("utf8"), /w:styleId="ContentLabel"/);
  assert.match(documentXml, /ChatGPT Conversation Export/);
  assert.match(documentXml, /· 4 条消息/);
  assert.match(documentXml, /Escaping &lt;check&gt;/);
  assert.match(documentXml, /Created: 2024-03-09T16:00:00.000Z/);
  assert.doesNotMatch(documentXml, /createTime=/);
  assert.doesNotMatch(documentXml, /updateTime=/);
  // 说话人标签(你 / ChatGPT)而非 "Message N - Role" 字段;模型/功能作为附注,参数不展开
  assert.match(documentXml, /你/);
  assert.doesNotMatch(documentXml, /Message \d+ - /);
  assert.doesNotMatch(documentXml, /Role: (?:user|assistant)/);
  assert.match(documentXml, /future-family-2026-thinking/);
  assert.match(documentXml, /image_generation/);
  assert.doesNotMatch(documentXml, /reasoning\.effort:/);
  assertReadableContentBlocks(documentXml, "docx");
  assert.match(documentXml, /Hello \*\*world\*\*/);
  assert.match(documentXml, /Line &lt;2&gt;/);
  assert.match(documentXml, /Assistant answer with export details\./);
  assert.match(documentXml, /w:footerReference w:type="default" r:id="rIdFooter"/);
  assert.match(
    entries["word/footer1.xml"].toString("utf8"),
    /ChatGPT Model Usage Counter · https:\/\/github\.com\/Bsnblanc\/chatgpt-model-usage-counter/
  );
  assert.doesNotMatch(documentXml, /Line <2>/);
  assertNoInternalExportFields(documentXml);
});

test("buildDocxRenderedBlob (runtime Word path) renders Markdown into Word structures", async () => {
  const md = [{
    id: "md-docx",
    title: "Markdown DOCX",
    messages: [{
      id: "a",
      role: "assistant",
      text: "## 标题\n**粗体** 与 `代码`\n\n- 项目一\n- 项目二\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n参考：[ChatGPT](https://chatgpt.com/)"
    }]
  }];
  const blob = exporter.buildDocxRenderedBlob(md, {});
  const buffer = await blobBuffer(blob);
  const entries = parseStoredZip(buffer);
  const xml = entries["word/document.xml"].toString("utf8");
  const relationships = entries["word/_rels/document.xml.rels"].toString("utf8");
  assert.equal(blob.type, exporter.MIME.docx);
  assert.match(xml, /<w:tbl>/); // 表格渲染成 Word 表格
  assert.match(xml, /<w:b\/>/); // 行内加粗
  assert.match(xml, /<w:hyperlink r:id="rIdLink1">/);
  assert.match(xml, /ChatGPT \(https:\/\/chatgpt\.com\/\)/);
  assert.match(relationships, /relationships\/hyperlink/);
  assert.match(relationships, /Target="https:\/\/chatgpt\.com\/"/);
  assert.match(xml, /标题/);
  assert.doesNotMatch(xml, /\*\*粗体\*\*/); // 不再是原始 Markdown 记号
  assert.doesNotMatch(xml, /\[ChatGPT\]\(/);
  assert.doesNotMatch(xml, /## 标题/);
  assert.doesNotMatch(xml, /\| A \| B \|/);
});

test("createExport docx preserves Chinese content and declares East Asian run fonts", async () => {
  const result = await exporter.createExport("docx", chineseConversations);
  const buffer = await blobBuffer(result.blob);
  const entries = parseStoredZip(buffer);
  const documentXml = entries["word/document.xml"].toString("utf8");

  assert.match(result.filename, /\.docx$/);
  assert.equal(result.blob.type, exporter.MIME.docx);
  assert.match(documentXml, /w:eastAsia="Microsoft YaHei"/);
  assert.match(documentXml, /中文标题：导出检查/);
  assert.match(documentXml, /请总结：模型、角色、参数需要清晰，不要乱码。/);
  assert.match(documentXml, /结论：中文内容应在 JSON、Markdown、PDF、DOCX、PNG 中保持可读。/);
  assert.match(documentXml, /gpt-6-1-aurora/);
  assert.doesNotMatch(documentXml, /Role: (?:user|assistant)/);
  assert.doesNotMatch(documentXml, /reasoning\.effort:/);
  assert.doesNotMatch(documentXml, /\uFFFD|\?{2,}/);
  assertNoInternalExportFields(documentXml);
});

test("createExport pdf returns a valid multipage PDF with export text metadata", async () => {
  const longText = Array.from({ length: 170 }, (_, index) => `Long line ${index + 1} export content`).join("\n");
  const result = await exporter.createExport("pdf", [
    {
      id: "long",
      title: "Long PDF conversation",
      url: "https://chatgpt.com/c/long",
      messages: [{ id: "long-message", role: "user", text: longText }]
    }
  ]);
  const buffer = await blobBuffer(result.blob);
  const pdfText = buffer.toString("utf8");
  const pageObjects = pdfText.match(/\/Type \/Page /g) || [];

  assert.match(result.filename, /\.pdf$/);
  assert.equal(result.blob.type, exporter.MIME.pdf);
  assertPdfStructure(buffer);
  assert.match(pdfText, /\/Type \/Catalog/);
  assert.match(pdfText, /\/Type \/Pages \/Count [2-9]/);
  assert.ok(pageObjects.length > 1);
  assert.match(pdfText, /Long PDF conversation/);
  assert.match(pdfText, /Long line 170 export content/);
  assert.match(pdfText, /startxref/);
  assert.match(pdfText, /%%EOF$/);
});

test("createExport pdf uses the text PDF path when browser canvas exists", async (t) => {
  const previousDocument = global.document;
  global.document = {
    createElement() {
      throw new Error("canvas path should not run for PDF");
    }
  };
  t.after(() => {
    if (typeof previousDocument === "undefined") {
      delete global.document;
    } else {
      global.document = previousDocument;
    }
  });

  const result = await exporter.createExport("pdf", conversations);
  const buffer = await blobBuffer(result.blob);
  const pdfText = buffer.toString("latin1");
  const streamText = pdfUtf16Text(buffer);

  assert.match(result.filename, /\.pdf$/);
  assert.equal(result.blob.type, exporter.MIME.pdf);
  assertPdfStructure(buffer);
  assert.match(pdfText, /\/Subtype \/Type0/);
  assert.match(pdfText, /\/Encoding \/UniGB-UCS2-H/);
  assert.match(streamText, /ChatGPT Conversation Export/);
  assert.match(streamText, /Second conversation/);
  assert.match(streamText, /future-family-2026-thinking/);
});

test("createExport image uses browser canvas when browser canvas exists", async () => {
  await withMockCanvasDocument(async (drawnText) => {
    const result = await exporter.createExport("image", conversations);
    const buffer = await blobBuffer(result.blob);
    const textEntries = pngTextEntries(buffer);
    const text = pngText(buffer);
    const visualText = drawnText.join("\n");

    assert.match(result.filename, /\.png$/);
    assert.equal(result.blob.type, exporter.MIME.image);
    assert.equal(buffer.subarray(0, 8).toString("latin1"), "\x89PNG\r\n\x1A\n");
    assert.deepEqual(textEntries.map((entry) => [entry.type, entry.keyword]), [["iTXt", "ChatGPTExport"], ["iTXt", "ChatGPTExportSvgPreview"]]);
    assert.match(text, /Second conversation/);
    assert.match(text, /future-family-2026-thinking/);
    assert.match(visualText, /Escaping <check>/);
    assert.match(visualText, /Assistant answer with export details\./);
    assertBrandPalette(drawnText.fillColors);
  });
});

test("createExport image returns a real PNG with multiple conversation metadata in Node", async () => {
  const result = await exporter.createExport("image", conversations);
  const buffer = await blobBuffer(result.blob);
  const chunks = parsePngChunks(buffer).map((chunk) => chunk.type);
  const textEntries = pngTextEntries(buffer);
  const text = pngText(buffer);
  const dimensions = pngDimensions(buffer);

  assert.match(result.filename, /\.png$/);
  assert.equal(result.blob.type, exporter.MIME.image);
  assertPngExportTextChunks(chunks, textEntries);
  assert.ok(dimensions.width >= 640);
  assert.ok(dimensions.height > 180);
  assert.equal(pngHasDarkPixel(buffer), true);
  assert.match(text, /Escaping <check>/);
  assert.match(text, /Escaping <check>/);
  assert.match(text, /Second conversation/);
  assert.match(text, /ChatGPT/);
  assert.match(text, /future-family-2026-thinking/);
  assert.match(text, /image_generation/);
  assert.doesNotMatch(text, /Message \d+ - /);
  assert.doesNotMatch(text, /reasoning\.effort:/);
  assertReadableContentBlocks(text, "png");
  assert.match(text, /Assistant answer with export details\./);
  assertNoInternalExportFields(text);
});

test("downloadBlob attaches a download anchor before clicking", () => {
  const originalDocument = global.document;
  const originalUrl = global.URL;
  const calls = [];
  const anchor = {
    style: {},
    href: "",
    download: "",
    click() {
      calls.push(["click", this.href, this.download, Boolean(this.attached)]);
    },
    remove() {
      calls.push(["remove", Boolean(this.attached)]);
      this.attached = false;
    }
  };

  global.URL = {
    createObjectURL(blob) {
      calls.push(["createObjectURL", blob.type]);
      return "blob:test";
    },
    revokeObjectURL(url) {
      calls.push(["revokeObjectURL", url]);
    }
  };
  global.document = {
    createElement(tag) {
      assert.equal(tag, "a");
      return anchor;
    },
    body: {
      appendChild(node) {
        node.attached = true;
        calls.push(["appendChild", node.download]);
      }
    }
  };

  try {
    exporter.downloadBlob(new Blob(["ok"], { type: "text/plain" }), "archive.json");
  } finally {
    global.document = originalDocument;
    global.URL = originalUrl;
  }

  assert.deepEqual(calls.slice(0, 4), [
    ["createObjectURL", "text/plain"],
    ["appendChild", "archive.json"],
    ["click", "blob:test", "archive.json", true],
    ["remove", true]
  ]);
});

test("exportPngDataUrl reports browser Canvas requirement outside browsers", async () => {
  await assert.rejects(
    exporter.exportPngDataUrl(conversations),
    /PNG export requires a browser environment/
  );
});

test("safeName produces portable filenames", () => {
  assert.equal(exporter.safeName("CON"), "_CON");
  assert.equal(exporter.safeName("nul.json"), "_nul.json");
  assert.equal(exporter.safeName("COM1 report"), "COM1 report");
  assert.equal(exporter.safeName("AUX.   "), "_AUX");
  assert.equal(exporter.safeName("\x00Quarterly\x1f export.  "), "Quarterly export");
  assert.equal(exporter.safeName("..."), "chatgpt-export");
  assert.equal(exporter.safeName("   "), "chatgpt-export");
});

test("export functions reject non-array input", () => {
  assert.throws(() => exporter.exportJson(null), /conversations must be an array/);
  assert.throws(() => exporter.normalizeConversations({}), /conversations must be an array/);
});
