(function initBackground(root) {
  "use strict";

  if (!root.ChatGPTUsageDates && typeof importScripts === "function") {
    try { importScripts("date-utils.js"); } catch (_) { importScripts("src/date-utils.js"); }
  }
  var usageDates = root.ChatGPTUsageDates || (typeof require === "function" ? require("./date-utils") : null);
  if (!usageDates) throw new Error("date-utils-unavailable");

  if (!root.ChatGPTModelCatalog && typeof importScripts === "function") {
    try {
      importScripts("model-catalog.js");
    } catch (firstError) {
      try {
        importScripts("src/model-catalog.js");
      } catch (_) {
        // Service worker tests run without importScripts; direct payload metadata still works.
      }
    }
  }

  var modelCatalog = root.ChatGPTModelCatalog;
  if (!modelCatalog && typeof require === "function") {
    try {
      modelCatalog = require("./model-catalog");
    } catch (_) {
      modelCatalog = null;
    }
  }

  var STORAGE_KEY = "chatgptModelUsageStats.v1";
  var SETTINGS_KEY = "chatgptModelUsageSettings.v1";
  var STATUS_KEY = "chatgptModelUsageOpenAIStatus.v1";
  var IMPORTED_CONVERSATION_INDEX_KEY = "chatgptImportedConversations.index.v1";
  var IMPORTED_CONVERSATION_STAGING_KEY = "chatgptImportedConversations.staging.v1";
  var IMPORTED_CONVERSATION_RECORD_PREFIX = "chatgptImportedConversations.record.v1.";
  var STATISTICS_BACKUP_FORMAT = "chatgpt-model-usage-counter.statistics";
  var STATISTICS_BACKUP_VERSION = 1;
  var STORAGE_SCHEMA_VERSION = 1;

  function unsupportedStoredSchema(value) {
    return Boolean(value && typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, "version") &&
      Number(value.version) !== STORAGE_SCHEMA_VERSION);
  }
  var CATALOG_SESSION_KEY = "chatgptModelUsageCatalog.session.v1";
  var CATALOG_BINDING_SALT_SESSION_KEY = "chatgptModelUsageCatalogBindingSalt.session.v1";
  var CATALOG_REFRESH_SESSION_KEY = "chatgptModelUsageCatalogRefresh.session.v1";
  var STATUS_ALARM_NAME = "chatgpt-model-usage-openai-status";
  var DATE_ROLLOVER_ALARM_NAME = "chatgpt-model-usage-date-rollover";
  var STATUS_ALARM_PERIOD_MINUTES = 5;
  var MAX_EVENTS = 500;
  var DOWNLOAD_FINAL_TIMEOUT_MS = 5 * 60 * 1000;
  var activeDownloadsByOperationId = {};
  var cancelledDownloadOperationIds = {};
  var CATALOG_REFRESH_CLAIM_TTL_MS = 5 * 60 * 1000;
  var catalogRefreshClaimQueue = Promise.resolve();
  var inMemoryCatalogRefreshClaims = {};
  var MAX_PARAMETER_KEYS = 48;
  var MAX_PARAMETER_ARRAY_ITEMS = 16;
  var MAX_PARAMETER_COMBINATIONS_PER_MODEL = 120;
  var MAX_PARAMETER_FIELD_VALUES = 120;
  var MAX_VARIANTS_PER_MODEL = 120;
  var NETWORK_OBSERVATION_WINDOW_MS = 60000;
  var NETWORK_MATCH_EARLY_MS = 750;
  var NETWORK_MATCH_LATE_MS = 15000;
  var NETWORK_MESSAGE_DOM_EARLY_MS = 15000;
  var RESPONSE_MATCH_WINDOW_MS = 60 * 60 * 1000;
  // Agent/research turns can emit several model-bearing requests before the
  // delayed content-script submission is flushed. Keep enough observations
  // to retain the original request while still bounding memory per tab.
  var MAX_NETWORK_OBSERVATIONS_PER_TAB = 64;
  var USAGE_DEDUPE_WINDOW_MS = 2500;
  var CHATGPT_URL_PATTERNS = ["https://chatgpt.com/*", "https://chat.openai.com/*"];
  var ISOLATED_CONTENT_SCRIPT_FILES = [
    "src/date-utils.js",
    "src/model-catalog.js",
    "src/detector.js",
    "src/exporter.js",
    "src/conversation-importer.js",
    "src/conversation-source.js",
    "src/dashboard.js",
    "src/content.js"
  ];
  var OPENAI_STATUS_SUMMARY_URL = "https://status.openai.com/api/v2/summary.json";
  var OPENAI_STATUS_COMPONENTS_URL = "https://status.openai.com/api/v2/components.json";
  var OPENAI_STATUS_PAGE_URL = "https://status.openai.com/";
  var recentNetworkObservationsByTab = {};
  var recentUsageSubmissions = [];
  var usageIncrementQueue = Promise.resolve();
  var activeRuntimeModelCatalog = null;
  var activeRuntimeModelCatalogAccountKey = "";
  var activeRuntimeModelCatalogContextKey = "";
  var inMemoryCatalogBindingSalt = "";
  var ACCOUNT_REQUEST_MAX_CONCURRENCY = 1;
  var ACCOUNT_REQUEST_MIN_GAP_MS = 1000;
  var ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS = 60 * 1000;
  var ACCOUNT_REQUEST_PERMIT_TTL_MS = 2 * 60 * 1000;
  var ACCOUNT_REQUEST_COORDINATOR_SCOPE = "chatgpt-account";
  var ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY = "chatgptModelUsageAccountRequestCoordinator.session.v1";
  var accountRequestCoordinatorStates = {};
  var accountRequestPermits = {};
  var accountRequestPermitSequence = 0;
  var accountRequestCoordinatorHydrationPromise = null;
  var NETWORK_MODEL_FIELD_RE = /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel)$/i;
  var NETWORK_SKIP_FIELD_RE = /^(message|messages|mapping|content|contents|parts|inputs?|instructions?|attachments?|files?|file_data|image_url|metadata|variables|conversation|conversation_id|parent_message_id|timezone|history_and_training_disabled|force_paragen|paragen|stream|stream_options|protocol|transport|connection|endpoint|path|url|headers|authorization|cookie|client_secret|access_token|session_id|request_id|event_id)$/i;
  var CONVERSATION_MODE_MODELS = {
    "research": { label: "Deep research", feature: "deep_research" },
    "agent-mode": { label: "Agent mode", feature: "agent_mode" }
  };

  function createEmptyStats() {
    return {
      version: 1,
      totals: {},
      byDate: {},
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      featuresByModel: {},
      parametersByModel: {},
      relationsByModel: {},
      analyticsByDate: {},
      analyticsHistoryComplete: true,
      events: [],
      eventHistoryComplete: true,
      responseMigrationIndex: {},
      responseMigrationIndexComplete: true,
      submissionDedupeIndex: {},
      lastUpdated: null
    };
  }

  function normalizeLanguage(value) {
    return value === "zh" || value === "ja" ? value : "en";
  }

  function sanitizeConversationId(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 128);
  }

  function sanitizeMessageId(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 160);
  }

  function createDefaultSettings() {
    return {
      version: 1,
      language: "en",
      startDate: "",
      endDate: "",
      activeView: "chart",
      statisticsMode: "mapped",
      chartType: "line",
      themeMode: "system",
      sourceModeFilter: "all",
      showLineChart: true,
      showDonutChart: false,
      showTrendChart: true,
      showTextStatistics: true,
      showPageButton: true,
      statisticsSectionOrder: ["line", "donut", "text"],
      mappedVisibleModels: [],
      mappedKnownModels: [],
      mappedModelSelectionInitialized: false,
      internalVisibleModels: [],
      internalKnownModels: [],
      internalModelSelectionInitialized: false
    };
  }

  function sanitizeStatisticsMode(value) {
    return value === "internal" ? "internal" : "mapped";
  }

  function sanitizeChartType(value) {
    return value === "donut" ? "donut" : "line";
  }

  function sanitizeThemeMode(value) {
    return value === "light" || value === "dark" ? value : "system";
  }

  function sanitizeActiveView(value) {
    return value === "status" || value === "export" ? value : "chart";
  }

  function sanitizeSourceModeFilter(value) {
    return value === "chat" || value === "work" ? value : "all";
  }

  function sanitizeStatisticsSectionOrder(value) {
    var allowed = ["line", "donut", "text"];
    var seen = {};
    var result = [];
    (Array.isArray(value) ? value : []).forEach(function keepSection(item) {
      var section = String(item || "").trim().toLowerCase();
      if (allowed.indexOf(section) !== -1 && !seen[section]) {
        seen[section] = true;
        result.push(section);
      }
    });
    allowed.forEach(function appendMissing(section) {
      if (!seen[section]) {
        result.push(section);
      }
    });
    return result;
  }

  function sanitizeDateSetting(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function dateSettingNoLaterThanToday(value, date) {
    var clean = sanitizeDateSetting(value);
    if (!clean) {
      return "";
    }
    var today = todayKey(date);
    return clean > today ? today : clean;
  }

  function sanitizeSettings(settings) {
    var base = settings && typeof settings === "object" ? settings : createDefaultSettings();
    if (unsupportedStoredSchema(base)) throw new Error("unsupported-settings-version");
    var legacyChartVisible = base.showTrendChart !== false;
    var showLineChart = typeof base.showLineChart === "boolean"
      ? base.showLineChart
      : legacyChartVisible && sanitizeChartType(base.chartType) === "line";
    var showDonutChart = typeof base.showDonutChart === "boolean"
      ? base.showDonutChart
      : legacyChartVisible && sanitizeChartType(base.chartType) === "donut";
    return {
      version: 1,
      language: normalizeLanguage(base.language),
      startDate: dateSettingNoLaterThanToday(base.startDate),
      endDate: dateSettingNoLaterThanToday(base.endDate),
      ...([1, 7, 31].indexOf(Number(base.rollingDays)) !== -1 ? { rollingDays: Number(base.rollingDays) } : {}),
      ...(["today", "last7", "last31", "throughToday", "custom"].indexOf(base.dateRangeMode) !== -1 ? { dateRangeMode: base.dateRangeMode } : {}),
      activeView: sanitizeActiveView(base.activeView),
      statisticsMode: sanitizeStatisticsMode(base.statisticsMode),
      chartType: sanitizeChartType(base.chartType),
      themeMode: sanitizeThemeMode(base.themeMode),
      sourceModeFilter: sanitizeSourceModeFilter(base.sourceModeFilter),
      showLineChart: showLineChart,
      showDonutChart: showDonutChart,
      showTrendChart: showLineChart || showDonutChart,
      showTextStatistics: base.showTextStatistics !== false,
      showPageButton: base.showPageButton !== false,
      statisticsSectionOrder: sanitizeStatisticsSectionOrder(base.statisticsSectionOrder),
      mappedVisibleModels: sanitizeSettingsModelList(base.mappedVisibleModels),
      mappedKnownModels: sanitizeSettingsModelList(base.mappedKnownModels),
      mappedModelSelectionInitialized: base.mappedModelSelectionInitialized === true,
      internalVisibleModels: sanitizeSettingsModelList(base.internalVisibleModels),
      internalKnownModels: sanitizeSettingsModelList(base.internalKnownModels),
      internalModelSelectionInitialized: base.internalModelSelectionInitialized === true
    };
  }

  function sanitizeSettingsModelList(value) {
    var seen = {};
    return (Array.isArray(value) ? value : []).reduce(function copyModels(models, item) {
      var model = String(item || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 96);
      if (model && !seen[model]) {
        seen[model] = true;
        models.push(model);
      }
      return models;
    }, []).slice(0, 400);
  }

  function mergeSettings(currentSettings, patch) {
    var current = sanitizeSettings(currentSettings);
    var changes = patch && typeof patch === "object" ? patch : {};
    var merged = Object.assign({}, current, changes);
    var hasOwn = Object.prototype.hasOwnProperty;
    if (
      hasOwn.call(changes, "showTrendChart") &&
      !hasOwn.call(changes, "showLineChart") &&
      !hasOwn.call(changes, "showDonutChart")
    ) {
      if (changes.showTrendChart === false) {
        merged.showLineChart = false;
        merged.showDonutChart = false;
      } else if (changes.showTrendChart === true && !current.showLineChart && !current.showDonutChart) {
        if (sanitizeChartType(merged.chartType) === "donut") {
          merged.showDonutChart = true;
        } else {
          merged.showLineChart = true;
        }
      }
    }
    return sanitizeSettings(merged);
  }

  function todayKey(date) {
    return usageDates.localDateKey(date);
  }

  function utcDateKey(date) {
    return usageDates.utcDateKey(date);
  }

  function validRecordedDateKey(value) {
    return usageDates.isDateKey(value);
  }

  function eventDateKey(event) {
    return usageDates.eventDateKey(event);
  }

  // A legacy event has no reliable time-zone marker. Its stored bucket can
  // nevertheless be established when every count for that exact model is in
  // one day and those buckets account for the model's whole total.
  function provenEventDateKey(stats, event) {
    var recorded = String(event && event.recordedDateKey || "");
    if (validRecordedDateKey(recorded)) return recorded;
    if (event && event.dateKeyBasis === "utc") {
      var submitted = new Date(String(event.submittedAt || ""));
      return Number.isNaN(submitted.getTime()) ? "" : utcDateKey(submitted);
    }
    var model = String(event && event.model || "");
    var byDate = stats && stats.byDate || {};
    var dates = Object.keys(byDate).filter(function hasModel(day) {
      return sanitizeCount(byDate[day] && byDate[day][model]) > 0;
    });
    if (dates.length !== 1 || !validRecordedDateKey(dates[0])) return "";
    return sanitizeCount(byDate[dates[0]][model]) === sanitizeCount(stats && stats.totals && stats.totals[model])
      ? dates[0] : "";
  }

  function hasStoredEventContribution(stats, event, dateKey) {
    var model = event && event.model;
    return Boolean(dateKey && model &&
      sanitizeCount(stats && stats.totals && stats.totals[model]) &&
      sanitizeCount(stats && stats.byDate && stats.byDate[dateKey] && stats.byDate[dateKey][model]));
  }

  function responseMigrationKey(event) {
    var submissionId = String((event && event.submissionId) || "").slice(0, 96);
    if (submissionId) {
      return "submission:" + submissionId;
    }
    var requestMessageId = sanitizeMessageId(event && event.requestMessageId);
    if (requestMessageId) {
      return "request:" + requestMessageId;
    }
    var responseMessageId = sanitizeMessageId(event && event.responseMessageId);
    return responseMessageId ? "response:" + responseMessageId : "";
  }

  function setSafeObjectEntry(target, key, value) {
    Object.defineProperty(target, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }

  function sanitizeResponseMigrationIndex(value, sourceModels) {
    var source = value && typeof value === "object" ? value : {};
    var clean = {};
    Object.keys(source).forEach(function copyMigrationRecord(storedKey) {
      var event = source[storedKey];
      if (!event || typeof event !== "object") {
        return;
      }
      var metadata = Object.assign(
        Object.create(null),
        sourceModels && sourceModels[event.model] || {},
        event
      );
      var canonicalModel = canonicalStoredModelName(event.model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, event.model)) {
        return;
      }
      var canonicalEvent = canonicalizeStoredEvent(event, canonicalModel, metadata);
      if (exactResponseModelFromMetadata(canonicalEvent)) {
        return;
      }
      var key = responseMigrationKey(canonicalEvent);
      if (key) {
        setSafeObjectEntry(clean, key, canonicalEvent);
      }
    });
    return clean;
  }

  function sanitizeSubmissionDedupeIndex(value) {
    var source = value && typeof value === "object" ? value : {};
    var clean = {};
    Object.keys(source).forEach(function copySubmissionId(id) {
      var submissionId = String(id || "").slice(0, 96);
      if (!submissionId) {
        return;
      }
      setSafeObjectEntry(
        clean,
        submissionId,
        String(source[id] || "").slice(0, 48)
      );
    });
    return clean;
  }

  function storeArchivedMigrationEvent(stats, event, previousKey) {
    stats.responseMigrationIndex = stats.responseMigrationIndex &&
      typeof stats.responseMigrationIndex === "object"
      ? stats.responseMigrationIndex
      : {};
    var key = responseMigrationKey(event);
    if (previousKey && previousKey !== key) {
      delete stats.responseMigrationIndex[previousKey];
    }
    if (exactResponseModelFromMetadata(event)) {
      if (key) {
        delete stats.responseMigrationIndex[key];
      }
      return "";
    }
    if (!key) {
      stats.responseMigrationIndexComplete = false;
      return "";
    }
    setSafeObjectEntry(stats.responseMigrationIndex, key, event);
    return key;
  }

  function cloneStats(stats) {
    var base = stats && typeof stats === "object" ? stats : createEmptyStats();
    if (unsupportedStoredSchema(base)) throw new Error("unsupported-statistics-version");
    var migratedCatalog = sanitizeRuntimeModelCatalog(base.runtimeModelCatalog);
    if (migratedCatalog) {
      activeRuntimeModelCatalog = migratedCatalog;
      activeRuntimeModelCatalogAccountKey = "";
      activeRuntimeModelCatalogContextKey = "";
    }
    var rebuiltFromEvents = rebuildStatsFromCompleteEventHistory(base);
    if (rebuiltFromEvents) {
      return rebuiltFromEvents;
    }
    var totals = {};
    var byDate = {};
    var models = {};
    var sessionsByModel = {};
    var variantsByModel = {};
    var featuresByModel = {};
    var parametersByModel = {};
    var relationsByModel = {};
    var analyticsByDate = {};
    var sourceTotals = base.totals || {};
    var sourceByDate = base.byDate || {};
    var sourceModels = base.models || {};
    var sourceSessionsByModel = base.sessionsByModel || {};
    var sourceVariantsByModel = base.variantsByModel || {};
    var sourceFeaturesByModel = base.featuresByModel || {};
    var sourceParametersByModel = base.parametersByModel || {};
    var sourceRelationsByModel = base.relationsByModel || {};
    var sourceAnalyticsByDate = base.analyticsByDate || {};
    var sourceResponseMigrationIndex = base.responseMigrationIndex || {};
    var sourceSubmissionDedupeIndex = base.submissionDedupeIndex || {};
    var incompleteHistory = base.eventHistoryComplete !== true ||
      !Array.isArray(base.events) || base.events.length !== totalCount(base);

    function aggregateModelName(model, metadata) {
      var canonical = canonicalStoredModelName(model, metadata);
      if (isStoredModelValid(canonical, metadata, model)) return canonical;
      return incompleteHistory ? sanitizeModelName(model) : "";
    }

    Object.keys(sourceTotals).forEach(function copyTotal(model) {
      var metadata = sourceModels[model];
      var canonicalModel = aggregateModelName(model, metadata);
      var count = sanitizeCount(sourceTotals[model]);
      if (count <= 0 || !canonicalModel) {
        return;
      }

      setSafeObjectEntry(totals, canonicalModel, (Number(totals[canonicalModel]) || 0) + count);
      setSafeObjectEntry(models, canonicalModel, mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata));
    });

    Object.keys(sourceByDate).forEach(function copyDate(dateKey) {
      var sourceDay = sourceByDate[dateKey] || {};
      var day = {};
      Object.keys(sourceDay).forEach(function copyDayModel(model) {
        var metadata = sourceModels[model];
        var canonicalModel = aggregateModelName(model, metadata);
        var count = sanitizeCount(sourceDay[model]);
        if (count <= 0 || !canonicalModel) {
          return;
        }

        setSafeObjectEntry(day, canonicalModel, (Number(day[canonicalModel]) || 0) + count);
        setSafeObjectEntry(models, canonicalModel, mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata));
      });
      if (Object.keys(day).length > 0) {
        setSafeObjectEntry(byDate, dateKey, day);
      }
    });

    Object.keys(sourceSessionsByModel).forEach(function copyModelSessions(model) {
      var sourceSessions = sourceSessionsByModel[model] || {};
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }
      models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);

      Object.keys(sourceSessions).forEach(function copySession(conversationId) {
        var cleanSession = sanitizeSession(sourceSessions[conversationId], conversationId);
        if (!cleanSession) {
          return;
        }

        cleanSession.models = canonicalizeSessionModelCounts(cleanSession.models, sourceModels);
        if (!cleanSession.models[canonicalModel]) {
          cleanSession.models[canonicalModel] = cleanSession.count;
        }

        if (!sessionsByModel[canonicalModel]) {
          sessionsByModel[canonicalModel] = {};
        }
        sessionsByModel[canonicalModel][conversationId] = mergeSessions(
          sessionsByModel[canonicalModel][conversationId],
          cleanSession
        );
      });
    });

    Object.keys(sourceParametersByModel).forEach(function copyModelParameterStats(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var exactRequestModel = exactRequestModelFromMetadata(metadata);
      var normalizationModel = sanitizeModelName(exactRequestModel) === canonicalModel
        ? exactRequestModel
        : "";
      var cleanStats = mergeParameterStats(
        parametersByModel[canonicalModel],
        sourceParametersByModel[model],
        normalizationModel
      );
      if (cleanStats.total > 0 || Object.keys(cleanStats.combinations).length > 0) {
        parametersByModel[canonicalModel] = cleanStats;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      }
    });

    Object.keys(sourceVariantsByModel).forEach(function copyModelVariantStats(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var cleanVariants = mergeVariantStats(variantsByModel[canonicalModel], sourceVariantsByModel[model]);
      if (cleanVariants.total > 0 || Object.keys(cleanVariants.variants).length > 0) {
        variantsByModel[canonicalModel] = cleanVariants;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      }
    });

    Object.keys(sourceFeaturesByModel).forEach(function copyModelFeatureStats(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var cleanFeatures = mergeFeatureStats(featuresByModel[canonicalModel], sourceFeaturesByModel[model]);
      if (cleanFeatures.total > 0 || Object.keys(cleanFeatures.features).length > 0) {
        featuresByModel[canonicalModel] = cleanFeatures;
        models[canonicalModel] = mergeStoredModelMetadata(models[canonicalModel], canonicalModel, metadata);
      }
    });

    Object.keys(sourceRelationsByModel).forEach(function copyModelRelations(model) {
      var metadata = sourceModels[model];
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }
      var cleanRelations = sanitizeModelRelationStats(sourceRelationsByModel[model]);
      if (Object.keys(cleanRelations).length) {
        relationsByModel[canonicalModel] = mergeModelRelationStats(
          relationsByModel[canonicalModel],
          cleanRelations
        );
      }
    });

    analyticsByDate = sanitizeAnalyticsByDate(sourceAnalyticsByDate, sourceModels);

    var cloned = {
      version: 1,
      totals: totals,
      byDate: byDate,
      models: models,
      sessionsByModel: sessionsByModel,
      variantsByModel: variantsByModel,
      featuresByModel: featuresByModel,
      parametersByModel: parametersByModel,
      relationsByModel: relationsByModel,
      analyticsByDate: analyticsByDate,
      analyticsHistoryComplete: base.analyticsHistoryComplete === true,
      events: Array.isArray(base.events)
        ? base.events.reduce(function copyEvents(events, event) {
            if (!event) {
              return events;
            }

            // Event-level evidence is stronger than the representative
            // aggregate metadata in stats.models. In particular, a final
            // response may differ from the request stored on the aggregate.
            // Imported JSON may contain special object keys. A null-prototype
            // merge prevents "__proto__" from changing the temporary metadata
            // object's prototype before the event is rebuilt from a whitelist.
            var metadata = Object.assign(Object.create(null), sourceModels[event.model] || {}, event);
            var canonicalModel = canonicalStoredModelName(event.model, metadata);
            if (!isStoredModelValid(canonicalModel, metadata, event.model)) {
              // Keep an unrecognized legacy identity rather than silently
              // dropping its retained event. Presentation can label the
              // aggregate as unrecognized without changing stored counts.
              canonicalModel = sanitizeModelName(event.model);
              if (!canonicalModel) return events;
            }

            var canonicalEvent = canonicalizeStoredEvent(event, canonicalModel, metadata);
            events.push(canonicalEvent);
            setSafeObjectEntry(models, canonicalEvent.model, mergeStoredModelMetadata(
              models[canonicalEvent.model],
              canonicalEvent.model,
              metadata
            ));
            return events;
          }, []).slice(0, MAX_EVENTS)
        : [],
      eventHistoryComplete: Boolean(
        base.eventHistoryComplete === true &&
        totalCount(base) <= MAX_EVENTS &&
        Array.isArray(base.events) &&
        base.events.length === totalCount(base)
      ),
      responseMigrationIndex: sanitizeResponseMigrationIndex(
        sourceResponseMigrationIndex,
        sourceModels
      ),
      responseMigrationIndexComplete: false,
      submissionDedupeIndex: sanitizeSubmissionDedupeIndex(
        sourceSubmissionDedupeIndex
      ),
      lastUpdated: base.lastUpdated || null
    };
    cloned.events.forEach(function retainSubmissionId(event) {
      var submissionId = String(event && event.submissionId || "").slice(0, 96);
      if (submissionId) {
        setSafeObjectEntry(
          cloned.submissionDedupeIndex,
          submissionId,
          String(event.submittedAt || "").slice(0, 48)
        );
      }
    });
    Object.keys(cloned.responseMigrationIndex).forEach(function retainArchivedSubmissionId(key) {
      var event = cloned.responseMigrationIndex[key];
      var submissionId = String(event && event.submissionId || "").slice(0, 96);
      if (submissionId) {
        setSafeObjectEntry(
          cloned.submissionDedupeIndex,
          submissionId,
          String(event.submittedAt || "").slice(0, 48)
        );
      }
    });
    cloned.events.forEach(function removeRetainedMigrationDuplicate(event) {
      var key = responseMigrationKey(event);
      if (key) {
        delete cloned.responseMigrationIndex[key];
      }
    });
    var hasStoredResponseMigrationIndex = Object.prototype.hasOwnProperty.call(
      base,
      "responseMigrationIndex"
    );
    cloned.responseMigrationIndexComplete = Boolean(
      hasStoredResponseMigrationIndex
        ? base.responseMigrationIndexComplete === true
        : cloned.eventHistoryComplete
    );
    var hasStoredAnalytics = Object.prototype.hasOwnProperty.call(base, "analyticsByDate");
    if (!hasStoredAnalytics) {
      cloned.analyticsByDate = {};
      cloned.events.slice(0).reverse().forEach(function replayRetainedEvent(event) {
        updateAnalyticsContribution(cloned, event.model, event);
      });
      cloned.analyticsHistoryComplete = Boolean(
        cloned.eventHistoryComplete &&
        cloned.events.length === totalCount(cloned) &&
        cloned.events.every(function hasProvenDay(event) { return Boolean(eventDateKey(event)); })
      );
    }
    if (
      cloned.analyticsHistoryComplete &&
      analyticsTotalCount(cloned.analyticsByDate) !== totalCount(cloned)
    ) {
      cloned.analyticsHistoryComplete = false;
    }
    if (cloned.events.some(function unknownEventDay(event) { return !eventDateKey(event); })) {
      cloned.analyticsHistoryComplete = false;
      cloned.analyticsDateBasisUncertain = true;
    }
    if (base.analyticsDateBasisUncertain === true) cloned.analyticsDateBasisUncertain = true;
    if (totalCount(cloned) > MAX_EVENTS || cloned.events.length !== totalCount(cloned)) {
      cloned.eventHistoryComplete = false;
    }
    // Partial event histories cannot prove how many aggregate feature counts
    // came from a particular event. Keep the stored aggregate unchanged;
    // subtracting retained events on every read is neither safe nor idempotent.
    return cloned;
  }

  function statisticsBackupSummary(stats) {
    var clean = stats && typeof stats === "object" ? stats : createEmptyStats();
    return {
      totalCount: totalCount(clean),
      modelCount: Object.keys(clean.totals || {}).length,
      dateCount: Object.keys(clean.byDate || {}).length,
      retainedEventCount: Array.isArray(clean.events) ? clean.events.length : 0,
      eventHistoryComplete: clean.eventHistoryComplete === true,
      analyticsHistoryComplete: clean.analyticsHistoryComplete === true
    };
  }

  function installedExtensionVersion() {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        typeof chrome.runtime.getManifest === "function"
      ) {
        return String((chrome.runtime.getManifest() || {}).version || "").slice(0, 32);
      }
    } catch (_) {}
    return "";
  }

  function statisticsWithoutCatalogBindings(stats) {
    var source = stats && typeof stats === "object" ? stats : {};
    var clean = {};
    Object.keys(source).forEach(function copyTopLevel(key) {
      setSafeObjectEntry(clean, key, source[key]);
    });
    delete clean.runtimeModelCatalog;
    delete clean.runtimeModelCatalogAccountKey;
    delete clean.runtimeModelCatalogContextKey;

    function stripRecord(record) {
      var value = record && typeof record === "object" ? record : {};
      var copy = {};
      Object.keys(value).forEach(function copyField(key) {
        setSafeObjectEntry(copy, key, value[key]);
      });
      delete copy.catalogAccountKey;
      delete copy.catalogContextKey;
      delete copy.runtimeModelCatalog;
      delete copy.runtimeModelCatalogAccountKey;
      delete copy.runtimeModelCatalogContextKey;
      return copy;
    }

    clean.events = Array.isArray(source.events)
      ? source.events.map(stripRecord)
      : [];
    clean.models = {};
    Object.keys(source.models || {}).forEach(function stripModel(model) {
      setSafeObjectEntry(clean.models, model, stripRecord(source.models[model]));
    });
    clean.responseMigrationIndex = {};
    Object.keys(source.responseMigrationIndex || {}).forEach(function stripMigration(key) {
      setSafeObjectEntry(
        clean.responseMigrationIndex,
        key,
        stripRecord(source.responseMigrationIndex[key])
      );
    });
    return clean;
  }

  function createStatisticsBackup(stats, options) {
    var settings = options && typeof options === "object" ? options : {};
    var cleanStats = statisticsWithoutCatalogBindings(cloneStats(stats));
    return {
      format: STATISTICS_BACKUP_FORMAT,
      formatVersion: STATISTICS_BACKUP_VERSION,
      exportedAt: String(settings.exportedAt || new Date().toISOString()).slice(0, 48),
      extensionVersion: String(settings.extensionVersion || installedExtensionVersion()).slice(0, 32),
      summary: statisticsBackupSummary(cleanStats),
      statistics: cleanStats
    };
  }

  function sanitizeStatisticsBackup(backup) {
    var source = backup && typeof backup === "object" && !Array.isArray(backup)
      ? backup
      : null;
    if (!source) {
      throw new Error("invalid-statistics-backup");
    }
    if (String(source.format || "") !== STATISTICS_BACKUP_FORMAT) {
      throw new Error("unsupported-statistics-backup-format");
    }
    if (Number(source.formatVersion) !== STATISTICS_BACKUP_VERSION) {
      throw new Error("unsupported-statistics-backup-version");
    }
    if (
      !source.statistics ||
      typeof source.statistics !== "object" ||
      Array.isArray(source.statistics) ||
      Number(source.statistics.version) !== 1
    ) {
      throw new Error("invalid-statistics-backup-data");
    }
    var cleanStats = statisticsWithoutCatalogBindings(
      cloneStats(statisticsWithoutCatalogBindings(source.statistics))
    );
    return {
      format: STATISTICS_BACKUP_FORMAT,
      formatVersion: STATISTICS_BACKUP_VERSION,
      exportedAt: String(source.exportedAt || "").slice(0, 48),
      extensionVersion: String(source.extensionVersion || "").slice(0, 32),
      summary: statisticsBackupSummary(cleanStats),
      statistics: cleanStats
    };
  }

  function sanitizeModelName(model) {
    var clean = String(model || "").replace(/\s+/g, " ").trim();
    return clean.slice(0, 64);
  }

  function sanitizeRuntimeModelCatalog(catalog) {
    if (!modelCatalog || typeof modelCatalog.sanitizeRuntimeModelCatalog !== "function") {
      return null;
    }
    return modelCatalog.sanitizeRuntimeModelCatalog(catalog);
  }

  function sanitizeCatalogAccountKey(value) {
    var clean = String(value || "").trim().toLowerCase();
    return /^acct-[0-9a-f]{16}$/.test(clean) ? clean : "";
  }

  function sanitizeCatalogContextKey(value) {
    var clean = String(value || "").trim().toLowerCase();
    return /^ctx-[0-9a-f]{16}$/.test(clean) ? clean : "";
  }

  function storedCatalogAccountKey(metadata) {
    return sanitizeCatalogAccountKey(metadata && metadata.catalogAccountKey);
  }

  function storedCatalogContextKey(metadata) {
    return sanitizeCatalogContextKey(metadata && metadata.catalogContextKey);
  }

  function activeCatalogAllowedForMetadata(metadata) {
    if (!activeRuntimeModelCatalog || !activeRuntimeModelCatalogAccountKey) {
      return false;
    }
    var accountKey = storedCatalogAccountKey(metadata);
    if (accountKey) {
      return accountKey === activeRuntimeModelCatalogAccountKey;
    }
    var contextKey = storedCatalogContextKey(metadata);
    return Boolean(
      contextKey &&
      activeRuntimeModelCatalogContextKey &&
      contextKey === activeRuntimeModelCatalogContextKey
    );
  }

  function boundRuntimeCatalog(metadata, catalogOverride, hasCatalogOverride) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    if (hasCatalogOverride) {
      var explicitCatalog = sanitizeRuntimeModelCatalog(catalogOverride);
      var explicitAccountKey = sanitizeCatalogAccountKey(
        source.runtimeModelCatalogAccountKey
      );
      return explicitCatalog && explicitAccountKey ? explicitCatalog : null;
    }
    if (Object.prototype.hasOwnProperty.call(source, "runtimeModelCatalog")) {
      var payloadCatalog = sanitizeRuntimeModelCatalog(source.runtimeModelCatalog);
      var payloadAccountKey = sanitizeCatalogAccountKey(
        source.runtimeModelCatalogAccountKey
      );
      return payloadCatalog && payloadAccountKey ? payloadCatalog : null;
    }
    return activeCatalogAllowedForMetadata(source)
      ? activeRuntimeModelCatalog
      : null;
  }

  function sanitizePublicModelName(model) {
    if (modelCatalog && typeof modelCatalog.sanitizePublicModelLabel === "function") {
      return modelCatalog.sanitizePublicModelLabel(model);
    }
    return sanitizeModelName(model);
  }

  function resolveRuntimePublicModel(requestModel, metadata, catalogOverride) {
    if (!modelCatalog || typeof modelCatalog.resolveRuntimePublicModelInfo !== "function") {
      return null;
    }
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var catalog = boundRuntimeCatalog(
      source,
      catalogOverride,
      arguments.length >= 3
    );
    if (!catalog) {
      return null;
    }
    return modelCatalog.resolveRuntimePublicModelInfo(catalog, requestModel, {
      selectedPublicModel: source.selectedPublicModel,
      selectedPublicMode: source.selectedPublicMode,
      selectedPublicModeLabel: source.selectedPublicModeLabel,
      selectedPublicModeSource: source.selectedPublicModeSource,
      selectedText: source.selectedModelText,
      parameters: modelParametersFromMetadata(source)
    });
  }

  function samePublicModelLabel(left, right) {
    return String(left || "").toLowerCase().replace(/\s+/g, " ").trim() ===
      String(right || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function runtimeCatalogHasPublicLabel(catalog, label) {
    var clean = sanitizePublicModelName(label);
    if (!catalog || !clean) {
      return false;
    }
    var labels = [];
    (catalog.models || []).forEach(function modelLabel(model) {
      labels.push(model && model.title);
    });
    (catalog.versions || []).forEach(function versionLabel(version) {
      labels.push(
        version && version.displayTextForIntelligence,
        version && version.shortDisplayTextForIntelligence
      );
    });
    return labels.some(function matches(candidate) {
      return candidate && samePublicModelLabel(candidate, clean);
    });
  }

  function plausibleSelectedPublicModel(label, source, catalog) {
    var clean = sanitizePublicModelName(label);
    if (!clean) {
      return false;
    }
    if (runtimeCatalogHasPublicLabel(catalog, clean)) {
      return true;
    }
    if (/^work-selector-dom$/i.test(String(source || ""))) {
      return /^\d+(?:\.\d+)+(?:\s+\S+){1,3}$/.test(clean);
    }
    return /^(?:(?:GPT|ChatGPT)[-\s]?(?:\d+(?:\.\d+)*|4o)(?:$|[-\s])|o\d+(?:$|[-\s])|Auto$|Deep research$|Agent mode$)/i.test(clean);
  }

  function resolveSelectedPublicModelMetadata(requestModel, metadata, catalogOverride) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var selected = sanitizePublicModelName(source.selectedPublicModel);
    var selectedSource = String(source.selectedPublicModelSource || (selected ? "selector-dom" : "")).slice(0, 80);
    var selectedMode = sanitizePublicMode(source.selectedPublicMode);
    var selectedModeLabel = sanitizePublicModeLabel(
      source.selectedPublicModeLabel,
      selectedMode
    );
    var selectedModeSource = String(
      source.selectedPublicModeSource || (selectedMode ? "selector-dom" : "")
    ).slice(0, 80);
    var hasCatalogOverride = arguments.length >= 3;
    var catalog = boundRuntimeCatalog(
      source,
      catalogOverride,
      hasCatalogOverride
    );
    if (!plausibleSelectedPublicModel(selected, selectedSource, catalog)) {
      selected = "";
      selectedSource = "";
    }
    var requestSlug = sanitizeChatGPTModel(requestModel);
    var runtimeMetadata = Object.assign({}, source, {
      selectedPublicModel: selected,
      selectedPublicMode: selectedMode,
      selectedPublicModeLabel: selectedModeLabel,
      selectedPublicModeSource: selectedModeSource
    });
    var resolved = isChatGPTRequestRoute(requestSlug)
      ? (
          hasCatalogOverride
            ? resolveRuntimePublicModel(requestSlug, runtimeMetadata, catalog)
            : resolveRuntimePublicModel(requestSlug, runtimeMetadata)
        )
      : null;

    // A model-only selector observed at submit time is the direct record of
    // what the user selected. The request route and account catalog fill only
    // missing public model/mode fields and never rewrite an explicit choice.
    if (!selected && resolved && resolved.mappingStatus === "mapped") {
      selected = sanitizePublicModelName(resolved.publicModel);
      selectedSource = selected ? "request+account-catalog" : "";
    }
    if (!selectedMode && resolved && resolved.selectedPublicMode) {
      selectedMode = sanitizePublicMode(resolved.selectedPublicMode);
      selectedModeLabel = sanitizePublicModeLabel(
        resolved.selectedPublicModeLabel,
        selectedMode
      );
      selectedModeSource = String(
        resolved.selectedPublicModeSource || "request+account-catalog"
      ).slice(0, 80);
    }

    return {
      selectedPublicModel: selected,
      selectedPublicModelSource: selectedSource,
      selectedPublicMode: selectedMode,
      selectedPublicModeLabel: selectedModeLabel,
      selectedPublicModeSource: selectedModeSource
    };
  }

  function directSameRoutePublicModel(requestModel, responseModel, metadata, selectedMetadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var selected = selectedMetadata || resolveSelectedPublicModelMetadata(requestModel, source);
    var requestSlug = sanitizeChatGPTModel(requestModel);
    var responseSlug = sanitizeChatGPTModel(responseModel);
    var sourceMode = normalizeSourceMode(source.sourceMode);
    var selectedSource = String(selected.selectedPublicModelSource || "");
    var directSelector =
      (sourceMode === "chat" && /^selector-dom$/i.test(selectedSource)) ||
      (sourceMode === "work" && /^work-selector-dom$/i.test(selectedSource));
    if (
      !directSelector ||
      !selected.selectedPublicModel ||
      !isChatGPTRequestRoute(requestSlug) ||
      (responseSlug && responseSlug !== requestSlug)
    ) {
      return "";
    }
    return sanitizePublicModelName(selected.selectedPublicModel);
  }

  function sanitizeTitle(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function normalizeSourceMode(value) {
    var clean = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (clean === "chat" || clean === "work") {
      return clean;
    }
    return "unknown";
  }

  function requestReasoningEffortFromParameters(parameters) {
    parameters = parameters && typeof parameters === "object" ? parameters : {};
    var value = parameters["reasoning.effort"] || parameters.reasoning_effort;
    if (!value && parameters.reasoning && typeof parameters.reasoning === "object") {
      value = parameters.reasoning.effort;
    }
    var clean = String(value || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 32);
    return clean || null;
  }

  function reasoningEffortFromEvent(event) {
    var direct = String(event && event.requestReasoningEffort || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 32);
    var parameters = event && event.modelParameters && typeof event.modelParameters === "object"
      ? event.modelParameters
      : {};
    return direct || requestReasoningEffortFromParameters(parameters) || "unspecified";
  }

  function relationKey(requestModel, responseModel) {
    return String(requestModel || "") + "\u0001" + String(responseModel || "");
  }

  function sanitizeRelationConversation(value, conversationId) {
    var source = value && typeof value === "object" ? value : {};
    var id = String(conversationId || source.conversationId || "").trim().slice(0, 128);
    if (!id) {
      return null;
    }
    var pending = /^pending:/.test(id);
    var efforts = {};
    Object.keys(source.efforts || {}).slice(0, 40).forEach(function copyEffort(effort) {
      var effortKey = String(effort || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 32) || "unspecified";
      var effortCount = sanitizeCount(source.efforts[effort]);
      if (effortCount > 0) {
        efforts[effortKey] = (efforts[effortKey] || 0) + effortCount;
      }
    });
    var sourceModes = {};
    Object.keys(source.sourceModes || {}).slice(0, 4).forEach(function copySourceMode(mode) {
      var sourceMode = normalizeSourceMode(mode);
      var sourceModeCount = sanitizeCount(source.sourceModes[mode]);
      if (sourceModeCount > 0) {
        sourceModes[sourceMode] = (sourceModes[sourceMode] || 0) + sourceModeCount;
      }
    });
    if (!Object.keys(sourceModes).length && sanitizeCount(source.count) > 0) {
      sourceModes[normalizeSourceMode(source.sourceMode)] = sanitizeCount(source.count);
    }
    return {
      conversationId: id,
      title: pending ? sanitizeTitle(source.title || source.pageTitle) : sanitizeTitle(source.title || source.pageTitle || id),
      count: sanitizeCount(source.count),
      firstSubmittedAt: String(source.firstSubmittedAt || "").slice(0, 48),
      lastSubmittedAt: String(source.lastSubmittedAt || "").slice(0, 48),
      lastPageUrl: pending ? "" : String(source.lastPageUrl || source.pageUrl || "").slice(0, 500),
      sourceMode: normalizeSourceMode(source.sourceMode),
      sourceModes: sourceModes,
      efforts: efforts
    };
  }

  function sanitizeModelRelationStats(value) {
    var source = value && typeof value === "object" ? value : {};
    var clean = {};
    Object.keys(source).forEach(function copyRelation(key) {
      var relation = source[key] && typeof source[key] === "object" ? source[key] : {};
      var requestModel = sanitizeChatGPTModel(relation.requestModel);
      var responseModel = sanitizeChatGPTModel(relation.responseModel);
      if (
        (requestModel && !isChatGPTRequestRoute(requestModel)) ||
        (responseModel && !isActualRequestModel(responseModel)) ||
        (!requestModel && !responseModel)
      ) {
        return;
      }
      var count = sanitizeCount(relation.count);
      if (count <= 0) {
        return;
      }
      var efforts = {};
      Object.keys(relation.efforts || {}).slice(0, 40).forEach(function copyEffort(effort) {
        var effortKey = String(effort || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 32) || "unspecified";
        var effortCount = sanitizeCount(relation.efforts[effort]);
        if (effortCount > 0) {
          efforts[effortKey] = (efforts[effortKey] || 0) + effortCount;
        }
      });
      var features = {};
      Object.keys(relation.features || {}).slice(0, 40).forEach(function copyFeature(feature) {
        var featureId = sanitizeUsageFeatureId(feature);
        var featureCount = sanitizeCount(relation.features[feature]);
        if (featureId && featureCount > 0) {
          features[featureId] = (features[featureId] || 0) + featureCount;
        }
      });
      var sourceModes = {};
      Object.keys(relation.sourceModes || {}).slice(0, 4).forEach(function copySourceMode(mode) {
        var sourceMode = normalizeSourceMode(mode);
        var sourceModeCount = sanitizeCount(relation.sourceModes[mode]);
        if (sourceModeCount > 0) {
          sourceModes[sourceMode] = (sourceModes[sourceMode] || 0) + sourceModeCount;
        }
      });
      var conversations = {};
      Object.keys(relation.conversations || {}).forEach(function copyConversation(id) {
        var conversation = sanitizeRelationConversation(relation.conversations[id], id);
        if (conversation && conversation.count > 0) {
          conversations[conversation.conversationId] = conversation;
        }
      });
      clean[relationKey(requestModel, responseModel)] = {
        requestModel: requestModel,
        responseModel: responseModel,
        count: count,
        efforts: efforts,
        features: features,
        sourceModes: sourceModes,
        conversations: conversations,
        firstSubmittedAt: String(relation.firstSubmittedAt || "").slice(0, 48),
        lastSubmittedAt: String(relation.lastSubmittedAt || "").slice(0, 48)
      };
    });
    return clean;
  }

  function mergeModelRelationStats(left, right) {
    var merged = sanitizeModelRelationStats(left);
    var source = sanitizeModelRelationStats(right);
    Object.keys(source).forEach(function mergeRelation(key) {
      var incoming = source[key];
      var existing = merged[key];
      if (!existing) {
        merged[key] = incoming;
        return;
      }
      existing.count += incoming.count;
      Object.keys(incoming.efforts).forEach(function addEffort(effort) {
        existing.efforts[effort] = (existing.efforts[effort] || 0) + incoming.efforts[effort];
      });
      Object.keys(incoming.features).forEach(function addFeature(feature) {
        existing.features[feature] = (existing.features[feature] || 0) + incoming.features[feature];
      });
      Object.keys(incoming.sourceModes).forEach(function addSourceMode(sourceMode) {
        existing.sourceModes[sourceMode] = (existing.sourceModes[sourceMode] || 0) + incoming.sourceModes[sourceMode];
      });
      Object.keys(incoming.conversations).forEach(function addConversation(id) {
        var next = incoming.conversations[id];
        var current = existing.conversations[id];
        if (!current) {
          existing.conversations[id] = next;
          return;
        }
        current.count += next.count;
        Object.keys(next.efforts || {}).forEach(function addConversationEffort(effort) {
          current.efforts[effort] = (current.efforts[effort] || 0) + next.efforts[effort];
        });
        Object.keys(next.sourceModes || {}).forEach(function addConversationSourceMode(sourceMode) {
          current.sourceModes[sourceMode] = (current.sourceModes[sourceMode] || 0) + next.sourceModes[sourceMode];
        });
        current.firstSubmittedAt = mergeTimestamp(current.firstSubmittedAt, next.firstSubmittedAt, true);
        if (String(next.lastSubmittedAt || "") >= String(current.lastSubmittedAt || "")) {
          current.lastSubmittedAt = next.lastSubmittedAt;
          current.lastPageUrl = next.lastPageUrl || current.lastPageUrl;
          current.title = next.title || current.title;
          current.sourceMode = next.sourceMode || current.sourceMode;
        }
      });
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, incoming.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, incoming.lastSubmittedAt, false);
    });
    return merged;
  }

  function sanitizeAnalyticsByDate(value, sourceModels) {
    var source = value && typeof value === "object" ? value : {};
    var clean = {};
    Object.keys(source).sort().forEach(function copyDate(dateKey) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        return;
      }
      var sourceDay = source[dateKey] && typeof source[dateKey] === "object"
        ? source[dateKey]
        : {};
      var day = {};
      ["chat", "work", "unknown"].forEach(function copySourceMode(sourceMode) {
        var sourceModelsForMode = sourceDay[sourceMode] && typeof sourceDay[sourceMode] === "object"
          ? sourceDay[sourceMode]
          : {};
        var modelsForMode = {};
        Object.keys(sourceModelsForMode).forEach(function copyModel(rawModel) {
          var metadata = sourceModels && sourceModels[rawModel];
          var model = canonicalStoredModelName(rawModel, metadata);
          if (!isStoredModelValid(model, metadata, rawModel)) {
            return;
          }
          var relations = sanitizeModelRelationStats(sourceModelsForMode[rawModel]);
          if (!Object.keys(relations).length) {
            return;
          }
          modelsForMode[model] = mergeModelRelationStats(modelsForMode[model], relations);
        });
        if (Object.keys(modelsForMode).length) {
          day[sourceMode] = modelsForMode;
        }
      });
      if (Object.keys(day).length) {
        clean[dateKey] = day;
      }
    });
    return clean;
  }

  function analyticsTotalCount(value) {
    var total = 0;
    Object.keys(value || {}).forEach(function countDate(dateKey) {
      var day = value[dateKey] || {};
      Object.keys(day).forEach(function countSource(sourceMode) {
        var models = day[sourceMode] || {};
        Object.keys(models).forEach(function countModel(model) {
          var relations = sanitizeModelRelationStats(models[model]);
          Object.keys(relations).forEach(function countRelation(key) {
            total += sanitizeCount(relations[key] && relations[key].count);
          });
        });
      });
    });
    return total;
  }

  function analyticsDateKey(event) {
    return eventDateKey(event);
  }

  function updateAnalyticsContribution(stats, model, event) {
    if (!stats || !model || !event) {
      return;
    }
    stats.analyticsByDate = stats.analyticsByDate && typeof stats.analyticsByDate === "object"
      ? stats.analyticsByDate
      : {};
    var dateKey = analyticsDateKey(event);
    if (!dateKey) {
      stats.analyticsHistoryComplete = false;
      return;
    }
    var sourceMode = normalizeSourceMode(event.sourceMode);
    var day = stats.analyticsByDate[dateKey] && typeof stats.analyticsByDate[dateKey] === "object"
      ? stats.analyticsByDate[dateKey]
      : {};
    var source = day[sourceMode] && typeof day[sourceMode] === "object"
      ? day[sourceMode]
      : {};
    var oneEventStats = { relationsByModel: {} };
    updateRelationStats(oneEventStats, model, event);
    source[model] = mergeModelRelationStats(
      source[model],
      oneEventStats.relationsByModel[model]
    );
    day[sourceMode] = source;
    stats.analyticsByDate[dateKey] = day;
  }

  function removeAnalyticsContribution(stats, model, event) {
    var dateKey = analyticsDateKey(event);
    if (!dateKey) return false;
    var sourceMode = normalizeSourceMode(event && event.sourceMode);
    var day = stats && stats.analyticsByDate && stats.analyticsByDate[dateKey];
    var source = day && day[sourceMode];
    if (!source || !source[model]) {
      return false;
    }
    var beforeRelations = sanitizeModelRelationStats(source[model]);
    var beforeCount = Object.keys(beforeRelations)
      .reduce(function sumRelations(total, key) {
        return total + sanitizeCount(beforeRelations[key] && beforeRelations[key].count);
      }, 0);
    var temporaryStats = {
      relationsByModel: {
        [model]: beforeRelations
      }
    };
    removeRelationContribution(temporaryStats, model, event);
    if (
      temporaryStats.relationsByModel &&
      temporaryStats.relationsByModel[model] &&
      Object.keys(temporaryStats.relationsByModel[model]).length
    ) {
      source[model] = temporaryStats.relationsByModel[model];
    } else {
      delete source[model];
    }
    if (!Object.keys(source).length) {
      delete day[sourceMode];
    }
    if (!Object.keys(day).length) {
      delete stats.analyticsByDate[dateKey];
    }
    var remainingRelations = source[model]
      ? sanitizeModelRelationStats(source[model])
      : {};
    var afterCount = Object.keys(remainingRelations).reduce(function sumRemaining(total, key) {
      return total + sanitizeCount(remainingRelations[key] && remainingRelations[key].count);
    }, 0);
    return beforeCount > 0 && afterCount === beforeCount - 1;
  }

  function updateRelationStats(stats, model, event) {
    var requestModel = exactRequestModelFromMetadata(event);
    var responseModel = exactResponseModelFromMetadata(event);
    if (!model || (!requestModel && !responseModel)) {
      return;
    }
    if (!stats.relationsByModel) {
      stats.relationsByModel = {};
    }
    var relations = sanitizeModelRelationStats(stats.relationsByModel[model]);
    var key = relationKey(requestModel, responseModel);
    var submittedAt = String((event && event.submittedAt) || new Date().toISOString()).slice(0, 48);
    var relation = relations[key] || {
      requestModel: requestModel,
      responseModel: responseModel,
      count: 0,
      efforts: {},
      features: {},
      sourceModes: {},
      conversations: {},
      firstSubmittedAt: submittedAt,
      lastSubmittedAt: ""
    };
    relation.count += 1;
    relation.firstSubmittedAt = relation.firstSubmittedAt || submittedAt;
    relation.lastSubmittedAt = submittedAt;
    var effort = reasoningEffortFromEvent(event);
    relation.efforts[effort] = (relation.efforts[effort] || 0) + 1;
    normalizeUsageFeaturesForPage(
      event && event.usageFeatures,
      event && event.modelParameters,
      model,
      event && event.pageUrl
    ).forEach(function addFeature(feature) {
      relation.features[feature] = (relation.features[feature] || 0) + 1;
    });
    var sourceMode = normalizeSourceMode(event && event.sourceMode);
    relation.sourceModes[sourceMode] = (relation.sourceModes[sourceMode] || 0) + 1;
    var actualConversationId = String(
      (event && event.conversationId) || extractConversationId(event && event.pageUrl)
    ).slice(0, 128);
    var pendingConversationId = !actualConversationId && event && event.submissionId
      ? "pending:" + String(event.submissionId).slice(0, 96)
      : "";
    var conversationId = actualConversationId || pendingConversationId;
    if (conversationId) {
      var conversation = relation.conversations[conversationId] || {
        conversationId: conversationId,
        title: actualConversationId
          ? (sanitizeTitle(event && event.pageTitle) || conversationId)
          : "",
        count: 0,
        firstSubmittedAt: submittedAt,
        lastSubmittedAt: "",
        lastPageUrl: String((event && event.pageUrl) || "").slice(0, 500),
        sourceMode: sourceMode,
        sourceModes: {},
        efforts: {}
      };
      conversation.count += 1;
      conversation.sourceModes = conversation.sourceModes && typeof conversation.sourceModes === "object"
        ? conversation.sourceModes
        : {};
      conversation.efforts = conversation.efforts && typeof conversation.efforts === "object"
        ? conversation.efforts
        : {};
      conversation.sourceModes[sourceMode] = (conversation.sourceModes[sourceMode] || 0) + 1;
      conversation.efforts[effort] = (conversation.efforts[effort] || 0) + 1;
      conversation.firstSubmittedAt = conversation.firstSubmittedAt || submittedAt;
      if (submittedAt >= String(conversation.lastSubmittedAt || "")) {
        conversation.lastSubmittedAt = submittedAt;
        conversation.lastPageUrl = actualConversationId
          ? String((event && event.pageUrl) || conversation.lastPageUrl || "").slice(0, 500)
          : "";
        conversation.title = actualConversationId
          ? (sanitizeTitle(event && event.pageTitle) || conversation.title)
          : "";
        conversation.sourceMode = sourceMode;
      }
      relation.conversations[conversationId] = conversation;
    }
    relations[key] = relation;
    stats.relationsByModel[model] = relations;
  }

  function removeRelationContribution(stats, model, event) {
    var relations = stats.relationsByModel && sanitizeModelRelationStats(stats.relationsByModel[model]);
    var requestModel = exactRequestModelFromMetadata(event);
    var responseModel = exactResponseModelFromMetadata(event);
    if (!relations || (!requestModel && !responseModel)) {
      return;
    }
    var key = relationKey(requestModel, responseModel);
    var relation = relations[key];
    if (!relation) {
      return;
    }
    relation.count = Math.max(0, relation.count - 1);
    decrementCountEntry(relation.efforts, reasoningEffortFromEvent(event), 1);
    normalizeUsageFeaturesForPage(
      event && event.usageFeatures,
      event && event.modelParameters,
      model,
      event && event.pageUrl
    ).forEach(function removeFeature(feature) {
      decrementCountEntry(relation.features, feature, 1);
    });
    decrementCountEntry(relation.sourceModes, normalizeSourceMode(event && event.sourceMode), 1);
    var actualConversationId = String(
      (event && event.conversationId) || extractConversationId(event && event.pageUrl)
    ).slice(0, 128);
    var conversationId = actualConversationId || (
      event && event.submissionId ? "pending:" + String(event.submissionId).slice(0, 96) : ""
    );
    if (conversationId && relation.conversations[conversationId]) {
      var conversation = relation.conversations[conversationId];
      conversation.count = Math.max(0, conversation.count - 1);
      decrementCountEntry(conversation.efforts, reasoningEffortFromEvent(event), 1);
      decrementCountEntry(conversation.sourceModes, normalizeSourceMode(event && event.sourceMode), 1);
      if (!conversation.count) {
        delete relation.conversations[conversationId];
      }
    }
    if (relation.count > 0) {
      relations[key] = relation;
    } else {
      delete relations[key];
    }
    if (Object.keys(relations).length) {
      stats.relationsByModel[model] = relations;
    } else {
      delete stats.relationsByModel[model];
    }
  }

  function extractConversationId(pageUrl) {
    var match = String(pageUrl || "").match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : "";
  }

  function isProjectConversationUrl(pageUrl) {
    return /\/g\/g-p-[^/?#]+(?:[/?#]|$)/i.test(String(pageUrl || ""));
  }

  function sanitizeSession(session, conversationId) {
    if (!conversationId || !session || typeof session !== "object") {
      return null;
    }

    return {
      conversationId: String(conversationId).slice(0, 128),
      title: sanitizeTitle(session.title),
      count: Number(session.count) || 0,
      models: Object.assign({}, session.models || {}),
      firstSubmittedAt: String(session.firstSubmittedAt || ""),
      lastSubmittedAt: String(session.lastSubmittedAt || ""),
      lastPageUrl: String(session.lastPageUrl || "").slice(0, 500)
    };
  }

  function isUnresolvedModelName(model) {
    var clean = String(model || "").replace(/\s+/g, " ").trim();
    var key = clean.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return !clean || /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key);
  }

  function normalizedStoredModelSlug(model) {
    return String(model || "")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/_/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .toLowerCase();
  }

  function isDeniedStoredModelName(model) {
    var clean = normalizedStoredModelSlug(model);
    var key = clean.replace(/[^a-z0-9]+/g, "");
    return !clean ||
      /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) ||
      /^(?:gpt)?lastusedmodel$/.test(key);
  }

  function hasDeniedStoredModelName(model) {
    return Boolean(String(model || "").trim() && isDeniedStoredModelName(model));
  }

  function isKnownImageGenerationModelFamily(model) {
    var clean = sanitizeChatGPTModel(model).toLowerCase().replace(/_/g, "-");
    return /^(?:gpt-image|dall-e)(?:$|[-_.]\d)/i.test(clean) || /^image-\d+$/i.test(clean);
  }

  function isConversationModePseudoModel(value) {
    // 深度研究 / 代理模式是模型选择器里的可选项,记成同名条目;它们是合法的用户可见模型行,
    // 不应被「功能名 / 歧义 slug」清理逻辑删除。
    return /^(deep research|agent mode)$/i.test(String(value || "").trim());
  }

  function isFeatureOnlyModelName(model) {
    if (isConversationModePseudoModel(model)) {
      return false;
    }
    return Boolean((!isKnownImageGenerationModelFamily(model) && sanitizeUsageFeatureId(model)) || isFeatureNamedSlug(model));
  }

  function hasKnownModelPrefix(model) {
    if (/^image-\d+-image$/i.test(String(model || "").replace(/_/g, "-"))) {
      return false;
    }
    return /^(?:gpt|o\d|chat-latest(?:$|[-_.])|text-|dall-e|tts|whisper|omni|codex|computer|babbage|davinci|moderation|gpt-image|audio|image-\d|image-[a-z0-9-]*\d)/i.test(String(model || ""));
  }

  function hasGenericModelSlugEvidence(model) {
    var clean = sanitizeChatGPTModel(model).toLowerCase().replace(/_/g, "-");
    if (hasKnownModelPrefix(clean)) {
      return true;
    }
    if (/(?:[-_.](?:thinking|instant|fast|auto|pro))$/i.test(clean) && /(?:^|[-_.])(?:\d{1,4}|latest|preview)(?:$|[-_.])/.test(clean)) {
      return true;
    }
    if (/(?:[-_.](?:latest|preview|realtime|audio|tts|transcribe))$/i.test(clean)) {
      return /(?:^|[-_.])(?:model|family|chat|assistant|response|openai|\d{1,4})(?:$|[-_.])/.test(clean);
    }
    return false;
  }

  function isFeatureNamedSlug(model) {
    var clean = sanitizeChatGPTModel(model).toLowerCase().replace(/_/g, "-");
    if (/^image-\d+-image$/i.test(clean)) {
      return true;
    }
    return /^(?:agent(?:-?mode)?|deep-?(?:research|search)|image(?:-?generation)?|web-?search|realtime|real-time|audio|voice|canvas)(?:$|[-_.])/.test(clean) &&
      !/^(?:gpt-image|dall-e|image-\d)/i.test(clean);
  }

  function isTrustedRequestModelSource(source) {
    return /^(webRequest|fetch-request|xhr-request|fetch-response|xhr-response|fetch-url|xhr-url)(?::|$)/i.test(String(source || ""));
  }

  function requestEvidenceSourcePriority(source) {
    var clean = String(source || "");
    if (/^webRequest(?::|$)/i.test(clean)) return 4;
    if (/^(?:fetch-request|xhr-request)(?::|$)/i.test(clean)) return 3;
    if (/^(?:fetch-response|xhr-response)(?::|$)/i.test(clean)) return 2;
    if (/^(?:fetch-url|xhr-url)(?::|$)/i.test(clean)) return 1;
    return 0;
  }

  function isAmbiguousChatGPTFamilySlug(model) {
    // Versioned request slugs and public dotted GPT labels are both valid
    // identities. Placeholders and feature-only names are filtered elsewhere.
    return false;
  }

  function hasAmbiguousChatGPTFamilySlug(model) {
    return Boolean(String(model || "").trim() && isAmbiguousChatGPTFamilySlug(model));
  }

  function chatGPTModeLabelFromSlug(model) {
    return "";
  }

  function isActualRequestModel(model) {
    var clean = sanitizeChatGPTModel(model);
    return Boolean(clean && !isDeniedStoredModelName(clean) && !isFeatureOnlyModelName(clean) && isModelSlug(clean) && !isAmbiguousChatGPTFamilySlug(clean));
  }

  function isChatGPTRequestRoute(model) {
    var clean = sanitizeChatGPTModel(model);
    return clean === "auto" || isActualRequestModel(clean);
  }

  function isAuditableRequestRoute(model) {
    var clean = sanitizeChatGPTModel(model);
    return Boolean(clean && (isChatGPTRequestRoute(clean) || CONVERSATION_MODE_MODELS[clean]));
  }

  function isModelSlug(value) {
    var clean = String(value || "").trim();
    if (modelCatalog && typeof modelCatalog.isRequestModelSlug === "function") {
      return modelCatalog.isRequestModelSlug(clean);
    }
    if (modelCatalog && typeof modelCatalog.isModelSlug === "function" && modelCatalog.isModelSlug(clean)) {
      return true;
    }
    return /^[a-z][a-z0-9._-]{1,95}$/i.test(clean) &&
      /[a-z]/i.test(clean) &&
      !isFeatureOnlyModelName(clean) &&
      !isFeatureNamedSlug(clean) &&
      !/^(auto|default|none|null|undefined|chatgpt)$/i.test(clean) &&
      (hasGenericModelSlugEvidence(clean) ||
        (/(?=.*[a-z])(?=.*\d)(?=.*[-_.])^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)+$/i.test(clean) &&
          !/^(?:model|reasoning|text|tools?|temperature|max|response|request|conversation|metadata|stream|protocol|transport|endpoint|session)(?:[-_.]|$)/i.test(clean)));
  }

  function exactModelCandidate(first, second) {
    // parameters.model comes from the current request and is authoritative.
    // Never let an older DOM/metadata mode suffix override that exact value.
    return second || first || "";
  }

  function modelParametersFromMetadata(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    if (source.parameters && typeof source.parameters === "object") {
      return source.parameters;
    }
    if (source.modelParameters && typeof source.modelParameters === "object") {
      return source.modelParameters;
    }
    return {};
  }

  function exactRequestModelFromMetadata(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    if (source.requestModelEvidence === "unavailable") {
      return "";
    }
    var sourceParameters = modelParametersFromMetadata(source);
    var candidates = [
      source.requestModel,
      sourceParameters.model,
      sourceParameters.api_model,
      sourceParameters.apimodel,
      sourceParameters.chatgpt_model,
      sourceParameters.chatgptmodel,
      sourceParameters.selected_model,
      sourceParameters.selectedmodel,
      sourceParameters.model_slug,
      sourceParameters.modelslug,
      sourceParameters.model_id,
      sourceParameters.modelid,
      source.chatgptModel,
      source.apiModel
    ];
    for (var i = 0; i < candidates.length; i += 1) {
      var candidate = sanitizeChatGPTModel(candidates[i]);
      if (isAuditableRequestRoute(candidate)) {
        return candidate;
      }
    }
    return "";
  }

  function exactResponseModelFromMetadata(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var candidate = sanitizeChatGPTModel(source.responseModel);
    if (!isActualRequestModel(candidate)) {
      return "";
    }
    var observedSource = String(
      source.responseObservedSource ||
      source.responseSource ||
      ""
    );
    var observedAt = String(source.responseObservedAt || "");
    if (observedAt && /^message-dom:model-slug(?:$|:)/i.test(observedSource)) {
      return candidate;
    }
    // Legacy builds stored the final DOM observation in modelObservedSource
    // before responseObservedAt/Source existed. Preserve only that exact
    // metadata source; a webRequest proves the request route, never the reply.
    var legacySource = String(source.modelObservedSource || source.observedSource || "");
    return /^message-dom:model-slug(?:$|:)/i.test(legacySource) ? candidate : "";
  }

  function exactIdentityModelFromMetadata(metadata) {
    return exactResponseModelFromMetadata(metadata) || exactRequestModelFromMetadata(metadata);
  }

  function isStoredModelValid(model, metadata, rawModel) {
    if (isConversationModePseudoModel(model) || isConversationModePseudoModel(metadata && metadata.label)) {
      return true;
    }
    var sourceParameters = modelParametersFromMetadata(metadata);
    var declaredChatGPTModel = sanitizeChatGPTModel(exactModelCandidate(metadata && metadata.chatgptModel, sourceParameters.model));
    var requestModel = exactRequestModelFromMetadata(metadata);
    var identityModel = exactIdentityModelFromMetadata(metadata);
    var runtimePublic = identityModel ? resolveRuntimePublicModel(identityModel, metadata) : null;
    var declaredPublic = sanitizePublicModelName(metadata && (metadata.publicModel || metadata.selectedPublicModel));
    if (
      identityModel &&
      (
        (runtimePublic && runtimePublic.mappingStatus === "mapped" && runtimePublic.publicModel === model) ||
        (declaredPublic && declaredPublic === model && /^(?:mapped|selector)$/i.test(String(metadata && metadata.modelMappingStatus || "")))
      )
    ) {
      return true;
    }
    if (hasDeniedStoredModelName(rawModel)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(rawModel)) {
      return false;
    }
    if (isDeniedStoredModelName(model)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(model)) {
      return false;
    }
    if (isFeatureOnlyModelName(model)) {
      return false;
    }

    if (hasDeniedStoredModelName(metadata && metadata.label)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(metadata && metadata.label)) {
      return false;
    }
    if (hasDeniedStoredModelName(metadata && metadata.apiModel)) {
      return false;
    }
    if (hasAmbiguousChatGPTFamilySlug(metadata && metadata.apiModel)) {
      return false;
    }
    if (hasDeniedStoredModelName(declaredChatGPTModel)) {
      return false;
    }
    if (isFeatureOnlyModelName(declaredChatGPTModel)) {
      return false;
    }
    if (isAmbiguousChatGPTFamilySlug(declaredChatGPTModel)) {
      return false;
    }

    if (model === "chat-latest" && metadata && metadata.apiModel && metadata.apiModel !== "chat-latest") {
      return false;
    }

    // Stored aggregates may contain false positives created by an older DOM
    // detector (for example ordinary buttons such as "Share"). Keep only a
    // model identity that still has model-shaped evidence after
    // canonicalization. Conversation-mode rows are handled explicitly above.
    return isChatGPTRequestRoute(model);
  }

  function exactLabelFallback(slug) {
    return sanitizeModelName(slug);
  }

  function storedCatalogMappedPublicModel(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var declaredPublic = sanitizePublicModelName(source.publicModel || source.chatgptModel);
    var mappingStatus = String(source.modelMappingStatus || "").toLowerCase();
    var mappingSource = String(source.publicModelSource || "");
    var catalogObservedAt = String(source.catalogObservedAt || "");
    if (
      !declaredPublic ||
      mappingStatus !== "mapped" ||
      !catalogObservedAt ||
      !/account-catalog/i.test(mappingSource)
    ) {
      return "";
    }
    return declaredPublic;
  }

  function catalogBindingForResolvedMapping(metadata, runtimePublic) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var accountKey = storedCatalogAccountKey(source);
    var contextKey = storedCatalogContextKey(source);
    if (
      runtimePublic &&
      runtimePublic.mappingStatus === "mapped" &&
      activeCatalogAllowedForMetadata(source)
    ) {
      accountKey = accountKey || activeRuntimeModelCatalogAccountKey;
      contextKey = contextKey || activeRuntimeModelCatalogContextKey;
    }
    return {
      accountKey: accountKey,
      contextKey: contextKey
    };
  }

  function canonicalStoredModelName(model, metadata) {
    var rawModel = sanitizeModelName(model);
    var sourceParameters = modelParametersFromMetadata(metadata);
    var exactModel = exactIdentityModelFromMetadata(metadata) ||
      sanitizeChatGPTModel(exactModelCandidate(metadata && metadata.chatgptModel, sourceParameters.model));
    var identityModel = exactIdentityModelFromMetadata(metadata);
    // A catalog-proven public label stored with an event or aggregate is
    // evidence from that account and time. A later catalog may map the same
    // internal slug differently, so it must not relabel an incomplete
    // historical aggregate that can no longer be split event-by-event.
    var storedMappedPublic = storedCatalogMappedPublicModel(metadata);
    if (storedMappedPublic) {
      return storedMappedPublic;
    }
    var runtimePublic = identityModel ? resolveRuntimePublicModel(identityModel, metadata) : null;
    if (runtimePublic && runtimePublic.mappingStatus === "mapped" && runtimePublic.publicModel) {
      return sanitizePublicModelName(runtimePublic.publicModel);
    }
    var selectedMetadata = resolveSelectedPublicModelMetadata(
      exactRequestModelFromMetadata(metadata),
      metadata
    );
    var directPublicModel = directSameRoutePublicModel(
      exactRequestModelFromMetadata(metadata),
      exactResponseModelFromMetadata(metadata),
      metadata,
      selectedMetadata
    );
    if (directPublicModel) {
      return directPublicModel;
    }
    // chrome.storage.session is cleared when an unpacked extension is
    // reloaded or an installed extension is updated. Until the account
    // catalog is fetched again, keep the last catalog-proven public mapping
    // already stored on the event/aggregate. A fresh live catalog still wins
    // above, while unknown/unmapped slugs never enter this fallback.
    if (exactResponseModelFromMetadata(metadata)) {
      if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
        var responseResolved = modelCatalog.resolveModelInfo(exactModel);
        if (responseResolved && responseResolved.label) {
          return sanitizeModelName(responseResolved.label);
        }
      }
      return exactLabelFallback(exactModel);
    }
    var declaredPublic = sanitizePublicModelName(metadata && (metadata.publicModel || metadata.selectedPublicModel));
    if (declaredPublic && /^(?:mapped|selector)$/i.test(String(metadata && metadata.modelMappingStatus || ""))) {
      return declaredPublic;
    }
    if (isChatGPTRequestRoute(exactModel)) {
      var exactModeLabel = chatGPTModeLabelFromSlug(exactModel);
      if (exactModeLabel) {
        return exactModeLabel;
      }
      if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
        var exactResolved = modelCatalog.resolveModelInfo(exactModel);
        if (exactResolved && exactResolved.label) {
          return sanitizeModelName(exactResolved.label);
        }
      }
      return exactLabelFallback(exactModel);
    }

    var apiModel = sanitizeChatGPTModel(metadata && metadata.apiModel);
    if (isChatGPTRequestRoute(apiModel)) {
      var apiModeLabel = chatGPTModeLabelFromSlug(apiModel);
      if (apiModeLabel) {
        return apiModeLabel;
      }
      if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
        var apiResolved = modelCatalog.resolveModelInfo(apiModel);
        if (apiResolved && apiResolved.label) {
          return sanitizeModelName(apiResolved.label);
        }
      }
      return exactLabelFallback(apiModel);
    }

    var candidates = [
      rawModel,
      metadata && metadata.label,
      metadata && metadata.apiModel
    ];

    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      for (var i = 0; i < candidates.length; i += 1) {
        var resolved = modelCatalog.resolveModelInfo(candidates[i]);
        if (resolved && resolved.label) {
          return sanitizeModelName(resolved.label);
        }
      }
    }

    return exactLabelFallback(rawModel);
  }

  function resolveStoredModelMetadata(canonicalModel, metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var candidates = [
      canonicalModel,
      source.chatgptModel,
      source.apiModel,
      source.label
    ];

    if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      for (var i = 0; i < candidates.length; i += 1) {
        var resolved = modelCatalog.resolveModelInfo(candidates[i]);
        if (resolved) {
          return resolved;
        }
      }
    }

    return null;
  }

  function mergeStoredModelMetadata(existing, canonicalModel, metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var previous = existing && typeof existing === "object" ? existing : {};
    var resolved = resolveStoredModelMetadata(canonicalModel, source);
    var sourceParameters = modelParametersFromMetadata(source);
    if (Object.keys(sourceParameters).length === 0) {
      sourceParameters = modelParametersFromMetadata(previous);
    }
    var requestModel = exactRequestModelFromMetadata({
      requestModel: source.requestModel || previous.requestModel,
      parameters: sourceParameters,
      chatgptModel: source.chatgptModel || previous.chatgptModel,
      apiModel: source.apiModel || previous.apiModel
    });
    var responseEvidence = source.responseModel
      ? source
      : previous;
    var responseModel = exactResponseModelFromMetadata(responseEvidence);
    var identityModel = responseModel || requestModel;
    var apiModel = sanitizeApiModel(
      requestModel || source.apiModel || previous.apiModel || (resolved && resolved.apiModel)
    );
    var runtimePublic = identityModel ? resolveRuntimePublicModel(identityModel, source) : null;
    var selectedMetadata = resolveSelectedPublicModelMetadata(
      requestModel,
      Object.assign({}, previous, source, {
        selectedPublicModel: source.selectedPublicModel || previous.selectedPublicModel,
        selectedPublicModelSource: source.selectedPublicModelSource || previous.selectedPublicModelSource,
        selectedPublicMode: source.selectedPublicMode || previous.selectedPublicMode,
        selectedPublicModeLabel: source.selectedPublicModeLabel || previous.selectedPublicModeLabel,
        selectedPublicModeSource: source.selectedPublicModeSource || previous.selectedPublicModeSource
      })
    );
    var sourceMode = normalizeSourceMode(source.sourceMode || previous.sourceMode);
    var directPublicModel = directSameRoutePublicModel(
      requestModel,
      responseModel,
      Object.assign({}, previous, source, { sourceMode: sourceMode }),
      selectedMetadata
    );
    var publicModel = responseModel
      ? sanitizePublicModelName(
          (runtimePublic && runtimePublic.mappingStatus === "mapped" && runtimePublic.publicModel) ||
          directPublicModel ||
          canonicalModel
        )
      : sanitizePublicModelName(
          (runtimePublic && runtimePublic.mappingStatus === "mapped" && runtimePublic.publicModel) ||
          source.publicModel ||
          source.selectedPublicModel ||
          previous.publicModel ||
          previous.selectedPublicModel ||
          canonicalModel
        );
    if (runtimePublic && runtimePublic.mappingStatus === "mapped") {
      publicModel = sanitizePublicModelName(runtimePublic.publicModel);
    }
    var chatgptModel = sanitizePublicModelName(publicModel || source.chatgptModel || previous.chatgptModel);
    var identityResolved = identityModel && modelCatalog && typeof modelCatalog.resolveModelInfo === "function"
      ? modelCatalog.resolveModelInfo(identityModel)
      : null;
    var mode = responseModel
      ? sanitizeModelMode(identityResolved && identityResolved.mode)
      : sanitizeModelMode((identityResolved && identityResolved.mode) || source.mode || previous.mode || (resolved && resolved.mode));
    var observedSource = String(source.observedSource || previous.observedSource || "").slice(0, 64);
    var parameters = sanitizeModelParameters(sourceParameters, apiModel);
    var catalogBinding = catalogBindingForResolvedMapping(
      Object.assign({}, previous, source),
      runtimePublic
    );
    if (requestModel) {
      parameters.model = requestModel;
    }

    var merged = {
      label: canonicalModel,
      publicModel: publicModel || canonicalModel,
      selectedPublicModel: selectedMetadata.selectedPublicModel,
      selectedPublicModelSource: selectedMetadata.selectedPublicModelSource,
      selectedPublicMode: selectedMetadata.selectedPublicMode,
      selectedPublicModeLabel: selectedMetadata.selectedPublicModeLabel,
      selectedPublicModeSource: selectedMetadata.selectedPublicModeSource,
      requestModel: requestModel,
      responseModel: responseModel,
      apiModel: apiModel,
      chatgptModel: chatgptModel,
      mode: mode,
      modelIdentitySource: responseModel ? "response-model" : "request-model",
      observedSource: observedSource,
      sourceMode: sourceMode,
      modelMappingStatus: String(
        runtimePublic && runtimePublic.mappingStatus === "mapped"
          ? "mapped"
          : directPublicModel
            ? "selector"
            : (runtimePublic && runtimePublic.mappingStatus) || source.modelMappingStatus || previous.modelMappingStatus || ""
      ).slice(0, 24),
      publicModelSource: String(
        runtimePublic && runtimePublic.mappingStatus === "mapped"
          ? runtimePublic.source
          : directPublicModel
            ? (sourceMode === "work" ? "work-selector+same-route" : "selector+same-route")
            : responseModel && runtimePublic && runtimePublic.mappingStatus !== "mapped"
              ? "unmapped-response-slug"
              : (runtimePublic && runtimePublic.source) || source.publicModelSource || previous.publicModelSource || ""
      ).slice(0, 80),
      catalogObservedAt: String((runtimePublic && runtimePublic.catalogObservedAt) || source.catalogObservedAt || previous.catalogObservedAt || "").slice(0, 48),
      catalogAccountKey: catalogBinding.accountKey,
      catalogContextKey: catalogBinding.contextKey,
      deprecated: Boolean(source.deprecated || previous.deprecated || (resolved && resolved.deprecated)),
      parameters: parameters
    };
    if (responseModel) {
      merged.responseObservedAt = String(responseEvidence.responseObservedAt || "").slice(0, 48);
      merged.responseObservedSource = String(
        responseEvidence.responseObservedSource ||
        responseEvidence.responseSource ||
        responseEvidence.modelObservedSource ||
        responseEvidence.observedSource ||
        ""
      ).slice(0, 64);
    }
    return merged;
  }

  function canonicalizeStoredEvent(event, canonicalModel, metadata) {
    var sourceEvent = event && typeof event === "object" ? event : {};
    var requestModelUnavailable = metadata && metadata.requestModelEvidence === "unavailable";
    var requestModel = requestModelUnavailable
      ? ""
      : exactRequestModelFromMetadata(sourceEvent) || exactRequestModelFromMetadata(metadata);
    var responseModel = exactResponseModelFromMetadata(sourceEvent) || exactResponseModelFromMetadata(metadata);
    var identityModel = responseModel || requestModel;
    var eventParameters = sanitizeModelParameters(sourceEvent.modelParameters || sourceEvent.parameters || {}, "");
    if (requestModelUnavailable) {
      [
        "model",
        "api_model",
        "apimodel",
        "chatgpt_model",
        "chatgptmodel",
        "selected_model",
        "selectedmodel",
        "model_slug",
        "modelslug",
        "model_id",
        "modelid"
      ].forEach(function removeUnprovenRequestModel(key) {
        delete eventParameters[key];
      });
    }
    if (requestModel) {
      eventParameters.model = requestModel;
    }

    var resolved = identityModel && modelCatalog && typeof modelCatalog.resolveModelInfo === "function"
      ? modelCatalog.resolveModelInfo(identityModel)
      : null;
    // Only fields needed for model resolution may participate in import
    // normalization. In particular, an event-level runtime catalog and unknown
    // imported keys must never influence mapping or survive persistence.
    var safeMappingMetadata = {
      selectedPublicModel: sourceEvent.selectedPublicModel || (metadata && metadata.selectedPublicModel),
      selectedPublicModelSource: sourceEvent.selectedPublicModelSource || (metadata && metadata.selectedPublicModelSource),
      selectedPublicMode: sourceEvent.selectedPublicMode || (metadata && metadata.selectedPublicMode),
      selectedPublicModeLabel: sourceEvent.selectedPublicModeLabel || (metadata && metadata.selectedPublicModeLabel),
      selectedPublicModeSource: sourceEvent.selectedPublicModeSource || (metadata && metadata.selectedPublicModeSource),
      selectedModelText: sourceEvent.selectedModelText || (metadata && metadata.selectedModelText),
      modelParameters: eventParameters,
      sourceMode: sourceEvent.sourceMode,
      catalogAccountKey: storedCatalogAccountKey(sourceEvent) || storedCatalogAccountKey(metadata),
      catalogContextKey: storedCatalogContextKey(sourceEvent) || storedCatalogContextKey(metadata)
    };
    var runtimePublic = identityModel ? resolveRuntimePublicModel(identityModel, safeMappingMetadata) : null;
    var catalogBinding = catalogBindingForResolvedMapping(
      safeMappingMetadata,
      runtimePublic
    );
    var selectedMetadata = resolveSelectedPublicModelMetadata(
      requestModel,
      safeMappingMetadata
    );
    var sourceMode = normalizeSourceMode(sourceEvent.sourceMode);
    var directPublicModel = directSameRoutePublicModel(
      requestModel,
      responseModel,
      {
        sourceMode: sourceMode,
        selectedPublicModel: safeMappingMetadata.selectedPublicModel,
        selectedPublicModelSource: safeMappingMetadata.selectedPublicModelSource,
        selectedPublicMode: safeMappingMetadata.selectedPublicMode,
        selectedPublicModeLabel: safeMappingMetadata.selectedPublicModeLabel,
        selectedPublicModeSource: safeMappingMetadata.selectedPublicModeSource,
        modelParameters: eventParameters
      },
      selectedMetadata
    );
    var apiModel = requestModelUnavailable ? "" : requestModel || sanitizeApiModel(sourceEvent.apiModel);
    var publicModel = responseModel
      ? sanitizePublicModelName(
          (runtimePublic && runtimePublic.mappingStatus === "mapped" && runtimePublic.publicModel) ||
          directPublicModel ||
          canonicalModel
        )
      : sanitizePublicModelName(
          (runtimePublic && runtimePublic.mappingStatus === "mapped" && runtimePublic.publicModel) ||
          sourceEvent.publicModel ||
          sourceEvent.selectedPublicModel ||
          canonicalModel
        );
    if (runtimePublic && runtimePublic.mappingStatus === "mapped") {
      publicModel = sanitizePublicModelName(runtimePublic.publicModel);
    }
    var chatgptModel = sanitizePublicModelName(publicModel || sourceEvent.chatgptModel);
    var modelMode = responseModel
      ? sanitizeModelMode(resolved && resolved.mode)
      : sanitizeModelMode((resolved && resolved.mode) || sourceEvent.modelMode || sourceEvent.mode);

    // Rebuild every persisted event from an explicit allowlist. This is the
    // import boundary for event data: unknown fields, request coordination
    // state, account catalogs, credentials, prompts, responses, and dangerous
    // object keys are discarded rather than copied and deleted afterward.
    var cleanEvent = {
      submissionId: String(sourceEvent.submissionId || "").slice(0, 96),
      model: canonicalModel,
      publicModel: publicModel || canonicalModel,
      selectedPublicModel: selectedMetadata.selectedPublicModel,
      selectedPublicModelSource: selectedMetadata.selectedPublicModelSource,
      selectedPublicMode: selectedMetadata.selectedPublicMode,
      selectedPublicModeLabel: selectedMetadata.selectedPublicModeLabel,
      selectedPublicModeSource: selectedMetadata.selectedPublicModeSource,
      requestModel: requestModel,
      requestModelEvidence: requestModelUnavailable ? "unavailable" : "trusted",
      responseModel: responseModel,
      apiModel: apiModel,
      chatgptModel: chatgptModel,
      modelMode: modelMode,
      modelIdentitySource: responseModel ? "response-model" : "request-model",
      modelObservedSource: String(
        sourceEvent.modelObservedSource ||
        sourceEvent.observedSource ||
        (metadata && (metadata.modelObservedSource || metadata.observedSource)) ||
        ""
      ).slice(0, 64),
      modelMappingStatus: String(
        runtimePublic && runtimePublic.mappingStatus === "mapped"
          ? "mapped"
          : directPublicModel
            ? "selector"
            : (runtimePublic && runtimePublic.mappingStatus) || sourceEvent.modelMappingStatus || (metadata && metadata.modelMappingStatus) || ""
      ).slice(0, 24),
      publicModelSource: String(
        runtimePublic && runtimePublic.mappingStatus === "mapped"
          ? runtimePublic.source
          : directPublicModel
            ? (sourceMode === "work" ? "work-selector+same-route" : "selector+same-route")
            : responseModel && runtimePublic && runtimePublic.mappingStatus !== "mapped"
              ? "unmapped-response-slug"
              : (runtimePublic && runtimePublic.source) || sourceEvent.publicModelSource || (metadata && metadata.publicModelSource) || ""
      ).slice(0, 80),
      catalogObservedAt: String((runtimePublic && runtimePublic.catalogObservedAt) || sourceEvent.catalogObservedAt || (metadata && metadata.catalogObservedAt) || "").slice(0, 48),
      catalogAccountKey: catalogBinding.accountKey,
      catalogContextKey: catalogBinding.contextKey,
      modelParameters: eventParameters,
      requestReasoningEffort: requestReasoningEffortFromParameters(eventParameters),
      usageFeatures: normalizeUsageFeaturesForPage(
        sourceEvent.usageFeatures,
        eventParameters,
        canonicalModel,
        sourceEvent.pageUrl
      ),
      source: String(sourceEvent.source || "unmarked-source").slice(0, 32),
      sourceMode: sourceMode,
      submittedAt: String(sourceEvent.submittedAt || "").slice(0, 48),
      dateKeyBasis: sourceEvent.dateKeyBasis === "local" ? "local" : sourceEvent.dateKeyBasis === "utc" ? "utc" : "",
      ...(validRecordedDateKey(sourceEvent.recordedDateKey)
        ? { recordedDateKey: String(sourceEvent.recordedDateKey), dateTimeZone: String(sourceEvent.dateTimeZone || "").slice(0, 128) }
        : {}),
      pageUrl: String(sourceEvent.pageUrl || "").slice(0, 500),
      pageTitle: sanitizeTitle(sourceEvent.pageTitle),
      conversationId: sanitizeConversationId(
        sourceEvent.conversationId || extractConversationId(sourceEvent.pageUrl)
      ),
      requestMessageId: sanitizeMessageId(sourceEvent.requestMessageId),
      responseMessageId: sanitizeMessageId(sourceEvent.responseMessageId)
    };
    if (responseModel) {
      cleanEvent.responseObservedAt = String(sourceEvent.responseObservedAt || "").slice(0, 48);
      cleanEvent.responseObservedSource = String(
        sourceEvent.responseObservedSource ||
        sourceEvent.responseSource ||
        sourceEvent.modelObservedSource ||
        ""
      ).slice(0, 64);
    }
    return cleanEvent;
  }

  function canonicalizeSessionModelCounts(modelCounts, sourceModels) {
    var clean = {};
    Object.keys(modelCounts || {}).forEach(function copyModelCount(model) {
      var metadata = (sourceModels && sourceModels[model]) || {};
      var canonicalModel = canonicalStoredModelName(model, metadata);
      if (!isStoredModelValid(canonicalModel, metadata, model)) {
        return;
      }

      var count = sanitizeCount(modelCounts[model]);
      if (count <= 0) {
        return;
      }

      clean[canonicalModel] = (Number(clean[canonicalModel]) || 0) + count;
    });
    return clean;
  }

  function mergeTimestamp(earliest, latest, preferEarliest) {
    var left = String(earliest || "");
    var right = String(latest || "");
    if (!left) return right;
    if (!right) return left;
    return preferEarliest ? (left < right ? left : right) : (left > right ? left : right);
  }

  function mergeSessions(existing, session) {
    var source = sanitizeSession(session, session && session.conversationId);
    if (!source) {
      return existing || null;
    }

    var target = sanitizeSession(existing, existing && existing.conversationId);
    if (!target) {
      return source;
    }

    var mergedModels = {};
    Object.keys(target.models || {}).forEach(function copyTargetModel(model) {
      mergedModels[model] = (Number(mergedModels[model]) || 0) + sanitizeCount(target.models[model]);
    });
    Object.keys(source.models || {}).forEach(function copySourceModel(model) {
      mergedModels[model] = (Number(mergedModels[model]) || 0) + sanitizeCount(source.models[model]);
    });

    var sourceIsNewer = String(source.lastSubmittedAt || "") >= String(target.lastSubmittedAt || "");
    return sanitizeSession(
      {
        conversationId: target.conversationId || source.conversationId,
        title: sourceIsNewer ? source.title || target.title : target.title || source.title,
        count: sanitizeCount(target.count) + sanitizeCount(source.count),
        models: mergedModels,
        firstSubmittedAt: mergeTimestamp(target.firstSubmittedAt, source.firstSubmittedAt, true),
        lastSubmittedAt: mergeTimestamp(target.lastSubmittedAt, source.lastSubmittedAt, false),
        lastPageUrl: sourceIsNewer ? source.lastPageUrl || target.lastPageUrl : target.lastPageUrl || source.lastPageUrl
      },
      target.conversationId || source.conversationId
    );
  }

  function sanitizeApiModel(apiModel) {
    return String(apiModel || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 96);
  }

  function sanitizeChatGPTModel(chatgptModel) {
    var clean = String(chatgptModel || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 96);
    if (modelCatalog && typeof modelCatalog.canonicalizeChatGPTModeSlug === "function") {
      return modelCatalog.canonicalizeChatGPTModeSlug(clean);
    }
    return clean.toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/_/g, "-");
  }

  function sanitizeModelMode(mode) {
    return String(mode || "")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 32);
  }

  function sanitizePublicMode(mode) {
    if (modelCatalog && typeof modelCatalog.normalizePublicMode === "function") {
      return modelCatalog.normalizePublicMode(mode);
    }
    var clean = sanitizeModelMode(mode).toLowerCase();
    return /^(?:auto|fast|instant|pro|thinking)$/.test(clean) ? clean : "";
  }

  function sanitizePublicModeLabel(label, mode) {
    var clean = String(label || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
    if (clean) {
      return clean;
    }
    var normalized = sanitizePublicMode(mode);
    return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "";
  }

  function normalizeParameterKeyPart(key) {
    return String(key || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_.-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
      .slice(0, 64);
  }

  function isDeniedParameterPart(part) {
    return /^(message|messages|mapping|content|contents|parts|inputs?|instructions?|attachments?|files?|file_data|image_url|metadata|variables|conversation|conversation_id|parent_message_id|timezone|history_and_training_disabled|force_paragen|paragen|system|developer|user|stream|stream_options|protocol|transport|connection|endpoint|path|url|headers|authorization|cookie|client_secret|access_token|token|session_id|request_id|event_id|supports_buffering|supported_encodings|system_hints|conversation_mode|api_model|apimodel|chatgpt_model|chatgptmodel|model_mode|modelmode|model_observed_source|observed_source|source|label)$/i.test(part);
  }

  function isKnownTopLevelParameter(part) {
    return /^(model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel|temperature|top_p|top_k|top_logprobs|logprobs|frequency_penalty|presence_penalty|max_tokens|max_output_tokens|max_completion_tokens|max_response_output_tokens|max_tool_calls|seed|n|tool_choice|parallel_tool_calls|modalities|output_modalities|speed|service_tier|store|truncation|prompt_cache_retention|input_audio_format|output_audio_format|timestamp_granularities|best_of|echo)$/i.test(part);
  }

  function isKnownNestedParameterRoot(part) {
    return /^(reasoning|text|audio|response_format|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/i.test(part);
  }

  function isContainerOnlyParameterRoot(part) {
    return /^(reasoning|text|audio|response_format|tool_choice|turn_detection|input_audio_transcription|web_search_options|image_generation_options)$/i.test(part);
  }

  function isAllowedParameterPath(path) {
    return /^(?:model|model_slug|modelslug|model_id|modelid|selected_model|selectedmodel|api_model|apimodel|chatgpt_model|chatgptmodel|temperature|top_p|top_k|top_logprobs|logprobs|frequency_penalty|presence_penalty|max_tokens|max_output_tokens|max_completion_tokens|max_response_output_tokens|max_tool_calls|seed|n|tool_choice|parallel_tool_calls|modalities|output_modalities|speed|service_tier|store|truncation|prompt_cache_retention|input_audio_format|output_audio_format|timestamp_granularities|best_of|echo|reasoning\.effort|reasoning\.summary|text\.verbosity|text\.format\.type|audio\.format|audio\.output\.voice|audio\.output\.speed|response_format\.type|tool_choice\.type|turn_detection\.type|turn_detection\.threshold|turn_detection\.prefix_padding_ms|turn_detection\.silence_duration_ms|turn_detection\.create_response|turn_detection\.interrupt_response|input_audio_transcription\.model|input_audio_transcription\.language|web_search_options\.search_context_size|image_generation_options\.size|image_generation_options\.quality|image_generation_options\.output_format|image_generation_options\.background|image_generation_options\.moderation)$/i.test(String(path || ""));
  }

  function canonicalParameterAlias(clean, parent) {
    if (
      clean === "reasoning_effort" ||
      clean === "thinking_effort" ||
      (clean === "effort" && (parent === "reasoning" || parent === "thinking"))
    ) {
      return "reasoning.effort";
    }
    if ((clean === "verbosity" && parent === "text") || clean === "verbosity" || clean === "text_verbosity") {
      return "text.verbosity";
    }
    if (clean === "topp") {
      return "top_p";
    }
    if (clean === "topk") {
      return "top_k";
    }
    if (clean === "toolchoice") {
      return "tool_choice";
    }
    if (clean === "responseformat") {
      return "response_format";
    }
    return clean;
  }

  function canonicalParameterPath(path, key) {
    var rawKey = String(key || "");
    var clean = normalizeParameterKeyPart(rawKey);
    var parts = (Array.isArray(path) ? path : [])
      .map(normalizeParameterKeyPart)
      .filter(Boolean);

    if (NETWORK_MODEL_FIELD_RE.test(rawKey) && parts.length === 0) {
      return isAllowedParameterPath(clean) ? clean : "";
    }

    if (!clean || isDeniedParameterPart(clean)) {
      return "";
    }

    for (var i = 0; i < parts.length; i += 1) {
      if (isDeniedParameterPart(parts[i])) {
        return "";
      }
    }

    var parent = parts.length ? parts[parts.length - 1] : "";
    clean = canonicalParameterAlias(clean, parent);

    if (clean === "model" && parts.length === 0) {
      return "model";
    }
    if (clean === "prompt" || clean === "prompts") {
      return "";
    }
    if (parts.length === 0 && isContainerOnlyParameterRoot(clean)) {
      return "";
    }
    if (parts.length === 0 && clean === "tools") {
      return "";
    }
    if (clean.indexOf(".") >= 0) {
      var directRoot = clean.split(".")[0];
      var directPath = clean.slice(0, 64);
      return isKnownNestedParameterRoot(directRoot) &&
        !clean.split(".").some(isDeniedParameterPart) &&
        isAllowedParameterPath(directPath)
        ? directPath
        : "";
    }

    if (parts.length > 0) {
      var rootPart = canonicalParameterAlias(parts[0], "");
      if (!isKnownNestedParameterRoot(rootPart)) {
        return "";
      }
      var nestedPath = parts.concat(clean).slice(0, 4).join(".").slice(0, 64);
      return isAllowedParameterPath(nestedPath) ? nestedPath : "";
    }

    if (isKnownTopLevelParameter(clean)) {
      return isAllowedParameterPath(clean) ? clean : "";
    }

    return "";
  }

  function canonicalModelParameterKey(key) {
    return canonicalParameterPath([], key);
  }

  function sanitizeModelParameterValue(value) {
    if (Array.isArray(value)) {
      var cleanItems = value
        .slice(0, MAX_PARAMETER_ARRAY_ITEMS)
        .map(function sanitizeArrayParameterItem(item) {
          if (item && typeof item === "object") {
            return "";
          }
          return sanitizeParameterArrayItem(item);
        })
        .filter(Boolean);
      return cleanItems.length > 0 ? cleanItems : undefined;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : undefined;
    }

    if (value === null || typeof value === "undefined") {
      return undefined;
    }

    if (typeof value === "object") {
      return undefined;
    }

    var cleanValue = String(value).replace(/\s+/g, " ").trim().slice(0, 128);
    return cleanValue || undefined;
  }

  function sanitizeModelParameters(parameters, apiModel) {
    var source = parameters && typeof parameters === "object" ? parameters : {};
    var clean = {};
    var keys = Object.keys(source).map(function parameterEntry(key, index) {
      var safeKey = canonicalModelParameterKey(key);
      var priority = NETWORK_MODEL_FIELD_RE.test(safeKey)
        ? 100
        : safeKey === "reasoning.effort"
          ? 90
          : safeKey === "text.verbosity"
            ? 80
            : 0;
      return {
        key: key,
        safeKey: safeKey,
        priority: priority,
        index: index
      };
    }).sort(function priorityOrder(left, right) {
      return right.priority - left.priority || left.index - right.index;
    });

    keys.some(function copy(entry) {
      var key = entry.key;
      var safeKey = entry.safeKey;
      if (!safeKey) {
        return false;
      }

      var cleanValue = sanitizeModelParameterValue(source[key]);
      if (cleanValue !== undefined) {
        if (NETWORK_MODEL_FIELD_RE.test(safeKey)) {
          cleanValue = sanitizeChatGPTModel(cleanValue);
        }
        clean[safeKey] = cleanValue;
      }

      return Object.keys(clean).length >= MAX_PARAMETER_KEYS;
    });

    return clean;
  }

  function sanitizeParameterKey(key) {
    return String(key || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
  }

  function networkModelFieldPriority(key) {
    var clean = normalizeParameterKeyPart(key);
    if (clean === "model") {
      return 100;
    }
    if (clean === "api_model" || clean === "apimodel" || clean === "chatgpt_model" || clean === "chatgptmodel") {
      return 90;
    }
    if (clean === "selected_model" || clean === "selectedmodel") {
      return 80;
    }
    if (clean === "model_slug" || clean === "modelslug" || clean === "model_id" || clean === "modelid") {
      return 60;
    }
    return 0;
  }

  function canonicalNetworkParameterKey(path, key) {
    return canonicalParameterPath(path, key);
  }

  function sanitizeParameterArrayItem(item) {
    if (typeof item === "boolean") {
      return String(item);
    }

    if (typeof item === "number") {
      return Number.isFinite(item) ? String(item) : "";
    }

    return String(item || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64);
  }

  function createEmptyParameterStats() {
    return {
      total: 0,
      combinations: {},
      fields: {}
    };
  }

  function sanitizeCount(value) {
    var count = Number(value) || 0;
    if (!Number.isFinite(count) || count < 0) {
      return 0;
    }
    return Math.floor(count);
  }

  function parameterValueKey(value) {
    if (Array.isArray(value)) {
      return JSON.stringify(value).slice(0, 512);
    }

    if (typeof value === "boolean" || typeof value === "number") {
      return String(value);
    }

    return String(value || "").slice(0, 512);
  }

  function parameterCombinationKey(parameters) {
    var keys = Object.keys(parameters || {}).sort();
    return JSON.stringify(
      keys.map(function mapPair(key) {
        return [key, parameters[key]];
      })
    );
  }

  function addParameterFieldCounts(fields, parameters, count) {
    var amount = sanitizeCount(count);
    if (amount <= 0) {
      return;
    }

    Object.keys(parameters || {}).forEach(function countField(key) {
      var safeKey = sanitizeParameterKey(key);
      var valueKey = parameterValueKey(parameters[key]);
      if (!safeKey || !valueKey) {
        return;
      }

      if (!fields[safeKey]) {
        fields[safeKey] = {};
      }
      fields[safeKey][valueKey] = (sanitizeCount(fields[safeKey][valueKey]) || 0) + amount;
      trimCountMap(fields[safeKey], MAX_PARAMETER_FIELD_VALUES);
    });
  }

  function trimCountMap(counts, maxEntries) {
    var keys = Object.keys(counts || {});
    if (keys.length <= maxEntries) {
      return;
    }

    keys
      .sort(function byCountThenName(left, right) {
        var countDelta = sanitizeCount(counts[right]) - sanitizeCount(counts[left]);
        return countDelta || left.localeCompare(right);
      })
      .slice(maxEntries)
      .forEach(function removeKey(key) {
        delete counts[key];
      });
  }

  function trimParameterCombinations(combinations) {
    var keys = Object.keys(combinations || {});
    if (keys.length <= MAX_PARAMETER_COMBINATIONS_PER_MODEL) {
      return;
    }

    keys
      .sort(function byRecency(left, right) {
        var leftEntry = combinations[left] || {};
        var rightEntry = combinations[right] || {};
        return String(rightEntry.lastSubmittedAt || "").localeCompare(String(leftEntry.lastSubmittedAt || ""));
      })
      .slice(MAX_PARAMETER_COMBINATIONS_PER_MODEL)
      .forEach(function removeCombination(key) {
        delete combinations[key];
      });
  }

  function sanitizeParameterFields(fields) {
    var clean = {};
    var source = fields && typeof fields === "object" ? fields : {};

    Object.keys(source)
      .slice(0, MAX_PARAMETER_KEYS)
      .forEach(function copyField(field) {
        var safeField = canonicalModelParameterKey(field);
        var sourceCounts = source[field];
        var cleanCounts = {};
        if (!safeField || !sourceCounts || typeof sourceCounts !== "object" || Array.isArray(sourceCounts)) {
          return;
        }

        Object.keys(sourceCounts).forEach(function copyValue(valueKey) {
          var safeValueKey = String(valueKey || "").slice(0, 512);
          var count = sanitizeCount(sourceCounts[valueKey]);
          if (!safeValueKey || count <= 0) {
            return;
          }
          cleanCounts[safeValueKey] = (sanitizeCount(cleanCounts[safeValueKey]) || 0) + count;
        });

        trimCountMap(cleanCounts, MAX_PARAMETER_FIELD_VALUES);
        if (Object.keys(cleanCounts).length > 0) {
          clean[safeField] = cleanCounts;
        }
      });

    return clean;
  }

  function mergeParameterFields(target, source) {
    Object.keys(source || {}).forEach(function mergeField(field) {
      if (!target[field]) {
        target[field] = {};
      }

      Object.keys(source[field] || {}).forEach(function mergeValue(valueKey) {
        target[field][valueKey] = Math.max(sanitizeCount(target[field][valueKey]), sanitizeCount(source[field][valueKey]));
      });
      trimCountMap(target[field], MAX_PARAMETER_FIELD_VALUES);
    });
  }

  function sanitizeParameterStats(parameterStats) {
    var clean = createEmptyParameterStats();
    var source = parameterStats && typeof parameterStats === "object" ? parameterStats : {};
    var sourceCombinations = source.combinations && typeof source.combinations === "object" ? source.combinations : {};
    var combinationTotal = 0;

    Object.keys(sourceCombinations).forEach(function copyCombination(key) {
      var sourceCombination = sourceCombinations[key];
      if (!sourceCombination || typeof sourceCombination !== "object") {
        return;
      }

      var parameters = sanitizeModelParameters(sourceCombination.parameters || {}, "");
      if (Object.keys(parameters).length === 0) {
        return;
      }

      var count = sanitizeCount(sourceCombination.count);
      if (count <= 0) {
        return;
      }

      var stableKey = parameterCombinationKey(parameters);
      var existing = clean.combinations[stableKey];
      if (!existing) {
        existing = {
          count: 0,
          parameters: parameters,
          firstSubmittedAt: String(sourceCombination.firstSubmittedAt || ""),
          lastSubmittedAt: String(sourceCombination.lastSubmittedAt || "")
        };
        clean.combinations[stableKey] = existing;
      }

      existing.count += count;
      var sourceFirstSubmittedAt = String(sourceCombination.firstSubmittedAt || "");
      var sourceLastSubmittedAt = String(sourceCombination.lastSubmittedAt || "");
      if (sourceFirstSubmittedAt && (!existing.firstSubmittedAt || sourceFirstSubmittedAt < existing.firstSubmittedAt)) {
        existing.firstSubmittedAt = sourceFirstSubmittedAt;
      }
      if (sourceLastSubmittedAt > existing.lastSubmittedAt) {
        existing.lastSubmittedAt = sourceLastSubmittedAt;
      }
      combinationTotal += count;
    });

    trimParameterCombinations(clean.combinations);
    clean.fields = sanitizeParameterFields(source.fields);
    var fieldsFromCombinations = {};
    Object.keys(clean.combinations).forEach(function buildFieldFromCombination(key) {
      var combination = clean.combinations[key];
      addParameterFieldCounts(fieldsFromCombinations, combination.parameters, combination.count);
    });
    mergeParameterFields(clean.fields, fieldsFromCombinations);
    clean.total = Math.max(sanitizeCount(source.total), combinationTotal);

    return clean;
  }

  function addParameterFieldTotals(target, source) {
    Object.keys(source || {}).forEach(function mergeField(field) {
      if (!target[field]) {
        target[field] = {};
      }

      Object.keys(source[field] || {}).forEach(function mergeValue(valueKey) {
        target[field][valueKey] = sanitizeCount(target[field][valueKey]) + sanitizeCount(source[field][valueKey]);
      });
      trimCountMap(target[field], MAX_PARAMETER_FIELD_VALUES);
    });
  }

  function mergeParameterCombinations(target, source) {
    Object.keys(source || {}).forEach(function mergeCombination(key) {
      var sourceCombination = source[key];
      if (!sourceCombination || typeof sourceCombination !== "object") {
        return;
      }

      var stableKey = parameterCombinationKey(sourceCombination.parameters || {});
      if (!stableKey || sanitizeCount(sourceCombination.count) <= 0) {
        return;
      }

      var existing = target[stableKey] || {
        count: 0,
        parameters: sourceCombination.parameters,
        firstSubmittedAt: String(sourceCombination.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceCombination.lastSubmittedAt || "")
      };
      existing.count = sanitizeCount(existing.count) + sanitizeCount(sourceCombination.count);
      existing.parameters = sourceCombination.parameters;
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, sourceCombination.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, sourceCombination.lastSubmittedAt, false);
      target[stableKey] = existing;
    });
    trimParameterCombinations(target);
  }

  function normalizeParameterStatsRequestModel(parameterStats, requestModel) {
    var clean = sanitizeParameterStats(parameterStats);
    var model = sanitizeChatGPTModel(requestModel);
    if (!isChatGPTRequestRoute(model)) {
      return clean;
    }

    var normalized = createEmptyParameterStats();
    normalized.total = sanitizeCount(clean.total);
    Object.keys(clean.fields || {}).forEach(function copyField(field) {
      if (field !== "model") {
        normalized.fields[field] = Object.assign({}, clean.fields[field]);
      }
    });

    var combinationModelTotal = 0;
    Object.keys(clean.combinations || {}).forEach(function copyCombination(key) {
      var sourceCombination = clean.combinations[key];
      var parameters = Object.assign({}, sourceCombination.parameters || {}, { model: model });
      var stableKey = parameterCombinationKey(parameters);
      var existing = normalized.combinations[stableKey] || {
        count: 0,
        parameters: parameters,
        firstSubmittedAt: String(sourceCombination.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceCombination.lastSubmittedAt || "")
      };
      var count = sanitizeCount(sourceCombination.count);
      existing.count += count;
      existing.parameters = parameters;
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, sourceCombination.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, sourceCombination.lastSubmittedAt, false);
      normalized.combinations[stableKey] = existing;
      combinationModelTotal += count;
    });

    var legacyModelFieldTotal = Object.keys((clean.fields && clean.fields.model) || {}).reduce(function sum(total, valueKey) {
      return total + sanitizeCount(clean.fields.model[valueKey]);
    }, 0);
    var modelFieldTotal = Math.max(combinationModelTotal, legacyModelFieldTotal, sanitizeCount(clean.total));
    if (modelFieldTotal > 0) {
      normalized.fields.model = {};
      normalized.fields.model[model] = modelFieldTotal;
    }

    return sanitizeParameterStats(normalized);
  }

  function mergeParameterStats(targetStats, sourceStats, requestModel) {
    var target = sanitizeParameterStats(targetStats);
    var source = normalizeParameterStatsRequestModel(sourceStats, requestModel);
    var merged = createEmptyParameterStats();

    merged.total = sanitizeCount(target.total) + sanitizeCount(source.total);
    mergeParameterCombinations(merged.combinations, target.combinations);
    mergeParameterCombinations(merged.combinations, source.combinations);
    addParameterFieldTotals(merged.fields, target.fields);
    addParameterFieldTotals(merged.fields, source.fields);
    return sanitizeParameterStats(merged);
  }

  function sanitizeVariantName(value) {
    var clean = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 128);
    if (modelCatalog && typeof modelCatalog.resolveModelLabel === "function") {
      return modelCatalog.resolveModelLabel(clean) || clean;
    }
    return clean;
  }

  function createEmptyVariantStats() {
    return {
      total: 0,
      variants: {}
    };
  }

  function trimVariants(variants) {
    var keys = Object.keys(variants || {});
    if (keys.length <= MAX_VARIANTS_PER_MODEL) {
      return;
    }

    keys
      .sort(function byCountThenRecent(left, right) {
        var leftEntry = variants[left] || {};
        var rightEntry = variants[right] || {};
        var countDelta = sanitizeCount(rightEntry.count) - sanitizeCount(leftEntry.count);
        return countDelta || String(rightEntry.lastSubmittedAt || "").localeCompare(String(leftEntry.lastSubmittedAt || ""));
      })
      .slice(MAX_VARIANTS_PER_MODEL)
      .forEach(function removeVariant(key) {
        delete variants[key];
      });
  }

  function sanitizeVariantStats(variantStats) {
    var clean = createEmptyVariantStats();
    var source = variantStats && typeof variantStats === "object" ? variantStats : {};
    var variants = source.variants && typeof source.variants === "object" ? source.variants : {};
    var total = 0;

    Object.keys(variants).forEach(function copyVariant(key) {
      var sourceVariant = variants[key];
      if (!sourceVariant || typeof sourceVariant !== "object") {
        return;
      }

      var name = sanitizeVariantName(sourceVariant.name || key);
      var count = sanitizeCount(sourceVariant.count);
      if (!name || count <= 0 || isUnresolvedModelName(name)) {
        return;
      }

      clean.variants[name] = {
        name: name,
        count: (clean.variants[name] ? sanitizeCount(clean.variants[name].count) : 0) + count,
        apiModel: sanitizeApiModel(sourceVariant.apiModel),
        mode: sanitizeModelMode(sourceVariant.mode),
        firstSubmittedAt: String(sourceVariant.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceVariant.lastSubmittedAt || "")
      };
      total += count;
    });

    trimVariants(clean.variants);
    clean.total = Math.max(sanitizeCount(source.total), total);
    return clean;
  }

  function mergeVariantEntries(target, source) {
    Object.keys(source || {}).forEach(function mergeVariant(key) {
      var sourceVariant = source[key];
      if (!sourceVariant || typeof sourceVariant !== "object") {
        return;
      }

      var name = sanitizeVariantName(sourceVariant.name || key);
      var count = sanitizeCount(sourceVariant.count);
      if (!name || count <= 0 || isUnresolvedModelName(name)) {
        return;
      }

      var existing = target[name] || {
        name: name,
        count: 0,
        apiModel: "",
        mode: "",
        firstSubmittedAt: "",
        lastSubmittedAt: ""
      };
      existing.count = sanitizeCount(existing.count) + count;
      existing.apiModel = sanitizeApiModel(sourceVariant.apiModel || existing.apiModel);
      existing.mode = sanitizeModelMode(sourceVariant.mode || existing.mode);
      existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, sourceVariant.firstSubmittedAt, true);
      existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, sourceVariant.lastSubmittedAt, false);
      target[name] = existing;
    });
    trimVariants(target);
  }

  function mergeVariantStats(targetStats, sourceStats) {
    var target = sanitizeVariantStats(targetStats);
    var source = sanitizeVariantStats(sourceStats);
    var merged = createEmptyVariantStats();

    merged.total = sanitizeCount(target.total) + sanitizeCount(source.total);
    mergeVariantEntries(merged.variants, target.variants);
    mergeVariantEntries(merged.variants, source.variants);
    return sanitizeVariantStats(merged);
  }

  function updateVariantStats(stats, model, modelInfo, submittedAt) {
    var variantName = variantModelFromMetadata(modelInfo);
    if (!model || !variantName || isUnresolvedModelName(variantName)) {
      return;
    }

    if (!stats.variantsByModel) {
      stats.variantsByModel = {};
    }

    var modelStats = sanitizeVariantStats(stats.variantsByModel[model]);
    var variant = modelStats.variants[variantName] || {
      name: variantName,
      count: 0,
      apiModel: "",
      mode: "",
      firstSubmittedAt: submittedAt,
      lastSubmittedAt: ""
    };
    variant.count = sanitizeCount(variant.count) + 1;
    variant.apiModel = sanitizeApiModel(
      (modelInfo && modelInfo.responseModel) ||
      (modelInfo && modelInfo.apiModel) ||
      variant.apiModel
    );
    variant.mode = sanitizeModelMode((modelInfo && modelInfo.mode) || variant.mode);
    variant.firstSubmittedAt = variant.firstSubmittedAt || submittedAt;
    variant.lastSubmittedAt = submittedAt;
    modelStats.variants[variantName] = variant;
    modelStats.total = sanitizeCount(modelStats.total) + 1;
    trimVariants(modelStats.variants);
    stats.variantsByModel[model] = modelStats;
  }

  function variantModelFromMetadata(modelInfo) {
    return sanitizeVariantName(
      modelInfo && modelInfo.responseModel
    );
  }

  function sanitizeUsageFeatureId(value) {
    var clean = String(value || "")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/[-_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
    var versionless = clean.replace(/_v\d+$/, "");
    if (/^(gpt_image|dalle|dall_e)$/.test(clean)) return "image_generation";
    if (/^(image|images|image_generation|imagegen)$/.test(versionless)) return "image_generation";
    if (/^(deep_research|deepresearch|deep_search|deepsearch|research)$/.test(versionless)) return "deep_research";
    if (/^(agent|agent_mode|agentmode)$/.test(versionless)) return "agent_mode";
    if (/^(web_search|websearch|search)$/.test(versionless)) return "web_search";
    if (/^(realtime|real_time|realtime_mode|real_time_mode)$/.test(versionless)) return "realtime";
    if (/^(audio|audiomode|audio_mode|voice|voicemode|voice_mode|advanced_voice|input_audio|output_audio|transcription|transcribe|tts|whisper)$/.test(versionless)) return "audio";
    if (/^(canvas|canvases|canvas_mode|canvasmode)$/.test(versionless)) return "canvas";
    if (/^(file_upload|fileupload|attachment|attachments|file_attachment)$/.test(versionless)) return "file_upload";
    if (/^(code_interpreter|codeinterpreter|data_analysis|dataanalysis|python)$/.test(versionless)) return "code_interpreter";
    if (/^(connectors|connector|apps|connected_apps|connectedapps)$/.test(versionless)) return "connectors";
    if (/^(gpts|gpt_id|gptid|gizmo|gizmo_id|gizmoid|custom_gpt|customgpt)$/.test(versionless)) return "gpts";
    if (/^(tasks|scheduled_task|scheduledtask|scheduled_tasks)$/.test(versionless)) return "tasks";
    return "";
  }

  function usageFeatureName(id) {
    var clean = sanitizeUsageFeatureId(id);
    if (clean === "image_generation") return "Image generation";
    if (clean === "deep_research") return "Deep research";
    if (clean === "agent_mode") return "Agent mode";
    if (clean === "web_search") return "Web search";
    if (clean === "realtime") return "Realtime";
    if (clean === "audio") return "Audio";
    if (clean === "canvas") return "Canvas";
    if (clean === "file_upload") return "File upload";
    if (clean === "code_interpreter") return "Code interpreter";
    if (clean === "connectors") return "Connectors";
    if (clean === "gpts") return "GPTs";
    if (clean === "tasks") return "Tasks";
    return clean;
  }

  function addUsageFeature(target, feature) {
    var clean = sanitizeUsageFeatureId(feature);
    if (clean) {
      target[clean] = true;
    }
  }

  function addUsageFeatureFromModel(target, model) {
    var clean = String(model || "").toLowerCase();
    if (/^(?:dall-e|gpt-image|image)/.test(clean)) {
      addUsageFeature(target, "image_generation");
    }
    if (/deep[-_]?(research|search)|deepsearch/.test(clean)) {
      addUsageFeature(target, "deep_research");
    }
    if (/agent[-_]?mode|agentic/.test(clean)) {
      addUsageFeature(target, "agent_mode");
    }
    if (/web[-_]?search/.test(clean)) {
      addUsageFeature(target, "web_search");
    }
    if (/realtime/.test(clean)) {
      addUsageFeature(target, "realtime");
    }
    if (/audio|tts|whisper|transcribe/.test(clean)) {
      addUsageFeature(target, "audio");
    }
    if (/canvas/.test(clean)) {
      addUsageFeature(target, "canvas");
    }
  }

  function featureTextFromValue(value) {
    if (value == null) {
      return "";
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return value.slice(0, 16).map(featureTextFromValue).join(" ");
    }
    if (typeof value === "object") {
      if (isDisabledUsageFeatureSignal(value)) {
        return "";
      }
      return Object.keys(value).slice(0, 12).map(function part(key) {
        if (isDisabledUsageFeatureSignal(value[key])) {
          return "";
        }
        return key + " " + featureTextFromValue(value[key]);
      }).filter(Boolean).join(" ");
    }
    return "";
  }

  function isDisabledUsageFeatureSignal(value) {
    if (value === false || value === 0) {
      return true;
    }
    if (typeof value === "string" && /^(?:false|off|disabled|none)$/i.test(value.replace(/\s+/g, " ").trim())) {
      return true;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.enabled === false || value.disabled === true || value.excluded === true) {
        return true;
      }
    }
    return false;
  }

  function addUsageFeatureFromSignal(target, keyPath, value) {
    if (isDisabledUsageFeatureSignal(value)) {
      return;
    }
    var keyText = String(keyPath || "").toLowerCase();
    var valueText = featureTextFromValue(value).toLowerCase();
    var combined = keyText + " " + valueText;
    if (/image[_\-\s]?generation|imagegen|gpt[_\-\s]?image|dall[_\-\s]?e/.test(combined)) {
      addUsageFeature(target, "image_generation");
    }
    if (/deep[_\-\s]?(research|search)|deepsearch/.test(combined)) {
      addUsageFeature(target, "deep_research");
    }
    if (/agent[_\-\s]?mode|agentmode|agentic/.test(combined) || (/conversation[_\-\s]?mode/.test(keyText) && /\bagent\b/.test(valueText))) {
      addUsageFeature(target, "agent_mode");
    }
    if (/web[_\-\s]?search/.test(combined)) {
      addUsageFeature(target, "web_search");
    }
    if (/(^|[._\-\s])search($|[._\-\s])/.test(combined) && /(^|[._\-\s])(?:search|tools?|enabled[_\-\s]?tools)($|[._\-\s])/.test(keyText)) {
      addUsageFeature(target, "web_search");
    }
    // ChatGPT 当前真实信号(实测请求体):网页搜索=force_use_search / system_hints:["search"];
    // 深度研究=system_hints:["connector:...deep_research"];代理模式=system_hints:["agent"]。
    if (/system[_\-\s]?hints?/.test(keyText) || /force[_\-\s]?use[_\-\s]?search/.test(keyText) || /search[_\-\s]?source/.test(keyText)) {
      if (/force[_\-\s]?use[_\-\s]?search/.test(keyText) || /(^|[^a-z])search([^a-z]|$)/.test(valueText) || /web[_\-\s]?icon/.test(valueText)) {
        addUsageFeature(target, "web_search");
      }
      if (/deep[_\-\s]?research|(^|[^a-z])research([^a-z]|$)/.test(valueText)) {
        addUsageFeature(target, "deep_research");
      }
      if (/(^|[^a-z])agent([^a-z]|$)/.test(valueText)) {
        addUsageFeature(target, "agent_mode");
      }
    }
    if (/realtime|real[_\-\s]?time/.test(combined)) {
      addUsageFeature(target, "realtime");
    }
    if (/(?:^|[_\-\s])audio(?:$|[_\-\s])|input[_\-\s]?audio|output[_\-\s]?audio|audio[_\-\s]?mode|transcription|transcribe|(?:^|[_\-\s])voice(?:$|[_\-\s])|voice[_\-\s]?mode|advanced[_\-\s]?voice|(?:^|[_\-\s])tts(?:$|[_\-\s])|(?:^|[_\-\s])whisper(?:$|[_\-\s])/.test(combined)) {
      addUsageFeature(target, "audio");
    }
    if (/(^|[._\-\s])canvases($|[._\-\s])|(^|[._\-\s])canvas($|[._\-\s])/.test(combined)) {
      addUsageFeature(target, "canvas");
    }
    if (/file[_\-\s]?upload|(?:^|[._\-\s])attachments?(?:$|[._\-\s])|file[_\-\s]?attachment/.test(combined)) {
      addUsageFeature(target, "file_upload");
    }
    if (/code[_\-\s]?interpreter|(?:^|[._\-\s])python(?:$|[._\-\s])|data[_\-\s]?analysis/.test(combined)) {
      addUsageFeature(target, "code_interpreter");
    }
    if (/(?:^|[._\-\s])connectors?(?:$|[._\-\s])|connected[_\-\s]?apps?/.test(combined)) {
      addUsageFeature(target, "connectors");
    }
    if (/(?:^|[._\-\s])gpts(?:$|[._\-\s])|gizmo(?:[_\-\s]?id)?|gpt[_\-\s]?id|custom[_\-\s]?gpt/.test(combined)) {
      addUsageFeature(target, "gpts");
    }
    if (/(?:^|[._\-\s])tasks(?:$|[._\-\s])|scheduled[_\-\s]?tasks?/.test(combined)) {
      addUsageFeature(target, "tasks");
    }
  }

  function isUsageFeatureSignalRoot(part) {
    return /^(?:model|features?|enabled[-_]?features?|capabilities|enabled[-_]?capabilities|tools?|enabled[-_]?tools|conversation[-_]?mode|agent|agent[-_]?mode|agentmode|research|deep[-_]?(?:research|search)|deepresearch|deepsearch|imagegen|gpt[-_]?image|dall[-_]?e|dalle|image[-_]?generation(?:[-_]?options)?|imagegeneration(?:[-_]?options)?|web[-_]?search(?:[-_]?options)?|websearch(?:[-_]?options)?|search|input[-_]?audio|output[-_]?audio|input[-_]?audio[-_]?transcription|audio|modalities|output[-_]?modalities|input[-_]?audio[-_]?format|output[-_]?audio[-_]?format|transcription|transcribe|tts|whisper|realtime|real[-_]?time|realtime[-_]?mode|real[-_]?time[-_]?mode|audio[-_]?mode|voice[-_]?mode|voice|advanced[-_]?voice|canvas[-_]?mode|canvas|canvases|file[-_]?upload|attachments?|uploads?|code[-_]?interpreter|python|data[-_]?analysis|connectors?|connected[-_]?apps?|gpts|gizmo|gizmo[-_]?id|gpt[-_]?id|custom[-_]?gpt|tasks?|scheduled[-_]?tasks?|system[-_]?hints?|force[-_]?use[-_]?search|client[-_]?reported[-_]?search[-_]?source|search[-_]?source)$/i.test(part);
  }

  function isUsageFeatureSignalPath(parts) {
    var cleanParts = (Array.isArray(parts) ? parts : [])
      .map(normalizeParameterKeyPart)
      .filter(Boolean);
    if (!cleanParts.length) {
      return false;
    }
    if (cleanParts.length === 1 && NETWORK_MODEL_FIELD_RE.test(cleanParts[0])) {
      return false;
    }
    var root = cleanParts[0];
    if (cleanParts.some(function denied(part) {
      return isDeniedParameterPart(part);
    }) && !isUsageFeatureSignalRoot(root)) {
      return false;
    }
    return isUsageFeatureSignalRoot(root);
  }

  function collectUsageFeatures(value, target, depth, path) {
    if (depth > 6 || value == null) {
      return;
    }
    var parts = (Array.isArray(path) ? path : []).map(normalizeParameterKeyPart).filter(Boolean);
    if (isUsageFeatureSignalPath(parts) && isDisabledUsageFeatureSignal(value)) {
      return;
    }
    if (parts.some(isDeniedParameterPart) && !isUsageFeatureSignalRoot(parts[0])) {
      return;
    }
    if (typeof value === "string") {
      if (isUsageFeatureSignalPath(parts)) {
        addUsageFeatureFromSignal(target, parts.join("."), value);
      }
      try {
        collectUsageFeatures(JSON.parse(value), target, depth + 1, parts);
      } catch (_) {
        return;
      }
      return;
    }
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach(function scanArray(item) {
        if (isDisabledUsageFeatureSignal(item) && isUsageFeatureSignalPath(parts)) {
          return;
        }
        collectUsageFeatures(item, target, depth + 1, parts);
      });
      return;
    }
    if (typeof value !== "object") {
      if (isUsageFeatureSignalPath(parts)) {
        addUsageFeatureFromSignal(target, parts.join("."), value);
      }
      return;
    }
    Object.keys(value).slice(0, 160).forEach(function scanKey(key) {
      var item = value[key];
      var nextPath = parts.concat(normalizeParameterKeyPart(key));
      if (isUsageFeatureSignalPath(nextPath)) {
        addUsageFeatureFromSignal(target, nextPath.join("."), item);
      }
      if (isDisabledUsageFeatureSignal(item) && isUsageFeatureSignalPath(nextPath)) {
        return;
      }
      if (key === "metadata" && item && typeof item === "object" && Array.isArray(item.features)) {
        item.features.slice(0, 32).forEach(function scanMetadataFeature(feature) {
          addUsageFeature(target, feature);
        });
        return;
      }
      if (item && typeof item === "object" && !NETWORK_SKIP_FIELD_RE.test(key)) {
        collectUsageFeatures(item, target, depth + 1, nextPath);
      }
    });
  }

  // 正则兜底:ChatGPT 的对话请求体很大,chrome.webRequest 常按多块(raw[])给出,逐块 JSON.parse
  // 会失败,导致功能信号丢失(模型字段靠正则提取所以没事)。这里直接对原始文本识别结构化功能信号
  // (只匹配 ChatGPT 自己的字段名,不碰用户消息正文 parts)。
  function collectUsageFeaturesFromRawText(clean, target) {
    if (/"force_use_search"\s*:\s*true/i.test(clean) || /"client_reported_search_source"\s*:\s*"[^"]*(?:web|search)/i.test(clean)) {
      addUsageFeature(target, "web_search");
    }
    var hintsMatches = clean.match(/"system_hints"\s*:\s*\[([^\]]*)\]/gi) || [];
    hintsMatches.forEach(function scanHints(block) {
      if (/"search"/i.test(block)) { addUsageFeature(target, "web_search"); }
      if (/deep[_-]?research|"research"|deep_?search/i.test(block)) { addUsageFeature(target, "deep_research"); }
      if (/"agent"/i.test(block)) { addUsageFeature(target, "agent_mode"); }
    });
  }

  function collectUsageFeaturesFromText(text, target) {
    var clean = String(text || "").trim();
    if (!clean || !/(image|imagegen|gpt[_-]?image|dall|dall[_-]?e|deep.?research|deep.?search|deepsearch|agent|web.?search|\bsearch\b|force[_-]?use[_-]?search|system[_-]?hints?|search[_-]?source|realtime|real.?time|audio|input[_-]?audio|output[_-]?audio|voice|advanced[_-]?voice|transcription|tts|whisper|conversation_mode|canvas|canvases|file.?upload|attachments?|code.?interpreter|data.?analysis|python|connectors?|connected.?apps?|gpts?|gizmo|tasks?)/i.test(clean)) {
      return;
    }
    collectUsageFeaturesFromRawText(clean, target);
    try {
      collectUsageFeatures(JSON.parse(clean), target, 0, []);
      return;
    } catch (_) {
      // Continue with URL/form encoded feature fields.
    }

    if (typeof URLSearchParams !== "undefined" && /(?:^|[?&])[^=]+=/i.test(clean)) {
      try {
        var query = clean.indexOf("?") >= 0 ? clean.slice(clean.indexOf("?") + 1) : clean;
        var params = new URLSearchParams(query);
        params.forEach(function collectFeatureParam(value, key) {
          collectUsageFeatures(value, target, 0, [key]);
        });
      } catch (_) {
        return;
      }
    }
  }

  function normalizeUsageFeatures(features, parameters, model) {
    var result = {};
    (Array.isArray(features) ? features : []).forEach(function copy(feature) {
      addUsageFeature(result, feature);
    });
    Object.keys(parameters || {}).forEach(function inspectParameter(key) {
      if (key !== "model" && isUsageFeatureSignalPath(String(key || "").split(/[.]/))) {
        addUsageFeatureFromSignal(result, key, parameters[key]);
      }
    });
    return Object.keys(result).sort();
  }

  function normalizeUsageFeaturesForPage(features, parameters, model, pageUrl) {
    return normalizeUsageFeatures(features, parameters, model).filter(function removeProjectContainerFeature(feature) {
      return feature !== "gpts" || !isProjectConversationUrl(pageUrl);
    });
  }

  function createEmptyFeatureStats() {
    return {
      total: 0,
      features: {}
    };
  }

  function sanitizeFeatureStats(featureStats) {
    var clean = createEmptyFeatureStats();
    var source = featureStats && typeof featureStats === "object" ? featureStats : {};
    var features = source.features && typeof source.features === "object" ? source.features : {};
    var total = 0;
    Object.keys(features).forEach(function copyFeature(key) {
      var id = sanitizeUsageFeatureId(key);
      var sourceFeature = features[key] && typeof features[key] === "object" ? features[key] : {};
      var count = sanitizeCount(sourceFeature.count || features[key]);
      if (!id || count <= 0) {
        return;
      }
      clean.features[id] = {
        id: id,
        name: usageFeatureName(id),
        count: (clean.features[id] ? sanitizeCount(clean.features[id].count) : 0) + count,
        firstSubmittedAt: String(sourceFeature.firstSubmittedAt || ""),
        lastSubmittedAt: String(sourceFeature.lastSubmittedAt || "")
      };
      total += count;
    });
    clean.total = Math.max(sanitizeCount(source.total), total);
    return clean;
  }

  function mergeFeatureStats(targetStats, sourceStats) {
    var target = sanitizeFeatureStats(targetStats);
    var source = sanitizeFeatureStats(sourceStats);
    var merged = createEmptyFeatureStats();
    [target, source].forEach(function merge(stats) {
      merged.total += sanitizeCount(stats.total);
      Object.keys(stats.features || {}).forEach(function mergeFeature(id) {
        var feature = stats.features[id];
        var existing = merged.features[id] || {
          id: id,
          count: 0,
          firstSubmittedAt: "",
          lastSubmittedAt: ""
        };
        existing.count += sanitizeCount(feature.count);
        existing.firstSubmittedAt = mergeTimestamp(existing.firstSubmittedAt, feature.firstSubmittedAt, true);
        existing.lastSubmittedAt = mergeTimestamp(existing.lastSubmittedAt, feature.lastSubmittedAt, false);
        merged.features[id] = existing;
      });
    });
    return sanitizeFeatureStats(merged);
  }

  function updateFeatureStats(stats, model, features, submittedAt) {
    var cleanFeatures = normalizeUsageFeatures(features || [], {}, model);
    if (!model || cleanFeatures.length === 0) {
      return;
    }
    if (!stats.featuresByModel) {
      stats.featuresByModel = {};
    }
    var modelStats = sanitizeFeatureStats(stats.featuresByModel[model]);
    cleanFeatures.forEach(function updateFeature(id) {
      var feature = modelStats.features[id] || {
        id: id,
        name: usageFeatureName(id),
        count: 0,
        firstSubmittedAt: submittedAt,
        lastSubmittedAt: ""
      };
      feature.name = usageFeatureName(id);
      feature.count = sanitizeCount(feature.count) + 1;
      feature.firstSubmittedAt = feature.firstSubmittedAt || submittedAt;
      feature.lastSubmittedAt = submittedAt;
      modelStats.features[id] = feature;
      modelStats.total = sanitizeCount(modelStats.total) + 1;
    });
    stats.featuresByModel[model] = sanitizeFeatureStats(modelStats);
  }

  function updateParameterStats(stats, model, parameters, submittedAt) {
    var cleanParameters = sanitizeModelParameters(parameters || {}, "");
    if (Object.keys(cleanParameters).length === 0) {
      return;
    }

    if (!stats.parametersByModel) {
      stats.parametersByModel = {};
    }

    var modelStats = sanitizeParameterStats(stats.parametersByModel[model]);
    var combinationKey = parameterCombinationKey(cleanParameters);
    var combination = modelStats.combinations[combinationKey] || {
      count: 0,
      parameters: cleanParameters,
      firstSubmittedAt: submittedAt,
      lastSubmittedAt: ""
    };

    combination.count = sanitizeCount(combination.count) + 1;
    combination.parameters = cleanParameters;
    combination.firstSubmittedAt = combination.firstSubmittedAt || submittedAt;
    combination.lastSubmittedAt = submittedAt;
    modelStats.combinations[combinationKey] = combination;
    modelStats.total = sanitizeCount(modelStats.total) + 1;
    addParameterFieldCounts(modelStats.fields, cleanParameters, 1);
    trimParameterCombinations(modelStats.combinations);
    stats.parametersByModel[model] = modelStats;
  }

  function decrementCountEntry(counts, key, amount) {
    if (!counts || !key) {
      return;
    }
    var next = sanitizeCount(counts[key]) - sanitizeCount(amount || 1);
    if (next > 0) {
      counts[key] = next;
    } else {
      delete counts[key];
    }
  }

  function removeKnownProjectGptsContributions(stats, events, sourceModels) {
    (Array.isArray(events) ? events : []).forEach(function removeKnownFalsePositive(event) {
      if (
        !event ||
        !isProjectConversationUrl(event.pageUrl) ||
        normalizeUsageFeatures(event.usageFeatures, event.modelParameters, event.model).indexOf("gpts") < 0
      ) {
        return;
      }

      var metadata = Object.assign({}, sourceModels && sourceModels[event.model] || {}, event);
      var model = canonicalStoredModelName(event.model, metadata);
      if (!model) {
        return;
      }

      var featureStats = stats.featuresByModel && stats.featuresByModel[model];
      if (featureStats) {
        featureStats = sanitizeFeatureStats(featureStats);
        if (featureStats.features.gpts) {
          featureStats.features.gpts.count = Math.max(
            0,
            sanitizeCount(featureStats.features.gpts.count) - 1
          );
          featureStats.total = Math.max(0, sanitizeCount(featureStats.total) - 1);
          if (!featureStats.features.gpts.count) {
            delete featureStats.features.gpts;
          }
        }
        if (featureStats.total > 0 || Object.keys(featureStats.features).length) {
          stats.featuresByModel[model] = featureStats;
        } else {
          delete stats.featuresByModel[model];
        }
      }

      var requestModel = exactRequestModelFromMetadata(event);
      var responseModel = exactResponseModelFromMetadata(event);
      var relations = stats.relationsByModel && sanitizeModelRelationStats(stats.relationsByModel[model]);
      var relation = relations && relations[relationKey(requestModel, responseModel)];
      if (relation && relation.features.gpts) {
        decrementCountEntry(relation.features, "gpts", 1);
        stats.relationsByModel[model] = relations;
      }
    });
  }

  function removeVariantContribution(stats, model, event) {
    var modelStats = stats.variantsByModel && stats.variantsByModel[model];
    var variantName = variantModelFromMetadata({
      responseModel: event && event.responseModel,
      requestModel: event && event.requestModel,
      parameters: event && event.modelParameters,
      chatgptModel: event && event.chatgptModel,
      apiModel: event && event.apiModel
    });
    if (!modelStats || !variantName) {
      return;
    }
    modelStats = sanitizeVariantStats(modelStats);
    var variant = modelStats.variants[variantName];
    if (variant) {
      variant.count = sanitizeCount(variant.count) - 1;
      if (variant.count > 0) {
        modelStats.variants[variantName] = variant;
      } else {
        delete modelStats.variants[variantName];
      }
    }
    modelStats.total = Math.max(0, sanitizeCount(modelStats.total) - 1);
    if (modelStats.total > 0 || Object.keys(modelStats.variants).length > 0) {
      stats.variantsByModel[model] = modelStats;
    } else {
      delete stats.variantsByModel[model];
    }
  }

  function removeParameterContribution(stats, model, event) {
    var modelStats = stats.parametersByModel && stats.parametersByModel[model];
    var parameters = sanitizeModelParameters(event && event.modelParameters, "");
    if (!modelStats || !Object.keys(parameters).length) {
      return;
    }
    modelStats = sanitizeParameterStats(modelStats);
    var combinationKey = parameterCombinationKey(parameters);
    var combination = modelStats.combinations[combinationKey];
    if (combination) {
      combination.count = sanitizeCount(combination.count) - 1;
      if (combination.count > 0) {
        modelStats.combinations[combinationKey] = combination;
      } else {
        delete modelStats.combinations[combinationKey];
      }
    }
    Object.keys(parameters).forEach(function decrementField(key) {
      var safeKey = sanitizeParameterKey(key);
      var valueKey = parameterValueKey(parameters[key]);
      if (!safeKey || !valueKey || !modelStats.fields[safeKey]) {
        return;
      }
      decrementCountEntry(modelStats.fields[safeKey], valueKey, 1);
      if (!Object.keys(modelStats.fields[safeKey]).length) {
        delete modelStats.fields[safeKey];
      }
    });
    modelStats.total = Math.max(0, sanitizeCount(modelStats.total) - 1);
    if (modelStats.total > 0 || Object.keys(modelStats.combinations).length > 0 || Object.keys(modelStats.fields).length > 0) {
      stats.parametersByModel[model] = modelStats;
    } else {
      delete stats.parametersByModel[model];
    }
  }

  function removeFeatureContribution(stats, model, event) {
    var modelStats = stats.featuresByModel && stats.featuresByModel[model];
    var features = normalizeUsageFeaturesForPage(
      event && event.usageFeatures,
      event && event.modelParameters,
      model,
      event && event.pageUrl
    );
    if (!modelStats || !features.length) {
      return;
    }
    modelStats = sanitizeFeatureStats(modelStats);
    features.forEach(function decrementFeature(id) {
      var feature = modelStats.features[id];
      if (!feature) {
        return;
      }
      feature.count = sanitizeCount(feature.count) - 1;
      if (feature.count > 0) {
        modelStats.features[id] = feature;
      } else {
        delete modelStats.features[id];
      }
      modelStats.total = Math.max(0, sanitizeCount(modelStats.total) - 1);
    });
    if (modelStats.total > 0 || Object.keys(modelStats.features).length > 0) {
      stats.featuresByModel[model] = modelStats;
    } else {
      delete stats.featuresByModel[model];
    }
  }

  function removeSessionContribution(stats, model, event) {
    var conversationId = String((event && event.conversationId) || extractConversationId(event && event.pageUrl)).slice(0, 128);
    var sessions = stats.sessionsByModel && stats.sessionsByModel[model];
    var session = sessions && sessions[conversationId];
    if (!session) {
      return;
    }
    session = sanitizeSession(session, conversationId);
    session.count = Math.max(0, sanitizeCount(session.count) - 1);
    decrementCountEntry(session.models, model, 1);
    if (session.count > 0) {
      sessions[conversationId] = session;
    } else {
      delete sessions[conversationId];
    }
    if (!Object.keys(sessions).length) {
      delete stats.sessionsByModel[model];
    }
  }

  function removeUsageEventContribution(stats, event, skipAnalytics) {
    var model = sanitizePublicModelName(event && event.model);
    var dateKey = eventDateKey(event);
    if (!model || !dateKey) {
      return false;
    }
    decrementCountEntry(stats.totals, model, 1);
    if (stats.byDate[dateKey]) {
      decrementCountEntry(stats.byDate[dateKey], model, 1);
      if (!Object.keys(stats.byDate[dateKey]).length) {
        delete stats.byDate[dateKey];
      }
    }
    removeVariantContribution(stats, model, event);
    removeParameterContribution(stats, model, event);
    removeFeatureContribution(stats, model, event);
    removeSessionContribution(stats, model, event);
    removeRelationContribution(stats, model, event);
    var analyticsRemoved = skipAnalytics ? false : removeAnalyticsContribution(stats, model, event);
    if (!sanitizeCount(stats.totals[model])) {
      delete stats.models[model];
    }
    return analyticsRemoved;
  }

  function addUsageEventContribution(stats, event, modelInfo, skipAnalytics) {
    var model = modelInfo && modelInfo.label;
    if (!model) {
      return;
    }
    var submittedAt = String((event && event.submittedAt) || new Date().toISOString());
    var dateKey = eventDateKey(event);
    if (!dateKey) return;
    if (!stats.byDate[dateKey]) {
      stats.byDate[dateKey] = {};
    }
    stats.totals[model] = (sanitizeCount(stats.totals[model]) || 0) + 1;
    stats.byDate[dateKey][model] = (sanitizeCount(stats.byDate[dateKey][model]) || 0) + 1;
    stats.models[model] = modelInfo;
    updateVariantStats(stats, model, modelInfo, submittedAt);
    updateParameterStats(stats, model, modelInfo.parameters, submittedAt);
    updateFeatureStats(
      stats,
      model,
      normalizeUsageFeaturesForPage(
        event && event.usageFeatures,
        event && event.modelParameters,
        model,
        event && event.pageUrl
      ),
      submittedAt
    );
    updateSessionIndex(stats, model, String((event && event.conversationId) || extractConversationId(event && event.pageUrl)).slice(0, 128), {
      pageTitle: sanitizeTitle(event && event.pageTitle),
      pageUrl: String((event && event.pageUrl) || "").slice(0, 500),
      submittedAt: submittedAt
    });
    updateRelationStats(stats, model, event);
    if (!skipAnalytics) updateAnalyticsContribution(stats, model, event);
  }

  function addNetworkParameter(parameters, key, value, priority) {
    var safeKey = sanitizeParameterKey(key);
    if (!safeKey) {
      return;
    }

    var isModelField = NETWORK_MODEL_FIELD_RE.test(safeKey);
    var parameterValue = isModelField && Array.isArray(value) ? value[0] : value;
    var canonicalKey = canonicalNetworkParameterKey([], safeKey) || safeKey;
    var clean = sanitizeModelParameters({ [canonicalKey]: parameterValue }, "");
    if (Object.prototype.hasOwnProperty.call(clean, canonicalKey)) {
      if (isModelField) {
        if (!isChatGPTRequestRoute(clean[canonicalKey]) && !CONVERSATION_MODE_MODELS[clean[canonicalKey]]) {
          return;
        }
        var currentPriority = Number(parameters.__modelFieldPriority || 0);
        var nextPriority = Number(priority || 1);
        if (currentPriority <= nextPriority) {
          Object.defineProperty(parameters, "__modelFieldPriority", {
            value: nextPriority,
            writable: true,
            configurable: true
          });
          parameters.model = clean[canonicalKey];
        }
      }
      parameters[canonicalKey] = clean[canonicalKey];
    }
  }

  function collectNetworkParameters(value, parameters, depth, path) {
    if (depth > 8 || value == null) {
      return;
    }

    if (typeof value === "string") {
      collectNetworkParametersFromText(value, parameters);
      return;
    }

    if (Array.isArray(value)) {
      value.slice(0, 80).forEach(function collectArrayItem(item) {
        collectNetworkParameters(item, parameters, depth + 1, path);
      });
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    Object.keys(value).slice(0, 160).forEach(function collectKey(key) {
      var item = value[key];
      var parameterKey = canonicalNetworkParameterKey(path, key);
      if (parameterKey) {
        addNetworkParameter(parameters, parameterKey, item, networkModelFieldPriority(key));
      }
      if (item && typeof item === "object" && !NETWORK_SKIP_FIELD_RE.test(key)) {
        collectNetworkParameters(item, parameters, depth + 1, path.concat(key));
      }
    });
  }

  function collectNetworkParametersFromText(text, parameters) {
    var clean = String(text || "").trim();
    if (!clean || !/(model|gpt|chat-latest|o\d+|reasoning|verbosity|temperature|top_p|max_tokens|tool_choice|response_format)/i.test(clean)) {
      return;
    }

    try {
      collectNetworkParameters(JSON.parse(clean), parameters, 0, []);
      return;
    } catch (_) {
      // Continue with URL/form encoded parsing.
    }

    if (typeof URLSearchParams !== "undefined" && /(?:^|[?&])[^=]+=/i.test(clean)) {
      try {
        var query = clean.indexOf("?") >= 0 ? clean.slice(clean.indexOf("?") + 1) : clean;
        var params = new URLSearchParams(query);
        params.forEach(function collectParam(value, key) {
          addNetworkParameter(parameters, canonicalNetworkParameterKey([], key), value, networkModelFieldPriority(key));
        });
      } catch (_) {
        return;
      }
    }
  }

  function requestIdentityFromValue(value) {
    var identity = {
      conversationId: "",
      requestMessageId: ""
    };
    var source = value;
    if (typeof source === "string") {
      try {
        source = JSON.parse(source);
      } catch (_) {
        return identity;
      }
    }
    if (!source || typeof source !== "object") {
      return identity;
    }

    identity.conversationId = sanitizeConversationId(
      source.conversation_id || source.conversationId
    );
    var messages = Array.isArray(source.messages)
      ? source.messages
      : source.message && typeof source.message === "object"
        ? [source.message]
        : [];
    messages.slice(0, 80).forEach(function findSubmittedUserMessage(message) {
      if (!message || typeof message !== "object") {
        return;
      }
      var role = String(
        message.role ||
        (message.author && message.author.role) ||
        ""
      ).toLowerCase();
      if (role !== "user") {
        return;
      }
      var id = sanitizeMessageId(
        message.id ||
        message.message_id ||
        message.messageId
      );
      if (id) {
        identity.requestMessageId = id;
      }
    });
    return identity;
  }

  function mergeRequestIdentity(target, source) {
    var identity = target || { conversationId: "", requestMessageId: "" };
    var next = source || {};
    if (!identity.conversationId && next.conversationId) {
      identity.conversationId = sanitizeConversationId(next.conversationId);
    }
    if (next.requestMessageId) {
      identity.requestMessageId = sanitizeMessageId(next.requestMessageId);
    }
    return identity;
  }

  function sanitizeRequestReasoningEffort(value) {
    if (Array.isArray(value)) {
      value = value[0];
    }
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 32);
  }

  function requestReasoningEffortFromValue(value) {
    var source = value;
    if (typeof source === "string") {
      var text = source.trim();
      if (!text) {
        return "";
      }
      try {
        source = JSON.parse(text);
      } catch (_) {
        if (typeof URLSearchParams !== "undefined" && /(?:^|[?&])[^=]+=/i.test(text)) {
          try {
            var query = text.indexOf("?") >= 0 ? text.slice(text.indexOf("?") + 1) : text;
            var params = new URLSearchParams(query);
            return sanitizeRequestReasoningEffort(
              params.get("reasoning_effort") ||
              params.get("thinking_effort") ||
              params.get("reasoning.effort")
            );
          } catch (_) {
            return "";
          }
        }
        return "";
      }
    }
    if (!source || typeof source !== "object") {
      return "";
    }
    return sanitizeRequestReasoningEffort(
      source.reasoning_effort ||
      source.thinking_effort ||
      source["reasoning.effort"] ||
      (source.reasoning && source.reasoning.effort) ||
      (source.thinking && source.thinking.effort)
    );
  }

  function bytesToText(bytes) {
    if (!bytes) {
      return "";
    }

    try {
      if (typeof TextDecoder === "function") {
        return new TextDecoder("utf-8").decode(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
      }
    } catch (_) {
      return "";
    }

    if (typeof Buffer === "function") {
      try {
        return Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString("utf8");
      } catch (_) {
        return "";
      }
    }

    return "";
  }

  function sourceModeFromExplicitValue(value, depth) {
    if (depth > 4 || value == null) {
      return "unknown";
    }
    if (typeof value === "string") {
      var direct = normalizeSourceMode(value);
      if (direct !== "unknown") {
        return direct;
      }
      try {
        return sourceModeFromExplicitValue(JSON.parse(value), depth + 1);
      } catch (_) {
        return "unknown";
      }
    }
    if (Array.isArray(value)) {
      for (var arrayIndex = 0; arrayIndex < Math.min(16, value.length); arrayIndex += 1) {
        var arrayMode = sourceModeFromExplicitValue(value[arrayIndex], depth + 1);
        if (arrayMode !== "unknown") {
          return arrayMode;
        }
      }
      return "unknown";
    }
    if (typeof value !== "object") {
      return "unknown";
    }
    var keys = Object.keys(value).slice(0, 48);
    for (var index = 0; index < keys.length; index += 1) {
      var key = normalizeParameterKeyPart(keys[index]);
      if (!/^(?:conversation_mode|source_mode|product_mode|workspace_mode|kind|type|mode)$/.test(key)) {
        continue;
      }
      var mode = sourceModeFromExplicitValue(value[keys[index]], depth + 1);
      if (mode !== "unknown") {
        return mode;
      }
    }
    return "unknown";
  }

  function collectSourceModeFromValue(value) {
    if (!value || typeof value !== "object") {
      return "unknown";
    }
    var keys = Object.keys(value).slice(0, 160);
    for (var index = 0; index < keys.length; index += 1) {
      var key = normalizeParameterKeyPart(keys[index]);
      if (!/^(?:conversation_mode|source_mode|product_mode|workspace_mode)$/.test(key)) {
        continue;
      }
      var mode = sourceModeFromExplicitValue(value[keys[index]], 0);
      if (mode !== "unknown") {
        return mode;
      }
    }
    return "unknown";
  }

  function collectSourceModeFromText(text) {
    var clean = String(text || "").trim();
    if (!clean || !/(conversation_mode|source_mode|product_mode|workspace_mode)/i.test(clean)) {
      return "unknown";
    }
    try {
      return collectSourceModeFromValue(JSON.parse(clean));
    } catch (_) {
      // Continue with URL/form encoded parsing.
    }
    if (typeof URLSearchParams !== "undefined" && /(?:^|[?&])[^=]+=/i.test(clean)) {
      try {
        var query = clean.indexOf("?") >= 0 ? clean.slice(clean.indexOf("?") + 1) : clean;
        var params = new URLSearchParams(query);
        var found = "unknown";
        params.forEach(function inspect(value, key) {
          if (found !== "unknown" || !/^(?:conversation_mode|source_mode|product_mode|workspace_mode)$/i.test(key)) {
            return;
          }
          found = sourceModeFromExplicitValue(value, 0);
        });
        return found;
      } catch (_) {
        return "unknown";
      }
    }
    return "unknown";
  }

  function parseNetworkRequestBody(requestBody) {
    var parameters = {};
    var usageFeatures = {};
    var sourceMode = "unknown";
    var requestIdentity = {
      conversationId: "",
      requestMessageId: ""
    };
    var requestReasoningEffort = "";
    if (!requestBody || typeof requestBody !== "object") {
      return parameters;
    }

    var formData = requestBody.formData && typeof requestBody.formData === "object" ? requestBody.formData : {};
    requestIdentity = mergeRequestIdentity(requestIdentity, requestIdentityFromValue(formData));
    requestReasoningEffort = requestReasoningEffortFromValue(formData);
    collectUsageFeatures(formData, usageFeatures, 0, []);
    sourceMode = collectSourceModeFromValue(formData);
    Object.keys(formData).forEach(function collectFormField(key) {
      addNetworkParameter(parameters, canonicalNetworkParameterKey([], key), formData[key], networkModelFieldPriority(key));
    });

    if (Array.isArray(requestBody.raw)) {
      // chrome.webRequest 对大请求体常分多块(raw[])给出。必须先拼接成完整文本再扫描,
      // 否则信号(如 force_use_search)被拆到不同块里、且逐块 JSON.parse 会失败 → 功能丢失。
      var fullText = requestBody.raw.map(function fromRaw(raw) { return bytesToText(raw && raw.bytes) || ""; }).join("");
      if (fullText) {
        requestIdentity = mergeRequestIdentity(requestIdentity, requestIdentityFromValue(fullText));
        requestReasoningEffort =
          requestReasoningEffortFromValue(fullText) ||
          requestReasoningEffort;
        collectNetworkParametersFromText(fullText, parameters);
        collectUsageFeaturesFromText(fullText, usageFeatures);
        if (sourceMode === "unknown") {
          sourceMode = collectSourceModeFromText(fullText);
        }
      }
    }

    if (!parameters["reasoning.effort"] && requestReasoningEffort) {
      parameters["reasoning.effort"] = requestReasoningEffort;
    }
    delete parameters.__modelFieldPriority;
    Object.defineProperty(parameters, "__usageFeatures", {
      value: Object.keys(usageFeatures).sort(),
      configurable: true
    });
    Object.defineProperty(parameters, "__sourceMode", {
      value: sourceMode,
      configurable: true
    });
    Object.defineProperty(parameters, "__conversationId", {
      value: requestIdentity.conversationId,
      configurable: true
    });
    Object.defineProperty(parameters, "__requestMessageId", {
      value: requestIdentity.requestMessageId,
      configurable: true
    });
    return parameters;
  }

  function parseNetworkRequestDetails(details) {
    var parameters = parseNetworkRequestBody(details && details.requestBody);
    var usageFeatures = {};
    if (parameters && Array.isArray(parameters.__usageFeatures)) {
      parameters.__usageFeatures.forEach(function rememberFeature(feature) {
        usageFeatures[feature] = true;
      });
    }

    collectNetworkParametersFromText(details && details.url, parameters);
    collectUsageFeaturesFromText(details && details.url, usageFeatures);
    var sourceMode = normalizeSourceMode(parameters && parameters.__sourceMode);
    if (sourceMode === "unknown") {
      sourceMode = collectSourceModeFromText(details && details.url);
    }

    delete parameters.__usageFeatures;
    Object.defineProperty(parameters, "__usageFeatures", {
      value: Object.keys(usageFeatures).sort(),
      configurable: true
    });
    Object.defineProperty(parameters, "__sourceMode", {
      value: sourceMode,
      configurable: true
    });
    delete parameters.__modelFieldPriority;
    return parameters;
  }

  function observationFromNetworkParameters(parameters, observedAt) {
    var cleanParameters = sanitizeModelParameters(parameters, "");
    var requestModel = sanitizeChatGPTModel(cleanParameters.model);
    var conversationMode = CONVERSATION_MODE_MODELS && CONVERSATION_MODE_MODELS[requestModel];
    if (!isChatGPTRequestRoute(requestModel) && !conversationMode) {
      return null;
    }

    var resolved = null;
    if (modelCatalog && typeof modelCatalog.resolveRequestModelInfo === "function") {
      resolved = modelCatalog.resolveRequestModelInfo(requestModel);
    } else if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      resolved = modelCatalog.resolveModelInfo(requestModel);
    }

    return {
      observedAt: observedAt || Date.now(),
      source: "webRequest",
      model: requestModel,
      requestModel: requestModel,
      apiModel: requestModel,
      chatgptModel: requestModel,
      modelMode: (resolved && resolved.mode) || "",
      sourceMode: normalizeSourceMode(parameters && parameters.__sourceMode),
      conversationId: sanitizeConversationId(parameters && parameters.__conversationId),
      requestMessageId: sanitizeMessageId(parameters && parameters.__requestMessageId),
      usageFeatures: normalizeUsageFeatures([].concat(
        parameters && parameters.__usageFeatures || [],
        conversationMode ? [conversationMode.feature] : []
      ), cleanParameters, requestModel),
      modelParameters: cleanParameters
    };
  }

  function observeNetworkRequest(details, nowDate) {
    if (!details || typeof details.tabId !== "number" || details.tabId < 0) {
      return null;
    }
    var method = String(details.method || "").toUpperCase();
    if (method && !/^(POST|PUT|PATCH)$/.test(method)) {
      return null;
    }
    if (!isConversationSubmissionUrl(details.url)) {
      return null;
    }

    var observedAt = nowDate instanceof Date ? nowDate.getTime() : Date.now();
    var observation = observationFromNetworkParameters(parseNetworkRequestDetails(details), observedAt);
    if (!observation) {
      return null;
    }

    var observations = Array.isArray(recentNetworkObservationsByTab[details.tabId])
      ? recentNetworkObservationsByTab[details.tabId]
      : [];
    observations = observations.filter(function keepRecent(item) {
      return observedAt - Number(item && item.observedAt || 0) <= NETWORK_OBSERVATION_WINDOW_MS;
    });
    observations.push(observation);
    if (observations.length > MAX_NETWORK_OBSERVATIONS_PER_TAB) {
      observations = observations.slice(observations.length - MAX_NETWORK_OBSERVATIONS_PER_TAB);
    }
    recentNetworkObservationsByTab[details.tabId] = observations;
    return observation;
  }

  function mergeRecentNetworkObservation(payload, sender, nowDate) {
    var tabId = sender && sender.tab && typeof sender.tab.id === "number" ? sender.tab.id : -1;
    if (tabId < 0) {
      return payload || {};
    }

    var observations = Array.isArray(recentNetworkObservationsByTab[tabId])
      ? recentNetworkObservationsByTab[tabId]
      : [];
    if (!observations.length) {
      return payload || {};
    }

    var nowMs = nowDate instanceof Date ? nowDate.getTime() : Date.now();
    var submittedMs = new Date(payload && payload.submittedAt || "").getTime();
    if (Number.isNaN(submittedMs)) {
      submittedMs = nowMs;
    }
    var messageDomSubmission = String(payload && payload.source || "") === "message-dom";
    var earlyWindow = messageDomSubmission ? NETWORK_MESSAGE_DOM_EARLY_MS : NETWORK_MATCH_EARLY_MS;
    observations = observations.filter(function keepCandidate(item) {
      var observedAt = Number(item && item.observedAt || 0);
      return observedAt > 0 &&
        nowMs - observedAt <= NETWORK_OBSERVATION_WINDOW_MS &&
        observedAt >= submittedMs - earlyWindow;
    });
    if (!observations.length) {
      delete recentNetworkObservationsByTab[tabId];
      return payload || {};
    }

    var observationIndex = -1;
    var payloadRequestMessageId = sanitizeMessageId(payload && payload.requestMessageId);
    function hasConflictingRequestMessageId(item) {
      var observedRequestMessageId = sanitizeMessageId(item && item.requestMessageId);
      return Boolean(
        payloadRequestMessageId &&
        observedRequestMessageId &&
        observedRequestMessageId !== payloadRequestMessageId
      );
    }
    if (payloadRequestMessageId) {
      for (var exactMessageIndex = 0; exactMessageIndex < observations.length; exactMessageIndex += 1) {
        if (
          sanitizeMessageId(observations[exactMessageIndex] && observations[exactMessageIndex].requestMessageId) ===
          payloadRequestMessageId
        ) {
          observationIndex = exactMessageIndex;
          break;
        }
      }
    }
    if (observationIndex < 0 && messageDomSubmission) {
      for (var messageIndex = observations.length - 1; messageIndex >= 0; messageIndex -= 1) {
        if (hasConflictingRequestMessageId(observations[messageIndex])) {
          continue;
        }
        var messageObservedAt = Number(observations[messageIndex].observedAt || 0);
        if (messageObservedAt <= submittedMs && messageObservedAt >= submittedMs - earlyWindow) {
          observationIndex = messageIndex;
          break;
        }
      }
    } else if (observationIndex < 0) {
      for (var i = 0; i < observations.length; i += 1) {
        if (hasConflictingRequestMessageId(observations[i])) {
          continue;
        }
        var observedAt = Number(observations[i].observedAt || 0);
        if (observedAt >= submittedMs && observedAt <= submittedMs + NETWORK_MATCH_LATE_MS) {
          observationIndex = i;
          break;
        }
      }
    }
    if (observationIndex < 0) {
      if (messageDomSubmission) {
        for (var afterIndex = 0; afterIndex < observations.length; afterIndex += 1) {
          if (hasConflictingRequestMessageId(observations[afterIndex])) {
            continue;
          }
          var afterTime = Number(observations[afterIndex].observedAt || 0);
          if (afterTime >= submittedMs && afterTime <= submittedMs + NETWORK_MATCH_LATE_MS) {
            observationIndex = afterIndex;
            break;
          }
        }
      } else {
        for (var beforeIndex = observations.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
          if (hasConflictingRequestMessageId(observations[beforeIndex])) {
            continue;
          }
          var beforeTime = Number(observations[beforeIndex].observedAt || 0);
          if (beforeTime >= submittedMs - earlyWindow && beforeTime < submittedMs) {
            observationIndex = beforeIndex;
            break;
          }
        }
      }
    }
    if (observationIndex < 0) {
      recentNetworkObservationsByTab[tabId] = observations;
      return payload || {};
    }

    var observation = observations[observationIndex];
    observations.splice(observationIndex, 1);
    if (observations.length) {
      recentNetworkObservationsByTab[tabId] = observations;
    } else {
      delete recentNetworkObservationsByTab[tabId];
    }
    var mergedUsageFeatures = normalizeUsageFeatures([].concat(
      Array.isArray(payload && payload.usageFeatures) ? payload.usageFeatures : [],
      Array.isArray(observation.usageFeatures) ? observation.usageFeatures : []
    ), observation.modelParameters, observation.model);
    // The request body is authoritative for the internal execution slug and
    // parameters. The public model selected by the user is a different layer:
    // keep that identity and attach the request slug as requestModel/apiModel.
    var selectedPublicModel = sanitizePublicModelName(
      payload && (payload.selectedPublicModel || payload.publicModel)
    );
    var selectedPublicModelSource = String(
      payload && payload.selectedPublicModelSource || (selectedPublicModel ? "selector-dom" : "")
    ).slice(0, 80);
    var selectedPublicMode = sanitizePublicMode(payload && payload.selectedPublicMode);
    var selectedPublicModeLabel = sanitizePublicModeLabel(
      payload && payload.selectedPublicModeLabel,
      selectedPublicMode
    );
    var selectedPublicModeSource = String(
      payload && payload.selectedPublicModeSource || (selectedPublicMode ? "selector-dom" : "")
    ).slice(0, 80);
    var submittedSourceMode = normalizeSourceMode(payload && payload.sourceMode);
    return Object.assign({}, payload || {}, {
      model: selectedPublicModel || observation.model,
      publicModel: selectedPublicModel,
      selectedPublicModel: selectedPublicModel,
      selectedPublicModelSource: selectedPublicModelSource,
      selectedPublicMode: selectedPublicMode,
      selectedPublicModeLabel: selectedPublicModeLabel,
      selectedPublicModeSource: selectedPublicModeSource,
      requestModel: observation.model,
      apiModel: observation.apiModel,
      chatgptModel: selectedPublicModel || observation.chatgptModel,
      responseModel: sanitizeChatGPTModel(payload && payload.responseModel),
      conversationId: observation.conversationId ||
        sanitizeConversationId(payload && payload.conversationId),
      requestMessageId: payloadRequestMessageId || observation.requestMessageId,
      sourceMode: normalizeSourceMode(
        submittedSourceMode !== "unknown" ? submittedSourceMode : observation.sourceMode
      ),
      modelMode: observation.modelMode,
      modelObservedSource: observation.source,
      usageFeatures: mergedUsageFeatures,
      modelParameters: observation.modelParameters
    });
  }

  function isConversationSubmissionUrl(value) {
    var parsed;
    try {
      parsed = new URL(String(value || ""));
    } catch (_) {
      return false;
    }
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== "chatgpt.com" && parsed.hostname !== "chat.openai.com")
    ) {
      return false;
    }
    return /\/(?:f\/)?conversation\/?$/i.test(parsed.pathname);
  }

  // ChatGPT 的「深度研究 / 代理模式」在模型选择器里是可选项,请求的 model 字段会直接是
  // research / agent-mode。它们不是基础模型,但确实是用户的一次会话选择 —— 记成同名条目并
  // 标记对应功能,避免整条提交被丢弃(否则深度研究/代理模式的用量会完全统计不到)。
  function conversationModeModelInfo(payload, requestSource) {
    if (!isTrustedRequestModelSource(requestSource)) {
      return null;
    }
    var rawModel = (payload && payload.modelParameters && payload.modelParameters.model) || (payload && payload.model);
    var key = String(rawModel || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/_/g, "-").trim();
    var mode = CONVERSATION_MODE_MODELS[key];
    if (!mode) {
      return null;
    }
    var responseModel = exactResponseModelFromMetadata(payload);
    var result = {
      label: mode.label,
      publicModel: mode.label,
      requestModel: key,
      responseModel: responseModel,
      apiModel: key,
      chatgptModel: mode.label,
      mode: "",
      observedSource: String(requestSource || "").slice(0, 64),
      modelMappingStatus: "mapped",
      publicModelSource: "conversation-mode",
      catalogObservedAt: "",
      catalogAccountKey: sanitizeCatalogAccountKey(
        payload && (
          payload.runtimeModelCatalogAccountKey ||
          payload.catalogAccountKey
        )
      ),
      catalogContextKey: sanitizeCatalogContextKey(
        payload && (
          payload.runtimeModelCatalogContextKey ||
          payload.catalogContextKey
        )
      ),
      deprecated: false,
      parameters: { model: key },
      usageFeatures: [mode.feature]
    };
    if (responseModel) {
      result.responseObservedAt = String(payload && payload.responseObservedAt || "").slice(0, 48);
      result.responseObservedSource = String(
        payload && (
          payload.responseObservedSource ||
          payload.responseSource ||
          payload.modelObservedSource
        ) || ""
      ).slice(0, 64);
    }
    return result;
  }

  function resolvePayloadModelInfo(payload) {
    var payloadParameters = payload && payload.modelParameters && typeof payload.modelParameters === "object" ? payload.modelParameters : {};
    var requestSource = String((payload && payload.modelObservedSource) || "");
    var parameters = sanitizeModelParameters(payload && payload.modelParameters, "");
    var requestModel = sanitizeChatGPTModel(
      (payload && payload.requestModel) ||
      parameters.model ||
      payloadParameters.model
    );
    var responseModel = exactResponseModelFromMetadata(payload);
    var explicitConversationMode = CONVERSATION_MODE_MODELS[requestModel];
    if (explicitConversationMode && !responseModel) {
      return conversationModeModelInfo(payload, requestSource);
    }
    var trustedRequestModel = isTrustedRequestModelSource(requestSource) && isAuditableRequestRoute(requestModel);
    if (!trustedRequestModel) {
      var conversationMode = conversationModeModelInfo(payload, requestSource);
      if (conversationMode) {
        return conversationMode;
      }
      if (!responseModel || String(payload && payload.modelIdentitySource || "") !== "response-model") {
        return null;
      }
      requestModel = "";
      [
        "model",
        "api_model",
        "apimodel",
        "chatgpt_model",
        "chatgptmodel",
        "selected_model",
        "selectedmodel",
        "model_slug",
        "modelslug",
        "model_id",
        "modelid"
      ].forEach(function removeUnprovenRequestModel(key) {
        delete parameters[key];
      });
    } else {
      parameters.model = requestModel;
    }
    // The assistant message's metadata.model_slug is the strongest evidence of
    // the model that actually generated the answer. The request body remains
    // the exact requested route and is retained separately for audit/Auto.
    var identityModel = responseModel || requestModel;
    var resolved = null;

    if (modelCatalog && typeof modelCatalog.resolveRequestModelInfo === "function") {
      resolved = modelCatalog.resolveRequestModelInfo(identityModel);
    } else if (modelCatalog && typeof modelCatalog.resolveModelInfo === "function") {
      resolved = modelCatalog.resolveModelInfo(identityModel);
    }

    var apiModel = requestModel;
    var payloadCatalogAccountKey = sanitizeCatalogAccountKey(
      payload && (
        payload.runtimeModelCatalogAccountKey ||
        payload.catalogAccountKey
      )
    );
    var payloadCatalogContextKey = sanitizeCatalogContextKey(
      payload && (
        payload.runtimeModelCatalogContextKey ||
        payload.catalogContextKey
      )
    );
    var payloadRuntimeCatalog = sanitizeRuntimeModelCatalog(
      payload && payload.runtimeModelCatalog
    );
    var hasPayloadCatalog = Boolean(
      payloadRuntimeCatalog &&
      payloadCatalogAccountKey
    );
    var runtimePublic = hasPayloadCatalog
      ? resolveRuntimePublicModel(
          identityModel,
          Object.assign({}, payload, {
            runtimeModelCatalogAccountKey: payloadCatalogAccountKey
          }),
          payloadRuntimeCatalog
        )
      : resolveRuntimePublicModel(identityModel, payload);
    var selectedMetadata = hasPayloadCatalog
      ? resolveSelectedPublicModelMetadata(
          requestModel,
          Object.assign({}, payload, {
            runtimeModelCatalogAccountKey: payloadCatalogAccountKey
          }),
          payloadRuntimeCatalog
        )
      : resolveSelectedPublicModelMetadata(requestModel, payload);
    var selectedPublicModel = selectedMetadata.selectedPublicModel;
    var selectedPublicModelSource = selectedMetadata.selectedPublicModelSource;
    var selectedPublicMode = selectedMetadata.selectedPublicMode;
    var selectedPublicModeLabel = selectedMetadata.selectedPublicModeLabel;
    var selectedPublicModeSource = selectedMetadata.selectedPublicModeSource;
    var sourceMode = normalizeSourceMode(payload && payload.sourceMode);
    // A submit-time model selector is direct public-model evidence only while
    // the exact request and final response remain on the same internal route.
    // If the response slug differs, keep it unmapped until the account catalog
    // proves the correct public model.
    var directPublicSelection = directSameRoutePublicModel(
      requestModel,
      responseModel,
      Object.assign({}, payload || {}, { sourceMode: sourceMode }),
      selectedMetadata
    );
    var mappedPublicModel = runtimePublic &&
      runtimePublic.mappingStatus === "mapped" &&
      runtimePublic.publicModel;
    var preservedCatalogPublicModel = !mappedPublicModel
      ? storedCatalogMappedPublicModel(payload)
      : "";
    var storedModel = sanitizePublicModelName(
      responseModel
        ? (
            mappedPublicModel ||
            directPublicSelection ||
            preservedCatalogPublicModel ||
            chatGPTModeLabelFromSlug(identityModel) ||
            (resolved && resolved.label) ||
            identityModel
          )
        : (
            directPublicSelection ||
            selectedPublicModel ||
            mappedPublicModel ||
            preservedCatalogPublicModel ||
            chatGPTModeLabelFromSlug(identityModel) ||
            (resolved && resolved.label) ||
            (identityModel === "auto" ? "Auto" : identityModel)
          )
    );
    var chatgptModel = storedModel;
    var explicitSelectedPublicModel = !responseModel &&
      selectedPublicModel &&
      !/^request\+account-catalog$/i.test(String(selectedPublicModelSource || ""));
    var mappingStatus = responseModel
      ? (
          mappedPublicModel || preservedCatalogPublicModel
            ? "mapped"
            : directPublicSelection
              ? "selector"
              : "unmapped"
        )
      : (directPublicSelection || explicitSelectedPublicModel)
        ? "selector"
        : (mappedPublicModel || preservedCatalogPublicModel)
          ? "mapped"
          : selectedPublicModel ? "mapped" : "unmapped";
    var publicModelSource = directPublicSelection
        ? (sourceMode === "work" ? "work-selector+same-route" : "selector+same-route")
        : explicitSelectedPublicModel
          ? selectedPublicModelSource
          : mappedPublicModel
            ? runtimePublic.source
            : preservedCatalogPublicModel
              ? String(payload && payload.publicModelSource || "account-catalog:preserved")
            : (!responseModel && selectedPublicModel)
              ? selectedPublicModelSource
              : (responseModel ? "unmapped-response-slug" : "unmapped-request-slug");

    var result = {
      label: storedModel,
      publicModel: storedModel,
      selectedPublicModel: selectedPublicModel,
      selectedPublicModelSource: selectedPublicModelSource,
      selectedPublicMode: selectedPublicMode,
      selectedPublicModeLabel: selectedPublicModeLabel,
      selectedPublicModeSource: selectedPublicModeSource,
      requestModel: requestModel,
      requestModelEvidence: trustedRequestModel ? "trusted" : "unavailable",
      responseModel: responseModel,
      apiModel: apiModel,
      chatgptModel: chatgptModel,
      mode: responseModel
        ? sanitizeModelMode(resolved && resolved.mode)
        : sanitizeModelMode((payload && payload.modelMode) || (resolved && resolved.mode)),
      modelIdentitySource: responseModel ? "response-model" : "request-model",
      observedSource: String((payload && payload.modelObservedSource) || "").slice(0, 64),
      modelMappingStatus: String(mappingStatus).slice(0, 24),
      publicModelSource: String(publicModelSource).slice(0, 80),
      catalogObservedAt: String(
        (runtimePublic && runtimePublic.catalogObservedAt) ||
        (preservedCatalogPublicModel && payload && payload.catalogObservedAt) ||
        ""
      ).slice(0, 48),
      catalogAccountKey: payloadCatalogAccountKey || (
        mappedPublicModel && activeCatalogAllowedForMetadata(payload)
          ? activeRuntimeModelCatalogAccountKey
          : ""
      ),
      catalogContextKey: payloadCatalogContextKey || (
        mappedPublicModel && activeCatalogAllowedForMetadata(payload)
          ? activeRuntimeModelCatalogContextKey
          : ""
      ),
      sourceMode: sourceMode,
      deprecated: Boolean(resolved && resolved.deprecated),
      parameters: parameters
    };
    if (responseModel) {
      result.responseObservedAt = String(payload && payload.responseObservedAt || "").slice(0, 48);
      result.responseObservedSource = String(
        payload && (
          payload.responseObservedSource ||
          payload.responseSource ||
          payload.modelObservedSource
        ) || ""
      ).slice(0, 64);
    }
    return result;
  }

  function isDuplicateUsageEvent(stats, submissionId) {
    var id = String(submissionId || "").slice(0, 96);
    if (!id) {
      return false;
    }
    if ((stats.events || []).some(function duplicate(event) {
      return event && String(event.submissionId || "") === id;
    })) {
      return true;
    }
    if (Object.prototype.hasOwnProperty.call(
      stats && stats.submissionDedupeIndex || {},
      id
    )) {
      return true;
    }
    return Object.prototype.hasOwnProperty.call(
      stats && stats.responseMigrationIndex || {},
      "submission:" + id
    );
  }

  function isDuplicatePayloadEvent(stats, payload) {
    return isDuplicateUsageEvent(
      stats || createEmptyStats(),
      String((payload && payload.submissionId) || "").slice(0, 96)
    );
  }

  function usageSubmissionFingerprint(payload, sender) {
    var modelInfo = resolvePayloadModelInfo(payload || {});
    var promptHash = String((payload && payload.promptHash) || "").slice(0, 64);
    var submittedAt = String((payload && payload.submittedAt) || "");
    var submittedTime = new Date(submittedAt).getTime();
    var tabId = sender && sender.tab && typeof sender.tab.id === "number"
      ? sender.tab.id
      : -1;
    if (!modelInfo || !promptHash || Number.isNaN(submittedTime)) {
      return null;
    }

    return {
      model: modelInfo.label,
      requestModel: sanitizeChatGPTModel(
        modelInfo.requestModel ||
        modelInfo.apiModel ||
        payload && payload.requestModel
      ),
      requestMessageId: sanitizeMessageId(payload && payload.requestMessageId),
      tabId: tabId,
      conversationId: extractConversationId(String((payload && payload.pageUrl) || "")),
      promptHash: promptHash,
      submittedAt: submittedAt,
      submittedTime: submittedTime
    };
  }

  function sameUsageSubmission(left, right) {
    if (!left || !right || left.promptHash !== right.promptHash) {
      return false;
    }
    if (left.tabId !== right.tabId) {
      return false;
    }
    if (
      left.requestMessageId &&
      right.requestMessageId &&
      left.requestMessageId !== right.requestMessageId
    ) {
      return false;
    }
    if (
      left.requestModel &&
      right.requestModel &&
      left.requestModel !== right.requestModel
    ) {
      return false;
    }
    if (left.conversationId && right.conversationId && left.conversationId !== right.conversationId) {
      return false;
    }
    return Math.abs(left.submittedTime - right.submittedTime) < USAGE_DEDUPE_WINDOW_MS;
  }

  function forgetOldUsageSubmissions(nowMs) {
    recentUsageSubmissions = recentUsageSubmissions.filter(function keepRecent(entry) {
      return nowMs - Number(entry.submittedTime || 0) < USAGE_DEDUPE_WINDOW_MS;
    });
  }

  function rememberUsageSubmission(payload, nowDate, sender) {
    var fingerprint = usageSubmissionFingerprint(payload, sender);
    if (!fingerprint) {
      return false;
    }

    var nowMs = nowDate instanceof Date ? nowDate.getTime() : Date.now();
    forgetOldUsageSubmissions(nowMs);
    if (recentUsageSubmissions.some(function duplicate(entry) { return sameUsageSubmission(entry, fingerprint); })) {
      return true;
    }

    recentUsageSubmissions.push(fingerprint);
    return false;
  }

  function usageEventIndexBySubmissionId(stats, submissionId) {
    var id = String(submissionId || "").slice(0, 96);
    var events = stats && Array.isArray(stats.events) ? stats.events : [];
    if (!id) {
      return -1;
    }
    for (var index = 0; index < events.length; index += 1) {
      if (String((events[index] && events[index].submissionId) || "") === id) {
        return index;
      }
    }
    return -1;
  }

  function applyRequestEvidenceToExistingEvent(existingStats, payload, nowDate) {
    var stats = cloneStats(existingStats && typeof existingStats === "object"
      ? existingStats
      : createEmptyStats());
    var eventIndex = usageEventIndexBySubmissionId(
      stats,
      payload && payload.submissionId
    );
    var archivedEntry = eventIndex < 0
      ? archivedResponseObservationEntry(stats, payload, nowDate)
      : null;
    if (
      (eventIndex < 0 || !stats.events[eventIndex]) &&
      (!archivedEntry || !archivedEntry.event)
    ) {
      return stats;
    }

    var requestSource = String((payload && payload.modelObservedSource) || "");
    var requestModel = exactRequestModelFromMetadata(payload);
    if (
      !isTrustedRequestModelSource(requestSource) ||
      !isAuditableRequestRoute(requestModel)
    ) {
      return stats;
    }

    var previousEvent = Object.assign(
      {},
      eventIndex >= 0 ? stats.events[eventIndex] : archivedEntry.event
    );
    var previousAnalyticsDayUnknown = !eventDateKey(previousEvent);
    var previousDateKey = provenEventDateKey(stats, previousEvent);
    if (!hasStoredEventContribution(stats, previousEvent, previousDateKey)) {
      stats.analyticsHistoryComplete = false;
      return stats;
    }
    previousEvent.recordedDateKey = previousDateKey;
    var previousRequestModel = exactRequestModelFromMetadata(previousEvent);
    if (previousRequestModel && previousRequestModel !== requestModel) {
      return stats;
    }
    var previousRequestMessageId = sanitizeMessageId(previousEvent.requestMessageId);
    var incomingRequestMessageId = sanitizeMessageId(payload && payload.requestMessageId);
    if (
      previousRequestMessageId &&
      incomingRequestMessageId &&
      previousRequestMessageId !== incomingRequestMessageId
    ) {
      return stats;
    }
    var previousRequestSource = String(previousEvent.modelObservedSource || "");
    var strongestRequestSource =
      requestEvidenceSourcePriority(requestSource) >
      requestEvidenceSourcePriority(previousRequestSource)
        ? requestSource
        : previousRequestSource || requestSource;

    var previousResponseModel = exactResponseModelFromMetadata(previousEvent);
    var candidateEvent = Object.assign({}, previousEvent, {
      submissionId: String(
        previousEvent.submissionId || (payload && payload.submissionId) || ""
      ).slice(0, 96),
      requestModel: requestModel,
      requestModelEvidence: "trusted",
      apiModel: requestModel,
      modelObservedSource: strongestRequestSource.slice(0, 64),
      modelParameters: Object.assign(
        {},
        previousEvent.modelParameters || {},
        sanitizeModelParameters(payload && payload.modelParameters, requestModel),
        { model: requestModel }
      ),
      usageFeatures: normalizeUsageFeatures([].concat(
        Array.isArray(previousEvent.usageFeatures) ? previousEvent.usageFeatures : [],
        Array.isArray(payload && payload.usageFeatures) ? payload.usageFeatures : []
      )),
      requestMessageId: previousRequestMessageId || incomingRequestMessageId,
      sourceMode: normalizeSourceMode(previousEvent.sourceMode) !== "unknown"
        ? normalizeSourceMode(previousEvent.sourceMode)
        : normalizeSourceMode(payload && payload.sourceMode)
    });
    if (previousResponseModel) {
      candidateEvent.responseModel = previousResponseModel;
      candidateEvent.responseObservedAt = previousEvent.responseObservedAt;
      candidateEvent.responseObservedSource = previousEvent.responseObservedSource;
      candidateEvent.modelIdentitySource = "response-model";
    }

    var modelInfo = resolvePayloadModelInfo(Object.assign({}, candidateEvent, {
      runtimeModelCatalog: payload && payload.runtimeModelCatalog,
      runtimeModelCatalogAccountKey: payload && payload.runtimeModelCatalogAccountKey,
      runtimeModelCatalogContextKey: payload && payload.runtimeModelCatalogContextKey
    }));
    if (!modelInfo || !modelInfo.label) {
      return stats;
    }
    var updatedEvent = canonicalizeStoredEvent(candidateEvent, modelInfo.label, modelInfo);
    if (JSON.stringify(updatedEvent) === JSON.stringify(previousEvent)) {
      return stats;
    }
    if (eventIndex >= 0) {
      stats.events[eventIndex] = updatedEvent;
    } else {
      storeArchivedMigrationEvent(stats, updatedEvent, archivedEntry.key);
    }

    var rebuilt = rebuildStatsFromCompleteEventHistory(stats, true);
    if (rebuilt) {
      rebuilt.lastUpdated = String(
        (payload && payload.submittedAt) ||
        (nowDate instanceof Date ? nowDate.toISOString() : new Date().toISOString())
      ).slice(0, 48);
      return rebuilt;
    }

    var analyticsWasComplete = stats.analyticsHistoryComplete === true;
    var analyticsRemoved = removeUsageEventContribution(stats, previousEvent, previousAnalyticsDayUnknown);
    addUsageEventContribution(stats, updatedEvent, modelInfo, previousAnalyticsDayUnknown);
    if (previousAnalyticsDayUnknown) {
      stats.analyticsHistoryComplete = false;
      stats.analyticsDateBasisUncertain = true;
    }
    if (
      analyticsWasComplete &&
      (
        !analyticsRemoved ||
        (!exactRequestModelFromMetadata(updatedEvent) && !exactResponseModelFromMetadata(updatedEvent))
      )
    ) {
      stats.analyticsHistoryComplete = false;
    }
    stats.lastUpdated = String(
      (payload && payload.submittedAt) ||
      (nowDate instanceof Date ? nowDate.toISOString() : new Date().toISOString())
    ).slice(0, 48);
    return stats;
  }

  function applyIncrement(existingStats, payload, nowDate) {
    var incomingCatalog = sanitizeRuntimeModelCatalog(payload && payload.runtimeModelCatalog);
    var incomingCatalogAccountKey = sanitizeCatalogAccountKey(
      payload && payload.runtimeModelCatalogAccountKey
    );
    var incomingCatalogContextKey = sanitizeCatalogContextKey(
      payload && payload.runtimeModelCatalogContextKey
    );
    var sourceStats = existingStats && typeof existingStats === "object"
      ? Object.assign({}, existingStats)
      : createEmptyStats();
    if (incomingCatalog && incomingCatalogAccountKey) {
      activeRuntimeModelCatalog = incomingCatalog;
      activeRuntimeModelCatalogAccountKey = incomingCatalogAccountKey;
      activeRuntimeModelCatalogContextKey = incomingCatalogContextKey;
    }
    var stats = cloneStats(sourceStats);
    var now = nowDate || new Date();
    var modelInfo = resolvePayloadModelInfo(payload || {});
    if (!modelInfo) {
      return stats;
    }

    var model = modelInfo.label;
    var submittedAt = payload && payload.submittedAt ? String(payload.submittedAt) : now.toISOString();
    var submittedDate = new Date(submittedAt);
    if (Number.isNaN(submittedDate.getTime())) {
      submittedAt = now.toISOString();
      submittedDate = now;
    }
    submittedAt = submittedDate.toISOString();
    var dateKey = todayKey(submittedDate);
    var pageUrl = String((payload && payload.pageUrl) || "").slice(0, 500);
    var conversationId = sanitizeConversationId(
      (payload && payload.conversationId) || extractConversationId(pageUrl)
    );
    var requestMessageId = sanitizeMessageId(payload && payload.requestMessageId);
    var pageTitle = sanitizeTitle(payload && payload.pageTitle);
    var submissionId = String((payload && payload.submissionId) || "").slice(0, 96);
    var usageFeatures = normalizeUsageFeaturesForPage(
      [].concat(
        Array.isArray(payload && payload.usageFeatures) ? payload.usageFeatures : [],
        Array.isArray(modelInfo.usageFeatures) ? modelInfo.usageFeatures : []
      ),
      modelInfo.parameters,
      model,
      pageUrl
    );

    if (isDuplicateUsageEvent(stats, submissionId)) {
      return applyRequestEvidenceToExistingEvent(stats, payload, now);
    }

    if (!stats.byDate[dateKey]) {
      stats.byDate[dateKey] = {};
    } else {
      stats.byDate[dateKey] = Object.assign({}, stats.byDate[dateKey]);
    }

    stats.totals[model] = (stats.totals[model] || 0) + 1;
    stats.byDate[dateKey][model] = (stats.byDate[dateKey][model] || 0) + 1;
    stats.models[model] = modelInfo;
    updateVariantStats(stats, model, modelInfo, submittedAt);
    updateParameterStats(stats, model, modelInfo.parameters, submittedAt);
    updateFeatureStats(stats, model, usageFeatures, submittedAt);
    updateSessionIndex(stats, model, conversationId, {
      pageTitle: pageTitle,
      pageUrl: pageUrl,
      submittedAt: submittedAt
    });
    stats.lastUpdated = submittedAt;
    var usageEvent = {
      submissionId: submissionId,
      model: model,
      publicModel: modelInfo.publicModel || model,
      selectedPublicModel: modelInfo.selectedPublicModel || "",
      selectedPublicModelSource: modelInfo.selectedPublicModelSource || "",
      selectedPublicMode: modelInfo.selectedPublicMode || "",
      selectedPublicModeLabel: modelInfo.selectedPublicModeLabel || "",
      selectedPublicModeSource: modelInfo.selectedPublicModeSource || "",
      requestModel: modelInfo.requestModel || modelInfo.apiModel,
      requestModelEvidence: modelInfo.requestModelEvidence || "trusted",
      responseModel: modelInfo.responseModel || "",
      apiModel: modelInfo.apiModel,
      chatgptModel: modelInfo.chatgptModel,
      modelMode: modelInfo.mode,
      modelIdentitySource: modelInfo.modelIdentitySource || (modelInfo.responseModel ? "response-model" : "request-model"),
      modelObservedSource: modelInfo.observedSource,
      modelMappingStatus: modelInfo.modelMappingStatus || "",
      publicModelSource: modelInfo.publicModelSource || "",
      catalogObservedAt: modelInfo.catalogObservedAt || "",
      catalogAccountKey: modelInfo.catalogAccountKey || "",
      catalogContextKey: modelInfo.catalogContextKey || "",
      modelParameters: modelInfo.parameters,
      requestReasoningEffort: requestReasoningEffortFromParameters(modelInfo.parameters),
      usageFeatures: usageFeatures,
      source: String((payload && payload.source) || "unmarked-source").slice(0, 32),
      sourceMode: normalizeSourceMode(payload && payload.sourceMode),
      submittedAt: submittedAt,
      dateKeyBasis: "local",
      recordedDateKey: dateKey,
      dateTimeZone: (typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "") || "",
      pageUrl: pageUrl,
      pageTitle: pageTitle,
      conversationId: conversationId,
      requestMessageId: requestMessageId,
      responseMessageId: sanitizeMessageId(payload && payload.responseMessageId)
    };
    stats.submissionDedupeIndex = stats.submissionDedupeIndex &&
      typeof stats.submissionDedupeIndex === "object"
      ? stats.submissionDedupeIndex
      : {};
    if (submissionId) {
      setSafeObjectEntry(stats.submissionDedupeIndex, submissionId, submittedAt);
    }
    if (modelInfo.responseModel) {
      usageEvent.responseObservedAt = String(modelInfo.responseObservedAt || "").slice(0, 48);
      usageEvent.responseObservedSource = String(modelInfo.responseObservedSource || "").slice(0, 64);
    }
    stats.events.unshift(usageEvent);
    updateRelationStats(stats, model, usageEvent);
    updateAnalyticsContribution(stats, model, usageEvent);
    if (
      stats.analyticsHistoryComplete &&
      !exactRequestModelFromMetadata(usageEvent) &&
      !exactResponseModelFromMetadata(usageEvent)
    ) {
      stats.analyticsHistoryComplete = false;
    }
    var evictedEvents = stats.events.slice(MAX_EVENTS);
    stats.events = stats.events.slice(0, MAX_EVENTS);
    evictedEvents.forEach(function archiveEvictedEvent(event) {
      storeArchivedMigrationEvent(stats, event);
    });
    stats.eventHistoryComplete = Boolean(
      stats.eventHistoryComplete &&
      totalCount(stats) <= MAX_EVENTS &&
      stats.events.length === totalCount(stats)
    );
    stats.responseMigrationIndexComplete =
      stats.responseMigrationIndexComplete === true;

    return stats;
  }

  function responseObservationConversationId(payload) {
    var explicit = String((payload && payload.conversationId) || "").trim();
    if (explicit) {
      return explicit.slice(0, 128);
    }
    return extractConversationId(String((payload && payload.pageUrl) || ""));
  }

  function responseObservationEventIndex(stats, payload, nowDate) {
    var events = stats && Array.isArray(stats.events) ? stats.events : [];
    var submissionId = String((payload && payload.submissionId) || "").slice(0, 96);
    var requestMessageId = sanitizeMessageId(payload && payload.requestMessageId);
    if (submissionId) {
      for (var exactIndex = 0; exactIndex < events.length; exactIndex += 1) {
        if (String((events[exactIndex] && events[exactIndex].submissionId) || "") === submissionId) {
          var storedRequestMessageId = sanitizeMessageId(
            events[exactIndex] && events[exactIndex].requestMessageId
          );
          if (
            requestMessageId &&
            storedRequestMessageId &&
            storedRequestMessageId !== requestMessageId
          ) {
            return -1;
          }
          return exactIndex;
        }
      }
    }

    if (requestMessageId) {
      for (var messageIndex = 0; messageIndex < events.length; messageIndex += 1) {
        var messageEvent = events[messageIndex];
        if (
          messageEvent &&
          !exactResponseModelFromMetadata(messageEvent) &&
          sanitizeMessageId(messageEvent.requestMessageId) === requestMessageId
        ) {
          return messageIndex;
        }
      }
      return -1;
    }

    var conversationId = responseObservationConversationId(payload);
    if (!conversationId) {
      return -1;
    }
    var observedAt = new Date(String((payload && payload.observedAt) || ""));
    var observedTime = Number.isNaN(observedAt.getTime())
      ? (nowDate instanceof Date ? nowDate.getTime() : Date.now())
      : observedAt.getTime();
    for (var fallbackIndex = 0; fallbackIndex < events.length; fallbackIndex += 1) {
      var event = events[fallbackIndex];
      if (!event || exactResponseModelFromMetadata(event)) {
        continue;
      }
      var eventConversationId = String(event.conversationId || extractConversationId(event.pageUrl)).slice(0, 128);
      if (eventConversationId !== conversationId) {
        continue;
      }
      var submittedTime = new Date(String(event.submittedAt || "")).getTime();
      if (
        !Number.isNaN(submittedTime) &&
        observedTime >= submittedTime &&
        observedTime - submittedTime <= RESPONSE_MATCH_WINDOW_MS
      ) {
        return fallbackIndex;
      }
    }
    return -1;
  }

  function archivedResponseObservationEntry(stats, payload, nowDate) {
    var archive = stats && stats.responseMigrationIndex &&
      typeof stats.responseMigrationIndex === "object"
      ? stats.responseMigrationIndex
      : {};
    var submissionId = String((payload && payload.submissionId) || "").slice(0, 96);
    var requestMessageId = sanitizeMessageId(payload && payload.requestMessageId);
    if (submissionId) {
      var directKey = "submission:" + submissionId;
      var directEvent = archive[directKey];
      if (directEvent) {
        var directRequestMessageId = sanitizeMessageId(directEvent.requestMessageId);
        if (
          requestMessageId &&
          directRequestMessageId &&
          directRequestMessageId !== requestMessageId
        ) {
          return null;
        }
        return { key: directKey, event: directEvent };
      }
    }

    var keys = Object.keys(archive);
    if (requestMessageId) {
      for (var requestIndex = 0; requestIndex < keys.length; requestIndex += 1) {
        var requestEvent = archive[keys[requestIndex]];
        if (
          requestEvent &&
          sanitizeMessageId(requestEvent.requestMessageId) === requestMessageId
        ) {
          return { key: keys[requestIndex], event: requestEvent };
        }
      }
      return null;
    }

    var responseMessageId = sanitizeMessageId(payload && payload.responseMessageId);
    if (responseMessageId) {
      for (var responseIndex = 0; responseIndex < keys.length; responseIndex += 1) {
        var responseEvent = archive[keys[responseIndex]];
        if (
          responseEvent &&
          sanitizeMessageId(responseEvent.responseMessageId) === responseMessageId
        ) {
          return { key: keys[responseIndex], event: responseEvent };
        }
      }
      return null;
    }

    var conversationId = responseObservationConversationId(payload);
    if (!conversationId) {
      return null;
    }
    var observedAt = new Date(String((payload && payload.observedAt) || ""));
    var observedTime = Number.isNaN(observedAt.getTime())
      ? (nowDate instanceof Date ? nowDate.getTime() : Date.now())
      : observedAt.getTime();
    for (var fallbackIndex = 0; fallbackIndex < keys.length; fallbackIndex += 1) {
      var event = archive[keys[fallbackIndex]];
      if (!event || exactResponseModelFromMetadata(event)) {
        continue;
      }
      var eventConversationId = String(
        event.conversationId || extractConversationId(event.pageUrl)
      ).slice(0, 128);
      if (eventConversationId !== conversationId) {
        continue;
      }
      var submittedTime = new Date(String(event.submittedAt || "")).getTime();
      if (
        !Number.isNaN(submittedTime) &&
        observedTime >= submittedTime &&
        observedTime - submittedTime <= RESPONSE_MATCH_WINDOW_MS
      ) {
        return { key: keys[fallbackIndex], event: event };
      }
    }
    return null;
  }

  function applyResponseObservation(existingStats, payload, nowDate) {
    var incomingCatalog = sanitizeRuntimeModelCatalog(payload && payload.runtimeModelCatalog);
    var incomingCatalogAccountKey = sanitizeCatalogAccountKey(
      payload && payload.runtimeModelCatalogAccountKey
    );
    var incomingCatalogContextKey = sanitizeCatalogContextKey(
      payload && payload.runtimeModelCatalogContextKey
    );
    var sourceStats = existingStats && typeof existingStats === "object"
      ? Object.assign({}, existingStats)
      : createEmptyStats();
    if (incomingCatalog && incomingCatalogAccountKey) {
      activeRuntimeModelCatalog = incomingCatalog;
      activeRuntimeModelCatalogAccountKey = incomingCatalogAccountKey;
      activeRuntimeModelCatalogContextKey = incomingCatalogContextKey;
    }
    var stats = cloneStats(sourceStats);
    var responseModel = sanitizeChatGPTModel(payload && payload.responseModel);
    var hasResponseModel = isActualRequestModel(responseModel);
    var incomingFeatures = normalizeUsageFeatures(
      payload && payload.usageFeatures,
      {},
      ""
    );
    if (!hasResponseModel && !incomingFeatures.length) {
      return stats;
    }

    var eventIndex = responseObservationEventIndex(stats, payload, nowDate);
    var archivedEntry = eventIndex < 0
      ? archivedResponseObservationEntry(stats, payload, nowDate)
      : null;
    if (
      (eventIndex < 0 || !stats.events[eventIndex]) &&
      (!archivedEntry || !archivedEntry.event)
    ) {
      return stats;
    }

    var previousEvent = Object.assign(
      {},
      eventIndex >= 0 ? stats.events[eventIndex] : archivedEntry.event
    );
    var previousAnalyticsDayUnknown = !eventDateKey(previousEvent);
    var previousDateKey = provenEventDateKey(stats, previousEvent);
    if (!hasStoredEventContribution(stats, previousEvent, previousDateKey)) {
      stats.analyticsHistoryComplete = false;
      return stats;
    }
    previousEvent.recordedDateKey = previousDateKey;
    var previousResponseModel = exactResponseModelFromMetadata(previousEvent);

    var observedSource = String((payload && payload.observedSource) || "").slice(0, 64);
    var featureObservedSource = String(
      (payload && payload.featureObservedSource) ||
      (!hasResponseModel ? observedSource : "")
    ).slice(0, 64);
    if (
      hasResponseModel &&
      !/^message-dom:model-slug(?:$|:)/i.test(observedSource)
    ) {
      return stats;
    }
    if (
      incomingFeatures.length &&
      !/^message-dom:feature(?:$|:)/i.test(featureObservedSource) &&
      !/^message-dom:model-slug(?:$|:)/i.test(observedSource)
    ) {
      return stats;
    }
    var observedAt = String(
      (payload && payload.observedAt) ||
      (nowDate instanceof Date ? nowDate.toISOString() : new Date().toISOString())
    ).slice(0, 48);
    var observedConversationId = responseObservationConversationId(payload);
    var observedPageUrl = String((payload && payload.pageUrl) || "").slice(0, 500);
    var observedPageTitle = sanitizeTitle(payload && payload.pageTitle);
    var previousConversationId = sanitizeConversationId(
      previousEvent.conversationId || extractConversationId(previousEvent.pageUrl)
    );
    var shouldBackfillConversation = !previousConversationId || /^pending:/.test(previousConversationId);
    var nextConversationId = shouldBackfillConversation
      ? (observedConversationId || previousConversationId)
      : previousConversationId;
    var submittedPublicMode = sanitizePublicMode(previousEvent.selectedPublicMode);
    var candidateEvent = Object.assign({}, previousEvent, {
      submissionId: String(
        previousEvent.submissionId || (payload && payload.submissionId) || ""
      ).slice(0, 96),
      // These fields describe the selector state at submission time. A later
      // response slug may change the actual model classification, but it must
      // never rewrite the mode the user submitted with.
      selectedPublicMode: submittedPublicMode,
      selectedPublicModeLabel: sanitizePublicModeLabel(
        previousEvent.selectedPublicModeLabel,
        submittedPublicMode
      ),
      selectedPublicModeSource: String(
        previousEvent.selectedPublicModeSource || (submittedPublicMode ? "selector-dom" : "")
      ).slice(0, 80),
      responseModel: hasResponseModel ? responseModel : previousResponseModel,
      requestMessageId: sanitizeMessageId(
        previousEvent.requestMessageId || (payload && payload.requestMessageId)
      ),
      responseMessageId: sanitizeMessageId(
        previousEvent.responseMessageId || (payload && payload.responseMessageId)
      ),
      conversationId: nextConversationId,
      pageUrl: shouldBackfillConversation && observedConversationId && observedPageUrl
        ? observedPageUrl
        : previousEvent.pageUrl,
      pageTitle: observedPageTitle || previousEvent.pageTitle
    });
    if (hasResponseModel) {
      candidateEvent.responseObservedAt = previousResponseModel === responseModel
        ? (previousEvent.responseObservedAt || observedAt)
        : observedAt;
      candidateEvent.responseObservedSource = previousResponseModel === responseModel
        ? (previousEvent.responseObservedSource || observedSource)
        : observedSource;
    }
    candidateEvent.usageFeatures = normalizeUsageFeatures([].concat(
      Array.isArray(previousEvent.usageFeatures) ? previousEvent.usageFeatures : [],
      incomingFeatures
    ), candidateEvent.modelParameters, candidateEvent.requestModel);
    var modelInfo = resolvePayloadModelInfo(candidateEvent);
    if (!modelInfo || !modelInfo.label) {
      return stats;
    }

    var updatedEvent = canonicalizeStoredEvent(candidateEvent, modelInfo.label, modelInfo);
    if (JSON.stringify(updatedEvent) === JSON.stringify(previousEvent)) {
      return stats;
    }
    if (eventIndex >= 0) {
      stats.events[eventIndex] = updatedEvent;
    } else {
      storeArchivedMigrationEvent(stats, updatedEvent, archivedEntry.key);
    }

    var rebuilt = rebuildStatsFromCompleteEventHistory(stats, true);
    if (rebuilt) {
      rebuilt.lastUpdated = observedAt || rebuilt.lastUpdated;
      return rebuilt;
    }

    var analyticsWasComplete = stats.analyticsHistoryComplete === true;
    var analyticsRemoved = removeUsageEventContribution(stats, previousEvent, previousAnalyticsDayUnknown);
    addUsageEventContribution(stats, updatedEvent, modelInfo, previousAnalyticsDayUnknown);
    if (previousAnalyticsDayUnknown) {
      stats.analyticsHistoryComplete = false;
      stats.analyticsDateBasisUncertain = true;
    }
    if (
      analyticsWasComplete &&
      (
        !analyticsRemoved ||
        (!exactRequestModelFromMetadata(updatedEvent) && !exactResponseModelFromMetadata(updatedEvent))
      )
    ) {
      stats.analyticsHistoryComplete = false;
    }
    stats.lastUpdated = observedAt || stats.lastUpdated;
    return stats;
  }

  function sameCountMap(left, right) {
    var leftKeys = Object.keys(left || {}).filter(function positive(key) {
      return sanitizeCount(left[key]) > 0;
    }).sort();
    var rightKeys = Object.keys(right || {}).filter(function positive(key) {
      return sanitizeCount(right[key]) > 0;
    }).sort();
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    for (var i = 0; i < leftKeys.length; i += 1) {
      if (leftKeys[i] !== rightKeys[i] || sanitizeCount(left[leftKeys[i]]) !== sanitizeCount(right[rightKeys[i]])) {
        return false;
      }
    }
    return true;
  }

  function storedEventNeedsEvidenceRepair(event) {
    var source = event && typeof event === "object" ? event : {};
    if (
      isProjectConversationUrl(source.pageUrl) &&
      normalizeUsageFeatures(source.usageFeatures, source.modelParameters, source.model).indexOf("gpts") >= 0
    ) {
      return true;
    }
    var rawResponse = sanitizeChatGPTModel(source.responseModel);
    if (isActualRequestModel(rawResponse) && !exactResponseModelFromMetadata(source)) {
      return true;
    }
    var rawRequest = exactRequestModelFromMetadata(source);
    if (
      rawRequest &&
      source.requestModelEvidence !== "unavailable" &&
      !isTrustedRequestModelSource(source.modelObservedSource || source.observedSource)
    ) {
      return true;
    }
    var selected = sanitizePublicModelName(source.selectedPublicModel);
    var selectedSource = String(source.selectedPublicModelSource || "");
    var catalog = boundRuntimeCatalog(source, null, false);
    return Boolean(selected && !plausibleSelectedPublicModel(selected, selectedSource, catalog));
  }

  function rebuildStatsFromCompleteEventHistory(base, force) {
    var source = base && typeof base === "object" ? base : null;
    var sourceEvents = source && Array.isArray(source.events) ? source.events.filter(Boolean) : [];
    var sourceTotal = source ? totalCount(source) : 0;
    var evidenceNeedsRepair = sourceEvents.some(storedEventNeedsEvidenceRepair);
    var eventHistoryCanBeComplete = sourceEvents.length > 0 &&
      sourceTotal <= MAX_EVENTS &&
      source.eventHistoryComplete === true &&
      sourceEvents.length === sourceTotal;
    var aggregateCountNeedsRepair = source.eventHistoryComplete === true &&
      sourceEvents.length !== sourceTotal;
    if (
      !source ||
      (!force && !activeRuntimeModelCatalog && !evidenceNeedsRepair) ||
      !eventHistoryCanBeComplete
    ) {
      return null;
    }

    // Replaying events must never move a count to a guessed calendar day.
    // Require proof of each event's day and agreement with stored buckets.
    var provenDays = sourceEvents.map(function resolveDay(event) {
      return provenEventDateKey(source, event);
    });
    if (provenDays.some(function unknown(day) { return !day; })) return null;
    var eventBuckets = {};
    sourceEvents.forEach(function countOriginalBucket(event, index) {
      var day = provenDays[index];
      var model = String(event.model || "");
      if (!eventBuckets[day]) eventBuckets[day] = {};
      eventBuckets[day][model] = (eventBuckets[day][model] || 0) + 1;
    });
    var daysToCheck = Object.keys(Object.assign({}, source.byDate || {}, eventBuckets));
    if (daysToCheck.some(function differs(day) {
      return !sameCountMap((source.byDate || {})[day] || {}, eventBuckets[day] || {});
    })) return null;

    var sourceModels = source.models || {};
    var aggregateNeedsRemap = Object.keys(source.totals || {}).some(function needsRemap(model) {
      return canonicalStoredModelName(model, sourceModels[model]) !== sanitizeModelName(model);
    });
    if (!force && !aggregateNeedsRemap && !evidenceNeedsRepair && !aggregateCountNeedsRepair) {
      return null;
    }

    var mapped = [];
    var mappedTotals = {};
    for (var i = 0; i < sourceEvents.length; i += 1) {
      var sourceEvent = sourceEvents[i];
      var modelInfo = resolvePayloadModelInfo(sourceEvent);
      if (!modelInfo || !modelInfo.label) {
        // Older builds could promote visible DOM labels into request models.
        // Such records do not prove an actual request route and must not
        // survive an auditable catalog rebuild.
        continue;
      }
      mapped.push({ event: Object.assign({}, sourceEvent, { recordedDateKey: provenDays[i] }), modelInfo: modelInfo });
      mappedTotals[modelInfo.label] = (mappedTotals[modelInfo.label] || 0) + 1;
    }

    if (mapped.length !== sourceEvents.length) return null;

    var rebuilt = createEmptyStats();

    // Stored events are newest-first. Replaying oldest-first preserves first
    // and last timestamps while unshift restores the original event order.
    mapped.slice(0).reverse().forEach(function replay(entry) {
      var sourceEvent = entry.event;
      var modelInfo = entry.modelInfo;
      var model = modelInfo.label;
      var submittedAt = String(sourceEvent.submittedAt || "");
      var dateKey = eventDateKey(sourceEvent);
      var pageUrl = String(sourceEvent.pageUrl || "").slice(0, 500);
      var conversationId = String(sourceEvent.conversationId || extractConversationId(pageUrl)).slice(0, 128);
      var pageTitle = sanitizeTitle(sourceEvent.pageTitle);
      var usageFeatures = normalizeUsageFeaturesForPage(
        [].concat(
          Array.isArray(sourceEvent.usageFeatures) ? sourceEvent.usageFeatures : [],
          Array.isArray(modelInfo.usageFeatures) ? modelInfo.usageFeatures : []
        ),
        modelInfo.parameters,
        model,
        pageUrl
      );

      if (!rebuilt.byDate[dateKey]) {
        rebuilt.byDate[dateKey] = {};
      }
      rebuilt.totals[model] = (rebuilt.totals[model] || 0) + 1;
      rebuilt.byDate[dateKey][model] = (rebuilt.byDate[dateKey][model] || 0) + 1;
      rebuilt.models[model] = modelInfo;
      updateVariantStats(rebuilt, model, modelInfo, submittedAt);
      updateParameterStats(rebuilt, model, modelInfo.parameters, submittedAt);
      updateFeatureStats(rebuilt, model, usageFeatures, submittedAt);
      updateSessionIndex(rebuilt, model, conversationId, {
        pageTitle: pageTitle,
        pageUrl: pageUrl,
        submittedAt: submittedAt
      });

      var canonicalEvent = canonicalizeStoredEvent(sourceEvent, model, modelInfo);
      canonicalEvent.pageUrl = pageUrl;
      canonicalEvent.pageTitle = pageTitle;
      canonicalEvent.conversationId = conversationId;
      canonicalEvent.usageFeatures = usageFeatures;
      updateRelationStats(rebuilt, model, canonicalEvent);
      updateAnalyticsContribution(rebuilt, model, canonicalEvent);
      rebuilt.events.unshift(canonicalEvent);
      rebuilt.lastUpdated = submittedAt || rebuilt.lastUpdated;
    });

    rebuilt.events = rebuilt.events.slice(0, MAX_EVENTS);
    rebuilt.eventHistoryComplete = totalCount(rebuilt) <= MAX_EVENTS &&
      rebuilt.events.length === totalCount(rebuilt);
    rebuilt.analyticsHistoryComplete = analyticsTotalCount(rebuilt.analyticsByDate) === totalCount(rebuilt);
    return totalCount(rebuilt) === mapped.length ? rebuilt : null;
  }

  function updateSessionIndex(stats, model, conversationId, event) {
    if (!conversationId) {
      return;
    }

    if (!stats.sessionsByModel) {
      stats.sessionsByModel = {};
    }
    if (!stats.sessionsByModel[model]) {
      stats.sessionsByModel[model] = {};
    }

    var existing = stats.sessionsByModel[model][conversationId] || {
      conversationId: conversationId,
      title: "",
      count: 0,
      models: {},
      firstSubmittedAt: event.submittedAt,
      lastSubmittedAt: ""
    };

    existing.count = (Number(existing.count) || 0) + 1;
    existing.models[model] = (Number(existing.models[model]) || 0) + 1;
    existing.title = event.pageTitle || existing.title || conversationId;
    existing.firstSubmittedAt = existing.firstSubmittedAt || event.submittedAt;
    existing.lastSubmittedAt = event.submittedAt;
    existing.lastPageUrl = event.pageUrl;
    stats.sessionsByModel[model][conversationId] = sanitizeSession(existing, conversationId);
  }

  function totalCount(stats) {
    return Object.keys(stats.totals || {}).reduce(function sum(total, model) {
      return total + (Number(stats.totals[model]) || 0);
    }, 0);
  }

  function badgeText(count) {
    // Chrome recommends a compact badge. The separate badge-safe action icon
    // reserves the lower-right overlay area, while 99+ caps unbounded width.
    if (count <= 0) return "";
    if (count > 99) return "99+";
    return String(count);
  }

  var ACTION_ICON_PATHS = {
    16: "/icons/icon16.png",
    20: "/icons/icon20.png",
    24: "/icons/icon24.png",
    32: "/icons/icon32.png",
    48: "/icons/icon48.png"
  };

  var ACTION_BADGE_SAFE_ICON_PATHS = {
    16: "/icons/action16.png",
    20: "/icons/action20.png",
    24: "/icons/action24.png",
    32: "/icons/action32.png",
    48: "/icons/action48.png"
  };

  var ACTION_BADGE_ONE_ICON_PATHS = {
    16: "/icons/action1-16.png",
    20: "/icons/action1-20.png",
    24: "/icons/action1-24.png",
    32: "/icons/action1-32.png",
    48: "/icons/action1-48.png"
  };

  var ACTION_BADGE_TWO_ICON_PATHS = {
    16: "/icons/action2-16.png",
    20: "/icons/action2-20.png",
    24: "/icons/action2-24.png",
    32: "/icons/action2-32.png",
    48: "/icons/action2-48.png"
  };

  function actionIconPaths(badgeValue) {
    if (!badgeValue) {
      return ACTION_ICON_PATHS;
    }
    if (badgeValue === true) {
      return ACTION_BADGE_SAFE_ICON_PATHS;
    }
    var text = String(badgeValue);
    if (text.length <= 1) {
      return ACTION_BADGE_ONE_ICON_PATHS;
    }
    if (text.length === 2) {
      return ACTION_BADGE_TWO_ICON_PATHS;
    }
    return ACTION_BADGE_SAFE_ICON_PATHS;
  }

  function openAIStatusState(status, error) {
    if (error) {
      var message = String(error).toLowerCase();
      if (/timed?\s*out|timeout/i.test(message)) return "timeout";
      if (/fetch|network|unavailable|failed|dns|abort/i.test(message)) return "fetch-failure";
      return "unavailable";
    }
    var indicator = String((status && status.status && status.status.indicator) || "").toLowerCase();
    if (indicator === "none" || indicator === "operational") return "operational";
    if (indicator === "minor" || indicator === "degraded" || indicator === "degraded_performance") return "degraded";
    if (indicator === "partial" || indicator === "partial_outage") return "partial";
    if (indicator === "maintenance" || indicator === "under_maintenance") return "maintenance";
    if (indicator === "major" || indicator === "major_outage" || indicator === "critical") return "major";
    return "unknown";
  }

  function statusLabel(state) {
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

  function createOpenAIStatusRecord(response, checkedAt) {
    var status = response && response.ok && response.status ? response.status : null;
    var error = response && response.ok ? "" : sanitizeStatusText(response && response.error, 180) || "OpenAI status request failed.";
    var state = openAIStatusState(status, error);
    return {
      version: 1,
      ok: Boolean(response && response.ok && status),
      checkedAt: sanitizeStatusText(checkedAt || new Date().toISOString(), 48),
      sourceUrl: OPENAI_STATUS_PAGE_URL,
      state: state,
      label: statusLabel(state),
      error: error,
      status: status
    };
  }

  function sanitizeOpenAIStatusRecord(record) {
    var source = record && typeof record === "object" ? record : null;
    if (!source) {
      return null;
    }
    var state = String(source.state || "").toLowerCase();
    if (!/^(operational|degraded|partial|maintenance|major|unavailable|unknown|timeout|fetch-failure)$/.test(state)) {
      state = openAIStatusState(source.status, source.error);
    }
    return {
      version: 1,
      ok: Boolean(source.ok && source.status),
      checkedAt: sanitizeStatusText(source.checkedAt, 48),
      sourceUrl: sanitizeStatusText(source.sourceUrl || OPENAI_STATUS_PAGE_URL, 300),
      state: state,
      label: statusLabel(state),
      error: sanitizeStatusText(source.error, 180),
      status: source.status && typeof source.status === "object" ? source.status : null
    };
  }

  function isAbnormalOpenAIStatus(record) {
    var clean = sanitizeOpenAIStatusRecord(record);
    return Boolean(clean && clean.state !== "operational");
  }

  function statusBadgeText(record, count) {
    return badgeText(count);
  }

  function statusBadgeColor(record) {
    var clean = sanitizeOpenAIStatusRecord(record);
    if (!isAbnormalOpenAIStatus(clean)) return "#2563eb";
    if (clean.state === "major" || clean.state === "partial") return "#dc2626";
    if (clean.state === "degraded" || clean.state === "maintenance") return "#d97706";
    if (clean.state === "timeout" || clean.state === "fetch-failure") return "#d97706";
    return "#64748b";
  }

  function actionTitle(stats, record) {
    // 悬停标题与角标口径一致:都用"当前所选日期范围"的计数,避免角标显示范围数、标题却显示全部总数。
    var count = computeBadgeCount(stats || createEmptyStats(), badgeFilter);
    var clean = sanitizeOpenAIStatusRecord(record);
    var prefix = "ChatGPT Model Usage";
    if (count === null) {
      prefix += " · Statistics history incomplete";
    } else if (count) {
      prefix += " · " + count;
    }
    if (!clean) return prefix;
    return prefix + " · OpenAI status: " + clean.label;
  }

  // 角标范围过滤器:由面板(dashboard)推送当前选择的日期范围,角标只显示该范围内的次数,
  // 而不是全部总数(用户:角标显示面板所选日期范围对应的数字)。SW 重启后从存储恢复。
  var badgeFilter = null;
  var badgeFilterRevision = 0;

  function sanitizeBadgeFilter(filter) {
    if (!filter || typeof filter !== "object") { return null; }
    var dateRe = /^\d{4}-\d{2}-\d{2}$/;
    var startDate = typeof filter.startDate === "string" && dateRe.test(filter.startDate) ? filter.startDate : "";
    var endDate = typeof filter.endDate === "string" && dateRe.test(filter.endDate) ? filter.endDate : "";
    var models = Array.isArray(filter.models)
      ? filter.models.filter(function keepStrings(m) { return typeof m === "string" && m; }).slice(0, 200)
      : [];
    var modelsSpecified = filter.modelsSpecified === true ||
      (Array.isArray(filter.models) && filter.models.length > 0);
    var statisticsMode = sanitizeStatisticsMode(filter.statisticsMode);
    var sourceModeFilter = sanitizeSourceModeFilter(filter.sourceModeFilter);
    if (
      !startDate &&
      !endDate &&
      [1, 7, 31].indexOf(Number(filter.rollingDays)) === -1 &&
      filter.followToday !== true &&
      !modelsSpecified &&
      statisticsMode === "mapped" &&
      sourceModeFilter === "all"
    ) {
      return null;
    }
    return {
      startDate: startDate,
      endDate: endDate,
      models: models,
      modelsSpecified: modelsSpecified,
      statisticsMode: statisticsMode,
      sourceModeFilter: sourceModeFilter,
      ...(filter.autoSelectNewModels === true && Array.isArray(filter.knownModels)
        ? { autoSelectNewModels: true, knownModels: filter.knownModels.filter(function keepKnown(model) { return typeof model === "string" && model; }).slice(0, 200) }
        : {}),
      ...(filter.followToday === true ? { followToday: true } : {}),
      ...([1, 7, 31].indexOf(Number(filter.rollingDays)) !== -1 ? { rollingDays: Number(filter.rollingDays) } : {})
    };
  }

  function setBadgeFilter(filter) {
    badgeFilterRevision += 1;
    badgeFilter = sanitizeBadgeFilter(filter);
    scheduleBadgeRollover();
    return badgeFilter;
  }

  function scheduleBadgeRollover(nowDate) {
    if (typeof chrome === "undefined" || !chrome.alarms) return;
    if (!badgeFilter || (!badgeFilter.rollingDays && !badgeFilter.followToday)) {
      if (typeof chrome.alarms.clear === "function") chrome.alarms.clear(DATE_ROLLOVER_ALARM_NAME);
      return;
    }
    if (typeof chrome.alarms.create !== "function") return;
    var next = nowDate ? new Date(nowDate) : new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 1000);
    chrome.alarms.create(DATE_ROLLOVER_ALARM_NAME, { when: next.getTime() });
  }

  function badgeDateInRange(date, start, end) {
    return (!start || date >= start) && (!end || date <= end);
  }

  function badgeModelIncluded(clean, modelSet, model) {
    if (!modelSet || modelSet[model]) return true;
    return clean.autoSelectNewModels === true && clean.knownModels.indexOf(model) === -1;
  }

  function computeBadgeCountFromAnalytics(stats, clean, modelSet) {
    var sum = 0;
    var analytics = stats.analyticsByDate || {};
    Object.keys(analytics).forEach(function eachDate(date) {
      if (!badgeDateInRange(date, clean.startDate, clean.endDate)) {
        return;
      }
      var day = analytics[date] || {};
      var sourceModes = clean.sourceModeFilter === "all"
        ? ["chat", "work", "unknown"]
        : [clean.sourceModeFilter];
      sourceModes.forEach(function eachSource(sourceMode) {
        var mappedModels = day[sourceMode] || {};
        Object.keys(mappedModels).forEach(function eachMappedModel(mappedModel) {
          var relations = sanitizeModelRelationStats(mappedModels[mappedModel]);
          Object.keys(relations).forEach(function eachRelation(key) {
            var relation = relations[key];
            var countKey = clean.statisticsMode === "internal"
              ? (relation.requestModel || "__unknown_request_model__")
              : mappedModel;
            if (!badgeModelIncluded(clean, modelSet, countKey)) {
              return;
            }
            sum += sanitizeCount(relation.count);
          });
        });
      });
    });
    return sum;
  }

  // The badge uses the same date, source, statistics mode, and visible-model
  // selection as the dashboard. An explicitly empty model selection means 0.
  function computeBadgeCount(stats, filter) {
    stats = stats || createEmptyStats();
    var clean = sanitizeBadgeFilter(filter);
    if (!clean) { return totalCount(stats); }
    var start = clean.startDate;
    var end = clean.endDate;
    if (clean.rollingDays) {
      end = todayKey();
      start = usageDates.addCalendarDays(end, 1 - clean.rollingDays);
    } else if (clean.followToday) {
      end = todayKey();
    }
    if (start && end && start > end) { var swap = start; start = end; end = swap; }
    clean.startDate = start;
    clean.endDate = end;
    var modelSet = null;
    if (clean.modelsSpecified) {
      modelSet = {};
      clean.models.forEach(function markModel(m) { modelSet[m] = true; });
    }
    if (
      clean.statisticsMode === "internal" ||
      clean.sourceModeFilter !== "all"
    ) {
      if (stats.analyticsHistoryComplete !== true) {
        return null;
      }
      return computeBadgeCountFromAnalytics(stats, clean, modelSet);
    }
    var byDate = stats.byDate || {};
    var sum = 0;
    Object.keys(byDate).forEach(function eachDate(date) {
      if (start && date < start) { return; }
      if (end && date > end) { return; }
      var dayModels = byDate[date] || {};
      Object.keys(dayModels).forEach(function eachModel(model) {
        if (!badgeModelIncluded(clean, modelSet, model)) { return; }
        sum += Number(dayModels[model]) || 0;
      });
    });
    return sum;
  }

  function loadBadgeFilter(done) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      if (done) { done(); }
      return;
    }
    var revision = badgeFilterRevision;
    try {
      chrome.storage.local.get(["chatgptUsageBadgeFilter"], function applyStored(items) {
        if (revision === badgeFilterRevision) badgeFilter = sanitizeBadgeFilter(items && items.chatgptUsageBadgeFilter);
        scheduleBadgeRollover();
        if (done) { done(); }
      });
    } catch (_) {
      if (done) { done(); }
    }
  }

  function setBadge(stats, statusRecord) {
    if (typeof chrome === "undefined" || !chrome.action || !chrome.action.setBadgeText) {
      return;
    }

    var count = computeBadgeCount(stats || createEmptyStats(), badgeFilter);
    var text = statusBadgeText(statusRecord, count);
    if (typeof chrome.action.setIcon === "function") {
      // A native Chrome badge is always layered over the action icon and its
      // position is not configurable. Switch to the optical toolbar mark whose
      // lower-right is transparent whenever text is present.
      try {
        var iconUpdate = chrome.action.setIcon({ path: actionIconPaths(text) });
        if (iconUpdate && typeof iconUpdate.catch === "function") {
          iconUpdate.catch(function ignoreActionIconFailure() {});
        }
      } catch (_) {}
    }
    chrome.action.setBadgeBackgroundColor({ color: statusBadgeColor(statusRecord) });
    if (typeof chrome.action.setBadgeTextColor === "function") {
      try { chrome.action.setBadgeTextColor({ color: "#ffffff" }); } catch (_) {}
    }
    chrome.action.setBadgeText({ text: text });
    if (typeof chrome.action.setTitle === "function") {
      chrome.action.setTitle({ title: actionTitle(stats || createEmptyStats(), statusRecord) });
    }
  }

  function isChatGPTUrl(url) {
    var parsed;
    try {
      parsed = new URL(String(url || ""));
    } catch (_) {
      return false;
    }
    if (
      parsed.protocol !== "https:" ||
      (parsed.hostname !== "chatgpt.com" && parsed.hostname !== "chat.openai.com")
    ) {
      return false;
    }
    // These are same-origin data endpoints, not ChatGPT application pages.
    // Injecting the dashboard into a directly opened JSON response both
    // creates a broken UI and expands the extension surface unnecessarily.
    return !/^\/(?:api|backend-api)(?:\/|$)/i.test(parsed.pathname);
  }

  function sanitizeStatusText(value, maxLength) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength || 180);
  }

  function sanitizeOpenAIStatusComponent(component, index) {
    var source = component && typeof component === "object" ? component : {};
    var name = sanitizeStatusText(source.name, 120);
    if (!name) {
      return null;
    }

    return {
      id: sanitizeStatusText(source.id, 80),
      name: name,
      status: sanitizeStatusText(source.status, 48),
      updatedAt: sanitizeStatusText(source.updated_at || source.updatedAt, 48),
      group: Boolean(source.group),
      groupId: sanitizeStatusText(source.group_id || source.groupId, 80),
      position: Number(source.position || index || 0) || 0
    };
  }

  function componentMatchesAny(component, patterns) {
    var name = String((component && component.name) || "");
    return patterns.some(function matches(pattern) {
      return pattern.test(name);
    });
  }

  function webChatGPTStatusPatterns() {
    return [
      /^chatgpt$/i,
      /^conversations$/i,
      /^agent$/i,
      /^deep research$/i,
      /^image generation$/i,
      /^voice mode$/i,
      /^search$/i,
      /^gpts$/i,
      /^connectors\/apps$/i,
      /^file uploads$/i,
      /^login$/i,
      /^codex web$/i,
      /^chatgpt work$/i,
      /^sites$/i
    ];
  }

  function openAIStatusSeverity(value) {
    var clean = String(value || "").toLowerCase();
    if (clean === "major_outage" || clean === "major" || clean === "critical") return 5;
    if (clean === "partial_outage") return 4;
    if (clean === "degraded_performance" || clean === "minor") return 3;
    if (clean === "under_maintenance" || clean === "maintenance") return 2;
    if (clean === "operational" || clean === "none") return 1;
    return 0;
  }

  function openAIStatusIndicatorFromSeverity(severity) {
    if (severity >= 5) return "major";
    if (severity === 4) return "partial_outage";
    if (severity === 3) return "minor";
    if (severity === 2) return "maintenance";
    return "none";
  }

  function aggregateOpenAIComponentStatus(components) {
    var severity = components.reduce(function worst(current, component) {
      return Math.max(current, openAIStatusSeverity(component && component.status));
    }, 1);
    return {
      indicator: openAIStatusIndicatorFromSeverity(severity),
      description: ""
    };
  }

  function importantOpenAIComponents(components) {
    var patterns = webChatGPTStatusPatterns();
    var byName = {};
    components.forEach(function keep(component) {
      var key = String((component && component.name) || "").toLowerCase();
      if (!key || component.group || !componentMatchesAny(component, patterns)) {
        return;
      }
      if (!byName[key] || openAIStatusSeverity(component.status) > openAIStatusSeverity(byName[key].status)) {
        byName[key] = component;
      }
    });
    return Object.keys(byName).map(function toComponent(key) {
      return byName[key];
    }).sort(function byPosition(left, right) {
      return left.position - right.position || left.name.localeCompare(right.name);
    });
  }

  function mergeOpenAIStatusPayloads(summaryPayload, componentsPayload) {
    var summary = summaryPayload && typeof summaryPayload === "object" ? summaryPayload : {};
    var componentSource = componentsPayload && typeof componentsPayload === "object" ? componentsPayload : {};
    var merged = {
      page: summary.page || componentSource.page || {},
      status: summary.status || componentSource.status || {},
      components: []
    };
    var byId = {};
    var order = [];
    function addComponents(items) {
      (Array.isArray(items) ? items : []).forEach(function add(component, index) {
        if (!component || typeof component !== "object") {
          return;
        }
        var id = sanitizeStatusText(component.id, 120);
        var name = sanitizeStatusText(component.name, 160).toLowerCase();
        var key = id ? "id:" + id : name ? "name:" + name : "index:" + String(order.length + index);
        if (!byId[key]) {
          order.push(key);
          byId[key] = component;
          return;
        }
        byId[key] = Object.assign({}, byId[key], component);
      });
    }
    addComponents(summary.components);
    addComponents(componentSource.components);
    merged.components = order.map(function component(key) { return byId[key]; });
    return merged;
  }

  function sanitizeOpenAIStatusPayload(payload, fetchedAt) {
    var source = payload && typeof payload === "object" ? payload : {};
    var page = source.page && typeof source.page === "object" ? source.page : {};
    var status = source.status && typeof source.status === "object" ? source.status : {};
    var components = Array.isArray(source.components)
      ? source.components.map(sanitizeOpenAIStatusComponent).filter(Boolean)
      : [];
    components.sort(function byPosition(left, right) {
      return left.position - right.position || left.name.localeCompare(right.name);
    });
    var importantComponents = importantOpenAIComponents(components);
    var aggregateStatus = aggregateOpenAIComponentStatus(importantComponents);
    return {
      fetchedAt: sanitizeStatusText(fetchedAt || new Date().toISOString(), 48),
      sourceUrl: OPENAI_STATUS_PAGE_URL,
      complete: source.complete !== false,
      warnings: Array.isArray(source.warnings)
        ? source.warnings.map(function warning(value) { return sanitizeStatusText(value, 180); }).filter(Boolean)
        : [],
      page: {
        id: sanitizeStatusText(page.id, 80),
        name: sanitizeStatusText(page.name || "OpenAI", 120),
        url: sanitizeStatusText(page.url || OPENAI_STATUS_PAGE_URL, 300),
        updatedAt: sanitizeStatusText(page.updated_at || page.updatedAt, 48)
      },
      status: aggregateStatus,
      components: importantComponents,
      incidents: []
    };
  }

  function fetchOpenAIStatus(callback, fetchImpl) {
    var finished = false;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeoutId = typeof setTimeout === "function"
      ? setTimeout(function timeoutStatus() {
          if (finished) {
            return;
          }
          finished = true;
          if (controller) {
            controller.abort();
          }
          callback({ ok: false, error: "OpenAI status request timed out." });
        }, 9000)
      : null;

    function respond(message) {
      if (finished) {
        return;
      }
      finished = true;
      if (timeoutId && typeof clearTimeout === "function") {
        clearTimeout(timeoutId);
      }
      callback(message);
    }

    var statusFetch = typeof fetchImpl === "function"
      ? fetchImpl
      : typeof fetch === "function" ? fetch : null;
    if (!statusFetch) {
      respond({ ok: false, error: "Fetch is not available in this Chrome runtime." });
      return;
    }

    function fetchPayload(url, label) {
      return statusFetch(url, { cache: "no-store", signal: controller ? controller.signal : undefined })
        .then(function parseResponse(response) {
          if (!response || !response.ok) {
            throw new Error(label + " HTTP " + (response && response.status));
          }
          return response.json();
        })
        .then(function success(payload) {
          return { ok: true, payload: payload };
        })
        .catch(function failed(error) {
          return { ok: false, error: String((error && error.message) || error || (label + " request failed.")) };
        });
    }

    Promise.all([
      fetchPayload(OPENAI_STATUS_SUMMARY_URL, "OpenAI status summary"),
      fetchPayload(OPENAI_STATUS_COMPONENTS_URL, "OpenAI status components")
    ]).then(function handlePayloads(results) {
      var summaryResult = results[0];
      var componentsResult = results[1];
      if (!summaryResult.ok && !componentsResult.ok) {
        respond({
          ok: false,
          error: [summaryResult.error, componentsResult.error].filter(Boolean).join(" | ") || "OpenAI status request failed."
        });
        return;
      }
      var merged = mergeOpenAIStatusPayloads(
        summaryResult.ok ? summaryResult.payload : null,
        componentsResult.ok ? componentsResult.payload : null
      );
      merged.complete = Boolean(componentsResult.ok);
      merged.warnings = [];
      if (!summaryResult.ok) {
        merged.warnings.push(summaryResult.error);
      }
      if (!componentsResult.ok) {
        merged.warnings.push(componentsResult.error);
      }
      respond({ ok: true, status: sanitizeOpenAIStatusPayload(merged, new Date().toISOString()) });
    }).catch(function failed(error) {
      respond({ ok: false, error: String((error && error.message) || error || "OpenAI status request failed.") });
      });
  }

  function injectIsolatedContentScripts(tabId) {
    if (
      typeof chrome === "undefined" ||
      !chrome.scripting ||
      !chrome.scripting.executeScript ||
      typeof tabId !== "number"
    ) {
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ISOLATED_CONTENT_SCRIPT_FILES.slice()
      },
      function ignoreIsolatedInjectionResult() {
        void chrome.runtime.lastError;
      }
    );
  }

  // This function is serialized by chrome.scripting.executeScript and runs in
  // ChatGPT's MAIN world. Keep it self-contained: it only inspects already
  // rendered project rows and their React-owned props, never clicks, navigates,
  // refreshes, or performs a network request.
  function extractRenderedProjectDirectoriesFromMainWorld() {
    var MAX_ROWS = 500;
    var MAX_NODES_PER_ROW = 400;
    var MAX_DEPTH = 8;
    var MAX_FIBER_ANCESTORS = 32;
    var MAX_KEYS_PER_NODE = 100;
    var PROJECT_ID_RE = /\bg-p-[0-9a-f]{32}\b/i;
    var PROJECT_NAME_KEYS = {
      projectname: 120,
      projecttitle: 118,
      displayname: 110,
      displaytitle: 108,
      title: 80,
      name: 78,
      label: 70
    };
    var SKIP_TRAVERSE_KEYS = /^(?:alternate|child|sibling|return|stateNode|_owner|_debugOwner|authorization|cookie|headers|accessToken|sessionToken|messages?|mapping|content|prompt|response|body)$/i;

    function cleanText(value, limit) {
      return String(value == null ? "" : value)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit || 200);
    }

    function safeProjectId(value) {
      var match = cleanText(value, 500).match(PROJECT_ID_RE);
      return match ? String(match[0]).toLowerCase() : "";
    }

    function normalizedKey(value) {
      return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    }

    function cleanProjectName(value) {
      var name = cleanText(value, 200);
      var openMatch = name.match(/^open\s+(.+?)\s+project$/i);
      var chineseOpenMatch = name.match(/^打开\s*(.+?)\s*项目$/);
      if (openMatch) {
        name = cleanText(openMatch[1], 200);
      } else if (chineseOpenMatch) {
        name = cleanText(chineseOpenMatch[1], 200);
      }
      if (
        !name ||
        safeProjectId(name) ||
        /^(?:https?:\/\/|\/g\/|javascript:)/i.test(name) ||
        /^(?:projects?|open project|new project|project conversations?|项目|打开项目|新建项目|项目对话|more|更多|rename|重命名|delete|删除|archive|归档)$/i.test(name)
      ) {
        return "";
      }
      return name;
    }

    function ownNames(value) {
      try {
        return Object.getOwnPropertyNames(value).slice(0, MAX_KEYS_PER_NODE);
      } catch (_) {
        return [];
      }
    }

    function readOwn(value, key) {
      try {
        return value[key];
      } catch (_) {
        return undefined;
      }
    }

    function isObject(value) {
      return Boolean(value && (typeof value === "object" || typeof value === "function"));
    }

    function isDomNode(value) {
      return Boolean(value && typeof value === "object" && typeof value.nodeType === "number");
    }

    function rememberUnique(list, seen, value) {
      if (value && !seen[value]) {
        seen[value] = true;
        list.push(value);
      }
    }

    function exactProjectFromCatalogItem(value) {
      if (!isObject(value)) {
        return null;
      }
      var directGizmo = readOwn(value, "gizmo");
      var directProject = readOwn(value, "project");
      var gizmoResource = readOwn(value, "gizmoResource") || readOwn(value, "gizmo_resource");
      var candidates = [
        value,
        directGizmo,
        isObject(directGizmo) ? readOwn(directGizmo, "gizmo") : null,
        directProject,
        isObject(directProject) ? readOwn(directProject, "gizmo") : null,
        gizmoResource,
        isObject(gizmoResource) ? readOwn(gizmoResource, "gizmo") : null
      ];
      for (var candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
        var candidate = candidates[candidateIndex];
        if (!isObject(candidate)) {
          continue;
        }
        var gizmoId = safeProjectId(
          readOwn(candidate, "id") ||
          readOwn(candidate, "gizmoId") ||
          readOwn(candidate, "gizmo_id") ||
          readOwn(candidate, "projectId") ||
          readOwn(candidate, "project_id")
        );
        var display = readOwn(candidate, "display");
        var projectName = cleanProjectName(
          display && (
            readOwn(display, "name") ||
            readOwn(display, "title") ||
            readOwn(display, "displayName") ||
            readOwn(display, "display_name")
          )
        );
        if (gizmoId && projectName) {
          return {
            gizmoId: gizmoId,
            projectName: projectName
          };
        }
      }
      return null;
    }

    function renderedProjectName(row) {
      var aria = "";
      var title = "";
      try {
        aria = cleanText(row.getAttribute && row.getAttribute("aria-label"), 240);
        title = cleanText(row.getAttribute && row.getAttribute("title"), 240);
      } catch (_) {}
      var ariaMatch = aria.match(/(?:chat in project|项目中的对话)\s+(.+)$/i);
      var ariaName = cleanProjectName(ariaMatch && ariaMatch[1]);
      if (ariaName) {
        return ariaName;
      }
      var projectLink = null;
      try {
        var rowHref = String(row.getAttribute && row.getAttribute("href") || "");
        if (/\/g\/[^/?#]+\/project(?:[/?#]|$)/i.test(rowHref)) {
          projectLink = row;
        } else if (typeof row.querySelector === "function") {
          projectLink = row.querySelector('a[href*="/g/"][href*="/project"]');
        }
      } catch (_) {}
      if (projectLink) {
        var linkName = cleanProjectName(projectLink.innerText || projectLink.textContent || title || aria);
        if (linkName) {
          return linkName;
        }
      }
      return "";
    }

    var rows = [];
    try {
      rows = Array.prototype.slice.call(
        document.querySelectorAll("[class~='group/project-unfurl-row']"),
        0,
        MAX_ROWS
      );
    } catch (_) {
      rows = [];
    }

    var entries = [];
    var seenProjects = {};
    rows.forEach(function inspectProjectCatalogAncestors(row) {
      if (!row || entries.length >= MAX_ROWS) {
        return;
      }
      var reactFiberKeys = ownNames(row).filter(function reactFiberOwnedKey(key) {
        return /^__reactFiber\$/i.test(String(key || ""));
      });
      reactFiberKeys.forEach(function inspectFiberRoot(key) {
        var fiber = readOwn(row, key);
        var fiberVisited = typeof WeakSet === "function" ? new WeakSet() : [];
        var ancestorDepth = 0;
        while (isObject(fiber) && ancestorDepth < MAX_FIBER_ANCESTORS) {
          if (fiberVisited && typeof fiberVisited.has === "function") {
            if (fiberVisited.has(fiber)) {
              break;
            }
            fiberVisited.add(fiber);
          } else {
            if (fiberVisited.indexOf(fiber) >= 0) {
              break;
            }
            fiberVisited.push(fiber);
          }
          var propSources = [
            readOwn(fiber, "memoizedProps"),
            readOwn(fiber, "pendingProps")
          ];
          propSources.forEach(function inspectPropSource(props) {
            var projects = isObject(props) ? readOwn(props, "projects") : null;
            if (!Array.isArray(projects)) {
              return;
            }
            projects.slice(0, MAX_ROWS).forEach(function inspectCatalogItem(item) {
              var project = exactProjectFromCatalogItem(item);
              if (!project || seenProjects[project.gizmoId] || entries.length >= MAX_ROWS) {
                return;
              }
              seenProjects[project.gizmoId] = true;
              entries.push({
                gizmoId: project.gizmoId,
                projectName: project.projectName,
                projectOrder: entries.length
              });
            });
          });
          fiber = readOwn(fiber, "return");
          ancestorDepth += 1;
        }
      });
    });

    rows.forEach(function inspectProjectRow(row) {
      if (!row || entries.length >= MAX_ROWS) {
        return;
      }
      var reactKeys = ownNames(row).filter(function reactOwnedKey(key) {
        return /^__react(?:Props|Fiber)\$/i.test(String(key || ""));
      });
      var queue = reactKeys.map(function rootValue(key) {
        return {
          value: readOwn(row, key),
          depth: 0,
          path: String(key || "")
        };
      });
      var visited = typeof WeakSet === "function" ? new WeakSet() : [];
      var rowIds = [];
      var rowIdSeen = {};
      var nameCandidates = [];
      var pairCandidates = [];
      var visitedCount = 0;

      function wasVisited(value) {
        if (!isObject(value)) {
          return false;
        }
        if (visited && typeof visited.has === "function") {
          if (visited.has(value)) {
            return true;
          }
          visited.add(value);
          return false;
        }
        if (visited.indexOf(value) >= 0) {
          return true;
        }
        visited.push(value);
        return false;
      }

      while (queue.length && visitedCount < MAX_NODES_PER_ROW) {
        var item = queue.shift();
        var value = item && item.value;
        if (!isObject(value) || isDomNode(value) || wasVisited(value)) {
          continue;
        }
        visitedCount += 1;
        var keys = ownNames(value);
        var directIds = [];
        var directIdSeen = {};
        var explicitId = safeProjectId(
          readOwn(value, "id") ||
          readOwn(value, "gizmoId") ||
          readOwn(value, "gizmo_id") ||
          readOwn(value, "projectId") ||
          readOwn(value, "project_id")
        );
        var explicitDisplay = readOwn(value, "display");
        var explicitName = cleanProjectName(
          explicitDisplay && (
            readOwn(explicitDisplay, "name") ||
            readOwn(explicitDisplay, "title") ||
            readOwn(explicitDisplay, "displayName") ||
            readOwn(explicitDisplay, "display_name")
          )
        );
        if (explicitId && explicitName && /(?:gizmo|project)/i.test(item.path)) {
          rememberUnique(rowIds, rowIdSeen, explicitId);
          pairCandidates.push({
            gizmoId: explicitId,
            projectName: explicitName,
            score: 1000 - item.depth
          });
        }

        keys.forEach(function collectDirectId(key) {
          var child = readOwn(value, key);
          if (typeof child !== "string" && typeof child !== "number") {
            return;
          }
          var id = safeProjectId(child);
          rememberUnique(rowIds, rowIdSeen, id);
          rememberUnique(directIds, directIdSeen, id);
        });

        keys.forEach(function collectNamesAndChildren(key) {
          var child = readOwn(value, key);
          var keyName = normalizedKey(key);
          var nameScore = PROJECT_NAME_KEYS[keyName] || 0;
          if (nameScore && (typeof child === "string" || typeof child === "number")) {
            var name = cleanProjectName(child);
            var projectContext = /(?:project|gizmo)/i.test(item.path + "." + String(key || ""));
            if (name && (directIds.length || projectContext || nameScore >= 108)) {
              var candidate = {
                name: name,
                score: nameScore - item.depth
              };
              nameCandidates.push(candidate);
              directIds.forEach(function pairWithDirectId(id) {
                pairCandidates.push({
                  gizmoId: id,
                  projectName: name,
                  score: candidate.score + 200
                });
              });
            }
          }

          if (
            item.depth < MAX_DEPTH &&
            isObject(child) &&
            !isDomNode(child) &&
            !SKIP_TRAVERSE_KEYS.test(String(key || ""))
          ) {
            queue.push({
              value: child,
              depth: item.depth + 1,
              path: item.path + "." + String(key || "")
            });
          }
        });
      }

      pairCandidates.sort(function bestPairFirst(left, right) {
        return right.score - left.score;
      });
      nameCandidates.sort(function bestNameFirst(left, right) {
        return right.score - left.score;
      });

      var gizmoId = pairCandidates.length ? pairCandidates[0].gizmoId : "";
      var projectName = pairCandidates.length ? pairCandidates[0].projectName : "";
      if (!gizmoId && rowIds.length === 1) {
        gizmoId = rowIds[0];
      }
      if (!projectName && gizmoId && nameCandidates.length) {
        projectName = nameCandidates[0].name;
      }
      if (!projectName && gizmoId) {
        projectName = renderedProjectName(row);
      }
      if (!gizmoId || !projectName || seenProjects[gizmoId]) {
        return;
      }
      seenProjects[gizmoId] = true;
      entries.push({
        gizmoId: gizmoId,
        projectName: projectName,
        projectOrder: entries.length
      });
    });

    return {
      entries: entries,
      projectOrder: entries.map(function projectId(entry) {
        return entry.gizmoId;
      })
    };
  }

  function sanitizeRenderedProjectDirectories(value) {
    var source = value && typeof value === "object" ? value : {};
    var rawEntries = Array.isArray(source.entries)
      ? source.entries
      : Array.isArray(source.projects) ? source.projects : [];
    var requestedOrder = Array.isArray(source.projectOrder) ? source.projectOrder : [];
    function canonicalProjectId(value) {
      var match = String(value == null ? "" : value).match(/\bg-p-[0-9a-f]{32}\b/i);
      return match ? String(match[0]).toLowerCase() : "";
    }
    var orderById = {};
    requestedOrder.slice(0, 500).forEach(function rememberRequestedOrder(value, index) {
      var id = canonicalProjectId(value);
      if (id && !Object.prototype.hasOwnProperty.call(orderById, id)) {
        orderById[id] = index;
      }
    });
    var seen = {};
    var clean = [];
    rawEntries.slice(0, 500).forEach(function cleanEntry(entry, index) {
      var sourceEntry = entry && typeof entry === "object" ? entry : {};
      var gizmoId = canonicalProjectId(sourceEntry.gizmoId || sourceEntry.projectId);
      var projectName = String(sourceEntry.projectName || sourceEntry.name || "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      if (
        !gizmoId ||
        !projectName ||
        seen[gizmoId]
      ) {
        return;
      }
      seen[gizmoId] = true;
      var declaredOrder = Number(sourceEntry.projectOrder);
      var hasDeclaredOrder = sourceEntry.projectOrder !== null &&
        sourceEntry.projectOrder !== "" &&
        Number.isFinite(declaredOrder) &&
        declaredOrder >= 0;
      clean.push({
        gizmoId: gizmoId,
        projectName: projectName,
        projectOrder: Object.prototype.hasOwnProperty.call(orderById, gizmoId)
          ? orderById[gizmoId]
          : (hasDeclaredOrder ? declaredOrder : index),
        _index: index
      });
    });
    clean.sort(function stableProjectOrder(left, right) {
      return left.projectOrder - right.projectOrder || left._index - right._index;
    });
    return clean.map(function finalize(entry, index) {
      return {
        gizmoId: entry.gizmoId,
        projectName: entry.projectName,
        projectOrder: index
      };
    });
  }

  function readRenderedProjectDirectories(sender, sendResponse) {
    var tabId = Number(sender && sender.tab && sender.tab.id);
    var senderUrl = String(sender && sender.url || "");
    var tabUrl = String(sender && sender.tab && sender.tab.url || "");
    if (
      !Number.isInteger(tabId) ||
      tabId < 0 ||
      !(senderUrl || tabUrl) ||
      (senderUrl && !isChatGPTUrl(senderUrl)) ||
      (tabUrl && !isChatGPTUrl(tabUrl))
    ) {
      sendResponse({ ok: false, error: "untrusted-chatgpt-sender" });
      return false;
    }
    if (
      typeof chrome === "undefined" ||
      !chrome.scripting ||
      typeof chrome.scripting.executeScript !== "function"
    ) {
      sendResponse({ ok: false, error: "scripting-unavailable" });
      return false;
    }

    try {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          world: "MAIN",
          func: extractRenderedProjectDirectoriesFromMainWorld
        },
        function receiveProjectDirectories(results) {
          if (chrome.runtime && chrome.runtime.lastError) {
            sendResponse({
              ok: false,
              error: String(chrome.runtime.lastError.message || chrome.runtime.lastError)
            });
            return;
          }
          var extracted = results && results[0] && results[0].result;
          var entries = sanitizeRenderedProjectDirectories(extracted);
          sendResponse({
            ok: true,
            entries: entries,
            projectOrder: entries.map(function projectId(entry) {
              return entry.gizmoId;
            })
          });
        }
      );
    } catch (error) {
      sendResponse({
        ok: false,
        error: String((error && error.message) || error || "project-directory-read-failed")
      });
      return false;
    }
    return true;
  }

  function storageGet(callback) {
    // A session catalog is account-specific. Normal statistics reads must not
    // load whichever account happened to publish the latest catalog. Incoming
    // events carry their already-sanitized current-account catalog explicitly;
    // stored catalog-proven mappings preserve themselves without a live catalog.
    chrome.storage.local.get([STORAGE_KEY], function handleGet(result) {
      var rawStats = result[STORAGE_KEY];
      if (unsupportedStoredSchema(rawStats)) {
        callback(null, new Error("unsupported-statistics-version"));
        return;
      }
      var migratedCatalog = sanitizeRuntimeModelCatalog(rawStats && rawStats.runtimeModelCatalog);
      if (migratedCatalog) {
        activeRuntimeModelCatalog = migratedCatalog;
        activeRuntimeModelCatalogAccountKey = "";
        activeRuntimeModelCatalogContextKey = "";
      }
      var cleanStats = cloneStats(rawStats);
      // Reads must not race a concurrent increment by writing a stale clone.
      // Normalized values are persisted only by an explicit queued write.
      callback(cleanStats);
    });
  }

  function storageSet(stats, callback) {
    var cleanStats = cloneStats(stats);
    delete cleanStats.runtimeModelCatalog;
    chrome.storage.local.get([STORAGE_KEY], function checkExisting(result) {
      if (unsupportedStoredSchema(result && result[STORAGE_KEY])) {
        if (callback) callback(null, new Error("unsupported-statistics-version"));
        return;
      }
      chrome.storage.local.set({ [STORAGE_KEY]: cleanStats }, function handleSet() {
        statusGet(function updateBadgeWithStatus(statusRecord) {
          setBadge(cleanStats, statusRecord);
          if (callback) callback(cleanStats);
        });
      });
    });
  }

  function sessionCatalogRecord(value) {
    var source = value && typeof value === "object" ? value : {};
    var wrappedCatalog = sanitizeRuntimeModelCatalog(source.catalog);
    if (wrappedCatalog) {
      return {
        accountKey: sanitizeCatalogAccountKey(source.accountKey),
        catalog: wrappedCatalog
      };
    }
    var legacyCatalog = sanitizeRuntimeModelCatalog(source);
    return legacyCatalog
      ? { accountKey: "", catalog: legacyCatalog }
      : { accountKey: "", catalog: null };
  }

  function catalogForAccountKey(value, accountKey) {
    var requestedAccountKey = sanitizeCatalogAccountKey(accountKey);
    var record = sessionCatalogRecord(value);
    return requestedAccountKey &&
      record.accountKey === requestedAccountKey
      ? record.catalog
      : null;
  }

  function sessionCatalogGet(accountKey, callback) {
    if (typeof accountKey === "function") {
      callback = accountKey;
      accountKey = "";
    }
    var requestedAccountKey = sanitizeCatalogAccountKey(accountKey);
    var session = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;
    if (!session || typeof session.get !== "function") {
      callback(
        requestedAccountKey &&
        requestedAccountKey === activeRuntimeModelCatalogAccountKey
          ? activeRuntimeModelCatalog
          : null
      );
      return;
    }
    session.get([CATALOG_SESSION_KEY], function read(result) {
      var catalog = catalogForAccountKey(
        result && result[CATALOG_SESSION_KEY],
        requestedAccountKey
      );
      if (catalog) {
        activeRuntimeModelCatalog = catalog;
        activeRuntimeModelCatalogAccountKey = requestedAccountKey;
        activeRuntimeModelCatalogContextKey = "";
        callback(catalog);
        return;
      }
      callback(null);
    });
  }

  function sessionCatalogSet(catalog, accountKey, callback) {
    if (typeof accountKey === "function") {
      callback = accountKey;
      accountKey = "";
    }
    var cleanCatalog = sanitizeRuntimeModelCatalog(catalog);
    var cleanAccountKey = sanitizeCatalogAccountKey(accountKey);
    if (cleanCatalog) {
      activeRuntimeModelCatalog = cleanCatalog;
      activeRuntimeModelCatalogAccountKey = cleanAccountKey;
      activeRuntimeModelCatalogContextKey = "";
    }
    var session = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;
    if (!cleanCatalog || !cleanAccountKey || !session || typeof session.set !== "function") {
      if (callback) callback(cleanCatalog);
      return;
    }
    session.set({
      [CATALOG_SESSION_KEY]: {
        accountKey: cleanAccountKey,
        catalog: cleanCatalog
      }
    }, function saved() {
      if (callback) callback(cleanCatalog);
    });
  }

  function catalogBindingSalt(callback) {
    if (inMemoryCatalogBindingSalt) {
      callback(inMemoryCatalogBindingSalt);
      return;
    }
    var session = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;
    if (!session || typeof session.get !== "function" || typeof session.set !== "function") {
      if (!inMemoryCatalogBindingSalt) {
        inMemoryCatalogBindingSalt = "catalog-" + Date.now().toString(36) + "-" +
          Math.random().toString(36).slice(2, 18);
      }
      callback(inMemoryCatalogBindingSalt);
      return;
    }
    session.get([CATALOG_BINDING_SALT_SESSION_KEY], function readSalt(result) {
      var stored = String(result && result[CATALOG_BINDING_SALT_SESSION_KEY] || "")
        .replace(/[^0-9a-z-]/gi, "")
        .slice(0, 96);
      if (stored) {
        inMemoryCatalogBindingSalt = stored;
        callback(stored);
        return;
      }
      if (inMemoryCatalogBindingSalt) {
        callback(inMemoryCatalogBindingSalt);
        return;
      }
      var created = "catalog-" + Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2, 18);
      inMemoryCatalogBindingSalt = created;
      session.set({ [CATALOG_BINDING_SALT_SESSION_KEY]: created }, function savedSalt() {
        callback(created);
      });
    });
  }

  function catalogRefreshClaimKey(message) {
    var reason = String((message && message.reason) || "panel-open")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 32);
    var slug = sanitizeChatGPTModel(message && message.unknownSlug);
    var accountKey = sanitizeCatalogAccountKey(message && message.accountKey);
    var prefix = accountKey ? accountKey + ":" : "";
    if (slug) {
      return prefix + "unknown:" + slug;
    }
    return prefix + (reason === "panel-open" ? "panel-open" : ("reason:" + reason));
  }

  function claimRuntimeCatalogRefresh(message, callback) {
    var key = catalogRefreshClaimKey(message);
    var nowMs = Date.now();
    catalogRefreshClaimQueue = catalogRefreshClaimQueue
      .catch(function ignorePreviousClaimFailure() {})
      .then(function claim() {
        return new Promise(function resolveClaim(resolve) {
          var session = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;
          if (!session || typeof session.get !== "function" || typeof session.set !== "function") {
            Object.keys(inMemoryCatalogRefreshClaims).forEach(function removeExpiredClaim(claimKey) {
              var claimedAt = new Date(inMemoryCatalogRefreshClaims[claimKey]).getTime();
              if (Number.isNaN(claimedAt) || nowMs - claimedAt >= CATALOG_REFRESH_CLAIM_TTL_MS) {
                delete inMemoryCatalogRefreshClaims[claimKey];
              }
            });
            var alreadyClaimed = Boolean(inMemoryCatalogRefreshClaims[key]);
            if (!alreadyClaimed) {
              inMemoryCatalogRefreshClaims[key] = new Date().toISOString();
            }
            resolve({ claimed: !alreadyClaimed, key: key });
            return;
          }
          session.get([CATALOG_REFRESH_SESSION_KEY], function readClaims(result) {
            var record = result && result[CATALOG_REFRESH_SESSION_KEY];
            var claims = record && record.claims && typeof record.claims === "object"
              ? Object.assign({}, record.claims)
              : {};
            Object.keys(claims).forEach(function removeExpiredClaim(claimKey) {
              var claimedAt = new Date(claims[claimKey]).getTime();
              if (Number.isNaN(claimedAt) || nowMs - claimedAt >= CATALOG_REFRESH_CLAIM_TTL_MS) {
                delete claims[claimKey];
              }
            });
            if (claims[key]) {
              resolve({ claimed: false, key: key });
              return;
            }
            claims[key] = new Date().toISOString();
            var orderedKeys = Object.keys(claims).sort(function oldestFirst(left, right) {
              return String(claims[left]).localeCompare(String(claims[right]));
            });
            while (orderedKeys.length > 200) {
              delete claims[orderedKeys.shift()];
            }
            session.set({
              [CATALOG_REFRESH_SESSION_KEY]: {
                claims: claims,
                updatedAt: new Date().toISOString()
              }
            }, function savedClaim() {
              resolve({ claimed: true, key: key });
            });
          });
        });
      });
    catalogRefreshClaimQueue.then(callback).catch(function claimFailed() {
      callback({ claimed: false, key: key });
    });
  }

  function releaseRuntimeCatalogRefreshClaim(message, callback) {
    var key = catalogRefreshClaimKey(message);
    delete inMemoryCatalogRefreshClaims[key];
    var session = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;
    if (!session || typeof session.get !== "function" || typeof session.set !== "function") {
      callback({ released: true, key: key });
      return;
    }
    session.get([CATALOG_REFRESH_SESSION_KEY], function readClaims(result) {
      var record = result && result[CATALOG_REFRESH_SESSION_KEY];
      var claims = record && record.claims && typeof record.claims === "object"
        ? Object.assign({}, record.claims)
        : {};
      delete claims[key];
      session.set({
        [CATALOG_REFRESH_SESSION_KEY]: {
          claims: claims,
          updatedAt: new Date().toISOString()
        }
      }, function releasedClaim() {
        callback({ released: true, key: key });
      });
    });
  }

  function settingsGet(callback) {
    chrome.storage.local.get([SETTINGS_KEY], function handleGet(result) {
      var storedSettings = result[SETTINGS_KEY];
      if (unsupportedStoredSchema(storedSettings)) {
        callback(null, new Error("unsupported-settings-version"));
        return;
      }
      var cleanSettings = sanitizeSettings(storedSettings);
      callback(cleanSettings);
    });
  }

  var settingsWriteQueue = [];
  var settingsWriteBusy = false;

  function drainSettingsWriteQueue() {
    if (settingsWriteBusy || !settingsWriteQueue.length) {
      return;
    }
    settingsWriteBusy = true;
    var item = settingsWriteQueue.shift();
    chrome.storage.local.get([SETTINGS_KEY], function handleGet(result) {
      if (unsupportedStoredSchema(result && result[SETTINGS_KEY])) {
        if (item.callback) item.callback(null, new Error("unsupported-settings-version"));
        settingsWriteBusy = false;
        drainSettingsWriteQueue();
        return;
      }
      var nextSettings = mergeSettings(
        result && result[SETTINGS_KEY],
        item.settings
      );
      chrome.storage.local.set({ [SETTINGS_KEY]: nextSettings }, function handleSet() {
        if (item.callback) item.callback(nextSettings);
        settingsWriteBusy = false;
        drainSettingsWriteQueue();
      });
    });
  }

  function settingsSet(settings, callback) {
    settingsWriteQueue.push({
      settings: settings && typeof settings === "object"
        ? Object.assign({}, settings)
        : {},
      callback: callback
    });
    drainSettingsWriteQueue();
  }

  function statusGet(callback) {
    chrome.storage.local.get([STATUS_KEY], function handleGet(result) {
      callback(sanitizeOpenAIStatusRecord(result[STATUS_KEY]));
    });
  }

  function statusSet(statusRecord, callback) {
    var cleanRecord = sanitizeOpenAIStatusRecord(statusRecord);
    chrome.storage.local.set({ [STATUS_KEY]: cleanRecord }, function handleSet() {
      storageGet(function updateBadge(stats, error) {
        if (!error) setBadge(stats, cleanRecord);
        if (callback) callback(cleanRecord);
      });
    });
  }

  function refreshOpenAIStatus(callback) {
    fetchOpenAIStatus(function handleStatus(response) {
      var record = createOpenAIStatusRecord(response, new Date().toISOString());
      statusSet(record, function savedStatus(savedRecord) {
        if (callback) {
          callback({ ok: savedRecord.ok, status: savedRecord.status, statusRecord: savedRecord, error: savedRecord.error });
        }
      });
    });
  }

  function ensureStatusAlarm() {
    if (typeof chrome === "undefined" || !chrome.alarms || typeof chrome.alarms.create !== "function") {
      return;
    }
    chrome.alarms.create(STATUS_ALARM_NAME, { periodInMinutes: STATUS_ALARM_PERIOD_MINUTES });
  }

  function storageGetPromise() {
    return new Promise(function resolveStorageGet(resolve, reject) {
      storageGet(function gotStats(stats, error) { if (error) reject(error); else resolve(stats); });
    });
  }

  function storageSetPromise(stats) {
    return new Promise(function resolveStorageSet(resolve, reject) {
      storageSet(stats, function savedStats(result, error) { if (error) reject(error); else resolve(result); });
    });
  }

  function enqueueUsageIncrement(message, sender, sendResponse) {
    var job = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function runIncrement() {
      var nowDate = new Date();
      return storageGetPromise().then(function update(stats) {
        var payload = mergeRecentNetworkObservation(message.payload || {}, sender, nowDate);
        var duplicateBySubmissionId = isDuplicatePayloadEvent(stats, payload);
        var duplicateByFingerprint = rememberUsageSubmission(payload, nowDate, sender);
        if (duplicateByFingerprint && !duplicateBySubmissionId) {
          return storageSetPromise(stats).then(function respondDuplicate(savedStats) {
            sendResponse({
              ok: true,
              recorded: false,
              duplicate: true,
              event: null,
              stats: savedStats
            });
          });
        }
        var beforeCount = totalCount(stats);
        var beforeEvents = JSON.stringify((stats && stats.events) || []);
        var nextStats = applyIncrement(stats, payload, nowDate);
        return storageSetPromise(nextStats).then(function respond(savedStats) {
          var recorded = totalCount(savedStats) > beforeCount;
          var updated = JSON.stringify((savedStats && savedStats.events) || []) !== beforeEvents;
          var duplicate = !recorded && isDuplicatePayloadEvent(savedStats, payload);
          var eventIndex = usageEventIndexBySubmissionId(
            savedStats,
            payload && payload.submissionId
          );
          sendResponse({
            ok: true,
            recorded: recorded,
            duplicate: duplicate,
            updated: updated,
            event: eventIndex >= 0 && savedStats.events ? savedStats.events[eventIndex] : null,
            stats: savedStats
          });
        });
      });
    }).catch(function reportIncrementError(error) {
      sendResponse({
        ok: false,
        recorded: false,
        error: String((error && error.message) || error || "Usage increment failed.")
      });
    });

    usageIncrementQueue = job.catch(function keepQueueAlive() {});
  }

  function enqueueUsageResponse(message, sendResponse) {
    var job = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function runResponseObservation() {
      var nowDate = new Date();
      return storageGetPromise().then(function update(stats) {
        var beforeResponseState = JSON.stringify({
          events: (stats && stats.events) || [],
          responseMigrationIndex: (stats && stats.responseMigrationIndex) || {}
        });
        var nextStats = applyResponseObservation(stats, message && message.payload, nowDate);
        var updated = JSON.stringify({
          events: (nextStats && nextStats.events) || [],
          responseMigrationIndex: (nextStats && nextStats.responseMigrationIndex) || {}
        }) !== beforeResponseState;
        return storageSetPromise(nextStats).then(function respond(savedStats) {
          var eventIndex = responseObservationEventIndex(savedStats, message && message.payload, nowDate);
          var submissionId = String((message && message.payload && message.payload.submissionId) || "");
          var archivedEntry = eventIndex < 0
            ? archivedResponseObservationEntry(savedStats, message && message.payload, nowDate)
            : null;
          var event = eventIndex >= 0
            ? savedStats.events[eventIndex]
            : (savedStats.events || []).filter(function findObserved(candidate) {
                return submissionId && candidate && candidate.submissionId === submissionId;
              })[0] || (archivedEntry && archivedEntry.event) || null;
          sendResponse({
            ok: true,
            updated: updated,
            event: event,
            stats: savedStats
          });
        });
      });
    }).catch(function reportResponseError(error) {
      sendResponse({
        ok: false,
        updated: false,
        error: String((error && error.message) || error || "Usage response reconciliation failed.")
      });
    });

    usageIncrementQueue = job.catch(function keepQueueAlive() {});
  }

  function applyRuntimeModelCatalog(existingStats, catalog, accountKey, contextKey) {
    var cleanCatalog = sanitizeRuntimeModelCatalog(catalog);
    var cleanAccountKey = sanitizeCatalogAccountKey(accountKey);
    var cleanContextKey = sanitizeCatalogContextKey(contextKey);
    var source = existingStats && typeof existingStats === "object"
      ? Object.assign({}, existingStats)
      : createEmptyStats();
    if (!cleanCatalog || !cleanAccountKey) {
      return cloneStats(source);
    }
    activeRuntimeModelCatalog = cleanCatalog;
    activeRuntimeModelCatalogAccountKey = cleanAccountKey;
    activeRuntimeModelCatalogContextKey = cleanContextKey;
    var rebuilt = rebuildStatsFromCompleteEventHistory(source, true);
    if (rebuilt) {
      return rebuilt;
    }
    return cloneStats(source);
  }

  function enqueueRuntimeModelCatalog(message, sendResponse) {
    var job = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function updateCatalog() {
      var cleanCatalog = sanitizeRuntimeModelCatalog(message && message.catalog);
      var accountKey = sanitizeCatalogAccountKey(message && message.accountKey);
      var contextKey = sanitizeCatalogContextKey(message && message.contextKey);
      if (!accountKey) {
        throw new Error("model-catalog-account-binding-unavailable");
      }
      return new Promise(function saveSession(resolve) {
        sessionCatalogSet(cleanCatalog, accountKey, resolve);
      }).then(function remapFromSession() {
        return storageGetPromise().then(function remap(stats) {
          var nextStats = applyRuntimeModelCatalog(
            stats,
            cleanCatalog,
            accountKey,
            contextKey
          );
          return storageSetPromise(nextStats).then(function respond(savedStats) {
            sendResponse({
              ok: true,
              catalogObservedAt: String(cleanCatalog && cleanCatalog.observedAt || ""),
              stats: savedStats
            });
          });
        });
      });
    }).catch(function reportCatalogError(error) {
      sendResponse({
        ok: false,
        error: String((error && error.message) || error || "Model catalog update failed.")
      });
    });
    usageIncrementQueue = job.catch(function keepQueueAlive() {});
  }

  function enqueueStatisticsBackupExport(sendResponse) {
    var job = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function readBackup() {
      return storageGetPromise().then(function respond(stats) {
        var backup = createStatisticsBackup(stats);
        sendResponse({
          ok: true,
          backup: backup,
          summary: backup.summary
        });
      });
    }).catch(function reportBackupError(error) {
      sendResponse({
        ok: false,
        error: String((error && error.message) || error || "Statistics backup failed.")
      });
    });
    usageIncrementQueue = job.catch(function keepQueueAlive() {});
  }

  function enqueueStatisticsBackupImport(message, sendResponse) {
    var mode = String(message && message.mode || "");
    if (mode !== "replace") {
      sendResponse({ ok: false, error: "unsupported-statistics-import-mode" });
      return;
    }

    var backup;
    try {
      backup = sanitizeStatisticsBackup(message && message.backup);
    } catch (error) {
      sendResponse({
        ok: false,
        error: String((error && error.message) || error || "Invalid statistics backup.")
      });
      return;
    }

    var job = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function replaceStatistics() {
      return storageSetPromise(backup.statistics).then(function respond(savedStats) {
        sendResponse({
          ok: true,
          mode: "replace",
          stats: savedStats,
          summary: statisticsBackupSummary(savedStats)
        });
      });
    }).catch(function reportImportError(error) {
      sendResponse({
        ok: false,
        error: String((error && error.message) || error || "Statistics import failed.")
      });
    });
    usageIncrementQueue = job.catch(function keepQueueAlive() {});
  }

  function usageEventsForConversation(stats, conversationId) {
    var cleanConversationId = sanitizeConversationId(conversationId);
    if (!cleanConversationId) {
      return [];
    }
    var retained = stats && Array.isArray(stats.events) ? stats.events : [];
    var archived = Object.keys(stats && stats.responseMigrationIndex || {})
      .map(function archivedEvent(key) {
        return stats.responseMigrationIndex[key];
      });
    var seen = {};
    return retained.concat(archived)
      .filter(function sameConversation(event) {
        return sanitizeConversationId(
          event && (event.conversationId || extractConversationId(event.pageUrl))
        ) === cleanConversationId;
      })
      .map(function safeEvent(event) {
        var dedupeKey = responseMigrationKey(event) ||
          String(event && event.submittedAt || "") + ":" +
          String(event && event.conversationId || "");
        if (seen[dedupeKey]) {
          return null;
        }
        seen[dedupeKey] = true;
        return {
          submissionId: String((event && event.submissionId) || "").slice(0, 96),
          conversationId: cleanConversationId,
          submittedAt: String((event && event.submittedAt) || "").slice(0, 48),
          requestMessageId: sanitizeMessageId(event && event.requestMessageId),
          responseMessageId: sanitizeMessageId(event && event.responseMessageId),
          requestModel: exactRequestModelFromMetadata(event),
          responseModel: exactResponseModelFromMetadata(event)
        };
      }).filter(Boolean)
      .sort(function oldestFirst(left, right) {
        return String(left.submittedAt).localeCompare(String(right.submittedAt));
      });
  }

  function accountRequestSenderOrigin(sender) {
    var rawUrl = String(
      sender && sender.tab && sender.tab.url ||
      sender && sender.url ||
      ""
    );
    if (!rawUrl) {
      return "";
    }
    try {
      var parsed = new URL(rawUrl);
      if (
        parsed.protocol !== "https:" ||
        (parsed.hostname !== "chatgpt.com" && parsed.hostname !== "chat.openai.com")
      ) {
        return "";
      }
      return parsed.origin;
    } catch (_) {
      return "";
    }
  }

  function accountRequestCoordinatorState(origin) {
    var scope = ACCOUNT_REQUEST_COORDINATOR_SCOPE;
    if (!accountRequestCoordinatorStates[scope]) {
      accountRequestCoordinatorStates[scope] = {
        origin: scope,
        queue: [],
        activeCount: 0,
        nextStartAt: 0,
        cooldownUntil: 0,
        timer: null
      };
    }
    return accountRequestCoordinatorStates[scope];
  }

  function accountRequestCoordinatorSession() {
    return typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.session &&
      typeof chrome.storage.session.get === "function" &&
      typeof chrome.storage.session.set === "function"
      ? chrome.storage.session
      : null;
  }

  function accountRequestCoordinatorSnapshot() {
    var states = {};
    Object.keys(accountRequestCoordinatorStates).forEach(function copyState(scope) {
      var state = accountRequestCoordinatorStates[scope];
      if (!state) {
        return;
      }
      states[scope] = {
        nextStartAt: Math.max(0, Number(state.nextStartAt) || 0),
        cooldownUntil: Math.max(0, Number(state.cooldownUntil) || 0)
      };
    });
    var permits = {};
    Object.keys(accountRequestPermits).forEach(function copyPermit(permitId) {
      var permit = accountRequestPermits[permitId];
      if (!permit) {
        return;
      }
      permits[permitId] = {
        origin: String(permit.origin || ACCOUNT_REQUEST_COORDINATOR_SCOPE),
        tabId: Number.isFinite(Number(permit.tabId)) ? Number(permit.tabId) : -1,
        expiresAt: Math.max(0, Number(permit.expiresAt) || 0)
      };
    });
    return {
      version: 1,
      states: states,
      permits: permits
    };
  }

  function persistAccountRequestCoordinator(callback) {
    var done = typeof callback === "function" ? callback : function noop() {};
    var session = accountRequestCoordinatorSession();
    if (!session) {
      done();
      return;
    }
    try {
      session.set({
        [ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY]: accountRequestCoordinatorSnapshot()
      }, done);
    } catch (_) {
      done();
    }
  }

  function restoreAccountRequestPermit(permitId, value, now) {
    var permit = value && typeof value === "object" ? value : {};
    var expiresAt = Math.max(0, Number(permit.expiresAt) || 0);
    if (!permitId || expiresAt <= now || expiresAt > now + ACCOUNT_REQUEST_PERMIT_TTL_MS) {
      return;
    }
    var state = accountRequestCoordinatorState();
    var restored = {
      id: permitId,
      origin: ACCOUNT_REQUEST_COORDINATOR_SCOPE,
      tabId: Number.isFinite(Number(permit.tabId)) ? Number(permit.tabId) : -1,
      expiresAt: expiresAt,
      leaseTimer: null
    };
    accountRequestPermits[permitId] = restored;
    state.activeCount += 1;
    if (typeof setTimeout === "function") {
      restored.leaseTimer = setTimeout(function expireRestoredPermitLease() {
        expireAccountRequestPermit(permitId);
      }, Math.max(0, expiresAt - now));
    }
  }

  function hydrateAccountRequestCoordinator() {
    if (accountRequestCoordinatorHydrationPromise) {
      return accountRequestCoordinatorHydrationPromise;
    }
    accountRequestCoordinatorHydrationPromise = new Promise(function loadCoordinator(resolve) {
      var session = accountRequestCoordinatorSession();
      if (!session) {
        resolve();
        return;
      }
      try {
        session.get([ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY], function readCoordinator(result) {
          var stored = result && result[ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY];
          var now = Date.now();
          var states = stored && stored.states && typeof stored.states === "object"
            ? stored.states
            : {};
          var savedState = states[ACCOUNT_REQUEST_COORDINATOR_SCOPE];
          if (savedState && typeof savedState === "object") {
            var state = accountRequestCoordinatorState();
            state.nextStartAt = Math.max(0, Number(savedState.nextStartAt) || 0);
            state.cooldownUntil = Math.max(0, Number(savedState.cooldownUntil) || 0);
          }
          var permits = stored && stored.permits && typeof stored.permits === "object"
            ? stored.permits
            : {};
          Object.keys(permits).forEach(function restore(permitId) {
            restoreAccountRequestPermit(String(permitId || ""), permits[permitId], now);
          });
          resolve();
        });
      } catch (_) {
        resolve();
      }
    });
    return accountRequestCoordinatorHydrationPromise;
  }

  function accountRequestRespond(item, payload) {
    try {
      item.sendResponse(payload);
    } catch (_) {}
  }

  function clearAccountRequestStateTimer(state) {
    if (state && state.timer && typeof clearTimeout === "function") {
      clearTimeout(state.timer);
    }
    if (state) {
      state.timer = null;
    }
  }

  function scheduleAccountRequestStatePump(state, delayMs) {
    clearAccountRequestStateTimer(state);
    if (typeof setTimeout !== "function") {
      while (state.queue.length) {
        accountRequestRespond(state.queue.shift(), {
          ok: false,
          granted: false,
          stopOperation: true,
          error: "ChatGPT account request coordination is unavailable."
        });
      }
      return;
    }
    state.timer = setTimeout(function resumeAccountRequests() {
      state.timer = null;
      pumpAccountRequestCoordinator(state);
    }, Math.max(0, Number(delayMs) || 0));
  }

  function rejectQueuedAccountRequests(state, retryAfterMs, errorText) {
    clearAccountRequestStateTimer(state);
    while (state.queue.length) {
      accountRequestRespond(state.queue.shift(), {
        ok: false,
        granted: false,
        stopOperation: true,
        status: 429,
        retryAfterMs: Math.max(0, Number(retryAfterMs) || 0),
        error: String(errorText || "ChatGPT account reads are paused by Retry-After.")
      });
    }
  }

  function expireAccountRequestPermit(permitId) {
    var permit = accountRequestPermits[permitId];
    if (!permit) {
      return;
    }
    delete accountRequestPermits[permitId];
    if (permit.leaseTimer && typeof clearTimeout === "function") {
      clearTimeout(permit.leaseTimer);
    }
    var state = accountRequestCoordinatorStates[permit.origin];
    if (state) {
      state.activeCount = Math.max(0, state.activeCount - 1);
    }
    persistAccountRequestCoordinator(function afterExpiredPermitPersisted() {
      if (state) {
        pumpAccountRequestCoordinator(state);
      }
    });
  }

  function pumpAccountRequestCoordinator(state) {
    if (!state) {
      return;
    }
    clearAccountRequestStateTimer(state);
    var now = Date.now();
    while (state.queue.length && state.queue[0].deadlineAt <= now) {
      accountRequestRespond(state.queue.shift(), {
        ok: false,
        granted: false,
        stopOperation: true,
        error: "ChatGPT account request coordination exceeded the safe interactive wait."
      });
    }
    if (!state.queue.length) {
      return;
    }
    if (state.activeCount >= ACCOUNT_REQUEST_MAX_CONCURRENCY) {
      scheduleAccountRequestStatePump(
        state,
        Math.max(0, state.queue[0].deadlineAt - now)
      );
      return;
    }

    var startAt = Math.max(now, state.nextStartAt, state.cooldownUntil);
    if (startAt > now) {
      var waitMs = startAt - now;
      if (waitMs > ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS) {
        rejectQueuedAccountRequests(
          state,
          waitMs,
          "ChatGPT account reads were stopped because Retry-After exceeds the safe interactive wait."
        );
        return;
      }
      var deadlineWait = Math.max(0, state.queue[0].deadlineAt - now);
      scheduleAccountRequestStatePump(state, Math.min(waitMs, deadlineWait));
      return;
    }

    var item = state.queue.shift();
    accountRequestPermitSequence += 1;
    var permitId = "account-permit-" + accountRequestPermitSequence + "-" + now;
    var permit = {
      id: permitId,
      origin: state.origin,
      tabId: item.tabId,
      expiresAt: now + ACCOUNT_REQUEST_PERMIT_TTL_MS,
      startedAt: 0,
      leaseTimer: null
    };
    state.activeCount += 1;
    state.nextStartAt = now + ACCOUNT_REQUEST_MIN_GAP_MS;
    accountRequestPermits[permitId] = permit;
    if (typeof setTimeout === "function") {
      permit.leaseTimer = setTimeout(function expirePermitLease() {
        expireAccountRequestPermit(permitId);
      }, ACCOUNT_REQUEST_PERMIT_TTL_MS);
    }
    persistAccountRequestCoordinator(function grantPersistedPermit() {
      accountRequestRespond(item, {
        ok: true,
        granted: true,
        permitId: permitId
      });
      pumpAccountRequestCoordinator(state);
    });
  }

  function acquireAccountRequestPermit(sender, sendResponse) {
    hydrateAccountRequestCoordinator().then(function coordinatorReady() {
      acquireAccountRequestPermitReady(sender, sendResponse);
    });
    return true;
  }

  function acquireAccountRequestPermitReady(sender, sendResponse) {
    var origin = accountRequestSenderOrigin(sender);
    if (!origin) {
      sendResponse({
        ok: false,
        granted: false,
        stopOperation: true,
        error: "ChatGPT account request coordination requires a ChatGPT tab."
      });
      return false;
    }
    var state = accountRequestCoordinatorState(origin);
    var now = Date.now();
    var remainingCooldown = Math.max(0, state.cooldownUntil - now);
    if (remainingCooldown > ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS) {
      sendResponse({
        ok: false,
        granted: false,
        stopOperation: true,
        status: 429,
        retryAfterMs: remainingCooldown,
        error: "ChatGPT account reads were stopped because Retry-After exceeds the safe interactive wait."
      });
      return false;
    }
    state.queue.push({
      tabId: Number(sender && sender.tab && sender.tab.id),
      sendResponse: sendResponse,
      deadlineAt: now + ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS
    });
    pumpAccountRequestCoordinator(state);
    return true;
  }

  function completeAccountRequestPermit(message, sender, sendResponse) {
    hydrateAccountRequestCoordinator().then(function coordinatorReady() {
      completeAccountRequestPermitReady(message, sender, sendResponse);
    });
    return true;
  }

  function markAccountRequestPermitStarted(message, sender, sendResponse) {
    hydrateAccountRequestCoordinator().then(function coordinatorReady() {
      var permitId = String(message && message.permitId || "");
      var permit = accountRequestPermits[permitId];
      var senderTabId = Number(sender && sender.tab && sender.tab.id);
      if (
        !permit ||
        (
          Number.isFinite(senderTabId) &&
          Number.isFinite(permit.tabId) &&
          permit.tabId !== senderTabId
        )
      ) {
        sendResponse({ ok: false, started: false });
        return;
      }
      var state = accountRequestCoordinatorStates[permit.origin];
      if (!state) {
        sendResponse({ ok: false, started: false });
        return;
      }
      // This message is sent immediately after window.fetch has synchronously
      // started. Using the coordinator's receipt time is conservative and
      // makes the cross-tab gap apply to real network starts rather than to
      // permit creation before storage/callback latency.
      permit.startedAt = Date.now();
      state.nextStartAt = Math.max(
        state.nextStartAt,
        permit.startedAt + ACCOUNT_REQUEST_MIN_GAP_MS
      );
      persistAccountRequestCoordinator(function startedPermitPersisted() {
        sendResponse({ ok: true, started: true });
      });
    });
    return true;
  }

  function completeAccountRequestPermitReady(message, sender, sendResponse) {
    var permitId = String(message && message.permitId || "");
    var permit = accountRequestPermits[permitId];
    var senderTabId = Number(sender && sender.tab && sender.tab.id);
    if (!permit || (Number.isFinite(senderTabId) && Number.isFinite(permit.tabId) && permit.tabId !== senderTabId)) {
      sendResponse({ ok: false, released: false });
      return false;
    }
    delete accountRequestPermits[permitId];
    if (permit.leaseTimer && typeof clearTimeout === "function") {
      clearTimeout(permit.leaseTimer);
    }
    var state = accountRequestCoordinatorStates[permit.origin];
    var rejectForLongCooldown = false;
    var rejectRetryAfterMs = 0;
    if (state) {
      state.activeCount = Math.max(0, state.activeCount - 1);
      if (!Number(permit.startedAt)) {
        // A missing/failed real-start acknowledgement is an exceptional
        // coordination path. Keep a full conservative gap from completion so
        // another tab cannot start based only on the older permit time.
        state.nextStartAt = Math.max(
          state.nextStartAt,
          Date.now() + ACCOUNT_REQUEST_MIN_GAP_MS
        );
      }
      var status = Number(message && message.status) || 0;
      if (status === 429) {
        var retryAfterMs = Math.max(1000, Math.min(
          24 * 60 * 60 * 1000,
          Number(message && message.retryAfterMs) || 1000
        ));
        state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + retryAfterMs);
        if (retryAfterMs > ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS) {
          rejectForLongCooldown = true;
          rejectRetryAfterMs = retryAfterMs;
        }
      }
    }
    persistAccountRequestCoordinator(function completedPermitPersisted() {
      if (state && rejectForLongCooldown) {
        rejectQueuedAccountRequests(
          state,
          rejectRetryAfterMs,
          "ChatGPT account reads were stopped because Retry-After exceeds the safe interactive wait."
        );
      } else if (state) {
        pumpAccountRequestCoordinator(state);
      }
      sendResponse({ ok: true, released: true });
    });
    return true;
  }

  function releaseAccountRequestsForTab(tabId) {
    var cleanTabId = Number(tabId);
    Object.keys(accountRequestCoordinatorStates).forEach(function releaseQueued(origin) {
      var state = accountRequestCoordinatorStates[origin];
      state.queue = state.queue.filter(function keep(item) {
        if (item.tabId !== cleanTabId) {
          return true;
        }
        accountRequestRespond(item, {
          ok: false,
          granted: false,
          stopOperation: true,
          error: "ChatGPT tab closed before the account request could start."
        });
        return false;
      });
    });
    Object.keys(accountRequestPermits).forEach(function releasePermit(permitId) {
      if (accountRequestPermits[permitId] && accountRequestPermits[permitId].tabId === cleanTabId) {
        expireAccountRequestPermit(permitId);
      }
    });
  }

  function resetAccountRequestCoordinatorForTest() {
    Object.keys(accountRequestCoordinatorStates).forEach(function clearState(origin) {
      clearAccountRequestStateTimer(accountRequestCoordinatorStates[origin]);
    });
    Object.keys(accountRequestPermits).forEach(function clearPermit(permitId) {
      var permit = accountRequestPermits[permitId];
      if (permit && permit.leaseTimer && typeof clearTimeout === "function") {
        clearTimeout(permit.leaseTimer);
      }
    });
    accountRequestCoordinatorStates = {};
    accountRequestPermits = {};
    accountRequestPermitSequence = 0;
    var session = accountRequestCoordinatorSession();
    if (session && typeof session.remove === "function") {
      try {
        session.remove([ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY]);
      } catch (_) {}
    }
  }

  function importedConversationStorage() {
    return typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
      ? chrome.storage.local
      : null;
  }

  function importedStorageError(fallback) {
    var runtimeError =
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.lastError;
    return runtimeError
      ? String(runtimeError.message || fallback || "local-storage-failed")
      : String(fallback || "");
  }

  function importedStorageGet(keys, callback) {
    var storage = importedConversationStorage();
    if (!storage || typeof storage.get !== "function") {
      callback(new Error("local-storage-unavailable"));
      return;
    }
    try {
      storage.get(keys, function got(result) {
        var error = importedStorageError("");
        callback(error ? new Error(error) : null, result || {});
      });
    } catch (error) {
      callback(error);
    }
  }

  function importedStorageSet(values, callback) {
    var storage = importedConversationStorage();
    if (!storage || typeof storage.set !== "function") {
      callback(new Error("local-storage-unavailable"));
      return;
    }
    try {
      storage.set(values, function saved() {
        var error = importedStorageError("");
        callback(error ? new Error(error) : null);
      });
    } catch (error) {
      callback(error);
    }
  }

  function importedStorageRemove(keys, callback) {
    var storage = importedConversationStorage();
    if (!storage || typeof storage.remove !== "function" || !keys || !keys.length) {
      callback(null);
      return;
    }
    try {
      storage.remove(keys, function removed() {
        var error = importedStorageError("");
        callback(error ? new Error(error) : null);
      });
    } catch (error) {
      callback(error);
    }
  }

  function importedConversationId(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function importedConversationText(value, maxLength) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength || 500);
  }

  function importedConversationRecordKey(importId, id) {
    var safeImportId = String(importId || "").replace(/[^0-9a-z_-]/gi, "").slice(0, 80);
    var safeId = encodeURIComponent(importedConversationId(id));
    return IMPORTED_CONVERSATION_RECORD_PREFIX + safeImportId + "." + safeId;
  }

  function importedSafePlainValue(value, depth) {
    if (depth > 5 || value == null) {
      return value == null ? null : "";
    }
    if (typeof value === "string") {
      return value.slice(0, 20000);
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.slice(0, 100).map(function safeArray(item) {
        return importedSafePlainValue(item, depth + 1);
      });
    }
    if (typeof value !== "object") {
      return "";
    }
    var clean = {};
    Object.keys(value).slice(0, 100).forEach(function safeProperty(key) {
      if (/authorization|cookie|token|account.?id|session|credential/i.test(key)) {
        return;
      }
      clean[String(key).slice(0, 100)] = importedSafePlainValue(value[key], depth + 1);
    });
    return clean;
  }

  function sanitizeImportedMessage(message, index) {
    var source = message && typeof message === "object" ? message : {};
    return {
      id: importedConversationId(source.id) || String(index),
      role: importedConversationText(source.role, 40),
      authorName: importedConversationText(source.authorName, 120),
      createTime: importedConversationText(source.createTime || source.createdAt, 80),
      createdAt: importedConversationText(source.createdAt || source.createTime, 80),
      updateTime: importedConversationText(source.updateTime || source.updatedAt, 80),
      contentType: importedConversationText(source.contentType, 80),
      model: importedConversationText(source.model, 180),
      selectedPublicModel: importedConversationText(source.selectedPublicModel, 180),
      selectedPublicMode: importedConversationText(source.selectedPublicMode, 120),
      selectedPublicModeLabel: importedConversationText(source.selectedPublicModeLabel, 120),
      requestModel: importedConversationText(source.requestModel, 180),
      responseModel: importedConversationText(source.responseModel, 180),
      reasoningEffort: importedConversationText(source.reasoningEffort, 80),
      thinkingPreamble: Boolean(source.thinkingPreamble),
      modelCandidatePresent: Boolean(source.modelCandidatePresent),
      parameters: importedSafePlainValue(source.parameters, 0) || {},
      features: Array.isArray(source.features)
        ? source.features.map(function feature(value) {
            return importedConversationText(value, 120);
          }).filter(Boolean).slice(0, 100)
        : [],
      content: String(source.content == null ? source.text || "" : source.content),
      text: String(source.text == null ? source.content || "" : source.text)
    };
  }

  function sanitizeImportedConversation(conversation) {
    var source = conversation && typeof conversation === "object" ? conversation : {};
    var id = importedConversationId(source.id || source.conversationId || source.conversation_id);
    if (!id) {
      return null;
    }
    var projectId = importedConversationId(source.projectId || source.project_id);
    var folderId = projectId
      ? ""
      : importedConversationId(source.folderId || source.folder_id);
    return {
      id: id,
      title: importedConversationText(source.title, 500) || "ChatGPT conversation",
      url: String(source.url || "").slice(0, 1000),
      createTime: importedConversationText(source.createTime || source.createdAt, 80),
      createdAt: importedConversationText(source.createdAt || source.createTime, 80),
      updateTime: importedConversationText(source.updateTime || source.updatedAt, 80),
      updatedAt: importedConversationText(source.updatedAt || source.updateTime, 80),
      source: "official-data-export",
      archived: Boolean(source.archived),
      projectId: projectId,
      projectName: projectId ? importedConversationText(source.projectName, 240) : "",
      folderId: folderId,
      folderName: folderId ? importedConversationText(source.folderName, 240) : "",
      groupType: projectId ? "project" : folderId ? "folder" : "",
      messages: (Array.isArray(source.messages) ? source.messages : [])
        .map(sanitizeImportedMessage)
    };
  }

  function importedConversationMetadata(conversation) {
    return {
      id: conversation.id,
      title: conversation.title,
      createTime: conversation.createTime,
      updateTime: conversation.updateTime,
      archived: Boolean(conversation.archived),
      projectId: conversation.projectId,
      projectName: conversation.projectName,
      folderId: conversation.folderId,
      folderName: conversation.folderName,
      groupType: conversation.groupType,
      source: "official-data-export"
    };
  }

  function importedConversationImportId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID().replace(/-/g, "");
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  }

  function beginImportedConversationReplace(message, sendResponse) {
    var importId = importedConversationImportId();
    var staging = {
      version: 1,
      importId: importId,
      sourceName: importedConversationText(message && message.sourceName, 260) || "conversations.json",
      expectedCount: Math.max(0, Math.min(250000, Number(message && message.expectedCount) || 0)),
      importedAt: new Date().toISOString(),
      conversations: [],
      recordKeys: []
    };
    importedStorageSet({ [IMPORTED_CONVERSATION_STAGING_KEY]: staging }, function started(error) {
      sendResponse(error
        ? { ok: false, error: String(error.message || error) }
        : { ok: true, importId: importId });
    });
  }

  function appendImportedConversationChunk(message, sendResponse) {
    importedStorageGet([IMPORTED_CONVERSATION_STAGING_KEY], function withStaging(error, result) {
      if (error) {
        sendResponse({ ok: false, error: String(error.message || error) });
        return;
      }
      var staging = result[IMPORTED_CONVERSATION_STAGING_KEY];
      var importId = String(message && message.importId || "");
      if (!staging || staging.importId !== importId) {
        sendResponse({ ok: false, error: "conversation-import-session-expired" });
        return;
      }
      var seen = {};
      staging.conversations.forEach(function remember(item) {
        if (item && item.id) {
          seen[item.id] = true;
        }
      });
      var records = {};
      (Array.isArray(message && message.conversations) ? message.conversations : [])
        .forEach(function addConversation(raw) {
          var conversation = sanitizeImportedConversation(raw);
          if (!conversation || seen[conversation.id]) {
            return;
          }
          seen[conversation.id] = true;
          var key = importedConversationRecordKey(importId, conversation.id);
          records[key] = conversation;
          staging.recordKeys.push(key);
          staging.conversations.push(importedConversationMetadata(conversation));
        });
      records[IMPORTED_CONVERSATION_STAGING_KEY] = staging;
      importedStorageSet(records, function appended(saveError) {
        sendResponse(saveError
          ? { ok: false, error: String(saveError.message || saveError) }
          : { ok: true, importedCount: staging.conversations.length });
      });
    });
  }

  function finishImportedConversationReplace(message, sendResponse) {
    importedStorageGet(
      [IMPORTED_CONVERSATION_STAGING_KEY, IMPORTED_CONVERSATION_INDEX_KEY],
      function withIndexes(error, result) {
        if (error) {
          sendResponse({ ok: false, error: String(error.message || error) });
          return;
        }
        var staging = result[IMPORTED_CONVERSATION_STAGING_KEY];
        var importId = String(message && message.importId || "");
        if (!staging || staging.importId !== importId) {
          sendResponse({ ok: false, error: "conversation-import-session-expired" });
          return;
        }
        if (
          staging.expectedCount &&
          staging.conversations.length !== staging.expectedCount
        ) {
          sendResponse({
            ok: false,
            error: "conversation-import-count-mismatch",
            importedCount: staging.conversations.length
          });
          return;
        }
        var previous = result[IMPORTED_CONVERSATION_INDEX_KEY] || {};
        var index = Object.assign({}, staging, {
          complete: true,
          count: staging.conversations.length
        });
        importedStorageSet({ [IMPORTED_CONVERSATION_INDEX_KEY]: index }, function committed(saveError) {
          if (saveError) {
            sendResponse({ ok: false, error: String(saveError.message || saveError) });
            return;
          }
          var obsolete = [IMPORTED_CONVERSATION_STAGING_KEY]
            .concat(Array.isArray(previous.recordKeys) ? previous.recordKeys : []);
          importedStorageRemove(obsolete, function cleaned(cleanError) {
            sendResponse({
              ok: true,
              count: index.count,
              importedAt: index.importedAt,
              warning: cleanError ? String(cleanError.message || cleanError) : ""
            });
          });
        });
      }
    );
  }

  function abortImportedConversationReplace(message, sendResponse) {
    importedStorageGet([IMPORTED_CONVERSATION_STAGING_KEY], function withStaging(error, result) {
      if (error) {
        sendResponse({ ok: false, error: String(error.message || error) });
        return;
      }
      var staging = result[IMPORTED_CONVERSATION_STAGING_KEY];
      if (
        !staging ||
        (message && message.importId && staging.importId !== String(message.importId))
      ) {
        sendResponse({ ok: true, removed: false });
        return;
      }
      importedStorageRemove(
        [IMPORTED_CONVERSATION_STAGING_KEY].concat(
          Array.isArray(staging.recordKeys) ? staging.recordKeys : []
        ),
        function aborted(removeError) {
          sendResponse(removeError
            ? { ok: false, error: String(removeError.message || removeError) }
            : { ok: true, removed: true });
        }
      );
    });
  }

  function listImportedConversations(sendResponse) {
    importedStorageGet([IMPORTED_CONVERSATION_INDEX_KEY], function withIndex(error, result) {
      if (error) {
        sendResponse({ ok: false, error: String(error.message || error) });
        return;
      }
      var index = result[IMPORTED_CONVERSATION_INDEX_KEY] || {};
      sendResponse({
        ok: true,
        conversations: Array.isArray(index.conversations) ? index.conversations : [],
        count: Number(index.count) || 0,
        sourceName: String(index.sourceName || ""),
        importedAt: String(index.importedAt || ""),
        complete: Boolean(index.complete)
      });
    });
  }

  function collectImportedConversations(message, sendResponse) {
    importedStorageGet([IMPORTED_CONVERSATION_INDEX_KEY], function withIndex(error, result) {
      if (error) {
        sendResponse({ ok: false, error: String(error.message || error) });
        return;
      }
      var index = result[IMPORTED_CONVERSATION_INDEX_KEY] || {};
      var importId = String(index.importId || "");
      var metadata = Array.isArray(index.conversations) ? index.conversations : [];
      var requested = [];
      var seen = {};
      (Array.isArray(message && message.ids) ? message.ids : []).forEach(function unique(idValue) {
        var id = importedConversationId(idValue);
        if (id && !seen[id]) {
          seen[id] = true;
          requested.push(id);
        }
      });
      var available = {};
      metadata.forEach(function remember(item) {
        if (item && item.id) {
          available[item.id] = true;
        }
      });
      var keys = requested.filter(function known(id) {
        return available[id];
      }).map(function recordKey(id) {
        return importedConversationRecordKey(importId, id);
      });
      importedStorageGet(keys, function withRecords(readError, records) {
        if (readError) {
          sendResponse({ ok: false, error: String(readError.message || readError) });
          return;
        }
        var conversations = [];
        var failures = [];
        requested.forEach(function ordered(id) {
          var conversation = records[importedConversationRecordKey(importId, id)];
          if (conversation) {
            conversations.push(conversation);
          } else {
            failures.push({ id: id, error: "conversation-not-in-imported-export" });
          }
        });
        sendResponse({
          ok: true,
          conversations: conversations,
          failures: failures,
          warnings: [],
          requestedCount: requested.length,
          complete: failures.length === 0,
          source: "official-data-export"
        });
      });
    });
  }

  function handleMessage(message, sender, sendResponse) {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === "account.request.acquire") {
      return acquireAccountRequestPermit(sender, sendResponse);
    }

    if (message.type === "account.request.started") {
      return markAccountRequestPermitStarted(message, sender, sendResponse);
    }

    if (message.type === "account.request.complete") {
      return completeAccountRequestPermit(message, sender, sendResponse);
    }

    if (message.type === "conversation.projectDirectories.get") {
      return readRenderedProjectDirectories(sender, sendResponse);
    }

    if (message.type === "conversation.import.start") {
      beginImportedConversationReplace(message, sendResponse);
      return true;
    }

    if (message.type === "conversation.import.chunk") {
      appendImportedConversationChunk(message, sendResponse);
      return true;
    }

    if (message.type === "conversation.import.finish") {
      finishImportedConversationReplace(message, sendResponse);
      return true;
    }

    if (message.type === "conversation.import.abort") {
      abortImportedConversationReplace(message, sendResponse);
      return true;
    }

    if (message.type === "conversation.import.list") {
      listImportedConversations(sendResponse);
      return true;
    }

    if (message.type === "conversation.import.collect") {
      collectImportedConversations(message, sendResponse);
      return true;
    }

    if (message.type === "usage.get") {
      storageGet(function respond(stats, error) {
        if (error) { sendResponse({ ok: false, error: error.message }); return; }
        // 带上当前状态记录再刷角标,否则 OpenAI 异常期间打开面板会把角标的 !/? 状态徽标刷回普通数字。
        statusGet(function withStatus(record) {
          setBadge(stats, record);
          sendResponse({ ok: true, stats: stats });
        });
      });
      return true;
    }

    if (message.type === "usage.pending.get") {
      storageGet(function respondPending(stats, error) {
        if (error) { sendResponse({ ok: false, error: error.message }); return; }
        var conversationId = sanitizeConversationId(message.conversationId);
        var events = usageEventsForConversation(stats, conversationId);
        sendResponse({
          ok: true,
          conversationId: conversationId,
          events: events,
          pendingCount: events.filter(function pending(event) {
            return !event.responseModel;
          }).length
        });
      });
      return true;
    }

    if (message.type === "settings.get") {
      settingsGet(function respond(settings, error) {
        if (error) { sendResponse({ ok: false, error: error.message }); return; }
        sendResponse({ ok: true, settings: settings });
      });
      return true;
    }

    if (message.type === "settings.set") {
      settingsSet(message.settings || {}, function respond(settings, error) {
        if (error) { sendResponse({ ok: false, error: error.message }); return; }
        sendResponse({ ok: true, settings: settings });
      });
      return true;
    }

    if (message.type === "openai.status.get") {
      statusGet(function respondWithCachedStatus(statusRecord) {
        // 只有"成功且有内容"的缓存才直接返回;缓存为空或上次抓取失败(ok:false)时强制重新抓取。
        // 否则一次失败被缓存后,之后每次读取/刷新都卡在旧的失败结果上,表现为"状态无法获取、刷新没用"。
        var hasGoodCache = statusRecord && statusRecord.ok && statusRecord.status;
        if (hasGoodCache && message.cached !== false) {
          sendResponse({ ok: statusRecord.ok, status: statusRecord.status, statusRecord: statusRecord, error: statusRecord.error });
          return;
        }
        refreshOpenAIStatus(sendResponse);
      });
      return true;
    }

    if (message.type === "usage.increment") {
      enqueueUsageIncrement(message, sender, sendResponse);
      return true;
    }

    if (message.type === "usage.response") {
      enqueueUsageResponse(message, sendResponse);
      return true;
    }

    if (message.type === "usage.catalog") {
      enqueueRuntimeModelCatalog(message, sendResponse);
      return true;
    }

    if (message.type === "usage.catalog.get") {
      sessionCatalogGet(message && message.accountKey, function respondCatalog(catalog) {
        sendResponse({ ok: true, catalog: catalog || null });
      });
      return true;
    }

    if (message.type === "usage.catalog.binding.salt") {
      catalogBindingSalt(function respondBindingSalt(salt) {
        sendResponse({ ok: true, salt: String(salt || "") });
      });
      return true;
    }

    if (message.type === "usage.catalog.refresh.claim") {
      claimRuntimeCatalogRefresh(message, function respondClaim(result) {
        sendResponse({
          ok: true,
          claimed: Boolean(result && result.claimed),
          key: String((result && result.key) || "")
        });
      });
      return true;
    }

    if (message.type === "usage.catalog.refresh.release") {
      releaseRuntimeCatalogRefreshClaim(message, function respondRelease(result) {
        sendResponse({
          ok: true,
          released: Boolean(result && result.released),
          key: String((result && result.key) || "")
        });
      });
      return true;
    }

    if (message.type === "usage.data.export") {
      enqueueStatisticsBackupExport(sendResponse);
      return true;
    }

    if (message.type === "usage.data.import") {
      enqueueStatisticsBackupImport(message, sendResponse);
      return true;
    }

    if (message.type === "usage.reset") {
      var resetJob = usageIncrementQueue.catch(function ignorePreviousFailure() {}).then(function resetStats() {
        return storageSetPromise(createEmptyStats());
      }).then(function respond(savedStats) {
        sendResponse({ ok: true, stats: savedStats });
      }).catch(function failed(error) {
        sendResponse({ ok: false, error: String(error && error.message || error) });
      });
      usageIncrementQueue = resetJob.catch(function keepQueueAlive() {});
      return true;
    }

    if (message.type === "usage.download") {
      downloadViaApi(message, sendResponse);
      return true;
    }

    if (message.type === "usage.download.cancel") {
      cancelDownloadViaApi(message, sendResponse);
      return true;
    }

    if (message.type === "badge.setFilter") {
      setBadgeFilter(message.filter);
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        try { chrome.storage.local.set({ chatgptUsageBadgeFilter: badgeFilter }); } catch (_) {}
      }
      storageGet(function withStats(stats, error) {
        if (error) { sendResponse({ ok: false, error: error.message }); return; }
        statusGet(function withStatus(record) {
          setBadge(stats, record);
          sendResponse({ ok: true, filter: badgeFilter });
        });
      });
      return true;
    }

    return false;
  }

  function finalDownloadState(download) {
    var state = String(download && download.state || "");
    if (state === "complete") {
      return { ok: true, state: "complete", error: "" };
    }
    if (state === "interrupted") {
      return {
        ok: false,
        state: "interrupted",
        error: String(download && download.error || "download-interrupted")
      };
    }
    return null;
  }

  function waitForDownloadFinalState(downloads, downloadId, callback) {
    var settled = false;
    var timer = null;
    var onChanged = null;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      if (timer && typeof clearTimeout === "function") {
        clearTimeout(timer);
      }
      if (
        onChanged &&
        downloads.onChanged &&
        typeof downloads.onChanged.removeListener === "function"
      ) {
        try { downloads.onChanged.removeListener(onChanged); } catch (_) {}
      }
      callback(Object.assign({ downloadId: downloadId }, result));
    }

    onChanged = function downloadChanged(delta) {
      if (!delta || Number(delta.id) !== Number(downloadId)) {
        return;
      }
      var state = String(delta.state && delta.state.current || "");
      if (state === "complete") {
        finish({ ok: true, state: "complete", error: "" });
      } else if (state === "interrupted") {
        finish({
          ok: false,
          state: "interrupted",
          error: String(delta.error && delta.error.current || "download-interrupted")
        });
      }
    };

    if (
      !downloads.onChanged ||
      typeof downloads.onChanged.addListener !== "function" ||
      typeof downloads.search !== "function"
    ) {
      finish({
        ok: false,
        state: "unavailable",
        error: "download-final-state-unavailable"
      });
      return;
    }

    downloads.onChanged.addListener(onChanged);
    timer = setTimeout(function downloadTimedOut() {
      finish({
        ok: false,
        state: "timeout",
        error: "download-final-state-timeout"
      });
    }, DOWNLOAD_FINAL_TIMEOUT_MS);

    try {
      downloads.search({ id: downloadId }, function inspectCurrentDownload(items) {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.lastError) {
          finish({
            ok: false,
            state: "missing",
            error: String(chrome.runtime.lastError.message || chrome.runtime.lastError)
          });
          return;
        }
        var item = Array.isArray(items) ? items[0] : null;
        if (!item) {
          finish({
            ok: false,
            state: "missing",
            error: "download-not-found"
          });
          return;
        }
        var finalState = finalDownloadState(item);
        if (finalState) {
          finish(finalState);
        }
      });
    } catch (error) {
      finish({
        ok: false,
        state: "missing",
        error: String((error && error.message) || error || "download-status-failed")
      });
    }
  }

  // A numeric id only proves that Chrome accepted the download request.
  // Keep the message channel open until Chrome reports complete/interrupted.
  function downloadViaApi(message, sendResponse) {
    var operationId = String(message && message.operationId || "").slice(0, 120);
    try {
      if (typeof chrome === "undefined" || !chrome.downloads || typeof chrome.downloads.download !== "function") {
        sendResponse({ ok: false, error: "no-downloads-api" });
        return;
      }
      chrome.downloads.download(
        { url: message.url, filename: message.filename, saveAs: false },
        function onStarted(downloadId) {
          if (chrome.runtime && chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (typeof downloadId !== "number") {
            sendResponse({
              ok: false,
              state: "missing",
              error: "download-did-not-start"
            });
            return;
          }
          if (operationId) {
            activeDownloadsByOperationId[operationId] = downloadId;
          }
          if (operationId && cancelledDownloadOperationIds[operationId]) {
            delete cancelledDownloadOperationIds[operationId];
            try {
              chrome.downloads.cancel(downloadId, function cancelledBeforeWait() {
                if (chrome.runtime && chrome.runtime.lastError) {
                  // Final-state monitoring below reports the actual outcome.
                }
              });
            } catch (_) {}
          }
          waitForDownloadFinalState(chrome.downloads, downloadId, function finished(result) {
            if (operationId) {
              delete activeDownloadsByOperationId[operationId];
              delete cancelledDownloadOperationIds[operationId];
            }
            sendResponse(Object.assign({ downloadId: downloadId }, result || {}));
          });
        }
      );
    } catch (error) {
      sendResponse({ ok: false, error: String((error && error.message) || error) });
    }
  }

  function cancelDownloadViaApi(message, sendResponse) {
    var operationId = String(message && message.operationId || "").slice(0, 120);
    var explicitId = Number(message && message.downloadId);
    var downloadId = Number.isFinite(explicitId) && explicitId >= 0
      ? explicitId
      : activeDownloadsByOperationId[operationId];
    if (
      typeof chrome === "undefined" ||
      !chrome.downloads ||
      typeof chrome.downloads.cancel !== "function"
    ) {
      sendResponse({ ok: false, error: "no-download-cancel-api" });
      return;
    }
    if (typeof downloadId !== "number") {
      if (operationId) {
        cancelledDownloadOperationIds[operationId] = true;
      }
      sendResponse({ ok: true, pending: true });
      return;
    }
    try {
      chrome.downloads.cancel(downloadId, function cancelled() {
        if (chrome.runtime && chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            downloadId: downloadId,
            error: String(chrome.runtime.lastError.message || chrome.runtime.lastError)
          });
          return;
        }
        sendResponse({ ok: true, downloadId: downloadId, cancelled: true });
      });
    } catch (error) {
      sendResponse({ ok: false, error: String((error && error.message) || error) });
    }
  }

  function addChromeListener(event, listener) {
    if (event && typeof event.addListener === "function") {
      event.addListener.apply(event, Array.prototype.slice.call(arguments, 1));
    }
  }

  if (typeof chrome !== "undefined" && chrome.runtime) {
    addChromeListener(chrome.runtime.onMessage, handleMessage);
    // SW 启动即恢复角标范围过滤器(只加载变量,不在这里强行刷角标,以免覆盖状态徽标);
    // 后续 setBadge(计数/状态刷新/面板推送范围)都会带上这个过滤器生效。
    loadBadgeFilter();
    addChromeListener(chrome.runtime.onInstalled, function handleInstalled() {
      ensureStatusAlarm();
      loadBadgeFilter(function afterBadgeFilter() { refreshOpenAIStatus(); });
    });
    addChromeListener(chrome.runtime.onStartup, function handleStartup() {
      ensureStatusAlarm();
      loadBadgeFilter(function afterBadgeFilter() { refreshOpenAIStatus(); });
    });
    addChromeListener(chrome.alarms && chrome.alarms.onAlarm, function handleAlarm(alarm) {
      if (alarm && alarm.name === STATUS_ALARM_NAME) {
        loadBadgeFilter(function afterBadgeFilter() { refreshOpenAIStatus(); });
      } else if (alarm && alarm.name === DATE_ROLLOVER_ALARM_NAME) {
        loadBadgeFilter(function afterBadgeFilter() {
          storageGet(function refreshDateBadge(stats, error) {
            if (error) return;
            statusGet(function withStatus(record) { setBadge(stats, record); });
          });
        });
      }
    });
    addChromeListener(chrome.tabs && chrome.tabs.onUpdated, function handleTabUpdated(tabId, changeInfo, tab) {
      if (changeInfo && changeInfo.url && isChatGPTUrl(changeInfo.url)) {
        injectIsolatedContentScripts(tabId);
        return;
      }

      if (changeInfo && changeInfo.status === "complete" && tab && isChatGPTUrl(tab.url)) {
        injectIsolatedContentScripts(tabId);
      }
    });
    addChromeListener(chrome.tabs && chrome.tabs.onRemoved, function handleTabRemoved(tabId) {
      releaseAccountRequestsForTab(tabId);
    });
    addChromeListener(chrome.webRequest && chrome.webRequest.onBeforeRequest, function handleBeforeRequest(details) {
      observeNetworkRequest(details);
    }, { urls: CHATGPT_URL_PATTERNS }, ["requestBody"]);
    ensureStatusAlarm();
  }

  root.ChatGPTUsageBackground = {
    SETTINGS_KEY: SETTINGS_KEY,
    STORAGE_KEY: STORAGE_KEY,
    IMPORTED_CONVERSATION_INDEX_KEY: IMPORTED_CONVERSATION_INDEX_KEY,
    IMPORTED_CONVERSATION_STAGING_KEY: IMPORTED_CONVERSATION_STAGING_KEY,
    IMPORTED_CONVERSATION_RECORD_PREFIX: IMPORTED_CONVERSATION_RECORD_PREFIX,
    STATUS_ALARM_NAME: STATUS_ALARM_NAME,
    STATUS_ALARM_PERIOD_MINUTES: STATUS_ALARM_PERIOD_MINUTES,
    STATUS_KEY: STATUS_KEY,
    STATISTICS_BACKUP_FORMAT: STATISTICS_BACKUP_FORMAT,
    STATISTICS_BACKUP_VERSION: STATISTICS_BACKUP_VERSION,
    ACCOUNT_REQUEST_MAX_CONCURRENCY: ACCOUNT_REQUEST_MAX_CONCURRENCY,
    ACCOUNT_REQUEST_MIN_GAP_MS: ACCOUNT_REQUEST_MIN_GAP_MS,
    ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS: ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS,
    ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY: ACCOUNT_REQUEST_COORDINATOR_SESSION_KEY,
    ISOLATED_CONTENT_SCRIPT_FILES: ISOLATED_CONTENT_SCRIPT_FILES.slice(),
    applyIncrement: applyIncrement,
    applyResponseObservation: applyResponseObservation,
    applyRuntimeModelCatalog: applyRuntimeModelCatalog,
    actionIconPaths: actionIconPaths,
    badgeText: badgeText,
    computeBadgeCount: computeBadgeCount,
    setBadgeFilter: setBadgeFilter,
    scheduleBadgeRollover: scheduleBadgeRollover,
    sanitizeBadgeFilter: sanitizeBadgeFilter,
    createDefaultSettings: createDefaultSettings,
    createEmptyStats: createEmptyStats,
    cloneStats: cloneStats,
    rebuildStatsFromCompleteEventHistory: rebuildStatsFromCompleteEventHistory,
    createStatisticsBackup: createStatisticsBackup,
    sanitizeStatisticsBackup: sanitizeStatisticsBackup,
    statisticsBackupSummary: statisticsBackupSummary,
    extractConversationId: extractConversationId,
    actionTitle: actionTitle,
    createOpenAIStatusRecord: createOpenAIStatusRecord,
    fetchOpenAIStatus: fetchOpenAIStatus,
    isChatGPTUrl: isChatGPTUrl,
    isConversationSubmissionUrl: isConversationSubmissionUrl,
    isAbnormalOpenAIStatus: isAbnormalOpenAIStatus,
    openAIStatusState: openAIStatusState,
    sanitizeSettings: sanitizeSettings,
    mergeSettings: mergeSettings,
    settingsSet: settingsSet,
    dateSettingNoLaterThanToday: dateSettingNoLaterThanToday,
    sanitizeOpenAIStatusRecord: sanitizeOpenAIStatusRecord,
    resolvePayloadModelInfo: resolvePayloadModelInfo,
    mergeRecentNetworkObservation: mergeRecentNetworkObservation,
    observeNetworkRequest: observeNetworkRequest,
    parseNetworkRequestBody: parseNetworkRequestBody,
    parseNetworkRequestDetails: parseNetworkRequestDetails,
    sanitizeModelName: sanitizeModelName,
    mergeOpenAIStatusPayloads: mergeOpenAIStatusPayloads,
    sanitizeOpenAIStatusPayload: sanitizeOpenAIStatusPayload,
    catalogForAccountKey: catalogForAccountKey,
    extractRenderedProjectDirectoriesFromMainWorld: extractRenderedProjectDirectoriesFromMainWorld,
    sanitizeRenderedProjectDirectories: sanitizeRenderedProjectDirectories,
    statusBadgeColor: statusBadgeColor,
    statusBadgeText: statusBadgeText,
    finalDownloadState: finalDownloadState,
    waitForDownloadFinalState: waitForDownloadFinalState,
    sanitizeVariantStats: sanitizeVariantStats,
    sanitizeImportedConversation: sanitizeImportedConversation,
    importedConversationRecordKey: importedConversationRecordKey,
    usageEventsForConversation: usageEventsForConversation,
    _testAccountRequests: {
      acquire: acquireAccountRequestPermit,
      started: markAccountRequestPermitStarted,
      complete: completeAccountRequestPermit,
      reset: resetAccountRequestCoordinatorForTest,
      snapshot: accountRequestCoordinatorSnapshot
    },
    todayKey: todayKey,
    eventDateKey: eventDateKey,
    totalCount: totalCount
  };

  if (typeof module === "object" && module.exports) {
    module.exports = root.ChatGPTUsageBackground;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
