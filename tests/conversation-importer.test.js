const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createZip } = require("../build-release.js");
const exporter = require("../src/exporter.js");
const importer = require("../src/conversation-importer.js");

function fixture() {
  return [{
    id: "chat-0001",
    title: "Imported chat",
    project_id: "g-p-0123456789abcdef0123456789abcdef",
    project_name: "Research",
    mapping: {
      u: { id: "u", parent: null, message: { id: "u", author: { role: "user" }, content: { content_type: "text", parts: ["Question"] } } },
      a: { id: "a", parent: "u", message: { id: "a", author: { role: "assistant" }, content: { content_type: "text", parts: ["Answer"] }, metadata: { model_slug: "gpt-5-6-pro" } } }
    },
    current_node: "a"
  }];
}

test("official conversations.json imports locally with trusted project metadata", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(fixture()));
  const result = await importer.parseOfficialExportBytes(bytes, "conversations.json", { exporter });
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].title, "Imported chat");
  assert.equal(result.conversations[0].projectName, "Research");
  assert.equal(result.conversations[0].messages.length, 2);
});

test("official ZIP import finds and inflates conversations.json", async () => {
  const payload = Buffer.from(JSON.stringify(fixture()), "utf8");
  const zip = createZip([{ name: "export/conversations.json", data: payload }]);
  const result = await importer.parseOfficialExportBytes(zip, "chatgpt-export.zip", { exporter });
  assert.equal(result.conversations[0].id, "chat-0001");
  assert.equal(result.conversations[0].messages[1].responseModel, "gpt-5-6-pro");
});

test("official ZIP import rejects archives without conversations.json", async () => {
  const zip = createZip([{ name: "user.json", data: Buffer.from("{}") }]);
  await assert.rejects(
    importer.parseOfficialExportBytes(zip, "chatgpt-export.zip", { exporter }),
    /does not contain conversations\.json/
  );
});

test("browser-isolated content script can import an official deflated ZIP without Node APIs", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "conversation-importer.js"), "utf8");
  const context = { Uint8Array, ArrayBuffer, TextDecoder, Blob, DecompressionStream, Promise };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "conversation-importer.js" });
  const zip = createZip([{ name: "export/conversations.json", data: Buffer.from(JSON.stringify(fixture())) }]);
  const file = {
    name: "official-export.zip",
    size: zip.length,
    arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
  };
  const result = await context.ChatGPTConversationImporter.parseOfficialExportFile(file, { exporter });
  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].projectName, "Research");
});

test("official import does not accept a broken ZIP entry size or invalid JSON", async () => {
  const zip = Buffer.from(createZip([{
    name: "conversations.json",
    data: Buffer.from(JSON.stringify(fixture()))
  }]));
  // Modify the uncompressed-size field of the central-directory record.
  const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(central > 0);
  zip.writeUInt32LE(1, central + 24);
  await assert.rejects(importer.parseOfficialExportBytes(zip, "bad.zip", { exporter }), /size is inconsistent/);
  await assert.rejects(importer.parseOfficialExportBytes(
    Buffer.from("{bad json"), "conversations.json", { exporter }
  ), /invalid/);
});

test("official import rejects ambiguous duplicate conversations.json ZIP entries", async () => {
  const zip = createZip([
    { name: "archive/conversations.json", data: Buffer.from("[]") },
    { name: "conversations.json", data: Buffer.from("[]") }
  ]);
  await assert.rejects(importer.parseOfficialExportBytes(zip, "duplicate.zip", { exporter }), /multiple/);
});

test("official import rejects invalid conversation shape instead of replacing saved data", async () => {
  await assert.rejects(importer.parseOfficialExportBytes(
    Buffer.from(JSON.stringify({ conversations: [] })), "conversations.json", { exporter }
  ), /array/);
});
