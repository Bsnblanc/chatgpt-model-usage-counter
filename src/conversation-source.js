(function initConversationSource(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTConversationSource = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationSourceFactory(root) {
  "use strict";

  var DEFAULT_PAGE_SIZE = 100;
  var DEFAULT_CONCURRENCY = 1;
  var MAX_CONCURRENCY = 1;
  var DEFAULT_MAX_INDEX_PAGES_PER_SCOPE = 6;
  var MAX_INDEX_PAGES_PER_SCOPE = 6;
  var DEFAULT_MAX_CONVERSATIONS_PER_OPERATION = 50;
  var MAX_CONVERSATIONS_PER_OPERATION = 50;
  var MAX_MESSAGE_PAGES_PER_CONVERSATION = 50;
  var MAX_MESSAGES_PER_CONVERSATION = 10000;
  var MAX_REQUEST_ATTEMPTS = 2;
  var BASE_RETRY_DELAY_MS = 1000;
  var DEFAULT_429_RETRY_DELAY_MS = 30 * 1000;
  var MAX_INTERACTIVE_RETRY_AFTER_MS = 60 * 1000;
  var MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
  var MIN_RETRY_JITTER_MS = 100;
  var MAX_RETRY_JITTER_MS = 350;
  var DETAIL_TURN_PAGE_SIZE = 100;
  var nextRequestSlotAt = 0;
  var ALLOWED_HOSTS = {
    "chatgpt.com": true,
    "chat.openai.com": true
  };

  function safeText(value, maxLength) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLength || 200);
  }

  function safeMetadataId(value) {
    var id = safeText(value, 160);
    return /^[0-9a-zA-Z][0-9a-zA-Z_-]{5,159}$/.test(id) ? id : "";
  }

  function safeProjectId(value) {
    var match = safeText(value, 500).match(/\bg-p-[0-9a-f]{32}\b/i);
    return match ? String(match[0]).toLowerCase() : "";
  }

  function safeProjectRouteSlug(value) {
    var raw = safeText(value, 500);
    var idMatch = raw.match(/\bg-p-[0-9a-f]{32}\b/i);
    if (!idMatch) {
      return "";
    }
    var suffix = raw.slice(Number(idMatch.index || 0) + idMatch[0].length);
    if (suffix.charAt(0) !== "-") {
      return "";
    }
    suffix = suffix.slice(1).split(/[/?#\s]/, 1)[0] || "";
    try {
      suffix = decodeURIComponent(suffix);
    } catch (_) {}
    return safeText(suffix.replace(/^-+|-+$/g, ""), 160);
  }

  function consistentValue(values, normalizer) {
    var seen = {};
    var normalized = (Array.isArray(values) ? values : []).reduce(function add(out, value) {
      var normalized = normalizer(value);
      if (normalized && !seen[normalized]) {
        seen[normalized] = true;
        out.push(normalized);
      }
      return out;
    }, []);
    return {
      value: normalized.length === 1 ? normalized[0] : "",
      conflict: normalized.length > 1
    };
  }

  function hierarchyMetadataFromIndexItem(item) {
    var source = item && typeof item === "object" ? item : {};
    var project = source.project && typeof source.project === "object" ? source.project : {};
    var folder = source.folder && typeof source.folder === "object" ? source.folder : {};
    var gizmo = consistentValue([
      source.gizmo_id,
      source.gizmoId
    ], safeMetadataId);
    var projectId = consistentValue([
      source.project_id,
      source.projectId,
      project.id,
      project.project_id,
      source.gizmo_id,
      source.gizmoId,
      source.conversation_template_id
    ], safeProjectId);
    var projectName = consistentValue([
      source.project_name,
      source.projectName,
      source.project_title,
      source.projectTitle,
      project.name,
      project.title
    ], function cleanName(value) { return safeText(value, 200); });
    var projectRouteSlug = consistentValue([
      source.gizmo_id,
      source.gizmoId,
      source.conversation_template_id,
      source.project_id,
      source.projectId,
      source.project_slug,
      source.projectSlug,
      source.short_url,
      source.shortUrl,
      project.id,
      project.project_id,
      project.slug,
      project.short_url,
      project.shortUrl
    ], safeProjectRouteSlug);
    var folderId = consistentValue([
      source.folder_id,
      source.folderId,
      folder.id,
      folder.folder_id
    ], safeMetadataId);
    var folderName = consistentValue([
      source.folder_name,
      source.folderName,
      source.folder_title,
      source.folderTitle,
      folder.name,
      folder.title
    ], function cleanName(value) { return safeText(value, 200); });
    var resolvedProjectId = projectId.conflict ? "" : projectId.value;
    var resolvedFolderId = folderId.conflict || resolvedProjectId ? "" : folderId.value;
    var resolvedProjectName = resolvedProjectId && !projectName.conflict ? projectName.value : "";
    var resolvedFolderName = resolvedFolderId && !folderName.conflict ? folderName.value : "";
    return {
      gizmoId: resolvedProjectId || gizmo.value,
      projectId: resolvedProjectId,
      projectName: resolvedProjectName,
      projectRouteSlug: resolvedProjectId && !projectRouteSlug.conflict ? projectRouteSlug.value : "",
      folderId: resolvedFolderId,
      folderName: resolvedFolderName,
      groupType: resolvedProjectId
        ? "project"
        : resolvedFolderId && resolvedFolderName
          ? "folder"
          : ""
    };
  }

  function mergeMetadataValue(left, right, normalizer) {
    var first = normalizer(left);
    var second = normalizer(right);
    return {
      value: first && second && first !== second ? "" : first || second,
      conflict: Boolean(first && second && first !== second)
    };
  }

  function normalizeOrigin(value) {
    var parsed;
    try {
      parsed = new URL(String(value || ""));
    } catch (_) {
      throw new Error("A valid ChatGPT page origin is required.");
    }
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS[parsed.hostname]) {
      throw new Error("Conversation history can only be read from ChatGPT.");
    }
    return parsed.origin;
  }

  function normalizeConversationIndexItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    var id = safeText(item.id || item.conversation_id || item.conversationId, 160);
    if (!id || !/^[0-9a-zA-Z-]{6,160}$/.test(id)) {
      return null;
    }
    var normalized = {
      id: id,
      title: safeText(item.title, 200) || ("Conversation " + id.slice(0, 8)),
      createTime: item.create_time || item.createTime || item.createdAt || "",
      updateTime: item.update_time || item.updateTime || item.updatedAt || "",
      archived: Boolean(item.is_archived || item.archived)
    };
    return Object.assign(normalized, hierarchyMetadataFromIndexItem(item));
  }

  function mergeConversationIndexItems(current, incoming) {
    if (!current) {
      return incoming;
    }
    if (!incoming) {
      return current;
    }
    var currentTime = String(current.updateTime || current.createTime || "");
    var incomingTime = String(incoming.updateTime || incoming.createTime || "");
    var preferred = incomingTime > currentTime ? incoming : current;
    var other = preferred === incoming ? current : incoming;
    var merged = {
      id: current.id,
      title: preferred.title || other.title,
      createTime: current.createTime || incoming.createTime || "",
      updateTime: incomingTime > currentTime
        ? incoming.updateTime || incoming.createTime || ""
        : current.updateTime || current.createTime || "",
      archived: Boolean(current.archived || incoming.archived)
    };
    var gizmo = mergeMetadataValue(current.gizmoId, incoming.gizmoId, safeMetadataId);
    var project = mergeMetadataValue(current.projectId, incoming.projectId, safeProjectId);
    var projectName = mergeMetadataValue(current.projectName, incoming.projectName, function cleanName(value) {
      return safeText(value, 200);
    });
    var projectRouteSlug = mergeMetadataValue(
      current.projectRouteSlug,
      incoming.projectRouteSlug,
      function cleanProjectRouteSlug(value) { return safeText(value, 160); }
    );
    var folder = mergeMetadataValue(current.folderId, incoming.folderId, safeMetadataId);
    var folderName = mergeMetadataValue(current.folderName, incoming.folderName, function cleanName(value) {
      return safeText(value, 200);
    });
    var projectConflict = project.conflict || Boolean(
      gizmo.conflict &&
      (safeProjectId(current.gizmoId) || safeProjectId(incoming.gizmoId))
    );
    var projectId = projectConflict ? "" : project.value;
    var folderId = folder.conflict ? "" : folder.value;
    if (projectId) {
      folderId = "";
    }
    return Object.assign(merged, {
      gizmoId: projectId || gizmo.value,
      projectId: projectId,
      projectName: !projectId || projectName.conflict ? "" : projectName.value,
      projectRouteSlug: !projectId || projectRouteSlug.conflict ? "" : projectRouteSlug.value,
      folderId: folderId,
      folderName: !folderId || folderName.conflict ? "" : folderName.value,
      groupType: projectId
        ? "project"
        : folderId && folderName.value && !folderName.conflict
          ? "folder"
          : ""
    });
  }

  function extractConversationItems(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (!payload || typeof payload !== "object") {
      return [];
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.conversations)) {
      return payload.conversations;
    }
    return [];
  }

  function numericTotal(payload) {
    var value = payload && (payload.total != null ? payload.total : payload.total_count);
    var number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
  }

  function wait(ms) {
    return new Promise(function resolveLater(resolve) {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function retryDelayMs(response, attempt, status) {
    var retryAfter = "";
    try {
      retryAfter = response && response.headers && typeof response.headers.get === "function"
        ? response.headers.get("retry-after") || ""
        : "";
    } catch (_) {}
    if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
      var retrySeconds = Math.max(0, Number(retryAfter) * 1000);
      return Math.min(MAX_RETRY_AFTER_MS, retrySeconds);
    }
    var retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) {
      var retryDateDelay = Math.max(0, retryDate - Date.now());
      return Math.min(MAX_RETRY_AFTER_MS, retryDateDelay);
    }
    if (Number(status) === 429) {
      return DEFAULT_429_RETRY_DELAY_MS;
    }
    return attempt <= 0 ? BASE_RETRY_DELAY_MS : 3000;
  }

  function retryJitterMs(settings) {
    var random = settings && typeof settings.random === "function" ? settings.random : Math.random;
    var value = 0;
    try {
      value = Number(random());
    } catch (_) {}
    if (!Number.isFinite(value)) {
      value = 0;
    }
    value = Math.max(0, Math.min(1, value));
    return MIN_RETRY_JITTER_MS + Math.floor(value * (MAX_RETRY_JITTER_MS - MIN_RETRY_JITTER_MS));
  }

  function isTransientStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  function waitForRequestSlot(requestGapMs) {
    var gap = Math.max(0, Math.min(2000, Number(requestGapMs) || 0));
    var now = Date.now();
    var startAt = Math.max(now, nextRequestSlotAt);
    if (gap > 0) {
      nextRequestSlotAt = startAt + gap;
    }
    return wait(startAt - now);
  }

  function operationLimitError(code, message) {
    var error = new Error(message);
    error.code = code;
    error.stopOperation = true;
    error.incomplete = true;
    return error;
  }

  function requestJson(fetchImpl, url, requestOptions) {
    var settings = requestOptions && typeof requestOptions === "object" ? requestOptions : {};
    var maxAttempts = Math.max(1, Math.min(MAX_REQUEST_ATTEMPTS, Number(settings.maxAttempts) || MAX_REQUEST_ATTEMPTS));
    function attempt(index) {
      var response;
      return waitForRequestSlot(settings.requestGapMs).then(function request() {
        return fetchImpl(url, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" }
        });
      }).then(function validateResponse(value) {
        response = value;
        if (!response || !response.ok || typeof response.json !== "function") {
          var status = response && Number(response.status);
          var error = new Error("ChatGPT history request failed" + (status ? " (" + status + ")" : ""));
          error.status = status || 0;
          throw error;
        }
        return response.json();
      }).catch(function retryTransient(error) {
        var status = Number(error && error.status) || 0;
        if (error && (error.stopOperation || error.cancelled)) {
          throw error;
        }
        if (status === 401 || status === 403) {
          error.stopOperation = true;
        }
        var retryable = isTransientStatus(status) || (!status && (!response || !response.ok));
        var delay = retryable ? retryDelayMs(response, index, status) : 0;
        if (status === 429) {
          error.retryAfterMs = delay;
        }
        if (retryable && delay > MAX_INTERACTIVE_RETRY_AFTER_MS) {
          error.stopOperation = true;
          error.incomplete = true;
          error.retryAfterMs = delay;
        }
        if (!retryable || index + 1 >= maxAttempts) {
          if (status === 429) {
            // A final throttling response stops the entire account operation.
            // Continuing with another id, worker, chunk, or DOM fallback after
            // ChatGPT has throttled the account would extend the rate limit.
            error.stopOperation = true;
            error.incomplete = true;
          }
          throw error;
        }
        // A long Retry-After means ChatGPT explicitly asked the client to stop
        // for longer than an interactive export should remain active. End this
        // item as a visible failure instead of retrying early or hammering the
        // account endpoint.
        if (error.stopOperation) {
          throw error;
        }
        return wait(delay + retryJitterMs(settings)).then(function retry() {
          return attempt(index + 1);
        });
      });
    }

    return attempt(0);
  }

  function conversationListUrl(origin, offset, limit, archived, omitArchivedFilter) {
    var url = new URL("/backend-api/conversations", origin);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("order", "updated");
    // Do not add is_starred=false or hide_snorlax=true here. Both are
    // exclusion filters: the former can omit starred chats and the latter
    // removes project/workspace conversations from the account index.
    if (!omitArchivedFilter) {
      url.searchParams.set("is_archived", archived ? "true" : "false");
    }
    return url.href;
  }

  function conversationDetailUrl(origin, id) {
    var url = new URL("/backend-api/conversations/" + encodeURIComponent(id), origin);
    url.searchParams.set("include_has_versions", "true");
    url.searchParams.set("num_turns", String(DETAIL_TURN_PAGE_SIZE));
    return url.href;
  }

  function legacyConversationDetailUrl(origin, id) {
    return new URL("/backend-api/conversation/" + encodeURIComponent(id), origin).href;
  }

  function conversationMessagesUrl(origin, id, before, numTurns) {
    var url = new URL("/backend-api/conversations/" + encodeURIComponent(id) + "/messages", origin);
    url.searchParams.set("before", String(before || ""));
    url.searchParams.set("include_has_versions", "true");
    url.searchParams.set(
      "num_turns",
      String(Math.max(1, Math.min(DETAIL_TURN_PAGE_SIZE, Number(numTurns) || DETAIL_TURN_PAGE_SIZE)))
    );
    return url.href;
  }

  function fetchConversationScope(options, archived) {
    var fetchImpl = options.fetchImpl;
    var origin = normalizeOrigin(options.origin);
    var limit = Math.max(1, Math.min(100, Number(options.pageSize) || DEFAULT_PAGE_SIZE));
    var maxPages = Math.max(
      1,
      Math.min(
        MAX_INDEX_PAGES_PER_SCOPE,
        Math.floor(Number(options.maxIndexPagesPerScope)) || DEFAULT_MAX_INDEX_PAGES_PER_SCOPE
      )
    );
    var offset = 0;
    var pageCount = 0;
    var items = [];
    var seen = {};
    var warnings = [];
    var omitArchivedFilter = false;
    var reportedTotal = null;

    function finish(complete, warning, code, stopped) {
      if (warning) {
        warnings.push({
          scope: archived ? "archived" : "active",
          code: String(code || ""),
          error: safeText(warning, 240)
        });
      }
      return {
        conversations: items,
        reportedTotal: reportedTotal,
        pageCount: pageCount,
        archived: archived,
        complete: complete,
        incomplete: complete === false,
        warnings: warnings,
        code: String(code || ""),
        stopped: Boolean(stopped)
      };
    }

    function fetchPage() {
      var url = conversationListUrl(origin, offset, limit, archived, omitArchivedFilter);
      return requestJson(fetchImpl, url, { requestGapMs: options.requestGapMs }).catch(function retryActiveWithoutFilter(error) {
        // Some ChatGPT deployments accept the active-history endpoint only without
        // is_archived=false. Retry that first page once, then keep the same shape.
        var status = Number(error && error.status) || 0;
        if (!archived && offset === 0 && !omitArchivedFilter && [400, 404, 405].indexOf(status) !== -1) {
          omitArchivedFilter = true;
          return requestJson(
            fetchImpl,
            conversationListUrl(origin, offset, limit, false, true),
            { requestGapMs: options.requestGapMs }
          );
        }
        throw error;
      });
    }

    function nextPage() {
      return fetchPage().then(function consume(payload) {
        pageCount += 1;
        var rawItems = extractConversationItems(payload);
        var added = 0;
        rawItems.forEach(function add(raw) {
          var item = normalizeConversationIndexItem(raw);
          if (!item) {
            return;
          }
          if (Object.prototype.hasOwnProperty.call(seen, item.id)) {
            items[seen[item.id]] = mergeConversationIndexItems(items[seen[item.id]], item);
            return;
          }
          seen[item.id] = items.length;
          item.archived = archived || item.archived;
          items.push(item);
          added += 1;
        });

        var pageTotal = numericTotal(payload);
        if (pageTotal != null) {
          reportedTotal = pageTotal;
        }
        offset += rawItems.length;
        var reachedReportedTotal = reportedTotal != null && offset >= reportedTotal;
        var madeNoProgress = rawItems.length > 0 && added === 0;
        var shortPage = rawItems.length > 0 && rawItems.length < limit;
        if (!rawItems.length) {
          if (reportedTotal != null && offset < reportedTotal) {
            return finish(false, "Conversation pagination ended before the reported total was reached.");
          }
          return finish(true);
        }
        if (madeNoProgress) {
          return finish(false, "Conversation pagination repeated a page without new conversation ids.");
        }
        if (reachedReportedTotal) {
          return finish(true);
        }
        if (shortPage) {
          if (reportedTotal != null && offset < reportedTotal) {
            return finish(
              false,
              "Conversation pagination returned a short page before the reported total was reached."
            );
          }
          return finish(true);
        }
        if (pageCount >= maxPages) {
          return finish(
            false,
            "Conversation index reading stopped after " +
              maxPages +
              " page" +
              (maxPages === 1 ? "" : "s") +
              " in this scope; remaining conversations were not requested.",
            "index-page-limit",
            true
          );
        }
        return nextPage();
      }).catch(function preservePartialHistory(error) {
        if (
          error &&
          (
            error.stopOperation ||
            error.cancelled ||
            Number(error.status) === 401 ||
            Number(error.status) === 403
          )
        ) {
          throw error;
        }
        if (items.length) {
          return finish(false, error && error.message ? error.message : error);
        }
        throw error;
      });
    }

    return nextPage();
  }

  function sortConversationIndex(items) {
    return items.sort(function newestFirst(a, b) {
      var byTime = String(b.updateTime || b.createTime || "").localeCompare(String(a.updateTime || a.createTime || ""));
      return byTime || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
    });
  }

  function listAccountConversations(options) {
    options = options || {};
    if (typeof options.fetchImpl !== "function") {
      return Promise.reject(new Error("ChatGPT history fetch is unavailable."));
    }
    var includeArchived = options.includeArchived !== false;
    return fetchConversationScope(options, false).then(function withActive(active) {
      if (!includeArchived || active.stopped) {
        return {
          conversations: sortConversationIndex(active.conversations),
          complete: active.complete !== false,
          incomplete: active.complete === false,
          warnings: active.warnings || [],
          pageCount: active.pageCount,
          stopped: Boolean(active.stopped),
          code: active.code || ""
        };
      }
      return fetchConversationScope(options, true).then(function withArchived(archived) {
        var byId = {};
        active.conversations.concat(archived.conversations).forEach(function dedupe(item) {
          byId[item.id] = mergeConversationIndexItems(byId[item.id], item);
        });
        return {
          conversations: sortConversationIndex(Object.keys(byId).map(function toItem(id) { return byId[id]; })),
          complete: active.complete !== false && archived.complete !== false,
          incomplete: active.complete === false || archived.complete === false,
          warnings: (active.warnings || []).concat(archived.warnings || []),
          pageCount: active.pageCount + archived.pageCount,
          stopped: Boolean(archived.stopped),
          code: archived.code || ""
        };
      }).catch(function archivedUnavailable(error) {
        var status = Number(error && error.status) || 0;
        if (
          error &&
          (
            error.cancelled ||
            (error.stopOperation && status !== 401 && status !== 403)
          )
        ) {
          throw error;
        }
        return {
          conversations: sortConversationIndex(active.conversations),
          complete: false,
          incomplete: true,
          warnings: (active.warnings || []).concat([{ scope: "archived", error: safeText(error && error.message, 240) || "Archived history is unavailable." }]),
          pageCount: active.pageCount,
          stopped: false,
          code: ""
        };
      });
    });
  }

  function normalizeFetchedConversation(payload, id, options) {
    var exporter = options.exporter;
    if (!exporter || typeof exporter.normalizeConversations !== "function") {
      throw new Error("Conversation exporter is unavailable.");
    }
    var raw = Object.assign({}, payload || {});
    raw.id = raw.id || raw.conversation_id || id;
    raw.url = raw.url || normalizeOrigin(options.origin) + "/c/" + encodeURIComponent(id);
    raw.source = raw.source || "account-history";
    var normalized = exporter.normalizeConversations([raw])[0];
    if (!normalized || !Array.isArray(normalized.messages) || !normalized.messages.length) {
      throw new Error("Conversation contains no exportable user or assistant messages.");
    }
    if (payload && payload.__usageIncomplete) {
      normalized.incomplete = true;
      normalized.stopOperation = Boolean(payload.__usageStopOperation);
      normalized.incompleteCode = safeText(payload.__usageIncompleteCode, 80);
      normalized.warnings = (Array.isArray(normalized.warnings) ? normalized.warnings : []).concat(
        Array.isArray(payload.__usageWarnings) ? payload.__usageWarnings : []
      );
    }
    return normalized;
  }

  function messageId(message) {
    return safeText(message && (message.id || (message.message && message.message.id)), 160);
  }

  function prependUniqueMessages(existing, older) {
    var seen = {};
    (Array.isArray(existing) ? existing : []).forEach(function remember(message) {
      var id = messageId(message);
      if (id) seen[id] = true;
    });
    var prefix = (Array.isArray(older) ? older : []).filter(function keep(message) {
      var id = messageId(message);
      if (!id || seen[id]) {
        return false;
      }
      seen[id] = true;
      return true;
    });
    return prefix.concat(Array.isArray(existing) ? existing : []);
  }

  function collectModernConversationPages(payload, id, options) {
    var origin = normalizeOrigin(options.origin);
    var combined = Object.assign({}, payload || {});
    combined.messages = Array.isArray(combined.messages) ? combined.messages.slice() : [];
    var pageInfo = combined.page_info && typeof combined.page_info === "object"
      ? combined.page_info
      : {};
    var hasPrevious = Boolean(pageInfo.has_previous_page);
    var before = safeText(pageInfo.start_cursor || messageId(combined.messages[0]), 160);
    var pageCount = 0;
    var maxMessagePages = Math.max(1, Math.min(
      MAX_MESSAGE_PAGES_PER_CONVERSATION,
      Number(options.maxMessagePagesPerConversation) || MAX_MESSAGE_PAGES_PER_CONVERSATION
    ));
    var maxMessages = Math.max(DETAIL_TURN_PAGE_SIZE, Math.min(
      MAX_MESSAGES_PER_CONVERSATION,
      Number(options.maxMessagesPerConversation) || MAX_MESSAGES_PER_CONVERSATION
    ));

    function finishIncomplete(reason, code, stopOperation) {
      combined.__usageIncomplete = true;
      combined.__usageStopOperation = Boolean(stopOperation);
      combined.__usageIncompleteCode = safeText(code, 80);
      combined.__usageWarnings = (Array.isArray(combined.__usageWarnings) ? combined.__usageWarnings : []).concat([{
        scope: "messages",
        conversationId: id,
        error: reason
      }]);
      return combined;
    }

    function nextPage() {
      if (!hasPrevious) {
        combined.page_info = Object.assign({}, pageInfo, { has_previous_page: false });
        return Promise.resolve(combined);
      }
      if (!before) {
        return Promise.resolve(finishIncomplete(
          "Older messages were not continued because ChatGPT did not provide a usable pagination cursor.",
          "message-cursor-unavailable",
          false
        ));
      }
      if (pageCount >= maxMessagePages) {
        return Promise.resolve(finishIncomplete(
          "Older messages stopped after " + maxMessagePages + " pages; remaining messages were not read.",
          "message-page-limit",
          true
        ));
      }
      if (combined.messages.length >= maxMessages) {
        if (combined.messages.length > maxMessages) {
          combined.messages = combined.messages.slice(combined.messages.length - maxMessages);
        }
        return Promise.resolve(finishIncomplete(
          "Older messages stopped after " + maxMessages + " messages; remaining messages were not read.",
          "message-count-limit",
          true
        ));
      }
      var previousBefore = before;
      var remainingMessages = Math.max(1, maxMessages - combined.messages.length);
      return requestJson(
        options.fetchImpl,
        conversationMessagesUrl(origin, id, before, Math.min(DETAIL_TURN_PAGE_SIZE, remainingMessages)),
        { requestGapMs: options.requestGapMs }
      ).then(function consume(page) {
        pageCount += 1;
        var older = page && Array.isArray(page.messages) ? page.messages : [];
        var oldLength = combined.messages.length;
        combined.messages = prependUniqueMessages(combined.messages, older);
        pageInfo = page && page.page_info && typeof page.page_info === "object"
          ? page.page_info
          : {};
        hasPrevious = Boolean(pageInfo.has_previous_page);
        before = safeText(pageInfo.start_cursor || messageId(older[0]), 160);
        if (combined.messages.length === oldLength || (hasPrevious && before === previousBefore)) {
          throw new Error("Conversation message pagination repeated without progress.");
        }
        return nextPage();
      });
    }

    return nextPage();
  }

  function fetchConversationPayload(id, options) {
    var origin = normalizeOrigin(options.origin);
    return requestJson(
      options.fetchImpl,
      conversationDetailUrl(origin, id),
      { requestGapMs: options.requestGapMs }
    )
      .then(function collectPages(payload) {
        if (!payload || !Array.isArray(payload.messages)) {
          return payload;
        }
        return collectModernConversationPages(payload, id, options);
      })
      .catch(function legacyFallback(error) {
        var status = Number(error && error.status) || 0;
        if ([404, 405].indexOf(status) === -1) {
          throw error;
        }
        return requestJson(
          options.fetchImpl,
          legacyConversationDetailUrl(origin, id),
          { requestGapMs: options.requestGapMs }
        );
      });
  }

  function fetchConversationById(id, options) {
    options = options || {};
    var cleanId = safeText(id, 160);
    if (!/^[0-9a-zA-Z-]{6,160}$/.test(cleanId)) {
      return Promise.reject(new Error("Invalid conversation identifier."));
    }
    if (typeof options.fetchImpl !== "function") {
      return Promise.reject(new Error("ChatGPT history fetch is unavailable."));
    }
    return fetchConversationPayload(cleanId, options).then(function normalize(payload) {
      return normalizeFetchedConversation(payload, cleanId, options);
    });
  }

  function uniqueConversationIds(ids) {
    var seen = {};
    return (Array.isArray(ids) ? ids : []).reduce(function add(out, value) {
      var id = safeText(value, 160);
      if (/^[0-9a-zA-Z-]{6,160}$/.test(id) && !seen[id]) {
        seen[id] = true;
        out.push(id);
      }
      return out;
    }, []);
  }

  function collectConversations(ids, options) {
    options = options || {};
    var requestedTargets = uniqueConversationIds(ids);
    var maxConversations = Math.max(
      1,
      Math.min(
        MAX_CONVERSATIONS_PER_OPERATION,
        Math.floor(Number(options.maxConversationsPerOperation)) || DEFAULT_MAX_CONVERSATIONS_PER_OPERATION
      )
    );
    var targets = requestedTargets.slice(0, maxConversations);
    var skippedTargets = requestedTargets.slice(maxConversations);
    // One worker keeps every allowed account read sequential. Selected ids
    // beyond the operation cap remain explicit failures and never reach fetch.
    var concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(options.concurrency) || DEFAULT_CONCURRENCY));
    var results = new Array(targets.length);
    var failures = new Array(targets.length);
    var warnings = [];
    var cursor = 0;
    var stopError = null;

    function worker() {
      if (stopError) {
        return Promise.resolve();
      }
      var index = cursor;
      cursor += 1;
      if (index >= targets.length) {
        return Promise.resolve();
      }
      var id = targets[index];
      return fetchConversationById(id, options).then(function success(conversation) {
        results[index] = conversation;
        if (conversation && conversation.incomplete) {
          warnings = warnings.concat(Array.isArray(conversation.warnings) ? conversation.warnings : [{
            scope: "messages",
            conversationId: id,
            error: "Conversation message history is incomplete."
          }]);
          if (conversation.stopOperation) {
            stopError = operationLimitError(
              conversation.incompleteCode || "message-limit",
              warnings[warnings.length - 1] && warnings[warnings.length - 1].error ||
                "Conversation message history reached an operation limit; remaining conversations were not read."
            );
          }
        }
      }).catch(function failed(error) {
        failures[index] = { id: id, error: safeText(error && error.message, 240) || "Conversation request failed." };
        var status = Number(error && error.status) || 0;
        if (error && (error.stopOperation || status === 401 || status === 403)) {
          stopError = error;
        }
      }).then(worker);
    }

    var workers = [];
    for (var index = 0; index < Math.min(concurrency, targets.length); index += 1) {
      workers.push(worker());
    }
    return Promise.all(workers).then(function done() {
      if (stopError) {
        throw stopError;
      }
      var cleanFailures = failures.filter(Boolean).concat(skippedTargets.map(function skipped(id) {
        return {
          id: id,
          code: "conversation-count-limit",
          error: "Conversation was not requested because the account operation limit of " +
            maxConversations +
            " conversations was reached."
        };
      }));
      if (skippedTargets.length) {
        warnings.push({
          scope: "account-details",
          code: "conversation-count-limit",
          error: "ChatGPT account reading was limited to " +
            maxConversations +
            " selected conversations; " +
            skippedTargets.length +
            " remaining conversation" +
            (skippedTargets.length === 1 ? " was" : "s were") +
            " not requested."
        });
      }
      return {
        conversations: results.filter(Boolean),
        failures: cleanFailures,
        warnings: warnings,
        requestedCount: requestedTargets.length,
        attemptedCount: targets.length,
        complete: cleanFailures.length === 0 && warnings.length === 0,
        incomplete: cleanFailures.length > 0 || warnings.length > 0,
        code: skippedTargets.length ? "conversation-count-limit" : ""
      };
    });
  }

  return {
    LIMITS: {
      maxConcurrency: MAX_CONCURRENCY,
      maxIndexPagesPerScope: MAX_INDEX_PAGES_PER_SCOPE,
      maxConversationsPerOperation: MAX_CONVERSATIONS_PER_OPERATION,
      maxMessagePagesPerConversation: MAX_MESSAGE_PAGES_PER_CONVERSATION,
      maxMessagesPerConversation: MAX_MESSAGES_PER_CONVERSATION,
      maxRequestAttempts: MAX_REQUEST_ATTEMPTS
    },
    collectConversations: collectConversations,
    conversationDetailUrl: conversationDetailUrl,
    conversationMessagesUrl: conversationMessagesUrl,
    conversationListUrl: conversationListUrl,
    extractConversationItems: extractConversationItems,
    fetchConversationById: fetchConversationById,
    listAccountConversations: listAccountConversations,
    normalizeConversationIndexItem: normalizeConversationIndexItem,
    normalizeOrigin: normalizeOrigin,
    requestJson: requestJson,
    uniqueConversationIds: uniqueConversationIds
  };
});
