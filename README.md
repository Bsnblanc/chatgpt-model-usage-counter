<div align="center">

# ChatGPT Model Usage Counter

<img src="store-assets/promotional/marquee-1400x560.png" alt="ChatGPT Model Usage Counter" width="820" />

**在浏览器本地统计 ChatGPT 的模型使用，并导出当前对话或用户导入的官方对话备份。**

**Track ChatGPT model usage locally and export the current conversation or conversations imported from an official data export.**

[日本語](#-日本語) · [中文说明](#-中文) · [English](#-english) · [下载 / Download](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases)

<img src="store-assets/promotional/small-promo-440x280.png" alt="界面预览 / Preview" width="440" />

</div>

> Manifest V3 Chrome extension · UI language follows ChatGPT by default · No publisher server · MIT

---

## 界面与导出预览 / Interface and export preview

<p align="center">
  <img src="store-assets/screenshots/01-model-statistics-1280x800.png" alt="Model statistics and charts" width="49%" />
  <img src="store-assets/screenshots/02-select-chats-formats-1280x800.png" alt="Conversation checklist and export formats" width="49%" />
</p>

<p align="center">
  <img src="store-assets/screenshots/03-readable-exports-1280x800.png" alt="Readable PDF, DOCX, and PNG exports" width="78%" />
</p>

<a id="-日本語"></a>

## 🇯🇵 日本語

このChrome拡張機能は、ChatGPTでの送信回数をモデル別・日付別にブラウザ内で集計します。OpenAI公式の使用上限やトークン数を測定するものではありません。

- **日本語に切り替える:** ChatGPTページ右上の「使用量」ボタン、またはChromeの拡張機能アイコンから画面を開き、**設定 → 言語 → 日本語**を選択します。英語・中国語にも切り替えられます。
- **ページ右上のボタンを隠す:** **設定 → ページ内ボタン → 非表示**を選択します。ページ内の入口だけが消え、統計の記録とChromeツールバーからの表示は引き続き利用できます。
- **確認できる内容:** モデルごとの使用量、日別の推移、Basic／Advanced表示、Chat／Work別の集計、統計データのバックアップ、会話のローカルエクスポート。
- **インストール:** [Releases](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases)から拡張機能を取得して展開し、`chrome://extensions/` で開発者モードを有効にして「パッケージ化されていない拡張機能を読み込む」から選択します。

この機能は開発ブランチでの追加です。本家の公開リリースにはまだ反映されていない場合があります。

---

<a id="-中文"></a>

## 🇨🇳 中文

扩展在当前 Chrome 配置中本地记录 ChatGPT 网页的提交次数、模型关系和相关功能。它不是 OpenAI 官方账单、额度、速率限制或 token 统计。

### 当前功能

| 功能 | 实际行为 |
|---|---|
| **自动语言** | 默认跟随 ChatGPT 网页语言；无法读取时跟随浏览器语言，也可在设置中固定为 English、中文或日本語；两个入口共享选择 |
| **Chat / Work** | Chat 和 Work 共用同一条统计事件链，可按“全部 / Chat / Work”筛选 |
| **一次提交只计一次** | 提交时建立事件；请求型号和最终回复型号随后更新到同一事件，最终回复不会增加第二次计数 |
| **Basic（映射）** | 按当前账号模型目录解析后的公开模型汇总；新型号无法映射时保留精确内部 slug，不猜测旧名称 |
| **Advanced（内部）** | 以请求型号为一级、实际回复型号为二级展示；思考强度跟随对应回复型号，请求和回复缺失时分别显示“未知” |
| **折线图** | 显示当前日期、来源、模式和可见模型范围内的每日趋势；每条曲线直接标注对应模型 |
| **两级环形图** | 第一级显示所选范围的模型构成；点击模型切换到第二级思考强度构成；点击具体强度只展开对应对话索引，不再进入额外统计层级 |
| **主题** | 支持跟随系统、浅色和深色；手动主题不依赖 ChatGPT 页面主题 |
| **共享入口状态** | 页面右上角入口和 Chrome 工具栏弹窗共享语言、主面板、日期、Chat/Work、Basic/Advanced、主题、折线图/环形图/文字统计显示和两种模式各自的模型可见选择 |
| **动态角标** | 工具栏角标始终显示与面板相同日期范围、Chat/Work、Basic/Advanced 和当前可见模型对应的次数；显式清空模型时计数为 0 且不显示数字，服务状态只改变角标颜色，不替换计数。Chrome 原生角标由浏览器在固定位置覆盖绘制，插件不声称能够移动角标；无字母 Model Processor 图标保持正常比例，下方右侧引脚被部分覆盖后，处理器主体和三核模型窗口仍可识别 |
| **当前对话优先** | 当前打开对话先从已经渲染的 ChatGPT 页面读取，立即排在列表首位并在首次打开时默认勾选 |
| **本地对话列表** | 当前页面对话以及用户明确导入的官方 `conversations.json` / ZIP 构成列表；不会自动扫描账号历史 |
| **逐项与项目选择** | 每段对话都有独立复选框，并提供搜索、全选、清空和项目整组选取；项目名称只使用明确的项目 ID → 名称证据 |
| **五种对话格式** | 支持 JSON、Markdown、PDF、PNG、DOCX；单选直接下载一个文件，多选下载一个 ZIP，每段对话一个文件并附 `_export-report.json` |
| **统计数据管理** | 设置中可导出可恢复的统计备份 JSON、用于查看的记录 CSV，并导入受支持的备份 JSON；导入会确认后替换当前全部统计记录，不导入界面设置 |
| **用户触发的安全读取** | 不在后台扫描账号历史；官方导出文件只在用户选择后本地解析，模型目录请求受单并发、请求间隔和超时限制 |
| **本地处理** | 模型统计、对话列表缓存、备份、CSV 和导出文件都在浏览器本地处理，不上传到发布者服务器 |

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
- 对话选择列表来自当前页面及用户明确导入的官方资料文件，不自动读取完整账号历史。
- 模型统计不保存 prompt 或回答原文；但用户主动导入的官方对话备份包含消息正文，会保存在浏览器本地的独立对话缓存中，直到被替换或清除。
- 官方对话备份导入完全在浏览器本地处理，不访问账号历史 API，也不需要凭据；账号模型目录可使用当前登录会话。
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
| **Automatic language** | The interface follows the ChatGPT page language by default, falls back to the browser language, and can be set to English, Chinese, or Japanese; both entry points share the choice |
| **Chat / Work** | Chat and Work use the same event pipeline and can be filtered by All, Chat, or Work |
| **One count per submission** | A submission creates one event; request and final-response evidence update that same event without adding a second count |
| **Basic (mapped)** | Aggregates by the public model resolved from the signed-in account catalog; an unmapped new model keeps its exact internal slug instead of being guessed |
| **Advanced (internal)** | Groups by request model and then actual response model; reasoning effort follows the matching response model, while missing request and response values remain independently Unknown |
| **Line chart** | Shows daily trends for the active date, source, mode, and visible-model filters, with each curve labeled directly |
| **Two-level donut chart** | Level one shows model composition; selecting a model shows its reasoning-effort composition; selecting an effort only expands matching conversation indexes and does not open another statistics level |
| **Theme** | Supports System, Light, and Dark; a manual theme does not inherit the ChatGPT page theme |
| **In-page button** | Can be hidden in Settings without disabling recording or the Chrome toolbar popup |
| **Shared entry state** | The in-page entry and toolbar popup share language, main view, dates, Chat/Work, Basic/Advanced, theme, independent line/donut/text visibility, and separate visible-model choices for both modes |
| **Dynamic badge** | The toolbar badge always shows the count for the same date range, Chat/Work source, Basic/Advanced mode, and visible models as the panel; an explicit empty selection hides the zero badge, while service state changes only its color. Chrome draws the native badge over the icon at a fixed browser-controlled position, and the extension does not claim to move it; the letter-free Model Processor mark keeps its normal proportions, while its processor body and three-core model window remain recognizable when lower-right pins are partially covered |
| **Current chat first** | The open chat is read from the already rendered ChatGPT page first, appears at the top immediately, and is checked on the initial list load |
| **Local conversation list** | The current rendered conversation and explicitly imported official `conversations.json` / ZIP files populate the list; the extension does not scan account conversation history |
| **Per-chat and project selection** | Every conversation has its own checkbox plus search, Select all, Clear, and project-group selection; project names use only explicit project-ID-to-name evidence |
| **Five conversation formats** | JSON, Markdown, PDF, PNG, and DOCX; one selection downloads one file, while multiple selections download one ZIP with one file per conversation and `_export-report.json` |
| **Statistics data tools** | Settings can export a restorable Backup JSON, export a readable Records CSV, and import a supported backup; import confirms and replaces all current statistics without importing UI settings |
| **User-triggered safe reads** | The extension does not scan account history; official conversation files are parsed locally after selection, while model-catalog requests remain paced and bounded |
| **Local processing** | Model statistics, conversation-list cache, backups, CSV files, and exported files are processed locally and are not uploaded to a publisher server |

### Dates and existing statistics

Today, Last 7 days, Last 31 days, a fixed start through today, and custom dates use the device's calendar and time zone. Rolling ranges include today. The saved range mode is shared by the dashboard and badge; a previously saved fixed end date remains fixed when upgrading.

New events retain their UTC submission timestamp, the calendar day recorded at submission, its date basis, and the device time-zone identifier. A later time-zone change does not move those events to a different stored day. The statistics storage schema version (`version`) and backup format version (`formatVersion`) are separate from the extension release version. Unsupported storage or backup versions are rejected rather than rewritten.

Legacy aggregate totals and daily buckets are preserved when event history is incomplete. An unmarked historical event can have an unknown date basis: older releases have used different conventions, so its timestamp alone is not enough to assign a day. Detailed views may therefore omit events with unproven dates and show an incomplete-history notice; Basic totals remain based on the stored daily buckets. A complete event history is rebuilt only when the original day for each event is recorded or established from the stored aggregates and the resulting event buckets match those aggregates. No missing events are invented. Export a Backup JSON before importing or changing extensions; import replaces statistics rather than merging them.

### Official conversation import

To export past conversations, request a ChatGPT data export from ChatGPT, then select its `conversations.json` or original ZIP in the extension's Export panel. The archive and messages are parsed **locally**; no account conversation-list/detail API is called. The extension includes the current rendered chat separately. Importing official conversations updates a local conversation cache, not the usage-statistics backup.

For memory safety, this importer currently rejects compressed archives over 512 MiB or conversation JSON entries over 256 MiB, and rejects encrypted or unsupported ZIP formats. The official export may contain highly personal text, so treat it as private data.

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
- The conversation picker combines the currently rendered chat with explicitly imported official conversation exports; it does not fetch an account-wide conversation index.
- Model statistics do not store raw prompts or raw answers. **Official conversation imports are different:** they contain message bodies and are persisted locally in the imported-conversation cache until replaced or cleared.
- The account-model catalog may use the signed-in session in memory, but conversation imports require no account-history API or credentials. Imported files remain local.
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
