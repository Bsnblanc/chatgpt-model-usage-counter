const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const manifestPath = path.join(__dirname, "..", "manifest.json");

test("manifest is MV3 and targets ChatGPT hosts", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.deepEqual(manifest.permissions, ["alarms", "downloads", "scripting", "storage", "webRequest"]);
  assert.ok(manifest.host_permissions.includes("https://chatgpt.com/*"));
  assert.ok(manifest.host_permissions.includes("https://chat.openai.com/*"));
  assert.ok(manifest.host_permissions.includes("https://status.openai.com/*"));
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].exclude_matches, [
    "https://chatgpt.com/api/*",
    "https://chatgpt.com/backend-api/*",
    "https://chat.openai.com/api/*",
    "https://chat.openai.com/backend-api/*"
  ]);
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/model-catalog.js",
    "src/detector.js",
    "src/exporter.js",
    "src/conversation-source.js",
    "src/dashboard.js",
    "src/content.js"
  ]);
  assert.equal(manifest.content_scripts[0].world, "ISOLATED");
  assert.equal(manifest.content_scripts[0].run_at, "document_end");
});
