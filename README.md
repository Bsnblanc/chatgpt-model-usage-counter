<div align="center">

# ChatGPT Model Usage Counter

<img src="store-assets/promotional/marquee-1400x560.png" alt="ChatGPT Model Usage Counter" width="820" />

**本地统计你的 ChatGPT 模型用量,并一键把对话导出为 JSON / Markdown / PDF / Word / PNG —— 全程本地、隐私优先。**

**Count your ChatGPT usage by model & date, and export chats to JSON / Markdown / PDF / Word / PNG — 100% local, privacy-first.**

[中文说明](#-中文) · [English](#-english) · [下载 / Download](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases)

<img src="store-assets/promotional/small-promo-440x280.png" alt="界面预览 / Preview" width="440" />

</div>

> Manifest V3 Chrome extension · 不联网上传 / nothing uploaded · MIT

---

<a id="-中文"></a>

## 🇨🇳 中文

在你当前的 Chrome 配置里**本地**记录 ChatGPT 的使用情况。它统计的是浏览器观察到的 prompt 提交记录,**不等于** OpenAI 官方账单、额度、速率限制或 token 用量——适合个人复盘和归档。

### ✨ 核心功能

| 功能 | 说明 |
|---|---|
| **按模型统计** | 任意日期范围内,每个模型的 prompt 次数 |
| **折线对比** | 多模型每日用量折线图,图例可多选 |
| **模型详情** | 展开任一模型,看请求参数、功能标签和相关对话索引 |
| **服务状态** | ChatGPT 网页相关的 OpenAI 公共服务状态(来自 `status.openai.com`) |
| **导出对话** | 导出为 **JSON / Markdown / PDF / Word / PNG**;PDF / Word / PNG 按 ChatGPT 阅读排版渲染(标题、加粗、列表、表格、代码块,中英文都正确) |
| **隐私优先** | 统计与设置只存 `chrome.storage.local`,无发布者服务器,不上传任何内容 |

### 🚀 零基础部署(三步装好)

> 不用会写代码,只要会**下载、解压、在 Chrome 里点几下**。

1. **下载安装包** —— 打开 [Releases 页面](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases),下载最新的 `chatgpt-model-usage-counter-*.zip`。
2. **解压** —— 右键解压成一个文件夹。
   > ⚠️ Chrome 的"加载已解压的扩展程序"**不能直接选 zip**,必须先解压成文件夹。
3. **加载到 Chrome** ——
   1. 地址栏打开 `chrome://extensions/`;
   2. 打开右上角 **开发者模式 / Developer mode**;
   3. 点 **加载已解压的扩展程序 / Load unpacked**,选刚解压出来的**文件夹**(里面要有 `manifest.json`)。
4. **开始用** —— 回到已登录的 <https://chatgpt.com/> 页面并**刷新**,从页面内入口或浏览器工具栏的插件图标打开统计面板。

> 💡 第一次建议先从工具栏插件图标打开,确认扩展已加载;然后提交一条新消息、回面板点刷新,模型次数就开始记录。已经开了很久的标签页记得先刷新一次。

支持 `https://chatgpt.com/*`,并兼容 `https://chat.openai.com/*`。

### 🔒 隐私

- 统计与设置只存在当前 Chrome 配置的 `chrome.storage.local`。
- 记录可能包含:模型名、请求参数、功能标签、时间、页面标题 / URL、对话 ID、prompt 长度、prompt 哈希。
- **不存**:prompt 原文、回答原文、密码、Cookie、Authorization header、访问令牌。
- 对话内容只在你主动勾选并点击导出时读取;导出文件本地生成,经 Chrome 下载保存。
- 状态视图只请求 `status.openai.com` 的公开数据。

完整用户指南见 [USAGE.md](./USAGE.md),隐私政策见 [PRIVACY.md](./PRIVACY.md)。

---

<a id="-english"></a>

## 🇬🇧 English

Records your ChatGPT usage **locally**, in your current Chrome profile. It counts prompt submissions observed in the browser — these are **local usage records** and do **not** represent OpenAI billing, official quota, rate limits, or token usage. Use it for personal review and archiving.

### ✨ Features

| Feature | What it does |
|---|---|
| **Per-model stats** | Prompt counts per model over any date range |
| **Compare models** | Daily usage line chart with a multi-select legend |
| **Model details** | Expand any model for request parameters, feature tags, and a conversation index |
| **Service status** | ChatGPT-web-related OpenAI public status from `status.openai.com` |
| **Export chats** | Export to **JSON / Markdown / PDF / Word / PNG**; PDF / Word / PNG render in a ChatGPT-style reading layout (headings, bold, lists, tables, code blocks; CJK + Latin both correct) |
| **Privacy-first** | Statistics and settings live only in `chrome.storage.local`; no publisher server, nothing uploaded |

### 🚀 Zero-to-running in 3 steps

> No coding needed — just **download, unzip, and a few clicks in Chrome**.

1. **Download** the latest `chatgpt-model-usage-counter-*.zip` from the [Releases page](https://github.com/Bsnblanc/chatgpt-model-usage-counter/releases).
2. **Unzip** it into a folder.
   > ⚠️ Chrome's "Load unpacked" **cannot select a zip** — unzip to a folder first.
3. **Load into Chrome** —
   1. Open `chrome://extensions/`;
   2. Turn on **Developer mode** (top-right);
   3. Click **Load unpacked** and pick the **unzipped folder** (the one containing `manifest.json`).
4. **Start using it** — open a logged-in <https://chatgpt.com/> tab and **refresh**, then open the panel from the in-page entry or the toolbar icon.

> 💡 First time, open it from the toolbar icon to confirm it loaded; submit a new message, refresh the panel, and counts start recording. Refresh long-open tabs once.

Supports `https://chatgpt.com/*` and keeps `https://chat.openai.com/*` compatible.

### 🔒 Privacy

- Statistics and settings are stored locally in `chrome.storage.local` (current Chrome profile).
- Records may include: model names, request parameters, feature tags, timestamps, page title / URL, conversation ID, prompt length, and a prompt hash.
- **Never stored**: raw prompts, raw responses, passwords, cookies, authorization headers, or access tokens.
- Conversation content is read only for conversations you select and export; files are generated locally via Chrome downloads.
- The status view requests public data from `status.openai.com` only.

See [USAGE.md](./USAGE.md) for the full guide and [PRIVACY.md](./PRIVACY.md) for the privacy policy.

---

## 🛠️ Development

```bash
node --test            # run the test suite
npm run check:syntax   # syntax-check all source files
```

## License

[MIT](./LICENSE)
