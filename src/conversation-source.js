(function initConversationSource(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.ChatGPTConversationSource = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationSourceFactory() {
  "use strict";

  // Only the account's model-catalog request is needed here. Historic
  // conversation-list/detail endpoints are not part of the extension runtime.
  var MAX_REQUEST_ATTEMPTS = 2;
  var BASE_RETRY_DELAY_MS = 1000;
  var DEFAULT_429_RETRY_DELAY_MS = 30 * 1000;
  var MAX_INTERACTIVE_RETRY_AFTER_MS = 60 * 1000;
  var MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
  var MIN_RETRY_JITTER_MS = 100;
  var MAX_RETRY_JITTER_MS = 350;
  var nextRequestSlotAt = 0;

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
          var error = new Error("ChatGPT model catalog request failed" + (status ? " (" + status + ")" : ""));
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
            error.stopOperation = true;
            error.incomplete = true;
          }
          throw error;
        }
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

  return { requestJson: requestJson };
});
