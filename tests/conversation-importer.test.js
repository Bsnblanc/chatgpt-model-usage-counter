const test = require("node:test");
const assert = require("node:assert/strict");
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
