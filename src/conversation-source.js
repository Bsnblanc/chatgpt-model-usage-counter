(function initConversationSource(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTConversationSource = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationSourceFactory(root) {
  "use strict";

  var DEFAULT_PAGE_SIZE = 100;
  var DEFAULT_CONCURRENCY = 4;
  var MAX_PAGES_PER_SCOPE = 1000;
  var MAX_CONVERSATIONS = 100000;
  var MAX_REQUEST_ATTEMPTS = 3;
  var BASE_RETRY_DELAY_MS = 400;
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
      return Math.min(5000, Math.max(0, Number(retryAfter) * 1000));
    }
    var retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) {
      return Math.min(5000, Math.max(0, retryDate - Date.now()));
    }
    return Math.min(2000, BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
  }

  function isTransientStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  function requestJson(fetchImpl, url) {
    function attempt(index) {
      var response;
      return Promise.resolve().then(function request() {
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
        var retryable = isTransientStatus(status) || (!status && (!response || !response.ok));
        if (!retryable || index + 1 >= MAX_REQUEST_ATTEMPTS) {
          throw error;
        }
        return wait(retryDelayMs(response, index)).then(function retry() {
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
    if (!omitArchivedFilter) {
      url.searchParams.set("is_archived", archived ? "true" : "false");
    }
    return url.href;
  }

  function conversationDetailUrl(origin, id) {
    return new URL("/backend-api/conversation/" + encodeURIComponent(id), origin).href;
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
      return requestJson(fetchImpl, url).catch(function retryActiveWithoutFilter(error) {
        // Some ChatGPT deployments accept the active-history endpoint only without
        // is_archived=false. Retry that first page once, then keep the same shape.
        if (!archived && offset === 0 && !omitArchivedFilter) {
          omitArchivedFilter = true;
          return requestJson(fetchImpl, conversationListUrl(origin, offset, limit, false, true));
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

  function fetchConversationById(id, options) {
    options = options || {};
    var cleanId = safeText(id, 160);
    if (!/^[0-9a-zA-Z-]{6,160}$/.test(cleanId)) {
      return Promise.reject(new Error("Invalid conversation identifier."));
    }
    if (typeof options.fetchImpl !== "function") {
      return Promise.reject(new Error("ChatGPT history fetch is unavailable."));
    }
    var origin = normalizeOrigin(options.origin);
    return requestJson(options.fetchImpl, conversationDetailUrl(origin, cleanId)).then(function normalize(payload) {
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
    var concurrency = Math.max(1, Math.min(8, Number(options.concurrency) || DEFAULT_CONCURRENCY));
    var results = new Array(targets.length);
    var failures = new Array(targets.length);
    var cursor = 0;

    function worker() {
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
      }).then(worker);
    }

    var workers = [];
    for (var index = 0; index < Math.min(concurrency, targets.length); index += 1) {
      workers.push(worker());
    }
    return Promise.all(workers).then(function done() {
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
    conversationListUrl: conversationListUrl,
    extractConversationItems: extractConversationItems,
    fetchConversationById: fetchConversationById,
    listAccountConversations: listAccountConversations,
    normalizeConversationIndexItem: normalizeConversationIndexItem,
    normalizeOrigin: normalizeOrigin,
    uniqueConversationIds: uniqueConversationIds
  };
});
