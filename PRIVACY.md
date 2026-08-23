# Privacy Policy

ChatGPT Model Usage Counter is a Chrome extension for local ChatGPT usage statistics, ChatGPT web-related service status display, and user-initiated local conversation export.

The extension stores usage statistics and interface settings locally in the current Chrome profile through `chrome.storage.local`.

## Local Usage Statistics

Locally stored usage records may include public model names, selected public models, request slugs, actual response slugs, parameter combinations, feature tags, timestamps, page URL/title, conversation ID, prompt length, and prompt hash.

To map an internal request or response slug to the public model name available to the signed-in account, the extension makes a read-only same-origin request to `/backend-api/models` only when the user opens the statistics panel or a new unmapped response slug appears. The sanitized model slugs, public titles, version/preset bindings, and category labels are stored only in `chrome.storage.session` and are cleared when the browser session ends. Page load does not request the catalog, and `401`, `403`, or `429` responses are not retried automatically. The extension does not store the full account response, account ID, authorization header, or access token in usage events.

Chat and Work use the same passive event pipeline. The extension observes the request and final response that the user already initiated; it does not automatically send prompts, modify, block, or replay ChatGPT requests. Requested reasoning effort is recorded only when the request itself provides the field.

Usage statistics do not store raw prompts, raw responses, passwords, cookies, authorization headers, or access tokens.

## Conversation Export

Conversation export is user initiated. Opening the Export view reads the conversation index (conversation IDs, titles, and timestamps) and displays one checkbox per conversation. Conversation bodies are read only after the user clicks a format button, and only the checked conversations are requested.

For complete-history export, the extension requests `/backend-api/conversations`, `/backend-api/conversations/{id}`, and, when ChatGPT reports older message pages, `/backend-api/conversations/{id}/messages` from the same ChatGPT origin. If the modern detail endpoint is unavailable, it can use ChatGPT's same-origin `/backend-api/conversation/{id}` fallback. The required account token is held only in content-script memory for these same-origin requests, released after 30 seconds without an account-history request, and never persisted, logged, exported, or sent outside ChatGPT. The extension does not read `document.cookie` or passwords. If these requests are unavailable, it falls back to the currently rendered page and conversation links already loaded in the sidebar, and marks the result incomplete.

Conversation-detail reads are limited to at most two paced requests at a time. A `429` or `Retry-After` response applies shared backoff. If the server requests a delay longer than 60 seconds, the affected item stops and is reported as failed instead of being retried early. The extension does not crawl conversation bodies in the background, bypass rate limits, modify requests, or replay account requests.

The extension converts JSON, PDF, Markdown, DOCX, PNG, and ZIP files locally in the browser. A single conversation downloads directly. Multiple conversations download as one ZIP containing one file per conversation and an integrity report. No conversation content is uploaded to a publisher server.

The extension does not export conversations in the background or without a user action.

## Status Requests

The status view requests the public `api/v2/summary.json` and `api/v2/components.json` feeds from `status.openai.com`, merges them, and displays the complete matching ChatGPT web-related component list. If the complete component feed is unavailable, the UI identifies the summary-only result as incomplete.

This request is used only to show public service health information in the extension UI.

## Permissions

- `storage`: save local usage statistics and UI settings.
- `downloads`: save user-initiated export files to the local computer.
- `scripting`: show the panel and restore page-side extension behavior on ChatGPT pages.
- `webRequest`: identify request model, parameter, and feature metadata from ChatGPT requests for local statistics.
- `https://chatgpt.com/*` and `https://chat.openai.com/*`: run on ChatGPT pages, observe request and actual response model metadata for local statistics, and read only user-checked conversation history for export.
- `https://status.openai.com/*`: read public service status for the status view.

## Data Sharing

The extension does not operate a publisher server. It does not upload usage statistics or exported conversations to the publisher. The extension does not sell, rent, or share user data.

## Limited Use

The extension uses Chrome permissions and any user data it handles only to provide or improve its single purpose: local ChatGPT usage statistics, ChatGPT web status display, and user-initiated local conversation export.

The extension does not transfer, sell, rent, or use user data for advertising, creditworthiness, or unrelated analytics.

# 中文隐私政策

ChatGPT Model Usage Counter 是一个 Chrome 扩展，用于本地 ChatGPT 使用统计、ChatGPT 网页相关服务状态显示，以及用户主动触发的本地对话导出。

扩展通过 `chrome.storage.local` 把使用统计和界面设置保存到当前 Chrome 配置的本地存储中。

## 本地使用统计

本地使用统计记录可能包含公开模型名称、用户所选公开模型、请求型号、实际回复型号、参数组合、功能标签、时间戳、页面 URL/标题、对话 ID、prompt 长度和 prompt 哈希。

为了把内部请求或回复 slug 映射到当前登录账号可用的公开模型名称，扩展只会在用户打开统计面板或出现新的未映射回复 slug 时同源只读请求 `/backend-api/models`。清理后的模型 slug、公开标题、版本/预设绑定和分类名称只保存在 `chrome.storage.session`，浏览器会话结束后自动清除；页面加载不会请求目录，`401`、`403`、`429` 不自动重试。扩展不会把完整账号响应、账号 ID、Authorization header 或访问令牌写入使用事件。

普通 Chat 和 Work 使用同一套被动统计事件。扩展只观察用户原本发起的请求及其最终回复，不会自动发送 Prompt、改写、阻断或重放 ChatGPT 请求；请求思考强度只有在该次请求本身提供字段时才记录。

使用统计不保存 prompt 原文、回答原文、密码、Cookie、Authorization header 或访问令牌。

## 对话导出

对话导出由用户主动触发。用户打开「导出」页后，扩展会读取对话索引（对话 ID、标题和时间），并为每段对话显示复选框；只有用户点击格式按钮后，扩展才读取当前勾选的对话正文。

为了导出完整历史，扩展会从当前 ChatGPT 同源请求 `/backend-api/conversations`、`/backend-api/conversations/{id}`；ChatGPT 返回更早消息分页时，还会请求 `/backend-api/conversations/{id}/messages`。现代详情接口不可用时，可以回退到 ChatGPT 同源的 `/backend-api/conversation/{id}`。所需账号令牌只在内容脚本内存中临时用于这些同源请求，连续 30 秒没有账号历史请求后即释放；不持久化、不记录、不导出，也不发送到 ChatGPT 之外；扩展不读取 `document.cookie` 或密码。接口不可用时，扩展会回退到当前已渲染页面和侧边栏已加载的对话链接，并标记结果不完整。

对话详情最多同时进行 2 个带间隔的请求；收到 `429` 或 `Retry-After` 时统一退避。服务端要求等待超过 60 秒时，该项停止并报告失败，不会提前重试。扩展不会在后台抓取对话正文、绕过限流、改写请求或重放账号请求。

扩展在本地浏览器内转换 JSON、PDF、Markdown、DOCX、PNG 和 ZIP。单个对话直接下载；多个对话下载为一个 ZIP，其中每段对话一个文件并附完整性报告。对话内容不会上传到发布者服务器。

扩展不会在后台或没有用户操作时自动导出对话。

## 状态请求

状态视图会请求 `status.openai.com` 的公开 `api/v2/summary.json` 和 `api/v2/components.json`，合并后显示全部匹配的 ChatGPT 网页相关服务组件。完整组件接口不可用时，界面会明确标记当前结果只来自摘要且不完整。

该请求只用于在扩展界面中展示公开服务健康状态。

## 权限用途

- `storage`：保存本地使用统计和界面设置。
- `downloads`：把用户主动导出的文件保存到本机。
- `scripting`：在 ChatGPT 页面显示面板并恢复页面侧扩展能力。
- `webRequest`：从 ChatGPT 请求中识别请求型号、参数和功能元数据，用于本地统计。
- `https://chatgpt.com/*` 和 `https://chat.openai.com/*`：在 ChatGPT 页面运行，为本地统计观察请求型号和实际回复型号，并在用户主动导出时只读取已勾选的对话历史。
- `https://status.openai.com/*`：读取公开服务状态，用于状态视图。

## 数据共享

扩展没有发布者自有服务器。扩展不会向发布者上传使用统计或导出的聊天记录。扩展不会出售、出租或共享用户数据。

## Limited Use 声明

扩展只会为了实现或改进单一用途而使用 Chrome 权限和相关用户数据：本地 ChatGPT 使用统计、ChatGPT 网页状态展示，以及用户主动触发的本地对话导出。

扩展不会传输、出售、出租用户数据，也不会把用户数据用于广告、信用评估或无关分析。
