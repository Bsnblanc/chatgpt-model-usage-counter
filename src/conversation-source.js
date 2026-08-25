(function initConversationSource(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }
  root.ChatGPTConversationSource = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function conversationSourceFactory(root) {
  "use strict";

  var MAX_REQUEST_ATTEMPTS = 2;
  var DEFAULT_429_RETRY_DELAY_MS = 30 * 1000;
  var MAX_INTERACTIVE_RETRY_AFTER_MS = 60 * 1000;
  var MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

  function wait(ms) {
    return new Promise(function resolveLater(resolve) {
      setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function retryDelayMs(response, status) {
    var retryAfter = "";
    try {
      retryAfter = response && response.headers && typeof response.headers.get === "function"
        ? response.headers.get("retry-after") || ""
        : "";
    } catch (_) {}
    if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
      return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, Number(retryAfter) * 1000));
    }
    var retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) {
      return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryDate - Date.now()));
    }
    return Number(status) === 429 ? DEFAULT_429_RETRY_DELAY_MS : 1000;
  }

  // Shared, bounded JSON GET helper used only by the account model-directory
  // lookup. Conversation history is never requested by this module.
  function requestJson(fetchImpl, url, requestOptions) {
    var settings = requestOptions && typeof requestOptions === "object" ? requestOptions : {};
    var maxAttempts = Math.max(1, Math.min(
      MAX_REQUEST_ATTEMPTS,
      Number(settings.maxAttempts) || MAX_REQUEST_ATTEMPTS
    ));
    if (typeof fetchImpl !== "function") {
      return Promise.reject(new Error("fetch-unavailable"));
    }

    function attempt(index) {
      var response;
      return Promise.resolve(fetchImpl(url, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" }
      })).then(function validate(value) {
        response = value;
        if (!response || !response.ok || typeof response.json !== "function") {
          var status = Number(response && response.status) || 0;
          var error = new Error("request-failed" + (status ? "-" + status : ""));
          error.status = status;
          throw error;
        }
        return response.json();
      }).catch(function boundedRetry(error) {
        var status = Number(error && error.status) || 0;
        var transient = status === 429 || status === 502 || status === 503 || status === 504;
        if (!transient || index + 1 >= maxAttempts) {
          if (status === 429) {
            error.stopOperation = true;
            error.retryAfterMs = retryDelayMs(response, status);
          }
          throw error;
        }
        var delay = retryDelayMs(response, status);
        if (delay > MAX_INTERACTIVE_RETRY_AFTER_MS) {
          error.stopOperation = true;
          error.retryAfterMs = delay;
          throw error;
        }
        return wait(delay).then(function retry() {
          return attempt(index + 1);
        });
      });
    }

    return attempt(0);
  }

  return {
    requestJson: requestJson,
    retryDelayMs: retryDelayMs
  };
});
