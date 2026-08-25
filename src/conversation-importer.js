(function initConversationImporter(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }
  root.ChatGPTConversationImporter = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationImporterFactory(root) {
  "use strict";

  var MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
  var MAX_JSON_BYTES = 512 * 1024 * 1024;
  var MAX_CONVERSATIONS = 250000;
  var ZIP_LOCAL_FILE = 0x04034b50;
  var ZIP_CENTRAL_FILE = 0x02014b50;
  var ZIP_END = 0x06054b50;

  function importError(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  function toUint8Array(value) {
    if (value instanceof Uint8Array) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    throw importError("invalid-import-bytes", "The selected file could not be read.");
  }

  function readFileBytes(file) {
    if (!file) {
      return Promise.reject(importError("missing-import-file", "Select a ChatGPT data export file."));
    }
    var size = Number(file.size);
    if (Number.isFinite(size) && size > MAX_ARCHIVE_BYTES) {
      return Promise.reject(importError("import-file-too-large", "The selected file is larger than 512 MB."));
    }
    if (typeof file.arrayBuffer === "function") {
      return Promise.resolve(file.arrayBuffer()).then(toUint8Array);
    }
    var FileReaderCtor =
      (root && root.FileReader) ||
      (typeof FileReader !== "undefined" ? FileReader : null);
    if (!FileReaderCtor) {
      return Promise.reject(importError("file-reader-unavailable", "The selected file could not be read."));
    }
    return new Promise(function readWithFileReader(resolve, reject) {
      var reader = new FileReaderCtor();
      reader.onload = function loaded() {
        try {
          resolve(toUint8Array(reader.result));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = function failed() {
        reject(reader.error || importError("file-read-failed", "The selected file could not be read."));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function decodeUtf8(bytes) {
    var Decoder =
      (root && root.TextDecoder) ||
      (typeof TextDecoder !== "undefined" ? TextDecoder : null);
    if (!Decoder) {
      throw importError("text-decoder-unavailable", "UTF-8 decoding is unavailable.");
    }
    return new Decoder("utf-8", { fatal: true }).decode(bytes);
  }

  function crc32(bytes) {
    var table = crc32.table;
    if (!table) {
      table = [];
      for (var n = 0; n < 256; n += 1) {
        var value = n;
        for (var bit = 0; bit < 8; bit += 1) {
          value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[n] = value >>> 0;
      }
      crc32.table = table;
    }
    var crc = 0xffffffff;
    for (var index = 0; index < bytes.length; index += 1) {
      crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function findZipEnd(view) {
    var minimum = Math.max(0, view.byteLength - 65557);
    for (var offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === ZIP_END) {
        return offset;
      }
    }
    throw importError("invalid-zip", "The selected ZIP does not contain a valid directory.");
  }

  function zipEntries(bytes) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var endOffset = findZipEnd(view);
    var diskNumber = view.getUint16(endOffset + 4, true);
    var centralDisk = view.getUint16(endOffset + 6, true);
    var entriesOnDisk = view.getUint16(endOffset + 8, true);
    var entryCount = view.getUint16(endOffset + 10, true);
    var centralSize = view.getUint32(endOffset + 12, true);
    var centralOffset = view.getUint32(endOffset + 16, true);
    if (
      diskNumber !== 0 ||
      centralDisk !== 0 ||
      entriesOnDisk !== entryCount ||
      entryCount === 0xffff ||
      centralSize === 0xffffffff ||
      centralOffset === 0xffffffff
    ) {
      throw importError("unsupported-zip", "Multi-part and ZIP64 archives are not supported.");
    }
    if (centralOffset + centralSize > bytes.length) {
      throw importError("invalid-zip", "The ZIP directory extends beyond the selected file.");
    }

    var entries = [];
    var offset = centralOffset;
    for (var index = 0; index < entryCount; index += 1) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== ZIP_CENTRAL_FILE) {
        throw importError("invalid-zip", "The ZIP directory is incomplete.");
      }
      var flags = view.getUint16(offset + 8, true);
      var method = view.getUint16(offset + 10, true);
      var checksum = view.getUint32(offset + 16, true);
      var compressedSize = view.getUint32(offset + 20, true);
      var uncompressedSize = view.getUint32(offset + 24, true);
      var nameLength = view.getUint16(offset + 28, true);
      var extraLength = view.getUint16(offset + 30, true);
      var commentLength = view.getUint16(offset + 32, true);
      var localOffset = view.getUint32(offset + 42, true);
      var nameStart = offset + 46;
      var nameEnd = nameStart + nameLength;
      if (nameEnd > bytes.length) {
        throw importError("invalid-zip", "A ZIP filename is incomplete.");
      }
      var name = decodeUtf8(bytes.subarray(nameStart, nameEnd)).replace(/\\/g, "/");
      entries.push({
        name: name,
        flags: flags,
        method: method,
        checksum: checksum,
        compressedSize: compressedSize,
        uncompressedSize: uncompressedSize,
        localOffset: localOffset
      });
      offset = nameEnd + extraLength + commentLength;
    }
    return entries;
  }

  function inflateRaw(bytes) {
    var DecompressionStreamCtor =
      (root && root.DecompressionStream) ||
      (typeof DecompressionStream !== "undefined" ? DecompressionStream : null);
    var ResponseCtor =
      (root && root.Response) ||
      (typeof Response !== "undefined" ? Response : null);
    var BlobCtor =
      (root && root.Blob) ||
      (typeof Blob !== "undefined" ? Blob : null);
    if (!DecompressionStreamCtor || !ResponseCtor || !BlobCtor) {
      return Promise.reject(importError(
        "zip-decompression-unavailable",
        "This browser cannot decompress the selected ChatGPT export."
      ));
    }
    var stream;
    try {
      stream = new BlobCtor([bytes]).stream().pipeThrough(new DecompressionStreamCtor("deflate-raw"));
    } catch (error) {
      return Promise.reject(importError(
        "zip-decompression-unavailable",
        "This browser cannot decompress the selected ChatGPT export."
      ));
    }
    return new ResponseCtor(stream).arrayBuffer().then(function inflated(buffer) {
      return new Uint8Array(buffer);
    });
  }

  function readZipEntry(bytes, entry) {
    if (entry.flags & 1) {
      return Promise.reject(importError("encrypted-zip", "Encrypted ZIP files are not supported."));
    }
    if (entry.uncompressedSize > MAX_JSON_BYTES) {
      return Promise.reject(importError("import-json-too-large", "conversations.json is larger than 512 MB."));
    }
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var localOffset = entry.localOffset;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== ZIP_LOCAL_FILE) {
      return Promise.reject(importError("invalid-zip", "The conversations.json entry is invalid."));
    }
    var localNameLength = view.getUint16(localOffset + 26, true);
    var localExtraLength = view.getUint16(localOffset + 28, true);
    var dataStart = localOffset + 30 + localNameLength + localExtraLength;
    var dataEnd = dataStart + entry.compressedSize;
    if (dataStart < 0 || dataEnd > bytes.length) {
      return Promise.reject(importError("invalid-zip", "The conversations.json data is incomplete."));
    }
    var compressed = bytes.subarray(dataStart, dataEnd);
    var output;
    if (entry.method === 0) {
      output = Promise.resolve(new Uint8Array(compressed));
    } else if (entry.method === 8) {
      output = inflateRaw(compressed);
    } else {
      output = Promise.reject(importError(
        "unsupported-zip-compression",
        "The conversations.json compression method is not supported."
      ));
    }
    return output.then(function verify(uncompressed) {
      if (uncompressed.length !== entry.uncompressedSize) {
        throw importError("invalid-zip-size", "The conversations.json size does not match the ZIP directory.");
      }
      if (crc32(uncompressed) !== entry.checksum) {
        throw importError("invalid-zip-checksum", "The conversations.json checksum is invalid.");
      }
      return uncompressed;
    });
  }

  function conversationsJsonBytes(bytes, filename) {
    var cleanName = String(filename || "").toLowerCase();
    var looksLikeZip =
      /\.zip$/i.test(cleanName) ||
      (bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === ZIP_LOCAL_FILE);
    if (!looksLikeZip) {
      if (bytes.length > MAX_JSON_BYTES) {
        return Promise.reject(importError("import-json-too-large", "conversations.json is larger than 512 MB."));
      }
      return Promise.resolve(bytes);
    }
    var candidates = zipEntries(bytes).filter(function isConversationsJson(entry) {
      return /(^|\/)conversations\.json$/i.test(entry.name) && !/\/__macosx\//i.test("/" + entry.name);
    }).sort(function shortestPath(left, right) {
      return left.name.split("/").length - right.name.split("/").length ||
        left.name.length - right.name.length;
    });
    if (!candidates.length) {
      return Promise.reject(importError(
        "conversations-json-missing",
        "The selected ChatGPT export does not contain conversations.json."
      ));
    }
    return readZipEntry(bytes, candidates[0]);
  }

  function safeText(value, maxLength) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLength || 240);
  }

  function explicitHierarchy(raw) {
    var source = raw && typeof raw === "object" ? raw : {};
    var project = source.project && typeof source.project === "object" ? source.project : {};
    var folder = source.folder && typeof source.folder === "object" ? source.folder : {};
    var projectId = safeText(
      source.project_id || source.projectId || project.id || project.project_id,
      180
    );
    var projectName = projectId
      ? safeText(
          source.project_name ||
          source.projectName ||
          source.project_title ||
          source.projectTitle ||
          project.name ||
          project.title,
          240
        )
      : "";
    var folderId = projectId
      ? ""
      : safeText(source.folder_id || source.folderId || folder.id || folder.folder_id, 180);
    var folderName = folderId
      ? safeText(
          source.folder_name ||
          source.folderName ||
          source.folder_title ||
          source.folderTitle ||
          folder.name ||
          folder.title,
          240
        )
      : "";
    return {
      projectId: projectId,
      projectName: projectName,
      folderId: folderId,
      folderName: folderName,
      groupType: projectId ? "project" : folderId ? "folder" : ""
    };
  }

  function payloadConversations(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (payload && Array.isArray(payload.conversations)) {
      return payload.conversations;
    }
    throw importError(
      "invalid-conversations-json",
      "The selected file is not a supported ChatGPT conversations export."
    );
  }

  function normalizePayload(payload, exporter) {
    if (!exporter || typeof exporter.normalizeConversations !== "function") {
      throw importError("exporter-unavailable", "The conversation parser is unavailable.");
    }
    var rawList = payloadConversations(payload);
    if (rawList.length > MAX_CONVERSATIONS) {
      throw importError("too-many-conversations", "The export contains more than 250,000 conversations.");
    }
    var seen = {};
    var normalized = [];
    rawList.forEach(function normalizeOne(raw, index) {
      var item = exporter.normalizeConversations([raw])[0];
      if (!item) {
        return;
      }
      var id = safeText(item.id, 180) || "imported-" + String(index + 1);
      if (seen[id]) {
        return;
      }
      seen[id] = true;
      var hierarchy = explicitHierarchy(raw);
      normalized.push(Object.assign({}, item, hierarchy, {
        id: id,
        title: safeText(item.title, 500) || "ChatGPT conversation",
        source: "official-data-export",
        archived: Boolean(raw && (raw.is_archived || raw.archived))
      }));
    });
    return normalized;
  }

  function parseOfficialExportBytes(bytes, filename, options) {
    var data = toUint8Array(bytes);
    if (data.length > MAX_ARCHIVE_BYTES) {
      return Promise.reject(importError("import-file-too-large", "The selected file is larger than 512 MB."));
    }
    var exporter =
      options && options.exporter ||
      (root && root.ChatGPTUsageExporter);
    return conversationsJsonBytes(data, filename).then(function parseJson(jsonBytes) {
      var payload;
      try {
        payload = JSON.parse(decodeUtf8(jsonBytes));
      } catch (error) {
        throw importError(
          "invalid-conversations-json",
          "conversations.json is not valid UTF-8 JSON."
        );
      }
      return {
        conversations: normalizePayload(payload, exporter),
        sourceName: safeText(filename, 260) || "conversations.json",
        jsonBytes: jsonBytes.length
      };
    });
  }

  function parseOfficialExportFile(file, options) {
    return readFileBytes(file).then(function parse(bytes) {
      return parseOfficialExportBytes(bytes, file && file.name, options);
    });
  }

  return {
    MAX_ARCHIVE_BYTES: MAX_ARCHIVE_BYTES,
    MAX_JSON_BYTES: MAX_JSON_BYTES,
    parseOfficialExportBytes: parseOfficialExportBytes,
    parseOfficialExportFile: parseOfficialExportFile,
    _test: {
      crc32: crc32,
      explicitHierarchy: explicitHierarchy,
      zipEntries: zipEntries
    }
  };
});
