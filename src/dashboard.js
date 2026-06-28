(function initUsageDashboard(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTUsageDashboard = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function dashboardFactory(root) {
  "use strict";

  var COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#be123c", "#4f46e5"];
  var CHART_SIZE = { width: 360, height: 192 };
  var STORAGE_KEY = "chatgptModelUsageStats.v1";
  var DEFAULT_LANGUAGE = "zh";
  var CHATGPT_MODE_SLUG_RE = /^gpt-(?:(?:\d+(?:[-_.]\d+)*)|4o|4\.5|4\.1|4|3\.5)[-_.](thinking|instant|fast|auto|pro)$/i;
  var CHATGPT_INTERNAL_FAMILY_RE = /^gpt-\d+-\d+(?:[-_.][a-z0-9][a-z0-9._-]*)?$/i;
  var USAGE_THEME_VARIABLES = {
    light: {
      "--usage-text-primary": "#18201c",
      "--usage-text-control": "#344139",
      "--usage-text-secondary": "#475569",
      "--usage-text-muted": "#64748b",
      "--usage-text-body-subtle": "#334155",
      "--usage-text-disabled": "#94a3b8",
      "--usage-text-on-accent": "#fff",
      "--usage-text-inverse": "#fff",
      "--usage-chart-point-stroke": "#fff",
      "--usage-surface-page": "#fbfcfa",
      "--usage-surface-panel": "#fbfcfa",
      "--usage-surface-transparent": "transparent",
      "--usage-surface-track": "#eef2ec",
      "--usage-surface-hover": "#f1f5ef",
      "--usage-surface-row-hover": "#f8fafc",
      "--usage-surface-chip": "#f1f5f9",
      "--usage-surface-disabled": "#d8e1d7",
      "--usage-surface-control-hover": "#fff",
      "--usage-border-divider": "#e8ede6",
      "--usage-border-control": "#ccd4ca",
      "--usage-border-disabled": "#cbd5c7",
      "--usage-border-option": "#d8e0d6",
      "--usage-border-hover": "#b9c7b5",
      "--usage-border-panel": "#dde3dc",
      "--usage-border-chart-grid": "#d9e1d7",
      "--usage-border-section": "#eef2f7",
      "--usage-border-error": "#fecaca",
      "--usage-accent-primary": "#245f49",
      "--usage-accent-primary-hover": "#1f513f",
      "--usage-accent-link": "#2563eb",
      "--usage-accent-link-hover": "#1d4ed8",
      "--usage-shadow-accent": "rgba(36,95,73,.2)",
      "--usage-shadow-active-tab": "rgba(24,32,28,.08)",
      "--usage-shadow-tooltip": "rgba(15,23,42,.2)",
      "--usage-tooltip-surface": "#111827",
      "--usage-status-info-bg": "#e0f2fe",
      "--usage-status-info-text": "#075985",
      "--usage-status-info-dot": "#0284c7",
      "--usage-status-operational-bg": "#dcfce7",
      "--usage-status-operational-text": "#166534",
      "--usage-status-operational-dot": "#16a34a",
      "--usage-status-degraded-bg": "#fef3c7",
      "--usage-status-degraded-text": "#92400e",
      "--usage-status-degraded-dot": "#d97706",
      "--usage-status-major-bg": "#fee2e2",
      "--usage-status-major-text": "#991b1b",
      "--usage-status-major-dot": "#dc2626",
      "--usage-status-maintenance-unknown-bg": "#e2e8f0",
      "--usage-status-maintenance-unknown-text": "#475569",
      "--usage-status-maintenance-unknown-dot": "#64748b",
      "--usage-warning-text": "#9a3412",
      "--usage-error-status-text": "#b91c1c",
      "--usage-error-surface": "#fef2f2",
      "--usage-error-text": "#7f1d1d",
      "--usage-error-text-strong": "#991b1b",
      "--usage-skeleton-start": "#f8fafc",
      "--usage-skeleton-middle": "#e2e8f0"
    },
    dark: {
      "--usage-text-primary": "#ececf1",
      "--usage-text-control": "#ececf1",
      "--usage-text-secondary": "#b4b4b4",
      "--usage-text-muted": "#8e8ea0",
      "--usage-text-body-subtle": "#b4b4b4",
      "--usage-text-disabled": "#565869",
      "--usage-text-on-accent": "#ffffff",
      "--usage-text-inverse": "#ececf1",
      "--usage-chart-point-stroke": "#2a2b32",
      "--usage-surface-page": "#2a2b32",
      "--usage-surface-panel": "#2a2b32",
      "--usage-surface-transparent": "transparent",
      "--usage-surface-track": "#212121",
      "--usage-surface-hover": "#343541",
      "--usage-surface-row-hover": "#343541",
      "--usage-surface-chip": "#343541",
      "--usage-surface-disabled": "#343541",
      "--usage-surface-control-hover": "#343541",
      "--usage-border-divider": "#3e3f4b",
      "--usage-border-control": "#565869",
      "--usage-border-disabled": "#444654",
      "--usage-border-option": "#3e3f4b",
      "--usage-border-hover": "#565869",
      "--usage-border-panel": "#3e3f4b",
      "--usage-border-chart-grid": "#3e3f4b",
      "--usage-border-section": "#3e3f4b",
      "--usage-border-error": "#7f1d1d",
      "--usage-accent-primary": "#10a37f",
      "--usage-accent-primary-hover": "#19c37d",
      "--usage-accent-link": "#10a37f",
      "--usage-accent-link-hover": "#19c37d",
      "--usage-shadow-accent": "rgba(16,163,127,.3)",
      "--usage-shadow-active-tab": "rgba(0,0,0,.3)",
      "--usage-shadow-tooltip": "rgba(0,0,0,.3)",
      "--usage-tooltip-surface": "#171717",
      "--usage-status-info-bg": "#17212b",
      "--usage-status-info-text": "#7dd3fc",
      "--usage-status-info-dot": "#38bdf8",
      "--usage-status-operational-bg": "#0f2f1f",
      "--usage-status-operational-text": "#86efac",
      "--usage-status-operational-dot": "#16a34a",
      "--usage-status-degraded-bg": "#3a2a10",
      "--usage-status-degraded-text": "#fbbf24",
      "--usage-status-degraded-dot": "#d97706",
      "--usage-status-major-bg": "#3a1518",
      "--usage-status-major-text": "#f87171",
      "--usage-status-major-dot": "#dc2626",
      "--usage-status-maintenance-unknown-bg": "#343541",
      "--usage-status-maintenance-unknown-text": "#b4b4b4",
      "--usage-status-maintenance-unknown-dot": "#8e8ea0",
      "--usage-warning-text": "#fbbf24",
      "--usage-error-status-text": "#f87171",
      "--usage-error-surface": "#3a1518",
      "--usage-error-text": "#fca5a5",
      "--usage-error-text-strong": "#f87171",
      "--usage-skeleton-start": "#2a2b32",
      "--usage-skeleton-middle": "#3e3f4b"
    }
  };
  var I18N = {
    zh: {
      all: "全选",
      api: "API",
      chartView: "图表",
      chartTitle: "模型使用趋势",
      chartXAxis: "日期",
      chartYAxis: "次数",
      chartLegend: "图例",
      chars: "字符",
      close: "关闭",
      conversations: "对话",
      conversationIndex: "对话",
      countTimes: "{count} 次",
      days7: "7 天",
      days30: "30 天",
      days90: "90 天",
      detailMode: "模式",
      formatImage: "PNG",
      items: "{count} 项",
      language: "语言",
      languageToggleLabel: "切换语言",
      latest10: "最近 10 条",
      loadFailed: "加载失败。",
      loading: "加载中...",
      modelList: "模型列表",
      modelUsage: "模型使用",
      noConversations: "当前选中模型没有已索引对话。",
      noModelConversations: "暂无对应对话",
      noModelRecords: "暂无模型记录。",
      noRecentRecords: "暂无最近记录。",
      none: "清空",
      open: "打开",
      openaiStatusSubtitle: "来自 status.openai.com",
      openaiStatusTitle: "OpenAI 服务状态",
      openaiStatusView: "OpenAI 状态",
      parameterCombinations: "参数",
      parameterLatest: "最新参数",
      range: "范围",
      recentRecords: "最近记录",
      realtimeService: "Realtime 服务",
      refresh: "刷新",
      selected: "已选择 {count} 个模型",
      separator: " | ",
      serviceComponents: "关键组件",
      source: "来源",
      statusDegraded: "性能下降",
      statusMaintenance: "维护中",
      statusMajor: "严重中断",
      statusOperational: "正常",
      statusPartial: "部分中断",
      statusUnknown: "未知",
      lastChecked: "最后检查",
      textView: "文字",
      todayTotal: "今日 {today}",
      total: "{count} 次总计",
      allTimeTotal: "全部 {count} 次",
      rangeTotal: "范围内 {count} 次",
      unableStatus: "无法读取 OpenAI 状态。",
      updated: "更新",
      unmarkedSource: "未标记来源",
      variants: "型号",
      zh: "中文"
    },
    en: {
      all: "Select all",
      api: "API",
      chartView: "Chart",
      chartTitle: "Model usage trend",
      chartXAxis: "Date",
      chartYAxis: "Count",
      chartLegend: "Legend",
      chars: "chars",
      close: "Close",
      conversations: "Conversations",
      conversationIndex: "Conversations",
      countTimes: "{count} times",
      days7: "7 days",
      days30: "30 days",
      days90: "90 days",
      detailMode: "mode",
      formatImage: "PNG",
      items: "{count} items",
      language: "Language",
      languageToggleLabel: "Switch language",
      latest10: "Latest 10",
      loadFailed: "Load failed.",
      loading: "Loading...",
      modelList: "Model list",
      modelUsage: "Model usage",
      noConversations: "No indexed conversations for selected models.",
      noModelConversations: "No conversations for this record",
      noModelRecords: "No model records yet.",
      noRecentRecords: "No recent records.",
      none: "Clear",
      open: "Open",
      openaiStatusSubtitle: "From status.openai.com",
      openaiStatusTitle: "OpenAI service status",
      openaiStatusView: "OpenAI status",
      parameterCombinations: "Parameters",
      parameterLatest: "Latest parameters",
      range: "Range",
      recentRecords: "Recent records",
      realtimeService: "Realtime service",
      refresh: "Refresh",
      selected: "{count} selected",
      separator: " | ",
      serviceComponents: "Key components",
      source: "Source",
      statusDegraded: "Degraded performance",
      statusMaintenance: "Under maintenance",
      statusMajor: "Major outage",
      statusOperational: "Operational",
      statusPartial: "Partial outage",
      statusUnknown: "Unknown",
      lastChecked: "Last checked",
      textView: "Text",
      todayTotal: "Today {today}",
      total: "{count} total",
      allTimeTotal: "All time {count}",
      rangeTotal: "Range {count}",
      unableStatus: "Unable to read OpenAI status.",
      updated: "Updated",
      unmarkedSource: "unmarked source",
      variants: "Variants",
      zh: "中文"
    }
  };

  I18N.zh = Object.assign({}, I18N.zh, {
    all: "全选",
    chartView: "统计",
    exportView: "导出",
    exportSubtitle: "勾选对话,逐个导出为所选格式",
    exportFormatMarkdown: "Markdown",
    exportFormatPdf: "PDF",
    exportFormatPng: "图片",
    exportFormatDocx: "Word",
    exportEmpty: "未检测到对话。请在 ChatGPT 对话页打开一段对话后再试。",
    exportRunning: "正在导出…",
    exportDone: "已导出 {name}",
    exportDoneFiles: "{count} 个文件",
    exportFailed: "导出失败:{error}",
    exportOpenPage: "请在 ChatGPT 对话页使用导出。",
    exportSelectAll: "全选",
    exportSelectNone: "清空",
    exportSelectedCount: "已选 {count} 个",
    exportListEmpty: "侧边栏暂无对话。可在 ChatGPT 左侧滚动加载更多后再来选。",
    exportNoSelection: "请先勾选要导出的对话。",
    exportProgress: "正在读取所选对话…",
    conversationIndex: "对话",
    countTimes: "{count} 次",
    customRange: "自定义日期",
    detailMode: "模式",
    endDate: "结束",
    featureAgentMode: "Agent Mode",
    featureAudio: "音频",
    featureCanvas: "Canvas",
    featureDeepResearch: "Deep Research",
    featureImageGeneration: "图片生成",
    featureRealtime: "Realtime",
    featureStats: "功能",
    featureWebSearch: "联网搜索",
    formatImage: "PNG",
    languageToggleEn: "EN",
    languageToggleZh: "中文",
    errorChromeMessaging: "Chrome 消息服务不可用。",
    errorOpenAIStatus: "OpenAI 状态请求失败。",
    loadFailed: "加载失败。",
    loading: "加载中...",
    modelUsage: "模型使用",
    noModelConversations: "暂无对应对话",
    noModelRecords: "暂无模型记录。",
    none: "清空",
    openaiStatusSubtitle: "status.openai.com",
    openaiStatusTitle: "ChatGPT 网页状态",
    openaiStatusView: "状态",
    parameterCombinations: "参数",
    parameterLatest: "最新参数",
    refresh: "刷新",
    selected: "已选择 {count} 个模型",
    startDate: "开始",
    statusDegraded: "性能下降",
    statusMaintenance: "维护中",
    statusMajor: "严重中断",
    statusOperational: "正常",
    statusPartial: "部分中断",
    statusUnknown: "未知",
    todayTotal: "今日 {today}",
    todayOnly: "今日 {today}",
    total: "{count} 次总计",
    unableStatus: "无法读取 OpenAI 状态。",
    variants: "调用型号"
  });

  I18N.en = Object.assign({}, I18N.en, {
    chartView: "Usage",
    exportView: "Export",
    exportSubtitle: "Pick conversations, export each to the chosen format",
    exportFormatMarkdown: "Markdown",
    exportFormatPdf: "PDF",
    exportFormatPng: "Image",
    exportFormatDocx: "Word",
    exportEmpty: "No conversation found. Open a ChatGPT conversation, then try again.",
    exportRunning: "Exporting…",
    exportDone: "Exported {name}",
    exportDoneFiles: "{count} files",
    exportFailed: "Export failed: {error}",
    exportOpenPage: "Open a ChatGPT conversation page to export.",
    exportSelectAll: "Select all",
    exportSelectNone: "Clear",
    exportSelectedCount: "{count} selected",
    exportListEmpty: "No chats in the sidebar yet. Scroll the ChatGPT sidebar to load more, then return.",
    exportNoSelection: "Select at least one conversation to export.",
    exportProgress: "Reading selected chats…",
    customRange: "Custom dates",
    endDate: "End",
    all: "All",
    none: "Clear",
    featureAgentMode: "Agent Mode",
    featureAudio: "Audio",
    featureCanvas: "Canvas",
    featureDeepResearch: "Deep Research",
    featureImageGeneration: "Image generation",
    featureRealtime: "Realtime",
    featureStats: "Features",
    featureWebSearch: "Web search",
    languageToggleEn: "EN",
    languageToggleZh: "中文",
    errorChromeMessaging: "Chrome runtime messaging is unavailable.",
    errorOpenAIStatus: "OpenAI status request failed.",
    openaiStatusTitle: "ChatGPT web status",
    openaiStatusView: "Status",
    parameterCombinations: "Parameters",
    parameterLatest: "Latest parameters",
    startDate: "Start",
    todayOnly: "Today {today}"
  });

  function normalizeLanguage(value) {
    return value === "en" ? "en" : DEFAULT_LANGUAGE;
  }

  function currentLanguage(state) {
    return normalizeLanguage(state && state.language);
  }

  function normalizeView(value) {
    return value === "status" || value === "export" ? value : "chart";
  }

  function isActiveStatusView(state) {
    return normalizeView(state && state.activeView) === "status";
  }


  function text(state, key, vars) {
    var language = currentLanguage(state);
    var dictionary = I18N[language] || I18N[DEFAULT_LANGUAGE];
    var value = dictionary[key] || I18N.en[key] || key;
    return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, function replace(_, name) {
      return vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : "";
    });
  }

  function todayKey(date) {
    var value = date || new Date();
    var year = value.getFullYear();
    var month = String(value.getMonth() + 1).padStart(2, "0");
    var day = String(value.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function parseDateKey(key) {
    var parts = String(key || "").split("-").map(Number);
    return new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
  }

  function addDays(date, days) {
    var next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function countTotal(totals) {
    return Object.keys(totals || {}).reduce(function sum(total, model) {
      return total + (Number(totals[model]) || 0);
    }, 0);
  }

  function normalizedDashboardModelName(model) {
    return String(model || "")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/_/g, "-")
      .replace(/\s+/g, "-")
      .trim()
      .toLowerCase();
  }

  function isFeatureOnlyModelName(model) {
    var key = normalizedDashboardModelName(model).replace(/[^a-z0-9]+/g, "");
    return /^(agentmode|deepresearch|deepsearch|imagegeneration|websearch|search|realtime|audio|voice|canvas)(?:v\d+)?$/.test(key);
  }

  function isDeniedDashboardModelName(model) {
    var clean = normalizedDashboardModelName(model);
    var key = clean.replace(/[^a-z0-9]+/g, "");
    var isInternalFamily = CHATGPT_INTERNAL_FAMILY_RE.test(clean);
    return !clean ||
      /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) ||
      /^(?:gpt)?lastusedmodel$/.test(key) ||
      /^gpt-5\.\d+(?:$|[-_.])/.test(clean) ||
      (isInternalFamily && !CHATGPT_MODE_SLUG_RE.test(clean)) ||
      isFeatureOnlyModelName(clean);
  }

  function hasDeniedDashboardModelName(model) {
    return Boolean(String(model || "").trim() && isDeniedDashboardModelName(model));
  }

  function modelParametersFromMetadata(metadata) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    if (source.modelParameters && typeof source.modelParameters === "object") {
      return source.modelParameters;
    }
    if (source.parameters && typeof source.parameters === "object") {
      return source.parameters;
    }
    return {};
  }

  function isDashboardModelValid(model, metadata, rawModel) {
    // 以规范化模型键(model)、原始键(rawModel)与展示标签(label)为权威身份。
    // apiModel / chatgptModel / parameters.model 对 instant 等模式变体会合法地是裸 slug——
    // 例如 gpt-5-5-instant 的 apiModel 就是 gpt-5-5,而裸 gpt-5-5 会被归一成 "gpt-5.5" 命中
    // 视觉标签否决规则。若据此否决,sanitize 会把整条 instant 记录丢掉、面板显示 0。
    // 可疑/视觉标签已由后台 isStoredModelValid 在入库时拦截,这里只需信任规范化后的键与标签。
    return !hasDeniedDashboardModelName(rawModel) &&
      !isDeniedDashboardModelName(model) &&
      !hasDeniedDashboardModelName(metadata && metadata.label);
  }

  function emptyStats() {
    return {
      totals: {},
      byDate: {},
      models: {},
      sessionsByModel: {},
      variantsByModel: {},
      featuresByModel: {},
      parametersByModel: {},
      events: [],
      lastUpdated: null
    };
  }

  function sanitizeSessionModels(models, sourceModels) {
    var clean = {};
    Object.keys(models || {}).forEach(function copy(model) {
      var metadata = sourceModels && sourceModels[model];
      var count = Number(models[model]) || 0;
      if (count > 0 && isDashboardModelValid(model, metadata, model)) {
        clean[model] = count;
      }
    });
    return clean;
  }

  function sanitizeDashboardStats(stats) {
    var source = stats && typeof stats === "object" ? stats : {};
    var clean = emptyStats();
    var sourceModels = source.models || {};

    Object.keys(source.totals || {}).forEach(function copyTotal(model) {
      var metadata = sourceModels[model];
      var count = Number(source.totals[model]) || 0;
      if (count <= 0 || !isDashboardModelValid(model, metadata, model)) {
        return;
      }
      clean.totals[model] = count;
      clean.models[model] = Object.assign({ label: model }, metadata || {});
    });

    Object.keys(source.byDate || {}).forEach(function copyDate(dateKey) {
      var day = {};
      Object.keys(source.byDate[dateKey] || {}).forEach(function copyDayModel(model) {
        var metadata = sourceModels[model];
        var count = Number(source.byDate[dateKey][model]) || 0;
        if (count <= 0 || !isDashboardModelValid(model, metadata, model)) {
          return;
        }
        day[model] = count;
      });
      if (Object.keys(day).length) {
        clean.byDate[dateKey] = day;
      }
    });

    ["parametersByModel", "featuresByModel"].forEach(function copyAggregate(collection) {
      Object.keys(source[collection] || {}).forEach(function copyModel(model) {
        var metadata = sourceModels[model];
        if (isDashboardModelValid(model, metadata, model)) {
          clean[collection][model] = source[collection][model];
        }
      });
    });

    Object.keys(source.variantsByModel || {}).forEach(function copyVariants(model) {
      var metadata = sourceModels[model];
      if (!isDashboardModelValid(model, metadata, model)) {
        return;
      }
      var variants = {};
      Object.keys((source.variantsByModel[model] && source.variantsByModel[model].variants) || {}).forEach(function copyVariant(id) {
        var variant = source.variantsByModel[model].variants[id];
        if (isDashboardModelValid(id, variant, id)) {
          variants[id] = variant;
        }
      });
      clean.variantsByModel[model] = Object.assign({}, source.variantsByModel[model], { variants: variants });
    });

    Object.keys(source.sessionsByModel || {}).forEach(function copySessions(model) {
      var metadata = sourceModels[model];
      if (!isDashboardModelValid(model, metadata, model)) {
        return;
      }
      clean.sessionsByModel[model] = {};
      Object.keys(source.sessionsByModel[model] || {}).forEach(function copySession(id) {
        var session = Object.assign({}, source.sessionsByModel[model][id] || {});
        session.models = sanitizeSessionModels(session.models, sourceModels);
        clean.sessionsByModel[model][id] = session;
      });
    });

    clean.events = (Array.isArray(source.events) ? source.events : []).filter(function keepEvent(event) {
      return event && isDashboardModelValid(event.model, event, event.model);
    });
    clean.lastUpdated = source.lastUpdated || null;
    return clean;
  }

  var PARAMETER_KEY_ORDER = {
    model: 0,
    model_slug: 1,
    selected_model: 2,
    default_model_slug: 3,
    "reasoning.effort": 4,
    reasoning_effort: 5,
    "text.verbosity": 6,
    verbosity: 7,
    temperature: 8,
    top_p: 9,
    max_tokens: 10,
    tools: 11
  };

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function hasParameterValue(value) {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value === false || value === 0) {
      return true;
    }
    return value !== null && value !== undefined && String(value).trim() !== "";
  }

  function isDisplayModelParameter(key) {
    return !/^(model|model_slug|selected_model|default_model_slug|model_id)$/i.test(String(key || ""));
  }

  function orderedParameterKeys(parameters) {
    return Object.keys(parameters || {})
      .filter(function keepValue(key) {
        return isDisplayModelParameter(key) && hasParameterValue(parameters[key]);
      })
      .sort(function byKnownOrder(a, b) {
        var orderA = Object.prototype.hasOwnProperty.call(PARAMETER_KEY_ORDER, a) ? PARAMETER_KEY_ORDER[a] : 100;
        var orderB = Object.prototype.hasOwnProperty.call(PARAMETER_KEY_ORDER, b) ? PARAMETER_KEY_ORDER[b] : 100;
        return orderA - orderB || a.localeCompare(b);
      });
  }

  function formatParameterValue(value) {
    if (Array.isArray(value)) {
      return "[" + value.map(formatParameterValue).join(", ") + "]";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return String(value);
  }

  function parameterSignature(parameters) {
    var keys = orderedParameterKeys(parameters);
    if (!keys.length) {
      return "";
    }
    return keys.map(function toPart(key) {
      return key + "=" + formatParameterValue(parameters[key]);
    }).join("\u0001");
  }

  function formatParameterSummary(parameters, maxParts) {
    var keys = orderedParameterKeys(parameters);
    var limit = Number(maxParts) || 4;
    var visible = keys.slice(0, limit).map(function toPart(key) {
      return key + "=" + formatParameterValue(parameters[key]);
    });
    if (keys.length > limit) {
      visible.push("+" + (keys.length - limit));
    }
    return visible.join(" | ");
  }

  function normalizeParameterCombination(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    var parameters = isPlainObject(value.parameters) ? value.parameters : value;
    var signature = parameterSignature(parameters);
    if (!signature) {
      return null;
    }
    return {
      count: Math.max(1, Number(value.count) || 0),
      parameters: parameters,
      signature: signature,
      lastSubmittedAt: String(value.lastSubmittedAt || value.lastUsedAt || "")
    };
  }

  function storedParameterCombinations(stats, model) {
    var modelStats = stats && stats.parametersByModel && stats.parametersByModel[model];
    var combinations = modelStats && modelStats.combinations;
    if (!combinations) {
      return [];
    }
    var source = Array.isArray(combinations)
      ? combinations
      : Object.keys(combinations).map(function toCombination(key) {
          return combinations[key];
        });
    return source.map(normalizeParameterCombination).filter(Boolean);
  }

  function eventParameterCombinations(stats, model, events) {
    var groups = {};
    (events || stats.events || []).forEach(function collect(event) {
      if (!event || event.model !== model || !isPlainObject(event.modelParameters)) {
        return;
      }
      var signature = parameterSignature(event.modelParameters);
      if (!signature) {
        return;
      }
      if (!groups[signature]) {
        groups[signature] = {
          count: 0,
          parameters: event.modelParameters,
          signature: signature,
          lastSubmittedAt: ""
        };
      }
      groups[signature].count += 1;
      if (String(event.submittedAt || "") > String(groups[signature].lastSubmittedAt || "")) {
        groups[signature].lastSubmittedAt = String(event.submittedAt || "");
      }
    });
    return Object.keys(groups).map(function toValue(signature) {
      return groups[signature];
    });
  }

  function parameterCombinations(stats, model, limit, events) {
    stats = sanitizeDashboardStats(stats || {});
    var hasFilteredEvents = Array.isArray(events) && events.length > 0;
    var combinations = hasFilteredEvents ? eventParameterCombinations(stats || {}, model, events) : storedParameterCombinations(stats || {}, model);
    if (!combinations.length && !Array.isArray(events)) {
      combinations = eventParameterCombinations(stats || {}, model);
    }
    return combinations
      .sort(function byCountThenRecent(a, b) {
        return b.count - a.count || String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt));
      })
      .slice(0, limit || combinations.length);
  }

  function normalizeVariantEntry(value, fallbackName) {
    if (!value || typeof value !== "object") {
      return null;
    }

    var name = String(value.name || fallbackName || "").replace(/\s+/g, " ").trim();
    var count = Number(value.count) || 0;
    if (!name || count <= 0) {
      return null;
    }

    return {
      name: name,
      count: count,
      mode: String(value.mode || ""),
      apiModel: String(value.apiModel || ""),
      lastSubmittedAt: String(value.lastSubmittedAt || "")
    };
  }

  function storedModelVariants(stats, model) {
    var modelStats = stats && stats.variantsByModel && stats.variantsByModel[model];
    var variants = modelStats && modelStats.variants;
    if (!variants) {
      return [];
    }

    return Object.keys(variants).map(function toVariant(key) {
      return normalizeVariantEntry(variants[key], key);
    }).filter(Boolean);
  }

  function eventModelVariants(stats, model, events) {
    var groups = {};
    (events || stats.events || []).forEach(function collect(event) {
      if (!event || event.model !== model) {
        return;
      }
      var name = String(
        (event.modelParameters && event.modelParameters.model) ||
          event.chatgptModel ||
          event.apiModel ||
          ""
      ).replace(/\s+/g, " ").trim();
      if (!name) {
        return;
      }
      if (!groups[name]) {
        groups[name] = {
          name: name,
          count: 0,
          mode: event.modelMode || "",
          apiModel: event.apiModel || "",
          lastSubmittedAt: ""
        };
      }
      groups[name].count += 1;
      if (String(event.submittedAt || "") > groups[name].lastSubmittedAt) {
        groups[name].lastSubmittedAt = String(event.submittedAt || "");
      }
    });

    return Object.keys(groups).map(function toValue(key) {
      return groups[key];
    });
  }

  function modelVariants(stats, model, limit, events) {
    stats = sanitizeDashboardStats(stats || {});
    var hasEventRows = Array.isArray(events) && events.length > 0;
    var hasEventArgument = Array.isArray(events);
    var variants = hasEventRows ? eventModelVariants(stats || {}, model, events) : storedModelVariants(stats || {}, model);
    if (!variants.length && !hasEventArgument) {
      variants = eventModelVariants(stats || {}, model);
    }
    return variants
      .sort(function byCountThenRecent(a, b) {
        return b.count - a.count || String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt));
      })
      .slice(0, limit || variants.length);
  }

  function featureLabel(state, id) {
    var key = {
      image_generation: "featureImageGeneration",
      deep_research: "featureDeepResearch",
      agent_mode: "featureAgentMode",
      web_search: "featureWebSearch",
      realtime: "featureRealtime",
      audio: "featureAudio",
      canvas: "featureCanvas"
    }[id];
    return key ? text(state, key) : id;
  }

  function normalizeDashboardFeatureId(value) {
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
    return "";
  }

  function modelFeatures(stats, model, state, limit) {
    stats = sanitizeDashboardStats(stats || {});
    var events = rangeEvents(stats, state, model);
    var hasFilteredEvents = events.length > 0;
    var featureStats = stats && stats.featuresByModel && stats.featuresByModel[model];
    var features = featureStats && featureStats.features ? featureStats.features : {};
    var rows = [];
    var lookup = null;

    function storedFeatureInRange(feature) {
      if (!hasExplicitDateRange(state || {})) {
        return true;
      }
      if (!lookup) {
        lookup = dateRangeLookup(stats, state || {});
      }
      var submittedAt = feature && feature.lastSubmittedAt;
      return Boolean(submittedAt && lookup[eventDateKey({ submittedAt: submittedAt })]);
    }

    function addStoredFeatureRows(onlyMissing) {
      Object.keys(features).forEach(function toFeature(rawId) {
        var id = normalizeDashboardFeatureId(rawId);
        var feature = features[rawId];
        if (!id || onlyMissing && rows.some(function same(row) { return row.id === id; })) {
          return;
        }
        if (!storedFeatureInRange(feature)) {
          return;
        }
        var count = feature && typeof feature === "object" ? Number(feature.count) || 0 : Number(feature) || 0;
        if (count <= 0) {
          return;
        }
        var existing = rows.find(function same(row) { return row.id === id; });
        if (!existing) {
          rows.push({
            id: id,
            label: featureLabel(state, id),
            count: count,
            lastSubmittedAt: String((feature && feature.lastSubmittedAt) || "")
          });
          return;
        }
        existing.count += count;
        if (String((feature && feature.lastSubmittedAt) || "") > existing.lastSubmittedAt) {
          existing.lastSubmittedAt = String((feature && feature.lastSubmittedAt) || "");
        }
      });
    }

    if (!hasFilteredEvents) {
      addStoredFeatureRows(false);
    }

    if (hasFilteredEvents) {
      events.forEach(function collect(event) {
        if (!event || event.model !== model || !Array.isArray(event.usageFeatures)) {
          return;
        }
        event.usageFeatures.forEach(function collectFeature(id) {
          var clean = normalizeDashboardFeatureId(id);
          if (!clean) {
            return;
          }
          var existing = rows.find(function same(row) { return row.id === clean; });
          if (!existing) {
            existing = { id: clean, label: featureLabel(state, clean), count: 0, lastSubmittedAt: "" };
            rows.push(existing);
          }
          existing.count += 1;
          if (String(event.submittedAt || "") > existing.lastSubmittedAt) {
            existing.lastSubmittedAt = String(event.submittedAt || "");
          }
        });
      });
      addStoredFeatureRows(true);
    }

    return rows.sort(function byCount(a, b) {
      return b.count - a.count || String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt));
    }).slice(0, limit || rows.length);
  }

  function sendMessage(message, state) {
    if (root && typeof root.ChatGPTUsageDashboardMessageHandler === "function") {
      try {
        var localResponse = root.ChatGPTUsageDashboardMessageHandler(message);
        if (localResponse !== undefined) {
          return Promise.resolve(localResponse);
        }
      } catch (error) {
        return Promise.reject(error);
      }
    }

    var runtime = typeof chrome !== "undefined" && chrome && chrome.runtime ? chrome.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== "function") {
      return Promise.reject(new Error(text(state, "errorChromeMessaging")));
    }

    return new Promise(function executor(resolve, reject) {
      runtime.sendMessage(message, function handleResponse(response) {
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function loadStats() {
    return sendMessage({ type: "usage.get" }).then(function normalize(response) {
      return sanitizeDashboardStats(response && response.stats ? response.stats : emptyStats());
    });
  }

  function loadSettings() {
    return sendMessage({ type: "settings.get" }).then(function normalize(response) {
      return response && response.settings ? response.settings : { language: DEFAULT_LANGUAGE, startDate: "", endDate: "" };
    }).catch(function defaultSettings() {
      return { language: DEFAULT_LANGUAGE, startDate: "", endDate: "" };
    });
  }

  function loadOpenAIStatus(state, force) {
    // force=true(用户点刷新)时带 cached:false,让后台真正走网络重新抓取,而不是回旧缓存。
    return sendMessage({ type: "openai.status.get", cached: force ? false : true }, state).then(function normalize(response) {
      if (response && response.ok && response.status) {
        return response.status;
      }
      throw new Error((response && response.error) || text(state, "errorOpenAIStatus"));
    });
  }

  function ensureOpenAIStatus(state, force) {
    if (!state) {
      return Promise.resolve(null);
    }
    if (!force && (state.openaiStatusLoading || state.openaiStatusLoaded)) {
      return state.openaiStatusRequest || Promise.resolve(state.openaiStatus);
    }
    state.openaiStatusLoading = true;
    state.openaiStatusLoaded = false;
    state.openaiStatusError = "";
    state.openaiStatusRequest = loadOpenAIStatus(state, force).then(function loaded(status) {
      state.openaiStatus = status;
      state.openaiStatusError = "";
      state.openaiStatusLoaded = true;
      state.openaiStatusLoading = false;
      state.openaiStatusRequest = null;
      if (isActiveStatusView(state)) {
        render(state);
      }
      return status;
    }).catch(function failed(error) {
      state.openaiStatus = null;
      state.openaiStatusError = String((error && error.message) || error || text(state, "unableStatus"));
      state.openaiStatusLoaded = true;
      state.openaiStatusLoading = false;
      state.openaiStatusRequest = null;
      if (isActiveStatusView(state)) {
        render(state);
      }
      return null;
    });
    return state.openaiStatusRequest;
  }

  function saveSettings(state) {
    return sendMessage({
      type: "settings.set",
      settings: {
        language: normalizeLanguage(state.language),
        startDate: normalizeDateInput(state.startDate),
        endDate: normalizeDateInput(state.endDate)
      }
    }, state);
  }

  function normalizeDateInput(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function defaultStartDate(stats) {
    stats = sanitizeDashboardStats(stats || {});
    var keys = Object.keys(stats.byDate || {}).sort();
    var end = parseDateKey(todayKey());
    var earliest = keys.length ? parseDateKey(keys[0]) : end;
    var last30 = addDays(end, -29);
    return todayKey(earliest > last30 ? earliest : last30);
  }

  function defaultEndDate() {
    return todayKey();
  }

  function dateRange(stats, startDate, endDate) {
    var startKey = normalizeDateInput(startDate) || defaultStartDate(stats || {});
    var endKey = normalizeDateInput(endDate) || defaultEndDate();
    if (startKey > endKey) {
      var swap = startKey;
      startKey = endKey;
      endKey = swap;
    }
    var start = parseDateKey(startKey);
    var end = parseDateKey(endKey);

    var dates = [];
    for (var date = start; date <= end; date = addDays(date, 1)) {
      dates.push(todayKey(date));
    }
    return dates;
  }

  function eventDateKey(event) {
    var date = new Date(event && event.submittedAt);
    return Number.isNaN(date.getTime()) ? "" : todayKey(date);
  }

  function dateRangeLookup(stats, state) {
    var lookup = {};
    dateRange(stats || {}, state && state.startDate, state && state.endDate).forEach(function add(date) {
      lookup[date] = true;
    });
    return lookup;
  }

  function hasExplicitDateRange(state) {
    return Boolean(normalizeDateInput(state && state.startDate) || normalizeDateInput(state && state.endDate));
  }

  function modelTotalsInRange(stats, state) {
    stats = sanitizeDashboardStats(stats || {});
    var totals = {};
    Object.keys(stats.totals || {}).forEach(function initialize(model) {
      totals[model] = 0;
    });
    dateRange(stats, state && state.startDate, state && state.endDate).forEach(function addDate(date) {
      Object.keys((stats.byDate && stats.byDate[date]) || {}).forEach(function addModel(model) {
        totals[model] = (Number(totals[model]) || 0) + (Number(stats.byDate[date][model]) || 0);
      });
    });
    return totals;
  }

  function rangeEvents(stats, state, model) {
    stats = sanitizeDashboardStats(stats || {});
    var lookup = dateRangeLookup(stats, state || {});
    return (stats.events || []).filter(function keepEvent(event) {
      return event &&
        (!model || event.model === model) &&
        Boolean(lookup[eventDateKey(event)]);
    });
  }

  function eligibleModelsInRange(state) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    var totals = modelTotalsInRange(state.stats, state);
    return Object.keys(totals).filter(function hasPositiveTotal(model) {
      return Number(totals[model] || 0) > 0;
    }).sort(function byCount(a, b) {
      return Number(totals[b] || 0) - Number(totals[a] || 0) || a.localeCompare(b);
    });
  }

  function selectedModels(state) {
    var selection = state.selectedModels || {};
    return eligibleModelsInRange(state).filter(function selected(model) {
      return selection[model];
    });
  }

  function ensureSelection(state) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    state.selectedModels = state.selectedModels && typeof state.selectedModels === "object" ? state.selectedModels : {};
    var models = eligibleModelsInRange(state);
    var eligible = {};
    models.forEach(function markEligible(model) {
      eligible[model] = true;
    });
    Object.keys(state.selectedModels).forEach(function removeStale(model) {
      if (!eligible[model]) {
        delete state.selectedModels[model];
      }
    });
    if (!models.some(function isSelected(model) { return state.selectedModels[model]; })) {
      models.slice(0, 5).forEach(function select(model) {
        state.selectedModels[model] = true;
      });
    }
    models.forEach(function keepKnown(model) {
      if (!(model in state.selectedModels)) {
        state.selectedModels[model] = false;
      }
    });
  }

  function chartSeries(stats, models, startDate, endDate) {
    stats = sanitizeDashboardStats(stats || {});
    var dates = dateRange(stats, startDate, endDate);
    return {
      dates: dates,
      series: models.map(function toSeries(model, index) {
        return {
          model: model,
          color: COLORS[index % COLORS.length],
          values: dates.map(function valueForDate(date) {
            return Number((stats.byDate[date] && stats.byDate[date][model]) || 0);
          })
        };
      })
    };
  }

  function svgPath(points) {
    if (!points.length) {
      return "";
    }
    var tension = 0.4;
    var path = "M" + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (var index = 0; index < points.length - 1; index += 1) {
      var previous = points[index - 1] || points[index];
      var point = points[index];
      var next = points[index + 1];
      var afterNext = points[index + 2] || next;
      var controlOneX = point.x + ((next.x - previous.x) / 6) * tension;
      var controlOneY = point.y + ((next.y - previous.y) / 6) * tension;
      var controlTwoX = next.x - ((afterNext.x - point.x) / 6) * tension;
      var controlTwoY = next.y - ((afterNext.y - point.y) / 6) * tension;
      path += " C" + controlOneX.toFixed(2) + " " + controlOneY.toFixed(2) + " " + controlTwoX.toFixed(2) + " " + controlTwoY.toFixed(2) + " " + next.x.toFixed(2) + " " + next.y.toFixed(2);
    }
    return path;
  }

  function renderChart(stats, models, state) {
    var width = CHART_SIZE.width;
    var height = CHART_SIZE.height;
    var left = 34;
    var right = 12;
    var top = 34;
    var bottom = 62;
    var data = chartSeries(stats, models, state.startDate, state.endDate);
    var max = Math.max(
      1,
      data.series.reduce(function maxSeries(total, series) {
        return Math.max(total, Math.max.apply(Math, series.values));
      }, 0)
    );
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var denom = Math.max(1, data.dates.length - 1);
    var grid = [0, max * 0.25, max * 0.5, max * 0.75, max].map(function gridLine(value) {
      var y = top + plotHeight - (value / max) * plotHeight;
      return '<line x1="' + left + '" x2="' + (width - right) + '" y1="' + y + '" y2="' + y + '" class="usage-grid"/><text x="' + (left - 6) + '" y="' + (y + 4) + '" class="usage-axis usage-axis-y" text-anchor="end">' + Math.round(value) + "</text>";
    }).join("");
    var seriesSvg = data.series.map(function renderSeries(series) {
      var points = series.values.map(function point(value, index) {
        return {
          x: left + (index / denom) * plotWidth,
          y: top + plotHeight - (value / max) * plotHeight,
          value: value,
          date: data.dates[index]
        };
      });
      var circles = points.map(function renderPoint(point) {
        return '<circle class="usage-point" cx="' + point.x + '" cy="' + point.y + '" r="3.5" fill="' + series.color + '" data-model="' + escapeHtml(series.model) + '" data-date="' + point.date + '" data-value="' + point.value + '"/>';
      }).join("");
      return '<path class="usage-line" d="' + svgPath(points) + '" fill="none" stroke="' + series.color + '"/>' + circles;
    }).join("");
    var labelIndexes = [];
    if (data.dates.length <= 5) {
      data.dates.forEach(function addDateLabel(date, index) {
        labelIndexes.push(index);
      });
    } else {
      for (var labelIndex = 0; labelIndex < 5; labelIndex += 1) {
        var dateIndex = Math.round(labelIndex * (data.dates.length - 1) / 4);
        if (labelIndexes[labelIndexes.length - 1] !== dateIndex) {
          labelIndexes.push(dateIndex);
        }
      }
    }
    var labels = labelIndexes.map(function renderDateLabel(index) {
      var anchor = index === 0 ? "start" : (index === data.dates.length - 1 ? "end" : "middle");
      var x = left + (index / denom) * plotWidth;
      return '<text x="' + x + '" y="' + (height - 44) + '" class="usage-axis usage-axis-date" text-anchor="' + anchor + '">' + data.dates[index].slice(5) + "</text>";
    }).join("");
    var legendX = left;
    var legendY = height - 12;
    var legend = data.series.map(function renderLegend(series, index) {
      var x = legendX + index * Math.max(64, Math.floor((width - left - right) / Math.max(1, data.series.length)));
      return '<g class="usage-chart-legend-item"><circle cx="' + x + '" cy="' + legendY + '" r="3" fill="' + series.color + '"/><text x="' + (x + 7) + '" y="' + (legendY + 3) + '" class="usage-axis usage-axis-legend">' + escapeHtml(series.model) + "</text></g>";
    }).join("");
    var title = [
      '<text x="' + left + '" y="15" class="usage-chart-title">' + escapeHtml(text(state, "chartTitle")) + "</text>",
      '<text x="' + left + '" y="29" class="usage-axis usage-axis-label">' + escapeHtml(text(state, "chartYAxis")) + "</text>",
      '<text x="' + (width - right) + '" y="' + (height - 30) + '" class="usage-axis usage-axis-label" text-anchor="end">' + escapeHtml(text(state, "chartXAxis")) + "</text>",
      '<text x="' + left + '" y="' + (height - 13) + '" class="usage-axis usage-axis-label">' + escapeHtml(text(state, "chartLegend")) + "</text>"
    ].join("");

    return '<div class="usage-chart-wrap"><svg viewBox="0 0 ' + width + " " + height + '" class="usage-chart" role="img" aria-label="' + escapeHtml(text(state, "chartTitle")) + '">' + title + grid + labels + seriesSvg + legend + '</svg><div class="usage-tooltip" hidden></div></div>';
  }

  function flattenSessions(stats, models) {
    stats = sanitizeDashboardStats(stats || {});
    var result = {};
    models.forEach(function collectModel(model) {
      var sessions = (stats.sessionsByModel && stats.sessionsByModel[model]) || {};
      Object.keys(sessions).forEach(function collectSession(id) {
        var session = sessions[id] || {};
        if (!result[id]) {
          result[id] = {
            conversationId: id,
            title: session.title || id,
            count: 0,
            models: {},
            lastSubmittedAt: session.lastSubmittedAt || "",
            lastPageUrl: session.lastPageUrl || ("https://chatgpt.com/c/" + id)
          };
        }
        result[id].count += Number(session.count) || 0;
        result[id].models[model] = Number(session.count) || 0;
        if (String(session.lastSubmittedAt || "") > String(result[id].lastSubmittedAt || "")) {
          result[id].lastSubmittedAt = session.lastSubmittedAt;
          result[id].lastPageUrl = session.lastPageUrl || result[id].lastPageUrl;
        }
      });
    });

    return Object.keys(result)
      .map(function toValue(id) {
        return result[id];
      })
      .sort(function byRecent(a, b) {
        return String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt));
      });
  }

  function renderLoadingSkeleton(rows) {
    var count = Math.max(1, Number(rows) || 3);
    var items = [];
    for (var index = 0; index < count; index += 1) {
      items.push("<i></i>");
    }
    return '<div class="usage-skeleton" aria-hidden="true">' + items.join("") + "</div>";
  }

  function renderModels(state) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    var totals = modelTotalsInRange(state.stats, state);
    var models = eligibleModelsInRange(state);
    if (models.length === 0) {
      if (state.loading) {
        return renderLoadingSkeleton(2);
      }
      return '<div class="usage-empty">' + escapeHtml(text(state, "noModelRecords")) + "</div>";
    }
    return models.map(function modelChip(model, index) {
      var checked = state.selectedModels[model] ? " checked" : "";
      return '<label class="usage-model-chip" style="--chip:' + COLORS[index % COLORS.length] + '"><input type="checkbox" data-model-toggle="' + escapeHtml(model) + '"' + checked + '><span>' + escapeHtml(model) + '</span><b>' + Number(totals[model] || 0) + "</b></label>";
    }).join("");
  }

  function renderModelCountRows(state, models) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    var stats = state.stats || {};
    var today = todayKey();
    var todayStats = (stats.byDate && stats.byDate[today]) || {};
    var todayInRange = Boolean(dateRangeLookup(stats, state)[today]);
    var totals = modelTotalsInRange(stats, state);
    var rows = models.map(function toRow(model) {
      var rangeTotal = Number(totals[model]) || 0;
      var allTimeTotal = Number(stats.totals && stats.totals[model]) || 0;
      return {
        model: model,
        total: rangeTotal,
        allTimeTotal: allTimeTotal,
        today: todayInRange ? (Number(todayStats[model]) || 0) : 0,
        features: modelFeatures(stats, model, state, 3)
      };
    }).sort(function byTotal(a, b) {
      return b.total - a.total || a.model.localeCompare(b.model);
    });

    if (!rows.length) {
      if (state.loading) {
        return renderLoadingSkeleton(3);
      }
      return '<div class="usage-empty">' + escapeHtml(text(state, "noModelRecords")) + "</div>";
    }

    return rows.map(function rowHtml(row) {
      var features = row.features.length
        ? '<div class="usage-count-features">' + row.features.map(function featureHtml(feature) {
            return '<span>' + escapeHtml(feature.label) + ' <b>' + feature.count + "</b></span>";
          }).join("") + "</div>"
        : "";
      var summary = [
        renderModelVariants(stats, row.model, state),
        renderParameterCombinations(stats, row.model, state),
        renderFeatureSummary(stats, row.model, state),
        '<div class="usage-session-summary usage-session-block"><span class="usage-record-label">' + escapeHtml(text(state, "conversationIndex")) + '</span><div class="usage-record-sessions">' + renderModelSessions(stats, row.model, state) + "</div></div>"
      ].join("");
      return [
        '<div class="usage-count-record">',
        '<div class="usage-count-row">',
        '<span><strong>' + escapeHtml(row.model) + '</strong>' + features + "</span>",
        '<span class="usage-count-numbers"><b>' + row.total + '</b><small>' + escapeHtml(text(state, "rangeTotal", { count: row.total })) + text(state, "separator") + escapeHtml(text(state, "allTimeTotal", { count: row.allTimeTotal })) + text(state, "separator") + escapeHtml(text(state, "todayOnly", { today: row.today })) + "</small></span>",
        "</div>",
        '<div class="usage-count-details" data-model-record-details="' + escapeHtml(row.model) + '">' + summary + "</div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function modelDetails(stats, model, state) {
    stats = sanitizeDashboardStats(stats || {});
    var stored = stats && stats.models && stats.models[model] ? stats.models[model] : {};
    var parts = [];
    if (stored.apiModel && stored.apiModel !== model) {
      parts.push(text(state, "api") + " " + stored.apiModel);
    }
    if (stored.mode) {
      parts.push(text(state, "detailMode") + " " + stored.mode);
    }
    return parts.join(text(state, "separator"));
  }

  function storedModelSessions(stats, model) {
    var sessions = (stats.sessionsByModel && stats.sessionsByModel[model]) || {};
    return Object.keys(sessions)
      .map(function toSession(id) {
        return sessions[id];
      })
      .filter(Boolean)
      .sort(function byRecent(a, b) {
        return String(b.lastSubmittedAt || "").localeCompare(String(a.lastSubmittedAt || ""));
      });
  }

  function storedSessionInRange(session, lookup) {
    return Boolean(
      session && (
        (session.lastSubmittedAt && lookup[eventDateKey({ submittedAt: session.lastSubmittedAt })]) ||
        (session.firstSubmittedAt && lookup[eventDateKey({ submittedAt: session.firstSubmittedAt })])
      )
    );
  }

  function preferStoredSession(current, stored) {
    return Number(stored && stored.count) > Number(current && current.count);
  }

  function modelSessions(stats, model, state) {
    stats = sanitizeDashboardStats(stats || {});
    var storedSessions = storedModelSessions(stats, model);
    if (state) {
      var grouped = {};
      rangeEvents(stats, state, model).forEach(function collect(event) {
        if (!event || !event.conversationId) {
          return;
        }
        var id = event.conversationId;
        if (!grouped[id]) {
          grouped[id] = {
            conversationId: id,
            title: event.pageTitle || id,
            count: 0,
            models: {},
            firstSubmittedAt: event.submittedAt || "",
            lastSubmittedAt: "",
            lastPageUrl: event.pageUrl || ("https://chatgpt.com/c/" + id)
          };
        }
        grouped[id].count += 1;
        grouped[id].models[model] = (Number(grouped[id].models[model]) || 0) + 1;
        grouped[id].title = event.pageTitle || grouped[id].title;
        if (String(event.submittedAt || "") > String(grouped[id].lastSubmittedAt || "")) {
          grouped[id].lastSubmittedAt = event.submittedAt || "";
          grouped[id].lastPageUrl = event.pageUrl || grouped[id].lastPageUrl;
        }
      });
      var rangedSessions = Object.keys(grouped)
        .map(function toRangeSession(id) { return grouped[id]; })
        .sort(function byRangeRecent(a, b) {
          return String(b.lastSubmittedAt || "").localeCompare(String(a.lastSubmittedAt || ""));
        });
      if (hasExplicitDateRange(state)) {
        var lookup = dateRangeLookup(stats, state || {});
        var storedInRange = storedSessions.filter(function keepStoredSession(session) {
          return storedSessionInRange(session, lookup);
        });
        var addedStoredSession = false;
        var byId = {};
        rangedSessions.forEach(function remember(session) {
          if (session && session.conversationId) {
            byId[session.conversationId] = session;
          }
        });
        storedInRange.forEach(function addMissingStoredSession(session) {
          if (!session || !session.conversationId) {
            return;
          }
          if (!byId[session.conversationId]) {
            byId[session.conversationId] = session;
            addedStoredSession = true;
            rangedSessions.push(session);
            return;
          }
          if (preferStoredSession(byId[session.conversationId], session)) {
            byId[session.conversationId] = session;
            addedStoredSession = true;
            rangedSessions = rangedSessions.map(function replaceStoredSession(current) {
              return current && current.conversationId === session.conversationId ? session : current;
            });
          }
        });
        if (addedStoredSession) {
          rangedSessions.sort(function byMergedRecent(a, b) {
            return String(b.lastSubmittedAt || "").localeCompare(String(a.lastSubmittedAt || ""));
          });
        }
      }
      if (rangedSessions.length || hasExplicitDateRange(state)) {
        return rangedSessions;
      }
    }

    return storedSessions;
  }

  function renderModelSessions(stats, model, state) {
    var sessions = modelSessions(stats, model, state);
    if (!sessions.length) {
      return '<div class="usage-record-empty">' + escapeHtml(text(state, "noModelConversations")) + "</div>";
    }

    return sessions.map(function sessionHtml(session, index) {
      var count = Number(session.count) || 0;
      var details = [
        text(state, "countTimes", { count: count }),
        session.lastSubmittedAt ? formatDateTime(session.lastSubmittedAt) : ""
      ].filter(Boolean).join(text(state, "separator"));
      var href = session.lastPageUrl || ("https://chatgpt.com/c/" + session.conversationId);
      return [
        '<div class="usage-record-session-row">',
        '<span class="usage-index-number">' + (index + 1) + "</span>",
        '<div class="usage-index-content">',
        '<a class="usage-index-link" data-session-id="' + escapeHtml(session.conversationId) + '" href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer" title="' + escapeHtml(session.conversationId) + '">' + escapeHtml(session.title || session.conversationId) + "</a>",
        '<small>' + escapeHtml(details) + "</small>",
        "</div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function renderModelVariants(stats, model, state) {
    var variants = modelVariants(stats, model, 3, rangeEvents(stats, state, model)).filter(function notSameAsRow(variant) {
      // 变体与行模型同名时纯属重复("调用型号 gpt-5-5-thinking" 又写一遍),不再显示。
      return variant && variant.name && variant.name !== model;
    });
    if (!variants.length) {
      return "";
    }

    return [
      '<div class="usage-variant-list">',
      '<span class="usage-record-label">' + escapeHtml(text(state, "variants")) + "</span>",
      variants.map(function variantHtml(variant) {
        var details = [
          variant.name,
          variant.mode ? text(state, "detailMode") + " " + variant.mode : "",
          variant.apiModel ? text(state, "api") + " " + variant.apiModel : ""
        ].filter(Boolean).join(text(state, "separator"));
        return '<div class="usage-variant-row"><b>' + escapeHtml(text(state, "countTimes", { count: variant.count })) + '</b><span title="' + escapeHtml(details) + '">' + escapeHtml(variant.name) + "</span></div>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderParameterCombinations(stats, model, state) {
    var events = rangeEvents(stats, state, model);
    var combinations = parameterCombinations(stats, model, 3, events);
    if (!combinations.length) {
      var stored = stats && stats.models && stats.models[model] ? stats.models[model] : {};
      if (events || !stored.parameters || !parameterSignature(stored.parameters)) {
        return "";
      }
      return [
        '<div class="usage-param-combos">',
        '<span class="usage-record-label">' + escapeHtml(text(state, "parameterLatest")) + "</span>",
        '<div class="usage-param-row latest"><span title="' + escapeHtml(formatParameterSummary(stored.parameters, 20)) + '">' + escapeHtml(formatParameterSummary(stored.parameters, 4)) + "</span></div>",
        "</div>"
      ].join("");
    }

    return [
      '<div class="usage-param-combos">',
      '<span class="usage-record-label">' + escapeHtml(text(state, "parameterCombinations")) + "</span>",
      combinations.map(function combinationHtml(combination) {
        var full = formatParameterSummary(combination.parameters, 20);
        var compact = formatParameterSummary(combination.parameters, 4);
        return '<div class="usage-param-row"><b>' + escapeHtml(text(state, "countTimes", { count: combination.count })) + '</b><span title="' + escapeHtml(full) + '">' + escapeHtml(compact) + "</span></div>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderFeatureSummary(stats, model, state) {
    var features = modelFeatures(stats, model, state, 4);
    if (!features.length) {
      return "";
    }
    return [
      '<div class="usage-feature-list">',
      '<span class="usage-record-label">' + escapeHtml(text(state, "featureStats")) + "</span>",
      features.map(function featureHtml(feature) {
        return '<div class="usage-feature-row"><b>' + escapeHtml(text(state, "countTimes", { count: feature.count })) + '</b><span>' + escapeHtml(feature.label) + "</span></div>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderModelRecordSummary(stats, model, state) {
    var variants = renderModelVariants(stats, model, state);
    var parameters = renderParameterCombinations(stats, model, state);
    var features = renderFeatureSummary(stats, model, state);
    if (!variants && !parameters && !features) {
      return "";
    }
    return '<div class="usage-record-summary">' + variants + parameters + features + "</div>";
  }

  function renderModelTextList(stats, state) {
    stats = sanitizeDashboardStats(stats || {});
    var today = todayKey();
    var todayStats = (stats.byDate && stats.byDate[today]) || {};
    var todayInRange = Boolean(dateRangeLookup(stats, state || {})[today]);
    var explicitRange = hasExplicitDateRange(state || {});
    var totals = modelTotalsInRange(stats, state);
    var rows = Object.keys(stats.totals || {})
      .map(function toRow(model) {
        var rangeTotal = Number(totals[model]) || 0;
        var allTimeTotal = Number(stats.totals[model]) || 0;
        return {
          model: model,
          total: explicitRange ? rangeTotal : allTimeTotal,
          rangeTotal: rangeTotal,
          allTimeTotal: allTimeTotal,
          today: todayInRange ? (Number(todayStats[model]) || 0) : 0,
          details: modelDetails(stats, model, state)
        };
      })
      .filter(function hasUsage(row) {
        return row.total > 0;
      })
      .sort(function byTotal(a, b) {
        return b.total - a.total || a.model.localeCompare(b.model);
      });

    if (!rows.length) {
      return '<div class="usage-empty">' + escapeHtml(text(state, "noModelRecords")) + "</div>";
    }

    return rows.map(function rowHtml(row) {
      return [
        '<div class="usage-model-record">',
        '<div class="usage-text-row">',
        '<div><strong>' + escapeHtml(row.model) + '</strong>',
        row.details ? '<small>' + escapeHtml(row.details) + '</small>' : "",
        "</div>",
        '<div class="usage-text-count"><b>' + row.total + '</b><small>' + escapeHtml(text(state, "rangeTotal", { count: row.rangeTotal })) + text(state, "separator") + escapeHtml(text(state, "allTimeTotal", { count: row.allTimeTotal })) + text(state, "separator") + escapeHtml(text(state, "todayTotal", { today: row.today, total: row.total })) + "</small></div>",
        "</div>",
        renderModelRecordSummary(stats, row.model, state),
        '<div class="usage-session-summary usage-session-block"><span class="usage-record-label">' + escapeHtml(text(state, "conversationIndex")) + '</span><div class="usage-record-sessions">' + renderModelSessions(stats, row.model, state) + "</div></div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    // 紧凑格式,避免在窄面板里被截成省略号:同年只显示 MM-DD HH:mm,跨年才带年份。
    var pad = function pad2(n) { return String(n).padStart(2, "0"); };
    var monthDay = pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    var hourMinute = pad(date.getHours()) + ":" + pad(date.getMinutes());
    var sameYear = date.getFullYear() === new Date().getFullYear();
    return (sameYear ? monthDay : date.getFullYear() + "-" + monthDay) + " " + hourMinute;
  }

  function statusKind(value) {
    var clean = String(value || "").toLowerCase();
    if (!clean || clean === "none" || clean === "operational") return "operational";
    if (clean === "degraded_performance" || clean === "minor") return "degraded";
    if (clean === "partial_outage") return "partial";
    if (clean === "under_maintenance" || clean === "maintenance") return "maintenance";
    if (clean === "major_outage" || clean === "major" || clean === "critical") return "major";
    return "unknown";
  }

  function statusLabel(state, value) {
    var key = statusKind(value);
    if (key === "operational") return text(state, "statusOperational");
    if (key === "degraded") return text(state, "statusDegraded");
    if (key === "partial") return text(state, "statusPartial");
    if (key === "maintenance") return text(state, "statusMaintenance");
    if (key === "major") return text(state, "statusMajor");
    return text(state, "statusUnknown");
  }

  function renderStatusBadge(state, value) {
    var kind = statusKind(value);
    return '<span class="usage-openai-badge ' + escapeHtml(kind) + '"><i></i>' + escapeHtml(statusLabel(state, value)) + "</span>";
  }

  function renderStatusComponent(state, component, featured) {
    if (!component) {
      return "";
    }
    return [
      '<div class="usage-openai-component' + (featured ? " featured" : "") + '">',
      '<strong>' + escapeHtml(component.name) + "</strong>",
      renderStatusBadge(state, component.status),
      "</div>"
    ].join("");
  }

  function isChatGPTWebStatusComponent(component) {
    var name = String((component && component.name) || "").toLowerCase();
    if (/\b(api|sora|playground|labs|billing|platform)\b|\bfine[-\s]?tuning\b/.test(name)) {
      return false;
    }
    return /\bchatgpt\b|\bconversations?\b|\bagents?\b|\bdeep research\b|\bimage generation\b|\bvoice mode\b|\bsearch\b|\bgpts\b|\bconnectors?\b|\bapps?\b|\bfile uploads?\b|\blogin\b|\bauth(?:entication)?\b/.test(name);
  }

  function renderStatusSourceLink(state, status) {
    return '<a class="usage-openai-link" href="' + escapeHtml((status && status.sourceUrl) || "https://status.openai.com/") + '" target="_blank" rel="noreferrer">' + escapeHtml(text(state, "openaiStatusSubtitle")) + "</a>";
  }

  function renderOpenAIStatusPanel(state) {
    if (state.openaiStatusError) {
      return [
        '<section class="usage-openai-status">',
        '<div class="usage-openai-error"><strong>' + escapeHtml(text(state, "unableStatus")) + '</strong><small>' + escapeHtml(state.openaiStatusError) + '</small></div>',
        renderStatusSourceLink(state, null),
        "</section>"
      ].join("");
    }

    if (state.openaiStatusLoading || !state.openaiStatus) {
      return [
        '<section class="usage-openai-status">',
        '<div class="usage-openai-section usage-openai-loading">',
        renderLoadingSkeleton(2),
        "</div>",
        "</section>"
      ].join("");
    }

    var status = state.openaiStatus || {};
    var page = status.page || {};
    var overall = status.status || {};
    var components = (status.components || []).filter(isChatGPTWebStatusComponent);
    var description = overall.description || statusLabel(state, overall.indicator);
    var checkedAt = formatDateTime(status.fetchedAt || page.updatedAt);
    var heroMeta = (checkedAt ? escapeHtml(text(state, "lastChecked") + " " + checkedAt) + " &middot; " : "") + renderStatusSourceLink(state, status);
    var sections = [
      '<section class="usage-openai-status">',
      '<div class="usage-openai-hero ' + escapeHtml(statusKind(overall.indicator)) + '">',
      '<div><span>' + escapeHtml(text(state, "openaiStatusTitle")) + '</span><strong>' + escapeHtml(description) + '</strong><small>' + heroMeta + "</small></div>",
      renderStatusBadge(state, overall.indicator),
      "</div>"
    ];

    if (components.length) {
      sections.push(
        '<div class="usage-openai-section"><div class="usage-openai-components">' + components.map(function componentHtml(component) { return renderStatusComponent(state, component, false); }).join("") + "</div></div>"
      );
    }

    sections.push("</section>");
    return sections.join("");
  }

  function notifyLanguage(state) {
    var language = currentLanguage(state);
    if (state.notifiedLanguage === language) {
      return;
    }
    state.notifiedLanguage = language;
    if (state.options && typeof state.options.onLanguageChange === "function") {
      state.options.onLanguageChange(language);
    }
  }

  function renderViewTabs(state) {
    var views = [
      { id: "chart", label: text(state, "chartView") },
      { id: "status", label: text(state, "openaiStatusView") },
      { id: "export", label: text(state, "exportView") }
    ];
    return '<div class="usage-view-tabs" role="tablist">' + views.map(function viewButton(view) {
      var active = normalizeView(state.activeView) === view.id;
      return '<button class="usage-view-tab' + (active ? " active" : "") + '" type="button" role="tab" aria-selected="' + (active ? "true" : "false") + '" data-view-tab="' + view.id + '">' + escapeHtml(view.label) + "</button>";
    }).join("") + "</div>";
  }

  function renderDateControls(state) {
    return '<div class="usage-controls usage-chart-controls"><div class="usage-date-controls" aria-label="' + escapeHtml(text(state, "customRange")) + '"><label>' + escapeHtml(text(state, "startDate")) + ' <input class="usage-start-date" type="date" value="' + escapeHtml(state.startDate) + '"></label><label>' + escapeHtml(text(state, "endDate")) + ' <input class="usage-end-date" type="date" value="' + escapeHtml(state.endDate) + '"></label></div></div>';
  }

  var EXPORT_FORMATS = [
    { id: "markdown", labelKey: "exportFormatMarkdown" },
    { id: "pdf", labelKey: "exportFormatPdf" },
    { id: "png", labelKey: "exportFormatPng" },
    { id: "docx", labelKey: "exportFormatDocx" }
  ];

  function renderExportPanel(state) {
    var list = Array.isArray(state.exportConversationList) ? state.exportConversationList : null;
    var selected = state.exportSelected || {};
    var selectedCount = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
    var buttons = EXPORT_FORMATS.map(function formatButton(fmt) {
      return '<button type="button" class="usage-export-btn" data-export-format="' + fmt.id + '">' +
        escapeHtml(text(state, fmt.labelKey)) + "</button>";
    }).join("");

    var listHtml;
    var selectbar = "";
    if (list === null) {
      listHtml = '<p class="usage-export-hint">' + escapeHtml(text(state, "loading")) + "</p>";
    } else if (!list.length) {
      listHtml = '<p class="usage-export-hint">' + escapeHtml(text(state, "exportListEmpty")) + "</p>";
    } else {
      selectbar =
        '<div class="usage-export-selectbar">' +
          '<button type="button" class="usage-export-mini" data-export-selectall>' + escapeHtml(text(state, "exportSelectAll")) + "</button>" +
          '<button type="button" class="usage-export-mini" data-export-selectnone>' + escapeHtml(text(state, "exportSelectNone")) + "</button>" +
          '<span class="usage-export-selcount">' + escapeHtml(text(state, "exportSelectedCount", { count: selectedCount })) + "</span>" +
        "</div>";
      listHtml = '<div class="usage-export-conv-list">' + list.map(function (c) {
        var ck = selected[c.id] ? " checked" : "";
        return '<label class="usage-export-conv"><input type="checkbox" data-export-conv="' + escapeHtml(c.id) + '"' + ck + "><span>" + escapeHtml(c.title) + "</span></label>";
      }).join("") + "</div>";
    }

    return [
      '<section class="usage-export-panel">',
      selectbar,
      listHtml,
      '<div class="usage-export-actions">' + buttons + "</div>",
      '<p class="usage-export-status" data-export-status aria-live="polite"></p>',
      "</section>"
    ].join("");
  }

  function renderActiveView(state, models) {
    var activeView = normalizeView(state.activeView);
    if (activeView === "status") {
      return '<div class="usage-view-panel">' + renderOpenAIStatusPanel(state) + "</div>";
    }
    if (activeView === "export") {
      return '<div class="usage-view-panel">' + renderExportPanel(state) + "</div>";
    }

    return [
      '<div class="usage-view-panel usage-count-panel">',
      '<section class="usage-text-panel usage-chart-panel">',
      renderDateControls(state),
      '<div class="usage-models">' + renderModels(state) + "</div>",
      renderChart(state.stats, models, state),
      '<div class="usage-count-list">' + renderModelCountRows(state, models) + "</div>",
      "</section>",
      "</div>"
    ].join("");
  }

  function preferredColorSchemeQuery() {
    var scope = root && typeof root.matchMedia === "function" ? root : null;
    if (!scope && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      scope = window;
    }
    return scope ? scope.matchMedia("(prefers-color-scheme: dark)") : null;
  }

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

  function computedBackgroundColor(doc, element) {
    if (!element) {
      return "";
    }
    var reader = root && typeof root.getComputedStyle === "function"
      ? root.getComputedStyle.bind(root)
      : typeof getComputedStyle === "function" ? getComputedStyle : null;
    if (!reader && typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
      reader = window.getComputedStyle.bind(window);
    }
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

  function detectComputedPageTheme(doc) {
    var candidates = [doc && doc.body, doc && doc.documentElement, doc && typeof doc.querySelector === "function" ? doc.querySelector("main") : null];
    var sawLight = false;
    for (var index = 0; index < candidates.length; index += 1) {
      var color = rgbFromColor(computedBackgroundColor(doc, candidates[index]));
      if (color) {
        if (relativeLuminance(color) < 0.5) {
          return "dark";
        }
        sawLight = true;
      }
    }
    return sawLight ? "light" : "";
  }

  function detectPageTheme() {
    var doc = root && root.document ? root.document : typeof document !== "undefined" ? document : null;
    var documentElement = doc && doc.documentElement;
    if (documentElement) {
      if (hasDarkClass(documentElement)) {
        return "dark";
      }

      var dataTheme = readDataTheme(documentElement);
      if (dataTheme.indexOf("dark") !== -1) {
        return "dark";
      }
      if (dataTheme.indexOf("light") !== -1) {
        return "light";
      }
    }

    if (doc && hasDarkClass(doc.body)) {
      return "dark";
    }
    var bodyTheme = readDataTheme(doc && doc.body);
    if (bodyTheme.indexOf("dark") !== -1) {
      return "dark";
    }
    if (bodyTheme.indexOf("light") !== -1) {
      return "light";
    }

    var computedTheme = detectComputedPageTheme(doc);
    if (computedTheme) {
      return computedTheme;
    }

    var mediaQuery = preferredColorSchemeQuery();
    return mediaQuery && mediaQuery.matches ? "dark" : "light";
  }

  // 工具栏弹窗(popup)和页面内面板用同一套主题变量。页面内面板能直接读 ChatGPT 主题,
  // 弹窗是独立上下文读不到,于是页面内面板把检测到的主题存进 storage,弹窗读出来套用,
  // 两个面板颜色就一致了(否则弹窗只跟随系统配色,ChatGPT 主题≠系统时会不一致)。
  var THEME_STORAGE_KEY = "chatgptUsagePanelTheme";

  function chromeRuntime() {
    try {
      if (root && root.chrome) { return root.chrome; }
    } catch (_) {}
    return typeof chrome !== "undefined" ? chrome : null;
  }

  function storageLocalArea() {
    var api = chromeRuntime();
    return api && api.storage && api.storage.local ? api.storage.local : null;
  }

  function persistDetectedTheme(theme) {
    if (theme !== "dark" && theme !== "light") { return; }
    var area = storageLocalArea();
    if (!area || typeof area.set !== "function") { return; }
    var record = {};
    record[THEME_STORAGE_KEY] = theme;
    try { area.set(record); } catch (_) {}
  }

  function resolvePopupTheme(state) {
    var theme = state && state.resolvedPopupTheme;
    if (theme === "dark" || theme === "light") { return theme; }
    var query = preferredColorSchemeQuery();
    return query && query.matches ? "dark" : "light";
  }

  function applyPopupThemeVariables(state) {
    if (!state || !state.options || state.options.surface !== "popup" || !state.container || typeof state.container.querySelector !== "function") {
      return;
    }
    var dashboard = state.container.querySelector(".usage-dashboard-popup");
    if (!dashboard || !dashboard.style) {
      return;
    }
    var variables = USAGE_THEME_VARIABLES[resolvePopupTheme(state)] || USAGE_THEME_VARIABLES.light;
    Object.keys(variables).forEach(function applyVariable(name) {
      dashboard.style.setProperty(name, variables[name]);
    });
  }

  function subscribePopupThemeChanges(state) {
    if (!state || !state.options || state.options.surface !== "popup" || state.popupThemeSubscribed) {
      return;
    }
    var area = storageLocalArea();
    if (!area || typeof area.get !== "function") {
      // 读不到 storage.local 就无法获知 ChatGPT 主题,本同步整体跳过(render 里会退回系统配色)。
      return;
    }
    state.popupThemeSubscribed = true;
    var refresh = function (theme) {
      state.resolvedPopupTheme = (theme === "dark" || theme === "light") ? theme : null;
      applyPopupThemeVariables(state);
    };
    try {
      area.get(THEME_STORAGE_KEY, function (res) { refresh(res && res[THEME_STORAGE_KEY]); });
    } catch (_) {}
    var api = chromeRuntime();
    if (api && api.storage && api.storage.onChanged && typeof api.storage.onChanged.addListener === "function") {
      try {
        api.storage.onChanged.addListener(function (changes, areaName) {
          if (areaName === "local" && changes && changes[THEME_STORAGE_KEY]) {
            refresh(changes[THEME_STORAGE_KEY].newValue);
          }
        });
      } catch (_) {}
    }
    var query = preferredColorSchemeQuery();
    if (query && typeof query.addEventListener === "function") {
      query.addEventListener("change", function () {
        if (!state.resolvedPopupTheme) { applyPopupThemeVariables(state); }
      });
    }
  }

  function applyPageThemeVariables(state) {
    if (!state || !state.options || state.options.surface !== "page" || !state.container || typeof state.container.querySelector !== "function") {
      return;
    }
    var dashboard = state.container.querySelector(".usage-dashboard-page");
    if (!dashboard || !dashboard.style) {
      return;
    }
    var theme = detectPageTheme();
    persistDetectedTheme(theme);
    var variables = USAGE_THEME_VARIABLES[theme] || USAGE_THEME_VARIABLES.light;
    Object.keys(variables).forEach(function applyVariable(name) {
      dashboard.style.setProperty(name, variables[name]);
    });
  }

  function subscribePageThemeChanges(state) {
    if (!state || !state.options || state.options.surface !== "page" || state.pageThemeSubscribed) {
      return;
    }
    state.pageThemeSubscribed = true;
    var updateTheme = function updateTheme() {
      applyPageThemeVariables(state);
    };

    var mediaQuery = preferredColorSchemeQuery();
    if (mediaQuery && typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTheme);
    }

    var doc = root && root.document ? root.document : typeof document !== "undefined" ? document : null;
    var documentElement = doc && doc.documentElement;
    var Observer = root && root.MutationObserver ? root.MutationObserver : typeof MutationObserver !== "undefined" ? MutationObserver : null;
    if (documentElement && Observer) {
      var observer = new Observer(updateTheme);
      observer.observe(documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
      if (doc.body) {
        observer.observe(doc.body, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
      }
    }
  }

  function render(state) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    ensureSelection(state);
    state.startDate = normalizeDateInput(state.startDate) || defaultStartDate(state.stats || {});
    state.endDate = normalizeDateInput(state.endDate) || defaultEndDate();
    var models = selectedModels(state);
    var rangeTotals = modelTotalsInRange(state.stats, state);
    var activeView = normalizeView(state.activeView);
    // 标题/副标题跟随当前标签页:导出页原来还显示"模型使用 + 统计副标题",是错的(用户:导出界面标题不对)。
    var heading = activeView === "status"
      ? text(state, "openaiStatusTitle")
      : activeView === "export"
        ? text(state, "exportView")
        : text(state, "modelUsage");
    var subtitle = activeView === "status"
      ? text(state, "openaiStatusSubtitle")
      : activeView === "export"
        ? text(state, "exportSubtitle")
        : text(state, "total", { count: countTotal(rangeTotals) }) + text(state, "separator") + text(state, "selected", { count: models.length });
    var language = currentLanguage(state);
    var languageToggleTarget = language === "zh" ? "en" : "zh";
    var languageToggleText = text(state, language === "zh" ? "languageToggleEn" : "languageToggleZh");
    var languageToggleLabel = text(state, "languageToggleLabel");
    var surface = state.options && state.options.surface === "page" ? "page" : "popup";
    var closeAction = surface === "page" && state.options && typeof state.options.onClose === "function"
      ? '<button class="usage-panel-close" type="button" data-panel-close aria-label="' + escapeHtml(text(state, "close")) + '" title="' + escapeHtml(text(state, "close")) + '">&times;</button>'
      : "";
    var visibleStatusText = state.statusText || "";
    state.container.innerHTML = [
      '<div class="usage-dashboard usage-dashboard-' + surface + '">',
      '<div class="usage-topline"><div><div class="usage-title-row"><h2>' + escapeHtml(heading) + "</h2></div><p>" + escapeHtml(subtitle) + '</p></div><div class="usage-top-actions"><button class="usage-language-toggle" type="button" data-language-toggle="' + escapeHtml(languageToggleTarget) + '" aria-label="' + escapeHtml(languageToggleLabel) + '" title="' + escapeHtml(languageToggleLabel) + '">' + escapeHtml(languageToggleText) + '</button><button class="usage-refresh" type="button">' + escapeHtml(text(state, "refresh")) + "</button>" + closeAction + "</div></div>",
      renderViewTabs(state),
      renderActiveView(state, models),
      '<div class="usage-status' + (state.statusError && visibleStatusText ? " error" : "") + '" aria-live="polite">' + escapeHtml(visibleStatusText) + "</div>",
      "</div>"
    ].join("");
    applyPageThemeVariables(state);
    applyPopupThemeVariables(state);
    bindEvents(state);
    notifyLanguage(state);
    pushBadgeFilter(state);
  }

  // 把面板当前选择的日期范围推给后台,让工具栏角标只显示该范围内的次数,而不是全部总数
  // (用户:角标显示面板所选日期范围对应的数字)。仅范围变化时发送,避免每次 render 都发消息。
  function pushBadgeFilter(state) {
    var runtime = (root && root.chrome && root.chrome.runtime) || (typeof chrome !== "undefined" && chrome ? chrome.runtime : null);
    if (!runtime || typeof runtime.sendMessage !== "function") { return; }
    var key = (state.startDate || "") + "|" + (state.endDate || "");
    if (state._lastBadgeFilterKey === key) { return; }
    state._lastBadgeFilterKey = key;
    try {
      runtime.sendMessage(
        { type: "badge.setFilter", filter: { startDate: state.startDate || "", endDate: state.endDate || "" } },
        function ack() { void (runtime.lastError); }
      );
    } catch (_) {}
  }

  function setStatus(state, message, isError, scope) {
    state.statusText = message || "";
    state.statusError = Boolean(isError);
    state.statusScope = scope || "global";
    var node = state.container.querySelector(".usage-status");
    if (node) {
      node.textContent = state.statusText;
      node.title = "";
      node.className = "usage-status" + (isError ? " error" : "");
    }
  }

  function bindEvents(state) {
    var refreshButton = state.container.querySelector(".usage-refresh");
    if (refreshButton) {
      refreshButton.addEventListener("click", function refresh() {
        reload(state);
      });
    }
    var panelClose = state.container.querySelector("[data-panel-close]");
    if (panelClose && state.options && typeof state.options.onClose === "function") {
      panelClose.addEventListener("click", function closePanel() {
        state.options.onClose();
      });
    }
    var startDate = state.container.querySelector(".usage-start-date");
    var endDate = state.container.querySelector(".usage-end-date");
    if (startDate) {
      startDate.addEventListener("change", function changeStart(event) {
        state.startDate = normalizeDateInput(event.target.value) || state.startDate;
        render(state);
        saveSettings(state).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    }
    if (endDate) {
      endDate.addEventListener("change", function changeEnd(event) {
        state.endDate = normalizeDateInput(event.target.value) || state.endDate;
        render(state);
        saveSettings(state).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    }
    var languageToggle = state.container.querySelector("[data-language-toggle]");
    if (languageToggle) {
      languageToggle.addEventListener("click", function changeLanguage() {
        state.language = normalizeLanguage(languageToggle.getAttribute("data-language-toggle"));
        render(state);
        saveSettings(state).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    }
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-view-tab]"), function bindViewTab(button) {
      button.addEventListener("click", function changeView() {
        state.activeView = normalizeView(button.getAttribute("data-view-tab"));
        if (isActiveStatusView(state)) {
          ensureOpenAIStatus(state, false);
        }
        if (state.activeView === "export" && !Array.isArray(state.exportConversationList)) {
          loadExportConversationList(state);
        }
        render(state);
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-model-toggle]"), function bindToggle(input) {
      input.addEventListener("change", function updateModel() {
        state.selectedModels[input.getAttribute("data-model-toggle")] = input.checked;
        render(state);
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-format]"), function bindExport(button) {
      button.addEventListener("click", function runExport() {
        exportConversations(state, button.getAttribute("data-export-format"));
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-conv]"), function bindConv(input) {
      input.addEventListener("change", function toggleConv() {
        if (!state.exportSelected) { state.exportSelected = {}; }
        state.exportSelected[input.getAttribute("data-export-conv")] = input.checked;
        var countNode = state.container.querySelector(".usage-export-selcount");
        if (countNode) {
          var n = Object.keys(state.exportSelected).filter(function (k) { return state.exportSelected[k]; }).length;
          countNode.textContent = text(state, "exportSelectedCount", { count: n });
        }
      });
    });
    var selectAllBtn = state.container.querySelector("[data-export-selectall]");
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", function selectAll() {
        state.exportSelected = state.exportSelected || {};
        (state.exportConversationList || []).forEach(function (c) { state.exportSelected[c.id] = true; });
        render(state);
      });
    }
    var selectNoneBtn = state.container.querySelector("[data-export-selectnone]");
    if (selectNoneBtn) {
      selectNoneBtn.addEventListener("click", function selectNone() {
        state.exportSelected = {};
        render(state);
      });
    }
    bindTooltip(state);
  }

  function exporterModule() {
    return (root && root.ChatGPTUsageExporter) ||
      (typeof window !== "undefined" && window.ChatGPTUsageExporter) || null;
  }

  function setExportStatus(state, message, isError) {
    var node = state.container && state.container.querySelector("[data-export-status]");
    if (node) {
      node.textContent = message || "";
      node.classList.toggle("error", Boolean(isError));
    }
  }

  function isPageSurface(state) {
    return Boolean(state.options && state.options.surface === "page");
  }

  // 弹窗面板没有页面 DOM,改向当前标签页的内容脚本发消息(仍只读 DOM,不碰后端/凭据)。
  function tabsSendMessage(message) {
    return new Promise(function (resolve, reject) {
      if (typeof chrome === "undefined" || !chrome.tabs || typeof chrome.tabs.query !== "function") {
        reject(new Error(message && message.type ? "no-tabs" : "no-tabs"));
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || typeof tab.id !== "number") { reject(new Error("no-tab")); return; }
        chrome.tabs.sendMessage(tab.id, message, function (resp) {
          if (chrome.runtime && chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
          resolve(resp);
        });
      });
    });
  }

  function loadExportConversationList(state) {
    var apply = function (list) { state.exportConversationList = Array.isArray(list) ? list : []; render(state); };
    if (isPageSurface(state) && root.__chatgptUsageListConversations) {
      Promise.resolve(root.__chatgptUsageListConversations()).then(apply).catch(function () { apply([]); });
      return;
    }
    tabsSendMessage({ type: "conversation.list" })
      .then(function (resp) { apply(resp && resp.ok ? resp.conversations : []); })
      .catch(function () { apply([]); });
  }

  // 账号安全:全部路径只读取页面已渲染对话 DOM;多对话 = 逐个 SPA 打开侧边栏链接再读 DOM,
  // 全程不调用任何 ChatGPT/OpenAI 后端接口、不读取 cookie/token。
  function collectConversationsForExport(state) {
    var ids = Object.keys(state.exportSelected || {}).filter(function (k) { return state.exportSelected[k]; });
    if (!ids.length) { return Promise.reject(new Error(text(state, "exportNoSelection"))); }
    setExportStatus(state, text(state, "exportProgress"));
    if (isPageSurface(state) && root.__chatgptUsageCollectMany) {
      return root.__chatgptUsageCollectMany(ids);
    }
    return tabsSendMessage({ type: "conversation.collectMany", ids: ids }).then(function (resp) {
      if (!resp || !resp.ok) { throw new Error((resp && resp.error) || text(state, "exportOpenPage")); }
      return resp.conversations || [];
    });
  }

  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl || "").split(",");
    var meta = parts[0] || "";
    var mime = (meta.match(/data:([^;]+)/) || [])[1] || "image/png";
    var decode = (root && root.atob) || (typeof atob === "function" ? atob : null);
    var binary = /;base64/i.test(meta) && decode ? decode(parts[1] || "") : decodeURIComponent(parts[1] || "");
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) { arr[i] = binary.charCodeAt(i); }
    return new Blob([arr], { type: mime });
  }

  // PNG 与 PDF 都走 Canvas(系统中文字体 + Markdown 渲染),从根本上解决两类问题:
  //  - 旧 PNG 像素字体只有 ASCII(中文→"?")、旧 PDF 用 STSong 不嵌字体(中文空白);
  //  - 两者都把 Markdown 当纯文本显示(## ** ``` | 不渲染)。
  // 其它格式(Markdown / DOCX / JSON)仍走同步 exportArtifact。
  function buildExportArtifact(exporter, valid, format, base) {
    var hasCanvas = root && root.document && typeof root.document.createElement === "function" &&
      typeof exporter.renderConversationsCanvas === "function";
    if (hasCanvas && (format === "png" || format === "image" || format === "pdf")) {
      var canvas = exporter.renderConversationsCanvas(valid, { filenameBase: base });
      if (format === "pdf") {
        return exporter.buildPdfBlobFromCanvas(canvas, {}).then(function (blob) {
          return { blob: blob, filename: base + ".pdf" };
        });
      }
      return exporter.canvasToPngBlob(canvas).then(function (blob) {
        return { blob: blob, filename: base + ".png" };
      });
    }
    // Word 走渲染版(Markdown→Word 结构),其余(Markdown/JSON)走原始同步导出。
    if (format === "docx" && typeof exporter.buildDocxRenderedBlob === "function") {
      return Promise.resolve({ blob: exporter.buildDocxRenderedBlob(valid, {}), filename: base + ".docx" });
    }
    var artifact = exporter.exportArtifact(valid, format, { filenameBase: base });
    return Promise.resolve({ blob: artifact.blob, filename: artifact.filename });
  }

  function exportConversations(state, format) {
    var exporter = exporterModule();
    if (!exporter || typeof exporter.exportArtifact !== "function" || typeof exporter.downloadBlob !== "function") {
      setExportStatus(state, text(state, "exportFailed", { error: "exporter" }), true);
      return;
    }
    setExportStatus(state, text(state, "exportRunning"));
    collectConversationsForExport(state).then(function (conversations) {
      var valid = (conversations || []).filter(function (c) { return c && Array.isArray(c.messages) && c.messages.length; });
      if (!valid.length) { setExportStatus(state, text(state, "exportEmpty"), true); return null; }
      // 每段对话单独导出成一个文件,逐个下载——多选不再拼成一个文件。
      return downloadConversationsSeparately(state, exporter, valid, format);
    }).catch(function (error) {
      setExportStatus(state, text(state, "exportFailed", { error: String((error && error.message) || error) }), true);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      try {
        var FileReaderCtor = (root && root.FileReader) || (typeof FileReader !== "undefined" ? FileReader : null);
        if (!FileReaderCtor) { reject(new Error("no-filereader")); return; }
        var reader = new FileReaderCtor();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error || new Error("read-failed")); };
        reader.readAsDataURL(blob);
      } catch (error) { reject(error); }
    });
  }

  // 单个文件下载:优先请后台用 chrome.downloads 落盘(扩展发起,绕开浏览器对“页面一次手势批量下载”的拦截);
  // 后台不可用或报错时回退到 exporter.downloadBlob(a.click),保证至少不比以前差。
  function downloadOneFile(exporter, blob, filename) {
    var runtime = (root && root.chrome && root.chrome.runtime) || (typeof chrome !== "undefined" && chrome ? chrome.runtime : null);
    if (!runtime || typeof runtime.sendMessage !== "function") {
      exporter.downloadBlob(blob, filename);
      return Promise.resolve();
    }
    return blobToDataUrl(blob).then(function (dataUrl) {
      return new Promise(function (resolve) {
        var settled = false;
        var finish = function () { if (!settled) { settled = true; resolve(); } };
        try {
          runtime.sendMessage({ type: "usage.download", url: dataUrl, filename: filename }, function (resp) {
            if (runtime.lastError || !resp || !resp.ok) { exporter.downloadBlob(blob, filename); }
            finish();
          });
        } catch (_) {
          exporter.downloadBlob(blob, filename);
          finish();
        }
      });
    }).catch(function () {
      exporter.downloadBlob(blob, filename);
    });
  }

  function downloadConversationsSeparately(state, exporter, conversations, format) {
    var total = conversations.length;
    var lastName = "";
    var seenBases = {};
    // 标题相同的对话会得到相同文件名而互相覆盖,这里给重复的补 -2/-3 后缀。
    function uniqueBase(raw) {
      if (Object.prototype.hasOwnProperty.call(seenBases, raw)) {
        seenBases[raw] += 1;
        return raw + "-" + seenBases[raw];
      }
      seenBases[raw] = 1;
      return raw;
    }
    function step(index) {
      if (index >= total) {
        var doneName = total > 1 ? text(state, "exportDoneFiles", { count: total }) : lastName;
        setExportStatus(state, text(state, "exportDone", { name: doneName }));
        return Promise.resolve();
      }
      var conv = conversations[index];
      var base = uniqueBase(exporter.safeName
        ? exporter.safeName(conv.title || conv.id || ("chatgpt-conversation-" + (index + 1)))
        : ("chatgpt-conversation-" + (index + 1)));
      if (total > 1) {
        setExportStatus(state, text(state, "exportRunning") + " " + (index + 1) + "/" + total);
      }
      return buildExportArtifact(exporter, [conv], format, base).then(function (art) {
        lastName = art.filename;
        return downloadOneFile(exporter, art.blob, art.filename);
      }).then(function () {
        // 后台 chrome.downloads 路径已逐个落盘、无需大间隔;留一点小间隔给回退的 a.click 路径。
        return new Promise(function (resolve) {
          setTimeout(resolve, total > 1 ? 600 : 0);
        });
      }).then(function () { return step(index + 1); });
    }
    return step(0);
  }

  function bindTooltip(state) {
    var wrap = state.container.querySelector(".usage-chart-wrap");
    var tooltip = state.container.querySelector(".usage-tooltip");
    if (!wrap || !tooltip) {
      return;
    }
    Array.prototype.forEach.call(wrap.querySelectorAll(".usage-point"), function bindPoint(point) {
      point.addEventListener("mouseenter", function show() {
        var svg = point.ownerSVGElement;
        var cx = Number(point.getAttribute("cx")) || 0;
        var cy = Number(point.getAttribute("cy")) || 0;
        var wrapRect = wrap.getBoundingClientRect();
        var svgRect = svg ? svg.getBoundingClientRect() : wrapRect;
        var viewBox = svg && svg.viewBox ? svg.viewBox.baseVal : null;
        var scaleX = viewBox && viewBox.width ? svgRect.width / viewBox.width : 1;
        var scaleY = viewBox && viewBox.height ? svgRect.height / viewBox.height : 1;
        var pointX = svgRect.left - wrapRect.left + cx * scaleX;
        var pointY = svgRect.top - wrapRect.top + cy * scaleY;

        tooltip.textContent = point.getAttribute("data-model") + text(state, "separator") + point.getAttribute("data-date") + ": " + point.getAttribute("data-value");
        tooltip.hidden = false;
        tooltip.style.left = Math.min(Math.max(6, wrapRect.width - tooltip.offsetWidth - 6), Math.max(6, pointX + 8)) + "px";
        tooltip.style.top = Math.max(8, pointY - tooltip.offsetHeight - 8) + "px";
      });
      point.addEventListener("mouseleave", function hide() {
        tooltip.hidden = true;
      });
    });
  }

  function reload(state) {
    state.loading = true;
    if (!isActiveStatusView(state)) {
      state.openaiStatusLoaded = false;
    }
    setStatus(state, text(state, "loading"));
    render(state);

    var core = Promise.all([loadStats(), loadSettings()]).then(function loaded(results) {
      var settings = results[1] || {};
      state.stats = results[0];
      state.language = normalizeLanguage(settings.language);
      state.startDate = normalizeDateInput(settings.startDate) || state.startDate || "";
      state.endDate = normalizeDateInput(settings.endDate) || state.endDate || "";
      state.loading = false;
      setStatus(state, "");
      render(state);
    }).catch(function failed(error) {
      state.stats = state.stats || { totals: {}, byDate: {}, models: {}, sessionsByModel: {}, variantsByModel: {}, parametersByModel: {}, events: [] };
      state.loading = false;
      setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
      render(state);
    });

    var openaiStatus = isActiveStatusView(state) ? ensureOpenAIStatus(state, true) : Promise.resolve(null);

    return Promise.all([core, openaiStatus]).then(function done() {
      return state;
    });
  }

  function refreshStatsFromStorage(state) {
    return loadStats().then(function loaded(stats) {
      state.stats = stats;
      state.loading = false;
      setStatus(state, "");
      render(state);
      return state;
    }).catch(function failed(error) {
      setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
      return state;
    });
  }

  function subscribeStatsStorageChanges(state) {
    var storage = root && root.chrome && root.chrome.storage;
    var onChanged = storage && storage.onChanged;
    if (!onChanged || typeof onChanged.addListener !== "function") {
      return;
    }

    onChanged.addListener(function handleUsageStatsStorageChange(changes, areaName) {
      if (areaName && areaName !== "local") {
        return;
      }
      if (!changes || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) {
        return;
      }
      refreshStatsFromStorage(state);
    });
  }

  function injectStyles() {
    if (root.document.getElementById("chatgpt-usage-dashboard-style")) {
      return;
    }
    var style = root.document.createElement("style");
    style.id = "chatgpt-usage-dashboard-style";
    style.textContent = [
      ".usage-dashboard{box-sizing:border-box;font:12px/1.36 system-ui,sans-serif;color:var(--usage-text-primary);min-width:0}",
      ".usage-dashboard *{box-sizing:border-box}",
      ".usage-dashboard-popup{height:100%;max-height:100%;overflow:auto;overscroll-behavior:contain;padding-right:0;background:var(--usage-surface-page)}",
      ".usage-dashboard-page{height:100%;max-height:100%;max-width:100%;background:var(--usage-surface-panel);overflow:auto;overscroll-behavior:contain}",
      ".usage-dashboard-page .usage-topline{position:sticky;top:0;z-index:2;margin:0;padding:10px 12px 8px;border-bottom:1px solid var(--usage-border-divider);background:var(--usage-surface-panel)}",
      ".usage-topline{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px}",
      ".usage-title-row{display:flex;align-items:center;flex-wrap:nowrap;gap:5px;min-width:0}",
      ".usage-topline h2{margin:0;font-size:13px;line-height:1.25;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-topline p{margin:1px 0 0;color:var(--usage-text-muted);font-size:10.5px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-panel-close{width:28px;padding:4px 0;font-size:16px;line-height:1}",
      ".usage-top-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}",
      ".usage-controls{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 4px}",
      ".usage-date-controls{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:4px;width:100%}",
      ".usage-controls label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:5px;min-width:0}",
      ".usage-controls select,.usage-controls input{border:1px solid var(--usage-border-control);border-radius:5px;padding:4px 7px;background:var(--usage-surface-panel)}",
      ".usage-controls input{width:100%;min-width:0}",
      ".usage-language-toggle{min-width:34px;color:var(--usage-text-secondary)}",
      ".usage-view-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin:7px 0 8px;padding:2px;border:1px solid var(--usage-border-panel);border-radius:6px;background:var(--usage-surface-track)}",
      ".usage-view-tab{border:0;background:transparent;color:var(--usage-text-secondary)}",
      ".usage-view-tab.active{background:var(--usage-surface-panel);color:var(--usage-text-primary);box-shadow:0 1px 1px var(--usage-shadow-active-tab)}",
      ".usage-export-panel{padding:6px 2px 4px;display:flex;flex-direction:column;gap:8px}",
      ".usage-export-title{margin:0;font-size:13px;font-weight:600;color:var(--usage-text-primary)}",
      ".usage-export-hint{margin:0;font-size:11px;line-height:1.5;color:var(--usage-text-secondary)}",
      ".usage-export-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}",
      ".usage-export-btn{border:1px solid var(--usage-border-panel);background:var(--usage-surface-panel);color:var(--usage-text-primary);border-radius:6px;padding:7px 8px;font-size:12px;font-weight:600;cursor:pointer;transition:background .12s ease,border-color .12s ease}",
      ".usage-export-btn:hover{background:var(--usage-surface-track);border-color:var(--usage-accent-strong,var(--usage-text-secondary))}",
      ".usage-export-btn:focus-visible{outline:2px solid var(--usage-accent-strong,var(--usage-text-secondary));outline-offset:2px}",
      ".usage-export-btn:active{transform:translateY(1px)}",
      ".usage-export-status{margin:2px 0 0;font-size:11px;line-height:1.5;color:var(--usage-text-secondary);min-height:14px}",
      ".usage-export-status.error{color:var(--usage-error-status-text,#dc2626)}",
      ".usage-export-scope{display:grid;grid-template-columns:1fr 1fr;gap:4px}",
      ".usage-export-tab{border:1px solid var(--usage-border-panel);background:var(--usage-surface-panel);color:var(--usage-text-secondary);border-radius:6px;padding:5px;font-size:12px;cursor:pointer}",
      ".usage-export-tab.active{background:var(--usage-surface-track);color:var(--usage-text-primary);font-weight:600;border-color:var(--usage-accent-link,var(--usage-text-secondary))}",
      ".usage-export-tab:focus-visible{outline:2px solid var(--usage-accent-link,#10a37f);outline-offset:1px}",
      ".usage-export-selectbar{display:flex;align-items:center;gap:6px}",
      ".usage-export-mini{border:1px solid var(--usage-border-panel);background:transparent;color:var(--usage-text-secondary);border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer}",
      ".usage-export-mini:hover{background:var(--usage-surface-track)}",
      ".usage-export-selcount{margin-left:auto;font-size:11px;color:var(--usage-text-muted)}",
      ".usage-export-conv-list{max-height:180px;overflow:auto;border:1px solid var(--usage-border-panel);border-radius:6px;padding:4px;display:flex;flex-direction:column;gap:2px}",
      ".usage-export-conv{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:4px;cursor:pointer;font-size:12px}",
      ".usage-export-conv:hover{background:var(--usage-surface-track)}",
      ".usage-export-conv span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
      ".usage-export-conv input{flex:0 0 auto}",
      // —— 视觉优化:键盘焦点可见、交互态、溢出处理、减少动画 ——
      ".usage-dashboard button:focus-visible,.usage-dashboard select:focus-visible,.usage-dashboard input:focus-visible{outline:2px solid var(--usage-accent-link,#10a37f);outline-offset:1px}",
      ".usage-view-tab{cursor:pointer;border-radius:5px;transition:background .12s ease,color .12s ease}",
      ".usage-view-tab:hover:not(.active){background:var(--usage-surface-panel);color:var(--usage-text-primary)}",
      ".usage-language-toggle{cursor:pointer;border-radius:5px;transition:color .12s ease,background .12s ease}",
      ".usage-language-toggle:hover{color:var(--usage-text-primary);background:var(--usage-surface-track)}",
      ".usage-controls input:hover,.usage-controls select:hover{border-color:var(--usage-accent-link,var(--usage-text-secondary))}",
      ".usage-controls input:focus,.usage-controls select:focus{outline:none;border-color:var(--usage-accent-link,#10a37f);box-shadow:0 0 0 2px var(--usage-focus-ring,rgba(16,163,127,.25))}",
      ".usage-controls input:invalid{border-color:var(--usage-error-status-text,#dc2626)}",
      ".usage-model-chip{cursor:pointer;max-width:100%;transition:border-color .12s ease,background .12s ease}",
      ".usage-model-chip:hover{border-color:var(--usage-accent-link,var(--usage-text-secondary));background:var(--usage-surface-track)}",
      ".usage-panel-close{cursor:pointer;border-radius:5px;transition:background .12s ease}",
      ".usage-panel-close:hover{background:var(--usage-surface-track)}",
      ".usage-empty{padding:10px 8px;text-align:center;color:var(--usage-text-muted);font-size:11.5px}",
      "@media (prefers-reduced-motion:reduce){.usage-dashboard *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}",
      ".usage-models{display:flex;flex-wrap:wrap;gap:4px;margin:3px 0 5px;padding-right:2px}",
      ".usage-model-chip{display:flex;align-items:center;gap:5px;min-height:24px;border:1px solid var(--usage-border-panel);border-radius:999px;padding:2px 6px;background:transparent;font-size:11px}",
      ".usage-model-chip::before{content:\"\";width:6px;height:6px;border-radius:999px;background:var(--chip);flex:0 0 auto}",
      ".usage-model-chip input{width:13px;height:13px;margin:0;accent-color:var(--chip)}",
      ".usage-model-chip b{color:var(--usage-accent-link)}",
      ".usage-view-panel{min-height:0;animation:usage-panel-in .16s ease-out both}",
      ".usage-dashboard-page .usage-view-tabs{margin:10px 12px}",
      ".usage-dashboard-page .usage-view-panel{min-height:0;padding:0 12px 12px}",
      ".usage-chart-wrap{position:relative;border:1px solid var(--usage-border-panel);border-radius:6px;background:var(--usage-surface-panel);margin:3px 0 5px;overflow:hidden}",
      ".usage-chart{display:block;width:100%;height:auto}",
      ".usage-grid{stroke:var(--usage-border-chart-grid);stroke-width:1;stroke-opacity:1}",
      ".usage-axis{fill:var(--usage-text-muted);font-size:10px}",
      ".usage-chart-title{fill:var(--usage-text-primary);font-size:12px;font-weight:800}",
      ".usage-axis-label{font-size:8.5px;font-weight:700}",
      ".usage-axis-date{font-size:9px}",
      ".usage-axis-y{font-variant-numeric:tabular-nums}",
      ".usage-axis-legend{font-size:8px;dominant-baseline:middle}",
      ".usage-chart-legend-item text{pointer-events:none}",
      ".usage-line{stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:900;animation:usage-draw .65s ease-out both}",
      ".usage-point{stroke:var(--usage-chart-point-stroke);stroke-width:1.25;cursor:pointer;transition:transform .16s ease,r .16s ease}",
      ".usage-point:hover{r:6}",
      ".usage-tooltip{position:absolute;z-index:2;max-width:190px;padding:6px 8px;border-radius:7px;background:var(--usage-tooltip-surface);color:var(--usage-text-inverse);font-size:12px;pointer-events:none;box-shadow:0 8px 24px var(--usage-shadow-tooltip)}",
      ".usage-text-panel{min-width:0}",
      ".usage-count-panel .usage-text-panel{display:grid;gap:6px}",
      ".usage-model-text-list{display:grid;gap:6px;margin-top:6px}",
      ".usage-count-list{display:grid;gap:0;margin-top:2px;border-top:1px solid var(--usage-border-divider)}",
      ".usage-count-record{border:0;border-bottom:1px solid var(--usage-border-divider);border-radius:0;background:transparent;overflow:visible}",
      ".usage-count-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;width:100%;padding:5px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;list-style:none}",
      ".usage-count-details{display:grid;gap:5px;padding:0 0 8px 12px;animation:usage-panel-in .14s ease-out both}",
      ".usage-count-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-count-numbers{text-align:right}",
      ".usage-count-numbers b{display:block;color:var(--usage-accent-link)}",
      ".usage-count-numbers small{display:block;color:var(--usage-text-muted)}",
      ".usage-count-features{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}",
      ".usage-count-features span{display:inline-flex;gap:4px;align-items:center;min-height:20px;padding:2px 6px;border-radius:999px;background:var(--usage-surface-chip);color:var(--usage-text-body-subtle);font-size:11px}",
      ".usage-count-features b{color:var(--usage-accent-link)}",
      ".usage-model-record{border-top:1px solid var(--usage-border-divider);padding-top:6px}",
      ".usage-model-record:first-child{border-top:0;padding-top:0}",
      ".usage-text-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;border-top:1px solid var(--usage-border-divider);padding:5px 0}",
      ".usage-model-record>.usage-text-row,.usage-text-row:first-child{border-top:0}",
      ".usage-text-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-text-row small{display:block;color:var(--usage-text-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-text-count{text-align:right}",
      ".usage-text-count b{display:block;color:var(--usage-accent-link)}",
      ".usage-record-summary{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;margin:0;padding:3px 0 0;border-top:0}",
      ".usage-param-combos,.usage-session-summary,.usage-variant-list,.usage-feature-list{display:grid;grid-template-columns:72px minmax(0,1fr);gap:4px 8px;align-items:start}",
      ".usage-session-block{padding-top:0}",
      ".usage-record-label{color:var(--usage-text-muted);font-size:11px;line-height:20px;white-space:nowrap}",
      ".usage-param-combos>.usage-record-label,.usage-variant-list>.usage-record-label,.usage-feature-list>.usage-record-label{grid-row:1 / -1;align-self:start}",
      ".usage-param-row,.usage-variant-row,.usage-feature-row{grid-column:2;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px;min-width:0;padding:2px 0;transition:background .14s ease}",
      ".usage-param-row.latest{grid-template-columns:minmax(0,1fr)}",
      ".usage-param-row:hover,.usage-variant-row:hover,.usage-feature-row:hover{background:var(--usage-surface-row-hover)}",
      ".usage-param-row b,.usage-variant-row b,.usage-feature-row b{font-size:11px;color:var(--usage-accent-link-hover);white-space:nowrap}",
      ".usage-param-row span,.usage-variant-row span,.usage-feature-row span{color:var(--usage-text-body-subtle);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-record-sessions{display:grid;gap:0;margin:0 0 4px 0;padding:0;list-style:none}",
      ".usage-record-session-row{display:grid;grid-template-columns:16px minmax(0,1fr);align-items:baseline;gap:6px;min-width:0;padding:0;border:0;background:transparent;line-height:17px}",
      ".usage-session-titlebar{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:6px;min-width:0}",
      ".usage-session-title{display:flex;align-items:center;gap:6px;min-width:0;font-weight:700;line-height:1.25}",
      ".usage-session-title input{flex:0 0 auto;width:13px;height:13px;margin:0;accent-color:var(--usage-accent-primary)}",
      ".usage-index-number{color:var(--usage-text-disabled);font-size:10.5px;line-height:17px;text-align:right;font-variant-numeric:tabular-nums}",
      ".usage-index-content{display:flex;align-items:baseline;gap:6px;min-width:0;overflow:hidden}",
      ".usage-index-link{display:block;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-primary);text-decoration:none;font-size:11.5px;font-weight:600}",
      ".usage-index-link:hover{color:var(--usage-accent-link-hover);text-decoration:underline}",
      ".usage-session-title b{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}",
      ".usage-session-action{display:inline-flex;align-items:center;min-height:22px;padding:0;color:var(--usage-accent-link);background:transparent;text-decoration:none;font-size:11px;font-weight:700;white-space:nowrap}",
      ".usage-index-content small{flex:0 0 auto;margin-top:0;color:var(--usage-text-muted);font-size:10.5px;white-space:nowrap;font-variant-numeric:tabular-nums}",
      ".usage-record-empty{color:var(--usage-text-disabled);font-size:11px;padding:2px 0}",
      ".usage-openai-status{display:grid;gap:6px;margin:0}",
      ".usage-openai-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:0 0 7px;border:0;border-bottom:1px solid var(--usage-border-divider);border-radius:0;background:transparent}",
      ".usage-openai-hero.degraded strong,.usage-openai-hero.partial strong{color:var(--usage-status-degraded-text)}",
      ".usage-openai-hero.major strong{color:var(--usage-status-major-text)}",
      ".usage-openai-hero.maintenance strong,.usage-openai-hero.unknown strong{color:var(--usage-status-maintenance-unknown-text)}",
      ".usage-openai-hero span{display:block;color:var(--usage-text-secondary);font-size:11px}",
      ".usage-openai-hero strong{display:block;margin-top:2px;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-openai-hero small{display:block;margin-top:2px;color:var(--usage-text-muted)}",
      ".usage-openai-hero small a{color:var(--usage-accent-link);text-decoration:none}",
      ".usage-openai-badge{display:inline-flex;align-items:center;gap:5px;min-height:20px;padding:2px 7px;border-radius:999px;background:var(--usage-status-info-bg);color:var(--usage-status-info-text);font-weight:700;white-space:nowrap}",
      ".usage-openai-badge i{width:7px;height:7px;border-radius:999px;background:var(--usage-status-info-dot)}",
      ".usage-openai-badge.operational{background:var(--usage-status-operational-bg);color:var(--usage-status-operational-text)}",
      ".usage-openai-badge.operational i{background:var(--usage-status-operational-dot)}",
      ".usage-openai-badge.degraded,.usage-openai-badge.partial{background:var(--usage-status-degraded-bg);color:var(--usage-status-degraded-text)}",
      ".usage-openai-badge.degraded i,.usage-openai-badge.partial i{background:var(--usage-status-degraded-dot)}",
      ".usage-openai-badge.major{background:var(--usage-status-major-bg);color:var(--usage-status-major-text)}",
      ".usage-openai-badge.major i{background:var(--usage-status-major-dot)}",
      ".usage-openai-badge.maintenance,.usage-openai-badge.unknown{background:var(--usage-status-maintenance-unknown-bg);color:var(--usage-status-maintenance-unknown-text)}",
      ".usage-openai-badge.maintenance i,.usage-openai-badge.unknown i{background:var(--usage-status-maintenance-unknown-dot)}",
      ".usage-openai-link{color:var(--usage-accent-link);text-decoration:none}",
      ".usage-openai-section{min-width:0}",
      ".usage-openai-components{display:grid;grid-template-columns:minmax(0,1fr);gap:0;border-top:1px solid var(--usage-border-section)}",
      ".usage-openai-component{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--usage-border-section)}",
      ".usage-openai-component.featured{padding:8px 0;background:transparent}",
      ".usage-openai-component strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-openai-component small{display:block;color:var(--usage-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-openai-error{display:grid;gap:4px;padding:10px;border:1px solid var(--usage-border-error);border-radius:8px;background:var(--usage-error-surface);color:var(--usage-error-text-strong)}",
      ".usage-openai-error small{color:var(--usage-error-text)}",
      ".usage-status{min-height:17px;margin-top:6px;color:var(--usage-text-muted)}",
      ".usage-status:empty{display:none}",
      ".usage-status.error{color:var(--usage-error-status-text)}",
      ".usage-empty{color:var(--usage-text-muted);padding:8px 0}",
      ".usage-skeleton{display:grid;gap:6px;width:100%;padding:2px 0}",
      ".usage-skeleton i{display:block;height:24px;border-radius:7px;background:linear-gradient(90deg,var(--usage-skeleton-start),var(--usage-skeleton-middle),var(--usage-skeleton-start));background-size:200% 100%;animation:usage-skeleton 1s linear infinite}",
      "@keyframes usage-draw{from{stroke-dashoffset:900}to{stroke-dashoffset:0}}",
      "@keyframes usage-panel-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes usage-skeleton{from{background-position:100% 0}to{background-position:-100% 0}}",
      "@media (prefers-reduced-motion:reduce){.usage-view-panel,.usage-count-details,.usage-line,.usage-skeleton i{animation:none}.usage-point,.usage-param-row,.usage-variant-row,.usage-feature-row{transition:none}}"
    ].join("");
    root.document.head.appendChild(style);
  }

  function init(container, options) {
    injectStyles();
    var state = {
      container: container,
      options: options || {},
      language: DEFAULT_LANGUAGE,
      activeView: "chart",
      startDate: "",
      endDate: "",
      selectedModels: {},
      openaiStatus: null,
      openaiStatusError: "",
      openaiStatusLoaded: false,
      openaiStatusLoading: false,
      openaiStatusRequest: null,
      notifiedLanguage: "",
      loading: false,
      statusText: "",
      statusError: false,
      statusScope: "global",
      stats: { totals: {}, byDate: {}, models: {}, sessionsByModel: {}, variantsByModel: {}, parametersByModel: {}, events: [] }
    };
    subscribePageThemeChanges(state);
    subscribePopupThemeChanges(state);
    subscribeStatsStorageChanges(state);
    reload(state);
    return {
      reload: function reloadHandle() {
        return reload(state);
      },
      state: state
    };
  }

  return {
    chartSeries: chartSeries,
    flattenSessions: flattenSessions,
    init: init,
    modelVariants: modelVariants,
    parameterCombinations: parameterCombinations,
    renderActiveView: renderActiveView,
    renderDateControls: renderDateControls,
    renderOpenAIStatusPanel: renderOpenAIStatusPanel,
    renderModelTextList: renderModelTextList,
    _test: {
      detectPageTheme: detectPageTheme,
      render: render,
      applyPopupThemeVariables: applyPopupThemeVariables
    }
  };
});
