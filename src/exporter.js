(function initUsageExporter(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTUsageExporter = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function exporterFactory(root) {
  "use strict";

  var JSON_MIME = "application/json;charset=utf-8";
  var MD_MIME = "text/markdown;charset=utf-8";
  var DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  var PDF_MIME = "application/pdf";
  var PNG_MIME = "image/png";
  var ZIP_MIME = "application/zip";
  var SVG_MIME = "image/svg+xml;charset=utf-8";
  var PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  var MIME = {
    json: JSON_MIME,
    markdown: MD_MIME,
    md: MD_MIME,
    html: "text/html;charset=utf-8",
    printHtml: "text/html;charset=utf-8",
    docxHtml: "application/msword;charset=utf-8",
    docx: DOCX_MIME,
    svg: SVG_MIME,
    image: PNG_MIME,
    png: PNG_MIME,
    pdf: PDF_MIME,
    zip: ZIP_MIME
  };
  var FEATURE_ONLY_MODEL_RE = /^(agent[_-]?mode|deep[_-]?(?:research|search)|image[_-]?generation|web[_-]?search|search|realtime|audio|voice|canvas)(?:[_-]?v\d+)?$/i;
  var modelCatalog = root.ChatGPTModelCatalog;
  if (!modelCatalog && typeof require === "function") {
    try {
      modelCatalog = require("./model-catalog");
    } catch (_) {
      modelCatalog = null;
    }
  }

  function normalizeText(value) {
    return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function normalizeContentText(value) {
    var lines = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) {
      lines.shift();
    }
    while (lines.length && !lines[lines.length - 1].trim()) {
      lines.pop();
    }
    return lines.join("\n");
  }

  function normalizeModelValue(value) {
    var clean = String(value || "")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/_+/g, "-")
      .trim()
      .toLowerCase();
    // 保留次版本号:gpt-5-5-thinking 不再折叠为 gpt-5-thinking(它们是 ChatGPT 的不同模型)。
    return clean;
  }

  function isValidExportModel(value) {
    var clean = normalizeModelValue(value);
    if (!clean) {
      return false;
    }
    if (/^unknown(?:[-_ ]?model)?$/.test(clean) || clean === "unresolved-model" || /^(?:gpt-)?lastusedmodel$/.test(clean)) {
      return false;
    }
    if (FEATURE_ONLY_MODEL_RE.test(clean)) {
      return false;
    }
    if (modelCatalog && typeof modelCatalog.isRequestModelSlug === "function") {
      return modelCatalog.isRequestModelSlug(clean);
    }
    if (modelCatalog && typeof modelCatalog.isModelSlug === "function") {
      return modelCatalog.isModelSlug(clean);
    }
    if (/^(?:gpt|o\d+|chat-latest|future-family)/.test(clean)) {
      return true;
    }
    return /[-_.](thinking|instant|fast|auto|pro)$/i.test(clean);
  }

  function sanitizeExportModel(value) {
    return isValidExportModel(value) ? normalizeModelValue(value) : "";
  }

  function firstValidExportModel(candidates) {
    for (var i = 0; i < candidates.length; i += 1) {
      var clean = sanitizeExportModel(candidates[i]);
      if (clean) {
        return clean;
      }
    }
    return "";
  }

  function safeName(value) {
    var clean = String(value || "chatgpt-export")
      .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 80)
      .replace(/[. ]+$/g, "");
    if (!clean || /^\.+$/.test(clean)) {
      return "chatgpt-export";
    }
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) {
      clean = "_" + clean;
    }
    return clean;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeXml(value) {
    return escapeHtml(String(value || "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")).replace(/'/g, "&apos;");
  }

  function isoTime(value) {
    if (!value) {
      return "";
    }
    if (typeof value === "number") {
      var milliseconds = value > 100000000000 ? value : value * 1000;
      var date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
    return String(value);
  }

  function messageText(message) {
    if (!message || typeof message !== "object") {
      return "";
    }
    if (typeof message.text === "string") {
      return normalizeContentText(message.text);
    }
    if (typeof message.content === "string") {
      return normalizeContentText(message.content);
    }
    if (message.content && typeof message.content.text === "string") {
      return normalizeContentText(message.content.text);
    }
    if (message.content && Array.isArray(message.content.parts)) {
      return normalizeContentText(
        message.content.parts
          .map(function partText(part) {
            if (typeof part === "string") {
              return part;
            }
            if (part && typeof part.text === "string") {
              return part.text;
            }
            if (part && typeof part.content === "string") {
              return part.content;
            }
            return "";
          })
          .join("\n")
      );
    }
    return "";
  }

  function messageRole(message) {
    return String(
      (message && message.role) ||
        (message && message.author && message.author.role) ||
        (message && message.authorName) ||
        "message"
    );
  }

  function normalizedRoleKey(role) {
    return String(role || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function normalizedContentType(value) {
    return String(value || "").replace(/[\s-]+/g, "_").trim().toLowerCase();
  }

  function isHumanTranscriptRole(role) {
    var clean = normalizedRoleKey(role);
    return clean === "user" || clean === "assistant";
  }

  function isInternalContentType(contentType) {
    return /^(code|execution_output|tool|tool_result|tether_quote|system_context)$/.test(normalizedContentType(contentType));
  }

  function isInternalTranscriptText(text) {
    var value = String(text || "");
    return /make sure to include[\s\S]{0,160}filecite/i.test(value) ||
      /all the files uploaded by the user have been fully loaded/i.test(value);
  }

  function markdownTableColumnCount(row) {
    var value = String(row || "").trim();
    if (!/^\|/.test(value)) {
      return 0;
    }
    var cells = value.split("|");
    if (cells[0] === "") {
      cells.shift();
    }
    if (cells[cells.length - 1] === "") {
      cells.pop();
    }
    return cells.length;
  }

  function isMarkdownTableDivider(row) {
    var value = String(row || "").trim();
    return /^\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?$/.test(value);
  }

  function normalizeMarkdownTableOverflow(text) {
    var lines = String(text || "").split("\n");
    var normalized = [];
    var activeColumnCount = 0;

    lines.forEach(function normalizeLine(line, index) {
      var previous = index > 0 ? lines[index - 1] : "";
      var trimmed = String(line || "").trim();

      if (isMarkdownTableDivider(trimmed)) {
        activeColumnCount = markdownTableColumnCount(previous);
        normalized.push(line);
        return;
      }

      if (!/^\|/.test(trimmed)) {
        activeColumnCount = 0;
        normalized.push(line);
        return;
      }

      if (!activeColumnCount) {
        normalized.push(line);
        return;
      }

      var parts = trimmed.split("|");
      if (parts[0] === "") {
        parts.shift();
      }
      var hasTrailingPipe = parts[parts.length - 1] === "";
      if (hasTrailingPipe) {
        parts.pop();
      }

      if (parts.length <= activeColumnCount) {
        normalized.push(line);
        return;
      }

      normalized.push("| " + parts.slice(0, activeColumnCount).map(function trimCell(cell) {
        return cell.trim();
      }).join(" | ") + " |");
      normalized.push("");
      normalized.push(parts.slice(activeColumnCount).join("|").trim());
      activeColumnCount = 0;
    });

    return normalized.join("\n");
  }

  function restoreReadableTranscriptStructure(text) {
    var value = String(text || "");
    if (!value) {
      return "";
    }
    return normalizeMarkdownTableOverflow(value
      .replace(/([^\n])([ \t]+)(#{1,6}[ \t]+[^#\n])/g, function beforeHeading(match, prefix, spaces, heading) {
        return prefix + "\n\n" + heading;
      })
      .replace(/([^\n])([ \t]+)(\|[^\n|]+(?:\|[^\n|]+){2,}\|?\n\|[ \t:|\-]+\|?)/g, function beforeInlineTable(match, prefix, spaces, tableStart) {
        return prefix + "\n\n" + tableStart;
      })
      .replace(/(#{1,6}[ \t]+[^|\n]+)[ \t]+(\|[^\n]+)/g, function tableAfterHeading(match, heading, row) {
        return heading.trimEnd() + "\n" + row;
      })
      .replace(/\|[ \t]+\|/g, "|\n|")
      .replace(/^(#{1,6}[ \t]+(?:需求复述|关键结论|直接选择|最终答案|最终建议|结论|关键定义|依据与推理|更合理的预测区间|关键注意|注意|建议|置信度|自检))[ \t]+([^\n]+)$/gm, function splitKnownHeading(match, heading, content) {
        return heading + "\n" + content;
      })
      .replace(/([^\n])([ \t]+)(置信度[：:])/g, function beforeConfidence(match, prefix, spaces, label) {
        return prefix + "\n" + label;
      })
      .replace(/([^\n])([ \t]+)(>[ \t]+[^\n])/g, function beforeQuote(match, prefix, spaces, quote) {
        return prefix + "\n" + quote;
      })
      .replace(/([^\n])([ \t]+)(\d+\.[ \t]+\*\*)/g, function beforeBoldNumberedItem(match, prefix, spaces, item) {
        return prefix + "\n" + item;
      })
      .replace(/([.!?;:])([ \t]+)(\d+\.[ \t]+[A-Z])/g, function beforeNumberedItem(match, prefix, spaces, item) {
        return prefix + "\n" + item;
      })
      .replace(/([.!?\u3002\uff01\uff1f])([ \t]+)(\*\*[^*\n]{2,80}\*\*)/g, function beforeBoldSentence(match, prefix, spaces, sentence) {
        return prefix + "\n\n" + sentence;
      })
      .replace(/\n{3,}/g, "\n\n"))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function stripInternalContentBoundaryWrappers(text) {
    var value = normalizeContentText(text);
    if (!/Content boundary\s*:/i.test(value)) {
      return value;
    }
    value = value.replace(/(^|\n)[ \t]*(?:Content:[ \t]*\n+)?[ \t]*Content boundary:\s*BEGIN[ \t]*\n+```text[ \t]*\n([\s\S]*?)\n```[ \t]*\n+Content boundary:\s*END[ \t]*(?=\n|$)/gi, function unwrapBoundaryBlock(match, prefix, content) {
      return prefix + normalizeContentText(content);
    });
    value = value.replace(/(^|\n|\b)(?:Content:\s*)?Content boundary:\s*BEGIN\s+```text\s+([\s\S]*?)\s+```\s+Content boundary:\s*END(?=\n|$|\b)/gi, function unwrapInlineBoundaryBlock(match, prefix, content) {
      return prefix + normalizeContentText(content);
    });
    return value
      .replace(/(^|\n)[ \t]*Content:[ \t]*(?=\n+[ \t]*Content boundary:\s*BEGIN\b)/gi, "$1")
      .replace(/(^|\n)[ \t]*Content boundary:\s*(?:BEGIN|END)[ \t]*(?=\n|$)/gi, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sanitizeTranscriptText(text) {
    return restoreReadableTranscriptStructure(stripInternalContentBoundaryWrappers(normalizeContentText(text)
      .replace(/[ \t]*\uE200filecite\uE202turn\d+file\d+\uE201[ \t]*/gi, " ")
      .replace(/[ \t]*\uE200[^\uE200\uE201]*(?:filecite|turn\d+file\d+)[^\uE200\uE201]*\uE201[ \t]*/gi, " ")
      .replace(/[ \t]*\uE200[^\uE200\uE201]*?\bcite\b[^\uE200\uE201]*?\uE201[ \t]*/gi, " ")
      .replace(/[ \t]*\uE200[^\uE200\uE201]*?\uE201[ \t]*/g, " ")
      .replace(/[ \t]*\bfilecite\b[^\n\r\uE200\uE201\uE202]*\bturn\d+file\d+\b[ \t]*/gi, " ")
      .replace(/[ \t]*\bturn\d+file\d+\b[^\n\r\uE200\uE201\uE202]*\bfilecite\b[ \t]*/gi, " ")
      .replace(/[ \t]*\bfilecite\b[ \t]*/gi, " ")
      .replace(/[ \t]*\bturn\d+(?:file|search|view)\d+\b[ \t]*/gi, " ")
      .replace(/[\uE200-\uE202]/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()));
  }

  function shouldExportTranscriptMessage(message) {
    if (!message || !isHumanTranscriptRole(message.role)) {
      return false;
    }
    if (isInternalContentType(message.contentType)) {
      return false;
    }
    var text = String(message.text || message.content || "");
    if (!text.trim() || isInternalTranscriptText(text)) {
      return false;
    }
    return true;
  }

  function mappingNodeIds(mapping, currentNodeId) {
    var current = String(currentNodeId || "");
    if (!current || !mapping[current]) {
      return Object.keys(mapping);
    }
    var ids = [];
    var seen = {};
    while (current && mapping[current] && !seen[current]) {
      seen[current] = true;
      ids.push(current);
      current = String((mapping[current] && mapping[current].parent) || "");
    }
    return ids.reverse();
  }

  function mappingMessages(mapping, currentNodeId) {
    if (!mapping || typeof mapping !== "object") {
      return [];
    }
    var followsCurrentBranch = Boolean(currentNodeId && mapping[String(currentNodeId)]);
    return mappingNodeIds(mapping, currentNodeId)
      .map(function fromNode(nodeId, index) {
        var node = mapping[nodeId] || {};
        var message = node.message || {};
        var createdAt = isoTime(message.create_time || message.createTime || message.createdAt);
        var text = sanitizeTranscriptText(messageText(message));
        var exportMetadata = exportMessageMetadata(message);
        return {
          id: message.id || nodeId,
          role: messageRole(message),
          authorName: messageRole(message),
          createTime: createdAt,
          createdAt: createdAt,
          contentType: String((message.content && message.content.content_type) || "text"),
          model: exportMetadata.model,
          modelCandidatePresent: exportMetadata.modelCandidatePresent,
          parameters: exportMetadata.parameters,
          features: exportMetadata.features,
          content: text,
          text: text,
          orderIndex: index
        };
      })
      .filter(function hasContent(message) {
        return message.content;
      })
      .filter(shouldExportTranscriptMessage)
      .sort(function byTime(a, b) {
        if (followsCurrentBranch) {
          return a.orderIndex - b.orderIndex;
        }
        var timeOrder = String(a.createdAt).localeCompare(String(b.createdAt));
        return timeOrder || a.orderIndex - b.orderIndex;
      })
      .map(function removeInternalOrder(message) {
        delete message.orderIndex;
        return message;
      });
  }

  function normalizeConversation(conversation) {
    var messages = conversation && conversation.mapping
      ? mappingMessages(conversation.mapping, conversation.current_node || conversation.currentNode)
      : Array.isArray(conversation && conversation.messages)
        ? conversation.messages.map(function normalizeMessage(message, index) {
            var text = sanitizeTranscriptText(messageText(message));
            var createdAt = isoTime(
              (message && message.create_time) ||
                (message && message.createTime) ||
                (message && message.createdAt)
            );
            var exportMetadata = exportMessageMetadata(message);
            return {
              id: String((message && message.id) || index),
              role: messageRole(message),
              authorName: String((message && message.authorName) || messageRole(message)),
              createTime: createdAt,
              createdAt: createdAt,
              updateTime: isoTime(message && (message.update_time || message.updateTime || message.updatedAt)),
              contentType: String((message && (message.contentType || (message.content && message.content.content_type))) || "text"),
              model: exportMetadata.model,
              modelCandidatePresent: exportMetadata.modelCandidatePresent,
              parameters: exportMetadata.parameters,
              features: exportMetadata.features,
              content: text,
              text: text
            };
          })
        : [];
    var exportMessages = fillMissingAssistantModels(messages.filter(shouldExportTranscriptMessage));
    var createdAt = isoTime(
      (conversation && conversation.create_time) ||
        (conversation && conversation.createTime) ||
        (conversation && conversation.createdAt)
    );
    var updatedAt = isoTime(
      (conversation && conversation.update_time) ||
        (conversation && conversation.updateTime) ||
        (conversation && conversation.updatedAt)
    );

    return {
      id: String((conversation && (conversation.id || conversation.conversation_id || conversation.conversationId)) || ""),
      title: normalizeText((conversation && conversation.title) || "ChatGPT conversation"),
      url: String((conversation && (conversation.url || conversation.conversationUrl)) || ""),
      createTime: createdAt,
      createdAt: createdAt,
      updateTime: updatedAt,
      updatedAt: updatedAt,
      time: {
        createTime: createdAt,
        updateTime: updatedAt
      },
      source: String((conversation && conversation.source) || ""),
      messages: exportMessages
    };
  }

  function normalizeConversations(conversations) {
    if (!Array.isArray(conversations)) {
      throw new Error("conversations must be an array");
    }
    return (Array.isArray(conversations) ? conversations : [conversations])
      .filter(Boolean)
      .map(normalizeConversation)
      .filter(function hasMessages(conversation) {
        return conversation.id || conversation.messages.length > 0;
      });
  }

  function buildJson(conversations, options) {
    var normalized = normalizeConversations(conversations);
    var publicConversations = normalized.map(publicConversation);
    var featureUsage = featureUsageSummary(normalized);
    return JSON.stringify(
      {
        title: exportTitle(options),
        exportedAt: exportTimestampRaw(options),
        generatedBy: {
          name: EXPORT_PROMO_NAME,
          url: EXPORT_PROMO_URL,
          description: EXPORT_PROMO_DESC
        },
        formatVersion: 3,
        conversationCount: normalized.length,
        messageCount: normalized.reduce(function countMessages(total, conversation) {
          return total + conversation.messages.length;
        }, 0),
        featureUsage: featureUsage,
        conversations: publicConversations
      },
      null,
      2
    );
  }

  function roleLabel(role) {
    var clean = String(role || "message").replace(/\s+/g, " ").trim().toLowerCase();
    if (clean === "user") return "User";
    if (clean === "assistant") return "Assistant";
    if (clean === "system") return "System";
    if (clean === "tool") return "Tool";
    return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Message";
  }

  // 导出按"聊天记录"而非字段表来排版:说话人显示名 + 左右分栏(用户靠右、助手靠左)。
  function speakerName(role) {
    var clean = normalizedRoleKey(role);
    if (clean === "user") return "你";
    if (clean === "assistant") return "ChatGPT";
    if (clean === "system") return "系统";
    if (clean === "tool") return "工具";
    return roleLabel(role);
  }

  function isUserMessage(role) {
    return normalizedRoleKey(role) === "user";
  }

  // 一条消息只保留有信息量的附注:模型 + 功能(助手消息才有);ID / Role / 时间一律省略。
  function messageFootnote(message) {
    if (!message || normalizedRoleKey(message.role) !== "assistant") {
      return "";
    }
    var parts = [];
    if (hasModel(message.model)) { parts.push(modelSummary(message.model)); }
    if (hasFeatures(message.features)) { parts.push(featureDisplay(message.features)); }
    return parts.join(" · ");
  }

  function markdownTableValue(value) {
    return String(value || "")
      .replace(/\|/g, "\\|")
      .replace(/\r?\n/g, "<br>");
  }

  function parameterAlias(key, parent) {
    var clean = String(key || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
    var cleanParent = String(parent || "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
    if (/^(model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|default_model_slug|defaultmodelslug)$/.test(clean)) {
      return "model";
    }
    if (clean === "reasoning_effort" || (clean === "effort" && cleanParent === "reasoning")) {
      return "reasoning.effort";
    }
    if (clean === "verbosity" && cleanParent === "text") {
      return "text.verbosity";
    }
    if (/^(max_output_tokens|max_completion_tokens|max_response_output_tokens)$/.test(clean)) {
      return "max_output_tokens";
    }
    if (clean === "top_p" || clean === "topp") {
      return "top_p";
    }
    if (clean === "tool_choice" || clean === "toolchoice") {
      return "tool_choice";
    }
    if (clean === "response_format" || clean === "responseformat") {
      return "response_format";
    }
    if (clean === "image_generation_options" || clean === "imagegenerationoptions") {
      return "image_generation_options";
    }
    if (clean === "web_search_options" || clean === "websearchoptions") {
      return "web_search_options";
    }
    return clean;
  }

  function shouldCollectParameterKey(key) {
    return /^(model|temperature|top_p|top_k|top_logprobs|logprobs|logit_bias|frequency_penalty|presence_penalty|max_tokens|max_output_tokens|max_tool_calls|seed|n|stop|tools|tool_choice|parallel_tool_calls|response_format|modalities|voice|speed|service_tier|store|truncation|include|reasoning|reasoning\.effort|text|text\.verbosity|audio|prediction|input_audio_format|output_audio_format|input_audio_transcription|turn_detection|web_search_options|image_generation_options|(?:reasoning|text|audio|prediction|response_format|tools|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)\.[a-z0-9_.]+)$/.test(key);
  }

  function shouldDescendParameterKey(key) {
    return /^(reasoning|text|audio|prediction|response_format|tools|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/.test(key);
  }

  function collectExportParameters(value, out, path, depth) {
    if (!value || typeof value !== "object" || depth > 5) {
      return;
    }
    Object.keys(value).forEach(function collect(key) {
      var raw = value[key];
      if (raw === null || typeof raw === "undefined") {
        return;
      }
      var parent = path.length ? path[path.length - 1] : "";
      var cleanKey = parameterAlias(key, parent);
      var qualifiedKey = parent && shouldDescendParameterKey(parent) && cleanKey.indexOf(".") === -1 ? parent + "." + cleanKey : cleanKey;
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        if (!path.length && cleanKey === "text") {
          return;
        }
        if (shouldCollectParameterKey(qualifiedKey)) {
          out[qualifiedKey] = raw;
        }
        return;
      }
      if (Array.isArray(raw)) {
        if (shouldCollectParameterKey(qualifiedKey) && raw.length <= 12) {
          out[qualifiedKey] = raw.map(function scalar(item) {
            return typeof item === "object" ? JSON.stringify(item) : item;
          }).join(", ");
        }
        raw.slice(0, 12).forEach(function descend(item) {
          collectExportParameters(item, out, path.concat(cleanKey), depth + 1);
        });
        return;
      }
      if (shouldDescendParameterKey(cleanKey) || cleanKey === "parameters" || cleanKey === "model_parameters" || cleanKey === "metadata") {
        collectExportParameters(raw, out, path.concat(cleanKey === "parameters" || cleanKey === "model_parameters" || cleanKey === "metadata" ? "" : cleanKey).filter(Boolean), depth + 1);
      }
    });
  }

  function detectExportFeatures(value, features, depth) {
    if (!value || depth > 4) {
      return;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      var text = String(value).toLowerCase();
      if (/image[_\-\s]?generation|gpt[_\-\s]?image|dall[_\-\s]?e/.test(text)) features.image_generation = true;
      if (/deep[_\-\s]?(research|search)|deepsearch/.test(text)) features.deep_research = true;
      if (/agent[_\-\s]?mode|agentic/.test(text)) features.agent_mode = true;
      if (/web[_\-\s]?search|\bsearch\b/.test(text)) features.web_search = true;
      if (/realtime|real[_\-\s]?time/.test(text)) features.realtime = true;
      if (/input[_\-\s]?audio|output[_\-\s]?audio|transcription|transcribe|\bvoice\b/.test(text)) features.audio = true;
      if (/\bcanvas\b/.test(text)) features.canvas = true;
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 16).forEach(function scan(item) {
        detectExportFeatures(item, features, depth + 1);
      });
      return;
    }
    if (typeof value === "object") {
      Object.keys(value).forEach(function scanKey(key) {
        detectExportFeatures(key, features, depth + 1);
        detectExportFeatures(value[key], features, depth + 1);
      });
    }
  }

  function normalizeExportFeatureId(value) {
    var clean = String(value || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/[-_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
    clean = clean.replace(/_v\d+$/, "");
    if (/^(image|images|image_generation|imagegen|gpt_image|dalle|dall_e)$/.test(clean)) return "image_generation";
    if (/^(deep_research|deepresearch|deep_search|deepsearch|research)$/.test(clean)) return "deep_research";
    if (/^(agent|agent_mode|agentmode)$/.test(clean)) return "agent_mode";
    if (/^(web_search|websearch|search)$/.test(clean)) return "web_search";
    if (/^(realtime|real_time)$/.test(clean)) return "realtime";
    if (/^(audio|voice|transcription|transcribe)$/.test(clean)) return "audio";
    if (clean === "canvas") return "canvas";
    return clean;
  }

  function exportMessageMetadata(message) {
    var parameters = {};
    var features = {};
    collectExportParameters(message || {}, parameters, [], 0);
    if (message && message.metadata) {
      collectExportParameters(message.metadata, parameters, [], 0);
      detectExportFeatures(message.metadata, features, 0);
    }
    if (message && message.parameters) {
      collectExportParameters(message.parameters, parameters, [], 0);
    }
    if (message && message.modelParameters) {
      collectExportParameters(message.modelParameters, parameters, [], 0);
    }
    if (message && Array.isArray(message.features)) {
      message.features.forEach(function addFeature(feature) {
        var clean = normalizeExportFeatureId(feature);
        if (clean) {
          features[clean] = true;
        }
      });
    }
    if (message && Array.isArray(message.usageFeatures)) {
      message.usageFeatures.forEach(function addUsageFeature(feature) {
        var clean = normalizeExportFeatureId(feature);
        if (clean) {
          features[clean] = true;
        }
      });
    }
    var metadata = (message && message.metadata && typeof message.metadata === "object") ? message.metadata : {};
    var messageParameters = (message && message.parameters && typeof message.parameters === "object") ? message.parameters : {};
    var modelParameters = (message && message.modelParameters && typeof message.modelParameters === "object") ? message.modelParameters : {};
    var modelCandidates = [
      message && message.model,
      message && message.modelSlug,
      message && message.model_slug,
      message && message.apiModel,
      message && message.api_model,
      message && message.chatgptModel,
      message && message.chatgpt_model,
      metadata.model_slug,
      metadata.modelSlug,
      metadata.modelslug,
      metadata.model_id,
      metadata.modelId,
      metadata.model,
      metadata.selected_model,
      metadata.selectedModel,
      metadata.default_model_slug,
      metadata.defaultModelSlug,
      modelParameters.model,
      messageParameters.model,
      parameters.model
    ];
    var model = firstValidExportModel(modelCandidates);
    delete parameters.model;
    return {
      model: model,
      modelCandidatePresent: modelCandidates.some(function hasCandidate(candidate) {
        return Boolean(String(candidate || "").trim());
      }),
      parameters: Object.keys(parameters).sort().reduce(function sorted(out, key) {
        var value = parameters[key];
        if (value !== "" && typeof value !== "undefined" && value !== null) {
          out[key] = value;
        }
        return out;
      }, {}),
      features: Object.keys(features).sort()
    };
  }

  function parameterSummary(parameters) {
    return Object.keys(parameters || {}).sort().map(function format(key) {
      return key + ": " + String(parameters[key]);
    }).join("; ");
  }

  function modelSummary(model) {
    return String(model || "").trim() || "N/A";
  }

  function hasModel(model) {
    var v = String(model || "").trim();
    return v && v !== "N/A";
  }

  function validAssistantModel(message) {
    if (!message || normalizedRoleKey(message.role) !== "assistant") {
      return "";
    }
    return sanitizeExportModel(message.model);
  }

  function nearestAssistantModel(messages, index) {
    for (var previous = index - 1; previous >= 0; previous -= 1) {
      var previousModel = validAssistantModel(messages[previous]);
      if (previousModel) {
        return previousModel;
      }
    }
    for (var next = index + 1; next < messages.length; next += 1) {
      var nextModel = validAssistantModel(messages[next]);
      if (nextModel) {
        return nextModel;
      }
    }
    return "";
  }

  function mostFrequentAssistantModel(messages) {
    var counts = {};
    (messages || []).forEach(function count(message) {
      if (message && normalizedRoleKey(message.role) === "assistant") {
        var model = sanitizeExportModel(message.model);
        if (model) {
          counts[model] = (counts[model] || 0) + 1;
        }
      }
    });
    var best = "";
    var bestCount = 0;
    Object.keys(counts).forEach(function check(key) {
      if (counts[key] > bestCount) {
        bestCount = counts[key];
        best = key;
      }
    });
    return best;
  }

  function fillMissingAssistantModels(messages) {
    var filled = (messages || []).map(function fill(message, index) {
      if (message && normalizedRoleKey(message.role) === "assistant" && !validAssistantModel(message)) {
        var fallback = nearestAssistantModel(messages, index);
        if (fallback) {
          message.model = fallback;
        }
      }
      if (message && Object.prototype.hasOwnProperty.call(message, "modelCandidatePresent")) {
        delete message.modelCandidatePresent;
      }
      return message;
    });

    var conversationModel = mostFrequentAssistantModel(filled);
    if (conversationModel) {
      filled.forEach(function fillAgain(message) {
        if (message && normalizedRoleKey(message.role) === "assistant" && !validAssistantModel(message)) {
          message.model = conversationModel;
        }
      });
    }

    return filled;
  }

  function hasParameters(params) {
    return params && typeof params === "object" && Object.keys(params).length > 0;
  }

  function hasFeatures(features) {
    return Array.isArray(features) && features.length > 0;
  }

  function hasCodeFence(text) {
    return /```/.test(String(text || ""));
  }

  function compactMeta(model, parameters, features) {
    var parts = [];
    if (hasModel(model)) parts.push("Model: " + model);
    if (hasParameters(parameters)) parts.push("Params: " + parameterSummary(parameters));
    if (hasFeatures(features)) parts.push("Feat: " + featureDisplay(features));
    return parts.length ? parts.join(" | ") : "";
  }

  function parameterDisplay(parameters) {
    return parameterSummary(parameters) || "None";
  }

  function featureDisplay(features) {
    return features && features.length ? features.join(", ") : "None";
  }

  function featureUsageSummary(conversations) {
    var byFeature = {};
    var total = 0;
    (conversations || []).forEach(function countConversation(conversation) {
      (conversation.messages || []).forEach(function countMessage(message) {
        (Array.isArray(message.features) ? message.features : []).forEach(function countFeature(feature) {
          var id = String(feature || "").trim();
          if (!id) {
            return;
          }
          byFeature[id] = (byFeature[id] || 0) + 1;
          total += 1;
        });
      });
    });
    return {
      total: total,
      byFeature: Object.keys(byFeature).sort().reduce(function sorted(out, key) {
        out[key] = byFeature[key];
        return out;
      }, {})
    };
  }

  function featureUsageDisplay(summary) {
    var counts = (summary && summary.byFeature) || {};
    return Object.keys(counts).sort().map(function format(key) {
      return key + ": " + counts[key];
    }).join("; ") || "None";
  }

  function publicMessage(message, index) {
    return {
      sequence: index + 1,
      id: String(message.id || ""),
      role: String(message.role || ""),
      time: {
        createdAt: String(message.createTime || message.createdAt || ""),
        updatedAt: String(message.updateTime || message.updatedAt || "")
      },
      model: String(message.model || ""),
      parameters: Object.assign({}, message.parameters || {}),
      features: Array.isArray(message.features) ? message.features.slice() : [],
      text: String(message.text || message.content || "")
    };
  }

  // JSON 是结构化数据格式(供机器/再导入用),保留完整字段;"省略无用内容"针对的是可读的可视格式。
  function publicConversation(conversation) {
    return {
      id: String(conversation.id || ""),
      title: String(conversation.title || ""),
      url: String(conversation.url || ""),
      time: {
        createdAt: String(conversation.createTime || conversation.createdAt || ""),
        updatedAt: String(conversation.updateTime || conversation.updatedAt || "")
      },
      messageCount: conversation.messages.length,
      messages: conversation.messages.map(publicMessage)
    };
  }

  function markdownFence(text) {
    var value = String(text || "");
    var longest = 0;
    (value.match(/`+/g) || []).forEach(function countTicks(match) {
      longest = Math.max(longest, match.length);
    });
    var fence = Array(Math.max(3, longest + 3) + 1).join("`");
    return fence + "text\n" + value + "\n" + fence;
  }

  function exportTitle(options) {
    return String((options && options.title) || "ChatGPT Conversation Export");
  }

  // 文档标题:单对话(导出主路径,按对话分文件)用对话自己的标题;多对话才退化为通用导出标题。
  function documentTitle(list, options) {
    if (list && list.length === 1 && list[0] && String(list[0].title || "").trim()) {
      return String(list[0].title);
    }
    return exportTitle(options);
  }

  // JSON 用原始 ISO 时间戳(机器可读);可视格式用下面 exportTimestamp 的人类可读格式。
  function exportTimestampRaw(options) {
    return String((options && options.exportedAt) || new Date().toISOString());
  }

  function exportTimestamp(options) {
    var value = options && options.exportedAt;
    var date = value ? new Date(value) : new Date();
    if (!date || isNaN(date.getTime())) {
      return String(value || "");
    }
    var pad = function pad(n) { return String(n).padStart(2, "0"); };
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) +
      " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function conversationTimeText(conversation) {
    var parts = [];
    if (conversation && conversation.createTime) {
      parts.push("Created: " + conversation.createTime);
    }
    if (conversation && conversation.updateTime) {
      parts.push("Updated: " + conversation.updateTime);
    }
    return parts.join("; ");
  }

  function messageTimeText(message) {
    var parts = [];
    if (message && message.createTime) {
      parts.push("Created: " + message.createTime);
    }
    if (message && message.updateTime) {
      parts.push("Updated: " + message.updateTime);
    }
    return parts.join("; ");
  }

  function contentLines(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    return lines.length ? lines : [""];
  }

  function wrapMultilineText(text, maxChars) {
    var lines = [];
    String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").forEach(function wrapLine(line) {
      if (!line) {
        lines.push("");
        return;
      }
      wrapPlainLine(line, maxChars).forEach(function append(part) {
        lines.push(part);
      });
    });
    return lines.length ? lines : [""];
  }

  function wrappedMarkdownFence(text) {
    var value = contentLines(text).join("\n");
    return markdownFence(value);
  }

  // YAML frontmatter 值的安全转义(含特殊字符就用双引号包裹)。
  // 字符类里 `]` 必须用 \] 写在内部;早前误把未转义的 `]` 放进来会提前闭合字符类,
  // 导致 `:`、`#` 等常见字符检测不到 → 输出非法 YAML(标题含冒号/井号会坏掉)。
  function yamlString(value) {
    var s = String(value == null ? "" : value).replace(/\r?\n/g, " ").trim();
    if (s === "" || /[:#\[\]{}>|*&!?%@`"',]/.test(s) || /^[\s-]/.test(s)) {
      return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    return s;
  }

  function appendMarkdownDialogue(lines, conversation) {
    conversation.messages.forEach(function appendMessage(message) {
      // 说话人用粗体标签(不是标题,避免污染 Obsidian 大纲),正文紧跟其后。
      lines.push("**" + speakerName(message.role) + "**", "");
      contentLines(message.text || message.content || "").forEach(function appendContentLine(line) {
        lines.push(line);
      });
      var foot = messageFootnote(message);
      if (foot) {
        lines.push("", "*" + foot + "*");
      }
      lines.push("");
    });
  }

  // Markdown 面向「笔记 / Obsidian」:YAML frontmatter(属性)+ 干净可移植正文。
  function buildMarkdown(conversations, options) {
    var list = normalizeConversations(conversations);
    var messageCount = list.reduce(function countMessages(total, conversation) {
      return total + conversation.messages.length;
    }, 0);
    var lines = [];

    if (list.length === 1) {
      // 单对话(多选导出现在按对话分文件,这是主路径):整篇就是这段对话。
      var c = list[0];
      var title = c.title || exportTitle(options);
      lines.push("---");
      lines.push("title: " + yamlString(title));
      if (c.url) { lines.push("url: " + yamlString(c.url)); }
      var created = conversationTimeText(c);
      if (created) { lines.push("created: " + yamlString(created.replace(/^Created:\s*/i, ""))); }
      lines.push("exported: " + yamlString(exportTimestamp(options)));
      lines.push("messages: " + c.messages.length);
      lines.push("---", "");
      lines.push("# " + title, "");
      appendMarkdownDialogue(lines, c);
    } else {
      // 多对话同文件兜底。
      lines.push("# " + exportTitle(options), "");
      lines.push("> 导出于 " + exportTimestamp(options) + " · " + list.length + " 段对话 · " + messageCount + " 条消息", "");
      list.forEach(function conversationToMarkdown(conversation, conversationIndex) {
        if (conversationIndex > 0) { lines.push("", "---", ""); }
        lines.push("## " + conversation.title, "");
        if (conversation.url) { lines.push("<" + conversation.url + ">", ""); }
        appendMarkdownDialogue(lines, conversation);
      });
    }

    // 推广页脚:简要介绍 + GitHub 链接(放在正文末尾)。
    lines.push("", "---", "");
    lines.push("> **" + EXPORT_PROMO_NAME + "** — " + EXPORT_PROMO_DESC);
    lines.push("> GitHub · <" + EXPORT_PROMO_URL + ">");
    return lines.join("\n").replace(/\n+$/, "") + "\n";
  }

  function buildPlainTextLines(conversations, options) {
    var list = normalizeConversations(conversations);
    var messageCount = list.reduce(function countMessages(total, conversation) {
      return total + conversation.messages.length;
    }, 0);
    var lines = [
      documentTitle(list, options),
      "导出于 " + exportTimestamp(options) + " · " + list.length + " 段对话 · " + messageCount + " 条消息",
      ""
    ];

    list.forEach(function conversationToText(conversation, conversationIndex) {
      if (conversationIndex > 0) {
        lines.push("", "————————————", "");
      }
      lines.push(conversation.title);
      var sub = [conversationTimeText(conversation), conversation.messages.length + " 条消息"].filter(Boolean).join(" · ");
      if (sub) lines.push(sub);
      if (conversation.url) lines.push(conversation.url);
      lines.push("");

      conversation.messages.forEach(function messageToText(message) {
        lines.push(speakerName(message.role) + ":");
        contentLines(message.text || message.content || "").forEach(function appendLine(line) {
          lines.push(line || " ");
        });
        var foot = messageFootnote(message);
        if (foot) lines.push("— " + foot);
        lines.push("");
      });
    });

    return lines;
  }

  function buildHtml(conversations, options) {
    var list = normalizeConversations(conversations);
    var title = documentTitle(list, options);
    var exportedAt = exportTimestamp(options);
    var messageCount = list.reduce(function countMessages(total, conversation) {
      return total + conversation.messages.length;
    }, 0);
    var body = list.map(function conversationToHtml(conversation, conversationIndex) {
      var messages = conversation.messages.map(function messageToHtml(message) {
        var user = isUserMessage(message.role);
        var foot = messageFootnote(message);
        return [
          '<div class="msg ' + (user ? "user" : "assistant") + '">',
          '<div class="row"><span class="who">' + escapeHtml(speakerName(message.role)) + "</span></div>",
          '<div class="bubble"><div class="content">' + escapeHtml(message.text || message.content || "") + "</div>",
          foot ? '<div class="foot">' + escapeHtml(foot) + "</div>" : "",
          "</div>",
          "</div>"
        ].join("");
      }).join("");
      var conversationTime = conversationTimeText(conversation);

      return [
        '<article class="conversation">',
        '<header class="conv-head">',
        "<h2>" + escapeHtml(conversation.title) + "</h2>",
        '<p class="conv-sub">' + escapeHtml([conversationTime, conversation.messages.length + " 条消息"].filter(Boolean).join(" · ")) + "</p>",
        conversation.url ? '<p class="conv-sub"><a href="' + escapeHtml(conversation.url) + '">' + escapeHtml(conversation.url) + "</a></p>" : "",
        "</header>",
        '<div class="thread">' + messages + "</div>",
        "</article>"
      ].join("");
    }).join("");

    return [
      "<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + escapeHtml(title) + "</title>",
      "<style>:root{--ink:#0f172a;--muted:#64748b;--paper:#f7f8fa;--card:#fff;--user-bg:#1f6feb;--user-ink:#fff;--bot-bg:#eef1f5;--bot-ink:#0f172a;--rule:#e6e9ef;--accent:#1f4f9f}*{box-sizing:border-box}body{font:15px/1.7 -apple-system,BlinkMacSystemFont,\"Segoe UI\",\"Microsoft YaHei\",\"PingFang SC\",\"Noto Sans CJK SC\",sans-serif;color:var(--ink);background:var(--paper);margin:0;padding:28px 16px}.doc{max-width:760px;margin:0 auto}.doc-title{font-size:26px;line-height:1.2;margin:0 0 6px;font-weight:750}.doc-sub{color:var(--muted);margin:0 0 26px;font-size:13px}.conversation{background:var(--card);border:1px solid var(--rule);border-radius:16px;padding:18px 18px 8px;margin:0 0 22px;box-shadow:0 1px 2px rgba(15,23,42,.04)}.conv-head{padding:0 4px 8px;border-bottom:1px solid var(--rule);margin-bottom:12px}h2{font-size:18px;line-height:1.3;margin:0 0 4px;color:var(--accent);font-weight:720}.conv-sub{color:var(--muted);font-size:12px;margin:2px 0;overflow-wrap:anywhere}.conv-sub a{color:var(--muted)}.thread{display:flex;flex-direction:column;gap:14px;padding:4px 2px 12px}.msg{display:flex;flex-direction:column;max-width:82%}.msg.assistant{align-self:flex-start;align-items:flex-start}.msg.user{align-self:flex-end;align-items:flex-end}.row{padding:0 6px 3px}.who{font-size:12px;color:var(--muted);font-weight:600}.bubble{padding:10px 14px;border-radius:16px;overflow-wrap:anywhere}.assistant .bubble{background:var(--bot-bg);color:var(--bot-ink);border-bottom-left-radius:5px}.user .bubble{background:var(--user-bg);color:var(--user-ink);border-bottom-right-radius:5px}.content{white-space:pre-wrap;line-height:1.62}.foot{margin-top:7px;padding-top:6px;border-top:1px solid rgba(148,163,184,.28);font-size:11px;opacity:.75}@media print{body{background:#fff;padding:0}.conversation{break-inside:auto;border:none;box-shadow:none;border-radius:0}.msg{break-inside:avoid}}</style>",
      "</head><body><main class=\"doc\">",
      "<h1 class=\"doc-title\">" + escapeHtml(title) + "</h1>",
      '<p class="doc-sub">' + escapeHtml([exportedAt, list.length + " 段对话", messageCount + " 条消息"].filter(Boolean).join(" · ")) + "</p>",
      body,
      "</main></body></html>"
    ].join("");
  }

  function textLines(conversations, options) {
    return buildPlainTextLines(conversations, options || {});
  }

  function blobFromText(text, mime) {
    return new Blob([text], { type: mime });
  }

  function makeExportName(conversations, extension) {
    var list = normalizeConversations(conversations);
    var base = list.length === 1 ? list[0].title || list[0].id : "chatgpt-conversations-" + list.length;
    return safeName(base) + "." + extension;
  }

  function makeTextBlob(format, conversations) {
    if (format === "json") {
      return { blob: blobFromText(exportJson(conversations), JSON_MIME), filename: makeExportName(conversations, "json") };
    }
    if (format === "md") {
      return { blob: blobFromText(exportMarkdown(conversations), MD_MIME), filename: makeExportName(conversations, "md") };
    }
    throw new Error("Unsupported text export format: " + format);
  }

  function exportJson(conversations, options) {
    return buildJson(conversations, options || {});
  }

  function exportMarkdown(conversations, options) {
    return buildMarkdown(conversations, options || {});
  }

  function exportHtml(conversations, options) {
    return buildHtml(conversations, options || {});
  }

  function exportPrintHtml(conversations, options) {
    var html = buildHtml(conversations, options || {});
    var printStyle = "<style>@media print{body{margin:16mm}.conversation{break-after:page}}</style>";
    var autoPrint = options && options.autoPrint ? "<script>window.addEventListener('load',function(){window.print();});</script>" : "";
    return html.replace("</head>", printStyle + "</head>").replace("</body>", autoPrint + "</body>");
  }

  function exportDocxHtml(conversations, options) {
    return [
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
      "<head><meta charset=\"utf-8\"><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml></head><body>",
      exportHtml(conversations, options || {}).replace(/^.*?<body>/s, "").replace("</body></html>", ""),
      "</body></html>"
    ].join("");
  }

  function svgTextUnits(text) {
    return Array.from(String(text || "")).reduce(function countUnits(total, ch) {
      return total + (/[^\x20-\x7e]/.test(ch) ? 2 : 1);
    }, 0);
  }

  // 把对话渲染成聊天气泡的 SVG(PNG 由它栅格化):用户靠右蓝气泡、助手靠左灰气泡。
  function exportSvg(conversations, options) {
    var list = normalizeConversations(conversations);
    var width = Number((options && options.width) || 820);
    var margin = 28;
    var contentW = width - margin * 2;
    var fontSize = 15;
    var lineH = 23;
    var padX = 14;
    var padY = 11;
    var gap = 14;
    var unitPx = fontSize * 0.55;
    var bubbleMaxW = Math.round(contentW * 0.74);
    var maxUnits = Math.max(8, Math.floor((bubbleMaxW - padX * 2) / unitPx));
    var fontFamily = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC',Arial,Helvetica,sans-serif";
    var y = margin;
    var els = [];

    function svgText(x, ty, s, opt) {
      opt = opt || {};
      return '<text x="' + x + '" y="' + ty + '" font-size="' + (opt.size || fontSize) + '"' +
        (opt.weight ? ' font-weight="' + opt.weight + '"' : "") +
        ' fill="' + (opt.fill || "#0f172a") + '"' +
        (opt.anchor ? ' text-anchor="' + opt.anchor + '"' : "") + ">" +
        escapeHtml(s == null || s === "" ? " " : s) + "</text>";
    }

    els.push(svgText(margin, y + 22, documentTitle(list, options), { size: 26, weight: 700 }));
    y += 36;
    var msgCount = list.reduce(function countMessages(t, c) { return t + c.messages.length; }, 0);
    els.push(svgText(margin, y + 12, "导出于 " + exportTimestamp(options) + " · " + list.length + " 段对话 · " + msgCount + " 条消息", { size: 12.5, fill: "#64748b" }));
    y += 30;

    list.forEach(function conversationToSvg(conv, ci) {
      if (ci > 0) {
        y += 10;
        els.push('<line x1="' + margin + '" y1="' + y + '" x2="' + (width - margin) + '" y2="' + y + '" stroke="#e6e9ef" stroke-width="1"/>');
        y += 20;
      }
      els.push(svgText(margin, y + 18, conv.title, { size: 18, weight: 700, fill: "#1f4f9f" }));
      y += 24;
      var sub = [conversationTimeText(conv), conv.messages.length + " 条消息"].filter(Boolean).join(" · ");
      if (sub) {
        els.push(svgText(margin, y + 12, sub, { size: 12, fill: "#94a3b8" }));
        y += 20;
      }
      y += 8;

      conv.messages.forEach(function messageToSvg(message) {
        var user = isUserMessage(message.role);
        var lines = [];
        contentLines(message.text || message.content || "").forEach(function wrapRaw(raw) {
          wrapPlainLine(raw, maxUnits).forEach(function pushWrapped(w) { lines.push(w); });
        });
        if (!lines.length) { lines = [""]; }
        var maxLineUnits = lines.reduce(function widest(m, l) { return Math.max(m, svgTextUnits(l)); }, 0);
        var bubbleW = Math.min(bubbleMaxW, Math.max(64, Math.round(maxLineUnits * unitPx) + padX * 2));
        var foot = messageFootnote(message);
        var bubbleH = padY * 2 + lines.length * lineH + (foot ? 18 : 0);
        var bx = user ? (width - margin - bubbleW) : margin;

        els.push(svgText(user ? (width - margin) : margin, y + 11, speakerName(message.role), { size: 12, weight: 600, fill: "#64748b", anchor: user ? "end" : "start" }));
        y += 17;
        els.push('<rect x="' + bx + '" y="' + y + '" width="' + bubbleW + '" height="' + bubbleH + '" rx="15" fill="' + (user ? "#1f6feb" : "#eef1f5") + '"/>');
        var tx = bx + padX;
        var ty = y + padY + fontSize - 2;
        lines.forEach(function drawLine(l) {
          els.push(svgText(tx, ty, l, { fill: user ? "#ffffff" : "#0f172a" }));
          ty += lineH;
        });
        if (foot) {
          els.push(svgText(tx, ty + 3, foot, { size: 11, fill: user ? "#dbe9ff" : "#94a3b8" }));
        }
        y += bubbleH + gap;
      });
      y += 6;
    });

    var height = Math.max(160, Math.ceil(y + margin - gap));
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '"><rect width="100%" height="100%" fill="#f7f8fa"/><g font-family="' + fontFamily + '">' + els.join("") + "</g></svg>";
  }

  function svgTextStyle(line) {
    if (/^-{6,}$/.test(line)) {
      return { separator: true };
    }
    if (line === "ChatGPT Conversation Export" || /^.+ Export$/.test(line)) {
      return { text: line, fontSize: 28, lineHeight: 34, fontWeight: 700, fill: "#111827", after: 10 };
    }
    if (/^Conversation \d+: /.test(line)) {
      return { text: line, fontSize: 22, lineHeight: 30, fontWeight: 700, fill: "#1f4f9f", after: 6 };
    }
    if (/^Message \d+ - /.test(line)) {
      return { text: line, fontSize: 18, lineHeight: 26, fontWeight: 700, fill: "#111827", after: 2 };
    }
    return { text: line, fontSize: 15, lineHeight: line ? 22 : 12, fontWeight: 400, fill: /^[A-Za-z ]+: /.test(line) ? "#475569" : "#111827", after: 0 };
  }

  function wrapPlainLine(text, maxChars) {
    var value = String(text || "");
    var limit = Math.max(1, Math.floor(Number(maxChars) || 1));
    if (plainWrapUnits(value) <= limit) {
      return [value];
    }
    var words = value.split(/(\s+)/);
    var lines = [];
    var line = "";
    var lineUnits = 0;

    function plainWrapUnits(part) {
      return Array.from(String(part || "")).reduce(function countUnits(total, character) {
        return total + (/[^\x20-\x7e]/.test(character) ? 2 : 1);
      }, 0);
    }

    function pushLine() {
      lines.push(line.trimEnd());
      line = "";
      lineUnits = 0;
    }

    function appendToken(token) {
      line += token;
      lineUnits += plainWrapUnits(token);
    }

    function pushLongWord(word) {
      Array.from(word).forEach(function appendCharacter(character) {
        var characterUnits = plainWrapUnits(character);
        if (line && lineUnits + characterUnits > limit) {
          pushLine();
        }
        appendToken(character);
      });
      if (line && lineUnits >= limit) {
        pushLine();
      }
    }

    words.forEach(function append(word) {
      if (!word) {
        return;
      }
      var wordUnits = plainWrapUnits(word);
      if (wordUnits > limit) {
        if (line) {
          pushLine();
        }
        pushLongWord(word);
        return;
      }
      if (lineUnits + wordUnits > limit && line) {
        pushLine();
        word = word.trimStart();
        if (!word) {
          return;
        }
        appendToken(word);
        return;
      }
      appendToken(word);
    });
    if (line) {
      pushLine();
    }
    return lines.length ? lines : [""];
  }

  function toBlob(content, mimeType) {
    return new Blob([content], { type: mimeType });
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(bytes).toString("base64");
    }
    if (typeof btoa === "function") {
      var binary = "";
      var chunkSize = 32768;
      for (var offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
      }
      return btoa(binary);
    }
    throw new Error("No base64 encoder available.");
  }

  function base64Encode(text) {
    return bytesToBase64(encodeUtf8(text));
  }

  function toDataUrl(content, mimeType) {
    if (content instanceof Uint8Array) {
      return "data:" + mimeType + ";base64," + bytesToBase64(content);
    }
    return "data:" + mimeType + ";base64," + base64Encode(content);
  }

  function exportArtifact(conversations, format, options) {
    var normalizedFormat = format === "md" ? "markdown" : format;
    var filenameBase = safeName((options && options.filenameBase) || "chatgpt-export");
    var content = "";
    var binaryContent = null;
    var mimeType = "";
    var extension = format;

    if (format === "json") {
      content = exportJson(conversations, options || {});
      mimeType = MIME.json;
      extension = "json";
    } else if (format === "md" || format === "markdown") {
      content = exportMarkdown(conversations, options || {});
      mimeType = MIME.markdown;
      extension = "md";
      normalizedFormat = "markdown";
    } else if (format === "html") {
      content = exportHtml(conversations, options || {});
      mimeType = MIME.html;
      extension = "html";
    } else if (format === "printHtml") {
      content = exportPrintHtml(conversations, Object.assign({}, options || {}, { autoPrint: false }));
      mimeType = MIME.printHtml;
      extension = "html";
      normalizedFormat = "printHtml";
    } else if (format === "pdf") {
      binaryContent = buildPdfBytes(conversations, options || {});
      mimeType = MIME.pdf;
      extension = "pdf";
    } else if (format === "docx") {
      binaryContent = buildDocxBytes(conversations, options || {});
      mimeType = MIME.docx;
      extension = "docx";
    } else if (format === "docxHtml") {
      content = exportDocxHtml(conversations, options || {});
      mimeType = MIME.docxHtml;
      extension = "doc";
    } else if (format === "image" || format === "png") {
      binaryContent = buildPngBytes(conversations, options || {});
      mimeType = MIME.image;
      extension = "png";
      normalizedFormat = "image";
    } else if (format === "svg") {
      content = exportSvg(conversations, options || {});
      mimeType = MIME.svg;
      extension = "svg";
    } else {
      throw new Error("Unsupported export format: " + format);
    }

    var artifactContent = binaryContent || content;
    return {
      format: normalizedFormat,
      filename: filenameBase + "." + extension,
      mimeType: mimeType,
      content: artifactContent,
      dataUrl: toDataUrl(artifactContent, mimeType),
      blob: toBlob(artifactContent, mimeType)
    };
  }

  function exportPngDataUrl(conversations, options) {
    if (!root.document || typeof root.document.createElement !== "function") {
      return Promise.reject(new Error("PNG export requires a browser environment with Canvas."));
    }
    var svg = exportSvg(conversations, options || {});
    var image = new Image();
    var canvas = root.document.createElement("canvas");
    var svgWidth = Number((svg.match(/\bwidth="(\d+)"/) || [])[1]) || Number((options && options.width) || 820);
    var svgHeight = Number((svg.match(/\bheight="(\d+)"/) || [])[1]);
    canvas.width = svgWidth;
    canvas.height = Math.max(160, svgHeight || textLines(conversations).length * 24 + 40);
    var url = URL.createObjectURL(toBlob(svg, MIME.svg));
    return new Promise(function executor(resolve, reject) {
      image.onload = function handleLoad() {
        var context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL(PNG_MIME));
      };
      image.onerror = function handleError() {
        URL.revokeObjectURL(url);
        reject(new Error("PNG export render failed."));
      };
      image.src = url;
    });
  }

  function crc32(bytes) {
    var table = crc32.table;
    if (!table) {
      table = [];
      for (var i = 0; i < 256; i += 1) {
        var value = i;
        for (var j = 0; j < 8; j += 1) {
          value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[i] = value >>> 0;
      }
      crc32.table = table;
    }

    var crc = 0xffffffff;
    for (var index = 0; index < bytes.length; index += 1) {
      crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function encodeUtf8(text) {
    return new TextEncoder().encode(String(text || ""));
  }

  function writeUint16(list, value) {
    list.push(value & 0xff, (value >>> 8) & 0xff);
  }

  function writeUint32(list, value) {
    list.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
  }

  function writeBigUint32(list, value) {
    list.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }

  function concatBytes(parts) {
    var length = parts.reduce(function sum(total, part) {
      return total + part.length;
    }, 0);
    var result = new Uint8Array(length);
    var offset = 0;
    parts.forEach(function append(part) {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function asciiStringBytes(text) {
    var value = String(text || "");
    var bytes = new Uint8Array(value.length);
    for (var index = 0; index < value.length; index += 1) {
      bytes[index] = value.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  function adler32(bytes) {
    var a = 1;
    var b = 0;
    for (var index = 0; index < bytes.length; index += 1) {
      a = (a + bytes[index]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  function zlibStore(bytes) {
    var parts = [new Uint8Array([0x78, 0x01])];
    var offset = 0;
    while (offset < bytes.length) {
      var blockLength = Math.min(65535, bytes.length - offset);
      var finalBlock = offset + blockLength >= bytes.length ? 1 : 0;
      var header = [];
      header.push(finalBlock);
      writeUint16(header, blockLength);
      writeUint16(header, (~blockLength) & 0xffff);
      parts.push(new Uint8Array(header), bytes.subarray(offset, offset + blockLength));
      offset += blockLength;
    }
    var checksum = [];
    writeBigUint32(checksum, adler32(bytes));
    parts.push(new Uint8Array(checksum));
    return concatBytes(parts);
  }

  function pngChunk(type, data) {
    var typeBytes = asciiStringBytes(type);
    var body = data instanceof Uint8Array ? data : encodeUtf8(data || "");
    var length = [];
    var checksum = [];
    writeBigUint32(length, body.length);
    writeBigUint32(checksum, crc32(concatBytes([typeBytes, body])));
    return concatBytes([new Uint8Array(length), typeBytes, body, new Uint8Array(checksum)]);
  }

  function pngTextChunk(keyword, text) {
    var safeKeyword = String(keyword || "Description").replace(/[^\x20-\x7e]/g, "").slice(0, 79) || "Description";
    return pngChunk(
      "iTXt",
      concatBytes([
        asciiStringBytes(safeKeyword),
        new Uint8Array([0, 0, 0, 0, 0]),
        encodeUtf8(text || "")
      ])
    );
  }

  function plainTextSvgPreview(text) {
    var width = 960;
    var margin = 32;
    var y = margin;
    var elements = [];
    contentLines(text).forEach(function addLine(rawLine) {
      var line = String(rawLine || "");
      var style = svgTextStyle(line);
      if (style.separator) {
        y += 10;
        elements.push('<line x1="' + margin + '" x2="' + (width - margin) + '" y1="' + y + '" y2="' + y + '" stroke="#dbe3ee" stroke-width="1"/>');
        y += 16;
        return;
      }
      wrapPlainLine(style.text, Math.max(24, Math.floor((width - margin * 2) / (style.fontSize * 0.56)))).forEach(function addWrapped(part) {
        y += style.lineHeight;
        elements.push('<text x="' + margin + '" y="' + y + '" font-size="' + style.fontSize + '" font-weight="' + style.fontWeight + '" fill="' + style.fill + '">' + escapeHtml(part || " ") + '</text>');
      });
      if (!line) {
        y += 2;
      }
      if (style.after) {
        y += style.after;
      }
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + Math.max(160, Math.ceil(y + margin)) + '" viewBox="0 0 ' + width + ' ' + Math.max(160, Math.ceil(y + margin)) + '"><rect width="100%" height="100%" fill="#ffffff"/><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,Noto Sans CJK SC,sans-serif">' + elements.join("") + '</g></svg>';
  }

  function limitedPngFontText(text) {
    return String(text || "");
  }

  function assertPngBytes(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 12) {
      throw new Error("PNG export did not produce image bytes.");
    }
    for (var index = 0; index < PNG_SIGNATURE.length; index += 1) {
      if (bytes[index] !== PNG_SIGNATURE[index]) {
        throw new Error("PNG export did not produce a PNG file.");
      }
    }
  }

  function addPngTextChunk(bytes, keyword, text) {
    assertPngBytes(bytes);
    var offset = PNG_SIGNATURE.length;
    while (offset + 12 <= bytes.length) {
      var length = ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
      var type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === "IEND") {
        return concatBytes([bytes.subarray(0, offset), pngTextChunk(keyword, text), bytes.subarray(offset)]);
      }
      offset += 12 + length;
    }
    throw new Error("PNG export did not contain an IEND chunk.");
  }

  function addPngExportTextChunks(bytes, text) {
    var withTranscript = addPngTextChunk(bytes, "ChatGPTExport", text || "");
    return addPngTextChunk(withTranscript, "ChatGPTExportSvgPreview", plainTextSvgPreview(text || ""));
  }

  var PIXEL_FONT = {
    " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
    "A": [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    "B": ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
    "C": [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
    "D": ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
    "E": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
    "F": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
    "G": [" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ### "],
    "H": ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    "I": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
    "J": ["#####", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
    "K": ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
    "L": ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
    "M": ["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"],
    "N": ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
    "O": [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    "P": ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
    "Q": [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
    "R": ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
    "S": [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
    "T": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
    "U": ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    "V": ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
    "W": ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
    "X": ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
    "Y": ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
    "Z": ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
    "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
    "1": ["  #  ", " ##  ", "# #  ", "  #  ", "  #  ", "  #  ", "#####"],
    "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
    "3": ["#### ", "    #", "    #", " ### ", "    #", "    #", "#### "],
    "4": ["#   #", "#   #", "#   #", "#####", "    #", "    #", "    #"],
    "5": ["#####", "#    ", "#    ", "#### ", "    #", "    #", "#### "],
    "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
    "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
    "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
    "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
    ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
    ",": ["     ", "     ", "     ", "     ", " ##  ", " ##  ", "#    "],
    ":": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "     "],
    ";": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "#    "],
    "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
    "_": ["     ", "     ", "     ", "     ", "     ", "     ", "#####"],
    "/": ["    #", "   # ", "   # ", "  #  ", " #   ", " #   ", "#    "],
    "\\": ["#    ", " #   ", " #   ", "  #  ", "   # ", "   # ", "    #"],
    "@": [" ### ", "#   #", "# ###", "# # #", "# ###", "#    ", " ####"],
    "#": [" # # ", "#####", " # # ", " # # ", "#####", " # # ", "     "],
    "*": ["     ", "# # #", " ### ", "#####", " ### ", "# # #", "     "],
    "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
    "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
    "'": [" ##  ", " ##  ", " #   ", "     ", "     ", "     ", "     "],
    "\"": ["# #  ", "# #  ", "# #  ", "     ", "     ", "     ", "     "],
    "`": [" ##  ", "  ## ", "     ", "     ", "     ", "     ", "     "],
    "(": ["   # ", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   # "],
    ")": [" #   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", " #   "],
    "[": [" ### ", " #   ", " #   ", " #   ", " #   ", " #   ", " ### "],
    "]": [" ### ", "   # ", "   # ", "   # ", "   # ", "   # ", " ### "],
    "{": ["   ##", "  #  ", "  #  ", " #   ", "  #  ", "  #  ", "   ##"],
    "}": ["##   ", "  #  ", "  #  ", "   # ", "  #  ", "  #  ", "##   "],
    "<": ["   # ", "  #  ", " #   ", "#    ", " #   ", "  #  ", "   # "],
    ">": [" #   ", "  #  ", "   # ", "    #", "   # ", "  #  ", " #   "],
    "=": ["     ", "     ", "#####", "     ", "#####", "     ", "     "],
    "+": ["     ", "  #  ", "  #  ", "#####", "  #  ", "  #  ", "     "],
    "&": [" ##  ", "#  # ", "# #  ", " #   ", "# # #", "#  # ", " ## #"],
    "|": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
    "~": ["     ", "     ", " ## #", "# ## ", "     ", "     ", "     "]
  };

  function pngVisualStyle(line) {
    if (/^-{6,}$/.test(line)) {
      return { separator: true, before: 10, after: 18 };
    }
    if (line === "ChatGPT Conversation Export" || /^.+ Export$/.test(line)) {
      return { scale: 3, color: [17, 24, 39, 255], before: 0, after: 14 };
    }
    if (/^Conversation \d+: /.test(line)) {
      return { scale: 3, color: [31, 79, 159, 255], before: 12, after: 8 };
    }
    if (/^Message \d+ - /.test(line)) {
      return { scale: 2, color: [17, 24, 39, 255], before: 10, after: 4 };
    }
    if (/^[A-Za-z ]+: /.test(line)) {
      return { scale: 2, color: [71, 85, 105, 255], before: 0, after: 2 };
    }
    return { scale: 2, color: [17, 24, 39, 255], before: 0, after: 6 };
  }

  function layoutPngVisualLines(lines, width, margin) {
    var items = [];
    var y = margin;
    var contentWidth = width - margin * 2;
    lines.forEach(function layoutLine(rawLine) {
      var value = limitedPngFontText(rawLine || "");
      var style = pngVisualStyle(value);
      if (style.separator) {
        y += style.before;
        items.push({ type: "line", y: y });
        y += style.after;
        return;
      }
      if (!value.trim()) {
        y += 14;
        return;
      }
      y += style.before;
      var maxChars = Math.max(18, Math.floor(contentWidth / (style.scale * 6)));
      var maxUnits = Math.max(14, Math.floor(contentWidth / (style.scale * 5)));
      wrapPlainLine(value, maxChars).forEach(function addTextLine(part) {
        wrapPdfText(part, maxChars, maxUnits).forEach(function addUnitLine(unitPart) {
          items.push({ type: "text", text: unitPart, x: margin, y: y, scale: style.scale, color: style.color });
          y += style.scale * 9;
        });
      });
      y += style.after;
    });
    return { items: items, height: y + margin };
  }

  function fillPngRect(raw, width, height, x, y, rectWidth, rectHeight, color) {
    var startX = Math.max(0, Math.floor(x));
    var startY = Math.max(0, Math.floor(y));
    var endX = Math.min(width, Math.ceil(x + rectWidth));
    var endY = Math.min(height, Math.ceil(y + rectHeight));
    for (var row = startY; row < endY; row += 1) {
      var rowStart = row * (width * 4 + 1) + 1;
      for (var column = startX; column < endX; column += 1) {
        var pixel = rowStart + column * 4;
        raw[pixel] = color[0];
        raw[pixel + 1] = color[1];
        raw[pixel + 2] = color[2];
        raw[pixel + 3] = color[3];
      }
    }
  }

  function drawPngGlyph(raw, width, height, x, y, character, scale, color) {
    var pattern = PIXEL_FONT[String(character || " ").toUpperCase()] || PIXEL_FONT["?"];
    pattern.forEach(function drawRow(row, rowIndex) {
      for (var columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        if (row.charAt(columnIndex) !== " ") {
          fillPngRect(raw, width, height, x + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      }
    });
  }

  function drawPngText(raw, width, height, x, y, text, scale, color) {
    var cursorX = x;
    String(text || "").split("").forEach(function drawCharacter(character) {
      drawPngGlyph(raw, width, height, cursorX, y, character, scale, color);
      cursorX += scale * 6;
    });
  }

  function renderPngImageData(conversations, options) {
    var width = Math.floor(Math.max(640, Math.min(1600, Number((options && options.width) || 960) || 960)));
    var margin = 36;
    var lines = buildPlainTextLines(conversations, options || {});
    var metadataText = lines.join("\n");
    var layout = layoutPngVisualLines(lines, width, margin);
    var requestedHeight = Number((options && options.height) || 0) || 0;
    var height = Math.ceil(Math.max(180, layout.height, requestedHeight));
    var rowLength = width * 4 + 1;
    var raw = new Uint8Array(rowLength * height);
    for (var y = 0; y < height; y += 1) {
      var rowStart = y * rowLength;
      raw[rowStart] = 0;
      for (var x = 0; x < width; x += 1) {
        var pixel = rowStart + 1 + x * 4;
        raw[pixel] = 255;
        raw[pixel + 1] = 255;
        raw[pixel + 2] = 255;
        raw[pixel + 3] = 255;
      }
    }
    layout.items.forEach(function drawItem(item) {
      if (item.type === "line") {
        fillPngRect(raw, width, height, margin, item.y, width - margin * 2, 2, [219, 227, 238, 255]);
        return;
      }
      drawPngText(raw, width, height, item.x, item.y, item.text, item.scale, item.color);
    });

    return { width: width, height: height, raw: raw, metadataText: metadataText };
  }

  function pngBytesFromImageData(imageData, compressedRaw) {
    var header = [];
    writeBigUint32(header, imageData.width);
    writeBigUint32(header, imageData.height);
    header.push(8, 6, 0, 0, 0);
    return addPngExportTextChunks(concatBytes([
      PNG_SIGNATURE,
      pngChunk("IHDR", new Uint8Array(header)),
      pngChunk("IDAT", compressedRaw),
      pngChunk("IEND", new Uint8Array(0))
    ]), imageData.metadataText);
  }

  function compressZlibBytes(bytes) {
    var CompressionCtor = root.CompressionStream || (typeof CompressionStream !== "undefined" ? CompressionStream : null);
    var ResponseCtor = root.Response || (typeof Response !== "undefined" ? Response : null);
    var BlobCtor = root.Blob || (typeof Blob !== "undefined" ? Blob : null);
    if (!CompressionCtor || !ResponseCtor || !BlobCtor) {
      return Promise.resolve(zlibStore(bytes));
    }
    try {
      var stream = new BlobCtor([bytes]).stream().pipeThrough(new CompressionCtor("deflate"));
      return new ResponseCtor(stream).arrayBuffer().then(function compressedBuffer(buffer) {
        return new Uint8Array(buffer);
      }).catch(function fallbackToStored() {
        return zlibStore(bytes);
      });
    } catch (error) {
      return Promise.resolve(zlibStore(bytes));
    }
  }

  function buildPngBytes(conversations, options) {
    var imageData = renderPngImageData(conversations, options || {});
    return pngBytesFromImageData(imageData, zlibStore(imageData.raw));
  }

  function buildPngBytesAsync(conversations, options) {
    var imageData = renderPngImageData(conversations, options || {});
    return compressZlibBytes(imageData.raw).then(function compressedBytes(compressedRaw) {
      return pngBytesFromImageData(imageData, compressedRaw);
    });
  }

  function buildZip(files) {
    var localParts = [];
    var centralParts = [];
    var offset = 0;

    files.forEach(function addFile(file) {
      var nameBytes = encodeUtf8(file.name);
      var data = file.content instanceof Uint8Array ? file.content : encodeUtf8(file.content);
      var crc = crc32(data);
      var local = [];
      writeUint32(local, 0x04034b50);
      writeUint16(local, 20);
      writeUint16(local, 0x0800);
      writeUint16(local, 0);
      writeUint16(local, 0);
      writeUint16(local, 0);
      writeUint32(local, crc);
      writeUint32(local, data.length);
      writeUint32(local, data.length);
      writeUint16(local, nameBytes.length);
      writeUint16(local, 0);
      var localBytes = concatBytes([new Uint8Array(local), nameBytes, data]);
      localParts.push(localBytes);

      var central = [];
      writeUint32(central, 0x02014b50);
      writeUint16(central, 20);
      writeUint16(central, 20);
      writeUint16(central, 0x0800);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint32(central, crc);
      writeUint32(central, data.length);
      writeUint32(central, data.length);
      writeUint16(central, nameBytes.length);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint16(central, 0);
      writeUint32(central, 0);
      writeUint32(central, offset);
      centralParts.push(concatBytes([new Uint8Array(central), nameBytes]));
      offset += localBytes.length;
    });

    var centralBytes = concatBytes(centralParts);
    var end = [];
    writeUint32(end, 0x06054b50);
    writeUint16(end, 0);
    writeUint16(end, 0);
    writeUint16(end, files.length);
    writeUint16(end, files.length);
    writeUint32(end, centralBytes.length);
    writeUint32(end, offset);
    writeUint16(end, 0);
    return concatBytes(localParts.concat([centralBytes, new Uint8Array(end)]));
  }

  // 把一条消息的 Markdown 文本渲染成 Word 段落/表格(标题加粗、**粗** `码` 等行内样式、代码块、列表、表格),
  // 取代过去把 "## ** ``` |" 当纯文本直接塞进一个段落的做法,使 DOCX 也"参考 ChatGPT"渲染。
  function docxRun(text, opts) {
    opts = opts || {};
    var rpr = "<w:rPr>";
    rpr += opts.code
      ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/>'
      : '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/>';
    if (opts.bold) rpr += "<w:b/>";
    if (opts.italic) rpr += "<w:i/>";
    if (opts.code) rpr += '<w:shd w:val="clear" w:color="auto" w:fill="EEF1F4"/><w:color w:val="B3261E"/>';
    if (opts.link) rpr += '<w:color w:val="1F6FEB"/><w:u w:val="single"/>';
    rpr += "</w:rPr>";
    var parts = String(text == null ? "" : text).split("\n").map(function (p) {
      return '<w:t xml:space="preserve">' + escapeXml(p) + "</w:t>";
    }).join("<w:br/>");
    return "<w:r>" + rpr + parts + "</w:r>";
  }

  function createDocxLinkRegistry() {
    var ids = {};
    var relationships = [];
    return {
      idFor: function idFor(url) {
        var normalized = String(url || "").trim();
        if (!/^https?:\/\//i.test(normalized)) {
          return "";
        }
        if (ids[normalized]) {
          return ids[normalized];
        }
        var id = "rIdLink" + (relationships.length + 1);
        ids[normalized] = id;
        relationships.push(
          '<Relationship Id="' + id +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"' +
            ' Target="' + escapeXml(normalized) + '" TargetMode="External"/>'
        );
        return id;
      },
      xml: function xml() {
        return relationships.join("");
      }
    };
  }

  function docxInlineRuns(spans, links) {
    return (spans || []).map(function (s) {
      var run = docxRun(s.t, {
        bold: s.bold,
        italic: s.italic,
        code: s.code,
        link: Boolean(s.link)
      });
      var relationshipId = s.link && links ? links.idFor(s.link) : "";
      return relationshipId
        ? '<w:hyperlink r:id="' + relationshipId + '">' + run + "</w:hyperlink>"
        : run;
    }).join("");
  }

  function docxTable(rows, links) {
    if (!rows || !rows.length) return "";
    var cols = rows[0].length || 1;
    var pctEach = Math.floor(5000 / cols);
    var border = '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D7DCE3"/><w:left w:val="single" w:sz="4" w:color="D7DCE3"/><w:bottom w:val="single" w:sz="4" w:color="D7DCE3"/><w:right w:val="single" w:sz="4" w:color="D7DCE3"/><w:insideH w:val="single" w:sz="4" w:color="D7DCE3"/><w:insideV w:val="single" w:sz="4" w:color="D7DCE3"/></w:tblBorders>';
    var grid = '<w:tblGrid>';
    for (var g = 0; g < cols; g++) grid += '<w:gridCol w:w="' + Math.floor(9000 / cols) + '"/>';
    grid += "</w:tblGrid>";
    var tbl = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/>' + border + "</w:tblPr>" + grid;
    rows.forEach(function (row, ri) {
      tbl += "<w:tr>";
      row.forEach(function (cell) {
        var shd = ri === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : "";
        var cellSpans = cvParseInline(cell).map(function tableStyle(span) {
          return ri === 0 ? Object.assign({}, span, { bold: true }) : span;
        });
        tbl += '<w:tc><w:tcPr><w:tcW w:w="' + pctEach + '" w:type="pct"/>' + shd + '</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>' + docxInlineRuns(cellSpans, links) + "</w:p></w:tc>";
      });
      tbl += "</w:tr>";
    });
    tbl += "</w:tbl>";
    return tbl + '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
  }

  function docxMarkdownParagraphs(text, links) {
    var blocks = cvParseBlocks(text);
    var out = [];
    blocks.forEach(function (b) {
      if (b.type === "heading") {
        var style = b.level <= 1 ? "Heading1" : b.level === 2 ? "Heading2" : b.level === 3 ? "Heading3" : "Heading4";
        out.push('<w:p><w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' + docxInlineRuns(b.spans.map(function (s) { return Object.assign({}, s, { bold: true }); }), links) + "</w:p>");
      } else if (b.type === "para") {
        out.push('<w:p><w:pPr><w:pStyle w:val="MsgBody"/></w:pPr>' + docxInlineRuns(b.spans, links) + "</w:p>");
      } else if (b.type === "list") {
        b.items.forEach(function (item, idx) {
          var prefix = b.ordered ? (idx + 1) + ". " : "• ";
          out.push('<w:p><w:pPr><w:pStyle w:val="MsgBody"/><w:ind w:left="360" w:hanging="360"/></w:pPr>' + docxRun(prefix) + docxInlineRuns(item, links) + "</w:p>");
        });
      } else if (b.type === "code") {
        var codeRuns = String(b.code).split("\n").map(function (line) { return '<w:t xml:space="preserve">' + escapeXml(line) + "</w:t>"; }).join("<w:br/>");
        out.push('<w:p><w:pPr><w:pStyle w:val="MsgBody"/><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="20"/></w:rPr>' + codeRuns + "</w:r></w:p>");
      } else if (b.type === "quote") {
        out.push('<w:p><w:pPr><w:pStyle w:val="MsgBody"/><w:ind w:left="360"/></w:pPr>' + docxInlineRuns(b.spans.map(function (s) { return Object.assign({}, s, { italic: true }); }), links) + "</w:p>");
      } else if (b.type === "table") {
        out.push(docxTable(b.rows, links));
      } else if (b.type === "hr") {
        out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="E6E9EF"/></w:pBdr></w:pPr></w:p>');
      }
    });
    if (!out.length) out.push(paragraph(" ", "MsgBody"));
    return out;
  }

  function buildDocxBytes(conversations, options) {
    var paragraphs = [];
    var links = createDocxLinkRegistry();
    var renderMd = !!(options && options.renderMarkdown);
    var list = normalizeConversations(conversations);
    var messageCount = list.reduce(function countMessages(total, conversation) {
      return total + conversation.messages.length;
    }, 0);
    // Word 面向「人阅读/可编辑的文档」:阅读式排版(说话人当小标题 + 段落正文),不是聊天气泡。
    paragraphs.push(paragraph(documentTitle(list, options), "Title"));
    paragraphs.push(paragraph("导出于 " + exportTimestamp(options) + " · " + messageCount + " 条消息", "Meta"));

    list.forEach(function appendConversation(conversation, conversationIndex) {
      if (conversationIndex > 0) {
        paragraphs.push(pageBreakParagraph());
      }
      // 单对话时文档标题即对话标题,不再重复;多对话才加对话小标题。
      if (list.length > 1) {
        paragraphs.push(paragraph(conversation.title, "Heading1"));
        var sub = [conversationTimeText(conversation), conversation.messages.length + " 条消息"].filter(Boolean).join(" · ");
        if (sub) paragraphs.push(paragraph(sub, "Meta"));
      }

      conversation.messages.forEach(function appendMessage(message) {
        var user = isUserMessage(message.role);
        paragraphs.push(paragraph(speakerName(message.role), user ? "SpeakerUser" : "SpeakerBot"));
        // renderMarkdown 时按 Markdown 渲染成 Word 结构(标题/加粗/行内代码/代码块/列表/表格);
        // 否则保留原始文本分段(单测与机器可读路径走这条,保证结构化内容逐字保留)。
        if (renderMd) {
          docxMarkdownParagraphs(message.text || message.content || " ", links).forEach(function appendBlock(block) {
            paragraphs.push(block);
          });
        } else {
          String(message.text || message.content || " ").replace(/\r\n/g, "\n").split(/\n{2,}/).forEach(function appendRaw(block) {
            paragraphs.push(paragraph(block || " ", "MsgBody"));
          });
        }
        var foot = messageFootnote(message);
        if (foot) {
          paragraphs.push(paragraph(foot, "Footnote"));
        }
      });
    });

    // 推广页脚保持为一条紧凑尾注，避免短对话仅因宣传文字产生空白尾页。
    paragraphs.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="E6E9EF"/></w:pBdr></w:pPr></w:p>');
    paragraphs.push(paragraph(EXPORT_PROMO_NAME + " · " + EXPORT_PROMO_URL, "PromoFooter"));

    var documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>' +
      paragraphs.join("") +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:cols w:space="720"/></w:sectPr>' +
      "</w:body></w:document>";

    var zip = buildZip([
      {
        name: "[Content_Types].xml",
        content:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
          '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
          '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
          "</Types>"
      },
      {
        name: "_rels/.rels",
        content:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
          '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
          "</Relationships>"
      },
      { name: "word/document.xml", content: documentXml },
      {
        name: "word/_rels/document.xml.rels",
        content:
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          links.xml() +
          "</Relationships>"
      },
      {
        name: "word/styles.xml",
        content:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:color w:val="111827"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="300" w:lineRule="auto" w:after="120"/></w:pPr></w:pPrDefault></w:docDefaults>' +
          '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="220"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="34"/><w:color w:val="111827"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="27"/><w:color w:val="1F4F9F"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="23"/><w:color w:val="111827"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="21"/><w:color w:val="1F2937"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="20"/><w:color w:val="1F4F9F"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:color w:val="64748B"/><w:sz w:val="20"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="ContentLabel"><w:name w:val="Content Label"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="21"/><w:color w:val="111827"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="BodyText"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="320" w:lineRule="auto" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:color w:val="111827"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="SpeakerUser"><w:name w:val="Speaker User"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="23"/><w:color w:val="215CB3"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="SpeakerBot"><w:name w:val="Speaker Bot"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="60"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:b/><w:sz w:val="23"/><w:color w:val="2A2E3A"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="MsgBody"><w:name w:val="Message Body"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:line="330" w:lineRule="auto" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:color w:val="1F2228"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="Footnote"><w:name w:val="Footnote"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="20" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:i/><w:sz w:val="16"/><w:color w:val="76808F"/></w:rPr></w:style>' +
          '<w:style w:type="paragraph" w:styleId="PromoFooter"><w:name w:val="Promo Footer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="20" w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:i/><w:sz w:val="16"/><w:color w:val="76808F"/></w:rPr></w:style>' +
          "</w:styles>"
      },
      {
        name: "docProps/core.xml",
        content:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">' +
          "<dc:title>" + escapeXml(exportTitle(options)) + "</dc:title>" +
          "</cp:coreProperties>"
      },
      {
        name: "docProps/app.xml",
        content:
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>ChatGPT Model Usage Counter</Application></Properties>'
      }
    ]);

    return zip;
  }

  function buildDocx(conversations, options) {
    return new Blob([buildDocxBytes(conversations, options || {})], { type: DOCX_MIME });
  }

  // 运行时 Word 导出走这条:把 Markdown 渲染成 Word 结构(标题/加粗/代码块/列表/表格),"参考 ChatGPT"。
  function buildDocxRenderedBlob(conversations, options) {
    var opts = Object.assign({}, options || {}, { renderMarkdown: true });
    return new Blob([buildDocxBytes(conversations, opts)], { type: DOCX_MIME });
  }

  function appendDocxContentParagraphs(paragraphs, text) {
    var lines = contentLines(text || " ");
    if (!lines.length) {
      paragraphs.push(paragraph(" ", "BodyText"));
      return;
    }
    lines.forEach(function appendLine(line) {
      paragraphs.push(paragraph(line || " ", "BodyText"));
    });
  }

  function paragraph(text, style) {
    var styleXml = style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : "";
    var textParts = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    var textXml = textParts.map(function textPartXml(part) {
      return '<w:t xml:space="preserve">' + escapeXml(part) + "</w:t>";
    }).join("<w:br/>");
    return (
      "<w:p>" +
      styleXml +
      '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/></w:rPr>' +
      textXml +
      "</w:r></w:p>"
    );
  }

  function pageBreakParagraph() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function browserRequired() {
    if (!canRenderCanvas()) {
      throw new Error("This export format requires a browser canvas.");
    }
  }

  function wrapText(context, text, maxWidth) {
    var lines = [];
    var line = "";
    function pushLine() {
      lines.push(line.trimEnd());
      line = "";
    }
    Array.from(String(text || "")).forEach(function append(character) {
      var candidate = line + character;
      if (context.measureText(candidate).width > maxWidth && line) {
        pushLine();
        if (/\s/.test(character)) {
          return;
        }
        line = character;
        return;
      }
      line = candidate;
    });
    if (line) {
      pushLine();
    }
    return lines.length ? lines : [""];
  }

  function wrapPdfText(text, maxChars, maxUnits) {
    var lines = [];
    String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").forEach(function wrapLine(line) {
      if (!line) {
        lines.push("");
        return;
      }
      var current = "";
      var currentUnits = 0;
      var lastBreakIndex = -1;
      Array.from(line).forEach(function append(character) {
        var units = /[^\x20-\x7e]/.test(character) ? 2 : 1;
        if (current && (current.length + 1 > maxChars || currentUnits + units > maxUnits)) {
          if (lastBreakIndex > 0) {
            lines.push(current.slice(0, lastBreakIndex).trimEnd());
            current = current.slice(lastBreakIndex).trimStart();
            currentUnits = Array.from(current).reduce(function countUnits(total, item) {
              return total + (/[^\x20-\x7e]/.test(item) ? 2 : 1);
            }, 0);
            lastBreakIndex = -1;
            Array.from(current).forEach(function rememberBreak(item, itemIndex) {
              if (/\s/.test(item)) {
                lastBreakIndex = itemIndex + 1;
              }
            });
          } else {
            lines.push(current.trimEnd());
            current = "";
            currentUnits = 0;
            lastBreakIndex = -1;
            if (/\s/.test(character)) {
              return;
            }
          }
        }
        current += character;
        currentUnits += units;
        if (/\s/.test(character)) {
          lastBreakIndex = current.length;
        }
      });
      if (current) {
        lines.push(current.trimEnd());
      }
    });
    return lines.length ? lines : [""];
  }

  function renderCanvases(conversations) {
    browserRequired();
    var width = 1240;
    var height = 1754;
    var margin = 80;
    var canvases = [];
    var canvas = null;
    var context = null;
    var y = 0;

    function newPage() {
      canvas = root.document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#111827";
      context.font = "24px system-ui, Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif";
      y = margin;
      canvases.push(canvas);
    }

    function line(text, font, color) {
      var fontSize = Number((String(font || "").match(/(\d+(?:\.\d+)?)px/) || [])[1]) || 24;
      var lineHeight = Math.ceil(fontSize * 1.32);
      context.font = font;
      context.fillStyle = color || "#111827";
      wrapText(context, text, width - margin * 2).forEach(function draw(part) {
        if (y > height - margin) {
          newPage();
          context.font = font;
          context.fillStyle = color || "#111827";
        }
        context.fillText(part, margin, y);
        y += lineHeight;
      });
    }

    newPage();
    textLines(conversations).forEach(function drawText(rawLine) {
      var value = rawLine || " ";
      if (/^-{6,}$/.test(value)) {
        y += 12;
        context.strokeStyle = "#dbe3ee";
        context.beginPath();
        context.moveTo(margin, y);
        context.lineTo(width - margin, y);
        context.stroke();
        y += 18;
        return;
      }
      if (value === "ChatGPT Conversation Export" || /^.+ Export$/.test(value)) {
        y += 18;
        line(value, "36px system-ui, Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif", "#111827");
        y += 12;
        return;
      }
      if (/^Conversation \d+: /.test(value)) {
        y += 12;
        line(value, "28px system-ui, Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif", "#2563eb");
        return;
      }
      if (/^Message \d+ - /.test(value)) {
        y += 10;
        line(value, "26px system-ui, Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif", "#111827");
        return;
      }
      line(value, "24px system-ui, Microsoft YaHei, Noto Sans CJK SC, PingFang SC, sans-serif", /^[A-Za-z ]+: /.test(value) ? "#64748b" : "#111827");
    });

    return canvases;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function executor(resolve, reject) {
      canvas.toBlob(function resolveBlob(blob) {
        if (!blob) {
          reject(new Error("Canvas did not produce export image bytes."));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function blobToUint8Array(blob) {
    return blob.arrayBuffer().then(function toBytes(buffer) {
      return new Uint8Array(buffer);
    });
  }

  function canRenderCanvas() {
    return Boolean(root.document && typeof root.document.createElement === "function");
  }

  function renderImageCanvas(canvases) {
    var sourceWidth = canvases[0].width;
    var sourceHeight = canvases[0].height;
    var pageCount = canvases.length;
    var maxWidth = 1800;
    var maxHeight = 32000;
    var maxPixels = 42000000;
    var gap = 24;
    var columns = 1;
    var rows = pageCount;
    var widthScale = (maxWidth - gap * 2) / sourceWidth;
    var heightScale = (maxHeight - gap * (rows + 1)) / (sourceHeight * rows);
    var pixelScale = Math.sqrt(maxPixels / (sourceWidth * sourceHeight * rows));
    var scale = Math.min(1, widthScale, heightScale, pixelScale);
    scale = Math.max(0.68, scale);

    var output = root.document.createElement("canvas");
    var pageWidth = Math.ceil(sourceWidth * scale);
    var pageHeight = Math.ceil(sourceHeight * scale);
    output.width = Math.ceil(pageWidth * columns + gap * (columns + 1));
    output.height = Math.ceil(pageHeight * rows + gap * (rows + 1));
    var context = output.getContext("2d");
    context.fillStyle = "#f8fafc";
    context.fillRect(0, 0, output.width, output.height);

    canvases.forEach(function drawPage(page, index) {
      var column = 0;
      var row = index;
      var x = gap + column * (pageWidth + gap);
      var y = gap + row * (pageHeight + gap);
      context.fillStyle = "#ffffff";
      context.fillRect(x, y, pageWidth, pageHeight);
      context.drawImage(page, x, y, pageWidth, pageHeight);
      context.strokeStyle = "#dbe3ee";
      context.strokeRect(x, y, pageWidth, pageHeight);
    });

    return output;
  }

  function asciiBytes(text) {
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i += 1) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  function pdfUtf16HexText(text) {
    var value = String(text || "").replace(/\r/g, "");
    var hex = "FEFF";
    for (var index = 0; index < value.length; index += 1) {
      hex += value.charCodeAt(index).toString(16).toUpperCase().padStart(4, "0");
    }
    return hex;
  }

  function buildPdfMetadataXml(text) {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">',
      '<rdf:Description rdf:about="" dc:format="application/pdf">',
      '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">',
      escapeXml(text),
      "</rdf:li></rdf:Alt></dc:description>",
      "</rdf:Description>",
      "</rdf:RDF>",
      "</x:xmpmeta>"
    ].join("");
  }

  function pdfLineStyle(line) {
    if (/^-{6,}$/.test(line)) {
      return { separator: true };
    }
    if (line === "ChatGPT Conversation Export" || /^.+ Export$/.test(line)) {
      return { text: line, fontSize: 19, lineHeight: 27, color: "0.07 0.09 0.15", after: 4 };
    }
    if (/^Conversation \d+: /.test(line)) {
      return { text: line, fontSize: 15, lineHeight: 22, color: "0.12 0.31 0.62", before: 4, after: 2 };
    }
    if (/^Message \d+ - /.test(line)) {
      return { text: line, fontSize: 13, lineHeight: 19, color: "0.07 0.09 0.15", before: 3, after: 1 };
    }
    return { text: line, fontSize: 10, lineHeight: line ? 15 : 8, color: /^[A-Za-z ]+: /.test(line) ? "0.28 0.33 0.41" : "0.07 0.09 0.15", before: 0, after: 0 };
  }

  // PDF 面向「人阅读的文档」:整宽阅读式排版(说话人当小标题 + 段落正文),不是聊天气泡。
  function layoutPdfPages(conversations, options) {
    var list = normalizeConversations(conversations);
    var pageWidth = 595;
    var pageHeight = 842;
    var margin = 56;
    var contentW = pageWidth - margin * 2;
    var fontSize = 11;
    var lineH = 17;
    // 已给 STSong-Light 加了 /W(ASCII 半角),所以 1 个排版单位 ≈ 半个字号;CJK 占 2 单位。
    var unitW = fontSize * 0.5;
    var maxUnits = Math.max(20, Math.floor(contentW / unitW));
    var INK = "0.12 0.13 0.16";
    var MUTED = "0.46 0.51 0.58";
    var USER_COLOR = "0.13 0.36 0.70";
    var BOT_COLOR = "0.16 0.18 0.23";
    var pages = [[]];
    var y = pageHeight - margin;

    function currentPage() { return pages[pages.length - 1]; }
    function newPage() { pages.push([]); y = pageHeight - margin; }
    function ensureSpace(required) { if (y - required < margin) { newPage(); } }
    function pushText(x, ty, text, size, color, bold) {
      currentPage().push({ type: "text", x: x, y: ty, text: text || " ", fontSize: size, color: color, bold: !!bold });
    }

    // 隐藏全文层:供 PDF 文本搜索/复制(完整未折行)。
    var fullText = buildPlainTextLines(conversations, options).join("\n");
    if (fullText.trim()) {
      currentPage().push({ type: "text", x: margin, y: y, text: fullText, fontSize: 1, color: "1 1 1", hidden: true });
    }

    // 文档标题 + 摘要 + 分隔线
    pushText(margin, y - 18, documentTitle(list, options), 20, INK, true);
    y -= 30;
    var msgCount = list.reduce(function countMessages(t, c) { return t + c.messages.length; }, 0);
    pushText(margin, y - 11, "导出于 " + exportTimestamp(options) + " · " + msgCount + " 条消息", 9.5, MUTED);
    y -= 18;
    currentPage().push({ type: "line", x1: margin, x2: pageWidth - margin, y: y });
    y -= 20;

    list.forEach(function conversationToPdf(conv, ci) {
      if (ci > 0) { newPage(); }
      // 单对话时文档标题即对话标题;多对话时再加一行对话小标题。
      if (list.length > 1) {
        ensureSpace(30);
        pushText(margin, y - 14, conv.title, 15, USER_COLOR, true);
        y -= 22;
        var sub = [conversationTimeText(conv), conv.messages.length + " 条消息"].filter(Boolean).join(" · ");
        if (sub) { pushText(margin, y - 9, sub, 9, MUTED); y -= 16; }
        y -= 6;
      }

      conv.messages.forEach(function messageToPdf(message) {
        var user = isUserMessage(message.role);
        var lines = [];
        contentLines(message.text || message.content || "").forEach(function wrapRaw(raw) {
          if (raw === "") { lines.push(""); return; }
          wrapPdfText(raw, maxUnits, maxUnits).forEach(function pushWrapped(w) { lines.push(w); });
        });
        if (!lines.length) { lines = [""]; }
        // 说话人小标题(着色加粗)
        ensureSpace(lineH + 12);
        y -= 10;
        pushText(margin, y - fontSize, speakerName(message.role), 11.5, user ? USER_COLOR : BOT_COLOR, true);
        y -= lineH + 2;
        // 正文段落(整宽)
        lines.forEach(function drawLine(l) {
          if (l === "") { y -= Math.round(lineH * 0.5); return; }
          ensureSpace(lineH);
          pushText(margin, y - fontSize + 2, l, fontSize, INK);
          y -= lineH;
        });
        // 助手脚注(模型 / 功能)
        var foot = messageFootnote(message);
        if (foot) {
          ensureSpace(14);
          pushText(margin, y - 9, foot, 8.5, MUTED);
          y -= 14;
        }
      });
    });

    return pages.filter(function hasContent(page) { return page.length > 0; });
  }

  function pdfContentStream(page) {
    return page.map(function draw(item) {
      if (item.type === "line") {
        return "0.86 0.89 0.93 RG\n" + item.x1 + " " + item.y.toFixed(2) + " m " + item.x2 + " " + item.y.toFixed(2) + " l S";
      }
      if (item.type === "rect") {
        return item.color + " rg\n" + item.x.toFixed(2) + " " + item.y.toFixed(2) + " " + item.w.toFixed(2) + " " + item.h.toFixed(2) + " re f";
      }
      var lines = ["BT", "/F1 " + item.fontSize + " Tf"];
      if (item.hidden) {
        lines.push("3 Tr");
      } else if (item.bold) {
        // 只有一种字重的 CID 字体:用「填充+描边」+细线宽模拟加粗,让说话人标签像小标题。
        lines.push(item.color + " RG", "0.35 w", "2 Tr");
      } else {
        lines.push("0 Tr");
      }
      lines.push(item.color + " rg", item.x + " " + item.y.toFixed(2) + " Td", "<" + pdfUtf16HexText(item.text) + "> Tj", "ET");
      return lines.join("\n");
    }).join("\n");
  }

  function buildPdfBytes(conversations, options) {
    var pages = layoutPdfPages(conversations, options || {});
    var metadataBytes = encodeUtf8(buildPdfMetadataXml(buildPlainTextLines(conversations, options || {}).join("\n")));
    var parts = [asciiBytes("%PDF-1.4\n%\xff\xff\xff\xff\n")];
    var offsets = [0];
    var objectCount = 4 + pages.length * 2;
    var currentOffset = parts[0].length;

    function addObject(id, bodyParts) {
      offsets[id] = currentOffset;
      var header = asciiBytes(id + " 0 obj\n");
      var footer = asciiBytes("\nendobj\n");
      var body = concatBytes(bodyParts);
      var objectBytes = concatBytes([header, body, footer]);
      parts.push(objectBytes);
      currentOffset += objectBytes.length;
    }

    var kids = pages.map(function pageRef(_, index) {
      return 5 + index * 2 + " 0 R";
    });

    addObject(1, [asciiBytes("<< /Type /Catalog /Pages 2 0 R /Metadata 4 0 R >>")]);
    addObject(2, [asciiBytes("<< /Type /Pages /Count " + pages.length + " /Kids [" + kids.join(" ") + "] >>")]);
    addObject(3, [
      asciiBytes(
        "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor << /Type /FontDescriptor /FontName /STSong-Light /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >> /DW 1000 /W [1 95 500] >>] >>"
      )
    ]);
    addObject(4, [
      asciiBytes("<< /Type /Metadata /Subtype /XML /Length " + metadataBytes.length + " >>\nstream\n"),
      metadataBytes,
      asciiBytes("\nendstream")
    ]);

    pages.forEach(function addPage(page, index) {
      var pageId = 5 + index * 2;
      var contentId = pageId + 1;
      var content = pdfContentStream(page);
      addObject(pageId, [
        asciiBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents " + contentId + " 0 R >>")
      ]);
      addObject(contentId, [
        asciiBytes("<< /Length " + asciiBytes(content).length + " >>\nstream\n" + content + "\nendstream")
      ]);
    });

    var xrefOffset = currentOffset;
    var xrefLines = ["xref", "0 " + (objectCount + 1), "0000000000 65535 f "];
    for (var i = 1; i <= objectCount; i += 1) {
      xrefLines.push(String(offsets[i]).padStart(10, "0") + " 00000 n ");
    }
    var trailer =
      xrefLines.join("\n") +
      "\ntrailer\n<< /Size " +
      (objectCount + 1) +
      " /Root 1 0 R >>\nstartxref\n" +
      xrefOffset +
      "\n%%EOF";
    parts.push(asciiBytes(trailer));
    return concatBytes(parts);
  }

  function buildPdf(conversations, options) {
    return new Blob([buildPdfBytes(conversations, options || {})], { type: PDF_MIME });
  }

  function buildPdfFromJpegs(images, metadataText) {
    var metadataBytes = encodeUtf8(buildPdfMetadataXml(metadataText || ""));
    var parts = [asciiBytes("%PDF-1.4\n%\xff\xff\xff\xff\n")];
    var offsets = [0];
    var objectCount = 3 + images.length * 3;
    var currentOffset = parts[0].length;

    function addObject(id, bodyParts) {
      offsets[id] = currentOffset;
      var header = asciiBytes(id + " 0 obj\n");
      var footer = asciiBytes("\nendobj\n");
      var body = concatBytes(bodyParts);
      var objectBytes = concatBytes([header, body, footer]);
      parts.push(objectBytes);
      currentOffset += objectBytes.length;
    }

    var kids = [];
    images.forEach(function addImageObjects(image, index) {
      var pageId = 4 + index * 3;
      kids.push(pageId + " 0 R");
    });

    addObject(1, [asciiBytes("<< /Type /Catalog /Pages 2 0 R /Metadata 3 0 R >>")]);
    addObject(2, [asciiBytes("<< /Type /Pages /Count " + images.length + " /Kids [" + kids.join(" ") + "] >>")]);
    addObject(3, [
      asciiBytes("<< /Type /Metadata /Subtype /XML /Length " + metadataBytes.length + " >>\nstream\n"),
      metadataBytes,
      asciiBytes("\nendstream")
    ]);

    images.forEach(function addPage(image, index) {
      var pageId = 4 + index * 3;
      var contentId = pageId + 1;
      var imageId = pageId + 2;
      var content = "q\n595 0 0 842 0 0 cm\n/Im" + index + " Do\nQ";
      addObject(pageId, [
        asciiBytes(
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im" +
            index +
            " " +
            imageId +
            " 0 R >> >> >> /Contents " +
            contentId +
            " 0 R >>"
        )
      ]);
      addObject(contentId, [
        asciiBytes("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream")
      ]);
      addObject(imageId, [
        asciiBytes(
          "<< /Type /XObject /Subtype /Image /Width " +
            image.width +
            " /Height " +
            image.height +
            " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
            image.bytes.length +
            " >>\nstream\n"
        ),
        image.bytes,
        asciiBytes("\nendstream")
      ]);
    });

    var xrefOffset = currentOffset;
    var xrefLines = ["xref", "0 " + (objectCount + 1), "0000000000 65535 f "];
    for (var i = 1; i <= objectCount; i += 1) {
      xrefLines.push(String(offsets[i]).padStart(10, "0") + " 00000 n ");
    }
    var trailer =
      xrefLines.join("\n") +
      "\ntrailer\n<< /Size " +
      (objectCount + 1) +
      " /Root 1 0 R >>\nstartxref\n" +
      xrefOffset +
      "\n%%EOF";
    parts.push(asciiBytes(trailer));
    return new Blob(parts, { type: PDF_MIME });
  }

  function makeBrowserBlob(format, conversations) {
    var canvases = renderCanvases(conversations);
    if (format === "image") {
      var imageCanvas = renderImageCanvas(canvases);
      return canvasToBlob(imageCanvas, PNG_MIME).then(function result(blob) {
        return blobToUint8Array(blob).then(function withMetadata(bytes) {
          return {
            blob: new Blob([addPngExportTextChunks(bytes, buildPlainTextLines(conversations).join("\n"))], { type: PNG_MIME }),
            filename: makeExportName(conversations, "png")
          };
        });
      });
    }

    if (format === "pdf") {
      var metadataText = buildPlainTextLines(conversations).join("\n");
      return Promise.all(
        canvases.map(function canvasToJpeg(canvas) {
          return canvasToBlob(canvas, "image/jpeg", 0.92).then(blobToUint8Array).then(function imageBytes(bytes) {
            return { width: canvas.width, height: canvas.height, bytes: bytes };
          });
        })
      ).then(function result(images) {
        return { blob: buildPdfFromJpegs(images, metadataText), filename: makeExportName(conversations, "pdf") };
      });
    }

    throw new Error("Unsupported browser export format: " + format);
  }

  function createExport(format, conversations) {
    if (format === "json" || format === "md") {
      return Promise.resolve(makeTextBlob(format, conversations));
    }
    if (format === "docx") {
      return Promise.resolve({ blob: buildDocx(conversations), filename: makeExportName(conversations, "docx") });
    }
    if (format === "pdf") {
      return Promise.resolve({ blob: buildPdf(conversations), filename: makeExportName(conversations, "pdf") });
    }
    if (format === "image") {
      if (canRenderCanvas()) {
        return makeBrowserBlob("image", conversations);
      }
      return buildPngBytesAsync(conversations).then(function pngResult(bytes) {
        return { blob: new Blob([bytes], { type: PNG_MIME }), filename: makeExportName(conversations, "png") };
      });
    }
    throw new Error("Unsupported export format: " + format);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var anchor = root.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    root.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function revoke() {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  // —— 账号安全的对话读取 ——
  // 只读取「当前页面已渲染」的对话 DOM,绝不调用任何 ChatGPT/OpenAI 后端接口,
  // 不读取 cookie / token,不发起网络请求。用户显式点击导出时才执行。
  // ChatGPT 把助手消息的 Markdown 在页面里渲染成 HTML(.markdown 容器内的 h1-6 / strong / table / pre 等)。
  // 直接取 innerText 会把 ## ** | ``` 等记号全抹掉,导出就成同字号纯文字。这里从 HTML 重建 Markdown。
  function mdRepeatStr(s, n) { var r = ""; for (var i = 0; i < n; i++) { r += s; } return r; }

  function mdInlineFromDom(node) {
    if (!node) { return ""; }
    if (node.nodeType === 3) { return String(node.nodeValue || ""); }
    if (node.nodeType !== 1) { return ""; }
    var tag = String(node.tagName || "").toLowerCase();
    var inner = "";
    if (node.childNodes) { Array.prototype.forEach.call(node.childNodes, function (c) { inner += mdInlineFromDom(c); }); }
    if (tag === "strong" || tag === "b") { return inner.trim() ? "**" + inner + "**" : inner; }
    if (tag === "em" || tag === "i") { return inner.trim() ? "*" + inner + "*" : inner; }
    if (tag === "code") { return "`" + (node.textContent || inner) + "`"; }
    if (tag === "a") { var href = node.getAttribute ? (node.getAttribute("href") || "") : ""; return href ? "[" + inner + "](" + href + ")" : inner; }
    if (tag === "br") { return "\n"; }
    return inner;
  }

  function mdTableFromDom(table) {
    if (!table || typeof table.querySelectorAll !== "function") { return String((table && table.textContent) || ""); }
    var trs = table.querySelectorAll("tr");
    var rows = [];
    Array.prototype.forEach.call(trs, function (tr) {
      var cells = [];
      Array.prototype.forEach.call(tr.querySelectorAll("th,td"), function (c) {
        cells.push(String(c.textContent || "").trim().replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " "));
      });
      if (cells.length) { rows.push("| " + cells.join(" | ") + " |"); }
    });
    if (rows.length > 0) {
      var firstTr = trs[0];
      var cols = firstTr ? firstTr.querySelectorAll("th,td").length : 1;
      rows.splice(1, 0, "|" + mdRepeatStr(" --- |", Math.max(1, cols)));
    }
    return rows.join("\n");
  }

  function mdBlockFromDom(node, out) {
    if (!node) { return; }
    if (node.nodeType === 3) { var t = String(node.nodeValue || "").trim(); if (t) { out.push(t); } return; }
    if (node.nodeType !== 1) { return; }
    var tag = String(node.tagName || "").toLowerCase();
    if (/^h[1-6]$/.test(tag)) { out.push(mdRepeatStr("#", Number(tag.charAt(1))) + " " + mdInlineFromDom(node).trim()); return; }
    if (tag === "p") { var p = mdInlineFromDom(node).trim(); if (p) { out.push(p); } return; }
    if (tag === "ul" || tag === "ol") {
      var i = 1, ordered = tag === "ol", items = [];
      Array.prototype.forEach.call(node.children || [], function (li) {
        if (String(li.tagName || "").toLowerCase() !== "li") { return; }
        items.push((ordered ? (i++) + ". " : "- ") + mdInlineFromDom(li).trim());
      });
      if (items.length) { out.push(items.join("\n")); }
      return;
    }
    if (tag === "pre") {
      var codeEl = typeof node.querySelector === "function" ? node.querySelector("code") : null;
      var codeText = codeEl ? (codeEl.textContent || "") : (node.textContent || "");
      out.push("```\n" + String(codeText).replace(/\n+$/, "") + "\n```");
      return;
    }
    if (tag === "blockquote") {
      var bq = [];
      if (node.childNodes) { Array.prototype.forEach.call(node.childNodes, function (c) { mdBlockFromDom(c, bq); }); }
      out.push(bq.join("\n").split("\n").map(function (l) { return "> " + l; }).join("\n"));
      return;
    }
    if (tag === "table") { out.push(mdTableFromDom(node)); return; }
    if (tag === "hr") { out.push("---"); return; }
    if (node.childNodes) { Array.prototype.forEach.call(node.childNodes, function (c) { mdBlockFromDom(c, out); }); }
  }

  function domMarkdown(el) {
    var out = [];
    if (el && el.childNodes) { Array.prototype.forEach.call(el.childNodes, function (c) { mdBlockFromDom(c, out); }); }
    return out.join("\n\n");
  }

  function domMessageText(node) {
    if (!node) {
      return "";
    }
    var body = null;
    if (typeof node.querySelector === "function") {
      body = node.querySelector(".markdown") ||
        node.querySelector("[data-message-text]") ||
        node.querySelector(".whitespace-pre-wrap");
    }
    var holder = body || node;
    // 助手消息(.markdown 渲染容器)从 HTML 重建 Markdown,保留标题/表格/加粗/代码/列表;失败再退回 innerText。
    if (body && /(^|\s)markdown(\s|$)/.test(String(body.className || "")) && body.childNodes && body.childNodes.length && typeof body.querySelectorAll === "function") {
      try {
        var md = domMarkdown(body);
        if (md && md.trim()) { return normalizeText(md); }
      } catch (mdError) { void mdError; }
    }
    var raw = holder.innerText != null ? holder.innerText : (holder.textContent || "");
    return normalizeText(raw);
  }

  function domConversationId(url) {
    var match = /\/(?:c|g\/[^/]+\/c)\/([0-9a-zA-Z-]{6,})/.exec(String(url || ""));
    return match ? match[1] : "";
  }

  function domConversationTitle(doc) {
    var title = normalizeText(doc && doc.title ? doc.title : "");
    return title.replace(/\s*[-|]\s*ChatGPT\s*$/i, "").replace(/^ChatGPT\s*[-|]\s*/i, "").trim();
  }

  function collectConversationFromDom(documentLike) {
    var doc = documentLike || (root && root.document) || null;
    if (!doc || typeof doc.querySelectorAll !== "function") {
      return { id: "", title: "", url: "", messages: [] };
    }
    var nodes = doc.querySelectorAll("[data-message-author-role]");
    var messages = [];
    Array.prototype.forEach.call(nodes, function collect(node, index) {
      var role = typeof node.getAttribute === "function" ? node.getAttribute("data-message-author-role") || "" : "";
      if (role !== "user" && role !== "assistant") {
        return;
      }
      var content = domMessageText(node);
      if (!content) {
        return;
      }
      messages.push({
        id: (typeof node.getAttribute === "function" && node.getAttribute("data-message-id")) || String(index),
        role: role,
        text: content,
        model: (typeof node.getAttribute === "function" && node.getAttribute("data-message-model-slug")) || ""
      });
    });
    var url = (root && root.location && root.location.href) ||
      (doc.location && doc.location.href) || "";
    var title = domConversationTitle(doc) ||
      (messages.length ? messages[0].text.slice(0, 60) : "") ||
      "ChatGPT conversation";
    return { id: domConversationId(url), title: title, url: url, messages: messages };
  }

  // ============================================================================
  // 画布渲染:系统中文字体 + Markdown 渲染 → 用于 PNG(直接 toBlob)与 PDF(切页嵌图)。
  // 取代只支持 ASCII 的像素字体渲染器,以及不嵌字体的 STSong PDF——这两者中文都无法正确显示。
  // ============================================================================
  // 导出推广页脚:简要介绍 + 链接。Chrome 商店链接尚未过审,暂用 GitHub 宣传链接。
  var EXPORT_PROMO_NAME = "ChatGPT Model Usage Counter";
  var EXPORT_PROMO_DESC = "按模型和日期统计 ChatGPT 用量,并把所选对话本地导出为 JSON / Markdown / PDF / Word / PNG。";
  var EXPORT_PROMO_URL = "https://github.com/Bsnblanc/chatgpt-model-usage-counter";

  var CV_FONT = "'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Segoe UI',system-ui,sans-serif";
  var CV_MONO = "'Cascadia Code','Consolas','SFMono-Regular',Menlo,monospace";

  function cvParseInline(text) {
    var s = String(text == null ? "" : text);
    var spans = [];
    var re = /(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*)/g;
    var last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) spans.push({ t: s.slice(last, m.index) });
      if (m[2] != null) spans.push({ t: m[2] + " (" + m[3] + ")", link: m[3] });
      else if (m[4] != null) spans.push({ t: m[4], bold: true });
      else if (m[5] != null) spans.push({ t: m[5], code: true });
      else if (m[6] != null) spans.push({ t: m[6], italic: true });
      last = re.lastIndex;
    }
    if (last < s.length) spans.push({ t: s.slice(last) });
    return spans.length ? spans : [{ t: s }];
  }

  function cvRowCells(line) {
    return line.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
  }

  function cvParseBlocks(text) {
    var lines = String(text == null ? "" : text).replace(/\r/g, "").split("\n");
    var blocks = [], i = 0;
    function blank(l) { return /^\s*$/.test(l); }
    function isPipeRow(l) { return /^\s*\|.*\|\s*$/.test(l); }
    function isTableDivider(l) { return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.indexOf("-") >= 0; }
    function pipeColCount(l) { return l.trim().replace(/^\||\|$/g, "").split("|").length; }
    while (i < lines.length) {
      var line = lines[i];
      if (/^```/.test(line)) {
        var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++; blocks.push({ type: "code", code: code.join("\n") }); continue;
      }
      // 标题识别:标准 ATX 是 # 后跟空格;额外放宽"# 后直接跟中文"(如 ###标题,中文里常省略空格),
      // 否则这类没有空格的中文标题会退化成带 # 的单行纯文本,只显示一行、不被当成标题。
      // 拉丁字母/数字仍要求空格,避免把 #标签 / #1 / #include / #! 误判成标题。
      if (/^\s*#{1,6}(\s+|[一-鿿])/.test(line)) {
        blocks.push({ type: "heading", level: line.match(/^\s*(#{1,6})/)[1].length, spans: cvParseInline(line.replace(/^\s*#{1,6}\s*/, "")) });
        i++; continue;
      }
      if (/^\s*>\s?/.test(line)) {
        var q = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        blocks.push({ type: "quote", spans: cvParseInline(q.join("\n")) }); continue;
      }
      // 表格识别:有分隔行(| --- |)按标准识别;没有分隔行但连续多列竖杠行也识别为表格,
      // 避免部分表格在导出里退化成竖杠纯文本(仍由竖杠表示)。
      if (isPipeRow(line) && i + 1 < lines.length &&
        (isTableDivider(lines[i + 1]) || (isPipeRow(lines[i + 1]) && pipeColCount(line) >= 2))) {
        var rows = [];
        while (i < lines.length && (isPipeRow(lines[i]) || isTableDivider(lines[i]))) {
          if (!isTableDivider(lines[i])) { rows.push(cvRowCells(lines[i])); }
          i++;
        }
        if (rows.length) { blocks.push({ type: "table", rows: rows }); continue; }
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        var items = [], ordered = /^\s*\d+[.)]/.test(line);
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) { items.push(cvParseInline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, ""))); i++; }
        blocks.push({ type: "list", ordered: ordered, items: items }); continue;
      }
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { blocks.push({ type: "hr" }); i++; continue; }
      if (blank(line)) { i++; continue; }
      var para = [line]; i++;
      while (i < lines.length && !blank(lines[i]) && !/^```/.test(lines[i]) && !/^\s*#{1,6}(\s+|[一-鿿])/.test(lines[i]) &&
        !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) { para.push(lines[i]); i++; }
      blocks.push({ type: "para", spans: cvParseInline(para.join("\n")) });
    }
    return blocks;
  }

  function cvWrap(ctx, spans, maxW, sizePx) {
    var tokens = [];
    spans.forEach(function (sp) {
      String(sp.t).split(/(\s+|\n)/).forEach(function (p) {
        if (p === "") return;
        if (p === "\n") { tokens.push({ nl: true }); return; }
        if (/^\s+$/.test(p)) { tokens.push({ t: " ", sp: true, bold: sp.bold, code: sp.code, italic: sp.italic, link: sp.link }); return; }
        var buf = "";
        for (var k = 0; k < p.length; k++) {
          var ch = p[k];
          if (/[⺀-鿿豈-﫿＀-￯　-〿぀-ヿ]/.test(ch)) {
            if (buf) { tokens.push({ t: buf, bold: sp.bold, code: sp.code, italic: sp.italic, link: sp.link }); buf = ""; }
            tokens.push({ t: ch, bold: sp.bold, code: sp.code, italic: sp.italic, link: sp.link });
          } else buf += ch;
        }
        if (buf) tokens.push({ t: buf, bold: sp.bold, code: sp.code, italic: sp.italic, link: sp.link });
      });
    });
    function fontFor(tok) { return (tok.bold ? "700 " : tok.italic ? "italic " : "") + sizePx + "px " + (tok.code ? CV_MONO : CV_FONT); }
    var lines = [], cur = [], curW = 0;
    tokens.forEach(function (tok) {
      if (tok.nl) { lines.push(cur); cur = []; curW = 0; return; }
      ctx.font = fontFor(tok);
      var w = ctx.measureText(tok.t).width;
      if (tok.sp && curW === 0) return;
      var pieces = [];
      if (w <= maxW || tok.sp) {
        pieces.push(Object.assign({}, tok, { w: w }));
      } else {
        var pieceText = "";
        var pieceWidth = 0;
        Array.from(tok.t).forEach(function splitCharacter(character) {
          var characterWidth = ctx.measureText(character).width;
          if (pieceText && pieceWidth + characterWidth > maxW) {
            pieces.push(Object.assign({}, tok, { t: pieceText, w: pieceWidth, sp: false }));
            pieceText = "";
            pieceWidth = 0;
          }
          pieceText += character;
          pieceWidth += characterWidth;
        });
        if (pieceText) {
          pieces.push(Object.assign({}, tok, { t: pieceText, w: pieceWidth, sp: false }));
        }
      }
      pieces.forEach(function appendPiece(piece) {
        if (curW + piece.w > maxW && curW > 0 && !piece.sp) {
          lines.push(cur);
          cur = [];
          curW = 0;
        }
        cur.push(piece);
        curW += piece.w;
      });
    });
    if (cur.length) lines.push(cur);
    return lines;
  }

  function cvRoundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function layoutConversationsCanvas(conversations, options) {
    var doc = root.document;
    if (!doc || typeof doc.createElement !== "function") { throw new Error("Canvas export requires a browser environment"); }
    options = options || {};
    var list = normalizeConversations(conversations);
    var width = 860, margin = 34, contentW = width - margin * 2;
    var ACCENT = "#1f6feb", USERC = "#0f766e", INK = "#1f2328", MUTED = "#6b7280", RULE = "#e6e9ef";
    var measure = doc.createElement("canvas").getContext("2d");
    var ops = [], y = margin;
    function addText(x, t, sizePx, color, opt) { opt = opt || {}; ops.push({ kind: "text", x: x, y: y, text: t, size: sizePx, color: color, bold: opt.bold, italic: opt.italic, font: opt.mono ? CV_MONO : CV_FONT }); }
    function gap(px) { y += px; }
    function rule(x1, x2) { ops.push({ kind: "rect", x: x1, y: y, w: x2 - x1, h: 1, color: RULE }); }
    function rect(x, w, h, color, radius) { ops.push({ kind: "rect", x: x, y: y, w: w, h: h, color: color, radius: radius || 0 }); }
    function drawSpans(spans, x, maxW, sizePx, color, forceBold, forceItalic) {
      if (forceBold) spans = spans.map(function (s) { return Object.assign({}, s, { bold: true }); });
      if (forceItalic) spans = spans.map(function (s) { return Object.assign({}, s, { italic: true }); });
      var rows = cvWrap(measure, spans, maxW, sizePx);
      var lh = Math.round(sizePx * 1.62);
      rows.forEach(function (toks) {
        var cx = x;
        toks.forEach(function (tok) {
          if (tok.code) ops.push({ kind: "rect", x: cx - 1, y: y - sizePx + 3, w: tok.w + 2, h: sizePx + 6, color: "#eef1f4", radius: 3 });
          ops.push({ kind: "text", x: cx, y: y + 1, text: tok.t, size: sizePx, color: tok.code ? "#b3261e" : tok.link ? ACCENT : color, bold: tok.bold, italic: tok.italic, font: tok.code ? CV_MONO : CV_FONT });
          cx += tok.w;
        });
        y += lh;
      });
    }
    function drawTable(rows, x, blockW) {
      if (!rows.length) return;
      var cols = 1;
      rows.forEach(function (r) { if (r.length > cols) { cols = r.length; } });
      var colW = blockW / cols, cellPad = 8, cellSize = 13, cellLh = Math.round(cellSize * 1.5), startY = y;
      rows.forEach(function (row, ri) {
        // 每个单元格先按列宽折行,行高取本行所有单元格的最大行数,避免文字溢出到相邻列或被裁掉。
        var cellLines = [], maxLines = 1;
        for (var ci = 0; ci < cols; ci++) {
          var spans = cvParseInline(String(row[ci] == null ? "" : row[ci]));
          if (ri === 0) { spans = spans.map(function (s) { return Object.assign({}, s, { bold: true }); }); }
          var wrapped = cvWrap(measure, spans, colW - cellPad * 2, cellSize);
          cellLines.push(wrapped);
          if (wrapped.length > maxLines) { maxLines = wrapped.length; }
        }
        var rh = maxLines * cellLh + 12;
        if (ri === 0) { rect(x, blockW, rh, "#f1f5f9"); }
        ops.push({ kind: "rect", x: x, y: y, w: blockW, h: 1, color: RULE });
        for (var cj = 0; cj < cols; cj++) {
          var cellX = x + cj * colW + cellPad, ty = y + 6 + cellSize;
          cellLines[cj].forEach(function (toks) {
            var cx = cellX;
            toks.forEach(function (tok) {
              ops.push({ kind: "text", x: cx, y: ty, text: tok.t, size: cellSize, color: tok.link ? ACCENT : ri === 0 ? "#0f172a" : "#334155", bold: tok.bold, italic: tok.italic, font: tok.code ? CV_MONO : CV_FONT });
              cx += tok.w;
            });
            ty += cellLh;
          });
        }
        y += rh;
      });
      ops.push({ kind: "rect", x: x, y: y, w: blockW, h: 1, color: RULE });
      for (var c = 0; c <= cols; c++) { ops.push({ kind: "rect", x: x + c * colW, y: startY, w: 1, h: y - startY, color: RULE }); }
    }
    function wrapCodeLine(line, maxW, sizePx) {
      var value = String(line == null ? "" : line);
      if (!value) {
        return [""];
      }
      measure.font = sizePx + "px " + CV_MONO;
      var rows = [];
      var current = "";
      var currentWidth = 0;
      Array.from(value).forEach(function appendCharacter(character) {
        var characterWidth = measure.measureText(character).width;
        if (current && currentWidth + characterWidth > maxW) {
          rows.push(current);
          current = "";
          currentWidth = 0;
        }
        current += character;
        currentWidth += characterWidth;
      });
      if (current || !rows.length) {
        rows.push(current);
      }
      return rows;
    }
    function drawBlocks(blocks, x, blockW) {
      blocks.forEach(function (b) {
        if (b.type === "heading") {
          // 标题分级:用字号、颜色、上方间距区分层级,只有 h1 加一条分隔线,避免"什么都是大标题"。
          var lvl = b.level || 1;
          var hStyle = lvl <= 1 ? { size: 21, color: INK, top: 18, bot: 7, rule: true }
            : lvl === 2 ? { size: 18, color: INK, top: 15, bot: 6, rule: false }
            : lvl === 3 ? { size: 16, color: INK, top: 12, bot: 4, rule: false }
            : lvl === 4 ? { size: 14.5, color: ACCENT, top: 10, bot: 3, rule: false }
            : { size: 13.5, color: MUTED, top: 9, bot: 3, rule: false };
          gap(hStyle.top);
          drawSpans(b.spans, x, blockW, hStyle.size, hStyle.color, true);
          if (hStyle.rule) { gap(3); rule(x, x + blockW); }
          gap(hStyle.bot);
        }
        else if (b.type === "para") { drawSpans(b.spans, x, blockW, 15, INK, false); gap(7); }
        else if (b.type === "list") { b.items.forEach(function (item, idx) { addText(x + 2, b.ordered ? (idx + 1) + "." : "•", 15, MUTED); drawSpans(item, x + 24, blockW - 24, 15, INK, false); gap(4); }); gap(4); }
        else if (b.type === "code") {
          var cpad = 10, clh = 20, codeSize = 13;
          var codeLines = String(b.code).split("\n").reduce(function wrapCode(out, line) {
            return out.concat(wrapCodeLine(line, blockW - cpad * 2, codeSize));
          }, []);
          var boxH = codeLines.length * clh + cpad * 2;
          rect(x, blockW, boxH, "#f6f8fa", 8);
          var cy0 = y + cpad + 14;
          codeLines.forEach(function (line, codeIndex) {
            ops.push({ kind: "text", x: x + cpad, y: cy0 + codeIndex * clh, text: line, size: codeSize, color: "#24292f", font: CV_MONO });
          });
          y += boxH;
          gap(8);
        }
        else if (b.type === "quote") { var sY = y; drawSpans(b.spans, x + 14, blockW - 14, 15, MUTED, false, true); ops.push({ kind: "rect", x: x, y: sY - 2, w: 3, h: (y - sY) + 2, color: "#cbd5e1" }); gap(7); }
        else if (b.type === "table") { gap(8); drawTable(b.rows, x, blockW); gap(12); }
        else if (b.type === "hr") { gap(6); rule(x, x + blockW); gap(10); }
      });
    }

    var title = documentTitle(list, options);
    var msgCount = list.reduce(function (t, c) { return t + c.messages.length; }, 0);
    addText(margin, title, 27, INK, { bold: true }); gap(36);
    addText(margin, "导出于 " + exportTimestamp(options) + " · " + list.length + " 段对话 · " + msgCount + " 条消息", 12.5, MUTED); gap(20);
    rule(margin, width - margin); gap(18);
    list.forEach(function (conv, ci) {
      if (ci > 0) { gap(6); rule(margin, width - margin); gap(16); }
      addText(margin, conv.title || conv.id || "对话", 18, ACCENT, { bold: true }); gap(24);
      conv.messages.forEach(function (msg) {
        gap(6);
        addText(margin, speakerName(msg.role), 13, isUserMessage(msg.role) ? USERC : ACCENT, { bold: true }); gap(20);
        drawBlocks(cvParseBlocks(msg.text || msg.content || ""), margin, contentW);
        var foot = messageFootnote(msg);
        if (foot) { addText(margin, foot, 11, MUTED, { italic: true }); gap(16); }
        gap(4);
      });
    });
    // 推广页脚:简要介绍 + GitHub 链接,放在所有对话之后。
    gap(18); rule(margin, width - margin); gap(16);
    addText(margin, EXPORT_PROMO_NAME, 13, ACCENT, { bold: true }); gap(19);
    drawSpans(cvParseInline(EXPORT_PROMO_DESC), margin, contentW, 11.5, MUTED, false); gap(3);
    addText(margin, "GitHub · " + EXPORT_PROMO_URL, 11.5, ACCENT); gap(4);
    gap(margin);

    var totalH = Math.ceil(y);
    return { doc: doc, width: width, height: totalH, ops: ops };
  }

  function paintConversationCanvas(layout, startY, pageHeight, forcedDpr) {
    var width = layout.width;
    var sliceStart = Math.max(0, Math.floor(startY || 0));
    var sliceHeight = Math.max(1, Math.ceil(pageHeight || layout.height));
    // Keep each live canvas below a conservative memory ceiling. A
    // 860×14000 canvas at DPR 2 consumes about 184 MiB before PNG encoding,
    // which can crash the popup on long conversations.
    var doubledBytes = width * sliceHeight * 4 * 4;
    var requestedDpr = Number(forcedDpr);
    var DPR = requestedDpr === 1 || requestedDpr === 2
      ? requestedDpr
      : (sliceHeight * 2) <= 30000 && doubledBytes <= (96 * 1024 * 1024) ? 2 : 1;
    var doc = layout.doc;
    var canvas = doc.createElement("canvas");
    canvas.width = width * DPR;
    canvas.height = sliceHeight * DPR;
    var ctx = canvas.getContext("2d");
    ctx.scale(DPR, DPR);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, sliceHeight);
    ctx.textBaseline = "alphabetic";
    ctx.save();
    ctx.translate(0, -sliceStart);
    layout.ops.forEach(function (op) {
      if (op.kind === "text") {
        // Assign every text run to exactly one half-open page by the same
        // visual-top coordinate used when page ranges are chosen. This avoids
        // a line being partially painted at the bottom of one page and then
        // repeated at the top of the next.
        var textTop = Math.max(0, op.y - (Number(op.size) || 14) * 1.45 - 4);
        if (textTop < sliceStart || textTop >= sliceStart + sliceHeight) {
          return;
        }
      } else {
        var opTop = op.y;
        var opBottom = op.y + (Number(op.h) || 1);
        if (opBottom <= sliceStart || opTop >= sliceStart + sliceHeight) {
          return;
        }
      }
      if (op.kind === "rect") {
        ctx.fillStyle = op.color;
        if (op.radius) { cvRoundRect(ctx, op.x, op.y, op.w, op.h, op.radius); ctx.fill(); }
        else ctx.fillRect(op.x, op.y, op.w, op.h);
      } else {
        ctx.fillStyle = op.color;
        ctx.font = (op.bold ? "700 " : op.italic ? "italic " : "") + op.size + "px " + (op.font || CV_FONT);
        ctx.fillText(op.text, op.x, op.y);
      }
    });
    ctx.restore();
    return canvas;
  }

  function conversationCanvasPageRanges(layout, maxPageHeight) {
    var limit = Math.max(600, Math.min(14000, Number(maxPageHeight) || 1216));
    if (layout.height <= limit) {
      return [{ start: 0, height: layout.height }];
    }
    var textTops = layout.ops
      .filter(function textOnly(op) { return op.kind === "text"; })
      .map(function textTop(op) {
        // Canvas dimensions and slice origins are integers. Keep candidate
        // boundaries integer-aligned too, otherwise floor(start)+ceil(height)
        // creates a one-pixel overlap that can repeat a line across pages.
        return Math.max(0, Math.floor(op.y - (Number(op.size) || 14) * 1.45 - 4));
      })
      .sort(function numeric(a, b) { return a - b; });
    var ranges = [];
    var start = 0;
    while (start < layout.height) {
      var desiredEnd = Math.min(layout.height, start + limit);
      var end = desiredEnd;
      if (desiredEnd < layout.height) {
        for (var index = 0; index < textTops.length; index += 1) {
          var top = textTops[index];
          if (top > start + Math.floor(limit * 0.55) && top <= desiredEnd) {
            end = top;
          }
          if (top > desiredEnd) {
            break;
          }
        }
      }
      if (end <= start) {
        end = desiredEnd;
      }
      ranges.push({ start: start, height: Math.max(1, Math.ceil(end - start)) });
      start = end;
    }
    return ranges;
  }

  function renderConversationsCanvas(conversations, options) {
    var layout = layoutConversationsCanvas(conversations, options || {});
    if (layout.height > 30000) {
      throw new Error("Conversation is too long for one PNG canvas.");
    }
    return paintConversationCanvas(layout, 0, layout.height);
  }

  function renderConversationsCanvasPages(conversations, options) {
    var layout = layoutConversationsCanvas(conversations, options || {});
    return conversationCanvasPageRanges(layout, options && options.pageHeight).map(function renderPage(range) {
      return paintConversationCanvas(layout, range.start, range.height);
    });
  }

  function releaseCanvas(canvas) {
    if (!canvas) {
      return;
    }
    try {
      canvas.width = 1;
      canvas.height = 1;
    } catch (_) {}
  }

  function dataUrlToUint8Blob(durl, mime) {
    var base64 = durl.split(",")[1] || "";
    var decode = (root && root.atob) || (typeof atob === "function" ? atob : null);
    var bin = decode ? decode(base64) : "";
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function canvasToPngBlob(canvas) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof canvas.toBlob === "function") {
          canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("toBlob-null")); }, "image/png");
          return;
        }
        resolve(dataUrlToUint8Blob(canvas.toDataURL("image/png"), PNG_MIME));
      } catch (e) { reject(e); }
    });
  }

  function canvasRgbaScanlines(canvas) {
    var context = canvas.getContext("2d");
    var width = canvas.width;
    var height = canvas.height;
    var rgba = context.getImageData(0, 0, width, height).data;
    var rowLength = width * 4 + 1;
    var scanlines = new Uint8Array(rowLength * height);
    for (var row = 0; row < height; row += 1) {
      var sourceStart = row * width * 4;
      var targetStart = row * rowLength;
      scanlines[targetStart] = 0;
      scanlines.set(rgba.subarray(sourceStart, sourceStart + width * 4), targetStart + 1);
    }
    return scanlines;
  }

  function pngBytesFromCompressedParts(width, height, compressedParts, metadataText) {
    var header = [];
    writeBigUint32(header, width);
    writeBigUint32(header, height);
    header.push(8, 6, 0, 0, 0);
    var parts = [
      PNG_SIGNATURE,
      pngChunk("IHDR", new Uint8Array(header))
    ];
    (compressedParts || []).forEach(function addCompressedPart(part) {
      if (part && part.length) {
        parts.push(pngChunk("IDAT", part));
      }
    });
    parts.push(pngChunk("IEND", new Uint8Array(0)));
    return addPngExportTextChunks(concatBytes(parts), metadataText || "");
  }

  // One selected conversation must produce one PNG file, even when the visual
  // transcript is taller than a safe browser canvas. Render bounded canvas
  // slices, feed their scanlines into one streaming zlib stream, and assemble
  // the resulting IDAT chunks into a single standards-compliant PNG.
  function buildPngBlobFromConversations(conversations, options) {
    options = options || {};
    var layout = layoutConversationsCanvas(conversations, options);
    var ranges = conversationCanvasPageRanges(layout, options.pageHeight || 14000);
    var CompressionCtor = root.CompressionStream || (typeof CompressionStream !== "undefined" ? CompressionStream : null);
    var metadataText = buildPlainTextLines(conversations, options).join("\n");

    if (!CompressionCtor) {
      if (layout.height > 30000) {
        return Promise.reject(new Error("This Chrome version cannot create one complete PNG for a very long conversation."));
      }
      var fallbackCanvas = paintConversationCanvas(layout, 0, layout.height, 1);
      return canvasToPngBlob(fallbackCanvas).then(function addFallbackMetadata(blob) {
        return blobToUint8Array(blob).then(function withMetadata(bytes) {
          releaseCanvas(fallbackCanvas);
          return new Blob([addPngExportTextChunks(bytes, metadataText)], { type: PNG_MIME });
        });
      }, function fallbackFailed(error) {
        releaseCanvas(fallbackCanvas);
        throw error;
      });
    }

    var compression = new CompressionCtor("deflate");
    var writer = compression.writable.getWriter();
    var reader = compression.readable.getReader();
    var compressedParts = [];

    function readCompressed() {
      return reader.read().then(function consume(result) {
        if (result.done) {
          return;
        }
        compressedParts.push(result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value));
        return readCompressed();
      });
    }

    var readPromise = readCompressed();

    function renderAndWrite(index) {
      if (index >= ranges.length) {
        return writer.close();
      }
      var range = ranges[index];
      // A fixed DPR keeps every slice at the same pixel width so their rows
      // form one continuous PNG image.
      var canvas = paintConversationCanvas(layout, range.start, range.height, 1);
      var scanlines;
      try {
        scanlines = canvasRgbaScanlines(canvas);
      } finally {
        releaseCanvas(canvas);
      }
      return writer.write(scanlines).then(function nextSlice() {
        return renderAndWrite(index + 1);
      });
    }

    return renderAndWrite(0).then(function finishCompression() {
      return readPromise;
    }).then(function assemblePng() {
      var bytes = pngBytesFromCompressedParts(
        layout.width,
        Math.ceil(layout.height),
        compressedParts,
        metadataText
      );
      return new Blob([bytes], { type: PNG_MIME });
    }).catch(function abortStreams(error) {
      try { writer.abort(error); } catch (_) {}
      try { reader.cancel(error); } catch (_) {}
      throw error;
    });
  }

  function assembleImagePdf(images) {
    var enc = new TextEncoder();
    var chunks = [], offset = 0, offsets = [];
    function push(bytes) { chunks.push(bytes); offset += bytes.length; }
    function pushStr(s) { push(enc.encode(s)); }
    function mark(n) { offsets[n] = offset; }
    pushStr("%PDF-1.7\n%âãÏÓ\n");
    var N = images.length, totalObjs = 2 + N * 3;
    mark(1); pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    var kids = [];
    for (var p = 0; p < N; p++) kids.push((3 + p * 3) + " 0 R");
    mark(2); pushStr("2 0 obj\n<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + N + " >>\nendobj\n");
    for (var k = 0; k < N; k++) {
      var im = images[k], pageId = 3 + k * 3, contentId = 4 + k * 3, imageId = 5 + k * 3;
      var drawnW = 595, drawnH = Math.min(842, im.h * 595 / im.w), yOff = 842 - drawnH;
      var content = "q " + drawnW.toFixed(2) + " 0 0 " + drawnH.toFixed(2) + " 0 " + yOff.toFixed(2) + " cm /Im0 Do Q";
      var cb = enc.encode(content);
      mark(pageId); pushStr(pageId + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 " + imageId + " 0 R >> >> /Contents " + contentId + " 0 R >>\nendobj\n");
      mark(contentId); pushStr(contentId + " 0 obj\n<< /Length " + cb.length + " >>\nstream\n"); push(cb); pushStr("\nendstream\nendobj\n");
      mark(imageId); pushStr(imageId + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length " + im.data.length + " >>\nstream\n"); push(im.data); pushStr("\nendstream\nendobj\n");
    }
    var xrefOffset = offset;
    var xref = "xref\n0 " + (totalObjs + 1) + "\n0000000000 65535 f \n";
    for (var o = 1; o <= totalObjs; o++) xref += String(offsets[o]).padStart(10, "0") + " 00000 n \n";
    pushStr(xref);
    pushStr("trailer\n<< /Size " + (totalObjs + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF");
    var total = chunks.reduce(function (t, c) { return t + c.length; }, 0);
    var out = new Uint8Array(total), pos = 0;
    chunks.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  function buildPdfBlobFromCanvas(canvas, options) {
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;
    var pageHpx = Math.max(1, Math.round(W * 842 / 595));
    var bands = [];
    for (var py = 0; py < H; py += pageHpx) {
      var bandH = Math.min(pageHpx, H - py);
      var data = ctx.getImageData(0, py, W, bandH).data;
      var rgb = new Uint8Array(W * bandH * 3), j = 0;
      for (var i = 0; i < data.length; i += 4) { rgb[j++] = data[i]; rgb[j++] = data[i + 1]; rgb[j++] = data[i + 2]; }
      bands.push({ w: W, h: bandH, rgb: rgb });
    }
    return Promise.all(bands.map(function (b) {
      return compressZlibBytes(b.rgb).then(function (z) { return { w: b.w, h: b.h, data: z }; });
    })).then(function (images) {
      return new Blob([assembleImagePdf(images)], { type: PDF_MIME });
    });
  }

  function buildPdfBlobFromCanvases(canvases) {
    var pages = Array.isArray(canvases) ? canvases.filter(Boolean) : [];
    if (!pages.length) {
      return Promise.reject(new Error("PDF export did not receive any rendered pages."));
    }
    var images = [];
    function compressCanvasPage(index) {
      if (index >= pages.length) {
        return Promise.resolve();
      }
      var canvas = pages[index];
      var ctx = canvas.getContext("2d");
      var width = canvas.width;
      var height = canvas.height;
      var data = ctx.getImageData(0, 0, width, height).data;
      var rgb = new Uint8Array(width * height * 3);
      var output = 0;
      for (var pixel = 0; pixel < data.length; pixel += 4) {
        rgb[output++] = data[pixel];
        rgb[output++] = data[pixel + 1];
        rgb[output++] = data[pixel + 2];
      }
      return compressZlibBytes(rgb).then(function compressed(bytes) {
        images.push({ w: width, h: height, data: bytes });
        return compressCanvasPage(index + 1);
      });
    }
    return compressCanvasPage(0).then(function assemble() {
      return new Blob([assembleImagePdf(images)], { type: PDF_MIME });
    });
  }

  function buildPdfBlobFromConversations(conversations, options) {
    options = options || {};
    var layout = layoutConversationsCanvas(conversations, options);
    var ranges = conversationCanvasPageRanges(layout, options.pageHeight || 1216);
    var images = [];

    function renderAndCompress(index) {
      if (index >= ranges.length) {
        return Promise.resolve();
      }
      var range = ranges[index];
      var canvas = paintConversationCanvas(layout, range.start, range.height);
      var ctx = canvas.getContext("2d");
      var width = canvas.width;
      var height = canvas.height;
      var data = ctx.getImageData(0, 0, width, height).data;
      var rgb = new Uint8Array(width * height * 3);
      var output = 0;
      for (var pixel = 0; pixel < data.length; pixel += 4) {
        rgb[output++] = data[pixel];
        rgb[output++] = data[pixel + 1];
        rgb[output++] = data[pixel + 2];
      }
      return compressZlibBytes(rgb).then(function compressed(bytes) {
        images.push({ w: width, h: height, data: bytes });
        releaseCanvas(canvas);
        return renderAndCompress(index + 1);
      }, function failed(error) {
        releaseCanvas(canvas);
        throw error;
      });
    }

    return renderAndCompress(0).then(function assemble() {
      return new Blob([assembleImagePdf(images)], { type: PDF_MIME });
    });
  }

  function renderConversationsPngBlobs(conversations, options) {
    options = options || {};
    var layout = layoutConversationsCanvas(conversations, options);
    var ranges = conversationCanvasPageRanges(layout, options.pageHeight || 14000);
    var pages = [];

    function renderPage(index) {
      if (index >= ranges.length) {
        return Promise.resolve();
      }
      var range = ranges[index];
      var canvas = paintConversationCanvas(layout, range.start, range.height);
      return canvasToPngBlob(canvas).then(function converted(blob) {
        pages.push(blob);
        releaseCanvas(canvas);
        return renderPage(index + 1);
      }, function failed(error) {
        releaseCanvas(canvas);
        throw error;
      });
    }

    return renderPage(0).then(function done() {
      return pages;
    });
  }

  return {
    buildDocx: buildDocx,
    buildDocxRenderedBlob: buildDocxRenderedBlob,
    buildZip: buildZip,
    renderConversationsCanvas: renderConversationsCanvas,
    renderConversationsCanvasPages: renderConversationsCanvasPages,
    renderConversationsPngBlobs: renderConversationsPngBlobs,
    canvasToPngBlob: canvasToPngBlob,
    buildPdfBlobFromCanvas: buildPdfBlobFromCanvas,
    buildPdfBlobFromCanvases: buildPdfBlobFromCanvases,
    buildPdfBlobFromConversations: buildPdfBlobFromConversations,
    buildPngBlobFromConversations: buildPngBlobFromConversations,
    buildDocxBytes: buildDocxBytes,
    collectConversationFromDom: collectConversationFromDom,
    buildHtml: buildHtml,
    buildJson: buildJson,
    buildMarkdown: buildMarkdown,
    buildPdf: buildPdf,
    buildPdfBytes: buildPdfBytes,
    buildPngBytes: buildPngBytes,
    createExport: createExport,
    downloadBlob: downloadBlob,
    exportArtifact: exportArtifact,
    exportDocxHtml: exportDocxHtml,
    exportHtml: exportHtml,
    exportJson: exportJson,
    exportMarkdown: exportMarkdown,
    exportPngDataUrl: exportPngDataUrl,
    exportPrintHtml: exportPrintHtml,
    exportSvg: exportSvg,
    MIME: MIME,
    normalizeConversations: normalizeConversations,
    safeName: safeName,
    toBlob: toBlob,
    toDataUrl: toDataUrl
  };
});
