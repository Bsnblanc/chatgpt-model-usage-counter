const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  RELEASE_FILES,
  createZip,
  validateReleaseFiles
} = require("../build-release");

test("release allowlist contains every runtime file and excludes private verification data", () => {
  const files = validateReleaseFiles();
  assert.deepEqual(files, [...RELEASE_FILES].sort((left, right) => left.localeCompare(right, "en")));
  assert.ok(files.includes("manifest.json"));
  assert.ok(files.includes("icons/action1-48.png"));
  assert.ok(files.includes("icons/action2-48.png"));
  assert.ok(files.includes("src/background.js"));
  assert.ok(files.includes("src/content.js"));
  assert.equal(files.some((file) => /(^|\/)(tests|tmp-verify|tmp-recovery|node_modules|dist)(\/|$)/.test(file)), false);
  assert.equal(files.some((file) => /\.(?:log|tmp)$/i.test(file)), false);
});

test("release allowlist covers manifest and background badge-safe icons", () => {
  const root = path.resolve(__dirname, "..");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const background = fs.readFileSync(path.join(root, "src", "background.js"), "utf8");
  const referenced = new Set([
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...Array.from(background.matchAll(/["']\/icons\/([^"']+\.png)["']/g), (match) => `icons/${match[1]}`)
  ]);
  referenced.forEach((file) => assert.ok(RELEASE_FILES.includes(file), file));
});

test("ZIP writer emits a valid archive header and end record", () => {
  const zip = createZip([
    { name: "manifest.json", data: Buffer.from('{"version":"1.5.0"}') },
    { name: "src/popup.html", data: Buffer.from("<!doctype html>") }
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 14), 2);
  assert.equal(zip.readUInt16LE(zip.length - 12), 2);
});
