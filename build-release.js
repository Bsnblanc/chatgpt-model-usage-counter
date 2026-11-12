const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = __dirname;
const DIST_ROOT = path.join(ROOT, "dist");
const FIXED_ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

const RELEASE_FILES = Object.freeze([
  "manifest.json",
  "_locales/de/messages.json",
  "_locales/en/messages.json",
  "_locales/es/messages.json",
  "_locales/fr/messages.json",
  "_locales/ja/messages.json",
  "_locales/ko/messages.json",
  "_locales/zh_CN/messages.json",
  "_locales/zh_TW/messages.json",
  "icons/action1-16.png",
  "icons/action1-20.png",
  "icons/action1-24.png",
  "icons/action1-32.png",
  "icons/action1-48.png",
  "icons/action16.png",
  "icons/action2-16.png",
  "icons/action2-20.png",
  "icons/action2-24.png",
  "icons/action2-32.png",
  "icons/action2-48.png",
  "icons/action20.png",
  "icons/action24.png",
  "icons/action32.png",
  "icons/action48.png",
  "icons/icon128.png",
  "icons/icon16.png",
  "icons/icon20.png",
  "icons/icon24.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "src/background.js",
  "src/content.js",
  "src/conversation-importer.js",
  "src/conversation-source.js",
  "src/dashboard.js",
  "src/detector.js",
  "src/exporter.js",
  "src/model-catalog.js",
  "src/popup.css",
  "src/popup.html",
  "src/popup.js"
]);

const FORBIDDEN_RELEASE_PATH_PARTS = Object.freeze([
  ".git",
  "node_modules",
  "tests",
  "tmp",
  "tmp-verify",
  "tmp-recovery",
  "dist",
  "leveldb",
  "cookies",
  "credentials",
  "browser-data"
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalizeReleasePath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function assertInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe release output path: ${candidate}`);
  }
}

function dosDateTime(date = FIXED_ZIP_DATE) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time =
    (date.getUTCHours() << 11) |
    (date.getUTCMinutes() << 5) |
    Math.floor(date.getUTCSeconds() / 2);
  const day =
    ((year - 1980) << 9) |
    ((date.getUTCMonth() + 1) << 5) |
    date.getUTCDate();
  return { time, day };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = dosDateTime();

  entries.forEach(({ name, data }) => {
    const nameBuffer = Buffer.from(name, "utf8");
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(day, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(day, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function walkFiles(directory) {
  const files = [];
  const visit = (current) => {
    fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .forEach((entry) => {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          visit(absolute);
        } else if (entry.isFile()) {
          files.push(normalizeReleasePath(path.relative(directory, absolute)));
        }
      });
  };
  visit(directory);
  return files;
}

function validateReleaseFiles(relativeFiles = RELEASE_FILES) {
  const normalized = relativeFiles.map(normalizeReleasePath);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Release allowlist contains duplicate paths.");
  }

  normalized.forEach((relativePath) => {
    if (
      !relativePath ||
      relativePath.startsWith("/") ||
      relativePath.includes("../") ||
      relativePath.includes("\\")
    ) {
      throw new Error(`Unsafe release path: ${relativePath}`);
    }
    const lower = relativePath.toLowerCase();
    if (FORBIDDEN_RELEASE_PATH_PARTS.some((part) =>
      lower === part || lower.startsWith(`${part}/`) || lower.includes(`/${part}/`)
    )) {
      throw new Error(`Forbidden release path: ${relativePath}`);
    }
    const absolute = path.join(ROOT, relativePath);
    if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`Missing release file: ${relativePath}`);
    }
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const referencedIcons = new Set([
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {})
  ]);
  referencedIcons.forEach((iconPath) => {
    if (!normalized.includes(normalizeReleasePath(iconPath))) {
      throw new Error(`Manifest icon is absent from the release allowlist: ${iconPath}`);
    }
  });
  return normalized.slice().sort((left, right) => left.localeCompare(right, "en"));
}

function buildRelease() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const version = String(manifest.version || "").trim();
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`Invalid manifest version: ${version}`);
  }

  const releaseFiles = validateReleaseFiles();
  fs.mkdirSync(DIST_ROOT, { recursive: true });
  const baseName = `chatgpt-model-usage-counter-v${version}`;
  const stagingRoot = path.join(DIST_ROOT, baseName);
  assertInside(DIST_ROOT, stagingRoot);
  fs.rmSync(stagingRoot, { recursive: true, force: true });
  fs.mkdirSync(stagingRoot, { recursive: true });

  const entries = releaseFiles.map((relativePath) => {
    const source = path.join(ROOT, relativePath);
    const destination = path.join(stagingRoot, ...relativePath.split("/"));
    assertInside(stagingRoot, destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    return {
      name: relativePath,
      data: fs.readFileSync(source)
    };
  });

  const stagedFiles = walkFiles(stagingRoot);
  if (JSON.stringify(stagedFiles) !== JSON.stringify(releaseFiles)) {
    throw new Error(`Staged release differs from the allowlist: ${JSON.stringify(stagedFiles)}`);
  }

  const zipBuffer = createZip(entries);
  const zipPath = path.join(DIST_ROOT, `${baseName}.zip`);
  const checksumPath = `${zipPath}.sha256`;
  const reportPath = path.join(DIST_ROOT, `${baseName}.manifest.json`);
  fs.writeFileSync(zipPath, zipBuffer);
  const sha256 = crypto.createHash("sha256").update(zipBuffer).digest("hex");
  fs.writeFileSync(checksumPath, `${sha256}  ${path.basename(zipPath)}\n`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({
      name: baseName,
      version,
      sha256,
      fileCount: releaseFiles.length,
      files: releaseFiles
    }, null, 2)}\n`
  );

  return {
    version,
    fileCount: releaseFiles.length,
    stagingRoot,
    zipPath,
    checksumPath,
    reportPath,
    sha256
  };
}

if (require.main === module) {
  console.log(JSON.stringify(buildRelease(), null, 2));
}

module.exports = {
  RELEASE_FILES,
  buildRelease,
  createZip,
  validateReleaseFiles,
  walkFiles
};
