(function initConversationSource(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTConversationSource = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationSourceFactory(root) {
  "use strict";

  var DEFAULT_PAGE_SIZE = 100;
  var DEFAULT_CONCURRENCY = 2;
  var MAX_CONCURRENCY = 2;
  var MAX_PAGES_PER_SCOPE = 1000;
  var MAX_CONVERSATIONS = 100000;
  var MAX_REQUEST_ATTEMPTS = 3;
  var BASE_RETRY_DELAY_MS = 1000;
  var MAX_RETRY_AFTER_MS = 60 * 1000;
  var DETAIL_TURN_PAGE_SIZE = 100;
  var nextRequestSlotAt = 0;
  var requestCooldownUntil = 0;
  var ALLOWED_HOSTS = {
    "chatgpt.com": true,
    "chat.openai.com": true
  };

  function safeText(value, maxLength) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLength || 200);
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
    return {
      id: id,
      title: safeText(item.title, 200) || ("Conversation " + id.slice(0, 8)),
      createTime: item.create_time || item.createTime || item.createdAt || "",
      updateTime: item.update_time || item.updateTime || item.updatedAt || "",
      archived: Boolean(item.is_archived || item.archived)
    };
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

  function retryDelayMs(response, attempt) {
    var retryAfter = "";
    try {
      retryAfter = response && response.headers && typeof response.headers.get === "function"
        ? response.headers.get("retry-after") || ""
        : "";
    } catch (_) {}
    if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
      var retrySeconds = Math.max(0, Number(retryAfter) * 1000);
      return retrySeconds <= MAX_RETRY_AFTER_MS ? retrySeconds : -1;
    }
    var retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) {
      var retryDateDelay = Math.max(0, retryDate - Date.now());
      return retryDateDelay <= MAX_RETRY_AFTER_MS ? retryDateDelay : -1;
    }
    return attempt <= 0 ? BASE_RETRY_DELAY_MS : 3000;
  }

  function isTransientStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  function waitForRequestSlot(requestGapMs) {
    var gap = Math.max(0, Math.min(2000, Number(requestGapMs) || 0));
    var now = Date.now();
    var startAt = Math.max(now, requestCooldownUntil, nextRequestSlotAt);
    if (gap > 0) {
      nextRequestSlotAt = startAt + gap;
    }
    return wait(startAt - now);
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
        if (status === 401 || status === 403) {
          error.stopOperation = true;
        }
        var retryable = isTransientStatus(status) || (!status && (!response || !response.ok));
        var delay = retryable ? retryDelayMs(response, index) : 0;
        if (status === 429) {
          if (delay < 0) {
            error.stopOperation = true;
          } else {
            // One shared cooldown protects catalog, index, and detail reads
            // that use this source instance.
            requestCooldownUntil = Math.max(requestCooldownUntil, Date.now() + delay);
          }
        }
        if (!retryable || index + 1 >= maxAttempts) {
          throw error;
        }
        // A long Retry-After means ChatGPT explicitly asked the client to stop
        // for longer than an interactive export should remain active. End this
        // item as a visible failure instead of retrying early or hammering the
        // account endpoint.
        if (delay < 0) {
          throw error;
        }
        return wait(delay).then(function retry() {
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

  function conversationMessagesUrl(origin, id, before) {
    var url = new URL("/backend-api/conversations/" + encodeURIComponent(id) + "/messages", origin);
    url.searchParams.set("before", String(before || ""));
    url.searchParams.set("include_has_versions", "true");
    url.searchParams.set("num_turns", String(DETAIL_TURN_PAGE_SIZE));
    return url.href;
  }

  function fetchConversationScope(options, archived) {
    var fetchImpl = options.fetchImpl;
    var origin = normalizeOrigin(options.origin);
    var limit = Math.max(1, Math.min(100, Number(options.pageSize) || DEFAULT_PAGE_SIZE));
    var offset = 0;
    var pageCount = 0;
    var items = [];
    var seen = {};
    var warnings = [];
    var omitArchivedFilter = false;

    function finish(complete, warning) {
      if (warning) {
        warnings.push({ scope: archived ? "archived" : "active", error: safeText(warning, 240) });
      }
      return {
        conversations: items,
        reportedTotal: null,
        pageCount: pageCount,
        archived: archived,
        complete: complete,
        warnings: warnings
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
      if (pageCount >= MAX_PAGES_PER_SCOPE || items.length >= MAX_CONVERSATIONS) {
        return Promise.resolve(finish(false, "Conversation history exceeded the safe pagination limit."));
      }
      return fetchPage().then(function consume(payload) {
        pageCount += 1;
        var rawItems = extractConversationItems(payload);
        var added = 0;
        rawItems.forEach(function add(raw) {
          var item = normalizeConversationIndexItem(raw);
          if (!item || seen[item.id]) {
            return;
          }
          item.archived = archived || item.archived;
          seen[item.id] = true;
          items.push(item);
          added += 1;
        });

        var total = numericTotal(payload);
        offset += rawItems.length;
        var reachedReportedTotal = total != null && offset >= total;
        var madeNoProgress = rawItems.length > 0 && added === 0;
        if (!rawItems.length) {
          if (total != null && offset < total) {
            return finish(false, "Conversation pagination ended before the reported total was reached.");
          }
          var emptyResult = finish(true);
          emptyResult.reportedTotal = total;
          return emptyResult;
        }
        if (madeNoProgress) {
          return finish(false, "Conversation pagination repeated a page without new conversation ids.");
        }
        // Without a reported total, do not assume a short page is the last
        // page: ChatGPT may clamp the requested page size server-side.
        // Continue until the endpoint returns an empty page.
        if (reachedReportedTotal) {
          var completedResult = finish(true);
          completedResult.reportedTotal = total;
          return completedResult;
        }
        return nextPage();
      }).catch(function preservePartialHistory(error) {
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
      if (!includeArchived) {
        return {
          conversations: sortConversationIndex(active.conversations),
          complete: active.complete !== false,
          warnings: active.warnings || [],
          pageCount: active.pageCount
        };
      }
      return fetchConversationScope(options, true).then(function withArchived(archived) {
        var byId = {};
        active.conversations.concat(archived.conversations).forEach(function dedupe(item) {
          if (!byId[item.id] || item.archived) {
            byId[item.id] = item;
          }
        });
        return {
          conversations: sortConversationIndex(Object.keys(byId).map(function toItem(id) { return byId[id]; })),
          complete: active.complete !== false && archived.complete !== false,
          warnings: (active.warnings || []).concat(archived.warnings || []),
          pageCount: active.pageCount + archived.pageCount
        };
      }).catch(function archivedUnavailable(error) {
        return {
          conversations: sortConversationIndex(active.conversations),
          complete: false,
          warnings: (active.warnings || []).concat([{ scope: "archived", error: safeText(error && error.message, 240) || "Archived history is unavailable." }]),
          pageCount: active.pageCount
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

    function nextPage() {
      if (!hasPrevious) {
        combined.page_info = Object.assign({}, pageInfo, { has_previous_page: false });
        return Promise.resolve(combined);
      }
      if (!before || pageCount >= MAX_PAGES_PER_SCOPE || combined.messages.length >= MAX_CONVERSATIONS) {
        return Promise.reject(new Error("Conversation messages exceeded the safe pagination limit."));
      }
      var previousBefore = before;
      return requestJson(
        options.fetchImpl,
        conversationMessagesUrl(origin, id, before),
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
      if (/^[0-9a-zA-Z-]{6,160}$/.test(id) && !seen[id] && out.length < MAX_CONVERSATIONS) {
        seen[id] = true;
        out.push(id);
      }
      return out;
    }, []);
  }

  function collectConversations(ids, options) {
    options = options || {};
    var targets = uniqueConversationIds(ids);
    // Account-history detail reads are intentionally capped. Export is a
    // user-initiated archive operation, not a crawler; two paced workers keep
    // large selections responsive without creating a burst of account traffic.
    var concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(options.concurrency) || DEFAULT_CONCURRENCY));
    var results = new Array(targets.length);
    var failures = new Array(targets.length);
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
        var stopMessage = safeText(stopError && stopError.message, 240) || "Conversation collection stopped.";
        targets.forEach(function reportStopped(id, index) {
          if (!results[index] && !failures[index]) {
            failures[index] = { id: id, error: stopMessage };
          }
        });
      }
      return {
        conversations: results.filter(Boolean),
        failures: failures.filter(Boolean),
        requestedCount: targets.length
      };
    });
  }

  function collectAllConversations(options) {
    options = options || {};
    return listAccountConversations(options).then(function collect(indexResult) {
      return collectConversations(indexResult.conversations.map(function id(item) { return item.id; }), options)
        .then(function attachIndex(collection) {
          collection.index = indexResult.conversations;
          collection.indexComplete = indexResult.complete;
          collection.complete = indexResult.complete && collection.failures.length === 0;
          collection.warnings = indexResult.warnings.slice();
          return collection;
        });
    });
  }

  return {
    collectAllConversations: collectAllConversations,
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
