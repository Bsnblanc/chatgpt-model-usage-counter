(function initContentScript() {
  "use strict";

  // The manifest excludes ChatGPT data endpoints, and this runtime guard
  // protects already-open tabs or manual reinjection after an extension
  // update. Only actual ChatGPT application pages receive the dashboard.
  if (
    typeof location !== "undefined" &&
    /^\/(?:api|backend-api)(?:\/|$)/i.test(String(location.pathname || ""))
  ) {
    return;
  }

  if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
    document.documentElement.setAttribute(
      "data-chatgpt-model-usage-content-entry",
      "detector:" + (window.ChatGPTUsageDetector ? "yes" : "no") + ";chrome:" + (typeof chrome !== "undefined" && chrome.runtime ? "yes" : "no")
    );
  }

  var detector = window.ChatGPTUsageDetector;
  var modelCatalog = window.ChatGPTModelCatalog;
  if (!detector || typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }

  if (window.__chatgptModelUsageCounterLoaded) {
    var existingHost = typeof document.getElementById === "function"
      ? document.getElementById("chatgpt-model-usage-counter-panel-host")
      : null;
    if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
      document.documentElement.setAttribute(
        "data-chatgpt-model-usage-content-skip",
        existingHost ? "already-loaded" : "active-instance"
      );
    }
    return;
  }
  window.__chatgptModelUsageCounterStartedAt = Date.now();
  if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
    document.documentElement.setAttribute("data-chatgpt-model-usage-content-stage", "loading");
  }
  window.__chatgptModelUsageCounterLoaded = true;
  if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
    document.documentElement.setAttribute("data-chatgpt-model-usage-content-loaded", "true");
    document.documentElement.setAttribute("data-chatgpt-model-usage-content-stage", "loaded");
  }

  var DEDUPE_WINDOW_MS = 2500;
  var MESSAGE_MATCH_WINDOW_MS = 60000;
  var COMPOSER_POLL_MS = 500;
  var MODEL_OBSERVATION_WAIT_MS = 12000;
  var SETTINGS_KEY = "chatgptModelUsageSettings.v1";
  var STATUS_KEY = "chatgptModelUsageOpenAIStatus.v1";
  var CATALOG_SESSION_KEY = "chatgptModelUsageCatalog.session.v1";
  var RUNTIME_MODEL_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
  var RUNTIME_MODEL_CATALOG_REFRESH_ATTEMPT_TTL_MS = 5 * 60 * 1000;
  var RUNTIME_MODEL_CATALOG_ACCOUNT_RECHECK_TTL_MS = 5 * 60 * 1000;
  var lastSubmission = null;
  var lastDirectSubmission = null;
  var lastComposerSnapshot = null;
  var lastObservedModelInfo = null;
  var runtimeModelCatalog = null;
  var runtimeModelCatalogPromise = null;
  var runtimeModelCatalogSessionLoaded = false;
  var runtimeModelCatalogRefreshAttempts = {};
  var runtimeModelCatalogAccountKey = "";
  var runtimeModelCatalogAccountKeyPromise = null;
  var runtimeModelCatalogAccountKeyAttemptedAt = 0;
  var runtimeModelCatalogAccountVerifiedAt = 0;
  var runtimeModelCatalogAccountSurfaceMarker = "";
  var runtimeModelCatalogBindingSaltPromise = null;
  var runtimeModelCatalogBindingSalt = "";
  var runtimeModelCatalogBindingGeneration = 0;
  var runtimeModelCatalogContextKey = createRuntimeModelCatalogContextKey();
  var runtimeModelCatalogPublishedFingerprint = "";
  var pendingUnknownRuntimeModelSlugs = {};
  var pendingSubmissions = [];
  var pendingSubmissionTimer = null;
  var pendingResponseObservations = [];
  var submissionSequence = 0;
  var seenUserMessages = new Set();
  var seenAssistantModelMessages = new Set();
  var seenAssistantOutcomeTurns = new Set();
  var pendingRecoveryConversationId = "";
  var pendingRecoveryLastAttemptAt = 0;
  var pendingRecoveryInFlight = false;
  var pendingRecoverySentSubmissionIds = new Set();
  var ensureUsagePanelMounted = null;
  var ACCOUNT_REQUEST_MAX_CONCURRENCY = 1;
  var ACCOUNT_REQUEST_MIN_GAP_MS = 1000;
  var ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS = 60 * 1000;
  var ACCOUNT_REQUEST_DEFAULT_429_WAIT_MS = 30 * 1000;
  var ACCOUNT_REQUEST_FETCH_TIMEOUT_MS = 45 * 1000;
  var accountRequestQueue = [];
  var accountRequestActiveCount = 0;
  var accountRequestNextStartAt = 0;
  var accountRequestCooldownUntil = 0;
  var accountRequestLongBlockUntil = 0;
  var accountRequestPumpTimer = null;

  function setDiagnostic(name, value) {
    if (!document.documentElement || typeof document.documentElement.setAttribute !== "function") {
      return;
    }
    document.documentElement.setAttribute("data-chatgpt-model-usage-" + name, String(value || ""));
  }

  // 扩展被重载/更新后,已打开页面里的旧内容脚本上下文会失效:继续调用 chrome.runtime.sendMessage /
  // chrome.storage 会抛 "Extension context invalidated"。下面用 try/catch 捕获首次抛错并置位此标志,
  // 之后不再尝试。(不预检 chrome.runtime.id——单测的 chrome mock 没有 id,会被误判成失效。)
  var extensionContextLost = false;

  // 启动时记下扩展 id。真实浏览器里扩展一旦被重载,旧页面里的 chrome.runtime.id 会变成 undefined。
  // 据此“主动”发现上下文失效——不必等用户下一次提交失败才发现,好尽早把入口标成“刷新”提示用户。
  // 启动时本来就没有 id 的环境(如单测 mock)不参与主动判定,避免误报(与上面注释同理)。
  var initialRuntimeId = (function readInitialRuntimeId() {
    try {
      return typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime.id : undefined;
    } catch (_) {
      return undefined;
    }
  })();

  function extensionContextSeemsLost() {
    if (!initialRuntimeId) {
      return false;
    }
    try {
      return !(typeof chrome !== "undefined" && chrome && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return true;
    }
  }

  // 上下文失效后只处理一次:记录诊断 + 在面板入口提示用户刷新本页(刷新会注入新的内容脚本)。
  function handleExtensionContextInvalidated() {
    if (extensionContextLost) {
      return;
    }
    extensionContextLost = true;
    setDiagnostic("last-record-status", "error:context-invalidated");
    try {
      var toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
      if (toggle) {
        toggle.title = "扩展已更新,请刷新本页以继续统计";
        var label = toggle.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
        if (label) {
          label.textContent = "刷新";
        }
      }
    } catch (_) {
      // 忽略:提示是尽力而为,不能因此再抛错。
    }
  }

  function normalizePromptText(value) {
    return String(value || "")
      .replace(/[\u200b-\u200f\u2060]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sanitizeMessageId(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 160);
  }

  function retryAfterDelayMs(response) {
    var value = "";
    try {
      value = response && response.headers && typeof response.headers.get === "function"
        ? String(response.headers.get("retry-after") || "").trim()
        : "";
    } catch (_) {}
    if (/^\d+(?:\.\d+)?$/.test(value)) {
      return Math.max(0, Number(value) * 1000);
    }
    var retryDate = Date.parse(value);
    return Number.isNaN(retryDate)
      ? ACCOUNT_REQUEST_DEFAULT_429_WAIT_MS
      : Math.max(0, retryDate - Date.now());
  }

  function accountRequestBlockedError(delayMs) {
    var error = new Error("ChatGPT account reads are paused by Retry-After.");
    error.status = 429;
    error.stopOperation = true;
    error.retryAfterMs = Math.max(0, Number(delayMs) || 0);
    return error;
  }

  function accountRequestTimeoutError() {
    var error = new Error("ChatGPT account request timed out and was stopped.");
    error.code = "account-request-timeout";
    error.stopOperation = true;
    error.incomplete = true;
    return error;
  }

  function accountFetchWithTimeout(fetchImpl, url, init, onStarted) {
    if (typeof fetchImpl !== "function") {
      return Promise.reject(new Error("ChatGPT account request transport is unavailable."));
    }
    var controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    if (!controller) {
      if (!initialRuntimeId) {
        return Promise.resolve().then(function startTestOrLegacyFetch() {
          return fetchImpl(url, init);
        });
      }
      // Real supported browsers provide AbortController. Refuse to start an
      // account request when it cannot be physically stopped before the
      // background permit lease expires.
      return Promise.reject(accountRequestTimeoutError());
    }
    var options = Object.assign({}, init || {});
    var upstreamSignal = options.signal;
    var upstreamAbort = null;
    if (upstreamSignal && upstreamSignal.aborted) {
      controller.abort();
    } else if (upstreamSignal && typeof upstreamSignal.addEventListener === "function") {
      upstreamAbort = function abortFromCaller() {
        controller.abort();
      };
      upstreamSignal.addEventListener("abort", upstreamAbort, { once: true });
    }
    options.signal = controller.signal;
    return new Promise(function runTimedAccountFetch(resolve, reject) {
      var settled = false;
      var timedOut = false;
      var timer = setTimeout(function stopHungAccountFetch() {
        if (settled) {
          return;
        }
        timedOut = true;
        try { controller.abort(); } catch (_) {}
      }, ACCOUNT_REQUEST_FETCH_TIMEOUT_MS);
      var finish = function finish(callback, value) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (
          upstreamSignal &&
          upstreamAbort &&
          typeof upstreamSignal.removeEventListener === "function"
        ) {
          upstreamSignal.removeEventListener("abort", upstreamAbort);
        }
        callback(value);
      };
      Promise.resolve().then(function startFetch() {
        // Calling fetch starts the real network request. Report that exact
        // boundary to the cross-tab coordinator before this wrapper can
        // resolve, rather than reporting when the earlier permit was issued.
        var fetchOutcome = Promise.resolve(fetchImpl(url, options)).then(
          function fetchSucceeded(response) {
            return { ok: true, response: response };
          },
          function fetchFailed(error) {
            return { ok: false, error: error };
          }
        );
        var startOutcome = Promise.resolve(
          typeof onStarted === "function" ? onStarted() : null
        ).then(
          function startReported() {
            return { ok: true };
          },
          function startReportFailed(error) {
            try { controller.abort(); } catch (_) {}
            return { ok: false, error: error };
          }
        );
        return Promise.all([fetchOutcome, startOutcome]).then(function settleStartedFetch(results) {
          var fetched = results[0];
          var started = results[1];
          if (!started.ok) {
            // The request has already started, so a failed coordination
            // message must abort it and keep the permit held until fetch has
            // physically settled. Releasing immediately could let another
            // tab start inside the one-second safety gap.
            throw started.error;
          }
          if (!fetched.ok) {
            throw fetched.error;
          }
          return fetched.response;
        });
      }).then(function fetched(response) {
        if (timedOut) {
          finish(reject, accountRequestTimeoutError());
          return;
        }
        finish(resolve, response);
      }, function fetchFailed(error) {
        if (timedOut) {
          finish(reject, accountRequestTimeoutError());
          return;
        }
        finish(reject, error);
      });
    });
  }

  function globalAccountRequestBlockedError(response) {
    var error = new Error(String(
      response && response.error ||
      "ChatGPT account request coordination stopped this operation."
    ));
    error.status = Number(response && response.status) || 0;
    error.stopOperation = true;
    error.incomplete = true;
    error.retryAfterMs = Math.max(0, Number(response && response.retryAfterMs) || 0);
    return error;
  }

  function acquireGlobalAccountRequestPermit() {
    return runtimeMessage({ type: "account.request.acquire" }).then(function acquired(response) {
      if (response && response.granted === true && response.permitId) {
        return String(response.permitId);
      }
      if (response && (response.stopOperation || response.ok === false)) {
        throw globalAccountRequestBlockedError(response);
      }
      // A real extension page must never bypass the extension-level scheduler:
      // doing so would let another tab ignore the global start gap or cooldown.
      // Tests whose runtime mock has no extension id keep the local scheduler.
      if (!initialRuntimeId) {
        return "";
      }
      throw globalAccountRequestBlockedError({
        error: "ChatGPT account request coordination is unavailable."
      });
    });
  }

  function completeGlobalAccountRequestPermit(permitId, response, error) {
    if (!permitId) {
      return Promise.resolve(null);
    }
    var status = Number(response && response.status) || Number(error && error.status) || 0;
    var retryAfterMs = status === 429
      ? Math.max(
          0,
          Number(error && error.retryAfterMs) ||
          retryAfterDelayMs(response)
        )
      : 0;
    return runtimeMessage({
      type: "account.request.complete",
      permitId: permitId,
      status: status,
      retryAfterMs: retryAfterMs
    }).catch(function ignorePermitReleaseFailure() {
      return null;
    });
  }

  function markGlobalAccountRequestStarted(permitId) {
    if (!permitId) {
      return Promise.resolve(null);
    }
    return runtimeMessage({
      type: "account.request.started",
      permitId: permitId
    }).then(function started(response) {
      if (!response || response.ok === false || response.started === false) {
        throw globalAccountRequestBlockedError({
          error: "ChatGPT account request start coordination is unavailable."
        });
      }
      return response;
    });
  }

  function noteAccountRequestResponse(response) {
    if (!response || Number(response.status) !== 429) {
      return;
    }
    var delay = retryAfterDelayMs(response);
    var until = Date.now() + delay;
    accountRequestCooldownUntil = Math.max(accountRequestCooldownUntil, until);
    if (delay > ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS) {
      accountRequestLongBlockUntil = Math.max(accountRequestLongBlockUntil, until);
    }
  }

  function pumpAccountRequestQueue() {
    if (
      accountRequestPumpTimer ||
      accountRequestActiveCount >= ACCOUNT_REQUEST_MAX_CONCURRENCY ||
      !accountRequestQueue.length
    ) {
      return;
    }

    var now = Date.now();
    if (accountRequestLongBlockUntil > now) {
      var blockedError = accountRequestBlockedError(accountRequestLongBlockUntil - now);
      while (accountRequestQueue.length) {
        accountRequestQueue.shift().reject(blockedError);
      }
      return;
    }
    if (accountRequestLongBlockUntil && accountRequestLongBlockUntil <= now) {
      accountRequestLongBlockUntil = 0;
    }

    var startAt = Math.max(now, accountRequestNextStartAt, accountRequestCooldownUntil);
    if (startAt > now) {
      accountRequestPumpTimer = setTimeout(function resumeAccountRequestQueue() {
        accountRequestPumpTimer = null;
        pumpAccountRequestQueue();
      }, startAt - now);
      return;
    }

    var item = accountRequestQueue.shift();
    accountRequestActiveCount += 1;
    var globalPermitId = "";
    Promise.resolve()
      .then(function acquireGlobalPermit() {
        return acquireGlobalAccountRequestPermit();
      })
      .then(function startAccountRequest(permitId) {
        globalPermitId = permitId;
        // Reserve the next local slot immediately before the real fetch starts.
        // Authorization and background-permit waits happen before this point,
        // so they cannot make two actual request starts collapse together.
        accountRequestNextStartAt = Date.now() + ACCOUNT_REQUEST_MIN_GAP_MS;
        var realStartReported = false;
        var reportRealStart = function reportRealStart() {
          if (realStartReported) {
            return Promise.resolve(null);
          }
          realStartReported = true;
          return markGlobalAccountRequestStarted(globalPermitId);
        };
        var requestResult;
        try {
          requestResult = Promise.resolve(item.task(reportRealStart));
        } catch (error) {
          requestResult = Promise.reject(error);
        }
        return requestResult.then(function requireRealStart(response) {
          if (globalPermitId && !realStartReported) {
            throw globalAccountRequestBlockedError({
              error: "ChatGPT account request did not report its real network start."
            });
          }
          return response;
        });
      })
      .then(function accountRequestSucceeded(response) {
        return completeGlobalAccountRequestPermit(globalPermitId, response, null).then(function released() {
          noteAccountRequestResponse(response);
          item.resolve(response);
        });
      }, function accountRequestFailed(error) {
        return completeGlobalAccountRequestPermit(globalPermitId, null, error).then(function releasedAfterFailure() {
          item.reject(error);
        });
      })
      .finally(function releaseAccountRequestSlot() {
        accountRequestActiveCount = Math.max(0, accountRequestActiveCount - 1);
        pumpAccountRequestQueue();
      });
    pumpAccountRequestQueue();
  }

  function scheduleAccountRequest(task) {
    return new Promise(function enqueueAccountRequest(resolve, reject) {
      accountRequestQueue.push({
        task: typeof task === "function" ? task : function invalidTask() {
          throw new Error("ChatGPT account request task is unavailable.");
        },
        resolve: resolve,
        reject: reject
      });
      pumpAccountRequestQueue();
    });
  }

  function sanitizeRuntimeModelCatalog(value) {
    if (!modelCatalog || typeof modelCatalog.sanitizeRuntimeModelCatalog !== "function") {
      return null;
    }
    return modelCatalog.sanitizeRuntimeModelCatalog(value);
  }

  function catalogAccountKey(accountId, salt) {
    var cleanAccountId = String(accountId || "");
    var cleanSalt = String(salt || "");
    if (!cleanAccountId || !cleanSalt) {
      return "";
    }
    var first = hashText(cleanSalt + "\u0000" + cleanAccountId);
    var second = hashText(
      cleanAccountId.split("").reverse().join("") + "\u0000" + cleanSalt
    );
    return "acct-" + first.padStart(8, "0") + second.padStart(8, "0");
  }

  function createRuntimeModelCatalogContextKey() {
    var seed = [
      Date.now(),
      Math.random(),
      String(location && location.href || ""),
      Math.random()
    ].join("\u0000");
    var first = hashText(seed);
    var second = hashText(seed.split("").reverse().join(""));
    return "ctx-" + first.padStart(8, "0") + second.padStart(8, "0");
  }

  function currentAccountSurfaceMarker(salt) {
    try {
      var storage = window && window.localStorage;
      var account = storage && typeof storage.getItem === "function"
        ? String(storage.getItem("_account") || "")
        : "";
      if (!account) {
        return "";
      }
      return catalogAccountKey(account, "surface\u0000" + String(salt || ""));
    } catch (_) {
      return "";
    }
  }

  function invalidateRuntimeModelCatalogBinding(surfaceMarker) {
    runtimeModelCatalogBindingGeneration += 1;
    runtimeModelCatalog = null;
    runtimeModelCatalogPromise = null;
    runtimeModelCatalogSessionLoaded = false;
    runtimeModelCatalogRefreshAttempts = {};
    runtimeModelCatalogAccountKey = "";
    runtimeModelCatalogAccountKeyAttemptedAt = 0;
    runtimeModelCatalogAccountVerifiedAt = 0;
    runtimeModelCatalogAccountSurfaceMarker = String(surfaceMarker || "");
    runtimeModelCatalogContextKey = createRuntimeModelCatalogContextKey();
    runtimeModelCatalogPublishedFingerprint = "";
  }

  function loadRuntimeModelCatalogBindingSalt() {
    if (runtimeModelCatalogBindingSaltPromise) {
      return runtimeModelCatalogBindingSaltPromise;
    }
    runtimeModelCatalogBindingSaltPromise = runtimeMessage({
      type: "usage.catalog.binding.salt"
    }).then(function bindingSaltLoaded(response) {
      runtimeModelCatalogBindingSalt =
        String(response && response.salt || "").slice(0, 96);
      return runtimeModelCatalogBindingSalt;
    });
    return runtimeModelCatalogBindingSaltPromise;
  }

  function loadRuntimeModelCatalogAccountKey(options) {
    var settings = options && typeof options === "object" ? options : {};
    var verifyCurrentAccount = settings.verifyCurrentAccount === true;
    if (runtimeModelCatalogAccountKey && !verifyCurrentAccount) {
      return Promise.resolve(runtimeModelCatalogAccountKey);
    }
    if (runtimeModelCatalogAccountKeyPromise) {
      return runtimeModelCatalogAccountKeyPromise;
    }
    if (typeof fetch !== "function") {
      return Promise.resolve("");
    }
    runtimeModelCatalogAccountKeyPromise = loadRuntimeModelCatalogBindingSalt()
      .then(function decideAccountIdentityRead(salt) {
        if (!salt) {
          throw new Error("model-catalog-account-binding-unavailable");
        }
        var surfaceMarker = currentAccountSurfaceMarker(salt);
        var now = Date.now();
        if (runtimeModelCatalogAccountKey) {
          if (
            verifyCurrentAccount &&
            surfaceMarker &&
            runtimeModelCatalogAccountSurfaceMarker &&
            surfaceMarker === runtimeModelCatalogAccountSurfaceMarker
          ) {
            runtimeModelCatalogAccountVerifiedAt = now;
            return {
              key: runtimeModelCatalogAccountKey,
              surfaceMarker: surfaceMarker,
              skipFetch: true
            };
          }
          if (
            verifyCurrentAccount &&
            !surfaceMarker &&
            runtimeModelCatalogAccountVerifiedAt &&
            now - runtimeModelCatalogAccountVerifiedAt <
              RUNTIME_MODEL_CATALOG_ACCOUNT_RECHECK_TTL_MS
          ) {
            return {
              key: runtimeModelCatalogAccountKey,
              surfaceMarker: "",
              skipFetch: true
            };
          }
          if (
            verifyCurrentAccount &&
            (
              (
                surfaceMarker &&
                surfaceMarker !== runtimeModelCatalogAccountSurfaceMarker
              ) ||
              (
                !surfaceMarker &&
                runtimeModelCatalogAccountVerifiedAt &&
                now - runtimeModelCatalogAccountVerifiedAt >=
                  RUNTIME_MODEL_CATALOG_ACCOUNT_RECHECK_TTL_MS
              )
            )
          ) {
            invalidateRuntimeModelCatalogBinding(surfaceMarker);
          }
        }
        if (
          runtimeModelCatalogAccountKeyAttemptedAt &&
          now - runtimeModelCatalogAccountKeyAttemptedAt <
            RUNTIME_MODEL_CATALOG_REFRESH_ATTEMPT_TTL_MS
        ) {
          return {
            key: "",
            surfaceMarker: surfaceMarker,
            skipFetch: true
          };
        }
        runtimeModelCatalogAccountKeyAttemptedAt = now;
        return {
          key: "",
          surfaceMarker: surfaceMarker,
          skipFetch: false
        };
      })
      .then(function readCurrentAccount(decision) {
        if (decision.skipFetch) {
          return decision;
        }
        return scheduleAccountRequest(function startAccountIdentityFetch(reportRealStart) {
          return accountFetchWithTimeout(fetch, "/api/auth/session", {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            headers: { accept: "application/json" }
          }, reportRealStart);
        }).then(function parseAccountIdentity(response) {
          if (!response || !response.ok || typeof response.json !== "function") {
            var status = Number(response && response.status) || 0;
            var error = new Error("model-catalog-account-http-" + status);
            error.status = status;
            throw error;
          }
          return response.json();
        }).then(function bindCurrentAccount(session) {
          var accountId = String(
            session && session.account && session.account.id ||
            session && (session.accountId || session.account_id) ||
            ""
          );
          return loadRuntimeModelCatalogBindingSalt().then(function bindWithSalt(salt) {
            var key = catalogAccountKey(accountId, salt);
            if (!key) {
              throw new Error("model-catalog-account-unavailable");
            }
            return {
              key: key,
              surfaceMarker: decision.surfaceMarker,
              skipFetch: false
            };
          });
        });
      })
      .then(function rememberCurrentAccount(decision) {
          var key = String(decision && decision.key || "");
          if (!key) {
            return "";
          }
          if (
            runtimeModelCatalogAccountKey &&
            runtimeModelCatalogAccountKey !== key
          ) {
            invalidateRuntimeModelCatalogBinding(
              decision && decision.surfaceMarker
            );
          }
          runtimeModelCatalogAccountKey = key;
          runtimeModelCatalogAccountSurfaceMarker = String(
            decision && decision.surfaceMarker || ""
          );
          runtimeModelCatalogAccountVerifiedAt = Date.now();
          runtimeModelCatalogAccountKeyAttemptedAt = 0;
          return key;
      }).catch(function accountBindingFailed(error) {
        setDiagnostic(
          "model-catalog-account-status",
          "error:" + String((error && error.message) || error || "unknown").slice(0, 80)
        );
        return "";
      }).then(function accountBindingFinished(key) {
        runtimeModelCatalogAccountKeyPromise = null;
        return key;
      });
    return runtimeModelCatalogAccountKeyPromise;
  }

  function runtimeCatalogSnapshot(payload) {
    var source = payload && typeof payload === "object" ? payload : {};
    return sanitizeRuntimeModelCatalog({
      observedAt: new Date().toISOString(),
      models: source.models,
      versions: source.versions,
      categories: source.categories
    });
  }

  function publishRuntimeModelCatalog(catalog, accountKey) {
    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    var cleanAccountKey = String(accountKey || runtimeModelCatalogAccountKey || "");
    var contextKey = String(runtimeModelCatalogContextKey || "");
    var fingerprint = [
      cleanAccountKey,
      contextKey,
      String(catalog && catalog.observedAt || "")
    ].join("\u0001");
    if (
      !catalog ||
      !cleanAccountKey ||
      !contextKey ||
      fingerprint === runtimeModelCatalogPublishedFingerprint ||
      !runtime ||
      typeof runtime.sendMessage !== "function" ||
      extensionContextLost
    ) {
      return;
    }
    runtimeModelCatalogPublishedFingerprint = fingerprint;
    try {
      runtime.sendMessage({
        type: "usage.catalog",
        catalog: catalog,
        accountKey: cleanAccountKey,
        contextKey: contextKey
      }, function ignoreCatalogResponse() {
        void runtime.lastError;
      });
    } catch (error) {
      if (/context invalidated|Extension context/i.test(String((error && error.message) || error || ""))) {
        handleExtensionContextInvalidated();
      }
    }
  }

  function runtimeMessage(message) {
    return new Promise(function send(resolve) {
      var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
      if (!runtime || typeof runtime.sendMessage !== "function" || extensionContextLost) {
        resolve(null);
        return;
      }
      try {
        runtime.sendMessage(message, function receive(response) {
          if (runtime.lastError) {
            if (/context invalidated|Extension context/i.test(String(runtime.lastError.message || runtime.lastError))) {
              handleExtensionContextInvalidated();
            }
            resolve(null);
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        if (/context invalidated|Extension context/i.test(String((error && error.message) || error || ""))) {
          handleExtensionContextInvalidated();
        }
        resolve(null);
      }
    });
  }

  function loadRuntimeModelCatalogFromSession(force, accountKey) {
    if (force) {
      runtimeModelCatalogSessionLoaded = false;
      runtimeModelCatalog = null;
    }
    if (!force && (runtimeModelCatalog || runtimeModelCatalogSessionLoaded)) {
      return Promise.resolve(runtimeModelCatalog);
    }
    runtimeModelCatalogSessionLoaded = true;
    return runtimeMessage({
      type: "usage.catalog.get",
      key: CATALOG_SESSION_KEY,
      accountKey: String(accountKey || "")
    }).then(function remember(response) {
      var catalog = sanitizeRuntimeModelCatalog(response && response.catalog);
      runtimeModelCatalog = catalog || null;
      return runtimeModelCatalog;
    });
  }

  function waitForRuntimeModelCatalogFromSession(accountKey, attempts) {
    var remaining = Math.max(1, Math.floor(Number(attempts) || 1));
    return loadRuntimeModelCatalogFromSession(true, accountKey).then(function loaded(catalog) {
      if (catalog || remaining <= 1) {
        return catalog;
      }
      return new Promise(function wait(resolve) {
        setTimeout(resolve, 150);
      }).then(function retrySessionCatalog() {
        return waitForRuntimeModelCatalogFromSession(accountKey, remaining - 1);
      });
    });
  }

  function runtimeModelIsMapped(slug) {
    if (!runtimeModelCatalog || !modelCatalog || typeof modelCatalog.resolveRuntimePublicModelInfo !== "function") {
      return false;
    }
    var resolved = modelCatalog.resolveRuntimePublicModelInfo(runtimeModelCatalog, slug, {});
    return Boolean(resolved && resolved.mappingStatus === "mapped" && resolved.publicModel);
  }

  function runtimeModelCatalogIsFresh(catalog) {
    var observedAt = new Date(catalog && catalog.observedAt || "").getTime();
    return !Number.isNaN(observedAt) &&
      Date.now() - observedAt >= 0 &&
      Date.now() - observedAt < RUNTIME_MODEL_CATALOG_TTL_MS;
  }

  function rememberRuntimeModelSlug(slug) {
    var model = canonicalRequestModelSlug(slug);
    if (!model) {
      return;
    }
    if (runtimeModelIsMapped(model)) {
      delete pendingUnknownRuntimeModelSlugs[model];
      return;
    }
    pendingUnknownRuntimeModelSlugs[model] = true;
  }

  function nextUnknownRuntimeModelSlug() {
    var slugs = Object.keys(pendingUnknownRuntimeModelSlugs);
    for (var index = 0; index < slugs.length; index += 1) {
      if (!runtimeModelIsMapped(slugs[index])) {
        return slugs[index];
      }
      delete pendingUnknownRuntimeModelSlugs[slugs[index]];
    }
    return "";
  }

  function refreshRuntimeModelCatalog(reason, unknownSlug, accountKey) {
    if (runtimeModelCatalogPromise) {
      return runtimeModelCatalogPromise;
    }
    if (!modelCatalog || typeof modelCatalog.sanitizeRuntimeModelCatalog !== "function" || typeof fetch !== "function") {
      return Promise.resolve(null);
    }
    var refreshKey = unknownSlug ? "unknown:" + canonicalRequestModelSlug(unknownSlug) : String(reason || "panel-open");
    var attemptedAt = Number(runtimeModelCatalogRefreshAttempts[refreshKey]) || 0;
    if (attemptedAt && Date.now() - attemptedAt < RUNTIME_MODEL_CATALOG_REFRESH_ATTEMPT_TTL_MS) {
      return Promise.resolve(runtimeModelCatalog);
    }
    runtimeModelCatalogRefreshAttempts[refreshKey] = Date.now();
    var bindingGeneration = runtimeModelCatalogBindingGeneration;
    var contextKey = runtimeModelCatalogContextKey;
    var request;
    request = runtimeMessage({
      type: "usage.catalog.refresh.claim",
      reason: String(reason || "panel-open").slice(0, 32),
      unknownSlug: canonicalRequestModelSlug(unknownSlug || ""),
      accountKey: String(accountKey || "")
    }).then(function refreshClaimed(response) {
      if (!response || response.claimed !== true) {
        // Another ChatGPT tab owns this account-specific refresh. Wait only on
        // extension session storage for its published result; never issue a
        // duplicate account request and never load an unbound/other-account
        // catalog.
        return waitForRuntimeModelCatalogFromSession(accountKey, 135).then(function publishSharedCatalog(catalog) {
          if (
            bindingGeneration !== runtimeModelCatalogBindingGeneration ||
            accountKey !== runtimeModelCatalogAccountKey ||
            contextKey !== runtimeModelCatalogContextKey
          ) {
            throw new Error("model-catalog-account-binding-changed");
          }
          if (catalog) {
            publishRuntimeModelCatalog(catalog, accountKey);
          }
          return catalog;
        });
      }
      var source = window.ChatGPTConversationSource;
      var scheduledFetch = function scheduledCatalogFetch(url, options) {
        return scheduleAccountRequest(function startCatalogFetch(reportRealStart) {
          return accountFetchWithTimeout(fetch, url, options, reportRealStart);
        });
      };
      var catalogRequest = source && typeof source.requestJson === "function"
        ? source.requestJson(
            scheduledFetch,
            "/backend-api/models?history_and_training_disabled=false",
            { requestGapMs: 0, maxAttempts: 1 }
          )
        : scheduledFetch("/backend-api/models?history_and_training_disabled=false", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
          headers: { accept: "application/json" }
          }).then(function parseCatalogResponse(catalogResponse) {
            if (!catalogResponse || !catalogResponse.ok || typeof catalogResponse.json !== "function") {
              var status = Number(catalogResponse && catalogResponse.status) || 0;
              var error = new Error("model-catalog-http-" + status);
              error.status = status;
              throw error;
            }
            return catalogResponse.json();
          });
      return catalogRequest.then(function rememberCatalog(payload) {
        if (
          bindingGeneration !== runtimeModelCatalogBindingGeneration ||
          accountKey !== runtimeModelCatalogAccountKey ||
          contextKey !== runtimeModelCatalogContextKey
        ) {
          throw new Error("model-catalog-account-binding-changed");
        }
        var catalog = runtimeCatalogSnapshot(payload);
        if (!catalog) {
          throw new Error("model-catalog-empty");
        }
        runtimeModelCatalog = catalog;
        Object.keys(pendingUnknownRuntimeModelSlugs).forEach(function removeMappedPendingSlug(slug) {
          if (runtimeModelIsMapped(slug)) {
            delete pendingUnknownRuntimeModelSlugs[slug];
          }
        });
        setDiagnostic("model-catalog-status", "ok");
        setDiagnostic("model-catalog-observed-at", catalog.observedAt || "");
        publishRuntimeModelCatalog(catalog, accountKey);
        return catalog;
      });
    }).catch(function catalogFailed(error) {
      // Keep the local and cross-tab five-minute claim after failures. A hover
      // must not turn 401/403/5xx or network errors into repeated account reads.
      setDiagnostic("model-catalog-status", "error:" + String((error && error.message) || error || "unknown").slice(0, 80));
      return null;
    }).then(function allowFutureRefresh(result) {
      if (runtimeModelCatalogPromise === request) {
        runtimeModelCatalogPromise = null;
      }
      return result;
    });
    runtimeModelCatalogPromise = request;
    return request;
  }

  function ensureRuntimeModelCatalog(reason, unknownSlug) {
    return loadRuntimeModelCatalogAccountKey({
      verifyCurrentAccount: true
    }).then(function withAccountKey(accountKey) {
      if (!accountKey) {
        return null;
      }
      return loadRuntimeModelCatalogFromSession(!runtimeModelCatalog, accountKey).then(function loaded(catalog) {
        var needsUnknownSlugRefresh = Boolean(unknownSlug && !runtimeModelIsMapped(unknownSlug));
        if (catalog && !needsUnknownSlugRefresh && runtimeModelCatalogIsFresh(catalog)) {
          publishRuntimeModelCatalog(catalog, accountKey);
          return catalog;
        }
        return refreshRuntimeModelCatalog(reason, unknownSlug, accountKey);
      });
    });
  }

  function hashText(value) {
    var hash = 2166136261;
    var text = String(value || "");
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(16);
  }

  function promptIdentity(value) {
    if (value && typeof value === "object") {
      var storedHash = String(value.hash || "").slice(0, 64);
      var storedLength = Math.max(0, Math.floor(Number(value.length) || 0));
      if (storedHash) {
        return { hash: storedHash, length: storedLength };
      }
    }
    var text = String(value || "");
    return {
      hash: hashText(text),
      length: text.length
    };
  }

  function getElementText(element) {
    if (!element) {
      return "";
    }

    return normalizePromptText(element.innerText || element.textContent || "");
  }

  function getEventPath(event) {
    if (event && typeof event.composedPath === "function") {
      try {
        return event.composedPath();
      } catch (_) {
        return [];
      }
    }

    return event && event.target ? [event.target] : [];
  }

  function findSendButtonTarget(event) {
    if (detector.isSendButton(event.target)) {
      return event.target;
    }

    var path = getEventPath(event);
    for (var i = 0; i < path.length; i += 1) {
      if (detector.isSendButton(path[i])) {
        return path[i];
      }
    }

    var target = event && event.target ? event.target : null;
    if (!target) {
      return null;
    }

    var sendBtn = document.querySelector('button[data-testid="send-button"]');
    if (sendBtn && (sendBtn === target || sendBtn.contains(target))) {
      return sendBtn;
    }

    return null;
  }

  function findRegenerateTarget(event) {
    var path = getEventPath(event);
    for (var index = 0; index < path.length; index += 1) {
      var element = path[index];
      if (!element || typeof element.getAttribute !== "function") {
        continue;
      }
      var tagName = String(element.tagName || "").toLowerCase();
      var role = String(element.getAttribute("role") || "").toLowerCase();
      if (tagName !== "button" && role !== "button") {
        continue;
      }
      var label = normalizePromptText([
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("data-testid"),
        getElementText(element)
      ].filter(Boolean).join(" "));
      if (/(?:^|\b)(?:regenerate|retry|try again)(?:\b|$)|重新生成|重试回答/i.test(label)) {
        return element;
      }
    }
    return null;
  }

  function findComposerTarget(event) {
    if (detector.isComposerElement(event.target)) {
      return event.target;
    }

    var path = getEventPath(event);
    for (var i = 0; i < path.length; i += 1) {
      if (detector.isComposerElement(path[i])) {
        return path[i];
      }
    }

    if (detector.isComposerElement(document.activeElement)) {
      return document.activeElement;
    }

    return detector.findComposerElement(document, event.target);
  }

  function isDuplicate(model, promptText, now) {
    var key = model + ":" + promptIdentity(promptText).hash;
    if (lastSubmission && lastSubmission.key === key && now - lastSubmission.time < DEDUPE_WINDOW_MS) {
      return true;
    }

    lastSubmission = { key: key, time: now };
    return false;
  }

  function hasResolvedModel(modelInfo) {
    return Boolean(
      modelInfo &&
        modelInfo.label &&
        modelInfo.apiModel &&
        modelInfo.parameters &&
        modelInfo.parameters.model
    );
  }

  function hasPublicModelSelection(modelInfo) {
    return Boolean(
      modelInfo &&
      normalizePromptText(modelInfo.selectedPublicModel || modelInfo.publicModel)
    );
  }

  function normalizeSelectedPublicMode(value) {
    if (modelCatalog && typeof modelCatalog.normalizePublicMode === "function") {
      return modelCatalog.normalizePublicMode(value);
    }
    var clean = normalizePromptText(value).toLowerCase();
    if (/^(?:reasoning|think|thinking)$/.test(clean)) return "thinking";
    if (/^(?:auto|fast|instant|pro)$/.test(clean)) return clean;
    var match = clean.match(/(?:^|[-_.\s])(thinking|instant|fast|auto|pro)(?:$|[-_.\s])/i);
    return match ? match[1].toLowerCase() : "";
  }

  function selectedPublicModeLabel(value, mode) {
    var clean = normalizePromptText(value).slice(0, 64);
    if (clean && modelCatalog && typeof modelCatalog.sanitizePublicModelLabel === "function") {
      clean = modelCatalog.sanitizePublicModelLabel(clean);
    }
    if (clean) {
      return clean;
    }
    var normalized = normalizeSelectedPublicMode(mode);
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
  }

  function submittedPublicModeMetadata(modelInfo) {
    var source = modelInfo && typeof modelInfo === "object" ? modelInfo : {};
    var mode = normalizeSelectedPublicMode(source.selectedPublicMode);
    var modeSource = String(source.selectedPublicModeSource || "").slice(0, 80);
    var modeLabel = "";

    // A Work product may legitimately contain "Pro" in its model name. Only
    // explicit mode fields may classify that selector; never reinterpret the
    // Work model label as a public mode.
    if (!mode && !/^work-selector-dom$/i.test(String(source.selectedPublicModelSource || ""))) {
      mode = normalizeSelectedPublicMode(source.selectedText);
      if (mode) {
        modeSource = modeSource || "selector-dom:model-control";
      }
    }
    if (mode) {
      modeLabel = selectedPublicModeLabel(source.selectedPublicModeLabel, mode);
      modeSource = modeSource ||
        String(source.selectedPublicModelSource || "selector-dom").slice(0, 80);
    }
    return {
      selectedPublicMode: mode,
      selectedPublicModeLabel: modeLabel,
      selectedPublicModeSource: modeSource
    };
  }

  function applySubmittedPublicModeMetadata(modelInfo) {
    if (!modelInfo || typeof modelInfo !== "object") {
      return modelInfo;
    }
    var metadata = submittedPublicModeMetadata(modelInfo);
    modelInfo.selectedPublicMode = metadata.selectedPublicMode;
    modelInfo.selectedPublicModeLabel = metadata.selectedPublicModeLabel;
    modelInfo.selectedPublicModeSource = metadata.selectedPublicModeSource;
    return modelInfo;
  }

  function hasSubmittedPublicSelection(modelInfo) {
    return hasPublicModelSelection(modelInfo) ||
      Boolean(submittedPublicModeMetadata(modelInfo).selectedPublicMode);
  }

  function isRequestModelSource(source) {
    return /^(fetch-request|xhr-request|fetch-response|xhr-response|fetch-url|xhr-url|webRequest|message-dom)(?::|$)/i.test(String(source || ""));
  }

  function isExactRequestModelSource(source) {
    return /^(fetch-request|xhr-request|fetch-response|xhr-response|fetch-url|xhr-url|webRequest)(?::|$)/i.test(String(source || ""));
  }

  function canonicalRequestModelSlug(value) {
    var clean = normalizePromptText(value).slice(0, 96);
    if (modelCatalog && typeof modelCatalog.canonicalizeChatGPTModeSlug === "function") {
      return modelCatalog.canonicalizeChatGPTModeSlug(clean);
    }
    return clean.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
  }

  function isActualRequestModelSlug(value) {
    var clean = canonicalRequestModelSlug(value);
    if (modelCatalog && typeof modelCatalog.isRequestModelSlug === "function") {
      return modelCatalog.isRequestModelSlug(clean);
    }
    if (modelCatalog && typeof modelCatalog.isModelSlug === "function" && modelCatalog.isModelSlug(clean)) {
      return true;
    }
    var normalized = clean.toLowerCase().replace(/_/g, "-");
    var key = clean.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      !/^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) &&
      !/^(?:gpt)?lastusedmodel$/.test(key) &&
      !/^(auto|default|none|null|undefined|chatgpt)$/i.test(clean) &&
      !isFeatureNamedRequestSlug(clean) &&
      (hasGenericRequestModelEvidence(normalized) ||
        (/(?=.*[a-z])(?=.*\d)(?=.*[-_.])^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+$/i.test(clean) &&
          !/^(?:model|reasoning|text|tools?|temperature|max|response|request|conversation|metadata|stream|protocol|transport|endpoint|session)(?:[-_.]|$)/i.test(clean)));
  }

  function isChatGPTRouteSlug(value) {
    var clean = canonicalRequestModelSlug(value);
    if (modelCatalog && typeof modelCatalog.isChatGPTRouteSlug === "function") {
      return modelCatalog.isChatGPTRouteSlug(clean);
    }
    return clean === "auto" || isActualRequestModelSlug(clean);
  }

  function hasKnownRequestModelPrefix(value) {
    if (/^image-\d+-image$/i.test(String(value || "").replace(/_/g, "-"))) {
      return false;
    }
    return /^(?:gpt|o\d|chat-latest(?:$|[-_.])|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(String(value || ""));
  }

  function hasGenericRequestModelEvidence(value) {
    var slug = String(value || "").toLowerCase().replace(/_/g, "-");
    if (hasKnownRequestModelPrefix(slug)) {
      return true;
    }
    if (/(?:[-_.](?:thinking|instant|fast|auto|pro))$/i.test(slug) && /(?:^|[-_.])(?:\d{1,4}|latest|preview)(?:$|[-_.])/.test(slug)) {
      return true;
    }
    if (/(?:[-_.](?:latest|preview|realtime|audio|tts|transcribe))$/i.test(slug)) {
      return /(?:^|[-_.])(?:model|family|chat|assistant|response|openai|\d{1,4})(?:$|[-_.])/.test(slug);
    }
    return false;
  }

  function isFeatureNamedRequestSlug(value) {
    var slug = normalizePromptText(value).toLowerCase().replace(/_/g, "-");
    if (/^image-\d+-image$/i.test(slug)) {
      return true;
    }
    return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas)(?:$|[-_.])/.test(slug) &&
      !/^(?:gpt-image|dall-e|image-\d)/i.test(slug);
  }

  function modelModeFromSlug(value) {
    var match = String(value || "").match(/[-_.](thinking|instant|fast|auto|pro)$/i);
    return match ? match[1].toLowerCase() : "";
  }

  function normalizeUsageFeatures(features) {
    var seen = {};
    (Array.isArray(features) ? features : []).forEach(function copy(feature) {
      var clean = String(feature || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toLowerCase();
      var rawClean = clean;
      clean = clean.replace(/_v\d+$/, "");
      if (/^(agent|agent_mode|agentmode)$/.test(clean)) clean = "agent_mode";
      if (/^(deep_research|deepresearch|deep_search|deepsearch|research)$/.test(clean)) clean = "deep_research";
      if (/^(gpt_image|dalle|dall_e)$/.test(rawClean)) clean = "image_generation";
      if (/^(image|images|image_generation|imagegen)$/.test(clean)) clean = "image_generation";
      if (/^(web_search|websearch|search)$/.test(clean)) clean = "web_search";
      if (/^(realtime|real_time|realtime_mode|real_time_mode)$/.test(clean)) clean = "realtime";
      if (/^(audio|audiomode|audio_mode|voice|voicemode|voice_mode|advanced_voice|input_audio|output_audio|transcription|transcribe|tts|whisper)$/.test(clean)) clean = "audio";
      if (/^(canvas|canvases|canvas_mode|canvasmode)$/.test(clean)) clean = "canvas";
      if (/^(file_upload|fileupload|attachment|attachments|file_attachment)$/.test(clean)) clean = "file_upload";
      if (/^(code_interpreter|codeinterpreter|data_analysis|dataanalysis|python)$/.test(clean)) clean = "code_interpreter";
      if (/^(connectors|connector|apps|connected_apps|connectedapps)$/.test(clean)) clean = "connectors";
      if (/^(gpts|gpt_id|gptid|gizmo|gizmo_id|gizmoid|custom_gpt|customgpt)$/.test(clean)) clean = "gpts";
      if (/^(tasks|scheduled_task|scheduledtask|scheduled_tasks)$/.test(clean)) clean = "tasks";
      if (/^(image_generation|deep_research|agent_mode|web_search|realtime|audio|canvas|file_upload|code_interpreter|connectors|gpts|tasks)$/.test(clean)) {
        seen[clean] = true;
      }
    });
    return Object.keys(seen).sort();
  }

  function mergeUsageFeatures(primaryFeatures, secondaryFeatures) {
    return normalizeUsageFeatures((Array.isArray(primaryFeatures) ? primaryFeatures : []).concat(Array.isArray(secondaryFeatures) ? secondaryFeatures : []));
  }

  function readControlAttribute(element, name) {
    if (!element || typeof element.getAttribute !== "function") {
      return "";
    }
    return normalizePromptText(element.getAttribute(name) || "");
  }

  function readSelectedToolControlText(element) {
    if (readControlAttribute(element, "data-testid") === "model-switcher-dropdown-button") {
      return "";
    }
    var attributes = [
      "aria-label",
      "title",
      "aria-pressed",
      "aria-selected",
      "role",
      "data-testid",
      "data-state",
      "data-selected"
    ].map(function read(name) {
      return readControlAttribute(element, name);
    });
    attributes.push(getElementText(element));
    attributes.push(readSelectedToolDescendantText(element));
    return normalizePromptText(attributes.filter(Boolean).join(" "));
  }

  function readSelectedToolDescendantText(element) {
    if (!element || typeof element.querySelectorAll !== "function") {
      return "";
    }

    var parts = [];
    var selectors = "[aria-label],[title],[data-testid],[aria-pressed],[aria-selected],[data-state],[data-selected]";
    try {
      Array.prototype.slice.call(element.querySelectorAll(selectors), 0, 16).forEach(function read(descendant) {
        [
          "aria-label",
          "title",
          "aria-pressed",
          "aria-selected",
          "role",
          "data-testid",
          "data-state",
          "data-selected"
        ].forEach(function pushAttribute(name) {
          var value = readControlAttribute(descendant, name);
          if (value) {
            parts.push(value);
          }
        });
        parts.push(getElementText(descendant));
      });
    } catch (_) {
      return "";
    }
    return normalizePromptText(parts.filter(Boolean).join(" "));
  }

  function hasSelectedToolState(element, text) {
    var ariaPressed = readControlAttribute(element, "aria-pressed").toLowerCase();
    var ariaSelected = readControlAttribute(element, "aria-selected").toLowerCase();
    var dataSelected = readControlAttribute(element, "data-selected").toLowerCase();
    var dataState = readControlAttribute(element, "data-state").toLowerCase();
    var lower = String(text || "").toLowerCase();
    return ariaPressed === "true" ||
      ariaSelected === "true" ||
      dataSelected === "true" ||
      /^(selected|active|checked|on|open)$/i.test(dataState) ||
      /\b(?:click|tap|press)\s+to\s+(?:remove|deselect|turn\s+off|disable)\b/i.test(lower) ||
      /\b(?:remove|deselect|selected|selected-tool|active-tool)\b/i.test(lower);
  }

  function hasStrongSelectedToolState(text) {
    var lower = String(text || "").toLowerCase();
    return /\b(?:click|tap|press)\s+to\s+(?:remove|deselect|turn\s+off|disable)\b/i.test(lower) ||
      /\b(?:selected-tool|active-tool)\b/i.test(lower);
  }

  function isElementVisible(element) {
    if (!element || element.disabled || element.hidden) {
      return false;
    }
    if (element.style && (element.style.display === "none" || element.style.visibility === "hidden")) {
      return false;
    }
    if (typeof element.getAttribute === "function" && element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    if (typeof element.getBoundingClientRect === "function") {
      try {
        var rect = element.getBoundingClientRect();
        if (rect && Number(rect.width) === 0 && Number(rect.height) === 0) {
          return false;
        }
      } catch (_) {
        return true;
      }
    }
    return true;
  }

  function rectFromElement(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return null;
    }
    try {
      var rect = element.getBoundingClientRect();
      return rect && typeof rect.top === "number" && typeof rect.bottom === "number" ? rect : null;
    } catch (_) {
      return null;
    }
  }

  function isComposerAdjacentControl(element, composer, text) {
    if (!composer) {
      return true;
    }
    var controlRect = rectFromElement(element);
    var composerRect = rectFromElement(composer);
    if (!controlRect || !composerRect) {
      return true;
    }
    var verticalGap = Math.max(0, composerRect.top - controlRect.bottom, controlRect.top - composerRect.bottom);
    var horizontalGap = Math.max(0, composerRect.left - controlRect.right, controlRect.left - composerRect.right);
    if (selectedToolFeatureFromText(text) && (hasStrongSelectedToolState(text) || hasSelectedToolState(element, text))) {
      return verticalGap <= 520;
    }
    return verticalGap <= 260 && horizontalGap <= 220;
  }

  // 从工具 mention pill 的结构化属性映射到功能 ID。当前 ChatGPT 把已启用的工具渲染成 composer
  // 输入框里的内联 pill:<span data-symbol="ecosystemMention" data-id="search"
  // data-system-hint-type="search" data-keyword="网页搜索">网页搜索</span>。用这些稳定属性识别,
  // 不会误命中侧边栏/工具菜单里同名但未启用的链接(那些没有这些 data-* 属性)。
  function mentionPillFeature(el) {
    if (!el || typeof el.getAttribute !== "function") {
      return "";
    }
    var hint = String(el.getAttribute("data-system-hint-type") || "").toLowerCase();
    var id = String(el.getAttribute("data-id") || "").toLowerCase();
    var keyword = String(el.getAttribute("data-keyword") || el.textContent || "");
    var key = hint + " " + id;
    if (/research|deep/.test(key) || /深度研究|深度搜索/.test(keyword)) { return "deep_research"; }
    if (/agent/.test(key) || /代理|智能体/.test(keyword)) { return "agent_mode"; }
    if (/(^|[^a-z])search([^a-z]|$)|web/.test(key) || /网页搜索|联网搜索|网络搜索/.test(keyword)) { return "web_search"; }
    if (/image|dall|imagegen/.test(key) || /创建图片|生成图片|图片生成|画图/.test(keyword)) { return "image_generation"; }
    if (/canvas/.test(key) || /画布/.test(keyword)) { return "canvas"; }
    if (/audio|voice/.test(key) || /语音|听写|朗读/.test(keyword)) { return "audio"; }
    if (/file|upload|attachment/.test(key) || /文件|上传|附件/.test(keyword)) { return "file_upload"; }
    if (/code|python|analysis/.test(key) || /代码|数据分析/.test(keyword)) { return "code_interpreter"; }
    if (/connector|connected.?app|app/.test(key) || /连接器|已连接应用/.test(keyword)) { return "connectors"; }
    return "";
  }

  function selectedToolFeatureFromText(text) {
    var lower = String(text || "").toLowerCase();
    if (/\b(?:web\s+search|web_search|web-search|search\s+the\s+web|internet\s+search|search\s+the\s+internet)\b/i.test(lower) || (/\bsearch\b/i.test(lower) && /(?:data-testid\s+(?:composer-)?(?:selected-)?tool-search|composer-tool-search|web|internet|click to remove|selected[-_\s]?tool|composer-selected-tool)/i.test(lower))) {
      return "web_search";
    }
    if (/\b(?:image|images|imagegen|image\s*gen|gpt[_\-\s]?image|dall[_\-\s]?e|create\s+(?:an\s+)?image|generate\s+(?:an\s+)?image|image\s+generation)\b/i.test(lower)) {
      return "image_generation";
    }
    if (/\b(?:deep\s+research|deep\s+search|research)\b/i.test(lower)) {
      return "deep_research";
    }
    if (/\b(?:agent\s+mode|agent)\b/i.test(lower)) {
      return "agent_mode";
    }
    if (/\b(?:real\s*-?\s*time|realtime)\b/i.test(lower)) {
      return "realtime";
    }
    if (/\b(?:audio|voice|dictation|input_audio|input\s+audio|output_audio|output\s+audio|tts|whisper|advanced_voice|advanced\s+voice)\b/i.test(lower)) {
      return "audio";
    }
    if (/\b(?:canvas|canvases)\b/i.test(lower)) {
      return "canvas";
    }
    if (/\b(?:file\s*upload|upload\s*file|attachments?)\b/i.test(lower) || /文件上传|上传文件|附件/.test(lower)) {
      return "file_upload";
    }
    if (/\b(?:code\s*interpreter|data\s*analysis|python)\b/i.test(lower) || /代码解释器|数据分析/.test(lower)) {
      return "code_interpreter";
    }
    if (/\b(?:connectors?|connected\s+apps?)\b/i.test(lower) || /连接器|已连接应用/.test(lower)) {
      return "connectors";
    }
    return "";
  }

  function collectSelectedToolControls() {
    var selectors = [
      'button',
      'button[aria-label]',
      'button[title]',
      'button[aria-pressed]',
      'button[aria-selected]',
      'button[data-testid]',
      '[role="button"]',
      '[role="button"][aria-label]',
      '[role="button"][title]',
      '[role="button"][aria-pressed]',
      '[role="button"][aria-selected]',
      '[role="button"][data-testid]',
      '[aria-pressed="true"]',
      '[aria-selected="true"]',
      '[data-selected="true"]',
      '[data-state="selected"]',
      '[data-state="active"]',
      '[data-state="checked"]',
      '[data-state="on"]',
      '[data-state="open"]',
      '[aria-label*="remove" i]',
      '[title*="remove" i]',
      '[data-testid*="selected" i]',
      '[data-testid*="tool" i]'
    ];
    var controls = new Set();
    selectors.forEach(function query(selector) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function add(element) {
          controls.add(element);
        });
      } catch (_) {
        return;
      }
    });
    return controls;
  }

  function rememberSelectedToolDiagnostics(candidateCount, acceptedTexts, features) {
    setDiagnostic("selected-tool-candidates", String(candidateCount || 0));
    setDiagnostic("selected-tool-accepted", acceptedTexts.slice(0, 3).join(" | "));
    setDiagnostic("selected-tool-features", normalizeUsageFeatures(features).join(","));
  }

  function readComposerSelectedUsageFeatures(target) {
    var composer = detector.isComposerElement(target) ? target : detector.findComposerElement(document, target);
    var features = [];
    var candidateCount = 0;
    var acceptedTexts = [];
    collectSelectedToolControls().forEach(function inspect(control) {
      candidateCount += 1;
      if (!isElementVisible(control)) {
        return;
      }
      var text = readSelectedToolControlText(control);
      // 工具 chip 的文本很短(如 "Search"、"网页搜索, 点击移除")。侧边栏/对话列表等容器
      // (role=tabpanel/navigation/list…)会把整列对话标题拼成超长文本,里面的 "image"/"gpt"
      // 等词会被误判成功能。按文本长度 + 容器角色排除这类元素,避免误报。
      if (!text || text.length > 80) {
        return;
      }
      var controlRole = (control && typeof control.getAttribute === "function") ? String(control.getAttribute("role") || "").toLowerCase() : "";
      if (/^(?:tabpanel|tablist|navigation|list|listbox|menu|menubar|tree|grid|region|main|complementary|dialog|article|feed)$/.test(controlRole)) {
        return;
      }
      if (!isComposerAdjacentControl(control, composer, text)) {
        return;
      }
      if (!hasSelectedToolState(control, text)) {
        return;
      }
      var feature = selectedToolFeatureFromText(text);
      if (feature) {
        features.push(feature);
        acceptedTexts.push(text);
      }
    });
    // 精准识别 composer 输入框里已启用的工具 mention pill。只在 composer 输入框内部按结构化
    // data-* 属性匹配(data-symbol="ecosystemMention" / data-system-hint-type / data-inline-selection-pill),
    // 不扫描侧边栏与工具下拉菜单,避免把同名但未启用的工具误判为已启用。
    if (composer && typeof composer.querySelectorAll === "function") {
      var pillSelector = "[data-symbol='ecosystemMention'],[data-system-hint-type],[data-inline-selection-pill]";
      Array.prototype.forEach.call(composer.querySelectorAll(pillSelector), function pill(el) {
        var pillFeature = mentionPillFeature(el);
        if (pillFeature) {
          features.push(pillFeature);
          acceptedTexts.push(el.getAttribute("data-keyword") || el.getAttribute("data-system-hint-type") || el.getAttribute("data-id") || "");
        }
      });
    }
    rememberSelectedToolDiagnostics(candidateCount, acceptedTexts, features);
    return normalizeUsageFeatures(features);
  }

  function withSubmissionUsageFeatures(modelInfo, usageFeatures) {
    if (!hasResolvedModel(modelInfo)) {
      var onlyFeatures = normalizeUsageFeatures(usageFeatures);
      if (modelInfo && typeof modelInfo === "object") {
        var unresolvedCopy = Object.assign({}, modelInfo);
        unresolvedCopy.usageFeatures = mergeUsageFeatures(modelInfo.usageFeatures, onlyFeatures);
        return unresolvedCopy;
      }
      return onlyFeatures.length ? { usageFeatures: onlyFeatures } : modelInfo;
    }
    var copy = Object.assign({}, modelInfo);
    copy.usageFeatures = mergeUsageFeatures(modelInfo.usageFeatures, usageFeatures);
    return copy;
  }

  function sanitizeParameterKey(key) {
    return String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_.-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 64);
  }

  function sanitizeParameterValue(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "boolean" || typeof value === "number") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 16).map(function sanitizeArrayItem(item) {
        if (typeof item === "boolean" || typeof item === "number") {
          return item;
        }
        return normalizePromptText(item).slice(0, 128);
      }).filter(function keepItem(item) {
        return item !== "";
      });
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value).slice(0, 240);
      } catch (_) {
        return "";
      }
    }
    return normalizePromptText(value).slice(0, 160);
  }

  function actualModelParameters(parameters, apiModel) {
    var clean = {};
    var source = parameters && typeof parameters === "object" ? parameters : {};
    function denied(part) {
      return /^(messages?|mapping|contents?|parts|inputs?|instructions?|attachments?|files?|file_data|image_url|metadata|variables|conversation|conversation_id|parent_message_id|timezone|history_and_training_disabled|force_paragen|paragen|system|developer|user|stream|stream_options|protocol|transport|connection|endpoint|path|url|headers|authorization|cookie|client_secret|access_token|token|session_id|request_id|event_id|supports_buffering|supported_encodings|system_hints|conversation_mode|model_mode|modelmode|model_observed_source|observed_source|source|label)$/i.test(part);
    }
    function nestedRoot(part) {
      return /^(reasoning|text|format|audio|prediction|prompt|response_format|tools|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/i.test(part);
    }
    function canonical(key) {
      var safeKey = sanitizeParameterKey(key);
      if (!safeKey || denied(safeKey)) return "";
      if (safeKey === "reasoning_effort") return "reasoning.effort";
      if (safeKey === "verbosity" || safeKey === "text_verbosity") return "text.verbosity";
      if (safeKey === "topp") return "top_p";
      if (safeKey === "topk") return "top_k";
      if (safeKey === "toolchoice") return "tool_choice";
      if (safeKey === "responseformat") return "response_format";
      if (safeKey === "prompt" || safeKey === "prompts") return "";
      if (safeKey.indexOf(".") >= 0) {
        var parts = safeKey.split(".");
        return nestedRoot(parts[0]) && !parts.some(denied) ? safeKey : "";
      }
      return /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel|temperature|top_p|top_k|top_logprobs|logprobs|logit_bias|frequency_penalty|presence_penalty|max_tokens|max_output_tokens|max_completion_tokens|max_response_output_tokens|max_tool_calls|seed|n|stop|tools|tool_choice|parallel_tool_calls|response_format|modalities|output_modalities|voice|speed|service_tier|store|truncation|prompt_cache_retention|include|reasoning|text|audio|prediction|input_audio_format|output_audio_format|input_audio_transcription|turn_detection|web_search_options|image_generation_options|size|quality|style|background|moderation|output_format|output_compression|format|encoding_format|dimensions|language|timestamp_granularities|best_of|suffix|echo)$/i.test(safeKey) ? safeKey : "";
    }

    Object.keys(source).some(function copy(key) {
      var safeKey = canonical(key);
      var value = sanitizeParameterValue(source[key]);
      if (!safeKey || value === "" || value == null) {
        return false;
      }
      if (/^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/.test(safeKey) && typeof value === "string" && !isChatGPTRouteSlug(value)) {
        return false;
      }
      if (/^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/.test(safeKey) && typeof value === "string") {
        value = canonicalRequestModelSlug(value);
      }
      clean[safeKey] = value;
      return Object.keys(clean).length >= 48;
    });

    if (!clean.model && apiModel) {
      clean.model = canonicalRequestModelSlug(apiModel);
    }

    return clean;
  }

  function resolveModelText(value, source, observedAt) {
    var clean = canonicalRequestModelSlug(value);
    if (isRequestModelSource(source) && isChatGPTRouteSlug(clean)) {
      var requestInfo = typeof detector.resolveModelInfo === "function" ? detector.resolveModelInfo(clean) : null;
      return {
        label: (requestInfo && requestInfo.label) || clean,
        apiModel: clean,
        mode: (requestInfo && requestInfo.mode) || modelModeFromSlug(clean),
        parameters: actualModelParameters({ model: clean }, clean),
        chatgptModel: clean,
        observedSource: source || "",
        observedAt: observedAt || Date.now()
      };
    }

    if (!value || typeof detector.resolveModelInfo !== "function") {
      return null;
    }

    var info = detector.resolveModelInfo(value);
    if (!hasResolvedModel(info)) {
      return null;
    }

    info.parameters = actualModelParameters({ model: info.apiModel }, info.apiModel);
    info.chatgptModel = normalizePromptText(value);
    info.observedSource = source || "";
    info.observedAt = observedAt || Date.now();
    return info;
  }

  function rememberObservedModel(value, source, observedAt, shouldFlush, observedParameters, observedFeatures) {
    if (!isRequestModelSource(source)) {
      return null;
    }
    var info = resolveModelText(value, source, observedAt);
    if (!info) {
      return null;
    }

    info.parameters = actualModelParameters(observedParameters, info.apiModel);
    if (observedParameters && observedParameters.model && isActualRequestModelSlug(observedParameters.model)) {
      info.chatgptModel = canonicalRequestModelSlug(observedParameters.model);
    }
    if (/^message-dom:model-slug/i.test(String(source || ""))) {
      info.responseModel = canonicalRequestModelSlug(value);
      // A final assistant model_slug proves only the actual response model.
      // Keeping it in the request-observation slot lets a response-first race
      // fabricate requestModel from responseModel.
      return info;
    }
    info.usageFeatures = normalizeUsageFeatures(observedFeatures);
    lastObservedModelInfo = info;
    if (shouldFlush !== false) {
      flushPendingSubmission();
    }
    return info;
  }

  function readDomModel() {
    var info =
      typeof detector.findCurrentModelInfo === "function"
        ? detector.findCurrentModelInfo(document)
        : null;

    if (hasResolvedModel(info)) {
      info.parameters = actualModelParameters({ model: info.apiModel }, info.apiModel);
      info.observedSource = info.observedSource || "message-dom:dom";
      info.chatgptModel = info.chatgptModel || info.apiModel;
      if (
        runtimeModelCatalog &&
        modelCatalog &&
        typeof modelCatalog.selectedPublicModelFromText === "function"
      ) {
        info.publicModel = modelCatalog.selectedPublicModelFromText(info.selectedText || "", runtimeModelCatalog) || info.publicModel || "";
      }
      info.selectedPublicModel = info.publicModel || "";
      info.selectedPublicModelSource = info.selectedPublicModel ? "selector-dom" : "";
      applySubmittedPublicModeMetadata(info);
      setDiagnostic("detected-model", info.label);
      setDiagnostic("detected-api-model", info.apiModel);
      setDiagnostic("detected-public-model", info.selectedPublicModel);
      setDiagnostic("detected-model-source", info.observedSource);
      return info;
    }

    if (hasPublicModelSelection(info)) {
      info = Object.assign({}, info);
      info.publicModel = normalizePromptText(info.selectedPublicModel || info.publicModel || info.label).slice(0, 64);
      info.selectedPublicModel = info.publicModel;
      info.selectedPublicModelSource = String(info.selectedPublicModelSource || "selector-dom").slice(0, 80);
      info.observedSource = info.observedSource || info.selectedPublicModelSource;
      applySubmittedPublicModeMetadata(info);
      setDiagnostic("detected-public-model", info.selectedPublicModel);
      setDiagnostic("detected-model-source", info.observedSource);
      return info;
    }

    return null;
  }

  function trustedDomModelInfo(info) {
    if (!hasResolvedModel(info)) {
      return null;
    }

    var copy = Object.assign({}, info);
    var source = String(copy.observedSource || "dom");
    copy.observedSource = /^message-dom(?::|$)/i.test(source) ? source : "message-dom:" + source.slice(0, 52);
    copy.parameters = actualModelParameters(copy.parameters || { model: copy.apiModel }, copy.apiModel);
    copy.usageFeatures = normalizeUsageFeatures(copy.usageFeatures);
    return copy;
  }

  function freshObservedModel(now, minObservedAt) {
    if (hasResolvedModel(lastObservedModelInfo)) {
      var observedAt = Number(lastObservedModelInfo.observedAt || 0);
      if (!minObservedAt || observedAt >= minObservedAt) {
        if (now - observedAt <= MESSAGE_MATCH_WINDOW_MS) {
          setDiagnostic("detected-model", lastObservedModelInfo.label);
          setDiagnostic("detected-api-model", lastObservedModelInfo.apiModel);
          setDiagnostic("detected-model-source", lastObservedModelInfo.observedSource || "page");
          return lastObservedModelInfo;
        }
      }
    }

    return null;
  }

  function conversationIdFromCurrentLocation() {
    var match = String(location && location.href || "").match(/\/c\/([^/?#]+)/i);
    return match ? match[1] : "";
  }

  function normalizeSourceMode(value) {
    var clean = normalizePromptText(value).toLowerCase();
    if (clean === "work") {
      return "work";
    }
    if (clean === "chat") {
      return "chat";
    }
    return "unknown";
  }

  function readSourceMode() {
    if (!document || typeof document.querySelectorAll !== "function") {
      return "unknown";
    }
    try {
      var activeModes = Array.prototype.slice.call(
        document.querySelectorAll('[role="radiogroup"] [role="radio"][data-state="on"],[role="radiogroup"] [role="radio"][aria-checked="true"]')
      );
      for (var index = 0; index < activeModes.length; index += 1) {
        var selected = normalizeSourceMode(getElementText(activeModes[index]));
        if (selected !== "unknown") {
          return selected;
        }
      }
      if (document.querySelector('[class*="SliderTriggerModelLabel"]')) {
        return "work";
      }
      if (
        document.querySelector(
          '[data-testid="model-switcher-dropdown-button"],[data-testid*="model-switcher" i],button[aria-label*="model" i]'
        )
      ) {
        return "chat";
      }
    } catch (_) {}
    return "unknown";
  }

  function createSubmissionId(now) {
    submissionSequence += 1;
    var nonce = "";
    try {
      if (typeof crypto !== "undefined" && crypto && typeof crypto.getRandomValues === "function") {
        var bytes = new Uint32Array(2);
        crypto.getRandomValues(bytes);
        nonce = bytes[0].toString(36) + bytes[1].toString(36);
      }
    } catch (_) {}
    if (!nonce) {
      nonce = Math.random().toString(36).slice(2, 14);
    }
    return [
      "usage",
      Number(now || Date.now()).toString(36),
      submissionSequence.toString(36),
      nonce.slice(0, 16)
    ].join("-");
  }

  function removePendingResponseObservation(submissionId) {
    var id = String(submissionId || "");
    pendingResponseObservations = pendingResponseObservations.filter(function keep(item) {
      return item.submissionId !== id;
    });
  }

  function prunePendingResponseObservations(now) {
    var current = Number(now || Date.now());
    pendingResponseObservations = pendingResponseObservations.filter(function keep(item) {
      return current - Number(item.submittedAt || 0) <= 60 * 60 * 1000;
    });
  }

  function rememberPendingResponseObservation(submissionId, submittedAt, pageUrl, requestMessageId) {
    if (!submissionId) {
      return;
    }
    removePendingResponseObservation(submissionId);
    prunePendingResponseObservations(submittedAt);
    clearOlderPendingResponsesForConversation(submittedAt);
    pendingResponseObservations.push({
      submissionId: submissionId,
      submittedAt: Number(submittedAt || Date.now()),
      conversationId: conversationIdFromCurrentLocation(),
      pageUrl: String(pageUrl || location.href || ""),
      requestMessageId: sanitizeMessageId(requestMessageId),
      recorded: false,
      sending: false,
      incrementSending: false,
      incrementAttempts: 0,
      completed: false,
      submission: null,
      responseCandidate: null
    });
  }

  function pendingResponseObservationById(submissionId) {
    var id = String(submissionId || "");
    for (var index = pendingResponseObservations.length - 1; index >= 0; index -= 1) {
      if (pendingResponseObservations[index].submissionId === id) {
        return pendingResponseObservations[index];
      }
    }
    return null;
  }

  function clearOlderPendingResponsesForConversation(submittedAt) {
    var conversationId = conversationIdFromCurrentLocation();
    pendingResponseObservations = pendingResponseObservations.filter(function keep(item) {
      return (
        item.conversationId !== conversationId ||
        !item.completed ||
        Number(item.submittedAt || 0) > Number(submittedAt || 0)
      );
    });
  }

  function dispatchPendingResponseObservation(pending) {
    if (!pending || !pending.recorded || pending.sending || !pending.responseCandidate) {
      return false;
    }
    var candidate = pending.responseCandidate;
    rememberRuntimeModelSlug(candidate.model);
    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== "function" || extensionContextLost) {
      return false;
    }
    pending.sending = true;
    try {
      runtime.sendMessage({
        type: "usage.response",
        payload: {
          submissionId: pending.submissionId,
          conversationId: candidate.conversationId || pending.conversationId,
          requestMessageId: candidate.requestMessageId || pending.requestMessageId,
          responseModel: candidate.model || "",
          usageFeatures: candidate.usageFeatures || [],
          runtimeModelCatalog: runtimeModelCatalog,
          runtimeModelCatalogAccountKey: runtimeModelCatalogAccountKey,
          runtimeModelCatalogContextKey: runtimeModelCatalogContextKey,
          pageUrl: candidate.pageUrl || pending.pageUrl,
          pageTitle: candidate.pageTitle || document.title,
          responseMessageId: candidate.responseMessageId,
          observedSource: candidate.modelObservedSource || candidate.featureObservedSource,
          featureObservedSource: candidate.featureObservedSource || "",
          observedAt: new Date(candidate.observedAt).toISOString()
        }
      }, function responseObserved(response) {
        pending.sending = false;
        if (runtime.lastError || !response || !response.ok) {
          setDiagnostic("last-response-status", "error");
          return;
        }
        if (pending.responseCandidate === candidate) {
          pending.responseCandidate = null;
        }
        pending.completed = true;
        setDiagnostic("last-response-status", response.updated ? "updated" : "unchanged");
        if (candidate.model) {
          setDiagnostic("last-response-model", candidate.model);
        }
        dispatchPendingResponseObservation(pending);
      });
    } catch (error) {
      pending.sending = false;
      if (/context invalidated|Extension context/i.test(String((error && error.message) || error || ""))) {
        handleExtensionContextInvalidated();
      }
      return false;
    }
    return true;
  }

  function markPendingResponseRecorded(submissionId) {
    var pending = pendingResponseObservationById(submissionId);
    if (!pending) {
      return false;
    }
    pending.recorded = true;
    pending.incrementSending = false;
    dispatchPendingResponseObservation(pending);
    return true;
  }

  function retryPendingUsageIncrement(pending) {
    if (
      !pending ||
      pending.recorded ||
      pending.incrementSending ||
      Number(pending.incrementAttempts || 0) >= 2 ||
      !pending.responseCandidate ||
      !pending.submission
    ) {
      return false;
    }
    var item = pending.submission;
    return sendUsage(
      item.source,
      { hash: item.promptHash, length: item.promptLength },
      item.domModelInfo,
      item.time,
      item.usageFeatures,
      item.submissionId,
      item.sourceMode,
      true
    );
  }

  function sendAssistantOutcomeObservation(
    responseModel,
    usageFeatures,
    observedSource,
    observedAt,
    responseMessageId,
    requestMessageId
  ) {
    var model = canonicalRequestModelSlug(responseModel);
    var features = normalizeUsageFeatures(usageFeatures);
    if (!isActualRequestModelSlug(model)) {
      model = "";
    }
    if (!model && !features.length) {
      return false;
    }
    prunePendingResponseObservations(observedAt);
    var conversationId = conversationIdFromCurrentLocation();
    var exactRequestMessageId = sanitizeMessageId(requestMessageId);
    var matchIndex = -1;
    if (exactRequestMessageId) {
      for (var exactIndex = pendingResponseObservations.length - 1; exactIndex >= 0; exactIndex -= 1) {
        if (sanitizeMessageId(pendingResponseObservations[exactIndex].requestMessageId) === exactRequestMessageId) {
          matchIndex = exactIndex;
          break;
        }
      }
      if (matchIndex < 0) {
        return false;
      }
    } else {
      for (var index = pendingResponseObservations.length - 1; index >= 0; index -= 1) {
        var pendingConversationId = pendingResponseObservations[index].conversationId;
        if (
          !conversationId ||
          !pendingConversationId ||
          pendingConversationId === conversationId
        ) {
          matchIndex = index;
          break;
        }
      }
    }
    if (matchIndex < 0) {
      return false;
    }

    var pending = pendingResponseObservations[matchIndex];
    var previousCandidate = pending.responseCandidate || {};
    pending.responseCandidate = {
      model: model || previousCandidate.model || "",
      modelObservedSource: model
        ? String(observedSource || "message-dom:model-slug").slice(0, 64)
        : String(previousCandidate.modelObservedSource || "").slice(0, 64),
      usageFeatures: normalizeUsageFeatures([].concat(
        previousCandidate.usageFeatures || [],
        features
      )),
      featureObservedSource: features.length
        ? String(observedSource || "message-dom:feature").slice(0, 64)
        : String(previousCandidate.featureObservedSource || "").slice(0, 64),
      conversationId: conversationId || pending.conversationId,
      requestMessageId: exactRequestMessageId || pending.requestMessageId,
      pageUrl: String(location && location.href || pending.pageUrl || ""),
      pageTitle: String(document && document.title || ""),
      responseMessageId: String(responseMessageId || "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160),
      observedAt: Number(observedAt || Date.now())
    };
    if (pending.recorded) {
      dispatchPendingResponseObservation(pending);
    } else {
      retryPendingUsageIncrement(pending);
    }
    return true;
  }

  function sendResponseObservation(responseModel, observedSource, observedAt, responseMessageId, requestMessageId) {
    return sendAssistantOutcomeObservation(
      responseModel,
      [],
      observedSource,
      observedAt,
      responseMessageId,
      requestMessageId
    );
  }

  function sendUsage(source, promptText, modelInfo, now, pendingUsageFeatures, submissionId, sourceMode, isRetry) {
    var submittedPrompt = promptIdentity(promptText);
    var resolved = hasResolvedModel(modelInfo);
    var exactRequest = resolved && isExactRequestModelSource(modelInfo.observedSource);
    var hasSelection = hasSubmittedPublicSelection(modelInfo);
    var model = resolved ? modelInfo.label : "";
    var apiModel = exactRequest ? modelInfo.apiModel : "";
    var chatgptModel = exactRequest ? modelInfo.chatgptModel || "" : "";
    var modelMode = resolved ? modelInfo.mode || "" : "";
    var modelParameters = exactRequest ? modelInfo.parameters : {};
    var publicModel = resolved || hasSelection
      ? modelInfo.selectedPublicModel || modelInfo.publicModel || ""
      : "";
    var selectedPublicModelSource = resolved || hasSelection
      ? modelInfo.selectedPublicModelSource || (publicModel ? "selector-dom" : "")
      : "";
    var selectedPublicModeMetadata = resolved || hasSelection
      ? submittedPublicModeMetadata(modelInfo)
      : submittedPublicModeMetadata(null);
    var requestModel = exactRequest
      ? modelInfo.requestModel || modelParameters.model || apiModel
      : "";
    rememberRuntimeModelSlug(requestModel);
    var pendingResponse = pendingResponseObservationById(submissionId);
    if (pendingResponse && pendingResponse.incrementSending) {
      return false;
    }
    var responseCandidate = pendingResponse && pendingResponse.responseCandidate
      ? pendingResponse.responseCandidate
      : null;
    var requestMessageId = sanitizeMessageId(
      (pendingResponse && pendingResponse.requestMessageId) ||
      (modelInfo && modelInfo.requestMessageId)
    );
    var responseModel = responseCandidate &&
      isActualRequestModelSlug(responseCandidate.model)
      ? canonicalRequestModelSlug(responseCandidate.model)
      : "";
    var responseObservedAt = responseModel
      ? new Date(Number(responseCandidate.observedAt || now)).toISOString()
      : "";
    var responseObservedSource = responseModel
      ? String(responseCandidate.modelObservedSource || "message-dom:model-slug").slice(0, 64)
      : "";
    var responseMessageId = responseModel
      ? sanitizeMessageId(responseCandidate.responseMessageId)
      : "";
    var observedSource = resolved ? modelInfo.observedSource || "page" : "pending-webRequest";
    var usageFeatures = normalizeUsageFeatures([].concat(
      exactRequest ? modelInfo.usageFeatures || [] : pendingUsageFeatures || [],
      responseCandidate && responseCandidate.usageFeatures || []
    ));
    var duplicateKey = model || responseModel || "pending-webRequest";
    if (!isRetry && isDuplicate(duplicateKey, promptText, now)) {
      removePendingResponseObservation(submissionId);
      return false;
    }
    if (source !== "message-dom" && lastComposerSnapshot && lastComposerSnapshot.hash === submittedPrompt.hash) {
      lastComposerSnapshot = null;
    }
    if (source !== "message-dom") {
      lastDirectSubmission = { hash: submittedPrompt.hash, time: now };
    }

    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== "function") {
      removePendingResponseObservation(submissionId);
      setDiagnostic("last-record-status", "error:runtime-unavailable");
      return false;
    }
    if (extensionContextLost) {
      // 已知扩展上下文失效(扩展被重载/更新),不再尝试发送,避免重复抛错。
      removePendingResponseObservation(submissionId);
      return false;
    }
    setDiagnostic("last-record-status", "sending");
    setDiagnostic("last-record-model", model);
    setDiagnostic("last-record-api-model", apiModel);
    setDiagnostic("last-record-chatgpt-model", chatgptModel);
    try {
      setDiagnostic("last-record-parameters", JSON.stringify(modelParameters || {}));
    } catch (_) {
      setDiagnostic("last-record-parameters", "");
    }
    setDiagnostic("last-record-source", source);
    if (pendingResponse) {
      pendingResponse.incrementSending = true;
      pendingResponse.incrementAttempts = Number(pendingResponse.incrementAttempts || 0) + 1;
    }
    try {
    runtime.sendMessage(
      {
        type: "usage.increment",
        payload: {
          model: model,
          publicModel: publicModel,
          selectedPublicModel: publicModel,
          selectedPublicModelSource: selectedPublicModelSource,
          selectedPublicMode: selectedPublicModeMetadata.selectedPublicMode,
          selectedPublicModeLabel: selectedPublicModeMetadata.selectedPublicModeLabel,
          selectedPublicModeSource: selectedPublicModeMetadata.selectedPublicModeSource,
          apiModel: apiModel,
          chatgptModel: chatgptModel,
          requestModel: requestModel,
          responseModel: responseModel,
          responseObservedAt: responseObservedAt,
          responseObservedSource: responseObservedSource,
          responseMessageId: responseMessageId,
          modelIdentitySource: responseModel ? "response-model" : "request-model",
          modelMode: modelMode,
          modelParameters: modelParameters,
          runtimeModelCatalog: runtimeModelCatalog,
          runtimeModelCatalogAccountKey: runtimeModelCatalogAccountKey,
          runtimeModelCatalogContextKey: runtimeModelCatalogContextKey,
          usageFeatures: usageFeatures,
          modelObservedSource: observedSource,
          submissionId: submissionId,
          requestMessageId: requestMessageId,
          source: source,
          sourceMode: normalizeSourceMode(sourceMode),
          pageUrl: location.href,
          pageTitle: document.title,
          submittedAt: new Date(now).toISOString(),
          promptHash: submittedPrompt.hash,
          promptLength: submittedPrompt.length
        }
      },
      function recordResponse(response) {
        var pending = pendingResponseObservationById(submissionId);
        if (pending) {
          pending.incrementSending = false;
        }
        if (runtime.lastError) {
          removePendingResponseObservation(submissionId);
          setDiagnostic("last-record-status", "error:" + runtime.lastError.message);
          if (/context invalidated|Extension context/i.test(String(runtime.lastError.message || runtime.lastError))) {
            handleExtensionContextInvalidated();
          }
          return;
        }
        if (!response || !response.ok) {
          removePendingResponseObservation(submissionId);
          setDiagnostic("last-record-status", "error");
          return;
        }

        if (!response.recorded && response.duplicate) {
          if (pending && response.event) {
            pending.requestMessageId = sanitizeMessageId(
              response.event.requestMessageId || pending.requestMessageId
            );
            pending.conversationId = String(
              response.event.conversationId || pending.conversationId || ""
            ).slice(0, 128);
            pending.recorded = true;
            pending.submission = null;
            dispatchPendingResponseObservation(pending);
          } else {
            removePendingResponseObservation(submissionId);
          }
          setDiagnostic("last-record-status", "duplicate");
          return;
        }

        if (!response.recorded) {
          setDiagnostic("last-record-status", "blocked:no-request-model");
          retryPendingUsageIncrement(pending);
          return;
        }

        var event = response.event || {};
        if (pending) {
          pending.requestMessageId = sanitizeMessageId(
            event.requestMessageId || pending.requestMessageId
          );
          pending.conversationId = String(
            event.conversationId || pending.conversationId || ""
          ).slice(0, 128);
          if (
            responseModel &&
            pending.responseCandidate === responseCandidate
          ) {
            pending.responseCandidate = null;
            pending.completed = true;
          }
          pending.submission = null;
        }
        markPendingResponseRecorded(submissionId);
        if (event.model) {
          setDiagnostic("last-record-model", event.model);
        }
        if (event.apiModel) {
          setDiagnostic("last-record-api-model", event.apiModel);
        }
        if (event.chatgptModel) {
          setDiagnostic("last-record-chatgpt-model", event.chatgptModel);
        }
        if (event.modelParameters) {
          try {
            setDiagnostic("last-record-parameters", JSON.stringify(event.modelParameters || {}));
          } catch (_) {
            setDiagnostic("last-record-parameters", "");
          }
        }
        setDiagnostic("last-record-status", "ok");
        setDiagnostic("last-record-total", response.stats && response.stats.totals ? response.stats.totals[event.model || model] || 0 : 0);
      }
    );
    } catch (sendError) {
      if (pendingResponse) {
        pendingResponse.incrementSending = false;
      }
      var sendErrorMessage = sendError && sendError.message ? sendError.message : "send-failed";
      removePendingResponseObservation(submissionId);
      setDiagnostic("last-record-status", "error:" + sendErrorMessage);
      if (/context invalidated|Extension context/i.test(sendErrorMessage)) {
        handleExtensionContextInvalidated();
      }
      return false;
    }

    return true;
  }

  function finishPendingSubmission() {
    if (!pendingSubmissions.length) {
      return false;
    }

    var items = pendingSubmissions.slice();
    pendingSubmissions = [];
    if (pendingSubmissionTimer) {
      clearTimeout(pendingSubmissionTimer);
      pendingSubmissionTimer = null;
    }

    items.forEach(function flushPendingItem(item) {
      var observed = freshObservedModel(Date.now(), item.time - 250);
      var selectorInfo = hasSubmittedPublicSelection(item.domModelInfo) ? Object.assign({}, item.domModelInfo) : null;
      var modelInfo = hasResolvedModel(item.domModelInfo) ? Object.assign({}, item.domModelInfo) : null;
      if (hasResolvedModel(observed)) {
        if (!modelInfo) {
          modelInfo = Object.assign({}, observed);
        } else {
          modelInfo.apiModel = observed.apiModel || modelInfo.apiModel;
          modelInfo.chatgptModel = observed.chatgptModel || modelInfo.chatgptModel;
          modelInfo.mode = observed.mode || modelInfo.mode;
          modelInfo.parameters = actualModelParameters(observed.parameters, observed.apiModel);
          modelInfo.observedSource = observed.observedSource || modelInfo.observedSource;
        }
        // Never attach a previously rendered assistant slug to a new submit.
        // Response reconciliation is a separate, submission-bound event.
        delete modelInfo.responseModel;
      }
      if (hasResolvedModel(modelInfo) && selectorInfo) {
        var selectedPublicModel = normalizePromptText(
          selectorInfo.selectedPublicModel || selectorInfo.publicModel || selectorInfo.label
        ).slice(0, 64);
        if (selectedPublicModel) {
          modelInfo.publicModel = selectedPublicModel;
          modelInfo.selectedPublicModel = selectedPublicModel;
          modelInfo.selectedPublicModelSource = String(
            selectorInfo.selectedPublicModelSource || "selector-dom"
          ).slice(0, 80);
          modelInfo.selectedModelText = String(selectorInfo.selectedText || selectedPublicModel).slice(0, 160);
        }
        var submittedMode = submittedPublicModeMetadata(selectorInfo);
        modelInfo.selectedPublicMode = submittedMode.selectedPublicMode;
        modelInfo.selectedPublicModeLabel = submittedMode.selectedPublicModeLabel;
        modelInfo.selectedPublicModeSource = submittedMode.selectedPublicModeSource;
      }
      if (!modelInfo && selectorInfo) {
        modelInfo = selectorInfo;
      }
      // Only exact request fields can prove a used feature. Visible composer
      // controls remain diagnostics and never become stored usage evidence.
      if (hasResolvedModel(modelInfo)) {
        modelInfo.usageFeatures = hasResolvedModel(observed) && isExactRequestModelSource(observed.observedSource)
          ? normalizeUsageFeatures(observed.usageFeatures)
          : [];
      }
      sendUsage(
        item.source,
        { hash: item.promptHash, length: item.promptLength },
        modelInfo,
        item.time,
        [],
        item.submissionId,
        item.sourceMode
      );
    });
    return true;
  }

  function flushPendingSubmission() {
    finishPendingSubmission();
  }

  function schedulePendingSubmissionFlush() {
    var now = Date.now();
    if (freshObservedModel(now, now - 250)) {
      finishPendingSubmission();
      return;
    }

    if (typeof setTimeout !== "function") {
      finishPendingSubmission();
      return;
    }

    if (pendingSubmissionTimer) {
      clearTimeout(pendingSubmissionTimer);
    }
    pendingSubmissionTimer = setTimeout(finishPendingSubmission, MODEL_OBSERVATION_WAIT_MS);
  }

  function queueSubmission(source, promptText, domModelInfo, now, usageFeatures, sourceMode, requestMessageId) {
    var hash = hashText(promptText);
    if (source === "message-dom" && lastDirectSubmission && lastDirectSubmission.hash === hash && now - lastDirectSubmission.time < MESSAGE_MATCH_WINDOW_MS) {
      return;
    }
    for (var i = 0; i < pendingSubmissions.length; i += 1) {
      var pending = pendingSubmissions[i];
      if (pending.hash !== hash) {
        continue;
      }
      var elapsed = Math.abs(now - pending.time);
      var mirrorsSameSubmission = source === "message-dom" || pending.source === "message-dom";
      // Pointer/click/Enter duplicates arrive almost together. A rendered
      // user-message observation may arrive later, but still mirrors the same
      // submission. Allow an intentional repeat of the same prompt once it is
      // outside the short direct-event dedupe window.
      if (elapsed < DEDUPE_WINDOW_MS || (mirrorsSameSubmission && elapsed < MESSAGE_MATCH_WINDOW_MS)) {
        return;
      }
    }

    var submissionId = createSubmissionId(now);
    rememberPendingResponseObservation(
      submissionId,
      now,
      location.href,
      requestMessageId
    );
    var submission = {
      submissionId: submissionId,
      source: source,
      promptHash: hash,
      promptLength: promptText.length,
      domModelInfo: hasResolvedModel(domModelInfo) || hasSubmittedPublicSelection(domModelInfo) ? domModelInfo : null,
      usageFeatures: normalizeUsageFeatures(usageFeatures),
      sourceMode: normalizeSourceMode(sourceMode),
      time: now,
      hash: hash
    };
    pendingSubmissions.push(submission);
    var pendingResponse = pendingResponseObservationById(submissionId);
    if (pendingResponse) {
      pendingResponse.submission = submission;
    }
    schedulePendingSubmissionFlush();
  }

  function recordUsage(source, target, promptTextOverride, sourceModeOverride, requestMessageId) {
    var promptText = normalizePromptText(promptTextOverride || detector.getComposerText(document, target));
    if (!promptText) {
      return;
    }

    var now = Date.now();
    if (runtimeModelCatalogBindingSalt && runtimeModelCatalogAccountSurfaceMarker) {
      var currentSurfaceMarker = currentAccountSurfaceMarker(runtimeModelCatalogBindingSalt);
      if (
        currentSurfaceMarker &&
        currentSurfaceMarker !== runtimeModelCatalogAccountSurfaceMarker
      ) {
        invalidateRuntimeModelCatalogBinding(currentSurfaceMarker);
      }
    }
    queueSubmission(
      source,
      promptText,
      readDomModel(),
      now,
      [],
      sourceModeOverride || readSourceMode(),
      requestMessageId
    );
  }

  function recordRegeneration(source) {
    var now = Date.now();
    if (runtimeModelCatalogBindingSalt && runtimeModelCatalogAccountSurfaceMarker) {
      var currentSurfaceMarker = currentAccountSurfaceMarker(runtimeModelCatalogBindingSalt);
      if (
        currentSurfaceMarker &&
        currentSurfaceMarker !== runtimeModelCatalogAccountSurfaceMarker
      ) {
        invalidateRuntimeModelCatalogBinding(currentSurfaceMarker);
      }
    }
    var messages = collectUserMessages();
    var requestMessageId = "";
    for (var index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index] && messages[index].messageId) {
        requestMessageId = sanitizeMessageId(messages[index].messageId);
        break;
      }
    }
    queueSubmission(
      source,
      "__regenerate__:" + (conversationIdFromCurrentLocation() || "new"),
      readDomModel(),
      now,
      [],
      readSourceMode(),
      requestMessageId
    );
  }

  function refreshComposerSnapshot() {
    var promptText = normalizePromptText(detector.getComposerText(document, document.activeElement));
    if (!promptText) {
      return;
    }

    lastComposerSnapshot = {
      hash: hashText(promptText),
      text: promptText,
      sourceMode: readSourceMode(),
      time: Date.now()
    };
  }

  function deferComposerRefresh() {
    if (typeof setTimeout === "function") {
      setTimeout(refreshComposerSnapshot, 0);
      return;
    }

    refreshComposerSnapshot();
  }

  function userMessageKey(element, text) {
    var id = element && typeof element.getAttribute === "function" ? element.getAttribute("data-message-id") : "";
    if (id) {
      return "id:" + id;
    }

    return "text:" + hashText(text) + ":" + text.slice(0, 32);
  }

  function messageIdFromTurn(turn, role) {
    if (!turn) {
      return "";
    }
    var selector = '[data-message-author-role="' + role + '"]';
    var message = typeof turn.querySelector === "function"
      ? turn.querySelector(selector)
      : null;
    return sanitizeMessageId(
      (message && typeof message.getAttribute === "function" && message.getAttribute("data-message-id")) ||
      (typeof turn.getAttribute === "function" && (
        turn.getAttribute("data-message-id") ||
        turn.getAttribute("data-turn-id") ||
        turn.getAttribute("data-turn-id-container")
      ))
    );
  }

  function assistantTurnRequestMap() {
    var map = typeof Map === "function" ? new Map() : null;
    if (!map || !document || typeof document.querySelectorAll !== "function") {
      return map;
    }
    var lastUserMessageId = "";
    var turns = document.querySelectorAll('[data-turn="user"],[data-turn="assistant"]');
    Array.prototype.forEach.call(turns, function inspectTurn(turn) {
      var role = typeof turn.getAttribute === "function"
        ? String(turn.getAttribute("data-turn") || "").toLowerCase()
        : "";
      if (role === "user") {
        lastUserMessageId = messageIdFromTurn(turn, "user");
        return;
      }
      if (role === "assistant") {
        map.set(turn, lastUserMessageId);
      }
    });
    return map;
  }

  function closestAssistantTurn(element) {
    if (!element) {
      return null;
    }
    if (typeof element.closest === "function") {
      try {
        return element.closest('[data-turn="assistant"]');
      } catch (_) {}
    }
    var current = element;
    for (var depth = 0; current && depth < 12; depth += 1) {
      if (
        typeof current.getAttribute === "function" &&
        String(current.getAttribute("data-turn") || "").toLowerCase() === "assistant"
      ) {
        return current;
      }
      current = current.parentElement || current.parentNode;
    }
    return null;
  }

  function assistantModelKey(element, model) {
    var id = element && typeof element.getAttribute === "function"
      ? element.getAttribute("data-message-id") || element.getAttribute("data-turn-id") || element.getAttribute("data-turn-id-container")
      : "";
    if (id) {
      return "id:" + id + ":" + model;
    }

    return "model:" + model + ":" + hashText(getElementText(element));
  }

  function collectUserMessages() {
    var selectors = [
      '[data-message-author-role="user"]',
      '[data-testid*="user-message" i]',
      '[data-testid*="conversation-turn-user" i]'
    ];
    var found = [];
    var elements = new Set();

    selectors.forEach(function query(selector) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function add(element) {
          elements.add(element);
        });
      } catch (_) {
        return;
      }
    });

    elements.forEach(function addCandidate(element) {
      var text = getElementText(element);
      if (!text) {
        return;
      }

      found.push({
        element: element,
        key: userMessageKey(element, text),
        messageId: sanitizeMessageId(
          typeof element.getAttribute === "function"
            ? element.getAttribute("data-message-id")
            : ""
        ),
        text: text
      });
    });

    return found;
  }

  function collectAssistantModelMessages() {
    var found = [];
    var elements = new Set();
    var requestByTurn = assistantTurnRequestMap();
    [
      '[data-message-model-slug]',
      '[data-message-author-role="assistant"][data-message-model-slug]',
      '[data-turn="assistant"] [data-message-model-slug]'
    ].forEach(function query(selector) {
      try {
        Array.prototype.forEach.call(document.querySelectorAll(selector), function add(element) {
          elements.add(element);
        });
      } catch (_) {
        return;
      }
    });

    elements.forEach(function addCandidate(element) {
      var model = element && typeof element.getAttribute === "function"
        ? element.getAttribute("data-message-model-slug")
        : "";
      if (!isActualRequestModelSlug(model)) {
        return;
      }
      var assistantTurn = closestAssistantTurn(element);
      var messageRole = typeof element.getAttribute === "function"
        ? String(element.getAttribute("data-message-author-role") || "").toLowerCase()
        : "";
      var messageId = sanitizeMessageId(
        (typeof element.getAttribute === "function" && element.getAttribute("data-message-id")) ||
        messageIdFromTurn(assistantTurn, "assistant")
      );
      var pendingRequestNode = /^(?:request-web|request|tool|reasoning|research|progress)[-_:]/i.test(messageId);
      var loadingState = typeof element.getAttribute === "function"
        ? [
            element.getAttribute("aria-busy"),
            element.getAttribute("data-state"),
            element.getAttribute("data-status")
          ].join(" ").toLowerCase()
        : "";
      var hasRenderedMedia = false;
      if (typeof element.querySelector === "function") {
        try {
          hasRenderedMedia = Boolean(element.querySelector(
            'img[src],picture img,video[src],audio[src],canvas,[data-testid*="image" i],[data-generated-image]'
          ));
        } catch (_) {}
      }

      found.push({
        element: element,
        key: assistantModelKey(element, model),
        model: normalizePromptText(model),
        messageId: messageId,
        requestMessageId: requestByTurn && assistantTurn
          ? sanitizeMessageId(requestByTurn.get(assistantTurn))
          : "",
        assistantTurnId: messageIdFromTurn(assistantTurn, "assistant"),
        contentLength: getElementText(element).length,
        hasRenderedMedia: hasRenderedMedia,
        finalEvidence: Boolean(
          assistantTurn &&
          messageRole === "assistant" &&
          messageId &&
          !pendingRequestNode &&
          !/(?:^|\s)(?:true|loading|pending|streaming|in-progress)(?:\s|$)/i.test(loadingState) &&
          (getElementText(element).length > 0 || hasRenderedMedia)
        )
      });
    });

    return found;
  }

  function seedExistingUserMessages() {
    collectUserMessages().forEach(function mark(message) {
      seenUserMessages.add(message.key);
    });
    collectAssistantModelMessages().forEach(function mark(message) {
      seenAssistantModelMessages.add(message.key);
    });
    if (document && typeof document.querySelectorAll === "function") {
      try {
        Array.prototype.forEach.call(
          document.querySelectorAll('[data-turn="assistant"]'),
          function markOutcome(turn) {
            var outcome = generatedImageOutcome(turn);
            if (outcome) {
              seenAssistantOutcomeTurns.add(outcome.turnId);
            }
          }
        );
      } catch (_) {}
    }
  }

  function scanNewUserMessages() {
    var snapshot = lastComposerSnapshot;
    var now = Date.now();
    collectUserMessages().forEach(function inspect(message) {
      if (seenUserMessages.has(message.key)) {
        return;
      }

      seenUserMessages.add(message.key);
      if (!snapshot || now - snapshot.time > MESSAGE_MATCH_WINDOW_MS) {
        return;
      }

      if (hashText(message.text) !== snapshot.hash) {
        return;
      }

      var bound = false;
      for (var pendingIndex = pendingSubmissions.length - 1; pendingIndex >= 0; pendingIndex -= 1) {
        var pending = pendingSubmissions[pendingIndex];
        if (
          pending.hash === snapshot.hash &&
          now - Number(pending.time || 0) <= MESSAGE_MATCH_WINDOW_MS
        ) {
          pending.requestMessageId = message.messageId;
          var pendingResponse = pendingResponseObservationById(pending.submissionId);
          if (pendingResponse) {
            pendingResponse.requestMessageId = message.messageId;
          }
          bound = true;
          break;
        }
      }
      if (!bound) {
        recordUsage(
          "message-dom",
          message.element,
          message.text,
          snapshot.sourceMode,
          message.messageId
        );
      }
      lastComposerSnapshot = null;
    });
  }

  function commitAssistantModelCandidate(message) {
    if (!message || !message.model) {
      return false;
    }
    var observedAt = Date.now();
    rememberRuntimeModelSlug(message.model);
    var queued = sendResponseObservation(
      message.model,
      "message-dom:model-slug",
      observedAt,
      message.messageId,
      message.requestMessageId
    );
    // Background tabs can throttle the delayed submission timer for minutes.
    // A final assistant message proves that the request has already reached
    // ChatGPT, so the background webRequest observation is available now.
    // Flush the still-pending increment synchronously, then reconcile this
    // exact response against the same submission without adding a second use.
    flushPendingSubmission();
    return queued;
  }

  function scanNewAssistantModelMessages() {
    var unseen = [];
    collectAssistantModelMessages().forEach(function inspect(message) {
      if (seenAssistantModelMessages.has(message.key)) {
        return;
      }
      unseen.push(message);
    });
    if (!unseen.length) {
      return;
    }

    // Tool, reasoning and progress nodes can carry a model slug before the
    // final assistant answer. Only a content-bearing assistant message with a
    // stable message id is accepted. Metadata-only nodes remain unknown.
    var finalCandidate = null;
    for (var index = unseen.length - 1; index >= 0; index -= 1) {
      if (unseen[index].finalEvidence) {
        finalCandidate = unseen[index];
        break;
      }
    }
    if (finalCandidate) {
      seenAssistantModelMessages.add(finalCandidate.key);
      commitAssistantModelCandidate(finalCandidate);
    }
  }

  function generatedImageOutcome(turn) {
    if (!turn || typeof turn.querySelector !== "function") {
      return null;
    }
    var image = null;
    try {
      image = turn.querySelector(
        'img[alt^="Generated image:" i],img[alt*="生成的图片"],img[alt*="已生成图像"],[data-generated-image]'
      );
    } catch (_) {}
    if (!image) {
      return null;
    }
    var turnId = sanitizeMessageId(
      typeof turn.getAttribute === "function"
        ? turn.getAttribute("data-turn-id") || turn.getAttribute("data-turn-id-container")
        : ""
    );
    if (!turnId) {
      return null;
    }
    return {
      turnId: turnId,
      responseMessageId: messageIdFromTurn(turn, "assistant") || turnId
    };
  }

  function scanNewAssistantOutcomes() {
    if (!document || typeof document.querySelectorAll !== "function") {
      return;
    }
    var requestByTurn = assistantTurnRequestMap();
    var turns = [];
    try {
      turns = document.querySelectorAll('[data-turn="assistant"]');
    } catch (_) {
      return;
    }
    Array.prototype.forEach.call(turns, function inspectOutcome(turn) {
      var imageOutcome = generatedImageOutcome(turn);
      if (!imageOutcome || seenAssistantOutcomeTurns.has(imageOutcome.turnId)) {
        return;
      }
      var sent = sendAssistantOutcomeObservation(
        "",
        ["image_generation"],
        "message-dom:feature:image-generation",
        Date.now(),
        imageOutcome.responseMessageId,
        requestByTurn ? sanitizeMessageId(requestByTurn.get(turn)) : ""
      );
      if (sent) {
        seenAssistantOutcomeTurns.add(imageOutcome.turnId);
      }
    });
  }

  function finalAssistantResponsePairs() {
    var byTurn = {};
    var order = [];
    collectAssistantModelMessages().forEach(function group(message) {
      var key = sanitizeMessageId(
        message.assistantTurnId || message.messageId
      );
      if (!key) {
        return;
      }
      if (!byTurn[key]) {
        byTurn[key] = message;
        order.push(key);
        return;
      }
      if (
        Number(message.contentLength || 0) > 0 &&
        Number(byTurn[key].contentLength || 0) <= 0
      ) {
        byTurn[key] = message;
      }
    });
    return order.map(function toPair(key) {
      return byTurn[key];
    }).filter(function finalContent(message) {
      return message &&
        message.requestMessageId &&
        message.messageId &&
        message.model &&
        Number(message.contentLength || 0) > 0;
    });
  }

  function sendRecoveredResponseObservation(event, candidate, conversationId) {
    var submissionId = String((event && event.submissionId) || "").slice(0, 96);
    if (
      !submissionId ||
      !candidate ||
      !isActualRequestModelSlug(candidate.model) ||
      pendingRecoverySentSubmissionIds.has(submissionId)
    ) {
      return Promise.resolve(false);
    }
    pendingRecoverySentSubmissionIds.add(submissionId);
    rememberRuntimeModelSlug(candidate.model);
    return runtimeMessage({
      type: "usage.response",
      payload: {
        submissionId: submissionId,
        conversationId: conversationId,
        requestMessageId: sanitizeMessageId(candidate.requestMessageId),
        responseModel: canonicalRequestModelSlug(candidate.model),
        runtimeModelCatalog: runtimeModelCatalog,
        runtimeModelCatalogAccountKey: runtimeModelCatalogAccountKey,
        runtimeModelCatalogContextKey: runtimeModelCatalogContextKey,
        pageUrl: String(location && location.href || ""),
        pageTitle: String(document && document.title || ""),
        responseMessageId: sanitizeMessageId(candidate.messageId),
        observedSource: "message-dom:model-slug:recovered",
        observedAt: new Date().toISOString()
      }
    }).then(function recovered(response) {
      if (!response || !response.ok) {
        pendingRecoverySentSubmissionIds.delete(submissionId);
        return false;
      }
      setDiagnostic("last-response-status", response.updated ? "recovered" : "unchanged");
      setDiagnostic("last-response-model", candidate.model);
      return true;
    });
  }

  function reconcileStoredPendingResponses(force) {
    var conversationId = conversationIdFromCurrentLocation();
    var now = Date.now();
    if (
      !conversationId ||
      pendingRecoveryInFlight ||
      (!force &&
        pendingRecoveryConversationId === conversationId &&
        now - pendingRecoveryLastAttemptAt < 1500)
    ) {
      return;
    }
    if (pendingRecoveryConversationId !== conversationId) {
      pendingRecoverySentSubmissionIds.clear();
    }
    pendingRecoveryConversationId = conversationId;
    pendingRecoveryLastAttemptAt = now;
    pendingRecoveryInFlight = true;

    runtimeMessage({
      type: "usage.pending.get",
      conversationId: conversationId
    }).then(function reconcile(response) {
      var events = response && Array.isArray(response.events)
        ? response.events.slice().sort(function oldestFirst(left, right) {
            return String(left.submittedAt || "").localeCompare(String(right.submittedAt || ""));
          })
        : [];
      var pendingEvents = events.filter(function pending(event) {
        return event && !event.responseModel;
      });
      if (!pendingEvents.length) {
        return [];
      }

      var pairs = finalAssistantResponsePairs();
      if (!pairs.length) {
        return [];
      }
      var pairsByRequestMessageId = {};
      pairs.forEach(function indexPair(pair) {
        if (pair.requestMessageId && !pairsByRequestMessageId[pair.requestMessageId]) {
          pairsByRequestMessageId[pair.requestMessageId] = pair;
        }
      });

      var recoveries = [];
      var recoveredSubmissions = {};
      pendingEvents.forEach(function exactRequestMatch(event) {
        var pair = pairsByRequestMessageId[sanitizeMessageId(event.requestMessageId)];
        if (!pair) {
          return;
        }
        recoveredSubmissions[event.submissionId] = true;
        recoveries.push(sendRecoveredResponseObservation(event, pair, conversationId));
      });

      // Legacy events did not store the submitted user-message id. A passive
      // recovery is still exact when the number and order of stored events
      // equals the visible user→assistant turn pairs and every already-known
      // response agrees with the model_slug at the same position.
      var orderedAlignmentIsExact =
        events.length === pairs.length &&
        events.every(function knownResponsesAgree(event, index) {
          return !event.responseModel ||
            canonicalRequestModelSlug(event.responseModel) ===
              canonicalRequestModelSlug(pairs[index] && pairs[index].model);
        });
      if (orderedAlignmentIsExact) {
        events.forEach(function recoverLegacyEvent(event, index) {
          if (
            event.responseModel ||
            recoveredSubmissions[event.submissionId] ||
            !pairs[index]
          ) {
            return;
          }
          recoveries.push(
            sendRecoveredResponseObservation(event, pairs[index], conversationId)
          );
        });
      }
      return Promise.all(recoveries);
    }).finally(function recoveryFinished() {
      pendingRecoveryInFlight = false;
    });
  }

  function installUsagePanel() {
    if (
      !window.ChatGPTUsageDashboard ||
      typeof document.getElementById !== "function" ||
      typeof document.createElement !== "function" ||
      document.getElementById("chatgpt-model-usage-counter-panel-host")
    ) {
      return;
    }

    var host = document.createElement("div");
    host.id = "chatgpt-model-usage-counter-panel-host";
    host.innerHTML =
      '<button id="chatgpt-model-usage-counter-panel-toggle" type="button" title="模型统计" aria-haspopup="dialog" aria-expanded="false"><span class="chatgpt-model-usage-counter-panel-toggle-label">统计</span></button>';

    // Keep the button in ChatGPT's header, but portal the actual panel to the
    // document root. Header/action containers can establish a narrow fixed
    // containing block, which previously compressed the 400px panel to the
    // width of the Share/More button group and made it appear not to open.
    var panel = document.createElement("aside");
    panel.id = "chatgpt-model-usage-counter-panel";
    panel.hidden = true;
    panel.innerHTML = '<div id="chatgpt-model-usage-counter-panel-body"></div>';

    var style = document.createElement("style");
    style.id = "chatgpt-model-usage-counter-panel-style";
    style.textContent = [
      "#chatgpt-model-usage-counter-panel-host,#chatgpt-model-usage-counter-panel{font:13px/1.35 system-ui,sans-serif;--usage-text-primary:#18201c;--usage-surface-panel:#fbfcfa;--usage-border-control:#ccd4ca;--usage-border-panel:#dde3dc;--usage-shadow-export:rgba(15,23,42,.14);--usage-panel-toggle-hover:rgba(0,0,0,.06)}",
      "#chatgpt-model-usage-counter-panel-host{z-index:2147483647;color:inherit}",
      "#chatgpt-model-usage-counter-panel-host[data-chatgpt-model-usage-theme=\"dark\"],#chatgpt-model-usage-counter-panel[data-chatgpt-model-usage-theme=\"dark\"]{--usage-text-primary:#ececf1;--usage-surface-panel:#2a2b32;--usage-border-control:#565869;--usage-border-panel:#3e3f4b;--usage-shadow-export:rgba(0,0,0,.3);--usage-panel-toggle-hover:rgba(255,255,255,.08)}",
      "#chatgpt-model-usage-counter-panel-host.is-embedded{position:relative;display:inline-flex;align-items:center;align-self:center;flex:0 0 auto;margin-left:4px}",
      "#chatgpt-model-usage-counter-panel-host.is-main-top{margin-left:auto;margin-right:8px}",
      "#chatgpt-model-usage-counter-panel-host.is-fallback{position:fixed;right:12px;top:12px}",
      "#chatgpt-model-usage-counter-panel-main-mount{position:sticky;top:0;z-index:2147483647;display:flex;align-items:center;justify-content:flex-end;box-sizing:border-box;min-height:44px;padding:6px 12px;background:var(--main-surface-primary,transparent);pointer-events:none}",
      "#chatgpt-model-usage-counter-panel-main-mount #chatgpt-model-usage-counter-panel-host{pointer-events:auto}",
      "#chatgpt-model-usage-counter-panel-toggle{display:inline-flex;align-items:center;justify-content:center;height:32px;min-width:0;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;padding:0 8px;font:inherit;line-height:1;cursor:pointer}",
      "#chatgpt-model-usage-counter-panel-toggle:hover{background:var(--usage-panel-toggle-hover,rgba(0,0,0,.06))}",
      "#chatgpt-model-usage-counter-panel-host.is-fallback #chatgpt-model-usage-counter-panel-toggle{width:28px;height:28px;padding:0;border-color:var(--usage-border-control,#d1d5db);background:var(--usage-surface-panel,#fff);color:var(--usage-text-primary,#111827);box-shadow:0 6px 18px var(--usage-shadow-export,rgba(15,23,42,.16));font-size:0}",
      "#chatgpt-model-usage-counter-panel-host.is-fallback #chatgpt-model-usage-counter-panel-toggle::after{content:'U';font-size:12px;font-weight:700}",
      // 统计入口不再随 OpenAI 状态变色(用户:不要那个奶油色/警告样式);状态提示保留在面板状态页与工具栏角标。
      "#chatgpt-model-usage-counter-panel{position:fixed;z-index:2147483647;top:52px;right:12px;box-sizing:border-box;width:min(430px,calc(100vw - 24px));height:min(600px,calc(100vh - 76px));overflow:hidden;border:1px solid var(--usage-border-panel,rgba(24,32,28,.14));border-radius:8px;background:var(--usage-surface-panel,#fbfcfa);color:var(--usage-text-primary,#18201c);box-shadow:0 18px 42px var(--usage-shadow-export,rgba(24,32,28,.14))}",
      "#chatgpt-model-usage-counter-panel-body{height:100%;padding:0;overflow:hidden}",
      "@media (max-width:720px){#chatgpt-model-usage-counter-panel{left:10px;right:10px;top:48px;width:auto;height:calc(100vh - 64px)}}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
    (document.body || document.documentElement).appendChild(panel);

    var body = panel.querySelector("#chatgpt-model-usage-counter-panel-body");
    var toggleButton = host.querySelector("#chatgpt-model-usage-counter-panel-toggle");
    var toggleLabel = host.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
    var dashboard = null;
    var currentPanelLanguage = "en";
    var currentPanelThemeMode = "system";
    var currentStatusRecord = null;
    var lastMountedLocation = "";
    var panelCloseTimer = null;
    var panelInteractionMode = "";
    var panelCatalogActivationPending = false;
    var panelCatalogAppliedFingerprint = "";

    function hasDarkClass(element) {
      return Boolean(element && /(^|\s)dark(\s|$)/i.test(String(element.className || "")));
    }

    function readDataTheme(element) {
      return element && typeof element.getAttribute === "function"
        ? String(element.getAttribute("data-theme") || "").toLowerCase()
        : "";
    }

    function parseColorChannel(value) {
      var percent = /%$/.test(String(value || "").trim());
      var number = parseFloat(value);
      if (!Number.isFinite(number)) {
        return 0;
      }
      return percent ? Math.max(0, Math.min(255, number * 2.55)) : Math.max(0, Math.min(255, number));
    }

    function parseAlpha(value) {
      if (value == null || value === "") {
        return 1;
      }
      var percent = /%$/.test(String(value || "").trim());
      var number = parseFloat(value);
      if (!Number.isFinite(number)) {
        return 1;
      }
      return percent ? Math.max(0, Math.min(1, number / 100)) : Math.max(0, Math.min(1, number));
    }

    function rgbFromColor(value) {
      var color = String(value || "").trim();
      var rgb = color.match(/^rgba?\(([^)]+)\)$/i);
      if (rgb) {
        var parts = rgb[1].split(/\s*,\s*|\s+\/\s*|\s+/).filter(Boolean);
        if (parts.length >= 3) {
          var alpha = parseAlpha(parts[3]);
          if (alpha <= 0) {
            return null;
          }
          return {
            r: parseColorChannel(parts[0]),
            g: parseColorChannel(parts[1]),
            b: parseColorChannel(parts[2])
          };
        }
      }
      var hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (!hex) {
        return null;
      }
      var valuePart = hex[1];
      if (valuePart.length === 3) {
        valuePart = valuePart.replace(/./g, "$&$&");
      }
      return {
        r: parseInt(valuePart.slice(0, 2), 16),
        g: parseInt(valuePart.slice(2, 4), 16),
        b: parseInt(valuePart.slice(4, 6), 16)
      };
    }

    function relativeLuminance(color) {
      function channel(value) {
        value = value / 255;
        return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
      }
      return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    }

    function computedBackgroundColor(element) {
      if (!element) {
        return "";
      }
      var reader = typeof getComputedStyle === "function"
        ? getComputedStyle
        : window && typeof window.getComputedStyle === "function" ? window.getComputedStyle.bind(window) : null;
      if (!reader) {
        return "";
      }
      try {
        var styles = reader(element);
        return styles && (styles.backgroundColor || styles.background || "");
      } catch (_) {
        return "";
      }
    }

    function detectComputedPageTheme() {
      var candidates = [document.body, document.documentElement, typeof document.querySelector === "function" ? document.querySelector("main") : null];
      var sawLight = false;
      for (var index = 0; index < candidates.length; index += 1) {
        var color = rgbFromColor(computedBackgroundColor(candidates[index]));
        if (color) {
          if (relativeLuminance(color) < 0.5) {
            return "dark";
          }
          sawLight = true;
        }
      }
      return sawLight ? "light" : "";
    }

    function preferredPanelTheme() {
      var query = window && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      return query && query.matches ? "dark" : "light";
    }

    function normalizePanelThemeMode(value) {
      var clean = String(value || "").trim().toLowerCase();
      return clean === "light" || clean === "dark" ? clean : "system";
    }

    function resolvePanelTheme() {
      return currentPanelThemeMode === "light" || currentPanelThemeMode === "dark"
        ? currentPanelThemeMode
        : preferredPanelTheme();
    }

    function applyPanelTheme() {
      var theme = resolvePanelTheme();
      host.setAttribute("data-chatgpt-model-usage-theme", theme);
      host.setAttribute("data-chatgpt-model-usage-theme-mode", currentPanelThemeMode);
      panel.setAttribute("data-chatgpt-model-usage-theme", theme);
      panel.setAttribute("data-chatgpt-model-usage-theme-mode", currentPanelThemeMode);
    }

    function applyPanelThemeMode(value) {
      currentPanelThemeMode = normalizePanelThemeMode(value);
      applyPanelTheme();
    }

    function observePanelTheme() {
      applyPanelTheme();
      var mediaQuery = window && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
      if (mediaQuery && typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", function systemThemeChanged() {
          if (currentPanelThemeMode === "system") {
            applyPanelTheme();
          }
        });
      }
      if (mediaQuery && typeof mediaQuery.addListener === "function") {
        mediaQuery.addListener(function legacySystemThemeChanged() {
          if (currentPanelThemeMode === "system") {
            applyPanelTheme();
          }
        });
      }
    }

    function normalizeStatusState(value) {
      var state = String(value || "").toLowerCase();
      return /^(operational|degraded|partial|maintenance|major|unavailable|unknown|timeout|fetch-failure)$/.test(state) ? state : "unknown";
    }

    function statusLabel(record, language) {
      var label = String((record && record.label) || "").replace(/\s+/g, " ").trim();
      if (label) {
        return label;
      }
      var state = normalizeStatusState(record && record.state);
      if (language === "en") {
        if (state === "operational") return "Operational";
        if (state === "degraded") return "Degraded performance";
        if (state === "partial") return "Partial outage";
        if (state === "maintenance") return "Under maintenance";
        if (state === "major") return "Major outage";
        if (state === "unavailable") return "Status unavailable";
        if (state === "timeout") return "Status check timed out";
        if (state === "fetch-failure") return "Status fetch failed";
        return "Unknown";
      }
      if (state === "operational") return "正常";
      if (state === "degraded") return "性能下降";
      if (state === "partial") return "部分中断";
      if (state === "maintenance") return "维护中";
      if (state === "major") return "严重中断";
      if (state === "unavailable") return "状态不可用";
      if (state === "timeout") return "状态检查超时";
      if (state === "fetch-failure") return "状态获取失败";
      return "未知";
    }

    function applyPanelToggleState() {
      var language = currentPanelLanguage === "en" ? "en" : "zh";
      var isEnglish = language === "en";
      var baseTitle = isEnglish ? "Model Usage" : "模型统计";
      if (toggleButton) {
        toggleButton.title = baseTitle;
      }
      if (toggleLabel) {
        toggleLabel.textContent = isEnglish ? "Usage" : "统计";
      }
      if (!currentStatusRecord) {
        host.removeAttribute("data-openai-status-state");
        host.removeAttribute("data-openai-status-label");
        return;
      }
      var state = normalizeStatusState(currentStatusRecord.state);
      var label = statusLabel(currentStatusRecord, language);
      host.setAttribute("data-openai-status-state", state);
      host.setAttribute("data-openai-status-label", label);
      if (toggleButton) {
        toggleButton.title = baseTitle + " · OpenAI: " + label;
        toggleButton.setAttribute("aria-label", toggleButton.title);
      }
    }

    function applyPanelToggleLanguage(language) {
      currentPanelLanguage = language === "en" ? "en" : "zh";
      applyPanelToggleState();
    }

    function applyPanelToggleStatus(record) {
      currentStatusRecord = record && typeof record === "object" ? record : null;
      applyPanelToggleState();
    }

    function readPanelToggleLanguage() {
      applyPanelToggleLanguage("en");
      if (!window.chrome || !chrome.storage || !chrome.storage.local || typeof chrome.storage.local.get !== "function") {
        return;
      }
      try {
        chrome.storage.local.get([SETTINGS_KEY, STATUS_KEY], function applyStoredLanguage(items) {
          if (chrome.runtime && chrome.runtime.lastError) {
            applyPanelToggleLanguage("en");
            applyPanelThemeMode("system");
            return;
          }
          var settings = items && items[SETTINGS_KEY];
          applyPanelToggleLanguage(settings && settings.language === "zh" ? "zh" : "en");
          applyPanelThemeMode(settings && settings.themeMode);
          applyPanelToggleStatus(items && items[STATUS_KEY]);
        });
      } catch (_) {
        applyPanelToggleLanguage("en");
        applyPanelThemeMode("system");
      }
    }

    readPanelToggleLanguage();
    observePanelTheme();

    if (window.chrome && chrome.storage && chrome.storage.onChanged && typeof chrome.storage.onChanged.addListener === "function") {
      chrome.storage.onChanged.addListener(function updatePanelToggleLanguage(changes, areaName) {
        if (areaName !== "local") {
          return;
        }
        var settingsChange = changes && changes[SETTINGS_KEY];
        if (settingsChange) {
          var settings = settingsChange.newValue;
          applyPanelToggleLanguage(settings && settings.language === "zh" ? "zh" : "en");
          applyPanelThemeMode(settings && settings.themeMode);
        }
        var statusChange = changes && changes[STATUS_KEY];
        if (statusChange) {
          applyPanelToggleStatus(statusChange.newValue);
        }
      });
    }

    function queryAll(root, selector) {
      if (!root || typeof root.querySelectorAll !== "function") {
        return [];
      }
      try {
        return Array.prototype.slice.call(root.querySelectorAll(selector));
      } catch (_) {
        return [];
      }
    }

    function closest(element, selector) {
      if (!element || typeof element.closest !== "function") {
        return null;
      }
      try {
        return element.closest(selector);
      } catch (_) {
        return null;
      }
    }

    function elementRect(element) {
      if (!element || typeof element.getBoundingClientRect !== "function") {
        return null;
      }
      try {
        return element.getBoundingClientRect();
      } catch (_) {
        return null;
      }
    }

    function elementTag(element) {
      return String((element && element.tagName) || "").toLowerCase();
    }

    function isOwnPanelElement(element) {
      return element === host ||
        element === panel ||
        Boolean(closest(element, "#chatgpt-model-usage-counter-panel-host,#chatgpt-model-usage-counter-panel"));
    }

    function isSyntheticMainMount(element) {
      return Boolean(element && element.id === "chatgpt-model-usage-counter-panel-main-mount");
    }

    function isSidebarElement(element) {
      return Boolean(closest(element, "aside,[data-testid*='sidebar' i],[aria-label*='sidebar' i]"));
    }

    function isUsableTopBar(element) {
      if (!element || isOwnPanelElement(element) || isSyntheticMainMount(element) || isSidebarElement(element)) {
        return false;
      }
      var rect = elementRect(element);
      if (!rect) {
        return true;
      }
      var width = Number(rect.width || 0);
      var height = Number(rect.height || 0);
      var top = Number(rect.top || 0);
      if (!width && rect.right != null && rect.left != null) {
        width = Number(rect.right) - Number(rect.left);
      }
      if (!height && rect.bottom != null && rect.top != null) {
        height = Number(rect.bottom) - Number(rect.top);
      }
      return width >= 180 && height >= 28 && height <= 140 && top >= -12 && top <= 160;
    }

    function isUsableMainContent(element) {
      if (!element || isOwnPanelElement(element) || isSidebarElement(element)) {
        return false;
      }
      var rect = elementRect(element);
      if (!rect) {
        return true;
      }
      var width = Number(rect.width || 0);
      var height = Number(rect.height || 0);
      var top = Number(rect.top || 0);
      if (!width && rect.right != null && rect.left != null) {
        width = Number(rect.right) - Number(rect.left);
      }
      if (!height && rect.bottom != null && rect.top != null) {
        height = Number(rect.bottom) - Number(rect.top);
      }
      return width >= 320 && height >= 220 && top <= 180;
    }

    function findMainContent() {
      var selectors = ["main", '[role="main"]'];
      for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
        var nodes = queryAll(document, selectors[selectorIndex]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          if (isUsableMainContent(nodes[nodeIndex])) {
            return nodes[nodeIndex];
          }
        }
      }
      return null;
    }

    function topBarFromAnchor(anchor) {
      var current = anchor;
      var best = null;
      for (var depth = 0; current && depth < 8; depth += 1) {
        if (isUsableTopBar(current)) {
          best = current;
        }
        if (elementTag(current) === "main") {
          break;
        }
        current = current.parentElement || current.parentNode;
      }
      return best;
    }

    function findTopBarByAnchor() {
      var selectors = [
        'main [data-testid="model-switcher-dropdown-button"]',
        'main [data-testid*="model-switcher" i]',
        'main button[aria-label*="model" i]',
        'main button[aria-haspopup="menu"]',
        '[data-testid="model-switcher-dropdown-button"]',
        '[data-testid*="model-switcher" i]',
        'button[aria-label*="model" i]',
        'button[aria-haspopup="menu"]'
      ];
      for (var selectorIndex = 0; selectorIndex < selectors.length; selectorIndex += 1) {
        var nodes = queryAll(document, selectors[selectorIndex]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          var topBar = topBarFromAnchor(nodes[nodeIndex]);
          if (topBar) {
            return topBar;
          }
        }
      }
      return null;
    }

    function ensureMainTopMount() {
      var main = findMainContent();
      if (!main || typeof document.createElement !== "function") {
        return null;
      }

      var mount = typeof document.getElementById === "function" ? document.getElementById("chatgpt-model-usage-counter-panel-main-mount") : null;
      if (!mount) {
        mount = document.createElement("div");
        mount.id = "chatgpt-model-usage-counter-panel-main-mount";
        mount.setAttribute("data-chatgpt-model-usage-counter-panel-main-mount", "true");
      }
      if (mount.parentNode !== main) {
        if (main.firstChild && typeof main.insertBefore === "function") {
          main.insertBefore(mount, main.firstChild);
        } else if (typeof main.appendChild === "function") {
          main.appendChild(mount);
        }
      }
      return mount;
    }

    function findPanelMount() {
      // 优先:把入口放进「对话内标题栏」的右侧动作区(分享 / … 按钮所在的组),
      // 这样统计入口就紧贴标题栏右侧,而不是漂浮或挤在顶部。该组较窄会被 isUsableTopBar
      // 的宽度阈值拒绝,所以这里按 testid 直接命中、绕过宽度检查。
      if (typeof document.querySelector === "function") {
        var rightActions =
          document.getElementById("conversation-header-actions") ||
          document.querySelector('[data-testid="thread-header-right-actions"]') ||
          document.querySelector('[data-testid="conversation-header-actions"]');
        if (rightActions && !isOwnPanelElement(rightActions) && !isSidebarElement(rightActions)) {
          return { element: rightActions, kind: "header-actions" };
        }
      }

      var selectors = [
        "main header",
        'main [data-testid="conversation-header"]',
        'main [data-testid="chat-header"]',
        'main [data-testid="conversation-panel-header"]',
        'main [data-testid="thread-header"]',
        'main [data-testid="main-header"]',
        'main [data-testid*="header" i]',
        'main [data-testid*="toolbar" i]',
        'main [role="toolbar"]',
        'main [class*="sticky"][class*="top-0"]',
        'main [class*="sticky"][class*="top"]',
        "main > div:first-child",
        "main > div > div:first-child",
        '[data-testid="conversation-header"]',
        '[data-testid="chat-header"]',
        '[data-testid="conversation-panel-header"]',
        '[data-testid="thread-header"]',
        '[data-testid*="header" i]',
        '[data-testid*="toolbar" i]',
        '[role="toolbar"]',
        "header"
      ];
      for (var index = 0; index < selectors.length; index += 1) {
        var nodes = queryAll(document, selectors[index]);
        for (var nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
          if (isUsableTopBar(nodes[nodeIndex])) {
            return { element: nodes[nodeIndex], kind: "header" };
          }
        }
      }
      var anchoredTopBar = findTopBarByAnchor();
      if (anchoredTopBar) {
        return { element: anchoredTopBar, kind: "header" };
      }
      var mainTopMount = ensureMainTopMount();
      return mainTopMount ? { element: mainTopMount, kind: "main-top" } : null;
    }

    function attachHost() {
      var mount = findPanelMount();
      if (mount) {
        if (host.parentNode !== mount.element) {
          mount.element.appendChild(host);
        }
        host.classList.add("is-embedded");
        host.classList.remove("is-fallback");
        if (mount.kind === "main-top") {
          host.classList.add("is-main-top");
        } else {
          host.classList.remove("is-main-top");
        }
        lastMountedLocation = String(location && location.href || "");
        return true;
      }

      if (!host.parentNode) {
        (document.body || document.documentElement).appendChild(host);
      }
      host.classList.add("is-fallback");
      host.classList.remove("is-embedded");
      host.classList.remove("is-main-top");
      lastMountedLocation = String(location && location.href || "");
      return false;
    }

    function hostIsConnected() {
      return typeof host.isConnected === "boolean" ? host.isConnected : Boolean(host.parentNode);
    }

    function maintainPanelMount() {
      var currentLocation = String(location && location.href || "");
      if (!hostIsConnected() || currentLocation !== lastMountedLocation) {
        attachHost();
      }
      if (!panel.isConnected) {
        (document.body || document.documentElement).appendChild(panel);
      }
    }

    function observePanelMount() {
      if (typeof MutationObserver !== "function") {
        return;
      }
      // Observe <html>, not the current <body>: some ChatGPT routes replace the
      // whole body during SPA navigation. An observer attached to the old body
      // would then stop seeing changes and leave the entry inside detached DOM.
      var root = document.documentElement || document.body;
      if (!root) {
        return;
      }
      // 持续观察,绝不一次性 disconnect:ChatGPT 重渲染标题栏(尤其多对话导出会逐个切换对话)
      // 会把入口从 DOM 里移除,之前 attach 成功就 disconnect 导致入口一去不返(用户:导出后统计入口消失)。
      // 现在只要入口掉了(host 不在文档里)就立刻重新挂回去;平时挂着只读一个布尔值,几乎零开销。
      var observer = new MutationObserver(function retryAttach() {
        if (!hostIsConnected()) {
          attachHost();
        }
        if (!panel.isConnected) {
          (document.body || document.documentElement).appendChild(panel);
        }
      });
      observer.observe(root, { childList: true, subtree: true });
    }

    function panelLabels(language) {
      if (language === "en") {
        return { toggle: "Usage", title: "Model usage" };
      }

      return { toggle: "统计", title: "模型统计" };
    }

    function applyPanelLanguage(language) {
      var labels = panelLabels(language);
      var toggleLabel = host.querySelector(".chatgpt-model-usage-counter-panel-toggle-label");
      if (toggleButton) {
        toggleButton.title = labels.title;
      }
      if (toggleLabel) {
        toggleLabel.textContent = labels.toggle;
      }
    }

    function activateUsageModelCatalog() {
      // A page-entry hover is only a visual preview. Keep signed-in account
      // reads behind an explicit click.
      if (panelInteractionMode !== "click") {
        return;
      }
      var unknownSlug = nextUnknownRuntimeModelSlug();
      if (panelCatalogActivationPending) {
        return;
      }
      panelCatalogActivationPending = true;
      ensureRuntimeModelCatalog("panel-usage", unknownSlug).then(function refreshMappedStats(catalog) {
        panelCatalogActivationPending = false;
        if (!catalog) {
          return;
        }
        var appliedFingerprint = [
          runtimeModelCatalogAccountKey,
          runtimeModelCatalogContextKey,
          String(catalog.observedAt || "")
        ].join("\u0001");
        var catalogChanged = appliedFingerprint !== panelCatalogAppliedFingerprint;
        panelCatalogAppliedFingerprint = appliedFingerprint;
        if (
          (catalogChanged || unknownSlug) &&
          dashboard &&
          typeof dashboard.reload === "function"
        ) {
          dashboard.reload({ skipExportList: true });
        }
      }, function catalogUnavailable() {
        panelCatalogActivationPending = false;
      });
    }

    function openPanel(interactionMode) {
      if (panelCloseTimer) {
        clearTimeout(panelCloseTimer);
        panelCloseTimer = null;
      }
      if (interactionMode) {
        panelInteractionMode = interactionMode;
      }
      panel.hidden = false;
      toggleButton.setAttribute("aria-expanded", "true");
      reconcileStoredPendingResponses(true);
      if (!dashboard) {
        dashboard = window.ChatGPTUsageDashboard.init(body, {
          surface: "page",
          onLanguageChange: applyPanelLanguage,
          onUsageViewActivate: activateUsageModelCatalog
        });
      } else {
        if (
          panelInteractionMode === "hover" &&
          typeof dashboard.resetInteractionMode === "function"
        ) {
          dashboard.resetInteractionMode();
        }
        dashboard.reload({ restoreActiveView: true });
      }
    }

    function closePanel() {
      if (panelCloseTimer) {
        clearTimeout(panelCloseTimer);
        panelCloseTimer = null;
      }
      if (
        dashboard &&
        typeof dashboard.cancelPendingExportConversationList === "function"
      ) {
        dashboard.cancelPendingExportConversationList();
      }
      panel.hidden = true;
      toggleButton.setAttribute("aria-expanded", "false");
      panelInteractionMode = "";
      if (dashboard && typeof dashboard.resetInteractionMode === "function") {
        dashboard.resetInteractionMode();
      }
    }

    function schedulePanelClose(event) {
      if (panelInteractionMode === "click") {
        return;
      }
      var nextTarget = event && event.relatedTarget;
      if (
        nextTarget &&
        (
          (typeof panel.contains === "function" && panel.contains(nextTarget)) ||
          (typeof host.contains === "function" && host.contains(nextTarget))
        )
      ) {
        return;
      }
      if (panelCloseTimer) {
        clearTimeout(panelCloseTimer);
      }
      panelCloseTimer = setTimeout(function closeAfterPointerLeavesEntryAndPanel() {
        panelCloseTimer = null;
        try {
          if (
            (typeof panel.matches === "function" && panel.matches(":hover")) ||
            (typeof host.matches === "function" && host.matches(":hover"))
          ) {
            return;
          }
        } catch (_) {}
        closePanel();
      }, 180);
    }

    function keepPanelOpenOnHover() {
      if (panelCloseTimer) {
        clearTimeout(panelCloseTimer);
        panelCloseTimer = null;
      }
      if (panelInteractionMode === "click") {
        return;
      }
      if (panel.hidden && !extensionContextLost && !extensionContextSeemsLost()) {
        openPanel("hover");
      } else if (!panel.hidden) {
        panelInteractionMode = "hover";
      }
    }

    attachHost();
    ensureUsagePanelMounted = maintainPanelMount;
    // 始终观察并在入口掉了时重挂(过去只在初次落到 fallback 才观察,导致已嵌入标题栏的入口
    // 在 ChatGPT 重渲染标题栏后——尤其多对话导出逐个切换对话时——掉了就再也回不来)。
    observePanelMount();

    host.addEventListener("mouseenter", keepPanelOpenOnHover);
    host.addEventListener("mouseleave", schedulePanelClose);
    panel.addEventListener("mouseenter", keepPanelOpenOnHover);
    panel.addEventListener("mouseleave", schedulePanelClose);

    toggleButton.addEventListener("click", function toggle() {
      if (extensionContextLost || extensionContextSeemsLost()) {
        handleExtensionContextInvalidated();
        if (location && typeof location.reload === "function") {
          location.reload();
        }
        return;
      }
      if (panel.hidden) {
        openPanel("click");
        return;
      }
      if (panelInteractionMode === "hover") {
        panelInteractionMode = "click";
        if (
          dashboard &&
          (
            !dashboard.state ||
            dashboard.state.activeView === "chart"
          )
        ) {
          activateUsageModelCatalog();
        }
        return;
      }
      closePanel();
    });
  }

  function startMessageObserver() {
    seedExistingUserMessages();
    refreshComposerSnapshot();
    reconcileStoredPendingResponses(true);
    if (document && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", function recoverWhenVisible() {
        if (document.hidden !== true) {
          reconcileStoredPendingResponses(true);
        }
      });
    }
    if (window && typeof window.addEventListener === "function") {
      window.addEventListener("focus", function recoverWhenFocused() {
        reconcileStoredPendingResponses(true);
      });
    }

    if (typeof MutationObserver === "function") {
      var root = document.body || document.documentElement;
      if (root) {
        new MutationObserver(function handleMutations() {
          refreshComposerSnapshot();
          scanNewUserMessages();
          scanNewAssistantModelMessages();
          scanNewAssistantOutcomes();
          reconcileStoredPendingResponses(false);
        }).observe(root, {
          childList: true,
          characterData: true,
          subtree: true
        });
      }
    }

    if (typeof setInterval === "function") {
      setInterval(function refreshRuntimeSnapshot() {
        // 主动发现“扩展被重载、本页旧脚本已失效”,尽早把入口标成“刷新”,别让用户对着死面板以为统计坏了。
        if (extensionContextSeemsLost()) {
          handleExtensionContextInvalidated();
          return;
        }
        if (typeof ensureUsagePanelMounted === "function") {
          ensureUsagePanelMounted();
        }
        refreshComposerSnapshot();
        scanNewAssistantModelMessages();
        scanNewAssistantOutcomes();
        reconcileStoredPendingResponses(false);
        readDomModel();
      }, COMPOSER_POLL_MS);
    }
  }

  document.addEventListener(
    "pointerdown",
    function handlePointerdown(event) {
      refreshComposerSnapshot();
      var button = findSendButtonTarget(event);
      if (button) {
        recordUsage("send-button", button);
        return;
      }
      if (findRegenerateTarget(event)) {
        recordRegeneration("regenerate");
      }
    },
    true
  );

  document.addEventListener(
    "pointerup",
    function handlePointerup(event) {
      refreshComposerSnapshot();
      var button = findSendButtonTarget(event);
      if (button) {
        recordUsage("send-button", button);
        return;
      }
      if (findRegenerateTarget(event)) {
        recordRegeneration("regenerate");
      }
    },
    true
  );

  document.addEventListener(
    "click",
    function handleClick(event) {
      refreshComposerSnapshot();
      var button = findSendButtonTarget(event);
      if (button) {
        recordUsage("send-button", button);
        return;
      }
      if (findRegenerateTarget(event)) {
        recordRegeneration("regenerate");
      }
    },
    true
  );

  document.addEventListener(
    "submit",
    function handleSubmit(event) {
      refreshComposerSnapshot();
      if (detector.getComposerText(document, event.target)) {
        recordUsage("form-submit", event.target);
      }
    },
    true
  );

  document.addEventListener(
    "keydown",
    function handleKeydown(event) {
      refreshComposerSnapshot();
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing
      ) {
        return;
      }

      var composer = findComposerTarget(event);
      if (!composer || !detector.getComposerText(document, composer)) {
        return;
      }

      recordUsage("enter-key", composer);
      lastComposerSnapshot = null;
    },
    true
  );

  document.addEventListener("beforeinput", deferComposerRefresh, true);
  document.addEventListener("input", deferComposerRefresh, true);
  document.addEventListener("keyup", refreshComposerSnapshot, true);
  readDomModel();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMessageObserver, { once: true });
  } else {
    startMessageObserver();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installUsagePanel, { once: true });
  } else {
    installUsagePanel();
  }

  // Conversation export is deliberately local-only. The current rendered
  // conversation is read from the existing DOM; full-history selection comes
  // from a user-imported official ChatGPT data export stored by the extension.
  // No session token, account id, internal conversation index, or conversation
  // detail endpoint is read by this interface.
  if (chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === "function") {
    function exportConversationIdFromPath() {
      return (String(location.pathname || "").match(/\/c\/([^/?#]+)/) || [])[1] || "";
    }

    function exportProjectIdFromPath() {
      var match = String(location.pathname || "").match(/\/g\/(g-p-[0-9a-f]{32})(?:-[^/?#]+)?\/c\//i);
      return match ? String(match[1]).toLowerCase() : "";
    }

    function currentConversationForExport() {
      var id = exportConversationIdFromPath();
      if (!id) {
        return {
          conversation: null,
          currentConversationId: "",
          complete: false,
          source: "current-dom"
        };
      }
      var link = null;
      try {
        link = document.querySelector('a[href$="/c/' + id + '"]') ||
          document.querySelector('a[href*="/c/' + id + '"]');
      } catch (_) {}
      var explicitTitleNode = link && typeof link.querySelector === "function"
        ? link.querySelector('[data-conversation-title],[data-testid*="conversation-title" i]')
        : null;
      var pageTitle = String(document.title || "").replace(/\s*[-|]\s*ChatGPT\s*$/i, "");
      var title = [
        explicitTitleNode && (explicitTitleNode.innerText || explicitTitleNode.textContent),
        link && (link.getAttribute("title") || link.innerText || link.textContent),
        pageTitle
      ].map(normalizePromptText).filter(function usableTitle(value) {
        return Boolean(value && !/^chatgpt$/i.test(value));
      })[0] || ("Conversation " + id.slice(0, 8));
      var projectId = exportProjectIdFromPath();
      return {
        conversation: {
          id: id,
          title: title.slice(0, 200),
          createTime: "",
          updateTime: "",
          archived: false,
          current: true,
          projectId: projectId,
          projectName: "",
          groupType: projectId ? "project" : "",
          source: "current-dom"
        },
        currentConversationId: id,
        complete: true,
        source: "current-dom"
      };
    }

    function currentConversationForExportWithProjectDirectory() {
      var result = currentConversationForExport();
      var conversation = result && result.conversation;
      if (
        !conversation ||
        !conversation.projectId ||
        !chrome.runtime ||
        typeof chrome.runtime.sendMessage !== "function"
      ) {
        return Promise.resolve(result);
      }
      return new Promise(function readRenderedProjectDirectory(resolve) {
        try {
          chrome.runtime.sendMessage(
            { type: "conversation.projectDirectories.get" },
            function projectDirectoriesReceived(response) {
              if (chrome.runtime && chrome.runtime.lastError) {
                resolve(result);
                return;
              }
              var entries = response && response.ok && Array.isArray(response.entries)
                ? response.entries
                : [];
              var match = entries.filter(function sameProject(entry) {
                return String(entry && entry.gizmoId || "").toLowerCase() ===
                  String(conversation.projectId || "").toLowerCase();
              })[0];
              if (match && match.projectName) {
                conversation.projectName = String(match.projectName).slice(0, 200);
                conversation.projectNameSource = "main-world-react";
                conversation.projectOrder = Number(match.projectOrder) || 0;
                var projectPrefix = conversation.projectName + " - ";
                if (String(conversation.title || "").indexOf(projectPrefix) === 0) {
                  conversation.title = String(conversation.title).slice(projectPrefix.length).trim();
                }
                if (conversation.title === conversation.projectName) {
                  conversation.title = "Conversation " + String(conversation.id || "").slice(0, 8);
                }
              }
              resolve(result);
            }
          );
        } catch (_) {
          resolve(result);
        }
      });
    }

    function currentConversationContentForExport() {
      var exporter = window.ChatGPTUsageExporter;
      var conversation = exporter && typeof exporter.collectConversationFromDom === "function"
        ? exporter.collectConversationFromDom(document)
        : null;
      var id = exportConversationIdFromPath();
      if (!conversation || !conversation.id || !conversation.messages || !conversation.messages.length) {
        return {
          conversations: [],
          failures: [{ id: id, error: "current-conversation-dom-unavailable" }],
          warnings: [],
          requestedCount: id ? 1 : 0,
          complete: false,
          source: "current-dom"
        };
      }
      return {
        conversations: [conversation],
        failures: [],
        warnings: [],
        requestedCount: 1,
        complete: true,
        source: "current-dom"
      };
    }

    window.__chatgptUsageCurrentConversation = currentConversationForExportWithProjectDirectory;
    window.__chatgptUsageCollectCurrentConversation = currentConversationContentForExport;

    chrome.runtime.onMessage.addListener(function handleConversationMessage(message, sender, sendResponse) {
      if (!message) {
        return undefined;
      }
      if (message.type === "usage.catalog.ensure") {
        ensureRuntimeModelCatalog("popup-usage", nextUnknownRuntimeModelSlug())
          .then(function catalogEnsured(catalog) {
            sendResponse({
              ok: Boolean(catalog),
              catalogObservedAt: String(catalog && catalog.observedAt || "")
            });
          }, function catalogEnsureFailed(error) {
            sendResponse({
              ok: false,
              error: String((error && error.message) || error || "model-catalog-unavailable")
            });
          });
        return true;
      }
      if (message.type === "conversation.current") {
        currentConversationForExportWithProjectDirectory().then(function currentConversationReady(result) {
          sendResponse(Object.assign({ ok: true }, result || {}));
        });
        return true;
      }
      if (message.type === "conversation.current.content") {
        sendResponse(Object.assign({ ok: true }, currentConversationContentForExport()));
        return false;
      }
      return undefined;
    });
  }
})();
