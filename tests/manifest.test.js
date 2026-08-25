const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const manifestPath = path.join(__dirname, "..", "manifest.json");

test("manifest is MV3 and targets ChatGPT hosts", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.deepEqual(manifest.permissions, ["alarms", "downloads", "scripting", "storage", "unlimitedStorage", "webRequest"]);
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
    "src/conversation-importer.js",
    "src/conversation-source.js",
    "src/dashboard.js",
    "src/content.js"
  ]);
  assert.equal(manifest.content_scripts[0].world, "ISOLATED");
  assert.equal(manifest.content_scripts[0].run_at, "document_end");
});

test("manifest defaults to widest badge-safe action icons while full brand assets remain available", () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const root = path.join(__dirname, "..");

  assert.deepEqual(manifest.action.default_icon, {
    16: "icons/action16.png",
    20: "icons/action20.png",
    24: "icons/action24.png",
    32: "icons/action32.png",
    48: "icons/action48.png"
  });
  assert.deepEqual(manifest.icons, {
    16: "icons/icon16.png",
    20: "icons/icon20.png",
    24: "icons/icon24.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png"
  });
  const badgeSafeIcons = [16, 20, 24, 32, 48].flatMap((size) => [
    `icons/action${size}.png`,
    `icons/action1-${size}.png`,
    `icons/action2-${size}.png`
  ]);
  for (const file of [...Object.values(manifest.action.default_icon), ...Object.values(manifest.icons), ...badgeSafeIcons]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  }
});
