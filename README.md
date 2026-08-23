<div align="center">

# ChatGPT Model Usage Counter

<img src="store-assets/promotional/marquee-1400x560.png" alt="ChatGPT Model Usage Counter" width="820" />

**按 ChatGPT 公开模型和日期本地统计用量，并从对话列表中勾选一个或多个导出为 JSON / Markdown / PDF / Word / PNG。**

**Count ChatGPT usage by public model and date, then select one or more conversations to export as JSON / Markdown / PDF / Word / PNG.**

[中文说明](#-中文) · [English](#-english) · [下载 / Download](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases)

<img src="store-assets/promotional/small-promo-440x280.png" alt="界面预览 / Preview" width="440" />

</div>

> Manifest V3 Chrome extension · 无发布者服务器 / no publisher server · MIT

---

## 真实界面 / Actual interface

<p align="center">
  <img src="store-assets/screenshots/01-model-statistics-1280x800.png" alt="Exact model statistics and daily chart" width="49%" />
  <img src="store-assets/screenshots/02-select-chats-formats-1280x800.png" alt="Conversation checklist with multi-select and five export formats" width="49%" />
</p>

<p align="center">
  <img src="store-assets/screenshots/03-readable-exports-1280x800.png" alt="Verified readable PDF, DOCX, and PNG exports" width="78%" />
</p>

<a id="-中文"></a>

## 🇨🇳 中文

在你当前的 Chrome 配置里**本地**记录 ChatGPT 的使用情况。它统计的是浏览器观察到的 prompt 提交记录,**不等于** OpenAI 官方账单、额度、速率限制或 token 用量——适合个人复盘和归档。

### ✨ 核心功能

| 功能 | 说明 |
|---|---|
| **按实际回复统计** | 每次提交只计一次；最终助手消息的实际 `model_slug` 决定精确调用型号，请求路由和用户所选公开模型分别保留 |
| **正确公开名称** | 公开名称由实际回复 slug、当前账号实时模型目录中的版本/预设绑定和提交时选择共同确定；共享 slug 不再只看 `models[].title` 而误归类 |
| **新模型兼容** | 尚未映射的新回复 slug 原样保留并标记，不猜测、不并入旧模型；新出现且已有计数的模型默认勾选显示，用户主动取消的旧模型保持取消 |
| **折线对比** | 多模型每日用量折线图,图例可多选 |
| **Chat / Work 统一统计** | 普通对话和 Work 都按同一次真实提交记录公开选择、请求型号、实际回复型号、请求思考强度、功能、来源模式和对应对话 |
| **模型详情** | 每个公开模型按“请求型号 → 实际回复型号”展示；思考强度、功能和对应对话都挂在该关系下，不再拆成无法核对的独立总表 |
| **服务状态** | 合并 `status.openai.com` 的官方摘要和完整组件接口，显示全部相关 ChatGPT 网页条目，不任意截断 |
| **导出对话** | 当前对话固定在列表首位并在首次打开时默认勾选；用户仍可逐项选择一个、多个或全选，再导出为 **JSON / Markdown / PDF / Word / PNG**；取消当前对话后不会被刷新重新选中，勾选时也不重建列表或改变滚动位置 |
| **单选与批量** | 单选直接下载一个文件；多选或全选下载一个 ZIP，每段对话一个独立文件并附完整性报告 |
| **可读排版** | PDF / Word / PNG 渲染标题、加粗、列表、表格、代码块和中英文；超长 PDF 正确分页，超长 PNG 仍生成一张完整图片 |
| **账号请求保护** | 对话正文只在用户点击导出后按已选项读取；详情请求最多 2 路并发并主动错峰，遇到限流遵守退避，长时间限流直接停止该项而不提前重试 |
| **隐私优先** | 统计与设置只存 `chrome.storage.local`；导出文件在浏览器本地生成，不上传到发布者服务器 |

### 🚀 零基础部署(四步装好)

> 不用会写代码,只要会**下载、解压、在 Chrome 里点几下**。

1. **下载安装包** —— 打开 [Releases 页面](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases),下载最新的 `chatgpt-model-usage-counter-*.zip`。
2. **解压** —— 右键解压成一个文件夹。
   > ⚠️ Chrome 的"加载已解压的扩展程序"**不能直接选 zip**,必须先解压成文件夹。
3. **加载到 Chrome** ——
   1. 地址栏打开 `chrome://extensions/`;
   2. 打开右上角 **开发者模式 / Developer mode**;
   3. 点 **加载已解压的扩展程序 / Load unpacked**,选刚解压出来的**文件夹**(里面要有 `manifest.json`)。
4. **开始用** —— 回到已登录的 <https://chatgpt.com/> 页面并**刷新**,从任一受支持 ChatGPT 页面右上角入口或浏览器工具栏的插件图标打开统计面板。

> 💡 第一次建议先从工具栏插件图标打开,确认扩展已加载;然后提交一条新消息、回面板点刷新,模型次数就开始记录。已经开了很久的标签页记得先刷新一次。

支持 `https://chatgpt.com/*`,并兼容 `https://chat.openai.com/*`。

### 🔒 隐私

- 统计与设置只存在当前 Chrome 配置的 `chrome.storage.local`。
- 记录可能包含:公开模型名、用户所选公开模型、请求型号、实际回复型号、请求参数、功能标签、时间、页面标题 / URL、对话 ID、prompt 长度和 prompt 哈希。
- **不存**:prompt 原文、回答原文、密码、Cookie、Authorization header、访问令牌。
- 主统计先读取请求路由作为待定值；最终助手回复出现后，用其消息元数据中的实际回复型号原地更正，不增加第二次计数。推理节点不得覆盖最终回复节点，回答正文自称的模型永不作为统计证据。
- ChatGPT 公开模型名称来自当前登录账号的同源模型目录。目录中的 `versions[].intelligence_presets` 是内部 slug 与当前可选公开模型的明确绑定，优先于可能同 slug 的回退 `models[].title`。例如当前付费账号把 `gpt-5-6` 的 Instant 预设绑定到 GPT-5.6 Sol 时，必须统计为 Sol；没有该版本绑定的账号才按自身模型标题处理。
- 扩展只在用户打开统计面板或出现新的未映射回复 slug 时，按需通过同源只读的 `/backend-api/models` 取得目录；清理后的模型 slug、公开标题、版本/预设绑定和分类名称只保存在当前浏览器会话的 `chrome.storage.session`，会话结束后自动清除。页面加载不会自动读取目录，`401`、`403`、`429` 不自动重试。
- `selectedPublicModel`、请求型号和实际回复型号始终分别保留；界面未直接显示 Model 时，只在精确请求路由与实时账号目录能够唯一确定时补回所选公开模型。
- 普通对话和 Work 使用同一条统计事件链：发送时保存 `selectedPublicModel`、`requestModel`、请求中的 `reasoning.effort`、功能和 `sourceMode`；最终回复出现后把 `responseModel` 和真实对话 ID 更新到同一事件，次数保持一次。Work 页面显示的强度文字不替代请求正文证据；请求没有强度字段时明确显示“未提供”。
- 升级时会清除旧版本仅凭 DOM 标签形成、又没有最终回复证据的伪精确事件；若旧记录已有精确实际回复，只保留该回复证据并把无法证明的请求型号标为未取得。
- 进入导出页后，扩展会从当前已登录的 ChatGPT 同源会话分页读取对话索引（ID、标题、时间和归档状态）；请求不添加会排除星标或项目/工作区对话的筛选参数，并为每段可用对话显示复选框。
- 点击格式按钮后，扩展只读取用户已勾选的对话正文。它调用 ChatGPT 同源账号历史接口；所需账号令牌只在内容脚本内存中临时使用，连续 30 秒没有账号历史请求后即释放，不持久化、不记录、不导出，也不发送到 ChatGPT 之外。接口不可用时回退到当前页面和已加载侧边栏，并明确标记结果不完整。
- 对话详情最多 2 路并发并设置请求间隔；收到 `429` 或 `Retry-After` 时统一退避。服务端要求等待超过 60 秒时停止该项并报告失败，不会提前重试、绕过限流或在后台扫描正文。
- 单个对话直接下载；多个已选对话下载一个 ZIP，内含每段对话的独立文件和 `_export-report.json` 完整性报告。
- 状态视图只请求 `status.openai.com` 的公开 `summary.json` 和 `components.json`。组件完整接口可用时显示全部匹配条目；只有摘要可用时明确提示当前列表不完整。

完整用户指南见 [USAGE.md](./USAGE.md),隐私政策见 [PRIVACY.md](./PRIVACY.md)。

---

<a id="-english"></a>

## 🇬🇧 English

Records your ChatGPT usage **locally**, in your current Chrome profile. It counts prompt submissions observed in the browser — these are **local usage records** and do **not** represent OpenAI billing, official quota, rate limits, or token usage. Use it for personal review and archiving.

### ✨ Features

| Feature | What it does |
|---|---|
| **Actual-response stats** | Each submission counts once; the final assistant message's `model_slug` determines the exact response model, while request route and selected public model remain separate |
| **Correct public names** | Public names combine the final response slug, live account version/preset bindings, and the submit-time selection; a shared slug is never classified from `models[].title` alone |
| **Future-model support** | An unmapped new response slug stays exact and marked unmapped instead of being guessed or merged; newly counted models are selected by default while models the user cleared stay cleared |
| **Compare models** | Daily usage line chart with a multi-select legend |
| **Chat / Work coverage** | Chat and Work use the same one-submission event, preserving the public selection, request slug, final response slug, requested reasoning effort, features, source mode, and linked conversation |
| **Model details** | Each public model is broken down as request slug → final response slug, with reasoning effort, features, and conversations kept under that exact relationship |
| **Service status** | Merges the official `status.openai.com` summary and complete component feeds, with no arbitrary component truncation |
| **Export chats** | The current conversation appears first and is checked on the first load; the user can then tick one, several, or all active, project/workspace, and archived chats for **JSON / Markdown / PDF / Word / PNG**. Clearing the current chat remains respected, and checking an item does not rebuild or scroll the list |
| **Single and batch** | One selected chat downloads as one file; multiple selected chats download as one ZIP with one independent file per conversation and an integrity report |
| **Readable layout** | PDF / Word / PNG render headings, bold, lists, tables, code blocks, CJK, and Latin; long PDFs paginate correctly and a long PNG remains one complete image |
| **Account-request safeguards** | Conversation bodies are read only after an export click and only for checked items; detail reads use at most two paced workers, back off on rate limits, and stop rather than retrying before a long `Retry-After` expires |
| **Privacy-first** | Statistics and settings live in `chrome.storage.local`; exports are generated in the browser and are never uploaded to a publisher server |

### 🚀 Zero-to-running in 4 steps

> No coding needed — just **download, unzip, and a few clicks in Chrome**.

1. **Download** the latest `chatgpt-model-usage-counter-*.zip` from the [Releases page](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases).
2. **Unzip** it into a folder.
   > ⚠️ Chrome's "Load unpacked" **cannot select a zip** — unzip to a folder first.
3. **Load into Chrome** —
   1. Open `chrome://extensions/`;
   2. Turn on **Developer mode** (top-right);
   3. Click **Load unpacked** and pick the **unzipped folder** (the one containing `manifest.json`).
4. **Start using it** — open a logged-in <https://chatgpt.com/> tab and **refresh**, then open the panel from the top-right entry on any supported ChatGPT page or from the toolbar icon.

> 💡 First time, open it from the toolbar icon to confirm it loaded; submit a new message, refresh the panel, and counts start recording. Refresh long-open tabs once.

Supports `https://chatgpt.com/*` and keeps `https://chat.openai.com/*` compatible.

### 🔒 Privacy

- Statistics and settings are stored locally in `chrome.storage.local` (current Chrome profile).
- Records may include: public model name, selected public model, request slug, actual response slug, request parameters, feature tags, timestamps, page title / URL, conversation ID, prompt length, and a prompt hash.
- **Never stored**: raw prompts, raw responses, passwords, cookies, authorization headers, or access tokens.
- The request route is initially recorded as a provisional identity. When the final assistant answer appears, its metadata response slug reconciles the same event in place without adding another count. A reasoning node cannot override the final node, and a model claim in answer text is never evidence.
- Public model names come from the signed-in account's same-origin model catalog. An explicit `versions[].intelligence_presets` binding outranks a fallback `models[].title` when both expose the same internal slug. The selected public model, request slug, and final response slug remain independently auditable.
- The catalog is requested read-only and same-origin from `/backend-api/models` only when the user opens the statistics panel or a new unmapped response slug appears. The sanitized model slugs, public titles, version/preset bindings, and category labels live only in `chrome.storage.session` and disappear when the browser session ends. Page load does not fetch the catalog, and `401`, `403`, or `429` is not retried automatically.
- Chat and Work share one event pipeline: submit-time selection, request slug, request `reasoning.effort`, features, and `sourceMode` are retained, then the final response slug and real conversation ID reconcile that same event without increasing the count. Work's visible effort text is not used as a substitute for request evidence; a missing request field is shown as “Not provided.”
- During upgrades, legacy pending events derived only from DOM labels and lacking final-response evidence are removed from exact statistics. If an exact legacy response exists, it is retained while an unproven request slug is marked unavailable rather than inferred from old page text.
- Opening the export view paginates the conversation index (IDs, titles, timestamps, and archive state) from the logged-in, same-origin ChatGPT session. It does not add filters that exclude starred or project/workspace chats, and renders one checkbox per available conversation.
- Clicking a format reads only the checked conversation bodies. The extension uses ChatGPT same-origin account-history requests; the required account token is held only in content-script memory, released after 30 seconds without an account-history request, and never persisted, logged, exported, or sent outside ChatGPT. If account-history retrieval fails, it falls back to the rendered page and loaded sidebar and marks the result incomplete.
- Conversation-detail reads use at most two paced workers. A `429` or `Retry-After` applies shared backoff; if the server asks for more than 60 seconds, that item stops with a reported failure instead of retrying early, bypassing limits, or scanning bodies in the background.
- One checked conversation downloads directly. Multiple checked conversations download as one ZIP containing one file per chat plus an `_export-report.json` integrity report.
- The status view requests only the public `summary.json` and `components.json` feeds from `status.openai.com`. It shows every matching component when the complete feed is available and explicitly warns when only the summary fallback is available.

See [USAGE.md](./USAGE.md) for the full guide and [PRIVACY.md](./PRIVACY.md) for the privacy policy.

---

## 🛠️ Development

```bash
node --test            # run the test suite
npm run check:syntax   # syntax-check all source files
```

## License

[MIT](./LICENSE)
