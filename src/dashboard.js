(function initUsageDashboard(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.ChatGPTUsageDashboard = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function dashboardFactory(root) {
  "use strict";

  var COLORS = [
    "var(--usage-chart-series-1,#2563eb)",
    "var(--usage-chart-series-2,#dc2626)",
    "var(--usage-chart-series-3,#16a34a)",
    "var(--usage-chart-series-4,#9333ea)",
    "var(--usage-chart-series-5,#ea580c)",
    "var(--usage-chart-series-6,#0891b2)",
    "var(--usage-chart-series-7,#be123c)",
    "var(--usage-chart-series-8,#4f46e5)",
    "var(--usage-chart-series-9,#0f766e)",
    "var(--usage-chart-series-10,#a21caf)",
    "var(--usage-chart-series-11,#ca8a04)",
    "var(--usage-chart-series-12,#0369a1)",
    "var(--usage-chart-series-13,#7c2d12)",
    "var(--usage-chart-series-14,#4d7c0f)",
    "var(--usage-chart-series-15,#6d28d9)",
    "var(--usage-chart-series-16,#c026d3)"
  ];
  var LINE_STYLES = [
    "none",
    "8 4",
    "2 3",
    "10 3 2 3",
    "14 4",
    "4 3 1 3",
    "1 4",
    "7 2 1 2"
  ];
  var CHART_SIZE = { width: 360, height: 192 };
  var STORAGE_KEY = "chatgptModelUsageStats.v1";
  var SETTINGS_KEY = "chatgptModelUsageSettings.v1";
  var DEFAULT_LANGUAGE = "en";
  var DEFAULT_STATISTICS_MODE = "mapped";
  var DEFAULT_CHART_TYPE = "line";
  var DEFAULT_THEME_MODE = "system";
  var MAX_STATISTICS_IMPORT_BYTES = 10 * 1024 * 1024;
  var INTERNAL_UNKNOWN_REQUEST = "__unknown_request_model__";
  var INTERNAL_UNKNOWN_RESPONSE = "__unknown_response_model__";
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
      "--usage-chart-series-1": "#2563eb",
      "--usage-chart-series-2": "#dc2626",
      "--usage-chart-series-3": "#16a34a",
      "--usage-chart-series-4": "#9333ea",
      "--usage-chart-series-5": "#ea580c",
      "--usage-chart-series-6": "#0891b2",
      "--usage-chart-series-7": "#be123c",
      "--usage-chart-series-8": "#4f46e5",
      "--usage-chart-series-9": "#0f766e",
      "--usage-chart-series-10": "#a21caf",
      "--usage-chart-series-11": "#ca8a04",
      "--usage-chart-series-12": "#0369a1",
      "--usage-chart-series-13": "#7c2d12",
      "--usage-chart-series-14": "#4d7c0f",
      "--usage-chart-series-15": "#6d28d9",
      "--usage-chart-series-16": "#c026d3",
      "--usage-accent-primary": "#245f49",
      "--usage-accent-primary-hover": "#1f513f",
      "--usage-accent-link": "#2563eb",
      "--usage-accent-link-hover": "#1d4ed8",
      "--usage-effort-max": "#991b1b",
      "--usage-effort-extended": "#c2410c",
      "--usage-effort-high": "#b45309",
      "--usage-effort-standard": "#6d28d9",
      "--usage-effort-medium": "#1d4ed8",
      "--usage-effort-low": "#047857",
      "--usage-effort-min": "#0e7490",
      "--usage-effort-none": "#475569",
      "--usage-effort-unknown": "#64748b",
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
      "--usage-chart-series-1": "#60a5fa",
      "--usage-chart-series-2": "#f87171",
      "--usage-chart-series-3": "#4ade80",
      "--usage-chart-series-4": "#c084fc",
      "--usage-chart-series-5": "#fb923c",
      "--usage-chart-series-6": "#22d3ee",
      "--usage-chart-series-7": "#fb7185",
      "--usage-chart-series-8": "#818cf8",
      "--usage-chart-series-9": "#2dd4bf",
      "--usage-chart-series-10": "#e879f9",
      "--usage-chart-series-11": "#facc15",
      "--usage-chart-series-12": "#38bdf8",
      "--usage-chart-series-13": "#fdba74",
      "--usage-chart-series-14": "#a3e635",
      "--usage-chart-series-15": "#a78bfa",
      "--usage-chart-series-16": "#f472b6",
      "--usage-accent-primary": "#10a37f",
      "--usage-accent-primary-hover": "#19c37d",
      "--usage-accent-link": "#10a37f",
      "--usage-accent-link-hover": "#19c37d",
      "--usage-effort-max": "#fca5a5",
      "--usage-effort-extended": "#fdba74",
      "--usage-effort-high": "#fde047",
      "--usage-effort-standard": "#c4b5fd",
      "--usage-effort-medium": "#93c5fd",
      "--usage-effort-low": "#86efac",
      "--usage-effort-min": "#67e8f9",
      "--usage-effort-none": "#e5e7eb",
      "--usage-effort-unknown": "#9ca3af",
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
      settings: "设置",
      settingsOpen: "打开设置",
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
      requestModels: "请求型号",
      responsePending: "未知",
      range: "范围",
      recentRecords: "最近记录",
      realtimeService: "Realtime 服务",
      refresh: "刷新",
      selected: "已选择 {count} 个模型",
      separator: " | ",
      serviceComponents: "关键组件",
      source: "来源",
      statisticsSections: "显示内容",
      statisticsDisplaySettings: "显示设置",
      statisticsSectionTrend: "趋势（折线）",
      statisticsSectionDonut: "构成（环形）",
      statisticsSectionText: "文字统计",
      statisticsSectionTrendShort: "折线",
      statisticsSectionDonutShort: "环形",
      statisticsSectionTextShort: "文字",
      statisticsSectionNone: "未显示",
      statisticsSectionAll: "全部",
      statisticsMode: "视图模式",
      statisticsModeMapped: "基础",
      statisticsModeInternal: "高级",
      chartType: "图表",
      chartTypeLine: "趋势（折线）",
      chartTypeDonut: "构成（环形）",
      chartCompositionTitle: "模型使用构成",
      chartCompositionBack: "返回模型占比",
      chartCompositionEmpty: "当前范围没有可显示的数据。",
      chartCompositionIncomplete: "思考强度占比仅覆盖已保留的最近记录。",
      chartCompositionTotalLabel: "总计",
      theme: "主题",
      themeSystem: "跟随系统",
      themeLight: "浅色",
      themeDark: "深色",
      statisticsHistoryIncomplete: "当前口径仅覆盖已保留的最近事件，不能代表全部历史。",
      requestModelGroup: "请求型号",
      responseModelChild: "实际回复型号",
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
      unmarkedSource: "未知",
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
      settings: "Settings",
      settingsOpen: "Open settings",
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
      requestModels: "Request model",
      responsePending: "Unknown",
      range: "Range",
      recentRecords: "Recent records",
      realtimeService: "Realtime service",
      refresh: "Refresh",
      selected: "{count} selected",
      separator: " | ",
      serviceComponents: "Key components",
      source: "Source",
      statisticsSections: "Visible statistics",
      statisticsDisplaySettings: "Display settings",
      statisticsSectionTrend: "Trend (line)",
      statisticsSectionDonut: "Composition (donut)",
      statisticsSectionText: "Text statistics",
      statisticsSectionTrendShort: "Line",
      statisticsSectionDonutShort: "Donut",
      statisticsSectionTextShort: "Text",
      statisticsSectionNone: "None",
      statisticsSectionAll: "All",
      statisticsMode: "View mode",
      statisticsModeMapped: "Basic",
      statisticsModeInternal: "Advanced",
      chartType: "Chart",
      chartTypeLine: "Trend (line)",
      chartTypeDonut: "Composition (donut)",
      chartCompositionTitle: "Model usage composition",
      chartCompositionBack: "Back to model share",
      chartCompositionEmpty: "No data is available in the selected range.",
      chartCompositionIncomplete: "Reasoning-effort share covers retained recent records only.",
      chartCompositionTotalLabel: "Total",
      theme: "Theme",
      themeSystem: "System",
      themeLight: "Light",
      themeDark: "Dark",
      statisticsHistoryIncomplete: "This view covers only the retained recent events and does not represent the full history.",
      requestModelGroup: "Request model",
      responseModelChild: "Actual response model",
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
      unmarkedSource: "Unknown",
      variants: "Variants",
      zh: "中文"
    }
  };

  I18N.zh = Object.assign({}, I18N.zh, {
    all: "全选",
    chartView: "统计",
    exportView: "导出",
    exportFormatGroup: "导出格式",
    exportFormatJson: "JSON",
    exportFormatMarkdown: "Markdown",
    exportFormatPdf: "PDF",
    exportFormatPng: "PNG",
    exportFormatDocx: "DOCX",
    exportAllLoading: "正在读取账号对话索引…",
    exportListIncomplete: "账号历史读取不完整；只能导出当前列表中已读取到的对话。",
    exportListUnavailable: "无法读取账号对话索引；请确认当前标签页已登录 ChatGPT，然后重试。",
    exportEmpty: "未检测到对话。请在 ChatGPT 对话页打开一段对话后再试。",
    exportRunning: "正在导出…",
    exportDone: "已导出 {name}",
    exportDoneFiles: "{count} 个文件",
    exportArchiveDone: "已将 {count} 个对话打包为 {name}",
    exportPartial: "已导出 {success} 个对话，{failed} 个失败；详情见 ZIP 内报告。",
    exportIncomplete: "已导出 {success} 个对话，但账号历史不完整；详情见 ZIP 内报告。",
    exportSingleIncomplete: "已导出 {name}，但使用了页面回退，无法确认对话是否完整。",
    exportFailed: "导出失败:{error}",
    exportOpenPage: "请在 ChatGPT 对话页使用导出。",
    exportSelectAll: "全选",
    exportSelectNone: "清空",
    exportSelectedCount: "已选 {count} 个",
    exportSelectionHint: "单选直接下载一个文件；多选下载一个 ZIP，每段对话一个独立文件。",
    exportArchived: "已归档",
    exportCurrent: "当前对话",
    exportSelectProject: "选择项目 {name}",
    exportUngrouped: "未归入项目 / 普通对话",
    exportUnknownProject: "未知项目",
    exportUpdated: "更新于 {time}",
    exportListEmpty: "未找到可导出的账号对话。",
    exportNoSelection: "请先勾选要导出的对话。",
    exportProgressSelected: "正在读取所选对话…",
    exportSearchPlaceholder: "搜索标题或对话 ID",
    exportSearchEmpty: "没有匹配的对话。",
    exportCancel: "取消",
    exportCancelling: "正在停止；不会再启动新的对话读取…",
    exportCancelled: "导出已取消。",
    statisticsData: "统计数据",
    statisticsDataCurrent: "备份 / 恢复",
    statisticsDataExportJson: "备份 JSON",
    statisticsDataExportCsv: "记录 CSV",
    statisticsDataImportJson: "导入备份",
    statisticsDataExporting: "正在导出统计数据…",
    statisticsDataExported: "已导出 {name}",
    statisticsDataImportConfirm: "导入会替换当前全部统计记录。确定继续？",
    statisticsDataImporting: "正在导入统计数据…",
    statisticsDataImported: "已恢复 {count} 次统计记录",
    statisticsDataImportInvalid: "这不是有效的统计备份文件。",
    statisticsDataImportUnsupported: "该统计备份版本不受支持。",
    statisticsDataImportTooLarge: "统计备份文件超过 10 MB，无法导入。",
    statisticsDataOperationFailed: "统计数据操作失败：{error}",
    overlappingModels: "{count} 个模型",
    conversationIndex: "对话",
    countTimes: "{count} 次",
    customRange: "自定义日期",
    detailMode: "模式",
    endDate: "结束",
    featureAgentMode: "Agent Mode",
    featureAudio: "音频",
    featureCanvas: "Canvas",
    featureCodeInterpreter: "代码解释器",
    featureConnectors: "连接器",
    featureDeepResearch: "Deep Research",
    featureFileUpload: "文件",
    featureGpts: "GPTs",
    featureImageGeneration: "图片生成",
    featureRealtime: "Realtime",
    featureTasks: "任务",
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
    openaiStatusIncomplete: "完整组件列表暂时不可用；当前显示的是官方摘要中的可用条目。",
    openaiStatusTitle: "ChatGPT 网页状态",
    openaiStatusView: "状态",
    parameterCombinations: "参数",
    parameterLatest: "最新参数",
    requestModels: "请求型号",
    modelRelation: "请求 → 回复",
    modelRelationSame: "请求与实际回复型号一致",
    legacyUnlinked: "历史记录未关联",
    legacyUnlinkedHint: "升级前的聚合记录缺少逐次事件关系，保留原始统计，但不猜测请求型号、回复型号与对话之间的配对。",
    reasoningEffort: "思考强度",
    reasoningEffortInline: "强度",
    reasoningUnspecified: "未知",
    relationConversations: "关联对话",
    sourceFilterAll: "全部",
    sourceFilterChat: "Chat",
    sourceFilterWork: "Work",
    sourceModeChat: "Chat",
    sourceModeWork: "Work",
    sourceModeUnknown: "未知",
    responsePending: "未知",
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
    variants: "实际回复型号"
  });

  I18N.en = Object.assign({}, I18N.en, {
    chartView: "Usage",
    exportView: "Export",
    exportFormatGroup: "Export format",
    exportFormatJson: "JSON",
    exportFormatMarkdown: "Markdown",
    exportFormatPdf: "PDF",
    exportFormatPng: "PNG",
    exportFormatDocx: "DOCX",
    exportAllLoading: "Reading the account conversation index…",
    exportListIncomplete: "Account history was incomplete; only conversations already present in this list can be exported.",
    exportListUnavailable: "The account conversation index could not be read. Confirm that the active tab is signed in to ChatGPT, then retry.",
    exportEmpty: "No conversation found. Open a ChatGPT conversation, then try again.",
    exportRunning: "Exporting…",
    exportDone: "Exported {name}",
    exportDoneFiles: "{count} files",
    exportArchiveDone: "Packed {count} conversations into {name}",
    exportPartial: "Exported {success} conversations; {failed} failed. See the report in the ZIP.",
    exportIncomplete: "Exported {success} conversations, but account history was incomplete. See the report in the ZIP.",
    exportSingleIncomplete: "Exported {name}, but rendered-page fallback was used, so completeness could not be verified.",
    exportFailed: "Export failed: {error}",
    exportOpenPage: "Open a ChatGPT conversation page to export.",
    exportSelectAll: "Select all",
    exportSelectNone: "Clear",
    exportSelectedCount: "{count} selected",
    exportSelectionHint: "One selection downloads one file. Multiple selections download one ZIP with one file per conversation.",
    exportArchived: "Archived",
    exportCurrent: "Current chat",
    exportSelectProject: "Select project {name}",
    exportUngrouped: "Not in a project / regular chats",
    exportUnknownProject: "Unknown project",
    exportUpdated: "Updated {time}",
    exportListEmpty: "No account conversations are available to export.",
    exportNoSelection: "Select at least one conversation to export.",
    exportProgressSelected: "Reading selected conversations…",
    exportSearchPlaceholder: "Search titles or conversation IDs",
    exportSearchEmpty: "No conversations match this search.",
    exportCancel: "Cancel",
    exportCancelling: "Stopping; no new conversation reads will start…",
    exportCancelled: "Export cancelled.",
    statisticsData: "Statistics data",
    statisticsDataCurrent: "Backup / restore",
    statisticsDataExportJson: "Backup JSON",
    statisticsDataExportCsv: "Records CSV",
    statisticsDataImportJson: "Import backup",
    statisticsDataExporting: "Exporting statistics data…",
    statisticsDataExported: "Exported {name}",
    statisticsDataImportConfirm: "Importing replaces all current statistics. Continue?",
    statisticsDataImporting: "Importing statistics data…",
    statisticsDataImported: "Restored {count} usage records",
    statisticsDataImportInvalid: "This is not a valid statistics backup file.",
    statisticsDataImportUnsupported: "This statistics backup version is not supported.",
    statisticsDataImportTooLarge: "The statistics backup is larger than 10 MB and cannot be imported.",
    statisticsDataOperationFailed: "Statistics data operation failed: {error}",
    overlappingModels: "{count} models",
    customRange: "Custom dates",
    endDate: "End",
    all: "All",
    none: "Clear",
    featureAgentMode: "Agent Mode",
    featureAudio: "Audio",
    featureCanvas: "Canvas",
    featureCodeInterpreter: "Code interpreter",
    featureConnectors: "Connectors",
    featureDeepResearch: "Deep Research",
    featureFileUpload: "Files",
    featureGpts: "GPTs",
    featureImageGeneration: "Image generation",
    featureRealtime: "Realtime",
    featureTasks: "Tasks",
    featureWebSearch: "Web search",
    languageToggleEn: "EN",
    languageToggleZh: "中文",
    errorChromeMessaging: "Chrome runtime messaging is unavailable.",
    errorOpenAIStatus: "OpenAI status request failed.",
    openaiStatusIncomplete: "The complete component list is temporarily unavailable; available items from the official summary are shown.",
    openaiStatusTitle: "ChatGPT web status",
    openaiStatusView: "Status",
    parameterCombinations: "Parameters",
    parameterLatest: "Latest parameters",
    requestModels: "Request model",
    modelRelation: "Request → response",
    modelRelationSame: "Request and response model match",
    legacyUnlinked: "Historical records not linked",
    legacyUnlinkedHint: "Older aggregate records do not contain event-level links. Their original counts are preserved without guessing request, response, or conversation pairings.",
    reasoningEffort: "Reasoning effort",
    reasoningEffortInline: "Effort",
    reasoningUnspecified: "Unknown",
    relationConversations: "Related conversations",
    sourceFilterAll: "All",
    sourceFilterChat: "Chat",
    sourceFilterWork: "Work",
    sourceModeChat: "Chat",
    sourceModeWork: "Work",
    sourceModeUnknown: "Unknown",
    responsePending: "Unknown",
    startDate: "Start",
    todayOnly: "Today {today}",
    variants: "Response model"
  });

  function normalizeLanguage(value) {
    return value === "zh" ? "zh" : DEFAULT_LANGUAGE;
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
    var year = value.getUTCFullYear();
    var month = String(value.getUTCMonth() + 1).padStart(2, "0");
    var day = String(value.getUTCDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function parseDateKey(key) {
    var parts = String(key || "").split("-").map(Number);
    return new Date(Date.UTC(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1));
  }

  function addDays(date, days) {
    var next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cssAttributeValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function stableVisualIndex(value, size) {
    var clean = String(value || "");
    var hash = 2166136261;
    for (var index = 0; index < clean.length; index += 1) {
      hash ^= clean.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % Math.max(1, Number(size) || 1);
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
    return !clean ||
      /^(unknown|unknownmodel|unresolved|unresolvedmodel)$/.test(key) ||
      /^(?:gpt)?lastusedmodel$/.test(key) ||
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

  function isRecordedConversationMode(model, metadata, rawModel) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var parameters = modelParametersFromMetadata(source);
    var requestModel = normalizedDashboardModelName(
      parameters.model || source.chatgptModel || source.apiModel
    );
    var modelName = normalizedDashboardModelName(model);
    var rawName = normalizedDashboardModelName(rawModel);
    var labelName = normalizedDashboardModelName(source.label);

    if (requestModel === "research") {
      return [modelName, rawName, labelName].some(function isResearchName(name) {
        return name === "research" || name === "deep-research";
      });
    }
    if (requestModel === "agent-mode") {
      return [modelName, rawName, labelName].some(function isAgentName(name) {
        return name === "agent-mode";
      });
    }
    return false;
  }

  function isDashboardModelValid(model, metadata, rawModel) {
    // Exact request slugs and public dotted names are both valid model
    // identities. Deep Research and Agent Mode are also recorded choices when
    // trusted request metadata proves their exact request slug. Other
    // unresolved placeholders and feature-only names are removed here.
    if (isRecordedConversationMode(model, metadata, rawModel)) {
      return true;
    }
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
      relationsByModel: {},
      analyticsByDate: {},
      analyticsHistoryComplete: true,
      events: [],
      eventHistoryComplete: true,
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

    ["parametersByModel", "featuresByModel", "relationsByModel"].forEach(function copyAggregate(collection) {
      Object.keys(source[collection] || {}).forEach(function copyModel(model) {
        var metadata = sourceModels[model];
        if (isDashboardModelValid(model, metadata, model)) {
          clean[collection][model] = source[collection][model];
        }
      });
    });

    clean.analyticsByDate = source.analyticsByDate && typeof source.analyticsByDate === "object"
      ? source.analyticsByDate
      : {};
    clean.analyticsHistoryComplete = source.analyticsHistoryComplete === true;

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
      if (!event) {
        return false;
      }
      var requestModel = event.requestModelEvidence === "unavailable"
        ? ""
        : String(event.requestModel || "").trim();
      var responseModel = String(event.responseModel || "").trim();
      return isDashboardModelValid(event.model, event, event.model) ||
        (requestModel && isDashboardModelValid(requestModel, {}, requestModel)) ||
        (responseModel && isDashboardModelValid(responseModel, {}, responseModel));
    });
    clean.eventHistoryComplete = source.eventHistoryComplete !== false;
    if (!Object.prototype.hasOwnProperty.call(source, "analyticsByDate")) {
      clean.analyticsByDate = {};
      clean.events.slice().reverse().forEach(function replayEvent(event) {
        var dateKey = eventDateKey(event);
        var sourceMode = normalizeDashboardSourceMode(event && event.sourceMode);
        var requestModel = eventRequestModel(event);
        var responseModel = eventResponseModel(event);
        var model = String(event && event.model || "").trim() ||
          responseModel ||
          requestModel;
        if (!dateKey || !model) {
          return;
        }
        var day = clean.analyticsByDate[dateKey] || {};
        var sourceModelsForDate = day[sourceMode] || {};
        var relations = sourceModelsForDate[model] || {};
        addEventToRelation(relations, event);
        sourceModelsForDate[model] = relations;
        day[sourceMode] = sourceModelsForDate;
        clean.analyticsByDate[dateKey] = day;
      });
      clean.analyticsHistoryComplete = Boolean(
        clean.eventHistoryComplete &&
        clean.events.length === countTotal(clean.totals)
      );
    }
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
      var name = String(event.responseModel || "").replace(/\s+/g, " ").trim();
      if (!name) {
        return;
      }
      if (!groups[name]) {
        groups[name] = {
          name: name,
          count: 0,
          mode: event.modelMode || "",
          apiModel: event.responseModel || event.apiModel || "",
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

  function eventRequestModels(stats, model, events) {
    var groups = {};
    (events || stats.events || []).forEach(function collect(event) {
      if (!event || event.model !== model) {
        return;
      }
      var name = String(
        event.requestModel ||
          (event.modelParameters && event.modelParameters.model) ||
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

  function storedRequestModels(stats, model) {
    var fields = stats && stats.parametersByModel && stats.parametersByModel[model] &&
      stats.parametersByModel[model].fields;
    var models = fields && fields.model;
    if (!models || typeof models !== "object") {
      return [];
    }
    return Object.keys(models).map(function toValue(name) {
      return {
        name: name,
        count: Number(models[name]) || 0,
        lastSubmittedAt: ""
      };
    }).filter(function positive(row) {
      return row.name && row.count > 0;
    });
  }

  function modelRequestModels(stats, model, limit, events) {
    stats = sanitizeDashboardStats(stats || {});
    var hasEventRows = Array.isArray(events) && events.length > 0;
    var hasEventArgument = Array.isArray(events);
    var requests = hasEventRows
      ? eventRequestModels(stats, model, events)
      : storedRequestModels(stats, model);
    if (!requests.length && !hasEventArgument) {
      requests = eventRequestModels(stats, model);
    }
    return requests
      .sort(function byCountThenRecent(a, b) {
        return b.count - a.count || String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt));
      })
      .slice(0, limit || requests.length);
  }

  function pendingResponseCount(model, events) {
    return (Array.isArray(events) ? events : []).reduce(function countPending(total, event) {
      return total + (
        event &&
        event.model === model &&
        !String(event.responseModel || "").trim()
          ? 1
          : 0
      );
    }, 0);
  }

  function normalizeDashboardSourceMode(value) {
    var clean = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    return clean === "chat" || clean === "work" ? clean : "unknown";
  }

  function normalizeSourceModeFilter(value) {
    var clean = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
    return clean === "chat" || clean === "work" ? clean : "all";
  }

  function normalizeStatisticsMode(value) {
    return String(value || "").trim().toLowerCase() === "internal"
      ? "internal"
      : DEFAULT_STATISTICS_MODE;
  }

  function normalizeChartType(value) {
    return String(value || "").trim().toLowerCase() === "donut"
      ? "donut"
      : DEFAULT_CHART_TYPE;
  }

  function normalizeThemeMode(value) {
    var clean = String(value || "").trim().toLowerCase();
    return clean === "light" || clean === "dark" ? clean : DEFAULT_THEME_MODE;
  }

  function eventReasoningEffort(event) {
    var direct = String(event && event.requestReasoningEffort || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .slice(0, 32);
    var parameters = event && event.modelParameters && typeof event.modelParameters === "object"
      ? event.modelParameters
      : {};
    var value = parameters["reasoning.effort"] || parameters.reasoning_effort;
    if (!value && parameters.reasoning && typeof parameters.reasoning === "object") {
      value = parameters.reasoning.effort;
    }
    return direct || String(value || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 32) || "unspecified";
  }

  function relationKey(requestModel, responseModel) {
    return String(requestModel || "") + "\u0001" + String(responseModel || "");
  }

  function addEventToRelation(groups, event) {
    if (!event) {
      return;
    }
    var requestModel = eventRequestModel(event);
    var responseModel = eventResponseModel(event);
    if (!requestModel && !responseModel) {
      return;
    }
    var key = relationKey(requestModel, responseModel);
    var relation = groups[key] || {
      requestModel: requestModel,
      responseModel: responseModel,
      count: 0,
      efforts: {},
      features: {},
      sourceModes: {},
      conversations: {},
      firstSubmittedAt: String(event.submittedAt || ""),
      lastSubmittedAt: ""
    };
    relation.count += 1;
    var effort = eventReasoningEffort(event);
    relation.efforts[effort] = (relation.efforts[effort] || 0) + 1;
    (Array.isArray(event.usageFeatures) ? event.usageFeatures : []).forEach(function addFeature(rawFeature) {
      var feature = normalizeDashboardFeatureId(rawFeature);
      if (feature) {
        relation.features[feature] = (relation.features[feature] || 0) + 1;
      }
    });
    var sourceMode = normalizeDashboardSourceMode(event.sourceMode);
    relation.sourceModes[sourceMode] = (relation.sourceModes[sourceMode] || 0) + 1;
    var actualConversationId = String(event.conversationId || "").trim();
    var conversationId = actualConversationId || (
      event.submissionId ? "pending:" + String(event.submissionId).slice(0, 96) : ""
    );
    if (conversationId) {
      var conversation = relation.conversations[conversationId] || {
        conversationId: conversationId,
        title: actualConversationId ? (event.pageTitle || conversationId) : "",
        count: 0,
        firstSubmittedAt: String(event.submittedAt || ""),
        lastSubmittedAt: "",
        lastPageUrl: actualConversationId ? (event.pageUrl || ("https://chatgpt.com/c/" + conversationId)) : "",
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
      conversation.sourceModes[sourceMode] = (Number(conversation.sourceModes[sourceMode]) || 0) + 1;
      conversation.efforts[effort] = (Number(conversation.efforts[effort]) || 0) + 1;
      if (String(event.submittedAt || "") >= String(conversation.lastSubmittedAt || "")) {
        conversation.lastSubmittedAt = String(event.submittedAt || "");
        conversation.lastPageUrl = actualConversationId ? (event.pageUrl || conversation.lastPageUrl) : "";
        conversation.title = actualConversationId ? (event.pageTitle || conversation.title) : "";
        conversation.sourceMode = sourceMode;
      }
      relation.conversations[conversationId] = conversation;
    }
    if (String(event.submittedAt || "") > String(relation.lastSubmittedAt || "")) {
      relation.lastSubmittedAt = String(event.submittedAt || "");
    }
    groups[key] = relation;
  }

  function eventModelRelations(stats, model, events) {
    var groups = {};
    (events || stats.events || []).forEach(function collect(event) {
      if (event && event.model === model) {
        addEventToRelation(groups, event);
      }
    });
    return Object.keys(groups).map(function toRelation(key) { return groups[key]; });
  }

  function storedModelRelations(stats, model) {
    var source = stats && stats.relationsByModel && stats.relationsByModel[model];
    return Object.keys(source || {}).map(function toRelation(key) {
      var relation = source[key] || {};
      return {
        requestModel: String(relation.requestModel || ""),
        responseModel: String(relation.responseModel || ""),
        count: Number(relation.count) || 0,
        efforts: Object.assign({}, relation.efforts || {}),
        features: Object.assign({}, relation.features || {}),
        sourceModes: Object.assign({}, relation.sourceModes || {}),
        conversations: Object.assign({}, relation.conversations || {}),
        firstSubmittedAt: String(relation.firstSubmittedAt || ""),
        lastSubmittedAt: String(relation.lastSubmittedAt || "")
      };
    }).filter(function valid(relation) {
      return (relation.requestModel || relation.responseModel) && relation.count > 0;
    });
  }

  function isFullDashboardRange(stats, state) {
    if (normalizeSourceModeFilter(state && state.sourceModeFilter) !== "all") {
      return false;
    }
    if (!hasExplicitDateRange(state || {})) {
      return true;
    }
    var dates = Object.keys(stats && stats.byDate || {}).sort();
    var firstDate = dates[0] || defaultEndDate();
    return normalizeDateInput(state && state.startDate) === firstDate &&
      normalizeDateInput(state && state.endDate) === defaultEndDate();
  }

  function relationConversationRemainder(stats, model, state, relations) {
    var covered = {};
    (relations || []).forEach(function countCovered(relation) {
      Object.keys(relation && relation.conversations || {}).forEach(function addCovered(id) {
        var conversation = relation.conversations[id] || {};
        covered[id] = (covered[id] || 0) + (Number(conversation.count) || 0);
      });
    });
    var remainder = {};
    modelSessions(stats, model, state).forEach(function addSession(session) {
      if (!session || !session.conversationId) {
        return;
      }
      var remaining = Math.max(0, (Number(session.count) || 0) - (covered[session.conversationId] || 0));
      if (!remaining) {
        return;
      }
      remainder[session.conversationId] = {
        conversationId: session.conversationId,
        title: session.title || session.conversationId,
        count: remaining,
        firstSubmittedAt: session.firstSubmittedAt || "",
        lastSubmittedAt: session.lastSubmittedAt || "",
        lastPageUrl: session.lastPageUrl || "",
        sourceMode: normalizeDashboardSourceMode(session.sourceMode)
      };
    });
    return remainder;
  }

  function augmentOnlyRelationFromModelAggregates(stats, model, state, relation, targetCount) {
    if (!relation || relation.legacyUnlinked || Number(relation.count) !== Number(targetCount)) {
      return relation;
    }
    modelFeatures(stats, model, state, 100).forEach(function mergeFeature(feature) {
      var count = Math.min(Number(relation.count) || 0, Number(feature && feature.count) || 0);
      if (feature && feature.id && count > Number(relation.features[feature.id] || 0)) {
        relation.features[feature.id] = count;
      }
    });
    var sessions = modelSessions(stats, model, state);
    var sessionTotal = sessions.reduce(function sum(total, session) {
      return total + (Number(session && session.count) || 0);
    }, 0);
    if (sessionTotal > 0 && sessionTotal <= Number(relation.count)) {
      sessions.forEach(function mergeSession(session) {
        if (!session || !session.conversationId) {
          return;
        }
        var current = relation.conversations[session.conversationId];
        if (!current || Number(session.count) > Number(current.count)) {
          relation.conversations[session.conversationId] = {
            conversationId: session.conversationId,
            title: session.title || session.conversationId,
            count: Number(session.count) || 0,
            firstSubmittedAt: session.firstSubmittedAt || "",
            lastSubmittedAt: session.lastSubmittedAt || "",
            lastPageUrl: session.lastPageUrl || "",
            sourceMode: normalizeDashboardSourceMode(session.sourceMode || (current && current.sourceMode))
          };
        }
      });
    }
    return relation;
  }

  function modelRelations(stats, model, state) {
    stats = sanitizeDashboardStats(stats || {});
    var relations = isFullDashboardRange(stats, state)
      ? storedModelRelations(stats, model)
      : aggregateRelationsInRange(stats, state, model).map(function relationFromEntry(entry) {
          return entry.relation;
        });
    if (!relations.length) {
      relations = aggregateRelationsInRange(stats, state, model).map(function relationFromEntry(entry) {
        return entry.relation;
      });
    }
    if (!relations.length && !Object.keys(stats.analyticsByDate || {}).length) {
      relations = eventModelRelations(stats, model, rangeEvents(stats, state, model));
    }
    var targetCount = hasExplicitDateRange(state || {})
      ? (Number(modelTotalsInRange(stats, state)[model]) || 0)
      : (Number(stats.totals && stats.totals[model]) || 0);
    if (relations.length === 1) {
      relations[0] = augmentOnlyRelationFromModelAggregates(stats, model, state, relations[0], targetCount);
    }
    var linkedCount = relations.reduce(function sum(total, relation) {
      return total + (Number(relation && relation.count) || 0);
    }, 0);
    if (targetCount > linkedCount) {
      relations.push({
        legacyUnlinked: true,
        showAggregateDetails: linkedCount === 0,
        requestModel: "",
        responseModel: "",
        count: targetCount - linkedCount,
        efforts: {},
        features: {},
        sourceModes: {},
        conversations: relationConversationRemainder(stats, model, state, relations),
        firstSubmittedAt: "",
        lastSubmittedAt: ""
      });
    }
    return relations.sort(function byCountThenRecent(left, right) {
      if (Boolean(left.legacyUnlinked) !== Boolean(right.legacyUnlinked)) {
        return left.legacyUnlinked ? 1 : -1;
      }
      return right.count - left.count ||
        String(right.lastSubmittedAt || "").localeCompare(String(left.lastSubmittedAt || "")) ||
        left.requestModel.localeCompare(right.requestModel) ||
        left.responseModel.localeCompare(right.responseModel);
    });
  }

  function featureLabel(state, id) {
    var key = {
      image_generation: "featureImageGeneration",
      deep_research: "featureDeepResearch",
      agent_mode: "featureAgentMode",
      web_search: "featureWebSearch",
      realtime: "featureRealtime",
      audio: "featureAudio",
      canvas: "featureCanvas",
      file_upload: "featureFileUpload",
      code_interpreter: "featureCodeInterpreter",
      connectors: "featureConnectors",
      gpts: "featureGpts",
      tasks: "featureTasks"
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
    if (/^(file_upload|fileupload|attachment|attachments|file_attachment)$/.test(versionless)) return "file_upload";
    if (/^(code_interpreter|codeinterpreter|data_analysis|dataanalysis|python)$/.test(versionless)) return "code_interpreter";
    if (/^(connectors|connector|apps|connected_apps|connectedapps)$/.test(versionless)) return "connectors";
    if (/^(gpts|gpt_id|gptid|gizmo|gizmo_id|gizmoid|custom_gpt|customgpt)$/.test(versionless)) return "gpts";
    if (/^(tasks|scheduled_task|scheduledtask|scheduled_tasks)$/.test(versionless)) return "tasks";
    return "";
  }

  function modelFeatures(stats, model, state, limit) {
    stats = sanitizeDashboardStats(stats || {});
    var rowsById = {};
    var entries = aggregateRelationsInRange(stats, state, model);
    entries.forEach(function addRelationFeatures(entry) {
      var relation = entry && entry.relation || {};
      Object.keys(relation.features || {}).forEach(function addFeature(rawId) {
        var id = normalizeDashboardFeatureId(rawId);
        var count = Math.max(0, Number(relation.features[rawId]) || 0);
        if (!id || count <= 0) {
          return;
        }
        var row = rowsById[id] || {
          id: id,
          label: featureLabel(state, id),
          count: 0,
          lastSubmittedAt: ""
        };
        row.count += count;
        if (String(relation.lastSubmittedAt || "") > row.lastSubmittedAt) {
          row.lastSubmittedAt = String(relation.lastSubmittedAt || "");
        }
        rowsById[id] = row;
      });
    });

    if (!entries.length && !Object.keys(stats.analyticsByDate || {}).length) {
      rangeEvents(stats, state, model).forEach(function addRetainedEvent(event) {
        (Array.isArray(event && event.usageFeatures) ? event.usageFeatures : []).forEach(function addFeature(rawId) {
          var id = normalizeDashboardFeatureId(rawId);
          if (!id) {
            return;
          }
          var row = rowsById[id] || {
            id: id,
            label: featureLabel(state, id),
            count: 0,
            lastSubmittedAt: ""
          };
          row.count += 1;
          row.lastSubmittedAt = String(event.submittedAt || row.lastSubmittedAt);
          rowsById[id] = row;
        });
      });
    }

    return Object.keys(rowsById).map(function toRow(id) {
      return rowsById[id];
    }).sort(function byCount(a, b) {
      return b.count - a.count || String(b.lastSubmittedAt).localeCompare(String(a.lastSubmittedAt));
    }).slice(0, limit || Object.keys(rowsById).length);
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
      return response && response.settings
        ? response.settings
        : {
            language: DEFAULT_LANGUAGE,
            activeView: "chart",
            statisticsMode: DEFAULT_STATISTICS_MODE,
            chartType: DEFAULT_CHART_TYPE,
            themeMode: DEFAULT_THEME_MODE,
            sourceModeFilter: "all",
            showLineChart: true,
            showDonutChart: false,
            showTrendChart: true,
            showTextStatistics: true,
            startDate: "",
            endDate: ""
          };
    }).catch(function defaultSettings() {
      return {
        language: DEFAULT_LANGUAGE,
        activeView: "chart",
        statisticsMode: DEFAULT_STATISTICS_MODE,
        chartType: DEFAULT_CHART_TYPE,
        themeMode: DEFAULT_THEME_MODE,
        sourceModeFilter: "all",
        showLineChart: true,
        showDonutChart: false,
        showTrendChart: true,
        showTextStatistics: true,
        startDate: "",
        endDate: ""
      };
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

  function saveSettings(state, fields) {
    var mappedSelection = state.selectedModelsByStatisticsMode &&
      state.selectedModelsByStatisticsMode.mapped || {};
    var mappedKnown = state.knownModelsByStatisticsMode &&
      state.knownModelsByStatisticsMode.mapped || {};
    var internalSelection = state.selectedModelsByStatisticsMode &&
      state.selectedModelsByStatisticsMode.internal || {};
    var internalKnown = state.knownModelsByStatisticsMode &&
      state.knownModelsByStatisticsMode.internal || {};
    var completeSettings = {
      language: normalizeLanguage(state.language),
      activeView: normalizeView(state.activeView),
      statisticsMode: normalizeStatisticsMode(state.statisticsMode),
      chartType: normalizeChartType(state.chartType),
      themeMode: normalizeThemeMode(state.themeMode),
      sourceModeFilter: normalizeSourceModeFilter(state.sourceModeFilter),
      showLineChart: state.showLineChart !== false,
      showDonutChart: state.showDonutChart === true,
      showTrendChart: state.showLineChart !== false || state.showDonutChart === true,
      showTextStatistics: state.showTextStatistics !== false,
      startDate: dateNoLaterThanToday(state.startDate),
      endDate: dateNoLaterThanToday(state.endDate) || defaultEndDate(),
      mappedVisibleModels: Object.keys(mappedSelection).filter(function visible(model) {
        return mappedSelection[model] === true;
      }),
      mappedKnownModels: Object.keys(mappedKnown).filter(function known(model) {
        return mappedKnown[model] === true;
      }),
      mappedModelSelectionInitialized: Boolean(
        state.modelSelectionInitializedByMode &&
        state.modelSelectionInitializedByMode.mapped
      ),
      internalVisibleModels: Object.keys(internalSelection).filter(function visible(model) {
        return internalSelection[model] === true;
      }),
      internalKnownModels: Object.keys(internalKnown).filter(function known(model) {
        return internalKnown[model] === true;
      }),
      internalModelSelectionInitialized: Boolean(
        state.modelSelectionInitializedByMode &&
        state.modelSelectionInitializedByMode.internal
      )
    };
    var selectedFields = Array.isArray(fields) && fields.length
      ? fields
      : Object.keys(completeSettings);
    var settingsPatch = {};
    selectedFields.forEach(function includeSetting(field) {
      if (Object.prototype.hasOwnProperty.call(completeSettings, field)) {
        settingsPatch[field] = completeSettings[field];
      }
    });
    return sendMessage({
      type: "settings.set",
      settings: settingsPatch
    }, state);
  }

  function modelSelectionSettingFields(mode) {
    return normalizeStatisticsMode(mode) === "internal"
      ? [
          "internalVisibleModels",
          "internalKnownModels",
          "internalModelSelectionInitialized"
        ]
      : [
          "mappedVisibleModels",
          "mappedKnownModels",
          "mappedModelSelectionInitialized"
        ];
  }

  function modelListToSelection(models) {
    return (Array.isArray(models) ? models : []).reduce(function toMap(map, model) {
      var key = String(model || "").trim();
      if (key) {
        map[key] = true;
      }
      return map;
    }, {});
  }

  function applyPersistedModelSelections(state, settings) {
    settings = settings && typeof settings === "object" ? settings : {};
    state.selectedModelsByStatisticsMode = {
      mapped: modelListToSelection(settings.mappedVisibleModels),
      internal: modelListToSelection(settings.internalVisibleModels)
    };
    state.knownModelsByStatisticsMode = {
      mapped: modelListToSelection(settings.mappedKnownModels),
      internal: modelListToSelection(settings.internalKnownModels)
    };
    state.modelSelectionInitializedByMode = {
      mapped: settings.mappedModelSelectionInitialized === true,
      internal: settings.internalModelSelectionInitialized === true
    };
    var mode = normalizeStatisticsMode(state.statisticsMode);
    state.selectedModels = state.selectedModelsByStatisticsMode[mode];
    state.knownModels = state.knownModelsByStatisticsMode[mode];
    state.modelSelectionInitialized = Boolean(state.modelSelectionInitializedByMode[mode]);
  }

  function persistedModelSelectionKey(settings) {
    var source = settings && typeof settings === "object" ? settings : {};
    return JSON.stringify([
      (Array.isArray(source.mappedVisibleModels) ? source.mappedVisibleModels : []).slice().sort(),
      (Array.isArray(source.mappedKnownModels) ? source.mappedKnownModels : []).slice().sort(),
      source.mappedModelSelectionInitialized === true,
      (Array.isArray(source.internalVisibleModels) ? source.internalVisibleModels : []).slice().sort(),
      (Array.isArray(source.internalKnownModels) ? source.internalKnownModels : []).slice().sort(),
      source.internalModelSelectionInitialized === true
    ]);
  }

  function currentModelSelectionKey(state) {
    var selected = state.selectedModelsByStatisticsMode || {};
    var known = state.knownModelsByStatisticsMode || {};
    var initialized = state.modelSelectionInitializedByMode || {};
    function activeKeys(map) {
      return Object.keys(map || {}).filter(function active(key) {
        return map[key] === true;
      }).sort();
    }
    return JSON.stringify([
      activeKeys(selected.mapped),
      activeKeys(known.mapped),
      initialized.mapped === true,
      activeKeys(selected.internal),
      activeKeys(known.internal),
      initialized.internal === true
    ]);
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

  function dateNoLaterThanToday(value) {
    var clean = normalizeDateInput(value);
    if (!clean) {
      return "";
    }
    var today = defaultEndDate();
    return clean > today ? today : clean;
  }

  function dateRange(stats, startDate, endDate) {
    var startKey = dateNoLaterThanToday(startDate) || defaultStartDate(stats || {});
    var endKey = dateNoLaterThanToday(endDate) || defaultEndDate();
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
    var sourceModeFilter = normalizeSourceModeFilter(state && state.sourceModeFilter);
    if (sourceModeFilter !== "all") {
      return aggregateRelationsInRange(stats, state).reduce(function addRelation(totals, entry) {
        if (entry && entry.model && entry.relation) {
          totals[entry.model] = (Number(totals[entry.model]) || 0) +
            (Number(entry.relation.count) || 0);
        }
        return totals;
      }, {});
    }
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

  function eventRequestModel(event) {
    if (event && event.requestModelEvidence === "unavailable") {
      return "";
    }
    return String(event && event.requestModel || "").replace(/\s+/g, " ").trim();
  }

  function eventResponseModel(event) {
    return String(event && event.responseModel || "").replace(/\s+/g, " ").trim();
  }

  function statisticsEventKey(event, mode) {
    if (normalizeStatisticsMode(mode) === "internal") {
      return eventRequestModel(event) || INTERNAL_UNKNOWN_REQUEST;
    }
    return String(event && event.model || "").trim();
  }

  function statisticsKeyLabel(state, key) {
    return key === INTERNAL_UNKNOWN_REQUEST || key === INTERNAL_UNKNOWN_RESPONSE
      ? text(state, "responsePending")
      : String(key || "");
  }

  function rangeEvents(stats, state, model) {
    stats = sanitizeDashboardStats(stats || {});
    var lookup = dateRangeLookup(stats, state || {});
    var sourceModeFilter = normalizeSourceModeFilter(state && state.sourceModeFilter);
    return (stats.events || []).filter(function keepEvent(event) {
      return event &&
        (!model || event.model === model) &&
        (sourceModeFilter === "all" || normalizeDashboardSourceMode(event.sourceMode) === sourceModeFilter) &&
        Boolean(lookup[eventDateKey(event)]);
    });
  }

  function mergeRelationAggregate(target, incoming) {
    var source = incoming && typeof incoming === "object" ? incoming : {};
    var relation = target || {
      requestModel: String(source.requestModel || ""),
      responseModel: String(source.responseModel || ""),
      count: 0,
      efforts: {},
      features: {},
      sourceModes: {},
      conversations: {},
      firstSubmittedAt: String(source.firstSubmittedAt || ""),
      lastSubmittedAt: ""
    };
    relation.count += Math.max(0, Number(source.count) || 0);
    ["efforts", "features", "sourceModes"].forEach(function mergeCountMap(field) {
      Object.keys(source[field] || {}).forEach(function addCount(key) {
        relation[field][key] = (Number(relation[field][key]) || 0) +
          Math.max(0, Number(source[field][key]) || 0);
      });
    });
    Object.keys(source.conversations || {}).forEach(function mergeConversation(id) {
      var next = source.conversations[id] || {};
      var current = relation.conversations[id] || {
        conversationId: String(next.conversationId || id),
        title: String(next.title || next.pageTitle || id),
        count: 0,
        firstSubmittedAt: String(next.firstSubmittedAt || ""),
        lastSubmittedAt: "",
        lastPageUrl: String(next.lastPageUrl || next.pageUrl || ""),
        sourceMode: normalizeDashboardSourceMode(next.sourceMode),
        sourceModes: {},
        efforts: {}
      };
      current.count += Math.max(0, Number(next.count) || 0);
      current.sourceModes = current.sourceModes && typeof current.sourceModes === "object"
        ? current.sourceModes
        : {};
      var nextSourceModes = next.sourceModes && typeof next.sourceModes === "object"
        ? next.sourceModes
        : {};
      var nextSourceModeKeys = Object.keys(nextSourceModes).filter(function positiveSourceMode(mode) {
        return Number(nextSourceModes[mode]) > 0;
      });
      if (nextSourceModeKeys.length) {
        nextSourceModeKeys.forEach(function mergeSourceMode(mode) {
          var normalizedMode = normalizeDashboardSourceMode(mode);
          current.sourceModes[normalizedMode] =
            (Number(current.sourceModes[normalizedMode]) || 0) +
            Math.max(0, Number(nextSourceModes[mode]) || 0);
        });
      } else {
        var sourceMode = normalizeDashboardSourceMode(next.sourceMode);
        current.sourceModes[sourceMode] = (Number(current.sourceModes[sourceMode]) || 0) +
          Math.max(0, Number(next.count) || 0);
      }
      current.efforts = current.efforts && typeof current.efforts === "object"
        ? current.efforts
        : {};
      Object.keys(next.efforts || {}).forEach(function mergeConversationEffort(effort) {
        current.efforts[effort] = (Number(current.efforts[effort]) || 0) +
          Math.max(0, Number(next.efforts[effort]) || 0);
      });
      if (
        !current.firstSubmittedAt ||
        String(next.firstSubmittedAt || "") < current.firstSubmittedAt
      ) {
        current.firstSubmittedAt = String(next.firstSubmittedAt || current.firstSubmittedAt);
      }
      if (String(next.lastSubmittedAt || "") >= String(current.lastSubmittedAt || "")) {
        current.lastSubmittedAt = String(next.lastSubmittedAt || "");
        current.lastPageUrl = String(next.lastPageUrl || next.pageUrl || current.lastPageUrl);
        current.title = String(next.title || next.pageTitle || current.title);
        current.sourceMode = sourceMode;
      }
      relation.conversations[id] = current;
    });
    if (
      !relation.firstSubmittedAt ||
      String(source.firstSubmittedAt || "") < relation.firstSubmittedAt
    ) {
      relation.firstSubmittedAt = String(source.firstSubmittedAt || relation.firstSubmittedAt);
    }
    if (String(source.lastSubmittedAt || "") > String(relation.lastSubmittedAt || "")) {
      relation.lastSubmittedAt = String(source.lastSubmittedAt || "");
    }
    return relation;
  }

  function aggregateRelationsInRange(stats, state, mappedModel) {
    stats = sanitizeDashboardStats(stats || {});
    var lookup = dateRangeLookup(stats, state || {});
    var sourceModeFilter = normalizeSourceModeFilter(state && state.sourceModeFilter);
    var groups = {};
    Object.keys(stats.analyticsByDate || {}).forEach(function collectDate(dateKey) {
      if (!lookup[dateKey]) {
        return;
      }
      var day = stats.analyticsByDate[dateKey] || {};
      var sourceModes = sourceModeFilter === "all"
        ? ["chat", "work", "unknown"]
        : [sourceModeFilter];
      sourceModes.forEach(function collectSource(sourceMode) {
        var models = day[sourceMode] || {};
        Object.keys(models).forEach(function collectModel(model) {
          if (mappedModel && model !== mappedModel) {
            return;
          }
          Object.keys(models[model] || {}).forEach(function collectRelation(key) {
            var incoming = models[model][key];
            if (!incoming || Number(incoming.count) <= 0) {
              return;
            }
            var aggregateKey = model + "\u0002" +
              relationKey(incoming.requestModel, incoming.responseModel);
            var entry = groups[aggregateKey] || {
              model: model,
              relation: null
            };
            entry.relation = mergeRelationAggregate(entry.relation, incoming);
            groups[aggregateKey] = entry;
          });
        });
      });
    });
    return Object.keys(groups).map(function toRelationEntry(key) {
      return groups[key];
    });
  }

  function statisticsTotalsInRange(stats, state) {
    if (normalizeStatisticsMode(state && state.statisticsMode) === "mapped") {
      return modelTotalsInRange(stats, state);
    }
    return aggregateRelationsInRange(stats, state).reduce(function addRequestModel(totals, entry) {
      var relation = entry && entry.relation;
      var key = String(relation && relation.requestModel || "") || INTERNAL_UNKNOWN_REQUEST;
      totals[key] = (Number(totals[key]) || 0) + (Number(relation && relation.count) || 0);
      return totals;
    }, {});
  }

  function eligibleModelsInRange(state) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    var totals = statisticsTotalsInRange(state.stats, state);
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
    var mode = normalizeStatisticsMode(state.statisticsMode);
    state.selectedModelsByStatisticsMode =
      state.selectedModelsByStatisticsMode && typeof state.selectedModelsByStatisticsMode === "object"
        ? state.selectedModelsByStatisticsMode
        : {};
    state.knownModelsByStatisticsMode =
      state.knownModelsByStatisticsMode && typeof state.knownModelsByStatisticsMode === "object"
        ? state.knownModelsByStatisticsMode
        : {};
    if (!state.selectedModelsByStatisticsMode.mapped) {
      state.selectedModelsByStatisticsMode.mapped =
        state.selectedModels && typeof state.selectedModels === "object"
          ? state.selectedModels
          : {};
    }
    if (!state.knownModelsByStatisticsMode.mapped) {
      state.knownModelsByStatisticsMode.mapped =
        state.knownModels && typeof state.knownModels === "object"
          ? state.knownModels
          : {};
    }
    state.selectedModelsByStatisticsMode.internal =
      state.selectedModelsByStatisticsMode.internal || {};
    state.knownModelsByStatisticsMode.internal =
      state.knownModelsByStatisticsMode.internal || {};
    state.selectedModels = state.selectedModelsByStatisticsMode[mode];
    state.knownModels = state.knownModelsByStatisticsMode[mode];
    var models = mode === "mapped"
      ? Object.keys(state.stats.totals || {}).filter(function hasUsage(model) {
          return Number(state.stats.totals[model] || 0) > 0;
        })
      : Object.keys(aggregateRelationsInRange(state.stats, {
          startDate: Object.keys(state.stats.analyticsByDate || {}).sort()[0] || defaultStartDate(state.stats),
          endDate: defaultEndDate(),
          sourceModeFilter: "all"
        }).reduce(function collectRequestModels(keys, entry) {
          var relation = entry && entry.relation;
          keys[String(relation && relation.requestModel || "") || INTERNAL_UNKNOWN_REQUEST] = true;
          return keys;
        }, {}));
    var current = {};
    models.forEach(function selectNewModel(model) {
      current[model] = true;
      if (!state.modelSelectionInitializedByMode || !state.modelSelectionInitializedByMode[mode] || !state.knownModels[model]) {
        if (!(model in state.selectedModels)) {
          state.selectedModels[model] = true;
        }
      }
      state.knownModels[model] = true;
    });
    Object.keys(state.knownModels).forEach(function removeMissingKnownModel(model) {
      if (!current[model]) {
        delete state.knownModels[model];
      }
    });
    Object.keys(state.selectedModels).forEach(function removeMissingSelection(model) {
      if (!current[model]) {
        delete state.selectedModels[model];
      }
    });
    state.modelSelectionInitializedByMode = state.modelSelectionInitializedByMode || {};
    state.modelSelectionInitializedByMode[mode] = true;
    state.modelSelectionInitialized = true;
  }

  function chartSeries(stats, models, startDate, endDate) {
    stats = sanitizeDashboardStats(stats || {});
    var dates = dateRange(stats, startDate, endDate);
    return {
      dates: dates,
      series: models.map(function toSeries(model, index) {
        var observedDates = Object.keys(stats.byDate || {}).filter(function observed(date) {
          return Number(stats.byDate[date] && stats.byDate[date][model]) > 0;
        }).sort();
        var observedFrom = observedDates[0] || "";
        return {
          model: model,
          color: COLORS[index % COLORS.length],
          values: dates.map(function valueForDate(date) {
            if (observedFrom && date < observedFrom) {
              return null;
            }
            return Number((stats.byDate[date] && stats.byDate[date][model]) || 0);
          })
        };
      })
    };
  }

  function chartSeriesForState(stats, models, state) {
    var statisticsMode = normalizeStatisticsMode(state && state.statisticsMode);
    var sourceModeFilter = normalizeSourceModeFilter(state && state.sourceModeFilter);
    if (statisticsMode === "mapped" && sourceModeFilter === "all") {
      return chartSeries(stats, models, state && state.startDate, state && state.endDate);
    }
    var dates = dateRange(stats || {}, state && state.startDate, state && state.endDate);
    var valuesByModel = {};
    var observedFromByModel = {};
    models.forEach(function initialize(model) {
      valuesByModel[model] = {};
    });
    Object.keys(stats.analyticsByDate || {}).forEach(function addDate(date) {
      var day = stats.analyticsByDate[date] || {};
      var sourceModes = sourceModeFilter === "all"
        ? ["chat", "work", "unknown"]
        : [sourceModeFilter];
      sourceModes.forEach(function addSource(sourceMode) {
        var mappedModels = day[sourceMode] || {};
        Object.keys(mappedModels).forEach(function addMappedModel(mappedModel) {
          Object.keys(mappedModels[mappedModel] || {}).forEach(function addRelation(key) {
            var relation = mappedModels[mappedModel][key] || {};
            var model = statisticsMode === "internal"
              ? (String(relation.requestModel || "") || INTERNAL_UNKNOWN_REQUEST)
              : mappedModel;
            if (!valuesByModel[model] || Number(relation.count) <= 0) {
              return;
            }
            if (dates.indexOf(date) !== -1) {
              valuesByModel[model][date] = (valuesByModel[model][date] || 0) +
                (Number(relation.count) || 0);
            }
            if (!observedFromByModel[model] || date < observedFromByModel[model]) {
              observedFromByModel[model] = date;
            }
          });
        });
      });
    });
    return {
      dates: dates,
      series: models.map(function toSeries(model, index) {
        return {
          model: model,
          label: statisticsKeyLabel(state, model),
          color: COLORS[index % COLORS.length],
          values: dates.map(function valueForDate(date) {
            if (observedFromByModel[model] && date < observedFromByModel[model]) {
              return null;
            }
            return Number(valuesByModel[model] && valuesByModel[model][date]) || 0;
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
    var top = 14;
    var bottom = 44;
    var data = chartSeriesForState(stats, models, state);
    var colorByModel = statisticsColorMap(state);
    var lineStyleByModel = {};
    eligibleModelsInRange(state).forEach(function assignStableLineStyle(model) {
      lineStyleByModel[model] = LINE_STYLES[stableVisualIndex("line:" + model, LINE_STYLES.length)];
    });
    data.series.forEach(function keepToggleAndChartColorAligned(series) {
      series.color = colorByModel[series.model] || series.color;
      series.lineStyle = lineStyleByModel[series.model] || "none";
    });
    var max = Math.max(
      1,
      data.series.reduce(function maxSeries(total, series) {
        var observedValues = series.values.filter(function observed(value) {
          return value !== null && Number.isFinite(Number(value));
        }).map(Number);
        return Math.max(total, observedValues.length ? Math.max.apply(Math, observedValues) : 0);
      }, 0)
    );
    var plotWidth = width - left - right;
    var plotHeight = height - top - bottom;
    var denom = Math.max(1, data.dates.length - 1);
    var grid = [0, max * 0.25, max * 0.5, max * 0.75, max].map(function gridLine(value) {
      var y = top + plotHeight - (value / max) * plotHeight;
      return '<line x1="' + left + '" x2="' + (width - right) + '" y1="' + y + '" y2="' + y + '" class="usage-grid"/><text x="' + (left - 6) + '" y="' + (y + 4) + '" class="usage-axis usage-axis-y" text-anchor="end">' + Math.round(value) + "</text>";
    }).join("");
    var focusPaths = [];
    var revealMasks = [];
    var overlapPoints = {};
    var seriesSvg = data.series.map(function renderSeries(series, seriesIndex) {
      var seriesLabel = series.label || statisticsKeyLabel(state, series.model);
      var points = series.values.map(function point(value, index) {
        if (value === null) {
          return null;
        }
        return {
          x: left + (index / denom) * plotWidth,
          y: top + plotHeight - (value / max) * plotHeight,
          value: value,
          date: data.dates[index]
        };
      }).filter(Boolean);
      points.forEach(function rememberOverlap(point) {
        var overlapKey = point.date + "\u0001" + String(point.value);
        if (!overlapPoints[overlapKey]) {
          overlapPoints[overlapKey] = {
            x: point.x,
            y: point.y,
            count: 0
          };
        }
        overlapPoints[overlapKey].count += 1;
      });
      var pointCount = points.length;
      var pathData = svgPath(points);
      var circles = points.map(function renderPoint(point, pointIndex) {
        var progress = pointCount > 1 ? pointIndex / (pointCount - 1) : 0;
        var pointDelay = (0.04 + progress * 0.52).toFixed(3);
        return '<circle class="usage-point" cx="' + point.x + '" cy="' + point.y +
          '" r="3.5" style="--usage-point-delay:' + pointDelay + 's" fill="' + series.color +
          '" data-model="' + escapeHtml(series.model) + '" data-model-label="' + escapeHtml(seriesLabel) +
          '" data-date="' + point.date + '" data-value="' + point.value +
          '" data-point-index="' + pointIndex + '" data-chart-series="' +
          escapeHtml(series.model) + '"/>';
      }).join("");
      var maskId = "usage-line-reveal-" + seriesIndex;
      revealMasks.push(
        '<mask id="' + maskId + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' +
          width + '" height="' + height + '"><path class="usage-line-mask" d="' +
          pathData + '" pathLength="1" fill="none"/></mask>'
      );
      focusPaths.push(
        '<path class="usage-line-focus usage-line-focus-halo" d="' + pathData +
          '" fill="none" data-chart-focus="' + escapeHtml(series.model) + '"/>',
        '<path class="usage-line-focus usage-line-focus-color" d="' + pathData +
          '" fill="none" stroke="' + series.color + '" stroke-dasharray="' +
          series.lineStyle + '" data-chart-focus="' +
          escapeHtml(series.model) + '"/>'
      );
      return '<g class="usage-series" data-chart-series-group="' + escapeHtml(series.model) +
        '" style="--usage-line-dash:' + series.lineStyle + '"><path class="usage-line" d="' + pathData +
        '" fill="none" stroke="' + series.color + '" mask="url(#' + maskId +
        ')" data-chart-series="' +
        escapeHtml(series.model) + '"/>' + circles + "</g>";
    }).join("");
    var overlapSvg = Object.keys(overlapPoints).map(function renderOverlapRing(key) {
      var overlap = overlapPoints[key];
      return overlap.count > 1
        ? '<circle class="usage-overlap-ring" cx="' + overlap.x + '" cy="' +
          overlap.y + '" r="6.25" data-overlap-count="' + overlap.count + '"/>'
        : "";
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
      return '<text x="' + x + '" y="' + (height - 26) + '" class="usage-axis usage-axis-date" text-anchor="' + anchor + '">' + data.dates[index].slice(5) + "</text>";
    }).join("");
    var axisLabels = [
      '<text x="' + (width - right) + '" y="' + (height - 9) + '" class="usage-axis usage-axis-label" text-anchor="end">' + escapeHtml(text(state, "chartXAxis")) + "</text>"
    ].join("");

    var chartTitle = text(state, "chartTitle");
    return [
      '<div class="usage-chart-wrap usage-line-chart-wrap">',
      '<div class="usage-chart-head"><strong>' + escapeHtml(chartTitle) +
        '</strong><small>' + escapeHtml(text(state, "chartYAxis")) + "</small></div>",
      renderChartLegend(state, { showPercentage: true }),
      '<svg viewBox="0 0 ' + width + " " + height + '" class="usage-chart" role="img" aria-label="' +
        escapeHtml(chartTitle) + '"><defs>' + revealMasks.join("") + "</defs>" +
        axisLabels + grid + labels + seriesSvg + overlapSvg +
        focusPaths.join("") + "</svg>",
      '<div class="usage-tooltip" hidden></div>',
      "</div>"
    ].join("");
  }

  var REASONING_EFFORT_COLORS = {
    none: "var(--usage-effort-none)",
    min: "var(--usage-effort-min)",
    low: "var(--usage-effort-low)",
    medium: "var(--usage-effort-medium)",
    standard: "var(--usage-effort-standard)",
    high: "var(--usage-effort-high)",
    extended: "var(--usage-effort-extended)",
    max: "var(--usage-effort-max)",
    unknown: "var(--usage-effort-unknown)"
  };

  function donutSlices(items, total, attribute) {
    var offset = 0;
    return items.map(function renderSlice(item, index) {
      var percentage = total > 0 ? (Number(item.count) || 0) / total * 100 : 0;
      var start = offset;
      offset += percentage;
      var label = item.label + ": " + item.count + " (" + percentage.toFixed(1) + "%)";
      return '<circle class="usage-donut-slice" cx="100" cy="100" r="66" pathLength="100"' +
        ' fill="none" stroke="' + item.color + '" stroke-width="28" style="--usage-donut-size:' +
        percentage.toFixed(4) + ";--usage-donut-rest:" +
        Math.max(0, 100 - percentage).toFixed(4) + ";--usage-donut-delay:" +
        (index * 0.055).toFixed(3) + 's" stroke-dasharray="' +
        percentage.toFixed(4) + " " + Math.max(0, 100 - percentage).toFixed(4) +
        '" stroke-dashoffset="' + (-start).toFixed(4) + '" transform="rotate(-90 100 100)" ' +
        attribute + '="' + escapeHtml(item.key) + '" tabindex="0" role="button" aria-label="' +
        escapeHtml(label) + '"><title>' + escapeHtml(label) + "</title></circle>";
    }).join("");
  }

  function renderDonutLegend(items, total, interactiveAttribute) {
    return '<div class="usage-donut-legend">' + items.map(function renderLegend(item) {
      var percentage = total > 0 ? (Number(item.count) || 0) / total * 100 : 0;
      var interactive = interactiveAttribute
        ? ' tabindex="0" role="button" ' + interactiveAttribute + '="' + escapeHtml(item.key) + '"'
        : ' tabindex="0" role="button" data-effort-filter="' + escapeHtml(reasoningEffortClass(item.key)) + '"';
      return '<div class="usage-donut-legend-row"' + interactive + '><i style="--slice:' +
        item.color + '"></i><span style="color:' + item.color + '">' + escapeHtml(item.label) + '</span><b style="--slice:' +
        item.color + '">' +
        escapeHtml(String(Number(item.count) || 0)) + '</b><small>' +
        percentage.toFixed(1) + "%</small></div>";
    }).join("") + "</div>";
  }

  function donutTotalFontSize(total) {
    var length = String(Math.max(0, Number(total) || 0)).length;
    if (length >= 9) return 19;
    if (length >= 7) return 22;
    if (length >= 5) return 27;
    return 32;
  }

  function modelDonutItems(state, models) {
    var totals = statisticsTotalsInRange(state.stats, state);
    var colorByModel = statisticsColorMap(state);
    return models.map(function toItem(model) {
      return {
        key: model,
        label: statisticsKeyLabel(state, model),
        count: Number(totals[model]) || 0,
        color: colorByModel[model] || COLORS[0]
      };
    }).filter(function positive(item) {
      return item.count > 0;
    });
  }

  function effortDonutItems(state, model) {
    var counts = {};
    var statisticsMode = normalizeStatisticsMode(state.statisticsMode);
    aggregateRelationsInRange(state.stats, state).forEach(function countEffort(entry) {
      var relation = entry && entry.relation || {};
      var relationModel = statisticsMode === "internal"
        ? (String(relation.requestModel || "") || INTERNAL_UNKNOWN_REQUEST)
        : entry.model;
      if (relationModel !== model) {
        return;
      }
      Object.keys(relation.efforts || {}).forEach(function addEffort(rawEffort) {
        var effort = reasoningEffortClass(rawEffort);
        counts[effort] = (Number(counts[effort]) || 0) +
          (Number(relation.efforts[rawEffort]) || 0);
      });
    });
    return Object.keys(counts).sort(function effortOrder(left, right) {
      return REASONING_EFFORT_ORDER[left] - REASONING_EFFORT_ORDER[right];
    }).map(function toItem(effort) {
      return {
        key: effort,
        label: effort === "unknown" ? text(state, "reasoningUnspecified") : effort,
        count: Number(counts[effort]) || 0,
        color: REASONING_EFFORT_COLORS[effort] || REASONING_EFFORT_COLORS.unknown
      };
    });
  }

  function renderDonutChart(stats, models, state) {
    state.stats = sanitizeDashboardStats(stats || {});
    if (state.donutModel && models.indexOf(state.donutModel) === -1) {
      state.donutModel = "";
    }
    var drilledModel = String(state.donutModel || "");
    var items = drilledModel
      ? effortDonutItems(state, drilledModel)
      : modelDonutItems(state, models);
    var total = items.reduce(function add(sum, item) {
      return sum + (Number(item.count) || 0);
    }, 0);
    var title = drilledModel
      ? statisticsKeyLabel(state, drilledModel)
      : text(state, "chartCompositionTitle");
    var action = drilledModel
      ? '<button type="button" class="usage-donut-back" data-donut-back>' +
        escapeHtml(text(state, "chartCompositionBack")) + "</button>"
      : '<small>' + escapeHtml(text(state, "chartYAxis")) + "</small>";
    var warning = drilledModel && state.stats.analyticsHistoryComplete === false
      ? '<div class="usage-donut-warning">' +
        escapeHtml(text(state, "chartCompositionIncomplete")) + "</div>"
      : "";
    if (!total) {
      return [
        '<div class="usage-chart-wrap usage-donut-wrap">',
        '<div class="usage-chart-head"><strong>' + escapeHtml(title) + "</strong>" + action + "</div>",
        drilledModel ? "" : renderChartLegend(state, { showPercentage: true }),
        warning,
        '<div class="usage-empty">' + escapeHtml(text(state, "chartCompositionEmpty")) + "</div>",
        "</div>"
      ].join("");
    }
    var sliceAttribute = drilledModel ? "data-donut-effort" : "data-donut-model";
    var centerLabel = text(state, "chartCompositionTotalLabel");
    return [
      '<div class="usage-chart-wrap usage-donut-wrap">',
      '<div class="usage-chart-head"><strong>' + escapeHtml(title) + "</strong>" + action + "</div>",
      warning,
      '<div class="usage-donut-layout' +
        '"><svg class="usage-donut" viewBox="0 0 200 200" role="img" aria-label="' +
        escapeHtml(title) + '"><circle class="usage-donut-track" cx="100" cy="100" r="66" fill="none" stroke-width="28"/>' +
        donutSlices(items, total, sliceAttribute) +
        '<text class="usage-donut-total" x="100" y="96" text-anchor="middle" style="font-size:' +
        donutTotalFontSize(total) + 'px">' +
        escapeHtml(String(total)) + '</text><text class="usage-donut-center-label" x="100" y="116" text-anchor="middle">' +
        escapeHtml(centerLabel) + "</text></svg>" +
        (drilledModel
          ? renderDonutLegend(items, total, "")
          : renderChartLegend(state, { showPercentage: true })) +
        "</div></div>"
    ].join("");
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

  function statisticsVisualKeys(state) {
    var keys = eligibleModelsInRange(state).slice();
    var known = {};
    keys.forEach(function remember(key) {
      known[key] = true;
    });
    aggregateRelationsInRange(state.stats || {}, state || {}).forEach(function rememberRelation(entry) {
      var relation = entry && entry.relation || {};
      [relation.requestModel, relation.responseModel].forEach(function rememberModel(rawModel) {
        var model = String(rawModel || "").trim();
        if (model && !known[model]) {
          known[model] = true;
          keys.push(model);
        }
      });
    });
    return keys;
  }

  function statisticsColorMap(state) {
    var result = {};
    var occupied = {};
    statisticsVisualKeys(state).slice().sort(function stableOrder(left, right) {
      return String(left).localeCompare(String(right));
    }).forEach(function assignColor(key) {
      var preferred = stableVisualIndex(key, COLORS.length);
      var index = preferred;
      var attempts = 0;
      while (occupied[index] && attempts < COLORS.length) {
        index = (index + 1) % COLORS.length;
        attempts += 1;
      }
      if (attempts >= COLORS.length) {
        // More simultaneous models than the named palette are still
        // distinguishable by a deterministic high-cardinality fallback.
        var hue = stableVisualIndex("hue:" + key, 3600) / 10;
        result[key] = "hsl(" + hue.toFixed(1) + " 72% 48%)";
        return;
      }
      occupied[index] = key;
      result[key] = COLORS[index];
    });
    result[INTERNAL_UNKNOWN_REQUEST] = "var(--usage-text-muted)";
    result[INTERNAL_UNKNOWN_RESPONSE] = "var(--usage-text-muted)";
    return result;
  }

  function statisticsColorForKey(state, key) {
    return statisticsColorMap(state)[String(key || "")] || COLORS[0];
  }

  function renderChartLegend(state, options) {
    options = options || {};
    state.stats = sanitizeDashboardStats(state.stats || {});
    var totals = statisticsTotalsInRange(state.stats, state);
    var models = eligibleModelsInRange(state);
    var overallTotal = models.reduce(function add(total, model) {
      return total + (Number(totals[model]) || 0);
    }, 0);
    var colorByModel = statisticsColorMap(state);
    if (models.length === 0) {
      if (state.loading) {
        return renderLoadingSkeleton(2);
      }
      return '<div class="usage-empty">' + escapeHtml(text(state, "noModelRecords")) + "</div>";
    }
    return '<div class="usage-chart-legend" role="group" aria-label="' +
      escapeHtml(text(state, "chartLegend")) + '">' + models.map(function modelLegend(model) {
      var active = Boolean(state.selectedModels[model]);
      var count = Number(totals[model]) || 0;
      var percentage = overallTotal > 0 ? count / overallTotal * 100 : 0;
      return '<label class="usage-chart-legend-row' + (active ? " active" : "") +
        '" data-chart-model="' + escapeHtml(model) + '" style="--series:' +
        colorByModel[model] + '"><input class="usage-chart-legend-toggle" type="checkbox" data-model-toggle="' +
        escapeHtml(model) + '"' + (active ? " checked" : "") + ' aria-label="' +
        escapeHtml(statisticsKeyLabel(state, model)) + '"><i aria-hidden="true"></i><span style="color:' +
        colorByModel[model] + '">' + escapeHtml(statisticsKeyLabel(state, model)) +
        '</span><b>' + escapeHtml(String(count)) + '</b>' +
        (options.showPercentage
          ? '<small>' + percentage.toFixed(1) + "%</small>"
          : '<small aria-hidden="true"></small>') +
        "</label>";
    }).join("") + "</div>";
  }

  function renderFeaturePills(features, state) {
    return features && features.length
      ? '<div class="usage-count-features">' + features.map(function featureHtml(feature) {
          return '<span>' + escapeHtml(feature.label) + ' <b>' +
            escapeHtml(String(Number(feature.count) || 0)) + "</b></span>";
        }).join("") + "</div>"
      : "";
  }

  function renderMappedModelCountRows(state, models) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    var stats = state.stats || {};
    var totals = modelTotalsInRange(stats, state);
    var rows = models.map(function toRow(model) {
      return {
        model: model,
        total: Number(totals[model]) || 0,
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
      var features = renderFeaturePills(row.features, state);
      return [
        '<details class="usage-count-record usage-mapped-record" data-mapped-model="' + escapeHtml(row.model) + '">',
        '<summary class="usage-count-row">',
        '<span><strong style="color:' + statisticsColorForKey(state, row.model) + '">' +
          escapeHtml(row.model) + '</strong>' + features + "</span>",
        '<span class="usage-count-numbers"><b>' +
          escapeHtml(text(state, "countTimes", { count: row.total })) + "</b></span>",
        "</summary>",
        '<div class="usage-count-details" data-model-record-details="' + escapeHtml(row.model) + '">' +
          renderModelSessions(stats, row.model, state) + "</div>",
        "</details>"
      ].join("");
    }).join("");
  }

  function internalRequestGroups(stats, state, requestModels) {
    var selected = {};
    (requestModels || []).forEach(function remember(requestModel) {
      selected[requestModel] = true;
    });
    var relations = {};
    aggregateRelationsInRange(stats, state).forEach(function collect(entry) {
      var aggregate = entry && entry.relation;
      var requestModel = String(aggregate && aggregate.requestModel || "") || INTERNAL_UNKNOWN_REQUEST;
      if (!selected[requestModel]) {
        return;
      }
      var responseModel = String(aggregate && aggregate.responseModel || "") || INTERNAL_UNKNOWN_RESPONSE;
      var key = relationKey(requestModel, responseModel);
      relations[key] = mergeRelationAggregate(
        relations[key],
        Object.assign({}, aggregate, {
          requestModel: requestModel,
          responseModel: responseModel
        })
      );
    });
    if (!Object.keys(relations).length && !Object.keys(stats.analyticsByDate || {}).length) {
      rangeEvents(stats, state).forEach(function collectRetained(event) {
        var requestModel = eventRequestModel(event) || INTERNAL_UNKNOWN_REQUEST;
        if (!selected[requestModel]) {
          return;
        }
        var responseModel = eventResponseModel(event) || INTERNAL_UNKNOWN_RESPONSE;
        addEventToRelation(
          relations,
          Object.assign({}, event, {
            requestModel: requestModel,
            responseModel: responseModel
          })
        );
      });
    }
    var groups = {};
    Object.keys(relations).forEach(function collectRelation(key) {
      var relation = relations[key];
      var requestModel = relation.requestModel || INTERNAL_UNKNOWN_REQUEST;
      var group = groups[requestModel] || {
        requestModel: requestModel,
        count: 0,
        responses: []
      };
      group.count += Number(relation.count) || 0;
      group.responses.push(relation);
      groups[requestModel] = group;
    });
    return Object.keys(groups).map(function toGroup(requestModel) {
      var group = groups[requestModel];
      group.responses.sort(function byCountThenRecent(left, right) {
        return Number(right.count) - Number(left.count) ||
          String(right.lastSubmittedAt || "").localeCompare(String(left.lastSubmittedAt || "")) ||
          String(left.responseModel || "").localeCompare(String(right.responseModel || ""));
      });
      return group;
    }).sort(function byCountThenName(left, right) {
      return Number(right.count) - Number(left.count) ||
        String(left.requestModel || "").localeCompare(String(right.requestModel || ""));
    });
  }

  function renderInternalResponseRow(state, relation) {
    var responseModel = relation.responseModel || INTERNAL_UNKNOWN_RESPONSE;
    var responseLabel = statisticsKeyLabel(state, responseModel);
    var effortHtml = countMapSummary(state, relation.efforts, function effortLabel(effort) {
      return effort === "unspecified" ? text(state, "reasoningUnspecified") : effort;
    }, reasoningEffortClass);
    var featureRows = Object.keys(relation.features || {}).filter(function positive(feature) {
      return Number(relation.features[feature]) > 0;
    }).map(function toFeature(feature) {
      return {
        id: feature,
        label: featureLabel(state, feature),
        count: Number(relation.features[feature]) || 0
      };
    }).sort(function byCountThenLabel(left, right) {
      return right.count - left.count || left.label.localeCompare(right.label);
    });
    var featureHtml = renderFeaturePills(featureRows, state);
    return [
      '<details class="usage-internal-response" data-response-model-child="' + escapeHtml(responseModel) + '">',
      '<summary class="usage-internal-response-summary">',
      '<span class="usage-internal-response-model-row"><span class="usage-relation-values usage-internal-response-value"><span class="usage-internal-response-copy"><code style="color:' +
        statisticsColorForKey(state, responseModel) + '">' + escapeHtml(responseLabel) + "</code>" +
        '<span class="usage-internal-efforts-inline" aria-label="' +
        escapeHtml(text(state, "reasoningEffort")) + '">' +
        (effortHtml || '<span class="usage-effort-token" data-effort-filter="unknown" role="button" tabindex="0"><b class="usage-effort-unknown">' +
          escapeHtml(text(state, "reasoningUnspecified")) + "</b></span>") +
        "</span></span>" +
        '<b class="usage-internal-subcount">' +
        escapeHtml(String(Number(relation.count) || 0)) + "</b></span></span>",
      featureHtml,
      "</summary>",
      '<div class="usage-relation-conversation-list">' + relationConversationRows(state, relation) + "</div>",
      "</details>"
    ].join("");
  }

  function renderInternalModelCountRows(state, models) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    var groups = internalRequestGroups(state.stats, state, models);
    if (!groups.length) {
      if (state.loading) {
        return renderLoadingSkeleton(3);
      }
      return '<div class="usage-empty">' + escapeHtml(text(state, "noModelRecords")) + "</div>";
    }
    return groups.map(function renderGroup(group) {
      return [
        '<section class="usage-internal-request" data-request-model-group="' +
          escapeHtml(group.requestModel) + '">',
        '<div class="usage-internal-request-head">',
        '<span class="usage-internal-model-copy"><small>' + escapeHtml(text(state, "requestModelGroup")) +
          '</small><code style="color:' + statisticsColorForKey(state, group.requestModel) + '">' +
          escapeHtml(statisticsKeyLabel(state, group.requestModel)) + "</code></span>",
        '<b class="usage-internal-count">' +
          escapeHtml(text(state, "countTimes", { count: Number(group.count) || 0 })) + "</b>",
        "</div>",
        '<div class="usage-internal-response-section">',
        '<small class="usage-internal-response-heading">' +
          escapeHtml(text(state, "responseModelChild")) + "</small>",
        '<div class="usage-internal-responses">' + group.responses.map(function renderResponse(relation) {
          return renderInternalResponseRow(state, relation);
        }).join("") + "</div>",
        "</div>",
        "</section>"
      ].join("");
    }).join("");
  }

  function renderModelCountRows(state, models) {
    return normalizeStatisticsMode(state && state.statisticsMode) === "internal"
      ? renderInternalModelCountRows(state, models)
      : renderMappedModelCountRows(state, models);
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
      aggregateRelationsInRange(stats, state, model).forEach(function collect(entry) {
        var relation = entry && entry.relation || {};
        Object.keys(relation.conversations || {}).forEach(function collectConversation(id) {
          var conversation = relation.conversations[id] || {};
          var current = grouped[id] || {
            conversationId: id,
            title: conversation.title || id,
            count: 0,
            models: {},
            efforts: {},
            firstSubmittedAt: conversation.firstSubmittedAt || "",
            lastSubmittedAt: "",
            lastPageUrl: conversation.lastPageUrl || ("https://chatgpt.com/c/" + id)
          };
          current.count += Number(conversation.count) || 0;
          current.models[model] = (Number(current.models[model]) || 0) +
            (Number(conversation.count) || 0);
          Object.keys(conversation.efforts || {}).forEach(function addConversationEffort(effort) {
            current.efforts[effort] = (Number(current.efforts[effort]) || 0) +
              (Number(conversation.efforts[effort]) || 0);
          });
          if (
            !current.firstSubmittedAt ||
            String(conversation.firstSubmittedAt || "") < current.firstSubmittedAt
          ) {
            current.firstSubmittedAt = conversation.firstSubmittedAt || current.firstSubmittedAt;
          }
          if (String(conversation.lastSubmittedAt || "") >= String(current.lastSubmittedAt || "")) {
            current.title = conversation.title || current.title;
            current.lastSubmittedAt = conversation.lastSubmittedAt || current.lastSubmittedAt;
            current.lastPageUrl = conversation.lastPageUrl || current.lastPageUrl;
          }
          grouped[id] = current;
        });
      });
      if (!Object.keys(grouped).length && !Object.keys(stats.analyticsByDate || {}).length) {
        rangeEvents(stats, state, model).forEach(function collectRetained(event) {
          if (!event || !event.conversationId) {
            return;
          }
          var id = event.conversationId;
          var current = grouped[id] || {
            conversationId: id,
            title: event.pageTitle || id,
            count: 0,
            models: {},
            efforts: {},
            firstSubmittedAt: event.submittedAt || "",
            lastSubmittedAt: "",
            lastPageUrl: event.pageUrl || ("https://chatgpt.com/c/" + id)
          };
          current.count += 1;
          current.models[model] = (Number(current.models[model]) || 0) + 1;
          var effort = reasoningEffortClass(eventReasoningEffort(event));
          current.efforts[effort] = (Number(current.efforts[effort]) || 0) + 1;
          current.title = event.pageTitle || current.title;
          current.lastSubmittedAt = event.submittedAt || current.lastSubmittedAt;
          current.lastPageUrl = event.pageUrl || current.lastPageUrl;
          grouped[id] = current;
        });
      }
      var rangedSessions = Object.keys(grouped)
        .map(function toRangeSession(id) { return grouped[id]; })
        .sort(function byRangeRecent(a, b) {
          return String(b.lastSubmittedAt || "").localeCompare(String(a.lastSubmittedAt || ""));
        });
      if (
        rangedSessions.length ||
        hasExplicitDateRange(state) ||
        normalizeSourceModeFilter(state.sourceModeFilter) !== "all"
      ) {
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
        String(count),
        session.lastSubmittedAt ? formatDateTime(session.lastSubmittedAt) : ""
      ].filter(Boolean).join(text(state, "separator"));
      var href = session.lastPageUrl || ("https://chatgpt.com/c/" + session.conversationId);
      var effortKeys = Object.keys(session.efforts || {}).filter(function positiveEffort(effort) {
        return Number(session.efforts[effort]) > 0;
      }).map(reasoningEffortClass).filter(function uniqueEffort(effort, effortIndex, list) {
        return list.indexOf(effort) === effortIndex;
      }).join(" ");
      return [
        '<div class="usage-record-session-row" data-efforts="' + escapeHtml(effortKeys) + '">',
        '<span class="usage-index-number">' + (index + 1) + "</span>",
        '<div class="usage-index-content">',
        '<a class="usage-index-link" data-session-id="' + escapeHtml(session.conversationId) + '" href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer" title="' + escapeHtml(session.conversationId) + '">' + escapeHtml(session.title || session.conversationId) + "</a>",
        '<small>' + escapeHtml(details) + "</small>",
        "</div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function sourceModeLabel(state, mode) {
    var normalized = normalizeDashboardSourceMode(mode);
    if (normalized === "chat") return text(state, "sourceModeChat");
    if (normalized === "work") return text(state, "sourceModeWork");
    return text(state, "sourceModeUnknown");
  }

  function reasoningEffortClass(value) {
    var clean = String(value || "").trim().toLowerCase();
    if (clean === "max") return "max";
    if (/^(?:extended|xhigh|extra-high)$/.test(clean)) return "extended";
    if (clean === "high") return "high";
    if (clean === "standard") return "standard";
    if (clean === "medium") return "medium";
    if (clean === "low") return "low";
    if (/^(?:min|minimal)$/.test(clean)) return "min";
    if (clean === "none") return "none";
    return "unknown";
  }

  var REASONING_EFFORT_ORDER = {
    none: 0,
    min: 1,
    low: 2,
    medium: 3,
    standard: 4,
    high: 5,
    extended: 6,
    max: 7,
    unknown: 8
  };

  function countMapSummary(state, counts, valueLabel, valueClass) {
    return Object.keys(counts || {}).filter(function positive(key) {
      return Number(counts[key]) > 0;
    }).sort(function byMeaningfulOrder(left, right) {
      if (typeof valueClass === "function") {
        var leftClass = String(valueClass(left) || "unknown");
        var rightClass = String(valueClass(right) || "unknown");
        var leftRank = Object.prototype.hasOwnProperty.call(REASONING_EFFORT_ORDER, leftClass)
          ? REASONING_EFFORT_ORDER[leftClass]
          : REASONING_EFFORT_ORDER.unknown;
        var rightRank = Object.prototype.hasOwnProperty.call(REASONING_EFFORT_ORDER, rightClass)
          ? REASONING_EFFORT_ORDER[rightClass]
          : REASONING_EFFORT_ORDER.unknown;
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
      }
      return Number(counts[right]) - Number(counts[left]) || left.localeCompare(right);
    }).map(function renderCount(key) {
      var className = typeof valueClass === "function" ? String(valueClass(key) || "") : "";
      return '<span' + (className
        ? ' class="usage-effort-token" data-effort-filter="' + escapeHtml(className) +
          '" role="button" tabindex="0" aria-label="' + escapeHtml(valueLabel(key)) + '"'
        : "") + '><b' + (className ? ' class="usage-effort-' + escapeHtml(className) + '"' : "") + ">" +
        escapeHtml(valueLabel(key)) + '</b><span class="usage-subcount">' +
        escapeHtml(String(Number(counts[key]) || 0)) + "</span></span>";
    }).join("");
  }

  function relationConversationRows(state, relation) {
    var derivedEfforts = {};
    rangeEvents(state.stats || {}, state || {}).forEach(function collectConversationEffort(event) {
      var requestModel = eventRequestModel(event) || INTERNAL_UNKNOWN_REQUEST;
      var responseModel = eventResponseModel(event) || INTERNAL_UNKNOWN_RESPONSE;
      if (
        requestModel !== (relation.requestModel || INTERNAL_UNKNOWN_REQUEST) ||
        responseModel !== (relation.responseModel || INTERNAL_UNKNOWN_RESPONSE)
      ) {
        return;
      }
      var conversationId = String(event.conversationId || "").trim() || (
        event.submissionId ? "pending:" + String(event.submissionId).slice(0, 96) : ""
      );
      if (!conversationId) {
        return;
      }
      derivedEfforts[conversationId] = derivedEfforts[conversationId] || {};
      var effort = reasoningEffortClass(eventReasoningEffort(event));
      derivedEfforts[conversationId][effort] =
        (Number(derivedEfforts[conversationId][effort]) || 0) + 1;
    });
    var conversations = Object.keys(relation.conversations || {}).map(function toConversation(id) {
      var conversation = Object.assign({}, relation.conversations[id]);
      conversation.efforts = Object.assign(
        {},
        conversation.efforts || {},
        derivedEfforts[id] || {}
      );
      return conversation;
    }).filter(Boolean).sort(function byRecent(left, right) {
      return String(right.lastSubmittedAt || "").localeCompare(String(left.lastSubmittedAt || ""));
    });
    if (!conversations.length) {
      return '<div class="usage-record-empty">' + escapeHtml(text(state, "noModelConversations")) + "</div>";
    }
    return conversations.map(function renderConversation(conversation) {
      var id = conversation.conversationId || "";
      var pending = /^pending:/.test(id);
      var href = pending ? "" : (conversation.lastPageUrl || ("https://chatgpt.com/c/" + id));
      var meta = [
        String(Number(conversation.count) || 0),
        conversation.lastSubmittedAt ? formatDateTime(conversation.lastSubmittedAt) : ""
      ].filter(Boolean).join(text(state, "separator"));
      var title = conversation.title || (
        pending
          ? text(state, "responsePending")
          : id
      );
      var conversationTitle = pending
        ? '<span class="usage-index-link pending" title="' + escapeHtml(id) + '">' + escapeHtml(title) + "</span>"
        : '<a class="usage-index-link" data-session-id="' + escapeHtml(id) +
          '" href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer" title="' + escapeHtml(id) + '">' +
          escapeHtml(title) + "</a>";
      var sourceModes = conversation.sourceModes && typeof conversation.sourceModes === "object"
        ? conversation.sourceModes
        : {};
      if (!Object.keys(sourceModes).length) {
        sourceModes[normalizeDashboardSourceMode(conversation.sourceMode)] =
          Number(conversation.count) || 1;
      }
      var sourceBadges = Object.keys(sourceModes).filter(function positive(mode) {
        return Number(sourceModes[mode]) > 0;
      }).sort().map(function renderSourceMode(mode) {
        var count = Number(sourceModes[mode]) || 0;
        var mixed = Object.keys(sourceModes).filter(function active(key) {
          return Number(sourceModes[key]) > 0;
        }).length > 1;
        return '<span class="usage-source-mode ' + escapeHtml(normalizeDashboardSourceMode(mode)) + '">' +
          escapeHtml(sourceModeLabel(state, mode) + (mixed ? " " + count : "")) + "</span>";
      }).join("");
      var effortKeys = Object.keys(conversation.efforts || {}).filter(function positiveEffort(effort) {
        return Number(conversation.efforts[effort]) > 0;
      }).map(reasoningEffortClass).filter(function uniqueEffort(effort, index, list) {
        return list.indexOf(effort) === index;
      }).join(" ");
      return [
        '<div class="usage-relation-conversation" data-efforts="' + escapeHtml(effortKeys) + '">',
        '<span class="usage-source-mode-list">' + sourceBadges + "</span>",
        '<div class="usage-index-content">' + conversationTitle + "<small>" + escapeHtml(meta) + "</small></div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function renderModelRelations(stats, model, state) {
    var relations = modelRelations(stats, model, state);
    if (!relations.length) {
      return '<div class="usage-record-empty">' + escapeHtml(text(state, "noModelConversations")) + "</div>";
    }
    return '<div class="usage-model-relations">' + relations.map(function renderRelation(relation) {
      var conversations = Object.keys(relation.conversations || {}).filter(function hasConversation(id) {
        return relation.conversations[id] && Number(relation.conversations[id].count) > 0;
      });
      if (relation.legacyUnlinked) {
        return [
          '<details class="usage-model-relation legacy-unlinked">',
          '<summary class="usage-relation-summary" data-relation-toggle aria-label="' +
            escapeHtml(text(state, "relationConversations") + " · " + conversations.length) + '">',
          '<span class="usage-relation-head"><strong>' + escapeHtml(text(state, "legacyUnlinked")) +
            '</strong><span>' + escapeHtml(String(Number(relation.count) || 0)) + "</span></span>",
          '<span class="usage-relation-warning">' + escapeHtml(text(state, "legacyUnlinkedHint")) + "</span>",
          "</summary>",
          relation.showAggregateDetails ? renderModelRecordSummary(stats, model, state) : "",
          '<div class="usage-relation-conversation-list">' +
            relationConversationRows(state, relation) + "</div>",
          "</details>"
        ].join("");
      }
      var effortHtml = countMapSummary(state, relation.efforts, function effortLabel(effort) {
        return effort === "unspecified" ? text(state, "reasoningUnspecified") : effort;
      }, reasoningEffortClass);
      var requestModel = String(relation.requestModel || "").trim();
      var responseModel = String(relation.responseModel || "").trim();
      var sameModel = Boolean(requestModel && responseModel && requestModel === responseModel);
      var modelHead = sameModel
        ? '<strong class="same-model"><span class="usage-relation-model"><small>' +
          escapeHtml(text(state, "variants")) + '</small><code style="color:' +
          statisticsColorForKey(state, responseModel || INTERNAL_UNKNOWN_RESPONSE) + '">' +
          escapeHtml(responseModel) + "</code></span></strong>"
        : '<strong><span class="usage-relation-model"><small>' +
          escapeHtml(text(state, "requestModels")) + '</small><code style="color:' +
          statisticsColorForKey(state, requestModel || INTERNAL_UNKNOWN_REQUEST) + '">' +
          escapeHtml(requestModel || text(state, "responsePending")) +
          '</code></span><i>&rarr;</i><span class="usage-relation-model"><small>' +
          escapeHtml(text(state, "variants")) + '</small><code style="color:' +
          statisticsColorForKey(state, responseModel || INTERNAL_UNKNOWN_RESPONSE) + '">' +
          escapeHtml(responseModel || text(state, "responsePending")) + "</code></span></strong>";
      return [
        '<details class="usage-model-relation">',
        '<summary class="usage-relation-summary" data-relation-toggle aria-label="' +
          escapeHtml(text(state, "relationConversations") + " · " + conversations.length) + '">',
        '<span class="usage-relation-head">' + modelHead + "<span>" +
          escapeHtml(String(Number(relation.count) || 0)) + "</span></span>",
        '<span class="usage-relation-dimension usage-relation-efforts-only"><span class="usage-relation-values">' +
          (effortHtml || '<span class="usage-effort-token" data-effort-filter="unknown" role="button" tabindex="0"><b class="usage-effort-unknown">' + escapeHtml(text(state, "reasoningUnspecified")) +
            '</b><span class="usage-subcount">' + escapeHtml(String(Number(relation.count) || 0)) +
            "</span></span>") + "</span></span>",
        "</summary>",
        '<div class="usage-relation-conversation-list">' +
          relationConversationRows(state, relation) + "</div>",
        "</details>"
      ].join("");
    }).join("") + "</div>";
  }

  function renderModelVariants(stats, model, state) {
    var events = rangeEvents(stats, state, model);
    var variants = modelVariants(stats, model, 3, events).filter(function notSameAsRow(variant) {
      // 变体与行模型同名时纯属重复("调用型号 gpt-5-5-thinking" 又写一遍),不再显示。
      return variant && variant.name && variant.name !== model;
    });
    var pending = pendingResponseCount(model, events);
    if (!variants.length && !pending) {
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
        return '<div class="usage-variant-row"><b>' + escapeHtml(String(Number(variant.count) || 0)) + '</b><span title="' + escapeHtml(details) + '">' + escapeHtml(variant.name) + "</span></div>";
      }).join(""),
      pending
        ? '<div class="usage-variant-row pending"><b>' + escapeHtml(String(Number(pending) || 0)) + '</b><span>' + escapeHtml(text(state, "responsePending")) + "</span></div>"
        : "",
      "</div>"
    ].join("");
  }

  function renderRequestModels(stats, model, state) {
    var requests = modelRequestModels(stats, model, 3, rangeEvents(stats, state, model));
    if (!requests.length) {
      return "";
    }
    return [
      '<div class="usage-variant-list usage-request-model-list">',
      '<span class="usage-record-label">' + escapeHtml(text(state, "requestModels")) + "</span>",
      requests.map(function requestHtml(request) {
        return '<div class="usage-variant-row"><b>' + escapeHtml(String(Number(request.count) || 0)) + '</b><span>' + escapeHtml(request.name) + "</span></div>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderParameterCombinations(stats, model, state) {
    var events = rangeEvents(stats, state, model);
    var combinations = parameterCombinations(stats, model, 3, events);
    if (!combinations.length) {
      var stored = stats && stats.models && stats.models[model] ? stats.models[model] : {};
      // With no explicit date filter, the latest observed model metadata is a
      // valid fallback when event history or aggregate rows are unavailable.
      // An explicit range must never display parameters observed outside it.
      if (hasExplicitDateRange(state || {}) || !stored.parameters || !parameterSignature(stored.parameters)) {
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
        return '<div class="usage-param-row"><b>' + escapeHtml(String(Number(combination.count) || 0)) + '</b><span title="' + escapeHtml(full) + '">' + escapeHtml(compact) + "</span></div>";
      }).join(""),
      "</div>"
    ].join("");
  }

  function renderModelRecordSummary(stats, model, state) {
    var variants = renderModelVariants(stats, model, state);
    var requests = renderRequestModels(stats, model, state);
    var parameters = renderParameterCombinations(stats, model, state);
    if (!variants && !requests && !parameters) {
      return "";
    }
    return '<div class="usage-record-summary">' + variants + requests + parameters + "</div>";
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
          details: modelDetails(stats, model, state),
          features: modelFeatures(stats, model, state, 3)
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
        renderFeaturePills(row.features, state),
        "</div>",
        '<div class="usage-text-count"><b>' +
          escapeHtml(text(state, "countTimes", { count: row.total })) + "</b></div>",
        "</div>",
        renderModelRelations(stats, row.model, state),
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
      '<strong title="' + escapeHtml(component.name) + '">' + escapeHtml(component.name) + "</strong>",
      renderStatusBadge(state, component.status),
      "</div>"
    ].join("");
  }

  function isChatGPTWebStatusComponent(component) {
    var name = String((component && component.name) || "").toLowerCase();
    if (/\b(api|sora|playground|labs|billing|platform)\b|\bfine[-\s]?tuning\b/.test(name)) {
      return false;
    }
    return /\bchatgpt\b|\bconversations?\b|\bagents?\b|\bdeep research\b|\bimage generation\b|\bvoice mode\b|\bsearch\b|\bgpts\b|\bconnectors?\b|\bapps?\b|\bfile uploads?\b|\blogin\b|\bauth(?:entication)?\b/.test(name) ||
      /^(?:codex web|sites)$/.test(name);
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
      '<div><strong>' + escapeHtml(description) + '</strong><small>' + heroMeta + "</small></div>",
      "</div>"
    ];

    if (components.length) {
      sections.push(
        '<div class="usage-openai-section"><div class="usage-openai-components">' + components.map(function componentHtml(component) { return renderStatusComponent(state, component, false); }).join("") + "</div></div>"
      );
    }
    if (status.complete === false) {
      sections.push('<p class="usage-export-warning">' + escapeHtml(text(state, "openaiStatusIncomplete")) + "</p>");
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

  function renderSettingsOption(state, attribute, id, label, active) {
    return '<button type="button" class="usage-settings-option' + (active ? " active" : "") +
      '" ' + attribute + '="' + escapeHtml(id) + '" aria-pressed="' + (active ? "true" : "false") + '">' +
      '<span>' + escapeHtml(label) + '</span><span class="usage-settings-check" aria-hidden="true">✓</span></button>';
  }

  function renderSettingsAction(attribute, id, label, disabled) {
    return '<button type="button" class="usage-settings-action" ' + attribute + '="' +
      escapeHtml(id) + '"' + (disabled ? " disabled" : "") + ">" +
      escapeHtml(label) + "</button>";
  }

  function renderSettingsCategory(state, id, label, currentValue, content, className) {
    var open = state.settingsSubmenu === id;
    return [
      '<details class="usage-settings-item usage-settings-item-' + escapeHtml(id) + '"' +
        (open ? " open" : "") + ' data-settings-category="' + escapeHtml(id) + '">',
      '<summary><span class="usage-settings-category-label">' + escapeHtml(label) + '</span>',
      '<span class="usage-settings-current"' + (currentValue ? "" : ' aria-hidden="true"') + '>' +
        escapeHtml(currentValue || "") + "</span>",
      '<span class="usage-settings-arrow" aria-hidden="true">‹</span></summary>',
      '<div class="usage-settings-submenu' + (className ? " " + escapeHtml(className) : "") +
        '" role="group" aria-label="' + escapeHtml(label) + '">' + content + "</div>",
      "</details>"
    ].join("");
  }

  function renderHeaderIcon(name) {
    if (name === "refresh") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/></svg>';
    }
    if (name === "settings") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 4.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>';
    }
    if (name === "close") {
      return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.75 6.75 10.5 10.5M17.25 6.75l-10.5 10.5"/></svg>';
    }
    return "";
  }

  function renderSettingsMenu(state) {
    var mode = normalizeSourceModeFilter(state.sourceModeFilter);
    var statisticsMode = normalizeStatisticsMode(state.statisticsMode);
    var themeMode = normalizeThemeMode(state.themeMode);
    var language = currentLanguage(state);
    var activeView = normalizeView(state.activeView);
    var languageOptions = [
      { id: "zh", label: text(state, "languageToggleZh") },
      { id: "en", label: "English" }
    ].map(function languageOption(item) {
      return renderSettingsOption(state, "data-language-select", item.id, item.label, language === item.id);
    }).join("");
    var basicCategories = [
      renderSettingsCategory(
        state,
        "language",
        text(state, "language"),
        language === "zh" ? text(state, "languageToggleZh") : "English",
        languageOptions
      )
    ];
    var themeOptions = [
      { id: "system", key: "themeSystem" },
      { id: "light", key: "themeLight" },
      { id: "dark", key: "themeDark" }
    ].map(function themeOption(item) {
      return renderSettingsOption(
        state,
        "data-theme-select",
        item.id,
        text(state, item.key),
        themeMode === item.id
      );
    }).join("");
    basicCategories.push(
      renderSettingsCategory(
        state,
        "theme",
        text(state, "theme"),
        text(state, themeMode === "dark" ? "themeDark" : themeMode === "light" ? "themeLight" : "themeSystem"),
        themeOptions
      )
    );
    var statisticsDataActions = [
      renderSettingsAction(
        "data-statistics-data-export",
        "json",
        text(state, "statisticsDataExportJson"),
        state.statisticsDataBusy
      ),
      renderSettingsAction(
        "data-statistics-data-export",
        "csv",
        text(state, "statisticsDataExportCsv"),
        state.statisticsDataBusy
      ),
      renderSettingsAction(
        "data-statistics-data-import",
        "replace",
        text(state, "statisticsDataImportJson"),
        state.statisticsDataBusy
      ),
      '<input class="usage-statistics-data-file" data-statistics-data-file type="file" accept=".json,application/json" hidden>'
    ].join("");
    var categories = basicCategories.slice();
    if (activeView === "chart") {
      var sourceOptions = [
      { id: "all", key: "sourceFilterAll" },
      { id: "chat", key: "sourceFilterChat" },
      { id: "work", key: "sourceFilterWork" }
    ].map(function sourceOption(item) {
      return renderSettingsOption(
        state,
        "data-source-filter",
        item.id,
        text(state, item.key),
        mode === item.id
      );
    }).join("");
      var statisticsModeOptions = [
      { id: "mapped", key: "statisticsModeMapped" },
      { id: "internal", key: "statisticsModeInternal" }
    ].map(function statisticsModeOption(item) {
      return renderSettingsOption(
        state,
        "data-statistics-mode",
        item.id,
        text(state, item.key),
        statisticsMode === item.id
      );
    }).join("");
      var sectionVisibilityItems = [
      {
        id: "line",
        key: "statisticsSectionTrend",
        active: state.showLineChart !== false
      },
      {
        id: "donut",
        key: "statisticsSectionDonut",
        active: state.showDonutChart === true
      },
      {
        id: "text",
        key: "statisticsSectionText",
        active: state.showTextStatistics !== false
      }
      ];
      var sectionVisibilityOptions = sectionVisibilityItems.map(function sectionVisibilityOption(item) {
        return '<label class="usage-statistics-visibility-option"><input type="checkbox" data-statistics-section="' +
          item.id + '"' + (item.active ? " checked" : "") + "><span>" +
          escapeHtml(text(state, item.key)) +
          '</span><i class="usage-statistics-visibility-indicator" aria-hidden="true"></i></label>';
      }).join("");
      var enabledSectionCount = sectionVisibilityItems.filter(function enabled(item) {
        return item.active;
      }).length;
      var enabledSectionSummary = enabledSectionCount === sectionVisibilityItems.length
        ? text(state, "statisticsSectionAll")
        : sectionVisibilityItems.filter(function enabled(item) {
            return item.active;
          }).map(function shortSectionLabel(item) {
            return text(state, item.id === "line"
              ? "statisticsSectionTrendShort"
              : item.id === "donut"
                ? "statisticsSectionDonutShort"
                : "statisticsSectionTextShort");
          }).join(" + ") || text(state, "statisticsSectionNone");
      categories.push(
        renderSettingsCategory(
          state,
          "source",
          text(state, "source"),
          text(state, mode === "chat" ? "sourceFilterChat" : mode === "work" ? "sourceFilterWork" : "sourceFilterAll"),
          sourceOptions
        ),
        renderSettingsCategory(
          state,
          "statistics",
          text(state, "statisticsMode"),
          text(state, statisticsMode === "internal" ? "statisticsModeInternal" : "statisticsModeMapped"),
          statisticsModeOptions
        ),
        renderSettingsCategory(
          state,
          "sections",
          text(state, "statisticsSections"),
          enabledSectionSummary,
          sectionVisibilityOptions
        )
      )
    }
    categories.push(
      renderSettingsCategory(
        state,
        "data",
        text(state, "statisticsData"),
        text(state, "statisticsDataCurrent"),
        statisticsDataActions,
        "usage-settings-data-submenu"
      )
    );
    return [
      '<details class="usage-settings-menu"' + (state.settingsMenuOpen ? " open" : "") + ">",
      '<summary class="usage-header-action usage-settings-trigger" aria-label="' +
        escapeHtml(text(state, "settingsOpen")) + '" title="' + escapeHtml(text(state, "settingsOpen")) + '">' +
        renderHeaderIcon("settings") + '<span class="usage-visually-hidden">' +
        escapeHtml(text(state, "settings")) + "</span></summary>",
      '<div class="usage-settings-popover">' + categories.join("") + "</div>",
      "</details>"
    ].join("");
  }

  function renderDateControls(state) {
    var today = defaultEndDate();
    var startValue = dateNoLaterThanToday(state.startDate) || "";
    var endValue = dateNoLaterThanToday(state.endDate) || today;
    return [
      '<div class="usage-controls usage-chart-controls">',
      '<div class="usage-date-controls" aria-label="' + escapeHtml(text(state, "customRange")) + '">',
      '<label><span>' + escapeHtml(text(state, "startDate")) + '</span>' +
        ' <input class="usage-start-date" type="date" max="' + escapeHtml(endValue) +
        '" value="' + escapeHtml(startValue) + '"></label>',
      '<label><span>' + escapeHtml(text(state, "endDate")) + '</span>' +
        ' <input class="usage-end-date" type="date" min="' + escapeHtml(startValue) +
        '" max="' + escapeHtml(today) +
        '" value="' + escapeHtml(endValue) + '"></label>',
      "</div>",
      "</div>"
    ].join("");
  }

  var EXPORT_FORMATS = [
    { id: "json", labelKey: "exportFormatJson" },
    { id: "markdown", labelKey: "exportFormatMarkdown" },
    { id: "pdf", labelKey: "exportFormatPdf" },
    { id: "png", labelKey: "exportFormatPng" },
    { id: "docx", labelKey: "exportFormatDocx" }
  ];

  function normalizeExportSearch(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function exportConversationMatchesSearch(conversation, search) {
    var needle = normalizeExportSearch(search);
    if (!needle) {
      return true;
    }
    var haystack = normalizeExportSearch([
      conversation && conversation.title,
      conversation && conversation.id,
      conversation && conversation.projectName,
      conversation && conversation.projectId
    ].filter(Boolean).join(" "));
    return haystack.indexOf(needle) >= 0;
  }

  function validExportProjectName(value, projectId) {
    var name = String(value || "").replace(/\s+/g, " ").trim();
    var id = String(projectId || "").trim();
    if (
      !name ||
      (id && name === id) ||
      /\bg-p-[0-9a-f]{32}\b/i.test(name) ||
      /^(?:unnamed project|未命名项目|project|项目)$/i.test(name) ||
      /^(?:project|项目)\s+g-p-/i.test(name)
    ) {
      return "";
    }
    return name;
  }

  function exportConversationGroups(state, list) {
    var groups = [];
    var byKey = {};
    var projectNames = {};
    var projectNamePriorities = {};
    var projectOrders = {};
    (Array.isArray(list) ? list : []).forEach(function rememberProjectName(conversation) {
      var projectId = String(conversation && conversation.projectId || "").trim();
      var projectName = validExportProjectName(
        conversation && conversation.projectName,
        projectId
      );
      var projectOrder = Number(conversation && conversation.projectOrder);
      if (conversation && conversation.groupType === "project" && projectId && projectName) {
        var source = String(conversation.projectNameSource || "").trim().toLowerCase();
        var priority = source === "main-world-react"
          ? 4
          : source === "account-index"
            ? 3
            : /sidebar/.test(source)
              ? 2
              : 1;
        if (
          !Object.prototype.hasOwnProperty.call(projectNames, projectId) ||
          priority > Number(projectNamePriorities[projectId] || 0)
        ) {
          projectNames[projectId] = projectName;
          projectNamePriorities[projectId] = priority;
        }
      }
      if (
        conversation &&
        conversation.groupType === "project" &&
        projectId &&
        Number.isFinite(projectOrder) &&
        (!Object.prototype.hasOwnProperty.call(projectOrders, projectId) || projectOrder < projectOrders[projectId])
      ) {
        projectOrders[projectId] = projectOrder;
      }
    });
    (Array.isArray(list) ? list : []).forEach(function addConversation(conversation, listIndex) {
      if (!conversation || !conversation.id || conversation.current) {
        return;
      }
      var projectId = String(conversation.projectId || "").trim();
      var isProject = Boolean(conversation.groupType === "project" && projectId);
      var key = isProject ? "project:" + projectId : "ungrouped";
      if (!byKey[key]) {
        byKey[key] = {
          key: key,
          title: isProject
            ? (
                projectNames[projectId] ||
                text(state, "exportUnknownProject")
              )
            : text(state, "exportUngrouped"),
          projectId: isProject ? projectId : "",
          projectOrder: isProject && Object.prototype.hasOwnProperty.call(projectOrders, projectId)
            ? projectOrders[projectId]
            : Number.MAX_SAFE_INTEGER,
          listIndex: listIndex,
          conversations: []
        };
        groups.push(byKey[key]);
      }
      byKey[key].conversations.push(conversation);
    });
    return groups.sort(function orderGroups(left, right) {
      var leftProject = Boolean(left.projectId);
      var rightProject = Boolean(right.projectId);
      if (leftProject !== rightProject) {
        return leftProject ? -1 : 1;
      }
      if (leftProject && left.projectOrder !== right.projectOrder) {
        return left.projectOrder - right.projectOrder;
      }
      return left.listIndex - right.listIndex;
    });
  }

  function exportProjectConversationIds(state, projectId) {
    var cleanProjectId = String(projectId || "").trim();
    if (!cleanProjectId) {
      return [];
    }
    return (Array.isArray(state.exportConversationList) ? state.exportConversationList : [])
      .filter(function inProject(conversation) {
        return conversation &&
          conversation.id &&
          conversation.groupType === "project" &&
          String(conversation.projectId || "").trim() === cleanProjectId;
      })
      .map(function id(conversation) { return conversation.id; });
  }

  function renderExportConversationRow(state, conversation, selected) {
    var checked = selected[conversation.id] ? " checked" : "";
    var title = conversation.title || conversation.id;
    var updated = formatDateTime(conversation.updateTime || conversation.createTime);
    var badges = [
      conversation.current ? '<small class="usage-export-conv-badge current">' + escapeHtml(text(state, "exportCurrent")) + "</small>" : "",
      conversation.archived ? '<small class="usage-export-conv-badge">' + escapeHtml(text(state, "exportArchived")) + "</small>" : ""
    ].join("");
    return '<label class="usage-export-conv" data-export-conv-row="' + escapeHtml(conversation.id) + '"' +
      (exportConversationMatchesSearch(conversation, state.exportSearch) ? "" : " hidden") +
      '><input type="checkbox" data-export-conv="' + escapeHtml(conversation.id) +
      '" aria-label="' + escapeHtml(title) + '"' + checked + '><span class="usage-export-conv-copy"><b>' +
      escapeHtml(title) + "</b>" +
      (updated ? "<small>" + escapeHtml(text(state, "exportUpdated", { time: updated })) + "</small>" : "") +
      "</span>" + badges + "</label>";
  }

  function visibleExportConversationIds(state) {
    return (Array.isArray(state.exportConversationList) ? state.exportConversationList : [])
      .filter(function visible(conversation) {
        return conversation && conversation.id &&
          exportConversationMatchesSearch(conversation, state.exportSearch);
      })
      .map(function id(conversation) { return conversation.id; });
  }

  function selectedExportConversationIds(state) {
    var selected = state.exportSelected || {};
    return (Array.isArray(state.exportConversationList) ? state.exportConversationList : [])
      .filter(function selectedConversation(conversation) {
        return conversation && conversation.id && selected[conversation.id];
      })
      .map(function id(conversation) { return conversation.id; });
  }

  function syncExportSelectionUi(state) {
    if (!state || !state.container || typeof state.container.querySelectorAll !== "function") {
      return;
    }
    var selected = state.exportSelected || {};
    var selectedCount = selectedExportConversationIds(state).length;
    var countNode = typeof state.container.querySelector === "function"
      ? state.container.querySelector(".usage-export-selcount")
      : null;
    if (countNode) {
      countNode.textContent = text(state, "exportSelectedCount", { count: selectedCount });
    }
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-conv]"), function syncConversation(input) {
      input.checked = Boolean(selected[input.getAttribute("data-export-conv")]);
      input.disabled = Boolean(state.exportBusy);
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-project-toggle]"), function syncProject(input) {
      var ids = exportProjectConversationIds(state, input.getAttribute("data-export-project-toggle"));
      var projectSelectedCount = ids.filter(function selectedId(id) {
        return Boolean(selected[id]);
      }).length;
      input.checked = ids.length > 0 && projectSelectedCount === ids.length;
      input.indeterminate = projectSelectedCount > 0 && projectSelectedCount < ids.length;
      input.disabled = Boolean(state.exportBusy || ids.length === 0);
      input.setAttribute(
        "aria-checked",
        input.indeterminate ? "mixed" : (input.checked ? "true" : "false")
      );
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-format]"), function syncFormat(button) {
      button.disabled = Boolean(state.exportBusy || selectedCount === 0);
    });
    Array.prototype.forEach.call(
      state.container.querySelectorAll("[data-export-selectall],[data-export-selectnone]"),
      function syncBulkButton(button) {
        button.disabled = Boolean(state.exportBusy);
      }
    );
  }

  function syncExportSearchUi(state) {
    if (!state || !state.container || typeof state.container.querySelectorAll !== "function") {
      return;
    }
    var visibleCount = 0;
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-conv-row]"), function syncRow(row) {
      var id = row.getAttribute("data-export-conv-row");
      var conversation = (state.exportConversationList || []).filter(function find(item) {
        return item && item.id === id;
      })[0];
      var visible = exportConversationMatchesSearch(conversation, state.exportSearch);
      row.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-group]"), function syncGroup(group) {
      if (!group || typeof group.querySelectorAll !== "function") {
        return;
      }
      var hasVisibleRows = Array.prototype.some.call(
        group.querySelectorAll("[data-export-conv-row]"),
        function isVisible(row) { return !row.hidden; }
      );
      group.hidden = !hasVisibleRows;
    });
    var empty = typeof state.container.querySelector === "function"
      ? state.container.querySelector("[data-export-search-empty]")
      : null;
    if (empty) {
      empty.hidden = visibleCount > 0;
    }
  }

  function renderExportPanel(state) {
    var list = Array.isArray(state.exportConversationList) ? state.exportConversationList : null;
    var selected = state.exportSelected || {};
    var selectedCount = selectedExportConversationIds(state).length;
    var formatsDisabled = selectedCount === 0;
    var buttons = EXPORT_FORMATS.map(function formatButton(fmt) {
      return '<button type="button" class="usage-export-btn" data-export-format="' + fmt.id + '"' +
        (formatsDisabled ? " disabled" : "") + ">" +
        escapeHtml(text(state, fmt.labelKey)) + "</button>";
    }).join("");

    var listHtml = "";
    var selectbar = "";
    if (list === null) {
      listHtml = '<p class="usage-export-hint">' + escapeHtml(text(state, "exportAllLoading")) + "</p>";
    } else if (!list.length) {
      var emptyMeta = state.exportConversationMeta || {};
      var emptyWarnings = Array.isArray(emptyMeta.warnings) ? emptyMeta.warnings : [];
      var emptyWarningText = "";
      if (emptyMeta.source === "unavailable" || emptyWarnings.some(function accountWarning(warning) {
        return warning && warning.scope === "account";
      })) {
        emptyWarningText = text(state, "exportListUnavailable");
      } else if (emptyMeta.complete === false || emptyWarnings.length) {
        emptyWarningText = text(state, "exportListIncomplete");
      }
      listHtml = '<p class="usage-export-hint">' +
        escapeHtml(text(state, "exportListEmpty")) +
        (emptyWarningText
          ? '<br><span class="usage-export-warning">' + escapeHtml(emptyWarningText) + "</span>"
          : "") +
        "</p>";
    } else {
      selectbar =
        '<div class="usage-export-selectbar">' +
          '<input class="usage-export-search" type="search" value="' + escapeHtml(state.exportSearch || "") +
            '" placeholder="' + escapeHtml(text(state, "exportSearchPlaceholder")) + '" aria-label="' +
            escapeHtml(text(state, "exportSearchPlaceholder")) + '">' +
          '<button type="button" class="usage-export-mini" data-export-selectall>' + escapeHtml(text(state, "exportSelectAll")) + "</button>" +
          '<button type="button" class="usage-export-mini" data-export-selectnone>' + escapeHtml(text(state, "exportSelectNone")) + "</button>" +
          '<span class="usage-export-selcount">' + escapeHtml(text(state, "exportSelectedCount", { count: selectedCount })) + "</span>" +
        "</div>";
      var listWarning = state.exportConversationMeta && state.exportConversationMeta.complete === false
        ? '<p class="usage-export-hint usage-export-warning">' + escapeHtml(text(state, "exportListIncomplete")) + "</p>"
        : "";
      var currentRows = list.filter(function currentConversation(conversation) {
        return conversation && conversation.current;
      }).map(function renderCurrent(conversation) {
        return renderExportConversationRow(state, conversation, selected);
      }).join("");
      var groupRows = exportConversationGroups(state, list).map(function renderGroup(group) {
        var rows = group.conversations.map(function renderConversation(conversation) {
          return renderExportConversationRow(state, conversation, selected);
        }).join("");
        var visible = group.conversations.some(function visibleConversation(conversation) {
          return exportConversationMatchesSearch(conversation, state.exportSearch);
        });
        var projectToggle = group.projectId
          ? '<input class="usage-export-group-check" type="checkbox" data-export-project-toggle="' +
            escapeHtml(group.projectId) + '" aria-label="' +
            escapeHtml(text(state, "exportSelectProject", { name: group.title })) + '">'
          : "";
        return '<details class="usage-export-group" data-export-group="' + escapeHtml(group.key) + '" open' +
          (visible ? "" : " hidden") + '><summary>' + projectToggle + '<span>' + escapeHtml(group.title) + '</span><small>' +
          group.conversations.length + '</small></summary><div class="usage-export-group-list">' + rows +
          "</div></details>";
      }).join("");
      listHtml = listWarning + '<div class="usage-export-conv-list">' +
        (currentRows ? '<div class="usage-export-current" data-export-group="current">' + currentRows + "</div>" : "") +
        groupRows + '</div><p class="usage-export-hint" data-export-search-empty' +
        (visibleExportConversationIds(state).length ? " hidden" : "") + ">" +
        escapeHtml(text(state, "exportSearchEmpty")) + "</p>";
    }

    return [
      '<section class="usage-export-panel">',
      selectbar,
      listHtml,
      '<p class="usage-export-hint">' + escapeHtml(text(state, "exportSelectionHint")) + "</p>",
      '<div class="usage-export-actions" role="group" aria-label="' +
        escapeHtml(text(state, "exportFormatGroup")) + '">' + buttons + "</div>",
      '<button type="button" class="usage-export-cancel" data-export-cancel hidden>' +
        escapeHtml(text(state, "exportCancel")) + "</button>",
      '<p class="usage-export-status' + (state.exportStatusError ? " error" : "") +
        '" data-export-status aria-live="polite">' +
        escapeHtml(state.exportStatusText || "") + "</p>",
      "</section>"
    ].join("");
  }

  function statisticsUsesEventHistory(state) {
    return normalizeStatisticsMode(state && state.statisticsMode) === "internal" ||
      normalizeSourceModeFilter(state && state.sourceModeFilter) !== "all" ||
      (
        state && state.showDonutChart === true &&
        Boolean(state && state.donutModel)
      );
  }

  function renderStatisticsCompletenessWarning(state) {
    var analyticsComplete = state && state.stats
      ? state.stats.analyticsHistoryComplete
      : true;
    if (
      analyticsComplete === undefined &&
      state &&
      state.stats &&
      state.stats.eventHistoryComplete === false
    ) {
      analyticsComplete = false;
    }
    return statisticsUsesEventHistory(state) &&
      state &&
      state.stats &&
      analyticsComplete === false
      ? '<div class="usage-statistics-warning" role="status">' +
        escapeHtml(text(state, "statisticsHistoryIncomplete")) + "</div>"
      : "";
  }

  function renderActiveView(state, models) {
    var activeView = normalizeView(state.activeView);
    if (activeView === "status") {
      return '<div class="usage-view-panel">' + renderOpenAIStatusPanel(state) + "</div>";
    }
    if (activeView === "export") {
      return '<div class="usage-view-panel">' + renderExportPanel(state) + "</div>";
    }

    var showLineChart = state.showLineChart !== false;
    var showDonutChart = state.showDonutChart === true;
    var showTextStatistics = state.showTextStatistics !== false;
    return [
      '<div class="usage-view-panel usage-count-panel">',
      '<section class="usage-text-panel usage-chart-panel">',
      renderDateControls(state),
      renderStatisticsCompletenessWarning(state),
      showLineChart ? renderChart(state.stats, models, state) : "",
      showDonutChart ? renderDonutChart(state.stats, models, state) : "",
      showTextStatistics
        ? '<div class="usage-count-list">' + renderModelCountRows(state, models) + "</div>"
        : "",
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

  function resolveDashboardTheme(state) {
    var themeMode = normalizeThemeMode(state && state.themeMode);
    if (themeMode === "dark" || themeMode === "light") {
      return themeMode;
    }
    var query = preferredColorSchemeQuery();
    return query && query.matches ? "dark" : "light";
  }

  function applyThemeVariablesToElement(element, theme, themeMode) {
    if (!element || !element.style) {
      return;
    }
    var variables = USAGE_THEME_VARIABLES[theme] || USAGE_THEME_VARIABLES.light;
    Object.keys(variables).forEach(function applyVariable(name) {
      element.style.setProperty(name, variables[name]);
    });
    element.style.setProperty("color-scheme", theme === "dark" ? "dark" : "light");
    if (typeof element.setAttribute === "function") {
      element.setAttribute("data-usage-theme", theme);
      element.setAttribute("data-theme-mode", normalizeThemeMode(themeMode));
    }
  }

  function applyPopupThemeVariables(state) {
    if (!state || !state.options || state.options.surface !== "popup" || !state.container || typeof state.container.querySelector !== "function") {
      return;
    }
    var dashboard = state.container.querySelector(".usage-dashboard-popup");
    if (!dashboard || !dashboard.style) {
      return;
    }
    var popupTheme = resolveDashboardTheme(state);
    applyThemeVariablesToElement(dashboard, popupTheme, state.themeMode);
    // 把主题变量与 color-scheme 一并提升到 <html>,让 body/.shell 的页面背景和原生滚动条跟随强制主题。
    // 否则强制浅色而系统配色为深色时,popup 内容四周会露出一圈深色边(浅色主题黑边问题)。
    var docEl = dashboard.ownerDocument && dashboard.ownerDocument.documentElement;
    if (docEl && docEl.style && typeof docEl.style.setProperty === "function") {
      applyThemeVariablesToElement(docEl, popupTheme, state.themeMode);
    }
  }

  function subscribePopupThemeChanges(state) {
    if (!state || !state.options || state.options.surface !== "popup" || state.popupThemeSubscribed) {
      return;
    }
    state.popupThemeSubscribed = true;
    var query = preferredColorSchemeQuery();
    if (query && typeof query.addEventListener === "function") {
      query.addEventListener("change", function () {
        if (normalizeThemeMode(state.themeMode) === "system") {
          applyPopupThemeVariables(state);
        }
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
    var theme = resolveDashboardTheme(state);
    applyThemeVariablesToElement(dashboard, theme, state.themeMode);
  }

  function subscribePageThemeChanges(state) {
    if (!state || !state.options || state.options.surface !== "page" || state.pageThemeSubscribed) {
      return;
    }
    state.pageThemeSubscribed = true;
    var updateTheme = function updateTheme() {
      if (normalizeThemeMode(state.themeMode) === "system") {
        applyPageThemeVariables(state);
      }
    };

    var mediaQuery = preferredColorSchemeQuery();
    if (mediaQuery && typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateTheme);
    }

  }

  function fitStatusPanel(state) {
    if (!state || normalizeView(state.activeView) !== "status" || !state.container) {
      return;
    }
    var dashboard = state.container.querySelector(".usage-dashboard");
    if (!dashboard || !dashboard.classList) {
      return;
    }
    dashboard.classList.remove(
      "usage-status-compact",
      "usage-status-columns",
      "usage-status-dense",
      "usage-status-ultra",
      "usage-status-scaled"
    );
    if (dashboard.style && typeof dashboard.style.removeProperty === "function") {
      dashboard.style.removeProperty("--usage-status-columns");
      dashboard.style.removeProperty("--usage-status-font-compensation");
      // Clear the previous whole-dashboard fallback when an existing panel is
      // re-rendered after an extension update.
      dashboard.style.removeProperty("zoom");
    }
    var statusPanel = typeof dashboard.querySelector === "function"
      ? dashboard.querySelector(".usage-view-panel")
      : null;
    if (statusPanel && statusPanel.style && typeof statusPanel.style.removeProperty === "function") {
      statusPanel.style.removeProperty("zoom");
    }
    var clientHeight = Number(dashboard.clientHeight);
    var clientWidth = Number(dashboard.clientWidth);
    if (!(clientHeight > 0) || !(clientWidth > 0)) {
      return;
    }
    var overflows = function overflows() {
      return Number(dashboard.scrollHeight) > clientHeight + 1 ||
        Number(dashboard.scrollWidth) > clientWidth + 1;
    };
    var overflowScore = function overflowScore() {
      return Math.max(
        Number(dashboard.scrollHeight) / clientHeight,
        Number(dashboard.scrollWidth) / clientWidth
      );
    };
    var tryColumnRange = function tryColumnRange(maxColumns) {
      var bestColumns = 1;
      var bestScore;
      dashboard.classList.remove("usage-status-columns");
      if (dashboard.style && typeof dashboard.style.removeProperty === "function") {
        dashboard.style.removeProperty("--usage-status-columns");
      }
      bestScore = overflowScore();
      if (!overflows()) {
        return true;
      }
      if (!dashboard.style || typeof dashboard.style.setProperty !== "function") {
        return false;
      }
      for (var columns = 2; columns <= maxColumns; columns += 1) {
        dashboard.classList.add("usage-status-columns");
        dashboard.style.setProperty("--usage-status-columns", String(columns));
        var score = overflowScore();
        if (score < bestScore) {
          bestColumns = columns;
          bestScore = score;
        }
        if (!overflows()) {
          return true;
        }
      }
      if (bestColumns > 1) {
        dashboard.classList.add("usage-status-columns");
        dashboard.style.setProperty("--usage-status-columns", String(bestColumns));
      } else {
        dashboard.classList.remove("usage-status-columns");
        dashboard.style.removeProperty("--usage-status-columns");
      }
      return false;
    };
    var columnLimit = function columnLimit(minimumWidth, maximumColumns) {
      return Math.max(1, Math.min(
        maximumColumns,
        Math.floor(clientWidth / minimumWidth)
      ));
    };
    if (overflows()) {
      dashboard.classList.add("usage-status-compact");
    }
    if (!overflows()) {
      return;
    }
    if (tryColumnRange(columnLimit(128, 3))) {
      return;
    }
    dashboard.classList.add("usage-status-dense");
    if (tryColumnRange(columnLimit(108, 3))) {
      return;
    }
    dashboard.classList.add("usage-status-ultra");
    if (tryColumnRange(columnLimit(92, 4))) {
      return;
    }
    if (
      !statusPanel ||
      !statusPanel.style ||
      typeof statusPanel.style.setProperty !== "function" ||
      !dashboard.style ||
      typeof dashboard.style.setProperty !== "function"
    ) {
      return;
    }

    // Only the status body is scaled, so the title, tabs, and controls stay at
    // their normal readable size. Text compensation preserves the status copy
    // at its ultra-layout size for all reasonable panel heights (down to 82%);
    // below that point only truly pathological content growth starts shrinking
    // the text instead of introducing a scrollbar or clipping rows.
    dashboard.classList.add("usage-status-scaled");
    var applyScale = function applyScale(value) {
      var scale = Math.max(0.05, Math.min(1, Number(value) || 1));
      statusPanel.style.setProperty("zoom", scale.toFixed(3));
      dashboard.style.setProperty(
        "--usage-status-font-compensation",
        (1 / Math.max(scale, 0.82)).toFixed(4)
      );
      return scale;
    };
    var panelHeight = Number(statusPanel.scrollHeight);
    var fixedHeight = Math.max(0, Number(dashboard.scrollHeight) - panelHeight);
    var availablePanelHeight = Math.max(1, clientHeight - fixedHeight - 1);
    var heightRatio = panelHeight > 0 ? availablePanelHeight / panelHeight : 1;
    var widestContent = Math.max(
      Number(dashboard.scrollWidth) || 0,
      Number(statusPanel.scrollWidth) || 0
    );
    var widthRatio = widestContent > 0 ? clientWidth / widestContent : 1;
    var scale = applyScale(Math.min(1, heightRatio, widthRatio) * 0.985);

    // Font compensation and pixel rounding make the first geometric estimate
    // deliberately conservative rather than exact. Re-measure the real layout
    // and monotonically reduce only as much as the rendered panel still needs.
    for (var attempt = 0; attempt < 12 && overflows(); attempt += 1) {
      var verticalCorrection = Number(dashboard.scrollHeight) > 0
        ? clientHeight / Number(dashboard.scrollHeight)
        : 1;
      var horizontalCorrection = Number(dashboard.scrollWidth) > 0
        ? clientWidth / Number(dashboard.scrollWidth)
        : 1;
      var correction = Math.min(verticalCorrection, horizontalCorrection);
      if (!(correction > 0) || !Number.isFinite(correction)) {
        break;
      }
      scale = applyScale(scale * Math.min(0.985, correction * 0.985));
    }
  }

  function render(state) {
    state.stats = sanitizeDashboardStats(state.stats || {});
    ensureSelection(state);
    state.startDate = dateNoLaterThanToday(state.startDate) || defaultStartDate(state.stats || {});
    state.endDate = dateNoLaterThanToday(state.endDate) || defaultEndDate();
    if (state.startDate && state.endDate && state.startDate > state.endDate) {
      state.endDate = state.startDate;
    }
    var models = selectedModels(state);
    var activeView = normalizeView(state.activeView);
    // 标题/副标题跟随当前标签页:导出页原来还显示"模型使用 + 统计副标题",是错的(用户:导出界面标题不对)。
    var heading = activeView === "status"
      ? text(state, "openaiStatusTitle")
      : activeView === "export"
        ? text(state, "exportView")
        : text(state, "modelUsage");
    var subtitle = "";
    var surface = state.options && state.options.surface === "page" ? "page" : "popup";
    var closeAction = surface === "page" && state.options && typeof state.options.onClose === "function"
      ? '<button class="usage-header-action usage-panel-close" type="button" data-panel-close aria-label="' +
        escapeHtml(text(state, "close")) + '" title="' + escapeHtml(text(state, "close")) + '">' +
        renderHeaderIcon("close") + '<span class="usage-visually-hidden">' +
        escapeHtml(text(state, "close")) + "</span></button>"
      : "";
    var visibleStatusText = state.statusText || "";
    state.container.innerHTML = [
      '<div class="usage-dashboard usage-dashboard-' + surface + " usage-active-" + activeView + '">',
      '<div class="usage-sticky-header"><div class="usage-topline"><div class="usage-top-copy"><div class="usage-title-row"><h2>' + escapeHtml(heading) + "</h2></div>" +
        (subtitle ? "<p>" + escapeHtml(subtitle) + "</p>" : "") +
        '</div><div class="usage-top-actions"><button class="usage-header-action usage-refresh' +
        (state.refreshing ? " is-refreshing" : "") + '" type="button"' +
        (state.refreshing ? ' disabled aria-busy="true"' : "") + ' aria-label="' +
        escapeHtml(text(state, "refresh")) + '" title="' + escapeHtml(text(state, "refresh")) + '">' +
        renderHeaderIcon("refresh") + '<span class="usage-visually-hidden">' +
        escapeHtml(text(state, "refresh")) + "</span></button>" + renderSettingsMenu(state) + closeAction + "</div></div>",
      renderViewTabs(state),
      "</div>",
      renderActiveView(state, models),
      '<div class="usage-status' + (state.statusError && visibleStatusText ? " error" : "") + '" aria-live="polite">' + escapeHtml(visibleStatusText) + "</div>",
      "</div>"
    ].join("");
    applyPageThemeVariables(state);
    applyPopupThemeVariables(state);
    fitStatusPanel(state);
    bindEvents(state);
    notifyLanguage(state);
    pushBadgeFilter(state);
  }

  // Keep the toolbar badge on the exact same date/source/mode/model filter as
  // the dashboard. The model list is explicit, so an empty selection means 0.
  function pushBadgeFilter(state) {
    var runtime = (root && root.chrome && root.chrome.runtime) || (typeof chrome !== "undefined" && chrome ? chrome.runtime : null);
    if (!runtime || typeof runtime.sendMessage !== "function") { return; }
    var models = selectedModels(state);
    var filter = {
      startDate: state.startDate || "",
      endDate: state.endDate || "",
      statisticsMode: normalizeStatisticsMode(state.statisticsMode),
      sourceModeFilter: normalizeSourceModeFilter(state.sourceModeFilter),
      models: models,
      modelsSpecified: true
    };
    var key = JSON.stringify(filter);
    if (state._lastBadgeFilterKey === key) { return; }
    state._lastBadgeFilterKey = key;
    try {
      runtime.sendMessage(
        { type: "badge.setFilter", filter: filter },
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

  function statisticsDataDateStamp(date) {
    var value = date || new Date();
    var year = value.getUTCFullYear();
    var month = String(value.getUTCMonth() + 1).padStart(2, "0");
    var day = String(value.getUTCDate()).padStart(2, "0");
    var hours = String(value.getUTCHours()).padStart(2, "0");
    var minutes = String(value.getUTCMinutes()).padStart(2, "0");
    var seconds = String(value.getUTCSeconds()).padStart(2, "0");
    return year + "-" + month + "-" + day + "-" + hours + minutes + seconds;
  }

  function csvCell(value) {
    var cell = String(value == null ? "" : value);
    if (/^[=+\-@\t\r]/.test(cell)) {
      cell = "'" + cell;
    }
    return '"' + cell.replace(/"/g, '""') + '"';
  }

  function buildStatisticsCsv(stats) {
    var source = sanitizeDashboardStats(stats || {});
    var historyComplete = source.eventHistoryComplete === true;
    var rows = [[
      "record_type",
      "history_complete",
      "submitted_at",
      "date",
      "public_model",
      "request_model",
      "response_model",
      "reasoning_effort",
      "source_mode",
      "features",
      "conversation_id",
      "conversation_title",
      "count"
    ]];
    (source.events || []).slice().sort(function oldestFirst(left, right) {
      return String(left && left.submittedAt || "").localeCompare(String(right && right.submittedAt || ""));
    }).forEach(function addEvent(event) {
      rows.push([
        "event",
        historyComplete,
        String(event && event.submittedAt || ""),
        eventDateKey(event),
        String(event && (event.publicModel || event.model) || ""),
        eventRequestModel(event),
        eventResponseModel(event),
        eventReasoningEffort(event),
        normalizeDashboardSourceMode(event && event.sourceMode),
        (Array.isArray(event && event.usageFeatures) ? event.usageFeatures : []).join("; "),
        String(event && event.conversationId || ""),
        String(event && event.pageTitle || ""),
        1
      ]);
    });
    if (!historyComplete) {
      Object.keys(source.analyticsByDate || {}).sort().forEach(function addAggregateDate(dateKey) {
        var day = source.analyticsByDate[dateKey] || {};
        ["chat", "work", "unknown"].forEach(function addAggregateSource(sourceMode) {
          var models = day[sourceMode] || {};
          Object.keys(models).sort().forEach(function addAggregateModel(model) {
            Object.keys(models[model] || {}).sort().forEach(function addAggregateRelation(key) {
              var relation = models[model][key] || {};
              var count = Math.max(0, Math.floor(Number(relation.count) || 0));
              if (!count) {
                return;
              }
              var efforts = Object.keys(relation.efforts || {}).sort(function effortOrder(left, right) {
                return (REASONING_EFFORT_ORDER[reasoningEffortClass(left)] || 999) -
                  (REASONING_EFFORT_ORDER[reasoningEffortClass(right)] || 999);
              }).map(function effortCount(effort) {
                return effort + ":" + (Number(relation.efforts[effort]) || 0);
              }).join("; ");
              var features = Object.keys(relation.features || {}).sort().map(function featureCount(feature) {
                return feature + ":" + (Number(relation.features[feature]) || 0);
              }).join("; ");
              rows.push([
                "aggregate",
                false,
                "",
                dateKey,
                model,
                String(relation.requestModel || ""),
                String(relation.responseModel || ""),
                efforts,
                sourceMode,
                features,
                "",
                "",
                count
              ]);
            });
          });
        });
      });
    }
    return "\ufeff" + rows.map(function renderCsvRow(row) {
      return row.map(csvCell).join(",");
    }).join("\r\n") + "\r\n";
  }

  function statisticsDataErrorText(state, error) {
    var code = String((error && error.message) || error || "");
    if (/unsupported-statistics-backup-(?:format|version)/.test(code)) {
      return text(state, "statisticsDataImportUnsupported");
    }
    if (/invalid-statistics-backup/.test(code)) {
      return text(state, "statisticsDataImportInvalid");
    }
    return text(state, "statisticsDataOperationFailed", {
      error: code || text(state, "loadFailed")
    });
  }

  function setStatisticsDataControlsDisabled(state, disabled) {
    if (!state || !state.container || typeof state.container.querySelectorAll !== "function") {
      return;
    }
    Array.prototype.forEach.call(
      state.container.querySelectorAll("[data-statistics-data-export],[data-statistics-data-import]"),
      function update(button) {
        button.disabled = Boolean(disabled);
      }
    );
  }

  function exportStatisticsData(state, format) {
    if (state.statisticsDataBusy) {
      return Promise.resolve(null);
    }
    var exporter = exporterModule();
    if (!exporter || typeof exporter.downloadBlob !== "function") {
      setStatus(state, statisticsDataErrorText(state, "exporter"), true);
      return Promise.resolve(null);
    }

    state.statisticsDataBusy = true;
    setStatisticsDataControlsDisabled(state, true);
    setStatus(state, text(state, "statisticsDataExporting"));
    return sendMessage({ type: "usage.data.export" }, state).then(function createFile(response) {
      if (!response || !response.ok || !response.backup) {
        throw new Error((response && response.error) || "statistics-backup-failed");
      }
      var stamp = statisticsDataDateStamp();
      var filename;
      var blob;
      if (format === "csv") {
        filename = "chatgpt-usage-statistics-" + stamp + ".csv";
        blob = new Blob([buildStatisticsCsv(response.backup.statistics)], {
          type: "text/csv;charset=utf-8"
        });
      } else {
        filename = "chatgpt-usage-statistics-backup-" + stamp + ".json";
        blob = new Blob([JSON.stringify(response.backup, null, 2) + "\n"], {
          type: "application/json;charset=utf-8"
        });
      }
      return downloadOneFile(state, exporter, blob, filename).then(function downloaded() {
        setStatus(state, text(state, "statisticsDataExported", { name: filename }));
        return { filename: filename, backup: response.backup };
      });
    }).catch(function failed(error) {
      setStatus(state, statisticsDataErrorText(state, error), true);
      return null;
    }).then(function finish(result) {
      state.statisticsDataBusy = false;
      setStatisticsDataControlsDisabled(state, false);
      return result;
    });
  }

  function importStatisticsBackup(state, backup) {
    state.statisticsDataBusy = true;
    setStatisticsDataControlsDisabled(state, true);
    setStatus(state, text(state, "statisticsDataImporting"));
    return sendMessage({
      type: "usage.data.import",
      mode: "replace",
      backup: backup
    }, state).then(function imported(response) {
      if (!response || !response.ok || !response.stats) {
        throw new Error((response && response.error) || "statistics-import-failed");
      }
      state.stats = sanitizeDashboardStats(response.stats);
      ensureSelection(state);
      state.statusText = text(state, "statisticsDataImported", {
        count: response.summary && Number(response.summary.totalCount) || 0
      });
      state.statusError = false;
      render(state);
      return response;
    }).catch(function failed(error) {
      setStatus(state, statisticsDataErrorText(state, error), true);
      return null;
    }).then(function finish(result) {
      state.statisticsDataBusy = false;
      setStatisticsDataControlsDisabled(state, false);
      return result;
    });
  }

  function readStatisticsBackupFile(state, file) {
    if (!file) {
      return Promise.resolve(null);
    }
    if (Number(file.size) > MAX_STATISTICS_IMPORT_BYTES) {
      setStatus(state, text(state, "statisticsDataImportTooLarge"), true);
      return Promise.resolve(null);
    }
    var read;
    if (typeof file.text === "function") {
      read = file.text();
    } else {
      var FileReaderCtor = (root && root.FileReader) || (typeof FileReader !== "undefined" ? FileReader : null);
      read = new Promise(function readWithFileReader(resolve, reject) {
        if (!FileReaderCtor) {
          reject(new Error("no-filereader"));
          return;
        }
        var reader = new FileReaderCtor();
        reader.onload = function loaded() { resolve(String(reader.result || "")); };
        reader.onerror = function failed() { reject(reader.error || new Error("file-read-failed")); };
        reader.readAsText(file, "utf-8");
      });
    }
    return Promise.resolve(read).then(function parse(contents) {
      var backup;
      try {
        backup = JSON.parse(String(contents || ""));
      } catch (_) {
        throw new Error("invalid-statistics-backup");
      }
      var confirmFn = root && typeof root.confirm === "function"
        ? root.confirm.bind(root)
        : typeof confirm === "function" ? confirm : null;
      if (confirmFn && !confirmFn(text(state, "statisticsDataImportConfirm"))) {
        return null;
      }
      return importStatisticsBackup(state, backup);
    }).catch(function failed(error) {
      setStatus(state, statisticsDataErrorText(state, error), true);
      return null;
    });
  }

  function clearConversationEffortFilter(container) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return;
    }
    Array.prototype.forEach.call(
      container.querySelectorAll(".usage-relation-conversation,.usage-record-session-row"),
      function showConversation(row) {
        row.hidden = false;
      }
    );
    Array.prototype.forEach.call(container.querySelectorAll("[data-effort-filter]"), function clearToken(token) {
      token.removeAttribute("data-effort-active");
    });
    Array.prototype.forEach.call(container.querySelectorAll(".usage-effort-filter-empty"), function removeEmpty(node) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }

  function filterConversationDetailsByEffort(state, details, effort, activeToken) {
    if (!details || !effort) {
      return 0;
    }
    clearConversationEffortFilter(details);
    var rows = details.querySelectorAll(".usage-relation-conversation,.usage-record-session-row");
    var matches = 0;
    Array.prototype.forEach.call(rows, function filterConversation(row) {
      var efforts = String(row.getAttribute("data-efforts") || "").split(/\s+/).filter(Boolean);
      var visible = efforts.indexOf(effort) !== -1;
      row.hidden = !visible;
      if (visible) {
        matches += 1;
      }
    });
    if (activeToken) {
      activeToken.setAttribute("data-effort-active", "true");
    }
    details.open = true;
    var list = details.querySelector(".usage-relation-conversation-list,.usage-count-details");
    if (!matches && list && typeof list.insertAdjacentHTML === "function") {
      list.insertAdjacentHTML(
        "beforeend",
        '<div class="usage-record-empty usage-effort-filter-empty">' +
          escapeHtml(text(state, "noModelConversations")) + "</div>"
      );
    }
    return matches;
  }

  function focusDonutEffortConversations(state, effort) {
    if (!state.donutModel) {
      return;
    }
    if (state.showTextStatistics === false) {
      state.showTextStatistics = true;
      render(state);
      saveSettings(state, ["showTextStatistics"]).catch(function failed(error) {
        setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
      });
    }
    var selector = normalizeStatisticsMode(state.statisticsMode) === "internal"
      ? '[data-request-model-group="' + cssAttributeValue(state.donutModel) + '"]'
      : '[data-mapped-model="' + cssAttributeValue(state.donutModel) + '"]';
    var group = state.container.querySelector(selector);
    if (!group) {
      return;
    }
    var mappedGroup = group.matches && group.matches(".usage-mapped-record");
    var mappedRelations = mappedGroup
      ? Array.prototype.slice.call(group.querySelectorAll(".usage-model-relation"))
      : [];
    var details = mappedGroup
      ? (mappedRelations.length ? mappedRelations : [group])
      : group.matches && group.matches(".usage-internal-response,.usage-model-relation")
        ? [group]
        : Array.prototype.slice.call(group.querySelectorAll(".usage-internal-response,.usage-model-relation"));
    if (mappedGroup) {
      group.open = true;
    }
    var firstMatch = null;
    details.forEach(function filterDetails(item) {
      var matches = filterConversationDetailsByEffort(state, item, effort, null);
      if (matches && !firstMatch) {
        firstMatch = item;
      }
      if (!matches) {
        item.open = false;
      }
    });
    Array.prototype.forEach.call(
      state.container.querySelectorAll("[data-donut-effort],.usage-donut-legend-row[data-effort-filter]"),
      function markDonutEffort(target) {
      var targetEffort = target.hasAttribute("data-donut-effort")
        ? target.getAttribute("data-donut-effort")
        : target.getAttribute("data-effort-filter");
      if (reasoningEffortClass(targetEffort) === effort) {
        target.setAttribute("data-effort-active", "true");
      } else {
        target.removeAttribute("data-effort-active");
      }
    });
    Array.prototype.forEach.call(group.querySelectorAll("[data-effort-filter]"), function markTextEffort(target) {
      if (reasoningEffortClass(target.getAttribute("data-effort-filter")) === effort) {
        target.setAttribute("data-effort-active", "true");
      }
    });
    if (firstMatch && typeof firstMatch.scrollIntoView === "function") {
      firstMatch.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function nearestPathProgress(path, x, y) {
    if (!path || typeof path.getTotalLength !== "function" || typeof path.getPointAtLength !== "function") {
      return null;
    }
    var total = Number(path.getTotalLength()) || 0;
    if (total <= 0) {
      return 0;
    }
    var samples = 72;
    var bestLength = 0;
    var bestDistance = Number.POSITIVE_INFINITY;
    for (var index = 0; index <= samples; index += 1) {
      var length = total * index / samples;
      var point = path.getPointAtLength(length);
      var dx = Number(point.x) - x;
      var dy = Number(point.y) - y;
      var distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestLength = length;
      }
    }
    var radius = total / samples;
    var low = Math.max(0, bestLength - radius);
    var high = Math.min(total, bestLength + radius);
    for (var refinement = 0; refinement < 10; refinement += 1) {
      var first = low + (high - low) / 3;
      var second = high - (high - low) / 3;
      var firstPoint = path.getPointAtLength(first);
      var secondPoint = path.getPointAtLength(second);
      var firstDx = Number(firstPoint.x) - x;
      var firstDy = Number(firstPoint.y) - y;
      var secondDx = Number(secondPoint.x) - x;
      var secondDy = Number(secondPoint.y) - y;
      if (firstDx * firstDx + firstDy * firstDy <= secondDx * secondDx + secondDy * secondDy) {
        high = second;
      } else {
        low = first;
      }
    }
    return Math.max(0, Math.min(1, ((low + high) / 2) / total));
  }

  function syncChartTrajectoryAnimation(state) {
    if (!state || !state.container || typeof state.container.querySelectorAll !== "function") {
      return;
    }
    Array.prototype.forEach.call(
      state.container.querySelectorAll("[data-chart-series-group]"),
      function syncSeries(group) {
        var path = group.querySelector && group.querySelector(".usage-line");
        if (!path) {
          return;
        }
        Array.prototype.forEach.call(group.querySelectorAll(".usage-point"), function syncPoint(point, index, points) {
          var progress = nearestPathProgress(
            path,
            Number(point.getAttribute("cx")) || 0,
            Number(point.getAttribute("cy")) || 0
          );
          if (progress == null) {
            progress = points.length > 1 ? index / (points.length - 1) : 0;
          }
          if (point.style && typeof point.style.setProperty === "function") {
            point.style.setProperty("--usage-point-delay", (progress * 0.56).toFixed(3) + "s");
          }
        });
      }
    );
  }

  function bindEvents(state) {
    var refreshButton = state.container.querySelector(".usage-refresh");
    if (refreshButton) {
      refreshButton.addEventListener("click", function refresh() {
        if (state.refreshing) {
          return;
        }
        state.refreshing = true;
        render(state);
        Promise.resolve(reload(state, {
          forceExportList: state.activeView === "export"
        })).then(function refreshFinished() {
          state.refreshing = false;
          render(state);
        }, function refreshFailed(error) {
          state.refreshing = false;
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
          render(state);
        });
      });
    }
    var panelClose = state.container.querySelector("[data-panel-close]");
    if (panelClose && state.options && typeof state.options.onClose === "function") {
      panelClose.addEventListener("click", function closePanel() {
        state.options.onClose();
      });
    }
    var settingsMenu = state.container.querySelector(".usage-settings-menu");
    if (settingsMenu) {
      var closeSettingsTimer = null;
      var submenuCloseTimers = {};
      var settingsTransitionMs = 160;
      var setClosing = function setClosing(element, closing) {
        if (!element || !element.classList) {
          return;
        }
        if (closing) {
          element.classList.add("is-closing");
        } else {
          element.classList.remove("is-closing");
        }
      };
      var openSettingsMenu = function openSettingsMenu() {
        if (closeSettingsTimer) {
          clearTimeout(closeSettingsTimer);
          closeSettingsTimer = null;
        }
        setClosing(settingsMenu, false);
        settingsMenu.open = true;
        state.settingsMenuOpen = true;
      };
      var closeSettingsMenu = function closeSettingsMenu() {
        if (closeSettingsTimer) {
          clearTimeout(closeSettingsTimer);
        }
        setClosing(settingsMenu, true);
        closeSettingsTimer = setTimeout(function closeAfterPointerLeavesTree() {
          settingsMenu.open = false;
          setClosing(settingsMenu, false);
          state.settingsMenuOpen = false;
          state.settingsSubmenu = "";
          closeSettingsTimer = null;
        }, settingsTransitionMs);
      };
      settingsMenu.addEventListener("mouseenter", openSettingsMenu);
      settingsMenu.addEventListener("mouseleave", closeSettingsMenu);
      settingsMenu.addEventListener("focusin", openSettingsMenu);
      settingsMenu.addEventListener("focusout", function closeAfterFocusLeaves(event) {
        if (!settingsMenu.contains(event.relatedTarget)) {
          closeSettingsMenu();
        }
      });
      var settingsTrigger = settingsMenu.querySelector(".usage-settings-trigger");
      if (settingsTrigger) {
        settingsTrigger.addEventListener("click", function keepHoverMenuOpen(event) {
          if (typeof event.preventDefault === "function") {
            event.preventDefault();
          }
          openSettingsMenu();
        });
      }
      settingsMenu.addEventListener("toggle", function rememberSettingsMenu() {
        state.settingsMenuOpen = Boolean(settingsMenu.open);
        if (!state.settingsMenuOpen) {
          state.settingsSubmenu = "";
        }
      });
    }
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-settings-category]"), function bindSettingsCategory(category) {
      var categoryId = category.getAttribute("data-settings-category") || "";
      var openSettingsCategory = function openSettingsCategory() {
        if (!settingsMenu || !settingsMenu.open) {
          return;
        }
        state.settingsSubmenu = categoryId;
        Array.prototype.forEach.call(state.container.querySelectorAll("[data-settings-category]"), function updateCategory(sibling) {
          var siblingId = sibling.getAttribute("data-settings-category") || "";
          if (submenuCloseTimers[siblingId]) {
            clearTimeout(submenuCloseTimers[siblingId]);
            delete submenuCloseTimers[siblingId];
          }
          if (sibling === category) {
            setClosing(sibling, false);
            sibling.open = true;
            return;
          }
          if (!sibling.open) {
            setClosing(sibling, false);
            return;
          }
          setClosing(sibling, true);
          submenuCloseTimers[siblingId] = setTimeout(function finishSubmenuClose() {
            if (state.settingsSubmenu !== siblingId) {
              sibling.open = false;
            }
            setClosing(sibling, false);
            delete submenuCloseTimers[siblingId];
          }, settingsTransitionMs);
        });
      };
      category.addEventListener("toggle", function rememberSettingsCategory() {
        if (category.open) {
          state.settingsSubmenu = categoryId;
        } else if (state.settingsSubmenu === categoryId) {
          state.settingsSubmenu = "";
        }
      });
      category.addEventListener("mouseenter", openSettingsCategory);
      category.addEventListener("focusin", openSettingsCategory);
    });
    var startDate = state.container.querySelector(".usage-start-date");
    var endDate = state.container.querySelector(".usage-end-date");
    if (startDate) {
      startDate.addEventListener("change", function changeStart(event) {
        var nextStart = dateNoLaterThanToday(event.target.value) || state.startDate;
        var nextEnd = dateNoLaterThanToday(state.endDate) || defaultEndDate();
        state.startDate = nextStart;
        if (nextStart && (!nextEnd || nextStart > nextEnd)) {
          state.endDate = nextStart;
        }
        render(state);
        saveSettings(state, ["startDate", "endDate"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    }
    if (endDate) {
      endDate.addEventListener("change", function changeEnd(event) {
        var nextEnd = dateNoLaterThanToday(event.target.value) || state.endDate;
        var nextStart = dateNoLaterThanToday(state.startDate) || nextEnd;
        state.endDate = nextEnd;
        if (nextEnd && (!nextStart || nextEnd < nextStart)) {
          state.startDate = nextEnd;
        }
        render(state);
        saveSettings(state, ["startDate", "endDate"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    }
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-source-filter]"), function bindSourceFilter(button) {
      button.addEventListener("click", function changeSourceFilter() {
        state.sourceModeFilter = normalizeSourceModeFilter(button.getAttribute("data-source-filter"));
        render(state);
        saveSettings(state, ["sourceModeFilter"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-statistics-mode]"), function bindStatisticsMode(button) {
      button.addEventListener("click", function changeStatisticsMode() {
        state.statisticsMode = normalizeStatisticsMode(button.getAttribute("data-statistics-mode"));
        state.donutModel = "";
        ensureSelection(state);
        render(state);
        saveSettings(state, ["statisticsMode"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-theme-select]"), function bindThemeMode(button) {
      button.addEventListener("click", function changeThemeMode() {
        state.themeMode = normalizeThemeMode(button.getAttribute("data-theme-select"));
        render(state);
        saveSettings(state, ["themeMode"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-statistics-section]"), function bindStatisticsSection(button) {
      button.addEventListener("change", function changeStatisticsSection() {
        var section = button.getAttribute("data-statistics-section");
        var settingField;
        if (section === "line" || section === "trend") {
          state.showLineChart = Boolean(button.checked);
          state.showTrendChart = state.showLineChart || state.showDonutChart;
          settingField = "showLineChart";
        } else if (section === "donut") {
          state.showDonutChart = Boolean(button.checked);
          state.showTrendChart = state.showLineChart || state.showDonutChart;
          if (!state.showDonutChart) {
            state.donutModel = "";
          }
          settingField = "showDonutChart";
        } else if (section === "text") {
          state.showTextStatistics = Boolean(button.checked);
          settingField = "showTextStatistics";
        } else {
          return;
        }
        render(state);
        saveSettings(state, [settingField, "showTrendChart"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-language-select]"), function bindLanguageOption(languageOption) {
      languageOption.addEventListener("click", function changeLanguage() {
        state.language = normalizeLanguage(languageOption.getAttribute("data-language-select"));
        render(state);
        saveSettings(state, ["language"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-statistics-data-export]"), function bindStatisticsDataExport(button) {
      button.addEventListener("click", function runStatisticsDataExport() {
        exportStatisticsData(state, button.getAttribute("data-statistics-data-export"));
      });
    });
    var statisticsDataFile = state.container.querySelector("[data-statistics-data-file]");
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-statistics-data-import]"), function bindStatisticsDataImport(button) {
      button.addEventListener("click", function chooseStatisticsBackup() {
        if (state.statisticsDataBusy || !statisticsDataFile) {
          return;
        }
        statisticsDataFile.value = "";
        if (typeof statisticsDataFile.click === "function") {
          statisticsDataFile.click();
        }
      });
    });
    if (statisticsDataFile) {
      statisticsDataFile.addEventListener("change", function importSelectedStatisticsBackup() {
        var file = statisticsDataFile.files && statisticsDataFile.files[0];
        readStatisticsBackupFile(state, file);
      });
    }
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-view-tab]"), function bindViewTab(button) {
      button.addEventListener("click", function changeView() {
        state.activeViewInteractionRevision =
          (Number(state.activeViewInteractionRevision) || 0) + 1;
        state.activeViewSettingsLoaded = true;
        state.activeView = normalizeView(button.getAttribute("data-view-tab"));
        if (isActiveStatusView(state)) {
          ensureOpenAIStatus(state, false);
        }
        if (state.activeView === "export" && !Array.isArray(state.exportConversationList)) {
          loadExportConversationList(state);
        }
        render(state);
        saveSettings(state, ["activeView"]).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-model-toggle]"), function bindToggle(control) {
      var eventName = String(control.tagName || "").toLowerCase() === "input" ? "change" : "click";
      var updateModel = function updateModel() {
        var model = control.getAttribute("data-model-toggle");
        var nextSelected = String(control.tagName || "").toLowerCase() === "input"
          ? Boolean(control.checked)
          : control.getAttribute("aria-pressed") !== "true";
        state.selectedModels[model] = nextSelected;
        if (!nextSelected && state.donutModel === model) {
          state.donutModel = "";
        }
        render(state);
        saveSettings(state, modelSelectionSettingFields(state.statisticsMode)).catch(function failed(error) {
          setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
        });
      };
      control.addEventListener(eventName, updateModel);
      control.addEventListener("keydown", function toggleModelByKeyboard(event) {
        if (event.key !== "Enter") {
          return;
        }
        if (typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        if (String(control.tagName || "").toLowerCase() === "input") {
          control.checked = !Boolean(control.checked);
          updateModel();
          return;
        }
        updateModel();
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-donut-model]"), function bindDonutModel(target) {
      var openModel = function openModel() {
        state.donutModel = target.getAttribute("data-donut-model") || "";
        render(state);
      };
      target.addEventListener("click", openModel);
      target.addEventListener("keydown", function openModelByKeyboard(event) {
        if (event.key === "Enter" || event.key === " ") {
          if (typeof event.preventDefault === "function") {
            event.preventDefault();
          }
          openModel();
        }
      });
    });
    var donutBack = state.container.querySelector("[data-donut-back]");
    if (donutBack) {
      donutBack.addEventListener("click", function closeDonutModel() {
        state.donutModel = "";
        render(state);
      });
    }
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-effort-filter]"), function bindEffortFilter(target) {
      var applyFilter = function applyFilter(event) {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        if (event && typeof event.stopPropagation === "function") {
          event.stopPropagation();
        }
        var effort = reasoningEffortClass(target.getAttribute("data-effort-filter"));
        var details = typeof target.closest === "function"
          ? target.closest(".usage-internal-response,.usage-model-relation")
          : null;
        if (details) {
          filterConversationDetailsByEffort(state, details, effort, target);
          return;
        }
        focusDonutEffortConversations(state, effort);
      };
      target.addEventListener("click", applyFilter);
      target.addEventListener("keydown", function filterByKeyboard(event) {
        if (event.key === "Enter" || event.key === " ") {
          applyFilter(event);
        }
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-donut-effort]"), function bindDonutEffort(target) {
      var focusEffort = function focusEffort(event) {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        focusDonutEffortConversations(
          state,
          reasoningEffortClass(target.getAttribute("data-donut-effort"))
        );
      };
      target.addEventListener("click", focusEffort);
      target.addEventListener("keydown", function focusEffortByKeyboard(event) {
        if (event.key === "Enter" || event.key === " ") {
          focusEffort(event);
        }
      });
    });
    Array.prototype.forEach.call(
      state.container.querySelectorAll(".usage-internal-response-summary,.usage-relation-summary,.usage-count-row"),
      function bindConversationSummary(summary) {
        summary.addEventListener("click", function resetEffortFilter(event) {
          var effortTarget = event && event.target && typeof event.target.closest === "function"
            ? event.target.closest("[data-effort-filter]")
            : null;
          if (effortTarget) {
            return;
          }
          var details = typeof summary.closest === "function"
            ? summary.closest(".usage-internal-response,.usage-model-relation,.usage-count-record")
            : null;
          var hadEffortFilter = Boolean(
            details &&
            typeof details.querySelector === "function" &&
            details.querySelector('[data-effort-active="true"]')
          );
          clearConversationEffortFilter(details);
          if (hadEffortFilter && details) {
            if (event && typeof event.preventDefault === "function") {
              event.preventDefault();
            }
            details.open = true;
          }
        });
      }
    );
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-format]"), function bindExport(button) {
      button.addEventListener("click", function runExport() {
        exportConversations(state, button.getAttribute("data-export-format"));
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-conv]"), function bindConv(input) {
      input.addEventListener("change", function toggleConv() {
        if (!state.exportSelected) { state.exportSelected = {}; }
        state.exportSelectAllMode = false;
        var id = input.getAttribute("data-export-conv");
        if (input.checked) {
          state.exportSelected[id] = true;
        } else {
          delete state.exportSelected[id];
        }
        syncExportSelectionUi(state);
      });
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-export-project-toggle]"), function bindProject(input) {
      input.addEventListener("change", function toggleProject() {
        if (!state.exportSelected) { state.exportSelected = {}; }
        state.exportSelectAllMode = false;
        exportProjectConversationIds(state, input.getAttribute("data-export-project-toggle")).forEach(function update(id) {
          if (input.checked) {
            state.exportSelected[id] = true;
          } else {
            delete state.exportSelected[id];
          }
        });
        syncExportSelectionUi(state);
      });
    });
    var exportSearch = state.container.querySelector(".usage-export-search");
    if (exportSearch) {
      exportSearch.addEventListener("input", function searchConversations() {
        state.exportSearch = exportSearch.value || "";
        syncExportSearchUi(state);
      });
    }
    var selectAllBtn = state.container.querySelector("[data-export-selectall]");
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", function selectAll() {
        state.exportSelected = state.exportSelected || {};
        var allIds = (Array.isArray(state.exportConversationList) ? state.exportConversationList : [])
          .filter(function valid(conversation) {
            return conversation && conversation.id;
          })
          .map(function id(conversation) {
            return conversation.id;
          });
        allIds.forEach(function (id) {
          state.exportSelected[id] = true;
        });
        state.exportSelectAllMode = allIds.length === (state.exportConversationList || []).length;
        syncExportSelectionUi(state);
      });
    }
    var selectNoneBtn = state.container.querySelector("[data-export-selectnone]");
    if (selectNoneBtn) {
      selectNoneBtn.addEventListener("click", function selectNone() {
        state.exportSelected = {};
        state.exportSelectAllMode = false;
        syncExportSelectionUi(state);
      });
    }
    var cancelExportBtn = state.container.querySelector("[data-export-cancel]");
    if (cancelExportBtn) {
      cancelExportBtn.addEventListener("click", function cancelExport() {
        if (!state.exportBusy || state.exportCancelRequested) {
          return;
        }
        state.exportCancelRequested = true;
        setExportStatus(state, text(state, "exportCancelling"), true);
        cancelConversationOperation(state);
      });
    }
    if (state.activeView === "export") {
      syncExportSelectionUi(state);
    }
    syncChartTrajectoryAnimation(state);
    bindTooltip(state);
  }

  function exporterModule() {
    return (root && root.ChatGPTUsageExporter) ||
      (typeof window !== "undefined" && window.ChatGPTUsageExporter) || null;
  }

  function setExportStatus(state, message, isError) {
    state.exportStatusText = message || "";
    state.exportStatusError = Boolean(isError);
    var node = state.container && state.container.querySelector("[data-export-status]");
    if (node) {
      node.textContent = state.exportStatusText;
      node.classList.toggle("error", state.exportStatusError);
    }
  }

  function isPageSurface(state) {
    return Boolean(state.options && state.options.surface === "page");
  }

  // 弹窗面板没有页面 DOM，向当前 ChatGPT 标签页的内容脚本请求同源账号历史或 DOM 回退结果。
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

  function conversationOperationMessage(state, helperName, messageType) {
    if (isPageSurface(state) && typeof root[helperName] === "function") {
      try {
        return Promise.resolve(root[helperName]());
      } catch (error) {
        return Promise.reject(error);
      }
    }
    return tabsSendMessage({ type: messageType }).then(function normalize(resp) {
      return resp && resp.ok !== false ? resp : null;
    });
  }

  function accountResponseError(response, fallbackMessage) {
    var error = new Error(String(
      response && response.error ||
      fallbackMessage ||
      "ChatGPT account request failed."
    ));
    error.status = Number(response && response.status) || 0;
    error.stopOperation = Boolean(response && response.stopOperation);
    error.incomplete = Boolean(response && (response.incomplete || response.stopOperation));
    error.retryAfterMs = Math.max(0, Number(response && response.retryAfterMs) || 0);
    error.code = String(response && response.code || "");
    return error;
  }

  function beginConversationOperation(state) {
    return conversationOperationMessage(state, "__chatgptUsageBeginAccountOperation", "conversation.operation.begin");
  }

  function cancelConversationOperation(state) {
    return conversationOperationMessage(state, "__chatgptUsageCancelAccountOperation", "conversation.operation.cancel")
      .catch(function ignoreCancellationSignalFailure() { return null; });
  }

  function releaseConversationCredentials(state) {
    return conversationOperationMessage(state, "__chatgptUsageReleaseAccountAuth", "conversation.operation.release")
      .catch(function ignoreReleaseFailure() { return null; });
  }

  function requestExportConversationList(state) {
    if (isPageSurface(state) && root.__chatgptUsageListConversations) {
      return Promise.resolve(root.__chatgptUsageListConversations()).then(function normalizeDirect(result) {
        return Array.isArray(result) ? { conversations: result, complete: false, source: "sidebar" } : (result || {});
      });
    }
    return tabsSendMessage({ type: "conversation.list" }).then(function normalizeMessage(resp) {
      if (!resp || !resp.ok) {
        throw accountResponseError(resp, text(state, "exportOpenPage"));
      }
      return resp;
    });
  }

  function applyExportConversationList(state, result) {
    var list = Array.isArray(result) ? result : result && result.conversations;
    var currentConversationId = String(result && result.currentConversationId || "");
    state.exportConversationList = (Array.isArray(list) ? list : []).map(function markCurrent(conversation) {
      return Object.assign({}, conversation || {}, {
        current: Boolean(
          conversation && (
            conversation.current ||
            currentConversationId && conversation.id === currentConversationId
          )
        )
      });
    }).sort(function currentFirst(left, right) {
      if (Boolean(left.current) !== Boolean(right.current)) {
        return left.current ? -1 : 1;
      }
      return 0;
    });
    state.exportConversationMeta = Array.isArray(result) ? { complete: false, source: "sidebar" } : (result || {});
    var previousSelection = state.exportSelected || {};
    var nextSelection = {};
    state.exportConversationList.forEach(function keepExistingSelection(conversation) {
      if (
        conversation &&
        conversation.id &&
        (state.exportSelectAllMode || previousSelection[conversation.id])
      ) {
        nextSelection[conversation.id] = true;
      }
    });
    if (!state.exportSelectionInitialized) {
      var current = state.exportConversationList.filter(function findCurrent(conversation) {
        return conversation && conversation.current && conversation.id;
      })[0];
      if (current) {
        nextSelection[current.id] = true;
        // An empty, unavailable, or still-incomplete first response must not
        // consume the one-time default. Select the current conversation when
        // it first becomes available, then preserve every later user choice.
        state.exportSelectionInitialized = true;
      }
    }
    state.exportSelected = nextSelection;
    render(state);
    return state.exportConversationMeta;
  }

  function loadExportConversationList(state) {
    if (state.exportConversationListRequest) {
      return state.exportConversationListRequest;
    }
    state.exportConversationListGeneration =
      (Number(state.exportConversationListGeneration) || 0) + 1;
    var generation = state.exportConversationListGeneration;
    var request = requestExportConversationList(state)
      .then(function apply(result) {
        if (generation !== state.exportConversationListGeneration) {
          return state.exportConversationMeta;
        }
        return applyExportConversationList(state, result);
      })
      .catch(function failed(error) {
        if (
          generation !== state.exportConversationListGeneration ||
          error && error.cancelled
        ) {
          return state.exportConversationMeta;
        }
        return applyExportConversationList(state, {
          conversations: [],
          complete: false,
          source: error && error.stopOperation ? "stopped" : "unavailable",
          warnings: [{
            scope: error && error.stopOperation ? "account-stopped" : "account",
            error: String((error && error.message) || error || "conversation-index-unavailable")
          }]
        });
      }).then(function clearRequest(result) {
        if (state.exportConversationListRequest === request) {
          state.exportConversationListRequest = null;
        }
        return result;
      }, function clearRejectedRequest(error) {
        if (state.exportConversationListRequest === request) {
          state.exportConversationListRequest = null;
        }
        throw error;
      });
    state.exportConversationListRequest = request;
    return request;
  }

  function normalizeConversationCollection(result) {
    if (Array.isArray(result)) {
      return { conversations: result, failures: [], warnings: [], requestedCount: result.length, complete: true };
    }
    result = result || {};
    var failures = Array.isArray(result.failures) ? result.failures : [];
    return {
      conversations: Array.isArray(result.conversations)
        ? result.conversations
        : result.conversation ? [result.conversation] : [],
      failures: failures,
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
      requestedCount: Number(result.requestedCount) || (Array.isArray(result.conversations) ? result.conversations.length : result.conversation ? 1 : 0),
      indexComplete: result.indexComplete !== false,
      bodyComplete: result.bodyComplete !== false && failures.length === 0,
      complete: result.complete !== false && failures.length === 0
    };
  }

  function normalizedPromptForHash(value) {
    return String(value || "")
      .replace(/[\u200b-\u200f\u2060]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function promptHash(value) {
    var hash = 2166136261;
    var textValue = normalizedPromptForHash(value);
    for (var index = 0; index < textValue.length; index += 1) {
      hash ^= textValue.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function legacyDuplicatedPromptFingerprint(value) {
    var textValue = normalizedPromptForHash(value);
    if (!textValue) {
      return { hash: "", length: 0 };
    }
    var duplicated = textValue + " " + textValue;
    return {
      hash: promptHash(duplicated),
      length: duplicated.length
    };
  }

  function eventConversationId(event) {
    var explicit = String(event && event.conversationId || "").trim();
    if (explicit) {
      return explicit;
    }
    var match = String(event && event.pageUrl || "").match(/\/c\/([^/?#]+)/i);
    return match ? match[1] : "";
  }

  function requestEffortFromUsageEvent(event) {
    var direct = String(event && event.requestReasoningEffort || "").trim().toLowerCase();
    if (direct) {
      return direct.slice(0, 32);
    }
    var parameters = event && event.modelParameters && typeof event.modelParameters === "object"
      ? event.modelParameters
      : {};
    var value = parameters["reasoning.effort"] || parameters.reasoning_effort;
    if (!value && parameters.reasoning && typeof parameters.reasoning === "object") {
      value = parameters.reasoning.effort;
    }
    return String(value || "").trim().toLowerCase().slice(0, 32);
  }

  function trustedUsageEventRequestModel(event) {
    var source = event && typeof event === "object" ? event : {};
    if (source.requestModelEvidence === "unavailable") {
      return "";
    }
    var requestModel = String(source.requestModel || "").trim();
    if (!requestModel) {
      return "";
    }
    if (source.requestModelEvidence === "trusted") {
      return requestModel;
    }
    var observedSource = String(source.modelObservedSource || source.observedSource || "");
    return /^(?:webRequest|fetch-request|xhr-request|fetch-response|xhr-response|fetch-url|xhr-url)(?::|$)/i.test(observedSource)
      ? requestModel
      : "";
  }

  function exactConversationResponseModel(message) {
    var source = message && typeof message === "object" ? message : {};
    var metadata = source.metadata && typeof source.metadata === "object"
      ? source.metadata
      : {};
    var candidates = [
      source.responseModel,
      source.response_model,
      source.model_slug,
      source.modelSlug,
      metadata.responseModel,
      metadata.response_model,
      metadata.model_slug,
      metadata.modelSlug,
      metadata.modelslug
    ];
    for (var index = 0; index < candidates.length; index += 1) {
      var candidate = String(candidates[index] || "").trim();
      if (candidate) {
        return candidate;
      }
    }
    return "";
  }

  function mergeUniqueStrings(left, right) {
    var seen = {};
    return [].concat(Array.isArray(left) ? left : [], Array.isArray(right) ? right : [])
      .map(function clean(value) { return String(value || "").trim(); })
      .filter(function unique(value) {
        if (!value || seen[value]) {
          return false;
        }
        seen[value] = true;
        return true;
      });
  }

  function attachUsageEventToAssistant(message, event) {
    var enriched = Object.assign({}, message || {});
    var responseModel = exactConversationResponseModel(enriched);
    var exactEventResponse = String(event && event.responseModel || "").trim();
    if (!responseModel && exactEventResponse && event.responseObservedAt &&
        /^message-dom:model-slug(?:$|:)/i.test(String(event.responseObservedSource || ""))) {
      responseModel = exactEventResponse;
    }
    var requestModel = trustedUsageEventRequestModel(event);
    var selectedPublicModel = String(event && event.selectedPublicModel || "").trim();
    var selectedSource = String(event && event.selectedPublicModelSource || "");
    if (!requestModel && /^request\+account-catalog/i.test(selectedSource)) {
      selectedPublicModel = "";
    }
    enriched.selectedPublicModel = enriched.selectedPublicModel || selectedPublicModel;
    enriched.requestModel = enriched.requestModel || requestModel;
    enriched.responseModel = responseModel;
    enriched.model = responseModel;
    enriched.requestReasoningEffort = enriched.requestReasoningEffort ||
      (requestModel ? requestEffortFromUsageEvent(event) : "");
    enriched.reasoningEffort = enriched.requestReasoningEffort || "";
    enriched.parameters = Object.assign(
      {},
      enriched.parameters && typeof enriched.parameters === "object"
        ? enriched.parameters
        : {},
      requestModel && event && event.modelParameters && typeof event.modelParameters === "object"
        ? event.modelParameters
        : {}
    );
    enriched.features = mergeUniqueStrings(
      enriched.features,
      requestModel && event && event.usageFeatures
    );
    return enriched;
  }

  function enrichConversationWithUsageEvents(conversation, stats) {
    var source = conversation && typeof conversation === "object" ? conversation : {};
    var conversationId = String(
      source.id || source.conversation_id || source.conversationId || ""
    ).trim();
    var messages = Array.isArray(source.messages)
      ? source.messages.map(function cloneMessage(message) { return Object.assign({}, message || {}); })
      : [];
    if (!conversationId || !messages.length) {
      return Object.assign({}, source, { messages: messages });
    }
    var events = (stats && Array.isArray(stats.events) ? stats.events : [])
      .filter(function sameConversation(event) {
        return event && eventConversationId(event) === conversationId;
      })
      .slice()
      .sort(function chronological(left, right) {
        return String(left.submittedAt || "").localeCompare(String(right.submittedAt || ""));
      });
    if (!events.length) {
      return Object.assign({}, source, { messages: messages });
    }

    var usedEvents = {};
    var usedAssistants = {};
    var assistantIndexById = {};
    messages.forEach(function indexAssistant(message, index) {
      if (String(message && message.role || "").toLowerCase() !== "assistant") {
        return;
      }
      var id = String(message.id || "").trim();
      if (id && !Object.prototype.hasOwnProperty.call(assistantIndexById, id)) {
        assistantIndexById[id] = index;
      }
    });

    events.forEach(function matchResponseMessage(event, eventIndex) {
      var responseMessageId = String(event && event.responseMessageId || "").trim();
      if (!responseMessageId ||
          !Object.prototype.hasOwnProperty.call(assistantIndexById, responseMessageId)) {
        return;
      }
      var assistantIndex = assistantIndexById[responseMessageId];
      if (usedAssistants[assistantIndex]) {
        return;
      }
      messages[assistantIndex] = attachUsageEventToAssistant(messages[assistantIndex], event);
      usedEvents[eventIndex] = true;
      usedAssistants[assistantIndex] = true;
    });

    messages.forEach(function matchPromptTurn(message, messageIndex) {
      if (String(message && message.role || "").toLowerCase() !== "user") {
        return;
      }
      var promptText = message.text || message.content || "";
      var hash = promptHash(promptText);
      var legacyFingerprint = legacyDuplicatedPromptFingerprint(promptText);
      var candidates = [];
      events.forEach(function candidate(event, eventIndex) {
        var eventHash = String(event && event.promptHash || "");
        var matchesCurrent = eventHash === hash;
        var matchesLegacyDuplicate = Boolean(
          legacyFingerprint.hash &&
          eventHash === legacyFingerprint.hash &&
          Number(event && event.promptLength) === legacyFingerprint.length
        );
        if (!usedEvents[eventIndex] && (matchesCurrent || matchesLegacyDuplicate)) {
          candidates.push({ event: event, eventIndex: eventIndex });
        }
      });
      if (!candidates.length) {
        return;
      }
      var userTime = new Date(String(message.createTime || message.createdAt || "")).getTime();
      candidates.sort(function nearest(left, right) {
        var leftTime = new Date(String(left.event.submittedAt || "")).getTime();
        var rightTime = new Date(String(right.event.submittedAt || "")).getTime();
        var leftDistance = Number.isNaN(userTime) || Number.isNaN(leftTime)
          ? Number.MAX_SAFE_INTEGER
          : Math.abs(userTime - leftTime);
        var rightDistance = Number.isNaN(userTime) || Number.isNaN(rightTime)
          ? Number.MAX_SAFE_INTEGER
          : Math.abs(userTime - rightTime);
        return leftDistance - rightDistance || left.eventIndex - right.eventIndex;
      });
      var selected = candidates[0];
      var selectedTime = new Date(String(selected.event.submittedAt || "")).getTime();
      if (!Number.isNaN(userTime) && !Number.isNaN(selectedTime) &&
          Math.abs(userTime - selectedTime) > 5 * 60 * 1000) {
        return;
      }
      if (candidates.length > 1) {
        if (Number.isNaN(userTime) || Number.isNaN(selectedTime) ||
            Math.abs(userTime - selectedTime) > 5 * 60 * 1000) {
          return;
        }
      }
      var assistantIndex = -1;
      for (var next = messageIndex + 1; next < messages.length; next += 1) {
        var role = String(messages[next] && messages[next].role || "").toLowerCase();
        if (role === "user") {
          break;
        }
        if (role === "assistant" && !usedAssistants[next]) {
          assistantIndex = next;
          break;
        }
      }
      if (assistantIndex < 0) {
        return;
      }
      messages[assistantIndex] = attachUsageEventToAssistant(messages[assistantIndex], selected.event);
      usedEvents[selected.eventIndex] = true;
      usedAssistants[assistantIndex] = true;
    });

    return Object.assign({}, source, { messages: messages });
  }

  function directPageCollection(state, helperName, args) {
    if (!isPageSurface(state) || typeof root[helperName] !== "function") {
      return null;
    }
    return Promise.resolve(root[helperName].apply(root, args || [])).then(normalizeConversationCollection);
  }

  function exportTargetPlan(state) {
    var selectedIds = selectedExportConversationIds(state);
    if (!selectedIds.length) {
      return Promise.reject(new Error(text(state, "exportNoSelection")));
    }
    var meta = state.exportConversationMeta || {};
    return Promise.resolve({
      scope: "selected",
      current: false,
      ids: selectedIds,
      complete: meta.complete !== false,
      indexComplete: meta.complete !== false,
      warnings: Array.isArray(meta.warnings) ? meta.warnings.slice() : []
    });
  }

  function collectConversationChunk(state, ids) {
    var direct = directPageCollection(state, "__chatgptUsageCollectMany", [ids]);
    if (direct) {
      return direct;
    }
    return tabsSendMessage({ type: "conversation.collectMany", ids: ids }).then(function (resp) {
      if (!resp || !resp.ok) {
        throw accountResponseError(resp, text(state, "exportOpenPage"));
      }
      return normalizeConversationCollection(resp);
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

  // PNG 走 Canvas，以保留 Markdown 的视觉层次和品牌水印。
  // PDF 必须走独立的文本 PDF 生成器，确保分页按内容块完成，且文字可搜索、选择和复制。
  // Markdown / DOCX / JSON 继续使用各自的结构化导出器。
  function buildExportArtifacts(exporter, valid, format, base) {
    var hasCanvas = root && root.document && typeof root.document.createElement === "function" &&
      typeof exporter.renderConversationsCanvas === "function";
    if (format === "pdf") {
      if (typeof exporter.buildPdf === "function") {
        return Promise.resolve([{
          blob: exporter.buildPdf(valid, { filenameBase: base }),
          filename: base + ".pdf"
        }]);
      }
      var pdfArtifact = exporter.exportArtifact(valid, "pdf", { filenameBase: base });
      return Promise.resolve([{ blob: pdfArtifact.blob, filename: pdfArtifact.filename }]);
    }
    if (hasCanvas && (format === "png" || format === "image")) {
      if ((format === "png" || format === "image") && typeof exporter.buildPngBlobFromConversations === "function") {
        return exporter.buildPngBlobFromConversations(valid, { filenameBase: base, pageHeight: 14000 }).then(function (blob) {
          return [{ blob: blob, filename: base + ".png" }];
        });
      }
      var pages = [exporter.renderConversationsCanvas(valid, { filenameBase: base })];
      return exporter.canvasToPngBlob(pages[0]).then(function pngFile(blob) {
        return [{ blob: blob, filename: base + ".png" }];
      });
    }
    // Word 走渲染版(Markdown→Word 结构),其余(Markdown/JSON)走原始同步导出。
    if (format === "docx" && typeof exporter.buildDocxRenderedBlob === "function") {
      return Promise.resolve([{ blob: exporter.buildDocxRenderedBlob(valid, {}), filename: base + ".docx" }]);
    }
    var artifact = exporter.exportArtifact(valid, format, { filenameBase: base });
    return Promise.resolve([{ blob: artifact.blob, filename: artifact.filename }]);
  }

  function setExportControlsDisabled(state, disabled) {
    if (!state || !state.container || typeof state.container.querySelectorAll !== "function") {
      return;
    }
    if (disabled) {
      Array.prototype.forEach.call(
        state.container.querySelectorAll("[data-export-format],[data-export-selectall],[data-export-selectnone],[data-export-project-toggle],[data-export-conv]"),
        function toggle(control) {
          control.disabled = true;
        }
      );
    } else {
      syncExportSelectionUi(state);
    }
    var cancel = typeof state.container.querySelector === "function"
      ? state.container.querySelector("[data-export-cancel]")
      : null;
    if (cancel) {
      cancel.hidden = !state.exportBusy;
      cancel.disabled = !state.exportBusy || Boolean(state.exportCancelRequested);
    }
  }

  function exportConversations(state, format) {
    var exporter = exporterModule();
    if (!exporter || typeof exporter.exportArtifact !== "function" || typeof exporter.downloadBlob !== "function" || typeof exporter.buildZip !== "function") {
      setExportStatus(state, text(state, "exportFailed", { error: "exporter" }), true);
      return;
    }
    if (state.exportBusy) {
      return;
    }
    state.exportBusy = true;
    state.exportCancelRequested = false;
    setExportControlsDisabled(state, true);
    setExportStatus(state, text(state, "exportRunning"));
    return beginConversationOperation(state).catch(function ignoreBeginFailure() {
      return null;
    }).then(function createPlan() {
      return exportTargetPlan(state);
    }).then(function executePlan(plan) {
      if (!plan.ids.length) {
        throw new Error(plan.warnings.length ? text(state, "exportListUnavailable") : text(state, "exportEmpty"));
      }
      setExportStatus(state, text(state, "exportProgressSelected"));
      if (plan.ids.length === 1) {
        return collectConversationChunk(state, plan.ids).then(function singleSelected(collection) {
          if (state.exportCancelRequested) {
            throw new Error("export-cancelled");
          }
          collection.indexComplete = plan.indexComplete;
          collection.warnings = (plan.warnings || []).concat(collection.warnings || []);
          var targetId = plan.ids[0];
          var conversation = (collection.conversations || []).find(function exactTarget(item) {
            return item && item.id === targetId;
          });
          if (!conversation || !conversation.messages || !conversation.messages.length) {
            throw new Error((collection.failures[0] && collection.failures[0].error) || text(state, "exportEmpty"));
          }
          return downloadSingleConversation(state, exporter, conversation, format, collection);
        });
      }
      return downloadConversationArchiveByIds(state, exporter, plan, format);
    }).catch(function (error) {
      if (state.exportCancelRequested || String((error && error.message) || error) === "export-cancelled") {
        setExportStatus(state, text(state, "exportCancelled"), true);
        return;
      }
      setExportStatus(state, text(state, "exportFailed", { error: String((error && error.message) || error) }), true);
    }).then(function releaseAfterExport() {
      return releaseConversationCredentials(state);
    }).then(function finishExportAttempt() {
      state.exportBusy = false;
      state.exportCancelRequested = false;
      setExportControlsDisabled(state, false);
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

  function downloadThroughExtensionApi(blob, filename) {
    var api = root && root.chrome && root.chrome.downloads;
    var urlApi = (root && root.URL) || (typeof URL !== "undefined" ? URL : null);
    if (!api || typeof api.download !== "function" || !urlApi || typeof urlApi.createObjectURL !== "function") {
      return null;
    }
    return new Promise(function (resolve) {
      var url = urlApi.createObjectURL(blob);
      var finish = function (ok) {
        setTimeout(function revoke() {
          try { urlApi.revokeObjectURL(url); } catch (_) {}
        }, 60000);
        resolve(Boolean(ok));
      };
      try {
        api.download({ url: url, filename: filename, saveAs: false }, function (downloadId) {
          if (root.chrome.runtime && root.chrome.runtime.lastError) {
            finish(false);
            return;
          }
          finish(typeof downloadId === "number");
        });
      } catch (_) {
        finish(false);
      }
    });
  }

  // 页面内面板直接下载 Blob；扩展弹窗优先使用 chrome.downloads + Blob URL。
  // 只有旧环境缺少这些能力时才把 data URL 发给后台，避免大文件跨扩展消息复制。
  function downloadOneFile(state, exporter, blob, filename) {
    if (isPageSurface(state)) {
      exporter.downloadBlob(blob, filename);
      return Promise.resolve();
    }
    var directDownload = downloadThroughExtensionApi(blob, filename);
    if (directDownload) {
      return directDownload.then(function downloaded(ok) {
        if (!ok) {
          exporter.downloadBlob(blob, filename);
        }
      });
    }
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

  function nextUniqueConversationBase(exporter, conversation, index, seenBases) {
    var raw = exporter.safeName
      ? exporter.safeName(conversation.title || conversation.id || ("chatgpt-conversation-" + (index + 1)))
      : ("chatgpt-conversation-" + (index + 1));
    var collisionKey = function (value) {
      var normalized = String(value || "");
      if (typeof normalized.normalize === "function") {
        normalized = normalized.normalize("NFC");
      }
      return normalized.toLowerCase();
    };
    var baseKey = collisionKey(raw);
    var countKey = "count:" + baseKey;
    var count = Number(seenBases[countKey]) || 0;
    var candidate = raw;
    var usedKey = "";
    do {
      count += 1;
      var cleanId = String(conversation && conversation.id || "").replace(/[^0-9a-z]/gi, "");
      var shortId = cleanId ? cleanId.slice(-8) : "";
      var suffix = count > 1
        ? "-" + (shortId || count) + (count > 2 ? "-" + count : "")
        : "";
      candidate = count > 1
        ? raw.slice(0, Math.max(1, 80 - suffix.length)).replace(/[. ]+$/g, "") + suffix
        : raw;
      usedKey = "used:" + collisionKey(candidate);
    } while (seenBases[usedKey]);
    seenBases[countKey] = count;
    seenBases[usedKey] = true;
    return candidate;
  }

  function uniqueConversationBases(exporter, conversations) {
    var seenBases = {};
    return conversations.map(function makeBase(conversation, index) {
      return nextUniqueConversationBase(exporter, conversation, index, seenBases);
    });
  }

  function downloadSingleConversation(state, exporter, conversation, format, collection) {
    var enrichedConversation = enrichConversationWithUsageEvents(conversation, state.stats || {});
    var base = uniqueConversationBases(exporter, [enrichedConversation])[0];
    return buildExportArtifacts(exporter, [enrichedConversation], format, base).then(function (artifacts) {
      if (state.exportCancelRequested) {
        throw new Error("export-cancelled");
      }
      if (artifacts.length !== 1) {
        throw new Error("One selected conversation must produce exactly one file.");
      }
      return downloadOneFile(state, exporter, artifacts[0].blob, artifacts[0].filename).then(function () {
        if (collection && (
          collection.complete === false ||
          collection.indexComplete === false ||
          (collection.warnings || []).length
        )) {
          setExportStatus(state, text(state, "exportSingleIncomplete", { name: artifacts[0].filename }), true);
        } else {
          setExportStatus(state, text(state, "exportDone", { name: artifacts[0].filename }));
        }
      });
    });
  }

  function blobToBytes(blob) {
    if (blob && typeof blob.arrayBuffer === "function") {
      return blob.arrayBuffer().then(function toBytes(buffer) { return new Uint8Array(buffer); });
    }
    return new Promise(function (resolve, reject) {
      var FileReaderCtor = (root && root.FileReader) || (typeof FileReader !== "undefined" ? FileReader : null);
      if (!FileReaderCtor) { reject(new Error("no-filereader")); return; }
      var reader = new FileReaderCtor();
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.onerror = function () { reject(reader.error || new Error("read-failed")); };
      reader.readAsArrayBuffer(blob);
    });
  }

  function localExportDateStamp(date) {
    var value = date || new Date();
    return value.getUTCFullYear() + "-" +
      String(value.getUTCMonth() + 1).padStart(2, "0") + "-" +
      String(value.getUTCDate()).padStart(2, "0");
  }

  function downloadConversationArchiveByIds(state, exporter, plan, format) {
    var files = [];
    var collectionFailures = [];
    var collectionWarnings = (plan.warnings || []).slice();
    var conversionFailures = [];
    var collectionComplete = true;
    var indexComplete = plan.indexComplete !== false;
    var seenBases = {};
    var exportedConversationCount = 0;
    var ids = plan.ids;
    var chunkSize = 6;

    function convertConversation(conversation, position) {
      if (state.exportCancelRequested) {
        return Promise.reject(new Error("export-cancelled"));
      }
      var enrichedConversation = enrichConversationWithUsageEvents(conversation, state.stats || {});
      var base = nextUniqueConversationBase(exporter, enrichedConversation, position, seenBases);
      return buildExportArtifacts(exporter, [enrichedConversation], format, base).then(function (artifacts) {
        if (artifacts.length !== 1) {
          throw new Error("Each selected conversation must produce exactly one file.");
        }
        return Promise.all(artifacts.map(function convertArtifact(artifact) {
          return blobToBytes(artifact.blob).then(function addFile(bytes) {
            return { name: artifact.filename, content: bytes };
          });
        })).then(function converted(artifactFiles) {
          // Blob reads can finish in a different order (large first PNG page
          // versus a smaller final page). Append only after Promise.all has
          // restored the artifact array order so part-001 always precedes
          // part-002 in the ZIP and in _export-report.json.
          Array.prototype.push.apply(files, artifactFiles);
          exportedConversationCount += 1;
        });
      }).catch(function failed(error) {
        conversionFailures.push({
          id: conversation.id || "",
          title: conversation.title || "",
          error: String((error && error.message) || error || "conversion-failed")
        });
      });
    }

    function convertChunk(conversations, positionById) {
      var cursor = 0;
      function next() {
        if (state.exportCancelRequested) {
          return Promise.reject(new Error("export-cancelled"));
        }
        if (cursor >= conversations.length) {
          return Promise.resolve();
        }
        var conversation = conversations[cursor];
        cursor += 1;
        var position = Object.prototype.hasOwnProperty.call(positionById, conversation.id)
          ? positionById[conversation.id]
          : cursor - 1;
        return convertConversation(conversation, position).then(next);
      }
      return next();
    }

    function step(offset) {
      if (state.exportCancelRequested) {
        return Promise.reject(new Error("export-cancelled"));
      }
      if (offset >= ids.length) {
        return Promise.resolve();
      }
      var chunkIds = ids.slice(offset, offset + chunkSize);
      setExportStatus(state, text(state, "exportRunning") + " " + Math.min(ids.length, offset + chunkIds.length) + "/" + ids.length);
      return collectConversationChunk(state, chunkIds).then(function collected(result) {
        if (state.exportCancelRequested) {
          throw new Error("export-cancelled");
        }
        collectionFailures = collectionFailures.concat(result.failures || []);
        collectionWarnings = collectionWarnings.concat(result.warnings || []);
        if (result.complete === false) {
          collectionComplete = false;
        }
        var allowed = {};
        var byId = {};
        var received = {};
        var positions = {};
        chunkIds.forEach(function rememberPosition(id, index) {
          allowed[id] = true;
          positions[id] = offset + index;
        });
        (result.conversations || []).forEach(function rememberConversation(conversation) {
          if (conversation && allowed[conversation.id] && !byId[conversation.id]) {
            byId[conversation.id] = conversation;
            received[conversation.id] = true;
          }
        });
        chunkIds.forEach(function reportMissing(id) {
          var alreadyReported = (result.failures || []).some(function same(failure) { return failure && failure.id === id; });
          if (!received[id] && !alreadyReported) {
            collectionFailures.push({ id: id, error: "Conversation was not returned by ChatGPT." });
          }
        });
        return convertChunk(chunkIds.map(function inRequestedOrder(id) { return byId[id]; }).filter(Boolean), positions);
      }).catch(function chunkFailed(error) {
        if (state.exportCancelRequested || String((error && error.message) || error) === "export-cancelled") {
          throw error;
        }
        if (error && error.stopOperation) {
          throw error;
        }
        chunkIds.forEach(function failedId(id) {
          collectionFailures.push({ id: id, error: String((error && error.message) || error || "collection-failed") });
        });
      }).then(function nextChunk() {
        return step(offset + chunkSize);
      });
    }

    return step(0).then(function finishArchive() {
      return finishConversationArchive(
        state,
        exporter,
        files,
        format,
        {
          requestedCount: ids.length,
          complete: collectionComplete && collectionFailures.length === 0,
          indexComplete: indexComplete,
          bodyComplete: collectionComplete && collectionFailures.length === 0,
          failures: collectionFailures,
          warnings: collectionWarnings
        },
        exportedConversationCount,
        conversionFailures
      );
    });
  }

  function finishConversationArchive(state, exporter, sourceFiles, format, collection, exportedConversationCount, conversionFailures) {
    var files = sourceFiles.slice();
    var failures = (collection.failures || []).concat(conversionFailures || []);
    var warnings = collection.warnings || [];
    if (!files.length) {
      throw new Error(failures[0] && failures[0].error ? failures[0].error : "No conversation file could be created.");
    }
    var report = {
      exportedAt: new Date().toISOString(),
      format: format,
      requestedConversationCount: collection.requestedCount,
      exportedConversationCount: exportedConversationCount,
      exportedFileCount: files.length,
      failedConversationCount: failures.length,
      indexComplete: collection.indexComplete !== false,
      bodyComplete: collection.bodyComplete !== false && failures.length === 0,
      complete: failures.length === 0 &&
        collection.complete !== false &&
        collection.indexComplete !== false &&
        collection.bodyComplete !== false &&
        warnings.length === 0,
      failures: failures,
      warnings: warnings,
      files: files.map(function filename(file) { return file.name; })
    };
    files.push({ name: "_export-report.json", content: JSON.stringify(report, null, 2) + "\n" });
    var archiveName = "chatgpt-conversations-" + format + "-" + localExportDateStamp() + ".zip";
    var zipBlob = new Blob([exporter.buildZip(files)], { type: (exporter.MIME && exporter.MIME.zip) || "application/zip" });
    // ZIP 本身只有一次下载。弹窗使用 chrome.downloads + Blob URL，页面内面板直接下载 Blob；
    // 两条路径都避免把大型归档转成 base64 后跨扩展消息传输。
    return downloadOneFile(state, exporter, zipBlob, archiveName).then(function downloadedArchive() {
      if (failures.length) {
        setExportStatus(state, text(state, "exportPartial", { success: exportedConversationCount, failed: failures.length }), true);
      } else if (
        collection.complete === false ||
        collection.indexComplete === false ||
        collection.bodyComplete === false ||
        warnings.length
      ) {
        setExportStatus(state, text(state, "exportIncomplete", { success: exportedConversationCount }), true);
      } else {
        setExportStatus(state, text(state, "exportArchiveDone", { count: exportedConversationCount, name: archiveName }));
      }
    });
  }

  function setChartModelFocus(state, model) {
    if (!state || !state.container || typeof state.container.querySelectorAll !== "function") {
      return;
    }
    var selected = String(model || "");
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-chart-series]"), function updateSeries(node) {
      var same = selected && node.getAttribute("data-chart-series") === selected;
      node.setAttribute("data-focus-dimmed", selected && !same ? "true" : "false");
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-chart-focus]"), function updateFocus(node) {
      node.setAttribute(
        "data-focus-active",
        selected && node.getAttribute("data-chart-focus") === selected ? "true" : "false"
      );
    });
    Array.prototype.forEach.call(state.container.querySelectorAll("[data-chart-model]"), function updateLegend(node) {
      node.setAttribute(
        "data-focus-active",
        selected && node.getAttribute("data-chart-model") === selected ? "true" : "false"
      );
    });
  }

  function bindTooltip(state) {
    var wrap = state.container.querySelector(".usage-chart-wrap");
    var tooltip = state.container.querySelector(".usage-tooltip");
    if (!wrap || !tooltip) {
      return;
    }
    Array.prototype.forEach.call(wrap.querySelectorAll("[data-chart-model]"), function bindLegend(modelChip) {
      var model = modelChip.getAttribute("data-chart-model");
      modelChip.addEventListener("mouseenter", function focusSeries() {
        setChartModelFocus(state, model);
      });
      modelChip.addEventListener("mouseleave", function clearSeries() {
        setChartModelFocus(state, "");
      });
      modelChip.addEventListener("focusin", function focusSeriesByKeyboard() {
        setChartModelFocus(state, model);
      });
      modelChip.addEventListener("focusout", function clearSeriesByKeyboard() {
        setChartModelFocus(state, "");
      });
    });
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
        var date = point.getAttribute("data-date");
        var value = point.getAttribute("data-value");
        var labels = [];
        Array.prototype.forEach.call(wrap.querySelectorAll(".usage-point"), function collectOverlapping(candidate) {
          if (
            candidate.getAttribute("data-date") !== date ||
            candidate.getAttribute("data-value") !== value
          ) {
            return;
          }
          var label = candidate.getAttribute("data-model-label") || candidate.getAttribute("data-model");
          if (label && labels.indexOf(label) === -1) {
            labels.push(label);
          }
        });

        setChartModelFocus(state, point.getAttribute("data-model"));
        tooltip.textContent = labels.length > 1
          ? date + text(state, "separator") +
            text(state, "overlappingModels", { count: labels.length }) + "\n" +
            labels.map(function labelCount(label) {
              return label + ": " + text(state, "countTimes", { count: value });
            }).join("\n")
          : (labels[0] || point.getAttribute("data-model")) +
            text(state, "separator") + date + ": " +
            text(state, "countTimes", { count: value });
        tooltip.hidden = false;
        tooltip.style.left = Math.min(Math.max(6, wrapRect.width - tooltip.offsetWidth - 6), Math.max(6, pointX + 8)) + "px";
        tooltip.style.top = Math.max(8, pointY - tooltip.offsetHeight - 8) + "px";
      });
      point.addEventListener("mouseleave", function hide() {
        tooltip.hidden = true;
        setChartModelFocus(state, "");
      });
    });
  }

  function reload(state, options) {
    options = options || {};
    var activeViewInteractionRevision =
      Number(state.activeViewInteractionRevision) || 0;
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
      if (
        (!state.activeViewSettingsLoaded || options.restoreActiveView) &&
        (Number(state.activeViewInteractionRevision) || 0) ===
          activeViewInteractionRevision
      ) {
        state.activeView = normalizeView(settings.activeView);
      }
      state.activeViewSettingsLoaded = true;
      state.statisticsMode = normalizeStatisticsMode(settings.statisticsMode);
      applyPersistedModelSelections(state, settings);
      state.chartType = normalizeChartType(settings.chartType);
      state.themeMode = normalizeThemeMode(settings.themeMode);
      state.sourceModeFilter = normalizeSourceModeFilter(settings.sourceModeFilter);
      state.showLineChart = typeof settings.showLineChart === "boolean"
        ? settings.showLineChart
        : settings.showTrendChart !== false && state.chartType === "line";
      state.showDonutChart = typeof settings.showDonutChart === "boolean"
        ? settings.showDonutChart
        : settings.showTrendChart !== false && state.chartType === "donut";
      state.showTrendChart = state.showLineChart || state.showDonutChart;
      state.showTextStatistics = settings.showTextStatistics !== false;
      state.startDate = dateNoLaterThanToday(settings.startDate) || state.startDate || "";
      // A new install defaults to today. Once the user chooses another valid
      // end date, both entry points restore the same persisted range.
      state.endDate = dateNoLaterThanToday(settings.endDate) ||
        dateNoLaterThanToday(state.endDate) ||
        defaultEndDate();
      state.dateSettingsLoaded = true;
      state.loading = false;
      setStatus(state, "");
      render(state);
    }).catch(function failed(error) {
      state.stats = state.stats || { totals: {}, byDate: {}, models: {}, sessionsByModel: {}, variantsByModel: {}, parametersByModel: {}, events: [] };
      state.loading = false;
      setStatus(state, String((error && error.message) || error || text(state, "loadFailed")), true);
      render(state);
    });

    return core.then(function loadActiveViewData() {
      var openaiStatus = isActiveStatusView(state)
        ? ensureOpenAIStatus(state, true)
        : Promise.resolve(null);
      // The stored active view is known only after core settings load. Start
      // its dependent data afterward so both entry points reopen Status or
      // Export as a complete view rather than displaying an empty shell.
      var exportConversations = state.activeView === "export" &&
        !options.skipExportList &&
        (
          options.forceExportList ||
          !Array.isArray(state.exportConversationList)
        )
        ? loadExportConversationList(state)
        : Promise.resolve(null);
      return Promise.all([openaiStatus, exportConversations]);
    }).then(function done() {
      return state;
    });
  }

  function refreshStatsFromStorage(state) {
    var preserveOperationStatus = Boolean(
      state && (state.statisticsDataBusy || state.exportBusy)
    );
    return loadStats().then(function loaded(stats) {
      state.stats = stats;
      state.loading = false;
      if (!preserveOperationStatus) {
        setStatus(state, "");
      }
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

  function subscribeSettingsStorageChanges(state) {
    var storage = root && root.chrome && root.chrome.storage;
    var onChanged = storage && storage.onChanged;
    if (!onChanged || typeof onChanged.addListener !== "function" || state.settingsStorageSubscribed) {
      return;
    }
    state.settingsStorageSubscribed = true;
    onChanged.addListener(function settingsChanged(changes, areaName) {
      if (areaName !== "local" || !changes || !changes[SETTINGS_KEY]) {
        return;
      }
      var settings = changes[SETTINGS_KEY].newValue || {};
      var nextView = normalizeView(settings.activeView);
      var nextLanguage = normalizeLanguage(settings.language);
      var nextStatisticsMode = normalizeStatisticsMode(settings.statisticsMode);
      var nextChartType = normalizeChartType(settings.chartType);
      var nextThemeMode = normalizeThemeMode(settings.themeMode);
      var nextSourceModeFilter = normalizeSourceModeFilter(settings.sourceModeFilter);
      var nextStartDate = dateNoLaterThanToday(settings.startDate);
      var nextEndDate = dateNoLaterThanToday(settings.endDate) || defaultEndDate();
      var nextShowLineChart = typeof settings.showLineChart === "boolean"
        ? settings.showLineChart
        : settings.showTrendChart !== false && nextChartType === "line";
      var nextShowDonutChart = typeof settings.showDonutChart === "boolean"
        ? settings.showDonutChart
        : settings.showTrendChart !== false && nextChartType === "donut";
      var nextShowTrendChart = nextShowLineChart || nextShowDonutChart;
      var nextShowTextStatistics = settings.showTextStatistics !== false;
      var modelSelectionSettingsChanged =
        persistedModelSelectionKey(settings) !== currentModelSelectionKey(state);
      var viewChanged = nextView !== normalizeView(state.activeView);
      var otherSettingsChanged =
        nextLanguage !== normalizeLanguage(state.language) ||
        nextStatisticsMode !== normalizeStatisticsMode(state.statisticsMode) ||
        nextChartType !== normalizeChartType(state.chartType) ||
        nextThemeMode !== normalizeThemeMode(state.themeMode) ||
        nextSourceModeFilter !== normalizeSourceModeFilter(state.sourceModeFilter) ||
        nextStartDate !== dateNoLaterThanToday(state.startDate) ||
        nextEndDate !== (dateNoLaterThanToday(state.endDate) || defaultEndDate()) ||
         nextShowLineChart !== (state.showLineChart !== false) ||
         nextShowDonutChart !== (state.showDonutChart === true) ||
         nextShowTrendChart !== (state.showTrendChart !== false) ||
         nextShowTextStatistics !== (state.showTextStatistics !== false) ||
         modelSelectionSettingsChanged;
      if (!viewChanged && !otherSettingsChanged) {
        return;
      }
      state.activeView = nextView;
      state.activeViewSettingsLoaded = true;
      state.language = nextLanguage;
      state.statisticsMode = nextStatisticsMode;
      state.chartType = nextChartType;
      state.themeMode = nextThemeMode;
      state.sourceModeFilter = nextSourceModeFilter;
      state.startDate = nextStartDate || state.startDate || "";
      state.endDate = nextEndDate;
      state.showLineChart = nextShowLineChart;
      state.showDonutChart = nextShowDonutChart;
      state.showTrendChart = nextShowTrendChart;
      state.showTextStatistics = nextShowTextStatistics;
      applyPersistedModelSelections(state, settings);
      ensureSelection(state);
      if (viewChanged && isActiveStatusView(state)) {
        ensureOpenAIStatus(state, false);
      }
      if (viewChanged && state.activeView === "export" && !Array.isArray(state.exportConversationList)) {
        loadExportConversationList(state);
      }
      render(state);
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
      ".usage-dashboard button,.usage-dashboard select,.usage-dashboard input{font:inherit}",
      ".usage-dashboard-popup{height:100%;max-height:100%;overflow:auto;scrollbar-gutter:stable;overscroll-behavior:contain;padding-right:0;background:var(--usage-surface-page)}",
      ".usage-dashboard-page{height:100%;max-height:100%;max-width:100%;padding:8px;background:var(--usage-surface-panel);overflow:auto;scrollbar-gutter:stable;overscroll-behavior:contain}",
      ".usage-dashboard-popup.usage-active-status,.usage-dashboard-page.usage-active-status{overflow:hidden;scrollbar-gutter:auto}",
      ".usage-sticky-header{position:sticky;top:0;z-index:20;margin:0 0 8px;padding:0 0 7px;border-bottom:1px solid var(--usage-border-divider);background:var(--usage-surface-panel)}",
      ".usage-dashboard-page .usage-sticky-header{top:-8px;margin:-8px -8px 8px;padding:8px 8px 7px}",
      ".usage-sticky-header .usage-view-tabs{margin:7px 0 0}",
      ".usage-topline{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:30px}",
      ".usage-top-copy{min-width:0}",
      ".usage-title-row{display:flex;align-items:center;flex-wrap:nowrap;gap:5px;min-width:0}",
      ".usage-topline h2{margin:0;font-size:15px;line-height:1.25;font-weight:750;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-top-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}",
      ".usage-header-action{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:30px;min-width:30px;height:30px;margin:0;padding:0;border:0;border-radius:7px;background:transparent;color:var(--usage-text-control);font:600 11px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer;transition:color .16s ease,background .16s ease,transform .16s ease}",
      ".usage-header-action:hover,.usage-settings-menu[open]>.usage-settings-trigger{background:var(--usage-surface-track);color:var(--usage-text-primary)}",
      ".usage-header-action:active{transform:scale(.94)}",
      ".usage-header-action:disabled{cursor:wait;opacity:.78}",
      ".usage-header-action svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
      ".usage-refresh.is-refreshing svg{animation:usage-refresh-spin .68s linear infinite}",
      ".usage-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}",
      ".usage-panel-close{width:30px;min-width:30px;padding:0}",
      ".usage-controls{display:flex;flex-wrap:wrap;gap:4px;margin:5px 0 4px}",
      ".usage-chart-controls{align-items:center}",
      ".usage-date-controls{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;width:100%}",
      ".usage-date-controls label{display:flex;align-items:center;gap:4px;min-width:0;white-space:nowrap}",
      ".usage-date-controls input{width:112px;min-width:0;height:28px;border:1px solid var(--usage-border-control);border-radius:5px;padding:0 1px 0 5px;background:var(--usage-surface-panel);color:var(--usage-text-primary);font-size:11px}",
      ".usage-date-controls input::-webkit-datetime-edit,.usage-date-controls input::-webkit-datetime-edit-fields-wrapper{padding:0}",
      ".usage-date-controls input::-webkit-calendar-picker-indicator{width:14px;height:14px;margin:0;padding:0;cursor:pointer}",
      ".usage-settings-menu{position:relative;flex:0 0 auto}",
      ".usage-settings-menu>summary,.usage-settings-item>summary{list-style:none}",
      ".usage-settings-menu>summary::-webkit-details-marker,.usage-settings-item>summary::-webkit-details-marker{display:none}",
      ".usage-settings-menu>summary::marker,.usage-settings-item>summary::marker{content:\"\"}",
      ".usage-settings-popover{position:absolute;z-index:30;top:calc(100% + 4px);right:0;display:grid;gap:2px;width:236px;padding:5px;border:1px solid var(--usage-border-panel);border-radius:9px;background:var(--usage-surface-panel);box-shadow:0 10px 28px var(--usage-shadow-tooltip);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-5px) scale(.985);transform-origin:top right;transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}",
      ".usage-dashboard-page .usage-settings-popover{right:-36px}",
      ".usage-settings-menu[open]:not(.is-closing)>.usage-settings-popover{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0) scale(1);transition-delay:0s}",
      ".usage-settings-item{position:relative;min-width:0}",
      ".usage-settings-item>summary{display:grid;grid-template-columns:minmax(82px,1fr) 104px 10px;align-items:center;column-gap:6px;min-height:31px;padding:5px 6px;border-radius:6px;color:var(--usage-text-secondary);font-size:11px;line-height:1.35;cursor:pointer}",
      ".usage-settings-item>summary:hover,.usage-settings-item[open]>summary,.usage-settings-item:focus-within>summary{background:var(--usage-surface-track);color:var(--usage-text-primary)}",
      ".usage-settings-category-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1.35;font-weight:650}",
      ".usage-settings-current{width:104px;min-width:0;justify-self:stretch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-muted);font-size:11px;line-height:1.35;text-align:right;font-variant-numeric:tabular-nums}",
      ".usage-settings-current:empty{visibility:hidden}",
      ".usage-settings-arrow{width:10px;font-size:15px;line-height:1;color:var(--usage-text-muted);text-align:center}",
      ".usage-settings-submenu{position:absolute;z-index:31;top:-5px;right:calc(100% - 1px);display:grid;gap:2px;width:176px;padding:5px;border:1px solid var(--usage-border-panel);border-radius:9px;background:var(--usage-surface-panel);box-shadow:0 10px 28px var(--usage-shadow-tooltip);opacity:0;visibility:hidden;pointer-events:none;transform:translateX(5px) scale(.985);transform-origin:top right;transition:opacity .15s ease,transform .15s ease,visibility 0s linear .15s}",
      ".usage-settings-item:not(.is-closing):hover>.usage-settings-submenu,.usage-settings-item:not(.is-closing):focus-within>.usage-settings-submenu,.usage-settings-item[open]:not(.is-closing)>.usage-settings-submenu{opacity:1;visibility:visible;pointer-events:auto;transform:translateX(0) scale(1);transition-delay:0s}",
      ".usage-settings-option{display:grid;grid-template-columns:minmax(0,1fr) 15px;align-items:center;gap:6px;width:100%;min-height:30px;border:0;border-radius:6px;padding:5px 7px;background:transparent;color:var(--usage-text-secondary);text-align:left;cursor:pointer}",
      ".usage-settings-option:hover{background:var(--usage-surface-track);color:var(--usage-text-primary)}",
      ".usage-settings-option.active{color:var(--usage-accent-link);font-weight:700}",
      ".usage-settings-check{visibility:hidden;text-align:center;color:var(--usage-accent-link);font-size:11px}",
      ".usage-settings-option.active .usage-settings-check{visibility:visible}",
      ".usage-settings-action{display:flex;align-items:center;width:100%;min-height:30px;border:0;border-radius:6px;padding:5px 7px;background:transparent;color:var(--usage-text-secondary);text-align:left;cursor:pointer}",
      ".usage-settings-action:hover{background:var(--usage-surface-track);color:var(--usage-text-primary)}",
      ".usage-settings-action:disabled{opacity:.55;cursor:not-allowed}",
      ".usage-settings-data-submenu{width:176px}",
      ".usage-statistics-visibility-option{display:grid!important;grid-template-columns:13px minmax(0,1fr) 15px!important;align-items:center;gap:7px!important;padding:5px 6px;border-radius:5px;color:var(--usage-text-secondary);font-size:11px;cursor:pointer}",
      ".usage-statistics-visibility-option:hover{background:var(--usage-surface-track);color:var(--usage-text-primary)}",
      ".usage-statistics-visibility-option input{width:13px!important;height:13px;margin:0;padding:0!important;border:0;background:transparent;accent-color:var(--usage-accent-link)}",
      ".usage-statistics-visibility-indicator::before{content:\"—\";display:block;text-align:center;color:var(--usage-text-muted);font-style:normal;font-weight:700}",
      ".usage-statistics-visibility-option:has(input:checked) .usage-statistics-visibility-indicator::before{content:\"✓\";color:var(--usage-accent-link)}",
      ".usage-statistics-warning{padding:6px 8px;border:1px solid var(--usage-warning-text);border-radius:7px;background:var(--usage-surface-row-hover);color:var(--usage-warning-text);font-size:11px;line-height:1.4}",
      ".usage-view-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin:7px 0 8px;padding:2px;border:1px solid var(--usage-border-panel);border-radius:6px;background:var(--usage-surface-track)}",
      ".usage-view-tab{border:0;background:transparent;color:var(--usage-text-secondary)}",
      ".usage-view-tab.active{background:var(--usage-surface-panel);color:var(--usage-text-primary);box-shadow:0 1px 1px var(--usage-shadow-active-tab)}",
      ".usage-export-panel{padding:6px 2px 4px;display:flex;flex-direction:column;gap:8px}",
      ".usage-export-title{margin:0;font-size:14px;line-height:1.35;font-weight:700;color:var(--usage-text-primary)}",
      ".usage-export-hint{margin:0;font-size:11px;line-height:1.5;color:var(--usage-text-secondary)}",
      ".usage-export-actions{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;padding:3px;border:1px solid var(--usage-border-panel);border-radius:8px;background:var(--usage-surface-track)}",
      ".usage-export-btn{height:30px;min-width:0;border:1px solid transparent;background:transparent;color:var(--usage-text-primary);border-radius:5px;padding:0 4px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .12s ease,border-color .12s ease,color .12s ease}",
      ".usage-export-btn:hover{background:var(--usage-surface-panel);border-color:var(--usage-border-control);color:var(--usage-accent-link)}",
      ".usage-export-btn:focus-visible{outline:2px solid var(--usage-accent-strong,var(--usage-text-secondary));outline-offset:2px}",
      ".usage-export-btn:active{transform:translateY(1px)}",
      ".usage-export-btn:disabled,.usage-export-mini:disabled{opacity:.55;cursor:not-allowed;transform:none}",
      ".usage-export-status{margin:2px 0 0;font-size:11px;line-height:1.5;color:var(--usage-text-secondary);min-height:14px}",
      ".usage-export-status.error{color:var(--usage-error-status-text,#dc2626)}",
      ".usage-export-warning{color:var(--usage-warning-text,#b45309)}",
      ".usage-export-selectbar{display:grid;grid-template-columns:minmax(96px,1fr) 72px 72px auto;align-items:center;gap:5px}",
      ".usage-export-search{width:100%;min-width:0;height:28px;border:1px solid var(--usage-border-control);border-radius:6px;padding:0 8px;background:var(--usage-surface-panel);color:var(--usage-text-primary);font-size:11px}",
      ".usage-export-mini{display:inline-flex;align-items:center;justify-content:center;width:72px;min-height:28px;border:1px solid var(--usage-border-panel);background:transparent;color:var(--usage-text-secondary);border-radius:6px;padding:0 8px;font-size:11px;cursor:pointer;white-space:nowrap}",
      ".usage-export-mini:hover{background:var(--usage-surface-track)}",
      ".usage-export-selcount{justify-self:end;margin-left:0;font-size:11px;color:var(--usage-text-muted);white-space:nowrap}",
      ".usage-export-conv-list{max-height:240px;overflow:auto;scrollbar-gutter:stable;border:1px solid var(--usage-border-panel);border-radius:6px;padding:4px;display:flex;flex-direction:column;gap:2px}",
      ".usage-export-current{padding-bottom:3px;border-bottom:1px solid var(--usage-border-divider)}",
      ".usage-export-group{border-bottom:1px solid var(--usage-border-divider);padding:2px 0}",
      ".usage-export-group:last-child{border-bottom:0}",
      ".usage-export-group summary{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:4px;color:var(--usage-text-secondary);font-size:11px;font-weight:700;cursor:pointer;list-style:none}",
      ".usage-export-group summary::-webkit-details-marker{display:none}",
      ".usage-export-group summary::before{content:\"▸\";flex:0 0 auto;color:var(--usage-text-muted);transition:transform .12s ease}",
      ".usage-export-group[open] summary::before{transform:rotate(90deg)}",
      ".usage-export-group-check{flex:0 0 auto;width:13px;height:13px;margin:0;accent-color:var(--usage-accent-primary);cursor:pointer}",
      ".usage-export-group summary span{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-export-group summary small{flex:0 0 auto;color:var(--usage-text-muted);font-weight:600}",
      ".usage-export-group:not([open])>.usage-export-group-list{display:none}",
      ".usage-export-group-list{display:flex;flex-direction:column;gap:2px;padding-left:8px}",
      ".usage-export-conv{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:4px;cursor:pointer;font-size:12px}",
      ".usage-export-conv:hover{background:var(--usage-surface-track)}",
      ".usage-export-conv-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:1px}",
      ".usage-export-conv-copy b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--usage-text-primary)}",
      ".usage-export-conv-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--usage-text-muted)}",
      ".usage-export-conv input{flex:0 0 auto}",
      ".usage-export-conv-badge{margin-left:auto;flex:0 0 auto;border:1px solid var(--usage-border-divider);border-radius:999px;padding:1px 5px;color:var(--usage-text-muted);font-size:10px}",
      ".usage-export-conv-badge.current{border-color:var(--usage-accent-link);color:var(--usage-accent-link)}",
      ".usage-export-cancel{align-self:flex-start;border:1px solid var(--usage-error-status-text,#dc2626);border-radius:6px;padding:5px 9px;background:transparent;color:var(--usage-error-status-text,#dc2626);font-size:11px;font-weight:700;cursor:pointer}",
      ".usage-export-cancel:hover{background:var(--usage-error-surface,rgba(220,38,38,.08))}",
      ".usage-export-cancel:disabled{opacity:.55;cursor:not-allowed}",
      // —— 视觉优化:键盘焦点可见、交互态、溢出处理、减少动画 ——
      ".usage-dashboard button:focus-visible,.usage-dashboard select:focus-visible,.usage-dashboard input:focus-visible{outline:2px solid var(--usage-accent-link,#10a37f);outline-offset:1px}",
      ".usage-view-tab{cursor:pointer;border-radius:5px;transition:background .12s ease,color .12s ease}",
      ".usage-view-tab:hover:not(.active){background:var(--usage-surface-panel);color:var(--usage-text-primary)}",
      ".usage-date-controls input:hover{border-color:var(--usage-accent-link,var(--usage-text-secondary))}",
      ".usage-date-controls input:focus{outline:none;border-color:var(--usage-accent-link,#10a37f);box-shadow:0 0 0 2px var(--usage-focus-ring,rgba(16,163,127,.25))}",
      ".usage-date-controls input:invalid{border-color:var(--usage-error-status-text,#dc2626)}",
      ".usage-model-chip{cursor:pointer;max-width:100%;transition:border-color .12s ease,background .12s ease}",
      ".usage-model-chip:hover{border-color:var(--usage-accent-link,var(--usage-text-secondary));background:var(--usage-surface-track)}",
      ".usage-empty{padding:10px 8px;text-align:center;color:var(--usage-text-muted);font-size:12px}",
      "@media (prefers-reduced-motion:reduce){.usage-dashboard *{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}",
      ".usage-models{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0 8px 7px}",
      ".usage-model-chip{display:flex;align-items:center;gap:5px;min-height:24px;border:1px solid var(--usage-border-panel);border-radius:999px;padding:2px 6px;background:transparent;font-size:11px}",
      ".usage-model-chip::before{content:\"\";width:6px;height:6px;border-radius:999px;background:var(--chip);flex:0 0 auto}",
      ".usage-model-chip input{width:13px;height:13px;margin:0;accent-color:var(--chip)}",
      ".usage-model-chip span,.usage-model-chip b{font-size:11px;line-height:1.3;font-weight:650}",
      ".usage-model-chip b{color:var(--usage-accent-link)}",
      ".usage-model-chip:has(input:not(:checked)){opacity:.62}",
      ".usage-model-chip:has(input:checked){background:var(--usage-surface-chip);border-color:var(--chip)}",
      ".usage-chart-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px;padding:0 8px 7px}",
      ".usage-chart-legend-row{appearance:none;display:grid;grid-template-columns:10px minmax(0,1fr) auto 43px;align-items:center;gap:5px;min-width:0;min-height:29px;padding:3px 5px;border:0;border-radius:6px;background:transparent;color:var(--usage-text-secondary);text-align:left;cursor:pointer;transition:background .15s ease,opacity .15s ease}",
      ".usage-chart-legend-toggle{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}",
      ".usage-chart-legend-row:hover,.usage-chart-legend-row:focus-visible{background:var(--usage-surface-row-hover)}",
      ".usage-chart-legend-row:focus-within{background:var(--usage-surface-row-hover);outline:2px solid var(--usage-accent-link);outline-offset:-1px}",
      ".usage-chart-legend-row i{width:8px;height:8px;border:2px solid var(--series);border-radius:999px;background:transparent;box-shadow:none;transition:background .15s ease,opacity .15s ease}",
      ".usage-chart-legend-row.active i{background:var(--series)}",
      ".usage-chart-legend-row:not(.active){opacity:.58}",
      ".usage-chart-legend-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:1.35;font-weight:700}",
      ".usage-chart-legend-row b{color:var(--series);font-size:15px;line-height:1.35;font-weight:750;font-variant-numeric:tabular-nums}",
      ".usage-chart-legend-row small{min-width:43px;text-align:right;color:var(--usage-text-muted);font-size:14px;line-height:1.35;font-weight:650;font-variant-numeric:tabular-nums}",
      ".usage-view-panel{min-height:0;animation:usage-panel-in .16s ease-out both}",
      ".usage-chart-wrap{position:relative;border:1px solid var(--usage-border-panel);border-radius:7px;background:var(--usage-surface-panel);margin:3px 0 5px;overflow:hidden}",
      ".usage-chart-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:8px 8px 6px}",
      ".usage-chart-head strong{font-size:14px;line-height:1.35;font-weight:700;color:var(--usage-text-primary)}",
      ".usage-chart-head small{font-size:9px;line-height:1.3;font-weight:650;color:var(--usage-text-muted)}",
      ".usage-donut-wrap{overflow:visible}",
      ".usage-donut-layout{display:grid;grid-template-columns:minmax(142px,44%) minmax(0,1fr);align-items:center;gap:8px;padding:2px 8px 10px}",
      ".usage-donut{display:block;width:100%;max-width:164px;height:auto;justify-self:center;overflow:visible}",
      ".usage-donut-layout>.usage-chart-legend{grid-template-columns:minmax(0,1fr);align-content:center;padding:0}",
      ".usage-donut-track{stroke:var(--usage-surface-track)}",
      ".usage-donut-slice{cursor:pointer;opacity:.96;transition:opacity .16s ease,stroke-width .16s ease,filter .16s ease;animation:usage-donut-draw .52s cubic-bezier(.22,.72,.25,1) var(--usage-donut-delay,0s) both}",
      ".usage-donut-slice:hover,.usage-donut-slice:focus-visible,.usage-donut-slice[data-effort-active=\"true\"]{opacity:1;stroke-width:32;filter:drop-shadow(0 2px 3px var(--usage-shadow-accent));outline:none}",
      ".usage-donut-total{fill:var(--usage-text-primary);font-size:32px;font-weight:800;font-variant-numeric:tabular-nums}",
      ".usage-donut-center-label{fill:var(--usage-text-muted);font-size:12px;font-weight:700}",
      ".usage-donut-legend{display:grid;align-content:center;gap:2px;min-width:0}",
      ".usage-donut-legend-row{display:grid;grid-template-columns:9px minmax(0,1fr) auto auto;align-items:center;gap:5px;min-height:27px;padding:3px 4px;border-radius:6px;color:var(--usage-text-secondary)}",
      ".usage-donut-legend-row[role=\"button\"]{cursor:pointer}",
      ".usage-donut-legend-row[role=\"button\"]:hover,.usage-donut-legend-row[role=\"button\"]:focus-visible{background:var(--usage-surface-row-hover);outline:2px solid var(--usage-accent-link);outline-offset:-1px}",
      ".usage-donut-legend-row[data-effort-active=\"true\"]{background:var(--usage-surface-row-hover);box-shadow:inset 0 0 0 1px var(--usage-border-panel)}",
      ".usage-donut-legend-row i{width:8px;height:8px;border-radius:999px;background:var(--slice);box-shadow:0 0 0 1px var(--usage-border-panel)}",
      ".usage-donut-legend-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:1.35;font-weight:700}",
      ".usage-donut-legend-row b{font-size:15px;line-height:1.35;font-weight:750;color:var(--slice);font-variant-numeric:tabular-nums}",
      ".usage-donut-legend-row small{min-width:43px;text-align:right;font-size:14px;line-height:1.35;font-weight:650;color:var(--usage-text-muted);font-variant-numeric:tabular-nums}",
      ".usage-donut-back{border:0;background:transparent;color:var(--usage-accent-link);padding:2px 0;font:inherit;font-size:10px;font-weight:700;cursor:pointer}",
      ".usage-donut-back:hover{color:var(--usage-accent-link-hover);text-decoration:underline}",
      ".usage-donut-back:focus-visible{outline:2px solid var(--usage-accent-link);outline-offset:2px;border-radius:3px}",
      ".usage-donut-warning{margin:0 8px 6px;padding:6px 7px;border-radius:6px;background:var(--usage-surface-chip);color:var(--usage-warning-text);font-size:10px;line-height:1.4}",
      ".usage-donut-models{padding-bottom:5px}",
      ".usage-chart{display:block;width:100%;height:auto}",
      ".usage-grid{stroke:var(--usage-border-chart-grid);stroke-width:1;stroke-opacity:1}",
      ".usage-axis{fill:var(--usage-text-muted);font-size:9px;font-weight:500}",
      ".usage-axis-label{font-size:9px;font-weight:650}",
      ".usage-axis-date{font-size:9px}",
      ".usage-axis-y{font-variant-numeric:tabular-nums}",
      ".usage-series{opacity:1}",
      ".usage-line-mask{stroke:#fff;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;animation:usage-line-reveal .56s linear forwards}",
      ".usage-line{stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:var(--usage-line-dash,none);transition:opacity .12s ease}",
      ".usage-point{stroke:var(--usage-chart-point-stroke);stroke-width:1.25;cursor:pointer;animation:usage-point-in .18s ease-out var(--usage-point-delay,.06s) both;transition:r .16s ease,opacity .12s ease}",
      ".usage-point:hover{r:6}",
      ".usage-line[data-focus-dimmed=\"true\"],.usage-point[data-focus-dimmed=\"true\"]{opacity:.12}",
      ".usage-line-focus{pointer-events:none;opacity:0;stroke-linecap:round;stroke-linejoin:round;transition:opacity .1s ease}",
      ".usage-line-focus[data-focus-active=\"true\"]{opacity:1}",
      ".usage-line-focus-halo{stroke:var(--usage-surface-panel);stroke-width:7}",
      ".usage-line-focus-color{stroke-width:3.5}",
      ".usage-overlap-ring{fill:none;stroke:var(--usage-text-muted);stroke-width:1.2;stroke-dasharray:2 2;pointer-events:none}",
      ".usage-model-chip[data-focus-active=\"true\"]{box-shadow:0 0 0 1px var(--chip)}",
      ".usage-tooltip{position:absolute;z-index:2;max-width:min(260px,calc(100% - 12px));padding:6px 8px;border-radius:7px;background:var(--usage-tooltip-surface);color:var(--usage-text-inverse);font-size:12px;white-space:pre-line;pointer-events:none;box-shadow:0 8px 24px var(--usage-shadow-tooltip)}",
      ".usage-text-panel{min-width:0}",
      ".usage-count-panel .usage-text-panel{display:grid;gap:6px}",
      ".usage-model-text-list{display:grid;gap:6px;margin-top:6px}",
      ".usage-count-list{display:grid;gap:0;margin-top:2px;border-top:1px solid var(--usage-border-divider)}",
      ".usage-count-record{border:0;border-bottom:1px solid var(--usage-border-divider);border-radius:0;background:transparent;overflow:visible}",
      ".usage-count-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px;width:100%;padding:5px 0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;list-style:none}",
      ".usage-count-row::-webkit-details-marker{display:none}",
      ".usage-count-row::marker{content:\"\"}",
      ".usage-mapped-record>.usage-count-row{cursor:pointer}",
      ".usage-mapped-record[open]>.usage-count-row{padding-bottom:7px}",
      ".usage-count-details{display:grid;gap:5px;padding:0 0 8px 12px}",
      ".usage-count-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-primary)}",
      ".usage-count-numbers{text-align:right}",
      ".usage-count-numbers b{display:block;color:var(--usage-accent-link)}",
      ".usage-count-numbers small{display:block;color:var(--usage-text-muted)}",
      ".usage-count-features{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}",
      ".usage-count-features span{display:inline-flex;gap:4px;align-items:center;min-height:20px;padding:2px 6px;border-radius:999px;background:var(--usage-surface-chip);color:var(--usage-text-body-subtle)}",
      ".usage-count-features span,.usage-count-features b{font-size:11px;line-height:1.35;font-weight:600}",
      ".usage-count-features b{color:var(--usage-accent-link)}",
      ".usage-internal-request{display:grid;gap:0;padding:0;border-bottom:1px solid var(--usage-border-divider)}",
      ".usage-internal-request-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px;padding:5px 0}",
      ".usage-internal-model-copy{display:grid;gap:1px;min-width:0}",
      ".usage-internal-request-head .usage-internal-model-copy small{color:var(--usage-text-muted)}",
      ".usage-internal-request-head .usage-internal-model-copy code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-primary)}",
      ".usage-internal-count{color:var(--usage-accent-link);white-space:nowrap}",
      ".usage-internal-response-section{display:grid;gap:1px;padding:3px 0 8px 12px}",
      ".usage-internal-response-heading{color:var(--usage-text-muted)}",
      ".usage-internal-responses{display:grid;gap:0}",
      ".usage-internal-response{display:grid;gap:4px;padding:3px 0 4px;border:0;border-top:1px solid var(--usage-border-divider);border-radius:0;background:transparent}",
      ".usage-internal-response:first-child{border-top:0}",
      ".usage-internal-response-summary{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:5px;cursor:pointer;list-style:none}",
      ".usage-internal-response-summary::-webkit-details-marker{display:none}",
      ".usage-internal-response-summary::marker{content:\"\"}",
      ".usage-internal-response-summary>.usage-count-features{margin-top:0}",
      ".usage-internal-response[open]>.usage-internal-response-summary{padding-bottom:5px;border-bottom:1px solid var(--usage-border-divider)}",
      ".usage-internal-response-model-row{display:block;min-height:21px}",
      ".usage-relation-values.usage-internal-response-value{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:4px 7px}",
      ".usage-internal-response-value>.usage-internal-response-copy{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 7px;min-width:0}",
      ".usage-internal-response-value code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-primary)}",
      ".usage-internal-efforts-inline{display:inline-flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;min-width:0}",
      ".usage-internal-effort-label{font-size:11px;line-height:1.35;font-weight:650;color:var(--usage-text-muted)}",
      ".usage-internal-efforts-inline>span{display:inline-flex;align-items:baseline;gap:4px;color:var(--usage-text-secondary)}",
      ".usage-effort-token{border-radius:5px;padding:1px 3px;cursor:pointer;transition:background .15s ease,box-shadow .15s ease}",
      ".usage-effort-token:hover,.usage-effort-token:focus-visible,.usage-effort-token[data-effort-active=\"true\"]{background:var(--usage-surface-chip);box-shadow:0 0 0 1px var(--usage-border-panel);outline:none}",
      ".usage-internal-subcount,.usage-subcount{color:var(--usage-accent-link);font-variant-numeric:tabular-nums}",
      ".usage-internal-subcount{align-self:start;white-space:nowrap}",
      ".usage-count-row strong,.usage-count-numbers b,.usage-internal-request-head .usage-internal-model-copy code,.usage-internal-count{font-size:13px;line-height:1.35;font-weight:750}",
      ".usage-internal-response-value code,.usage-internal-efforts-inline>span,.usage-internal-efforts-inline b,.usage-internal-subcount,.usage-subcount{font-size:12px;line-height:1.4;font-weight:650}",
      ".usage-internal-request-head .usage-internal-model-copy small,.usage-internal-response-heading,.usage-record-label,.usage-relation-model small{font-size:11px;line-height:1.35;font-weight:650}",
      ".usage-count-row strong,.usage-internal-request-head .usage-internal-model-copy code,.usage-internal-response-value code,.usage-relation-head code{font-family:system-ui,sans-serif!important;font-style:normal;letter-spacing:normal}",
      ".usage-model-record{border-top:1px solid var(--usage-border-divider);padding-top:6px}",
      ".usage-model-record:first-child{border-top:0;padding-top:0}",
      ".usage-text-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;border-top:1px solid var(--usage-border-divider);padding:5px 0}",
      ".usage-model-record>.usage-text-row,.usage-text-row:first-child{border-top:0}",
      ".usage-text-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-text-row small{display:block;color:var(--usage-text-muted);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-text-count{text-align:right}",
      ".usage-text-count b{display:block;color:var(--usage-accent-link)}",
      ".usage-text-row strong,.usage-text-count b{font-size:13px;line-height:1.35;font-weight:750}",
      ".usage-record-summary{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;margin:0;padding:3px 0 0;border-top:0}",
      ".usage-model-relations{display:grid;gap:7px}",
      ".usage-model-relation{display:grid;gap:5px;padding:7px;border:1px solid var(--usage-border-panel);border-radius:7px;background:var(--usage-surface-row-hover)}",
      ".usage-model-relation.legacy-unlinked{border-style:dashed}",
      ".usage-relation-summary{display:grid;gap:5px;min-width:0;cursor:pointer;list-style:none}",
      ".usage-relation-summary::-webkit-details-marker{display:none}",
      ".usage-relation-summary::marker{content:\"\"}",
      ".usage-relation-summary:focus-visible{outline:2px solid var(--usage-accent-link);outline-offset:2px;border-radius:4px}",
      ".usage-model-relation[open]>.usage-relation-summary{padding-bottom:5px;border-bottom:1px solid var(--usage-border-divider)}",
      ".usage-relation-warning{display:block;margin:0;color:var(--usage-warning-text);font-size:10px;line-height:1.45}",
      ".usage-relation-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}",
      ".usage-relation-head strong{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;flex:1 1 auto;min-width:0;gap:5px;font-size:11px}",
      ".usage-relation-head strong.same-model{grid-template-columns:minmax(0,1fr)}",
      ".usage-relation-model{display:grid;gap:1px;min-width:0}",
      ".usage-relation-model small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-muted)}",
      ".usage-relation-head code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-relation-head i{font-style:normal;color:var(--usage-text-muted)}",
      ".usage-relation-head>span{flex:0 0 auto;color:var(--usage-accent-link)}",
      ".usage-relation-head code,.usage-relation-head>span{font-size:12px;line-height:1.4;font-weight:650}",
      ".usage-relation-dimension{display:grid;grid-template-columns:72px minmax(0,1fr);gap:8px;align-items:baseline;min-width:0}",
      ".usage-relation-efforts-only{grid-template-columns:minmax(0,1fr)}",
      ".usage-relation-values{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;min-width:0}",
      ".usage-relation-values>span{display:inline-flex;align-items:baseline;gap:4px;color:var(--usage-text-secondary)}",
      ".usage-relation-values>span,.usage-relation-values b{font-size:12px;line-height:1.4;font-weight:650}",
      ".usage-relation-values b{color:var(--usage-text-primary)}",
      ".usage-relation-values b.usage-effort-max{color:var(--usage-effort-max)}",
      ".usage-relation-values b.usage-effort-extended{color:var(--usage-effort-extended)}",
      ".usage-relation-values b.usage-effort-high{color:var(--usage-effort-high)}",
      ".usage-relation-values b.usage-effort-standard{color:var(--usage-effort-standard)}",
      ".usage-relation-values b.usage-effort-medium{color:var(--usage-effort-medium)}",
      ".usage-relation-values b.usage-effort-low{color:var(--usage-effort-low)}",
      ".usage-relation-values b.usage-effort-min{color:var(--usage-effort-min)}",
      ".usage-relation-values b.usage-effort-none{color:var(--usage-effort-none)}",
      ".usage-relation-values b.usage-effort-unknown{color:var(--usage-effort-unknown)}",
      ".usage-relation-conversation-list,.usage-count-details{display:grid;gap:4px;max-height:0;overflow:hidden;opacity:0;transform:translateY(-4px);transition:max-height .24s ease,opacity .18s ease,transform .2s ease,padding .2s ease}",
      ".usage-relation-conversation-list{padding:0}",
      ".usage-count-details{padding:0 0 0 12px}",
      ".usage-internal-response[open]>.usage-relation-conversation-list,.usage-model-relation[open]>.usage-relation-conversation-list,.usage-count-record[open]>.usage-count-details{max-height:520px;opacity:1;transform:translateY(0)}",
      ".usage-internal-response[open]>.usage-relation-conversation-list,.usage-model-relation[open]>.usage-relation-conversation-list{padding-top:5px}",
      ".usage-internal-response[open]>.usage-relation-conversation-list,.usage-model-relation[open]>.usage-relation-conversation-list,.usage-count-record[open]>.usage-count-details{overflow:auto;scrollbar-gutter:stable}",
      ".usage-count-record[open]>.usage-count-details{padding-bottom:8px}",
      ".usage-relation-conversation{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px;align-items:start}",
      ".usage-relation-conversation[hidden],.usage-record-session-row[hidden]{display:none!important}",
      ".usage-source-mode-list{display:flex;flex-wrap:wrap;gap:3px;align-items:flex-start}",
      ".usage-source-mode{display:inline-flex;align-items:center;justify-content:center;min-width:38px;border:1px solid var(--usage-border-divider);border-radius:999px;padding:1px 5px;color:var(--usage-text-muted);font-size:9px}",
      ".usage-source-mode.work{border-color:var(--usage-accent-link);color:var(--usage-accent-link)}",
      ".usage-param-combos,.usage-session-summary,.usage-variant-list{display:grid;grid-template-columns:72px minmax(0,1fr);gap:4px 8px;align-items:start}",
      ".usage-session-block{padding-top:0}",
      ".usage-record-label{color:var(--usage-text-muted);white-space:nowrap}",
      ".usage-param-combos>.usage-record-label,.usage-variant-list>.usage-record-label{grid-row:1 / -1;align-self:start}",
      ".usage-param-row,.usage-variant-row{grid-column:2;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:6px;min-width:0;padding:2px 0;transition:background .14s ease}",
      ".usage-param-row.latest{grid-template-columns:minmax(0,1fr)}",
      ".usage-param-row:hover,.usage-variant-row:hover{background:var(--usage-surface-row-hover)}",
      ".usage-param-row b,.usage-variant-row b{color:var(--usage-accent-link-hover);white-space:nowrap}",
      ".usage-param-row span,.usage-variant-row span{color:var(--usage-text-body-subtle);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".usage-param-row b,.usage-param-row span,.usage-variant-row b,.usage-variant-row span{font-size:11px;line-height:1.4;font-weight:650}",
      ".usage-record-sessions{display:grid;gap:0;margin:0 0 4px 0;padding:0;list-style:none}",
      ".usage-record-session-row{display:grid;grid-template-columns:16px minmax(0,1fr);align-items:baseline;gap:6px;min-width:0;padding:0;border:0;background:transparent;line-height:17px}",
      ".usage-session-titlebar{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:6px;min-width:0}",
      ".usage-session-title{display:flex;align-items:center;gap:6px;min-width:0;font-weight:700;line-height:1.25}",
      ".usage-session-title input{flex:0 0 auto;width:13px;height:13px;margin:0;accent-color:var(--usage-accent-primary)}",
      ".usage-index-number{color:var(--usage-text-disabled);font-size:11px;line-height:17px;text-align:right;font-variant-numeric:tabular-nums}",
      ".usage-index-content{display:flex;align-items:baseline;gap:6px;min-width:0;overflow:hidden}",
      ".usage-index-link{display:block;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--usage-text-primary);text-decoration:none;font-size:12px;line-height:1.4;font-weight:650}",
      ".usage-internal-response .usage-index-link{font-size:11px;line-height:1.35;font-weight:600}",
      ".usage-index-link.pending{color:var(--usage-text-secondary)}",
      ".usage-index-link:hover{color:var(--usage-accent-link-hover);text-decoration:underline}",
      ".usage-session-title b{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}",
      ".usage-session-action{display:inline-flex;align-items:center;min-height:22px;padding:0;color:var(--usage-accent-link);background:transparent;text-decoration:none;font-size:11px;font-weight:700;white-space:nowrap}",
      ".usage-index-content small{flex:0 0 auto;margin-top:0;color:var(--usage-text-muted);font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}",
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
      ".usage-active-status .usage-view-tabs{margin-bottom:5px}",
      ".usage-active-status .usage-openai-status{gap:4px}",
      ".usage-active-status .usage-openai-hero{padding-bottom:5px}",
      ".usage-active-status .usage-openai-component{min-height:27px;padding:4px 0}",
      ".usage-status-compact .usage-sticky-header{margin-bottom:5px;padding-bottom:5px}",
      ".usage-dashboard-page.usage-status-compact .usage-sticky-header{margin-bottom:5px;padding-bottom:5px}",
      ".usage-status-compact .usage-view-tabs{margin-top:5px;margin-bottom:3px}",
      ".usage-status-compact .usage-openai-status{gap:3px}",
      ".usage-status-compact .usage-openai-hero{padding-bottom:4px}",
      ".usage-status-compact .usage-openai-component{min-height:24px;padding:2px 0}",
      ".usage-status-columns .usage-openai-components{grid-template-columns:repeat(var(--usage-status-columns,2),minmax(0,1fr));column-gap:10px}",
      ".usage-status-columns .usage-openai-component{min-width:0}",
      ".usage-status-dense .usage-openai-components{column-gap:8px}",
      ".usage-status-dense .usage-openai-component{min-height:21px;padding:1px 0;gap:4px}",
      ".usage-status-dense .usage-openai-component strong{font-size:10px}",
      ".usage-status-dense .usage-openai-badge{min-height:18px;padding:1px 5px;font-size:9px}",
      ".usage-status-ultra .usage-openai-components{column-gap:6px}",
      ".usage-status-ultra .usage-openai-component{min-height:18px;padding:0;gap:3px}",
      ".usage-status-ultra .usage-openai-component strong{font-size:10px;line-height:1.2}",
      ".usage-status-ultra .usage-openai-component small{display:none}",
      ".usage-status-ultra .usage-openai-badge{min-height:16px;padding:0 4px;font-size:9px}",
      ".usage-status-ultra .usage-openai-hero>div{display:flex;align-items:baseline;gap:6px;min-width:0}",
      ".usage-status-ultra .usage-openai-hero strong,.usage-status-ultra .usage-openai-hero small{margin-top:0}",
      ".usage-status-scaled .usage-openai-status{font-size:calc(10px * var(--usage-status-font-compensation,1))}",
      ".usage-status-scaled .usage-openai-hero strong{font-size:calc(14px * var(--usage-status-font-compensation,1))}",
      ".usage-status-scaled .usage-openai-hero small{font-size:calc(10px * var(--usage-status-font-compensation,1))}",
      ".usage-status-scaled .usage-openai-component strong{font-size:calc(10px * var(--usage-status-font-compensation,1))}",
      ".usage-status-scaled .usage-openai-badge{font-size:calc(9px * var(--usage-status-font-compensation,1))}",
      ".usage-openai-error{display:grid;gap:4px;padding:10px;border:1px solid var(--usage-border-error);border-radius:8px;background:var(--usage-error-surface);color:var(--usage-error-text-strong)}",
      ".usage-openai-error small{color:var(--usage-error-text)}",
      ".usage-status{min-height:17px;margin-top:6px;color:var(--usage-text-muted)}",
      ".usage-status:empty{display:none}",
      ".usage-status.error{color:var(--usage-error-status-text)}",
      ".usage-empty{color:var(--usage-text-muted);padding:8px 0}",
      ".usage-skeleton{display:grid;gap:6px;width:100%;padding:2px 0}",
      ".usage-skeleton i{display:block;height:24px;border-radius:7px;background:linear-gradient(90deg,var(--usage-skeleton-start),var(--usage-skeleton-middle),var(--usage-skeleton-start));background-size:200% 100%;animation:usage-skeleton 1s linear infinite}",
      "@keyframes usage-line-reveal{to{stroke-dashoffset:0}}",
      "@keyframes usage-refresh-spin{to{transform:rotate(360deg)}}",
      "@keyframes usage-donut-draw{from{opacity:0;stroke-dasharray:0 100}to{opacity:.96;stroke-dasharray:var(--usage-donut-size) var(--usage-donut-rest)}}",
      "@keyframes usage-point-in{from{opacity:0}to{opacity:1}}",
      "@keyframes usage-panel-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}",
      "@keyframes usage-skeleton{from{background-position:100% 0}to{background-position:-100% 0}}",
      "@media (max-width:390px){.usage-settings-submenu{top:0;right:0;width:100%;transform:translateX(5px) scale(.985)}.usage-settings-item:not(.is-closing):hover>.usage-settings-submenu,.usage-settings-item:not(.is-closing):focus-within>.usage-settings-submenu,.usage-settings-item[open]:not(.is-closing)>.usage-settings-submenu{transform:translateX(0) scale(1)}}",
      "@media (max-width:380px){.usage-donut-layout{grid-template-columns:124px minmax(0,1fr);gap:5px;padding-left:5px;padding-right:5px}.usage-donut-legend-row{gap:4px;padding-left:2px;padding-right:2px}.usage-donut-legend-row small{min-width:34px}}",
      "@media (prefers-reduced-motion:reduce){.usage-view-panel,.usage-line-mask,.usage-refresh.is-refreshing svg,.usage-point,.usage-donut-slice,.usage-skeleton i{animation:none}.usage-line-mask{stroke-dashoffset:0}.usage-point{opacity:1}.usage-point,.usage-donut-slice,.usage-param-row,.usage-variant-row,.usage-settings-popover,.usage-settings-submenu,.usage-relation-conversation-list,.usage-count-details{transition:none}}"
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
      activeViewSettingsLoaded: false,
      activeViewInteractionRevision: 0,
      sourceModeFilter: "all",
      statisticsMode: DEFAULT_STATISTICS_MODE,
      chartType: DEFAULT_CHART_TYPE,
      themeMode: DEFAULT_THEME_MODE,
      donutModel: "",
      showLineChart: true,
      showDonutChart: false,
      showTrendChart: true,
      showTextStatistics: true,
      settingsMenuOpen: false,
      settingsSubmenu: "",
      startDate: "",
      endDate: "",
      dateSettingsLoaded: false,
      selectedModels: {},
      knownModels: {},
      modelSelectionInitialized: false,
      selectedModelsByStatisticsMode: { mapped: {}, internal: {} },
      knownModelsByStatisticsMode: { mapped: {}, internal: {} },
      modelSelectionInitializedByMode: {},
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
      exportConversationList: null,
      exportConversationListRequest: null,
      exportConversationListGeneration: 0,
      exportConversationMeta: null,
      exportSelected: {},
      exportSelectAllMode: false,
      exportSelectionInitialized: false,
      exportSearch: "",
      exportBusy: false,
      exportCancelRequested: false,
      exportStatusText: "",
      exportStatusError: false,
      statisticsDataBusy: false,
      refreshing: false,
      stats: { totals: {}, byDate: {}, models: {}, sessionsByModel: {}, variantsByModel: {}, parametersByModel: {}, events: [] }
    };
    subscribePageThemeChanges(state);
    subscribePopupThemeChanges(state);
    subscribeStatsStorageChanges(state);
    subscribeSettingsStorageChanges(state);
    reload(state);
    return {
      reload: function reloadHandle(options) {
        return reload(state, options);
      },
      state: state
    };
  }

  return {
    chartSeries: chartSeries,
    flattenSessions: flattenSessions,
    init: init,
    modelRequestModels: modelRequestModels,
    modelRelations: modelRelations,
    modelVariants: modelVariants,
    parameterCombinations: parameterCombinations,
    renderActiveView: renderActiveView,
    renderDateControls: renderDateControls,
    renderSettingsMenu: renderSettingsMenu,
    renderOpenAIStatusPanel: renderOpenAIStatusPanel,
    renderModelTextList: renderModelTextList,
    _test: {
      detectPageTheme: detectPageTheme,
      render: render,
      bindEvents: bindEvents,
      ensureSelection: ensureSelection,
      chartSeriesForState: chartSeriesForState,
      internalRequestGroups: internalRequestGroups,
      normalizeStatisticsMode: normalizeStatisticsMode,
      normalizeThemeMode: normalizeThemeMode,
      resolveDashboardTheme: resolveDashboardTheme,
      renderModelCountRows: renderModelCountRows,
      renderStatisticsCompletenessWarning: renderStatisticsCompletenessWarning,
      statisticsTotalsInRange: statisticsTotalsInRange,
      statisticsColorMap: statisticsColorMap,
      applyPopupThemeVariables: applyPopupThemeVariables,
      applyExportConversationList: applyExportConversationList,
      buildExportArtifacts: buildExportArtifacts,
      downloadConversationArchiveByIds: downloadConversationArchiveByIds,
      exportTargetPlan: exportTargetPlan,
      finishConversationArchive: finishConversationArchive,
      localExportDateStamp: localExportDateStamp,
      normalizeConversationCollection: normalizeConversationCollection,
      dateNoLaterThanToday: dateNoLaterThanToday,
      enrichConversationWithUsageEvents: enrichConversationWithUsageEvents,
      exportConversationMatchesSearch: exportConversationMatchesSearch,
      buildStatisticsCsv: buildStatisticsCsv,
      exportStatisticsData: exportStatisticsData,
      importStatisticsBackup: importStatisticsBackup,
      readStatisticsBackupFile: readStatisticsBackupFile,
      statisticsDataDateStamp: statisticsDataDateStamp,
      modelRelations: modelRelations,
      reasoningEffortClass: reasoningEffortClass,
      focusDonutEffortConversations: focusDonutEffortConversations,
      fitStatusPanel: fitStatusPanel,
      setExportStatus: setExportStatus,
      setExportControlsDisabled: setExportControlsDisabled,
      syncExportSelectionUi: syncExportSelectionUi,
      syncExportSearchUi: syncExportSearchUi,
      uniqueConversationBases: uniqueConversationBases
    }
  };
});
