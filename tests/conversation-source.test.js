const assert = require("node:assert/strict");
const test = require("node:test");
const source = require("../src/conversation-source");
const exporter = require("../src/exporter");

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function indexItem(id, archived = false) {
  return {
    id,
    title: `Conversation ${id}`,
    update_time: `2026-08-22T00:00:${id.slice(-2).padStart(2, "0")}Z`,
    is_archived: archived
  };
}

function conversationPayload(id) {
  return {
    id,
    title: `Conversation ${id}`,
    current_node: `${id}-assistant`,
    mapping: {
      [`${id}-root`]: { id: `${id}-root`, parent: null, message: null },
      [`${id}-user`]: {
        id: `${id}-user`,
        parent: `${id}-root`,
        message: {
          id: `${id}-user`,
          author: { role: "user" },
          create_time: 1,
          content: { content_type: "text", parts: [`Question ${id}`] }
        }
      },
      [`${id}-assistant`]: {
        id: `${id}-assistant`,
        parent: `${id}-user`,
        message: {
          id: `${id}-assistant`,
          author: { role: "assistant" },
          create_time: 2,
          content: { content_type: "text", parts: [`Answer ${id}`] },
          metadata: { model_slug: "gpt-5.6-sol" }
        }
      }
    }
  };
}

test("account history pagination reads every active and archived page with same-origin credentials", async () => {
  const active = Array.from({ length: 101 }, (_, index) => indexItem(`active-${String(index).padStart(4, "0")}`));
  const archived = [indexItem("archived-0001", true)];
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const parsed = new URL(url);
    const offset = Number(parsed.searchParams.get("offset"));
    const limit = Number(parsed.searchParams.get("limit"));
    const items = parsed.searchParams.get("is_archived") === "true" ? archived : active;
    return response({ items: items.slice(offset, offset + limit), total: items.length });
  };

  const result = await source.listAccountConversations({
    fetchImpl,
    origin: "https://chatgpt.com",
    pageSize: 100
  });

  assert.equal(result.complete, true);
  assert.equal(result.conversations.length, 102);
  assert.equal(calls.length, 3, "active history needs two pages and archived history needs one");
  calls.forEach((call) => {
    assert.equal(call.options.credentials, "include");
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.headers.accept, "application/json");
    assert.equal(new URL(call.url).origin, "https://chatgpt.com");
  });
});

test("archived-history failure keeps active conversations and marks the result incomplete", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.searchParams.get("is_archived") === "true") {
      return response({}, 404);
    }
    return response({ items: [indexItem("active-0001")], total: 1 });
  };

  const result = await source.listAccountConversations({
    fetchImpl,
    origin: "https://chatgpt.com"
  });

  assert.equal(result.conversations.length, 1);
  assert.equal(result.complete, false);
  assert.equal(result.warnings[0].scope, "archived");
});

test("selected conversation collection preserves requested order and reports only failed ids", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const id = decodeURIComponent(new URL(url).pathname.split("/").pop());
    if (id === "broken-0002") {
      return response({}, 500);
    }
    return response(conversationPayload(id));
  };

  const result = await source.collectConversations(
    ["chat-0003", "broken-0002", "chat-0001", "chat-0003"],
    {
      fetchImpl,
      exporter,
      origin: "https://chatgpt.com",
      concurrency: 2
    }
  );

  assert.deepEqual(result.conversations.map((conversation) => conversation.id), ["chat-0003", "chat-0001"]);
  assert.deepEqual(result.failures.map((failure) => failure.id), ["broken-0002"]);
  assert.equal(result.requestedCount, 3, "duplicate ids are fetched once");
  assert.equal(calls.length, 3);
  assert.equal(result.conversations[0].messages[1].model, "gpt-5.6-sol");
});

test("conversation detail retries transient throttling before reporting a failure", async () => {
  let calls = 0;
  const result = await source.collectConversations(["chat-0001"], {
    exporter,
    origin: "https://chatgpt.com",
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => "0" },
          json: async () => ({})
        };
      }
      return response(conversationPayload("chat-0001"));
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.conversations.map((conversation) => conversation.id), ["chat-0001"]);
});

test("conversation source rejects non-ChatGPT origins before making a request", async () => {
  let calls = 0;
  assert.throws(
    () => source.listAccountConversations({
      fetchImpl: async () => {
        calls += 1;
        return response({ items: [] });
      },
      origin: "https://example.com"
    }),
    /only be read from ChatGPT/
  );
  assert.equal(calls, 0);
});

test("pagination stops when a page repeats without adding new conversation ids", async () => {
  let calls = 0;
  const repeated = Array.from({ length: 100 }, (_, index) => indexItem(`repeat-${String(index).padStart(4, "0")}`));
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    fetchImpl: async () => {
      calls += 1;
      return response({ items: repeated, total: 1000 });
    }
  });

  assert.equal(result.conversations.length, 100);
  assert.equal(result.complete, false);
  assert.match(result.warnings[0].error, /repeated a page/i);
  assert.equal(calls, 2, "the repeated second page must terminate pagination");
});

test("pagination follows the reported total when the server returns fewer rows than requested", async () => {
  const items = Array.from({ length: 5 }, (_, index) => indexItem(`clamped-${String(index).padStart(4, "0")}`));
  let calls = 0;
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    pageSize: 100,
    fetchImpl: async (url) => {
      calls += 1;
      const offset = Number(new URL(url).searchParams.get("offset"));
      return response({ items: items.slice(offset, offset + 2), total: items.length });
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.conversations.length, 5);
  assert.equal(calls, 3);
});

test("pagination continues through server-clamped pages when no total is reported", async () => {
  const items = Array.from({ length: 5 }, (_, index) => indexItem(`untotaled-${String(index).padStart(4, "0")}`));
  let calls = 0;
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    pageSize: 100,
    fetchImpl: async (url) => {
      calls += 1;
      const offset = Number(new URL(url).searchParams.get("offset"));
      return response({ items: items.slice(offset, offset + 2) });
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.conversations.length, 5);
  assert.equal(calls, 4, "an empty page proves completion when the server omits total");
});

test("active history retries without is_archived=false when that query shape is unsupported", async () => {
  const calls = [];
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    fetchImpl: async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      if (parsed.searchParams.has("is_archived")) {
        return response({}, 400);
      }
      return response({ items: [indexItem("fallback-0001")], total: 1 });
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.conversations.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.has("is_archived"), false);
});
