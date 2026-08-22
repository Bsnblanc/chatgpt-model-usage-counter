# Privacy Policy

ChatGPT Model Usage Counter is a Chrome extension for local ChatGPT usage statistics, ChatGPT web-related service status display, and user-initiated local conversation export.

The extension stores usage statistics and interface settings locally in the current Chrome profile through `chrome.storage.local`.

## Local Usage Statistics

Locally stored usage records may include model names, request model metadata, parameter combinations, feature tags, timestamps, page URL/title, conversation ID, prompt length, and prompt hash.

Usage statistics do not store raw prompts, raw responses, passwords, cookies, authorization headers, or access tokens.

## Conversation Export

Conversation export is user initiated. Opening the Export view reads the conversation index (conversation IDs, titles, and timestamps) needed for the Current, Selected, and All scopes. Conversation bodies are read only after the user clicks a format button.

For complete-history export, the extension requests `/backend-api/conversations` and `/backend-api/conversation/{id}` from the same ChatGPT origin and uses the browser's existing signed-in session through standard same-origin credential handling. It does not read cookies, authorization headers, passwords, or access tokens. If these requests are unavailable, it falls back to the currently rendered page and conversation links already loaded in the sidebar, and marks the result incomplete.

The extension converts JSON, PDF, Markdown, DOCX, PNG, and ZIP files locally in the browser. A single conversation downloads directly. Multiple conversations download as one ZIP containing one file per conversation and an integrity report. No conversation content is uploaded to a publisher server.

The extension does not export conversations in the background or without a user action.

## Status Requests

The status view requests public status information from `status.openai.com` and displays ChatGPT web-related service components.

This request is used only to show public service health information in the extension UI.

## Permissions

- `storage`: save local usage statistics and UI settings.
- `downloads`: save user-initiated export files to the local computer.
- `scripting`: show the panel and restore page-side extension behavior on ChatGPT pages.
- `webRequest`: identify model, parameter, and feature metadata from ChatGPT requests for local statistics.
- `https://chatgpt.com/*` and `https://chat.openai.com/*`: run on ChatGPT pages, observe request model metadata for local statistics, and read the user-requested current, selected, or complete conversation history for export.
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

本地使用统计记录可能包含模型名称、请求模型元数据、参数组合、功能标签、时间戳、页面 URL/标题、对话 ID、prompt 长度和 prompt 哈希。

使用统计不保存 prompt 原文、回答原文、密码、Cookie、Authorization header 或访问令牌。

## 对话导出

对话导出由用户主动触发。用户打开「导出」页后，扩展会读取“当前 / 选中 / 全部”范围所需的对话索引（对话 ID、标题和时间）；只有用户点击格式按钮后，扩展才读取对话正文。

为了导出完整历史，扩展会从当前 ChatGPT 同源请求 `/backend-api/conversations` 和 `/backend-api/conversation/{id}`，并由浏览器通过标准同源凭据机制使用现有登录会话。扩展不读取 Cookie、Authorization header、密码或访问令牌。接口不可用时，扩展会回退到当前已渲染页面和侧边栏已加载的对话链接，并标记结果不完整。

扩展在本地浏览器内转换 JSON、PDF、Markdown、DOCX、PNG 和 ZIP。单个对话直接下载；多个对话下载为一个 ZIP，其中每段对话一个文件并附完整性报告。对话内容不会上传到发布者服务器。

扩展不会在后台或没有用户操作时自动导出对话。

## 状态请求

状态视图会请求 `status.openai.com` 的公开状态信息，并显示 ChatGPT 网页相关服务组件。

该请求只用于在扩展界面中展示公开服务健康状态。

## 权限用途

- `storage`：保存本地使用统计和界面设置。
- `downloads`：把用户主动导出的文件保存到本机。
- `scripting`：在 ChatGPT 页面显示面板并恢复页面侧扩展能力。
- `webRequest`：从 ChatGPT 请求中识别模型、参数和功能元数据，用于本地统计。
- `https://chatgpt.com/*` 和 `https://chat.openai.com/*`：在 ChatGPT 页面运行，为本地统计观察请求模型元数据，并在用户主动导出时读取当前、选中或全部范围内的对话历史。
- `https://status.openai.com/*`：读取公开服务状态，用于状态视图。

## 数据共享

扩展没有发布者自有服务器。扩展不会向发布者上传使用统计或导出的聊天记录。扩展不会出售、出租或共享用户数据。

## Limited Use 声明

扩展只会为了实现或改进单一用途而使用 Chrome 权限和相关用户数据：本地 ChatGPT 使用统计、ChatGPT 网页状态展示，以及用户主动触发的本地对话导出。

扩展不会传输、出售、出租用户数据，也不会把用户数据用于广告、信用评估或无关分析。
