<div align="center">

# ChatGPT Model Usage Counter

<img src="store-assets/promotional/marquee-1400x560.png" alt="ChatGPT Model Usage Counter" width="820" />

**在浏览器本地统计 ChatGPT 的模型使用，查看趋势与构成，并逐项选择对话导出。**

**Track ChatGPT model usage locally, compare trends and composition, and export explicitly selected conversations.**

[中文说明](#-中文) · [English](#-english) · [下载 / Download](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases)

<img src="store-assets/promotional/small-promo-440x280.png" alt="界面预览 / Preview" width="440" />

</div>

> Manifest V3 Chrome extension · Default UI language: English · No publisher server · MIT

---

## 真实界面 / Actual interface

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
| **折线图** | 显示当前日期、来源、模式和可见模型范围内的每日趋势 |
| **两级环形图** | 第一级显示所选范围的模型构成；点击模型切换到第二级思考强度构成，并可返回模型占比 |
| **主题** | 支持跟随系统、浅色和深色；手动主题不依赖 ChatGPT 页面主题 |
| **共享入口状态** | 页面右上角入口和 Chrome 工具栏弹窗共享语言、主面板、日期、Chat/Work、Basic/Advanced、图表类型、主题、区块显示和两种模式各自的模型可见选择 |
| **动态角标** | 工具栏角标使用与面板相同的日期范围、Chat/Work、Basic/Advanced 和当前可见模型；显式清空模型时计数为 0 且不显示数字，服务异常时改用 `!` 或 `?` |
| **逐项选择导出** | 导出列表提供每段对话的复选框、搜索、全选、清空和项目整组选取；当前对话首次加载时排在首位并默认勾选 |
| **项目目录** | 项目名称只通过明确的项目 ID 与名称证据绑定；名称未知时仍按稳定 ID 分组并显示“未知项目” |
| **五种对话格式** | 支持 JSON、Markdown、PDF、PNG、DOCX；单选直接下载一个文件，多选下载一个 ZIP，每段对话一个文件并附 `_export-report.json` |
| **统计数据管理** | 设置中可导出可恢复的统计备份 JSON、用于查看的记录 CSV，并导入受支持的备份 JSON；导入会确认后替换当前全部统计记录，不导入界面设置 |
| **账号请求保护** | 账号目录和对话读取由用户操作触发；所有标签页共用单请求调度，真实请求起始时间至少间隔 1 秒，并遵守限流、时长和读取数量上限 |
| **本地处理** | 统计、备份、CSV 和对话导出都在浏览器本地生成，不上传到发布者服务器 |

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
- 清理后的账号模型目录及账号请求调度状态只保存在 `chrome.storage.session`。
- 模型统计不保存 prompt 原文或回答原文；对话正文只在用户点击格式并明确选择对话后读取。
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
| **Line chart** | Shows daily trends for the active date, source, mode, and visible-model filters |
| **Two-level donut chart** | Level one shows model composition; selecting a model drills into its reasoning-effort composition and provides a return action |
| **Theme** | Supports System, Light, and Dark; a manual theme does not inherit the ChatGPT page theme |
| **Shared entry state** | The in-page entry and toolbar popup share language, main view, dates, Chat/Work, Basic/Advanced, chart type, theme, section visibility, and separate visible-model choices for both modes |
| **Dynamic badge** | The toolbar badge follows the same date range, Chat/Work source, Basic/Advanced mode, and visible models as the panel; an explicit empty model selection counts as zero, while abnormal service status uses `!` or `?` |
| **Explicit conversation selection** | The export list has one checkbox per conversation plus search, Select all, Clear, and project-group selection; the current chat appears first and is checked only on the initial list load |
| **Project directories** | Project names require explicit project-ID-to-name evidence; an unresolved project stays grouped by stable ID and is displayed as Unknown project |
| **Five conversation formats** | JSON, Markdown, PDF, PNG, and DOCX; one selection downloads one file, while multiple selections download one ZIP with one file per conversation and `_export-report.json` |
| **Statistics data tools** | Settings can export a restorable Backup JSON, export a readable Records CSV, and import a supported backup; import confirms and replaces all current statistics without importing UI settings |
| **Account-request safeguards** | Account catalog and conversation reads require user action; every tab shares one request scheduler with at least one second between actual request starts plus throttling, duration, and item limits |
| **Local processing** | Statistics, backups, CSV files, and conversation exports are generated locally and are not uploaded to a publisher server |

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
- The sanitized account model catalog and account-request coordination state are session-only in `chrome.storage.session`.
- Model statistics do not store raw prompts or raw answers. Conversation bodies are read only after the user chooses conversations and clicks an export format.
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
