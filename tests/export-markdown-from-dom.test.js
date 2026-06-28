const assert = require("node:assert/strict");
const test = require("node:test");
const exporter = require("../src/exporter");

// ChatGPT 在页面里把助手消息的 Markdown 渲染成 HTML(.markdown 容器内是 h1/strong/table/pre…)。
// 旧抓取用 innerText,会把 ## ** | ``` 记号全抹掉,导出成同字号纯文字。
// 这里构造接近真实的渲染 DOM,验证抓取能把 HTML 还原回 Markdown,渲染器才有层级可排版。

function T(s) { return { nodeType: 3, nodeValue: s, textContent: s, childNodes: [] }; }

function E(tag, opts) {
  opts = opts || {};
  const children = opts.children || (opts.text != null ? [T(opts.text)] : []);
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    className: opts.className || "",
    childNodes: children,
    children: children.filter((c) => c.nodeType === 1),
    innerText: null,
    getAttribute(k) {
      if (k === "href") { return opts.href || null; }
      if (opts.attrs && Object.prototype.hasOwnProperty.call(opts.attrs, k)) { return opts.attrs[k]; }
      return null;
    }
  };
  Object.defineProperty(node, "textContent", {
    get() { return children.map((c) => c.textContent).join(""); }
  });
  node.querySelectorAll = (sel) => collect(node, sel);
  node.querySelector = (sel) => { const r = collect(node, sel); return r.length ? r[0] : null; };
  return node;
}

function collect(node, sel) {
  const tags = String(sel).split(",").map((s) => s.trim());
  const out = [];
  (function walk(n) {
    (n.children || []).forEach((c) => {
      const hit = tags.some((t) =>
        t.charAt(0) === "."
          ? (" " + (c.className || "") + " ").indexOf(" " + t.slice(1) + " ") >= 0
          : c.tagName.toLowerCase() === t
      );
      if (hit) { out.push(c); }
      walk(c);
    });
  })(node);
  return out;
}

function messageNode(role, markdownEl, fallbackText) {
  const attrs = { "data-message-author-role": role };
  if (role === "assistant") { attrs["data-message-model-slug"] = "gpt-5-5-thinking"; }
  return {
    getAttribute: (k) => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
    querySelector: (sel) => {
      if (sel === ".markdown") { return markdownEl && /(^|\s)markdown(\s|$)/.test(markdownEl.className) ? markdownEl : null; }
      if (sel === ".whitespace-pre-wrap") { return markdownEl && /whitespace-pre-wrap/.test(markdownEl.className) ? markdownEl : null; }
      return collect(markdownEl, sel)[0] || null;
    },
    innerText: fallbackText,
    textContent: fallbackText
  };
}

function fakeDoc(nodes, href) {
  return {
    title: "导出格式真机结构 - ChatGPT",
    location: { href },
    querySelectorAll: (sel) => (sel === "[data-message-author-role]" ? nodes : [])
  };
}

test("collectConversationFromDom 把已渲染 HTML 还原为 Markdown(标题/加粗/列表/代码/表格/引用)", () => {
  const markdownEl = E("div", { className: "markdown prose", children: [
    E("h1", { text: "一级标题" }),
    E("p", { children: [T("正文与 "), E("strong", { text: "加粗" }), T(" 文字。")] }),
    E("h2", { text: "二级标题" }),
    E("ul", { children: [E("li", { text: "列表项一" }), E("li", { text: "列表项二" })] }),
    E("pre", { children: [E("code", { text: "const x = 1;" })] }),
    E("table", { children: [
      E("tr", { children: [E("th", { text: "项目" }), E("th", { text: "状态" })] }),
      E("tr", { children: [E("td", { text: "标题" }), E("td", { text: "有" })] })
    ] }),
    E("blockquote", { children: [E("p", { text: "引用文字" })] })
  ] });
  // 助手消息回退文本是"已渲染的纯文字"(模拟 innerText),用来对比:还原后必须比它多出 Markdown 记号
  const flatInnerText = "一级标题 正文与 加粗 文字。 二级标题 列表项一 列表项二 const x = 1; 项目 状态 标题 有 引用文字";
  const userEl = E("div", { className: "whitespace-pre-wrap", text: "演示导出排版" });

  const conv = exporter.collectConversationFromDom(fakeDoc([
    messageNode("user", userEl, "演示导出排版"),
    messageNode("assistant", markdownEl, flatInnerText)
  ], "https://chatgpt.com/c/abc123def456"));

  assert.equal(conv.messages.length, 2);
  const md = conv.messages[1].text;

  assert.match(md, /^# 一级标题/m, "h1 → #");
  assert.match(md, /^## 二级标题/m, "h2 → ##");
  assert.match(md, /\*\*加粗\*\*/, "strong → **加粗**");
  assert.match(md, /^- 列表项一$/m, "li → - 项");
  assert.match(md, /^- 列表项二$/m, "li → - 项");
  assert.match(md, /```\nconst x = 1;\n```/, "pre>code → 围栏代码块");
  assert.match(md, /\| 项目 \| 状态 \|/, "表格表头行");
  assert.match(md, /\|\s*---\s*\|\s*---\s*\|/, "表格分隔行");
  assert.match(md, /\| 标题 \| 有 \|/, "表格数据行");
  assert.match(md, /^> 引用文字/m, "blockquote → >");

  // 关键反证:还原结果必须真的带 Markdown 记号,而不是退回 innerText 的平铺纯文字
  assert.notEqual(md, flatInnerText, "不能是 innerText 平铺文本");
  assert.ok(md.indexOf("#") >= 0 && md.indexOf("|") >= 0, "确含标题与表格记号");

  // 用户消息按原样保留(不走 Markdown 还原)
  assert.match(conv.messages[0].text, /演示导出排版/);
});

test("collectConversationFromDom 在没有 .markdown 容器时安全回退到纯文本", () => {
  const plain = E("div", { className: "whitespace-pre-wrap", text: "只有纯文字 没有结构" });
  const conv = exporter.collectConversationFromDom(fakeDoc([
    messageNode("assistant", plain, "只有纯文字 没有结构")
  ], "https://chatgpt.com/c/xyz789abc012"));
  assert.equal(conv.messages.length, 1);
  assert.match(conv.messages[0].text, /只有纯文字 没有结构/);
});
