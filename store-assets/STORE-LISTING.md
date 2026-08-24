# Chrome Web Store listing · v1.4.0

## English

### Short description

Track ChatGPT model usage locally and export selected chats or project folders in five readable formats.

### Detailed description

ChatGPT Model Usage Counter gives you a local, auditable view of how ChatGPT is used in the current Chrome profile.

**Accurate model relationships**

- Counts each user submission once.
- Keeps the selected public model, request model, and actual response model as separate evidence.
- Supports both Chat and Work.
- Keeps new or unmapped internal model slugs exact instead of guessing an older model name.
- Shows missing evidence as Unknown rather than substituting another field.

**Two statistics views**

- Basic: public-model totals resolved from the current signed-in account model catalog.
- Advanced: request model → actual response model, with reasoning effort and linked conversations kept in the same relationship.
- Filter by date, All / Chat / Work, and visible models.
- Switch between a daily trend line and a two-level composition donut.
- Use System, Light, or Dark theme.
- The in-page panel and toolbar popup share the same saved view and settings.

**Explicit conversation export**

- The current chat appears first.
- Select one chat, several chats, all chats, or an entire project folder.
- Search and clear the list without losing the current scroll position.
- Export JSON, Markdown, PDF, DOCX, or PNG.
- One selected chat downloads as one file.
- Multiple selected chats download as one ZIP with one file per conversation and an integrity report.

**Statistics data tools**

- Export a restorable Backup JSON.
- Export readable Records CSV.
- Import a supported backup to replace the current statistics after confirmation.

**Local and account-safe by design**

- Statistics and files are generated locally; there is no publisher-operated server.
- Model statistics passively observe requests the user already initiated.
- The extension does not send prompts, rewrite requests, replay requests, or crawl conversations in the background.
- Account catalog and conversation reads require a user action, use one shared request scheduler, and respect throttling and stop conditions.
- Credentials, cookies, authorization headers, access tokens, account IDs, raw prompts, and raw answers are not stored in usage statistics.

This extension is an independent local utility. It is not an official OpenAI billing, quota, rate-limit, or token counter.

### What’s new in v1.4.0

- Added Chat and Work source tracking in one deduplicated event chain.
- Added Basic public-model and Advanced internal-model statistics.
- Added request model → actual response model relationships with inline reasoning effort.
- Added daily line and two-level model → reasoning-effort donut charts.
- Added shared popup/page state, System / Light / Dark themes, hidden section controls, and filter-aware toolbar badge totals.
- Added project-aware conversation grouping and project-level selection.
- Added Backup JSON, Records CSV, and replace-style statistics import.
- Improved JSON, Markdown, PDF, DOCX, and PNG exports, including single-file and multi-chat ZIP behavior.
- Added future-model handling, long-term aggregates, safer account-request scheduling, and clearer Unknown/error states.

## 中文

### 简短说明

在本地统计 ChatGPT 模型使用，并将选中的对话或项目文件夹导出为五种清晰格式。

### 详细说明

ChatGPT 模型使用统计在当前 Chrome 配置中本地记录 ChatGPT 的使用情况，并让每条统计关系可以核对。

**准确的模型关系**

- 每次用户提交只统计一次。
- 分别保留公开选择、请求型号和实际回复型号。
- 同时支持 Chat 与 Work。
- 新型号无法映射时保留完整内部 slug，不猜测为旧型号。
- 缺少可信证据时显示“未知”，不使用其他字段冒充。

**两种统计口径**

- Basic：按当前登录账号模型目录解析后的公开模型汇总。
- Advanced：按“请求型号 → 实际回复型号”展示，并在同一关系中保留思考强度和关联对话。
- 支持日期、全部 / Chat / Work 和可见模型筛选。
- 可切换每日趋势折线图和两级模型 → 思考强度环形图。
- 支持跟随系统、浅色和深色主题。
- 页面入口与工具栏弹窗共享最后视图和全部设置。

**用户逐项选择的对话导出**

- 当前对话排在首位。
- 可选择一个、多个、全部对话或整个项目文件夹。
- 支持搜索、全选和清空。
- 支持 JSON、Markdown、PDF、DOCX 和 PNG。
- 单选直接下载一个文件。
- 多选下载一个 ZIP，每段对话一个文件并附完整性报告。

**统计数据管理**

- 导出可恢复的 Backup JSON。
- 导出可阅读的 Records CSV。
- 用户确认后，可导入受支持备份并替换当前统计。

**本地处理与账号安全**

- 统计和文件都在浏览器本地生成，没有发布者服务器。
- 模型统计只被动观察用户已经发起的请求。
- 不自动发送 prompt，不改写或重放请求，不在后台批量抓取对话。
- 账号模型目录和对话读取都需要用户主动操作，并通过单请求调度、间隔、限流和停止条件控制。
- 使用统计不保存凭据、Cookie、Authorization、访问令牌、账号 ID、prompt 原文或回答原文。

本扩展是独立的本地工具，不代表 OpenAI 官方账单、额度、速率限制或 token 统计。

### v1.4.0 更新内容

- Chat 与 Work 使用同一条去重事件链。
- 新增 Basic 公开模型与 Advanced 内部型号统计。
- 新增请求型号 → 实际回复型号关系，并在对应回复型号旁显示思考强度。
- 新增每日折线图和两级模型 → 思考强度环形图。
- 新增多入口共享状态、系统 / 浅色 / 深色主题、隐藏式区块设置和随筛选变化的工具栏角标。
- 新增项目目录分组和项目级全选。
- 新增统计 Backup JSON、Records CSV 和替换式导入。
- 改进 JSON、Markdown、PDF、DOCX、PNG，以及单文件和多对话 ZIP 导出。
- 加强新型号兼容、长期聚合、账号请求调度和未知 / 错误状态展示。

## Assets

- Screenshots:
  - `screenshots/01-model-statistics-1280x800.png`
  - `screenshots/02-select-chats-formats-1280x800.png`
  - `screenshots/03-readable-exports-1280x800.png`
- Small promotional tile:
  - `promotional/small-promo-440x280.png`
- Marquee promotional tile:
  - `promotional/marquee-1400x560.png`
