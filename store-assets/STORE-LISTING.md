# Chrome Web Store listing · v1.5.0

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

**Two evidence modes, three display sections**

- Basic: public-model totals resolved from the current signed-in account model catalog.
- Advanced: request model → actual response model, with reasoning effort and linked conversations kept in the same relationship.
- Filter by date, All / Chat / Work, and visible models.
- Independently show or hide the daily line chart, two-level composition donut, and text statistics.
- The line and donut charts use the same in-chart model legend, stable colors, counts, and percentages.
- Open a model in the donut to inspect its reasoning-effort composition, then select an effort to reveal the matching conversations.
- Use System, Light, or Dark theme.
- The in-page panel and toolbar popup share the same saved view, filters, display sections, and icon title bar.

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

### What’s new in v1.5.0

- Line, donut, and text statistics can now be displayed independently or together from one hidden settings menu.
- Line and donut charts now share an in-chart legend, stable model colors, counts, percentages, and visibility choices.
- Advanced statistics keep each exact request route under its own actual response route; missing evidence remains Unknown.
- Reasoning-effort colors, ordering, donut drill-down, and conversation filtering are now consistent across charts and text.
- The title bar now uses aligned icon controls, and compact status layouts fit page and popup surfaces without clipped component rows.
- Conversation indexing now follows the complete paginated account list and preserves project route IDs for accurate project-folder names and selection.
- Toolbar icons now use width-matched badge-safe artwork for one-character, two-character, and `99+` badges, while exports keep the full brand icon and matching PNG watermark.
- Export previews, searchable PDF output, project selection, statistics backup/CSV export, and JSON restore presentation were refined for release.

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

**两种证据口径、三个显示区块**

- Basic：按当前登录账号模型目录解析后的公开模型汇总。
- Advanced：按“请求型号 → 实际回复型号”展示，并在同一关系中保留思考强度和关联对话。
- 支持日期、全部 / Chat / Work 和可见模型筛选。
- 每日折线图、两级环形图和文字统计可分别显示、隐藏，也可同时显示。
- 折线图和环形图共用图内模型图例、稳定颜色、次数、占比和显示选择。
- 点击环形图中的模型可查看思考强度构成，再点击强度即可展开对应对话。
- 支持跟随系统、浅色和深色主题。
- 页面入口与工具栏弹窗共享最后视图、筛选条件、显示区块和图标标题栏。

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

### v1.5.0 更新内容

- 折线图、环形图和文字统计现在可在同一个隐藏式设置菜单中独立启用，也可同时显示。
- 折线图与环形图统一使用图内图例、稳定模型颜色、次数、占比和显示选择。
- Advanced 统计按精确请求型号归类实际回复型号；缺少证据时继续明确显示“未知”。
- 统一思考强度颜色、从低到高排序、环形图下钻和对应对话筛选。
- 标题栏改为水平一致的图标按钮；状态页在页面入口和弹窗紧凑高度下不裁切组件行。
- 对话索引读取完整分页列表，并保留项目路由 ID，以准确绑定项目名称和项目级选择。
- 工具栏会按一位、两位和 `99+` 角标切换对应避让图标；导出文件继续使用完整品牌图标和一致的 PNG 水印。
- 进一步完善导出预览、可搜索 PDF、项目选择、统计备份 / CSV 导出和 JSON 恢复展示。

## Assets

- Screenshots:
  - `screenshots/01-model-statistics-1280x800.png`
  - `screenshots/02-select-chats-formats-1280x800.png`
  - `screenshots/03-readable-exports-1280x800.png`
- Small promotional tile:
  - `promotional/small-promo-440x280.png`
- Marquee promotional tile:
  - `promotional/marquee-1400x560.png`
