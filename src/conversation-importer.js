(function initConversationImporter(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ChatGPTConversationImporter = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationImporterFactory() {
  "use strict";

  // Official ChatGPT data exports are parsed locally, without account-history
  // requests. Bound memory use before parsing untrusted ZIP/JSON input.
  var MAX_ARCHIVE_SIZE = 512 * 1024 * 1024;
  var MAX_JSON_SIZE = 256 * 1024 * 1024;
  var MAX_ZIP_ENTRIES = 50000;

  function checkedBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    throw new TypeError("Expected an ArrayBuffer or Uint8Array.");
  }

  function read16(bytes, offset) {
    if (offset < 0 || offset + 2 > bytes.length) throw new Error("Invalid ZIP boundaries.");
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function read32(bytes, offset) {
    if (offset < 0 || offset + 4 > bytes.length) throw new Error("Invalid ZIP boundaries.");
    return (bytes[offset] | (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function decode(bytes) {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  function endOfDirectory(bytes) {
    for (var offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 65535); offset -= 1) {
      if (read32(bytes, offset) === 0x06054b50 &&
          offset + 22 + read16(bytes, offset + 20) === bytes.length) {
        return offset;
      }
    }
    throw new Error("Invalid ZIP end-of-directory.");
  }

  function findConversationsEntry(bytes) {
    var end = endOfDirectory(bytes);
    if (read16(bytes, end + 4) !== 0 || read16(bytes, end + 6) !== 0) {
      throw new Error("Multi-disk ZIP archives are not supported.");
    }
    var count = read16(bytes, end + 10);
    var size = read32(bytes, end + 12);
    var offset = read32(bytes, end + 16);
    if (count > MAX_ZIP_ENTRIES || count === 0xffff || size === 0xffffffff || offset === 0xffffffff ||
        offset + size > end) throw new Error("ZIP directory is unsupported or invalid.");
    var found = null;
    var cursor = offset;
    for (var i = 0; i < count; i += 1) {
      if (read32(bytes, cursor) !== 0x02014b50) throw new Error("Invalid ZIP directory entry.");
      var flags = read16(bytes, cursor + 8);
      var method = read16(bytes, cursor + 10);
      var compressedSize = read32(bytes, cursor + 20);
      var unpackedSize = read32(bytes, cursor + 24);
      var nameLength = read16(bytes, cursor + 28);
      var extraLength = read16(bytes, cursor + 30);
      var commentLength = read16(bytes, cursor + 32);
      var localOffset = read32(bytes, cursor + 42);
      var next = cursor + 46 + nameLength + extraLength + commentLength;
      if (next > offset + size) throw new Error("Invalid ZIP directory boundary.");
      var name = decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, "/");
      var parts = name.split("/");
      if (parts[parts.length - 1] === "conversations.json" && !parts.includes("..")) {
        if (found) throw new Error("ZIP contains multiple conversations.json entries.");
        if (flags & 1) throw new Error("Encrypted ZIP entries are unsupported.");
        if (method !== 0 && method !== 8) throw new Error("Unsupported ZIP compression.");
        if (compressedSize === 0xffffffff || unpackedSize === 0xffffffff ||
            unpackedSize > MAX_JSON_SIZE) throw new Error("Conversation export exceeds safe size limit.");
        found = { method: method, compressedSize: compressedSize,
          unpackedSize: unpackedSize, localOffset: localOffset };
      }
      cursor = next;
    }
    if (!found) throw new Error("ZIP does not contain conversations.json.");
    if (read32(bytes, found.localOffset) !== 0x04034b50) throw new Error("Missing ZIP file header.");
    var dataStart = found.localOffset + 30 +
      read16(bytes, found.localOffset + 26) + read16(bytes, found.localOffset + 28);
    if (dataStart + found.compressedSize > bytes.length ||
        dataStart + found.compressedSize > offset) throw new Error("Invalid ZIP entry data.");
    found.data = bytes.subarray(dataStart, dataStart + found.compressedSize);
    return found;
  }

  async function inflateRaw(compressed) {
    // DecompressionStream works in Chrome MV3 and modern Node; read in chunks
    // to enforce the size cap even if a ZIP falsely advertises a small size.
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser does not support ZIP decompression.");
    }
    var stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    var reader = stream.getReader();
    var chunks = [];
    var total = 0;
    try {
      while (true) {
        var result = await reader.read();
        if (result.done) break;
        total += result.value.length;
        if (total > MAX_JSON_SIZE) {
          await reader.cancel();
          throw new Error("Conversation export exceeds safe size limit.");
        }
        chunks.push(result.value);
      }
    } finally {
      reader.releaseLock();
    }
    var output = new Uint8Array(total);
    var cursor = 0;
    chunks.forEach(function append(chunk) {
      output.set(chunk, cursor);
      cursor += chunk.length;
    });
    return output;
  }

  async function extractOfficialJson(bytes) {
    var entry = findConversationsEntry(bytes);
    var output = entry.method === 0 ? entry.data : await inflateRaw(entry.data);
    if (output.length !== entry.unpackedSize) throw new Error("ZIP entry size is inconsistent.");
    return output;
  }

  function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function normalizeOfficialExport(data, exporter) {
    if (!exporter || typeof exporter.normalizeConversations !== "function") {
      throw new Error("Conversation exporter is unavailable.");
    }
    if (!Array.isArray(data)) throw new Error("Official export must contain a conversations array.");
    var normalized = exporter.normalizeConversations(data);
    return normalized.map(function withHierarchy(conversation, index) {
      var source = data[index] || {};
      var project = source.project && typeof source.project === "object" ? source.project : {};
      var projectId = cleanText(source.project_id || source.projectId || project.id, 160);
      var folderId = projectId ? "" : cleanText(source.folder_id || source.folderId, 160);
      return Object.assign({}, conversation, {
        source: "official-data-export",
        archived: Boolean(source.is_archived || source.archived),
        projectId: projectId,
        projectName: projectId ? cleanText(source.project_name || source.projectName || project.name, 240) : "",
        folderId: folderId,
        folderName: folderId ? cleanText(source.folder_name || source.folderName, 240) : ""
      });
    });
  }

  async function parseOfficialExportBytes(input, filename, options) {
    var bytes = checkedBytes(input);
    if (bytes.length > MAX_ARCHIVE_SIZE) throw new Error("Conversation export archive exceeds safe size limit.");
    var isZip = bytes.length >= 4 && read32(bytes, 0) === 0x04034b50;
    var jsonBytes = isZip ? await extractOfficialJson(bytes) : bytes;
    if (jsonBytes.length > MAX_JSON_SIZE) throw new Error("Conversation export exceeds safe size limit.");
    var data;
    try {
      data = JSON.parse(decode(jsonBytes));
    } catch (error) {
      throw new Error("Official conversation JSON is invalid: " + String(error && error.message || error));
    }
    return {
      conversations: normalizeOfficialExport(data, options && options.exporter),
      sourceName: cleanText(filename, 256) || (isZip ? "chatgpt-export.zip" : "conversations.json")
    };
  }

  async function parseOfficialExportFile(file, options) {
    if (!file || typeof file.arrayBuffer !== "function") throw new TypeError("A local File is required.");
    if (file.size > MAX_ARCHIVE_SIZE) throw new Error("Conversation export archive exceeds safe size limit.");
    return parseOfficialExportBytes(await file.arrayBuffer(), file.name, options);
  }

  return {
    parseOfficialExportBytes: parseOfficialExportBytes,
    parseOfficialExportFile: parseOfficialExportFile
  };
});
