# Privacy Policy

ChatGPT Model Usage Counter is a Chrome extension for local ChatGPT usage statistics, public ChatGPT web-service status, statistics backup and restore, and user-initiated conversation export.

The extension has no publisher-operated server. Statistics and files are processed locally in the browser.

## Local statistics and settings

The extension stores the following data in the current Chrome profile through `chrome.storage.local`:

- Aggregated usage counts by date, public model, request model, response model, Chat/Work source, reasoning effort, and recognized feature.
- Up to 500 recent event records used for auditable request/response relationships.
- Long-term aggregates that continue to cover supported filters and dimensions after the recent-event limit is reached.
- Conversation relationship metadata such as conversation ID, message IDs, page title, page URL, and timestamps.
- Shared interface settings: language, active main view, date range, Chat/Work filter, Basic/Advanced mode, chart type, theme, chart/text visibility, and separate visible-model selections for Basic and Advanced.
- The filter used to keep the Chrome toolbar badge consistent with the panel.

The default interface language is English. Changing the language or another shared setting updates the same local settings used by the in-page entry and toolbar popup.

Usage statistics do not store raw prompts, raw answers, passwords, cookies, authorization headers, access tokens, account IDs, `safety_identifier`, or `prompt_cache_key`.

Short-lived duplicate-detection data stays in runtime memory. It is scoped to the relevant tab and prefers exact submission or message identifiers. It is not included in persistent statistics or exports.

## Passive model observation

Chat and Work share one passive event pipeline. The extension observes metadata from requests and final assistant messages that the user already initiated. It does not automatically send prompts, modify, block, or replay ChatGPT requests.

The selected public model, exact request model, and exact final-response model are kept as separate evidence. A missing request model does not substitute for a missing response model, and vice versa. A value without trustworthy evidence is displayed as Unknown without writing a fabricated value.

Request bodies are inspected locally only for model, reasoning-effort, strictly allowlisted scalar or enum parameters, feature, source, and message-linkage metadata. Free-text schemas, predicted content, user-location objects, prompt text, answer content, attachments, credentials, and transport fields are excluded from persisted statistics.

## Account model catalog and session data

When the user opens the statistics panel, the extension can make a read-only same-origin request to `/backend-api/models` to map internal slugs to the public models available to the signed-in account. The catalog request is attempted once and is not automatically retried.

Sanitized model slugs, public titles, version/preset bindings, and category labels are stored only in `chrome.storage.session` and are cleared with the browser session.

Account-request coordination also uses `chrome.storage.session`. Its snapshot contains scheduler timing and permit state only; it does not contain account credentials, cookies, authorization headers, access tokens, or account IDs.

## Statistics backup, CSV, and import

Statistics data actions are initiated by the user from Settings.

### Backup JSON

A Backup JSON contains:

- Backup format and format version.
- Export time, installed extension version, and a statistics summary.
- Sanitized long-term statistics and retained recent events.

The backup does not contain interface settings, the account model catalog, request-coordination state, raw prompts, raw answers, cookies, authorization data, access tokens, account IDs, `safety_identifier`, or `prompt_cache_key`.

The backup can contain personal local metadata such as conversation IDs, message IDs, titles, page URLs, timestamps, model relationships, source modes, features, and reasoning effort. Users should handle the file as personal data.

### Records CSV

A Records CSV is a local readable export and cannot be imported. It can contain event or aggregate rows with date, public model, request model, response model, reasoning effort, source mode, features, conversation ID, title, and count.

When recent event history does not cover all usage, aggregate rows provide full-history statistical coverage. Event and aggregate rows are separate representations and should not be added together.

### Import

Import accepts a supported Backup JSON of no more than 10 MB. The extension validates its format and version, rebuilds event objects from an explicit allowlist, and removes unknown or sensitive fields.

After user confirmation, import replaces all current usage statistics. It does not merge statistics and does not import or overwrite interface settings. Invalid or unsupported files leave the current statistics unchanged.

Backup export, CSV export, file reading, validation, and import are local operations and do not make ChatGPT account requests.

## Conversation export

Conversation export is initiated by the user:

1. Opening Export reads the account conversation index and displays one checkbox per conversation.
2. Conversation bodies are read only after the user selects one or more conversations and clicks JSON, Markdown, PDF, PNG, or DOCX.
3. A single selected conversation downloads as one file.
4. Multiple selected conversations download as one ZIP containing one file per conversation and `_export-report.json`.

Project names are associated only through explicit project-ID-to-name evidence. If a name cannot be verified, the project remains grouped by its stable ID and is displayed as Unknown project; names are not paired by remaining list order.

For complete-history export, the extension can request the following same-origin ChatGPT endpoints:

- `/backend-api/conversations`
- `/backend-api/conversations/{id}`
- `/backend-api/conversations/{id}/messages`
- `/backend-api/conversation/{id}` as a compatibility fallback

The required account token exists only in content-script memory for the current operation. It is released after the operation and is never persisted, logged, included in a statistics backup, included in exported conversations, or sent outside ChatGPT. The extension does not read `document.cookie` or passwords.

If account history is unavailable, the extension can use the currently rendered conversation and links already loaded in the sidebar. The interface and ZIP report mark the result incomplete.

## Account-request safeguards

Account catalog and conversation-history requests use one extension-wide scheduler shared by all ChatGPT tabs:

- Maximum concurrency: 1.
- Minimum gap between actual request starts: 1 second.
- Conversation-history transient failures: at most one retry.
- Model-catalog request: no automatic retry.
- `401` or `403`: stop the current account operation.
- `429`: apply an extension-wide cooldown; final throttling or a `Retry-After` longer than 60 seconds stops the operation.
- One account-history operation: at most 800 requests and 10 minutes.
- One conversation: at most 50 older-message pages and 10,000 messages.

The extension does not bypass rate limits, start background conversation crawling, replay account requests, or continue an export after a stop condition.

## Public status requests

The extension requests the public `api/v2/summary.json` and `api/v2/components.json` feeds from `status.openai.com` for the status display and periodic status refresh.

These requests contain no ChatGPT account token or conversation content. When only the summary is available, the interface marks the component list incomplete.

## Permissions

- `alarms`: periodically refresh public ChatGPT service status.
- `storage`: save local statistics, shared settings, badge filters, session-only model catalog data, and request-coordination timing.
- `downloads`: save user-initiated statistics and conversation export files.
- `scripting`: show or restore the page panel and read rendered project ID/name evidence required for export grouping.
- `webRequest`: observe ChatGPT request model, parameter, feature, source, and message-linkage metadata for local statistics.
- `https://chatgpt.com/*` and `https://chat.openai.com/*`: run on supported ChatGPT pages and perform user-initiated same-origin catalog or conversation reads.
- `https://status.openai.com/*`: read public service-status feeds.

## Data sharing and limited use

The extension does not sell, rent, transfer, or share user data. It does not use data for advertising, creditworthiness, or unrelated analytics.

Chrome permissions and handled data are used only for local ChatGPT usage statistics, shared panel behavior, public ChatGPT service status, statistics backup and restore, and user-initiated local conversation export.

---

# 中文隐私政策

ChatGPT Model Usage Counter 是一个 Chrome 扩展，用于本地 ChatGPT 使用统计、公开 ChatGPT 网页服务状态、统计备份与恢复，以及用户主动触发的对话导出。

扩展没有发布者自有服务器。统计和文件处理都在浏览器本地完成。

## 本地统计与设置

扩展通过当前 Chrome 配置的 `chrome.storage.local` 保存：

- 按日期、公开模型、请求型号、回复型号、Chat/Work、思考强度和已识别功能形成的长期聚合。
- 最多 500 条用于审计请求/回复关系的最近事件。
- 最近事件达到上限后，仍覆盖受支持筛选和维度的完整长期聚合。
- 对话 ID、消息 ID、页面标题、页面 URL 和时间戳等关系元数据。
- 共享界面设置：语言、当前主面板、日期范围、Chat/Work、Basic/Advanced、图表类型、主题、图表/文字显示状态，以及 Basic 和 Advanced 各自的可见模型选择。
- 使 Chrome 工具栏角标与面板保持同一口径的过滤条件。

界面默认语言为英语。切换语言或其他共享设置时，页面入口和工具栏弹窗使用同一份本地设置。

使用统计不保存 prompt 原文、回答原文、密码、Cookie、Authorization header、访问令牌、账号 ID、`safety_identifier` 或 `prompt_cache_key`。

短时去重数据只存在于运行内存中，按相关标签页隔离并优先使用精确提交或消息标识；不会进入持久化统计或导出文件。

## 被动模型观察

Chat 和 Work 共用同一条被动统计事件链。扩展只观察用户原本发起的请求和最终助手消息元数据，不自动发送 prompt，不改写、阻断或重放 ChatGPT 请求。

用户所选公开模型、精确请求型号和精确最终回复型号分别保存。请求型号和回复型号任一缺失时都不会用另一个字段冒充；没有可信证据的值只在界面显示“未知”，不会写回伪造数据。

扩展仅在本地从请求中识别模型、思考强度、严格白名单内的标量或枚举参数、功能、来源和消息关联元数据。自由文本 Schema、预测内容、用户位置对象、prompt、回答正文、附件、凭据和传输字段不会写入统计。

## 账号模型目录与会话数据

用户打开统计面板时，扩展可同源只读请求 `/backend-api/models`，用于把内部 slug 映射到当前登录账号可见的公开模型。目录请求只尝试一次，不自动重试。

清理后的模型 slug、公开标题、版本/预设绑定和分类名称只保存在 `chrome.storage.session`，并随浏览器会话结束而清除。

账号请求协调状态也使用 `chrome.storage.session`。其中只包含调度时间和许可状态，不包含账号凭据、Cookie、Authorization header、访问令牌或账号 ID。

## 统计备份、CSV 与导入

统计数据操作由用户从 Settings 主动触发。

### 备份 JSON

备份 JSON 包含：

- 备份格式和格式版本。
- 导出时间、当前扩展版本和统计摘要。
- 清洗后的长期统计与当前保留的最近事件。

备份不包含界面设置、账号模型目录、请求协调状态、prompt 原文、回答原文、Cookie、Authorization、访问令牌、账号 ID、`safety_identifier` 或 `prompt_cache_key`。

备份可能包含对话 ID、消息 ID、标题、页面 URL、时间戳、模型关系、来源模式、功能和思考强度等个人本地元数据，应按个人数据文件保管。

### 记录 CSV

记录 CSV 是本地可读导出，不能用于导入。文件可能包含事件行或聚合行，以及日期、公开模型、请求型号、回复型号、思考强度、来源、功能、对话 ID、标题和次数。

最近事件未覆盖全部历史时，聚合行提供完整历史统计。事件行与聚合行是不同覆盖层，不应直接相加。

### 导入

导入只接受不超过 10 MB 的受支持备份 JSON。扩展校验格式和版本，使用明确字段白名单重建事件，并删除未知或敏感字段。

用户确认后，导入会替换当前全部使用统计；不会合并统计，也不会导入或覆盖界面设置。文件无效或版本不受支持时，现有统计保持不变。

备份导出、CSV 导出、文件读取、校验和导入都是本地操作，不会产生 ChatGPT 账号请求。

## 对话导出

对话导出由用户主动触发：

1. 打开 Export 后读取账号对话索引，并为每段对话显示复选框。
2. 只有用户选择一个或多个对话并点击 JSON、Markdown、PDF、PNG 或 DOCX 后，才读取相应对话正文。
3. 单选下载一个文件。
4. 多选下载一个 ZIP，其中每段对话一个文件并附 `_export-report.json`。

项目名称只能通过明确的项目 ID → 名称证据关联。名称无法验证时，项目仍按稳定 ID 分组并显示“未知项目”；不会按列表剩余顺序猜配名称。

为读取完整历史，扩展可访问以下 ChatGPT 同源接口：

- `/backend-api/conversations`
- `/backend-api/conversations/{id}`
- `/backend-api/conversations/{id}/messages`
- 兼容回退 `/backend-api/conversation/{id}`

所需账号令牌只在当前操作的内容脚本内存中存在，操作结束后释放；不会持久化、记录、写入统计备份、写入对话导出文件或发送到 ChatGPT 之外。扩展不读取 `document.cookie` 或密码。

账号历史不可用时，扩展可使用当前已渲染对话和侧边栏已经加载的链接，并在界面和 ZIP 报告中标记结果不完整。

## 账号请求安全限制

账号模型目录和对话历史请求由所有 ChatGPT 标签页共享同一个扩展级调度器：

- 最大并发：1。
- 任意两次真实请求起始时间至少间隔 1 秒。
- 对话历史临时错误：最多重试一次。
- 模型目录：不自动重试。
- `401` 或 `403`：停止当前账号操作。
- `429`：建立扩展级全局冷却；最终仍被限流或 `Retry-After` 超过 60 秒时停止操作。
- 单次账号历史操作：最多 800 个请求、最长 10 分钟。
- 单个对话：最多 50 个旧消息分页、最多 10,000 条消息。

扩展不会绕过限流，不会在后台批量抓取对话，不会重放账号请求，也不会在触发停止条件后继续导出。

## 公开状态请求

扩展会为状态面板和周期状态刷新请求 `status.openai.com` 的公开 `api/v2/summary.json` 与 `api/v2/components.json`。

这些请求不包含 ChatGPT 账号令牌或对话内容。只有摘要可用时，界面会标记组件列表不完整。

## 权限用途

- `alarms`：周期刷新公开 ChatGPT 服务状态。
- `storage`：保存本地统计、共享设置、角标过滤器、会话模型目录和请求协调时间。
- `downloads`：保存用户主动导出的统计和对话文件。
- `scripting`：显示或恢复页面面板，并读取对导出项目分组所需的已渲染项目 ID/名称证据。
- `webRequest`：观察 ChatGPT 请求中的模型、参数、功能、来源和消息关联元数据，用于本地统计。
- `https://chatgpt.com/*` 和 `https://chat.openai.com/*`：在受支持页面运行，并执行用户触发的同源模型目录或对话读取。
- `https://status.openai.com/*`：读取公开服务状态。

## 数据共享与 Limited Use

扩展不会出售、出租、传输或共享用户数据，也不会把数据用于广告、信用评估或无关分析。

Chrome 权限和相关数据只用于本地 ChatGPT 使用统计、共享面板状态、公开 ChatGPT 服务状态、统计备份与恢复，以及用户主动触发的本地对话导出。
