<div align="center">

# ChatGPT Model Usage Counter

<img src="store-assets/promotional/marquee-1400x560.png" alt="ChatGPT Model Usage Counter" width="820" />

**在浏览器本地统计 ChatGPT 的模型使用，并从当前页面或用户导入的官方数据导出中逐项选择对话导出。**

**Track ChatGPT model usage locally and export explicitly selected conversations from the current page or a user-imported official data export.**

[中文说明](#-中文) · [English](#-english) · [下载 / Download](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases)

<img src="store-assets/promotional/small-promo-440x280.png" alt="界面预览 / Preview" width="440" />

</div>

> Manifest V3 Chrome extension · Default UI language: English · No publisher server · MIT

---

## 界面与导出预览 / Interface and export preview

<p align="center">
  <img src="store-assets/screenshots/01-model-statistics-1280x800.png" alt="Model statistics and charts" width="49%" />
  <img src="store-assets/screenshots/02-select-chats-formats-1280x800.png" alt="Conversation checklist and export formats" width="49%" />
</p>

<p align="center">
  <img src="store-assets/screenshots/03-readable-exports-1280x800.png" alt="Readable PDF, DOCX, and PNG exports" width="78%" />
</p>

<a id="-中文"></a>

## 🇨🇳 中文

扩展在当前 Chrome 配置中本地记录 ChatGPT 网页的提交次数、模型关系和相关功能。它不是 OpenAI 官方账单、额度、速率限制或 token 统计。

### 当前功能

| 功能 | 实际行为 |
|---|---|
| **默认英语** | 首次使用默认显示英语，可在设置中切换中文；语言选择由两个入口共享 |
| **Chat / Work** | Chat 和 Work 共用同一条统计事件链，可按“全部 / Chat / Work”筛选 |
| **一次提交只计一次** | 提交时建立事件；请求型号和最终回复型号随后更新到同一事件，最终回复不会增加第二次计数 |
| **Basic（映射）** | 按当前账号模型目录解析后的公开模型汇总；新型号无法映射时保留精确内部 slug，不猜测旧名称 |
| **Advanced（内部）** | 以请求型号为一级、实际回复型号为二级展示；思考强度跟随对应回复型号，请求和回复缺失时分别显示“未知” |
| **折线图** | 显示当前日期、来源、模式和可见模型范围内的每日趋势；每条曲线直接标注对应模型 |
| **两级环形图** | 第一级显示所选范围的模型构成；点击模型切换到第二级思考强度构成；点击具体强度只展开对应对话索引，不再进入额外统计层级 |
| **主题** | 支持跟随系统、浅色和深色；手动主题不依赖 ChatGPT 页面主题 |
| **共享入口状态** | 页面右上角入口和 Chrome 工具栏弹窗共享语言、主面板、日期、Chat/Work、Basic/Advanced、主题、折线图/环形图/文字统计显示和两种模式各自的模型可见选择 |
| **动态角标** | 工具栏角标始终显示与面板相同日期范围、Chat/Work、Basic/Advanced 和当前可见模型对应的次数；显式清空模型时计数为 0 且不显示数字，服务状态只改变角标颜色，不替换计数 |
| **当前对话直接导出** | 当前打开对话只从已经渲染的 ChatGPT 页面本地读取，不请求账号历史；它排在导出列表首位并在首次打开时默认勾选 |
| **官方数据导入** | 完整历史由用户主动选择并导入 ChatGPT 官方数据导出 ZIP 或 `conversations.json`；解析结果仅缓存在当前浏览器本地 |
| **逐项与项目选择** | 导入后按对话显示复选框，并提供搜索、全选、清空和项目整组选取；项目名称只使用官方导出中的可信关联信息 |
| **五种对话格式** | 支持 JSON、Markdown、PDF、PNG、DOCX；单选直接下载一个文件，多选下载一个 ZIP，每段对话一个文件并附 `_export-report.json` |
| **统计数据管理** | 设置中可导出可恢复的统计备份 JSON、用于查看的记录 CSV，并导入受支持的备份 JSON；导入会确认后替换当前全部统计记录，不导入界面设置 |
| **无后台历史抓取** | 不在后台扫描、分页抓取或自动刷新账号对话历史；对话导出不读取 ChatGPT 会话令牌、Cookie 或 Authorization header |
| **本地处理** | 模型统计、官方数据导入缓存、备份、CSV 和对话导出都在浏览器本地处理，不上传到发布者服务器 |

### 安装

1. 从 [Releases](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases) 下载扩展压缩包。
2. 解压到文件夹；Chrome 不能直接加载 ZIP。
3. 打开 `chrome://extensions/`，启用 **Developer mode / 开发者模式**。
4. 点击 **Load unpacked / 加载已解压的扩展程序**，选择包含 `manifest.json` 的目录。
5. 打开已登录的 [ChatGPT](https://chatgpt.com/) 页面并刷新。
6. 从页面右上角入口或 Chrome 工具栏扩展图标打开面板。

支持 `https://chatgpt.com/*`，并兼容 `https://chat.openai.com/*`。

### 关键数据边界

- 统计和共享界面设置保存在当前 Chrome 配置的 `chrome.storage.local`。
- 用户主动导入的官方对话数据仅缓存在当前 Chrome 配置中，用于本地列表、项目分组、选择和导出。
- 模型统计不保存 prompt 原文或回答原文；当前对话正文只从已渲染页面读取，完整历史正文只来自用户主动导入的官方 ZIP 或 JSON。
- 对话导出不读取或保存 ChatGPT 会话令牌、Cookie、Authorization header 或访问令牌，也不在后台抓取账号历史。
- 请求参数只保留严格白名单内的模型、思考强度及标量/枚举值；自由文本 Schema、预测内容和用户位置对象不会写入统计。
- 统计备份可能包含对话 ID、消息 ID、标题和页面 URL；记录 CSV 可包含对话 ID、标题、模型、时间、来源、功能和思考强度。两者都不包含 Cookie、Authorization、访问令牌、账号 ID、`safety_identifier` 或 `prompt_cache_key`。
- “未知”表示没有取得可信证据。请求型号不会冒充回复型号，项目名称不会按列表顺序猜配，错误状态会显示具体错误而不是伪装成未知值。

完整操作见 [USAGE.md](./USAGE.md)，完整数据说明见 [PRIVACY.md](./PRIVACY.md)。

---

<a id="-english"></a>

## 🇬🇧 English

The extension records ChatGPT web submissions, model relationships, and related feature signals locally in the current Chrome profile. It is not an OpenAI billing, quota, rate-limit, or token counter.

### Current features

| Feature | Actual behavior |
|---|---|
| **English by default** | The first-run interface is English and can be switched to Chinese; both entry points share the language setting |
| **Chat / Work** | Chat and Work use the same event pipeline and can be filtered by All, Chat, or Work |
| **One count per submission** | A submission creates one event; request and final-response evidence update that same event without adding a second count |
| **Basic (mapped)** | Aggregates by the public model resolved from the signed-in account catalog; an unmapped new model keeps its exact internal slug instead of being guessed |
| **Advanced (internal)** | Groups by request model and then actual response model; reasoning effort follows the matching response model, while missing request and response values remain independently Unknown |
| **Line chart** | Shows daily trends for the active date, source, mode, and visible-model filters, with each curve labeled directly |
| **Two-level donut chart** | Level one shows model composition; selecting a model shows its reasoning-effort composition; selecting an effort only expands matching conversation indexes and does not open another statistics level |
| **Theme** | Supports System, Light, and Dark; a manual theme does not inherit the ChatGPT page theme |
| **Shared entry state** | The in-page entry and toolbar popup share language, main view, dates, Chat/Work, Basic/Advanced, theme, independent line/donut/text visibility, and separate visible-model choices for both modes |
| **Dynamic badge** | The toolbar badge always shows the count for the same date range, Chat/Work source, Basic/Advanced mode, and visible models as the panel; an explicit empty selection hides the zero badge, while service state changes only its color |
| **Current-chat export** | The open chat is read locally only from the already rendered ChatGPT page, without requesting account history; it appears first and is checked on the initial export-list load |
| **Official data import** | Full history comes from a ChatGPT official data export ZIP or `conversations.json` that the user explicitly selects; parsed results are cached only in the current browser profile |
| **Per-chat and project selection** | Imported conversations have individual checkboxes plus search, Select all, Clear, and project-group selection; project names use only trusted relationships contained in the official export |
| **Five conversation formats** | JSON, Markdown, PDF, PNG, and DOCX; one selection downloads one file, while multiple selections download one ZIP with one file per conversation and `_export-report.json` |
| **Statistics data tools** | Settings can export a restorable Backup JSON, export a readable Records CSV, and import a supported backup; import confirms and replaces all current statistics without importing UI settings |
| **No background history crawling** | The extension does not scan, paginate through, or refresh account conversation history in the background; conversation export does not read ChatGPT session tokens, cookies, or authorization headers |
| **Local processing** | Model statistics, imported official-data caches, backups, CSV files, and conversation exports are processed locally and are not uploaded to a publisher server |

### Install

1. Download the extension archive from [Releases](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases).
2. Unzip it; Chrome cannot load the ZIP directly.
3. Open `chrome://extensions/` and enable **Developer mode**.
4. Click **Load unpacked** and choose the directory containing `manifest.json`.
5. Open a signed-in [ChatGPT](https://chatgpt.com/) page and refresh it.
6. Open the panel from the in-page top-right entry or the Chrome toolbar icon.

Supports `https://chatgpt.com/*` and remains compatible with `https://chat.openai.com/*`.

### Data boundaries

- Statistics and shared interface settings are stored in `chrome.storage.local` in the current Chrome profile.
- Official conversation data explicitly imported by the user is cached only in the current Chrome profile for local listing, project grouping, selection, and export.
- Model statistics do not store raw prompts or raw answers. The current chat is read only from the rendered page; full-history bodies come only from the user-imported official ZIP or JSON.
- Conversation export does not read or store ChatGPT session tokens, cookies, authorization headers, or access tokens, and it does not crawl account history in the background.
- Request parameters are limited to strictly allowlisted model, reasoning-effort, scalar, and enum values; free-text schemas, predicted content, and user-location objects are not persisted.
- A statistics backup may contain conversation IDs, message IDs, titles, and page URLs. A Records CSV may contain conversation IDs, titles, models, timestamps, source modes, features, and reasoning effort. Both exclude cookies, authorization data, access tokens, account IDs, `safety_identifier`, and `prompt_cache_key`.
- Unknown means trustworthy evidence was not obtained. A request model never substitutes for a missing response model, project names are never paired by remaining list order, and known failures are reported as errors rather than Unknown.

See [USAGE.md](./USAGE.md) for the full guide and [PRIVACY.md](./PRIVACY.md) for complete data handling details.

---

## Development

```bash
node --test
npm run check:syntax
```

## License

[MIT](./LICENSE)
