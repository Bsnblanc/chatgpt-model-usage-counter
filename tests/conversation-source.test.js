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
    assert.equal(new URL(call.url).searchParams.has("is_starred"), false);
    assert.equal(new URL(call.url).searchParams.has("hide_snorlax"), false);
  });
});

test("account history URLs do not exclude starred or project conversations", () => {
  const active = new URL(source.conversationListUrl("https://chatgpt.com", 0, 100, false, false));
  const archived = new URL(source.conversationListUrl("https://chatgpt.com", 0, 100, true, false));

  [active, archived].forEach((url) => {
    assert.equal(url.searchParams.has("is_starred"), false);
    assert.equal(url.searchParams.has("hide_snorlax"), false);
  });
  assert.equal(active.searchParams.get("is_archived"), "false");
  assert.equal(archived.searchParams.get("is_archived"), "true");
});

test("conversation index uses only explicit folder or project metadata and ignores titles and workspace ids", () => {
  const projectId = "g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const explicit = source.normalizeConversationIndexItem({
    id: "project-0001",
    title: "Ordinary title",
    gizmo_id: projectId,
    conversation_template_id: projectId,
    project_name: "Research"
  });
  const missingName = source.normalizeConversationIndexItem({
    id: "project-0002",
    title: "Research project",
    gizmo_id: projectId,
    conversation_template_id: projectId
  });
  const titleOnly = source.normalizeConversationIndexItem({
    id: "ordinary-0001",
    title: "Folder: Research",
    workspace_id: "workspace-0001"
  });
  const customGpt = source.normalizeConversationIndexItem({
    id: "custom-gpt-0001",
    title: "Custom GPT conversation",
    gizmo_id: "g-customassistant1234567890"
  });
  const invalidProject = source.normalizeConversationIndexItem({
    id: "invalid-project-0001",
    title: "Non-prefixed project field",
    project_id: "project-alpha",
    project_name: "Must not group"
  });
  const folder = source.normalizeConversationIndexItem({
    id: "folder-000001",
    title: "Folder conversation",
    folder_id: "folder-abcdef",
    folder_name: "Saved work"
  });
  const contentEnriched = source.normalizeConversationIndexItem({
    id: "project-0003",
    title: "Content-enriched project",
    projectId,
    projectName: "Sidebar project"
  });
  const suffixedProject = source.normalizeConversationIndexItem({
    id: "project-0004",
    title: "Suffixed project route",
    gizmo_id: `${projectId}-research-route`,
    conversation_template_id: projectId,
    project_name: "Research"
  });

  assert.deepEqual(
    [explicit.gizmoId, explicit.projectId, explicit.projectName, explicit.projectRouteSlug, explicit.groupType],
    [projectId, projectId, "Research", "", "project"]
  );
  assert.deepEqual(
    [missingName.gizmoId, missingName.projectId, missingName.projectName, missingName.groupType],
    [projectId, projectId, "", "project"],
    "the exact project id is retained while content may fill its sidebar name"
  );
  assert.deepEqual(
    [
      titleOnly.gizmoId,
      titleOnly.projectId,
      titleOnly.projectName,
      titleOnly.folderId,
      titleOnly.folderName,
      titleOnly.groupType
    ],
    ["", "", "", "", "", ""],
    "workspace ids and title wording are not folder evidence"
  );
  assert.deepEqual(
    [customGpt.gizmoId, customGpt.projectId, customGpt.projectName, customGpt.groupType],
    ["g-customassistant1234567890", "", "", ""],
    "a non-g-p custom GPT gizmo is preserved but never classified as a project"
  );
  assert.deepEqual(
    [invalidProject.projectId, invalidProject.projectName, invalidProject.groupType],
    ["", "", ""],
    "projectId accepts only the verified g-p prefix"
  );
  assert.deepEqual(
    [folder.folderId, folder.folderName, folder.groupType],
    ["folder-abcdef", "Saved work", "folder"]
  );
  assert.deepEqual(
    [contentEnriched.projectId, contentEnriched.projectName, contentEnriched.groupType],
    [projectId, "Sidebar project", "project"],
    "content-provided sidebar metadata remains stable for the dashboard"
  );
  assert.deepEqual(
    [
      suffixedProject.gizmoId,
      suffixedProject.projectId,
      suffixedProject.projectName,
      suffixedProject.projectRouteSlug,
      suffixedProject.groupType
    ],
    [projectId, projectId, "Research", "research-route", "project"],
    "project route suffixes preserve a non-display matching hint while normalizing the canonical id"
  );
});

test("project route slug survives deduplication so rendered folder names can be matched later", async () => {
  const projectId = "g-p-cccccccccccccccccccccccccccccccc";
  const result = await source.listAccountConversations({
    origin: "https://chatgpt.com",
    fetchImpl: async (url) => {
      const archived = new URL(url).searchParams.get("is_archived") === "true";
      return response({
        items: archived
          ? [{
              ...indexItem("route-slug-0001", true),
              conversation_template_id: projectId
            }]
          : [{
              ...indexItem("route-slug-0001"),
              gizmo_id: `${projectId}-real-folder-name`,
              conversation_template_id: projectId
            }],
        total: 1
      });
    }
  });

  assert.equal(result.conversations.length, 1);
  assert.equal(result.conversations[0].projectId, projectId);
  assert.equal(result.conversations[0].projectRouteSlug, "real-folder-name");
});

test("pagination and archived deduplication preserve verified grouping without duplicating ids", async () => {
  const projectId = "g-p-dddddddddddddddddddddddddddddddd";
  const calls = [];
  const result = await source.listAccountConversations({
    origin: "https://chatgpt.com",
    pageSize: 2,
    fetchImpl: async (url) => {
      calls.push(url);
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset"));
      if (parsed.searchParams.get("is_archived") === "true") {
        return response({
          items: offset === 0
            ? [{
                ...indexItem("duplicate-0001", true),
                gizmo_id: projectId,
                conversation_template_id: projectId
              }]
            : [],
          total: 1
        });
      }
      const active = [
        {
          ...indexItem("duplicate-0001"),
          gizmo_id: projectId,
          conversation_template_id: projectId
        },
        indexItem("ordinary-0002"),
        {
          ...indexItem("duplicate-0001"),
          update_time: "2026-08-23T01:00:00Z",
          gizmo_id: projectId,
          conversation_template_id: projectId,
          project_name: "Paged project"
        },
        {
          ...indexItem("folder-000003"),
          folder_id: "folder-paged",
          folder_name: "Paged folder"
        }
      ];
      return response({ items: active.slice(offset, offset + 2), total: active.length });
    }
  });

  assert.equal(calls.length, 3, "two active pages and one archived page are read");
  assert.deepEqual(
    result.conversations.map((item) => item.id).sort(),
    ["duplicate-0001", "folder-000003", "ordinary-0002"]
  );
  const duplicate = result.conversations.find((item) => item.id === "duplicate-0001");
  const folder = result.conversations.find((item) => item.id === "folder-000003");
  const ordinary = result.conversations.find((item) => item.id === "ordinary-0002");
  assert.equal(duplicate.archived, true);
  assert.deepEqual(
    [duplicate.gizmoId, duplicate.projectId, duplicate.projectName, duplicate.groupType],
    [projectId, projectId, "Paged project", "project"]
  );
  assert.deepEqual(
    [folder.folderId, folder.folderName, folder.groupType],
    ["folder-paged", "Paged folder", "folder"]
  );
  assert.deepEqual(
    [
      ordinary.gizmoId,
      ordinary.projectId,
      ordinary.projectName,
      ordinary.folderId,
      ordinary.folderName,
      ordinary.groupType
    ],
    ["", "", "", "", "", ""]
  );
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

test("archived authorization failure stops without discarding the completed active index", async () => {
  let calls = 0;
  const result = await source.listAccountConversations({
    origin: "https://chatgpt.com",
    fetchImpl: async (url) => {
      calls += 1;
      const archived = new URL(url).searchParams.get("is_archived") === "true";
      return archived
        ? response({}, 403)
        : response({ items: [indexItem("active-0001")], total: 1 });
    }
  });

  assert.equal(calls, 2);
  assert.equal(result.conversations.length, 1);
  assert.equal(result.complete, false);
  assert.equal(result.warnings[0].scope, "archived");
});

test("an operation-stop during active pagination aborts the whole index read", async () => {
  let calls = 0;
  await assert.rejects(
    source.listAccountConversations({
      origin: "https://chatgpt.com",
      pageSize: 1,
      fetchImpl: async (url) => {
        calls += 1;
        const parsed = new URL(url);
        assert.notEqual(parsed.searchParams.get("is_archived"), "true");
        if (calls === 1) {
          return response({ items: [indexItem("active-0001")], total: 2 });
        }
        return {
          ok: false,
          status: 429,
          headers: { get: () => "120" },
          json: async () => ({})
        };
      }
    }),
    (error) => error && error.stopOperation === true && error.status === 429
  );
  assert.equal(calls, 2, "no archived or later index request starts after the stop signal");
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
      concurrency: 1
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

test("conversation collection caps requested concurrency at one account request", async () => {
  let active = 0;
  let peak = 0;
  const ids = ["chat-0001", "chat-0002", "chat-0003", "chat-0004", "chat-0005"];
  const result = await source.collectConversations(ids, {
    exporter,
    origin: "https://chatgpt.com",
    concurrency: 8,
    fetchImpl: async (url) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      const id = decodeURIComponent(new URL(url).pathname.split("/").pop());
      return response(conversationPayload(id));
    }
  });

  assert.equal(peak, 1);
  assert.equal(result.failures.length, 0);
  assert.deepEqual(result.conversations.map((conversation) => conversation.id), ids);
});

test("a long Retry-After stops the entire selected-conversation operation", async () => {
  let calls = 0;
  await assert.rejects(
    source.collectConversations(["chat-0001"], {
      exporter,
      origin: "https://chatgpt.com",
      fetchImpl: async () => {
        calls += 1;
        return {
          ok: false,
          status: 429,
          headers: { get: () => "120" },
          json: async () => ({})
        };
      }
    }),
    (error) => error && error.stopOperation === true && error.status === 429
  );

  assert.equal(calls, 1);
});

test("a long Retry-After stops the remaining selected conversation reads", async () => {
  let calls = 0;
  await assert.rejects(
    source.collectConversations(
      ["chat-0001", "chat-0002", "chat-0003"],
      {
        exporter,
        origin: "https://chatgpt.com",
        concurrency: 1,
        fetchImpl: async () => {
          calls += 1;
          return {
            ok: false,
            status: 429,
            headers: { get: () => "120" },
            json: async () => ({})
          };
        }
      }
    ),
    (error) => error && error.stopOperation === true && error.status === 429
  );

  assert.equal(calls, 1);
});

test("an explicit operation-stop error is not retried as a transient network failure", async () => {
  let calls = 0;
  await assert.rejects(
    source.collectConversations(
      ["chat-0001", "chat-0002", "chat-0003"],
      {
        exporter,
        origin: "https://chatgpt.com",
        concurrency: 1,
        fetchImpl: async () => {
          calls += 1;
          const error = new Error("ChatGPT account read was cancelled.");
          error.stopOperation = true;
          error.cancelled = true;
          throw error;
        }
      }
    ),
    (error) => error && error.stopOperation === true && error.cancelled === true
  );

  assert.equal(calls, 1);
});

test("an authorization failure stops the remaining selected conversation reads", async () => {
  let calls = 0;
  await assert.rejects(
    source.collectConversations(
      ["chat-0001", "chat-0002", "chat-0003"],
      {
        exporter,
        origin: "https://chatgpt.com",
        concurrency: 1,
        fetchImpl: async () => {
          calls += 1;
          return response({}, 401);
        }
      }
    ),
    (error) => error && error.stopOperation === true && error.status === 401
  );

  assert.equal(calls, 1);
});

test("final short throttling stops later selected conversations after one retry", async () => {
  const callsById = {};
  await assert.rejects(
    source.collectConversations(
      ["chat-0001", "chat-0002", "chat-0003"],
      {
        exporter,
        origin: "https://chatgpt.com",
        concurrency: 1,
        random: () => 0,
        fetchImpl: async (url) => {
          const id = decodeURIComponent(new URL(url).pathname.split("/").pop());
          callsById[id] = (callsById[id] || 0) + 1;
          return {
            ok: false,
            status: 429,
            headers: { get: () => "0" },
            json: async () => ({})
          };
        }
      }
    ),
    (error) => error && error.stopOperation === true && error.status === 429
  );

  assert.equal(callsById["chat-0001"], 2);
  assert.equal(callsById["chat-0002"] || 0, 0);
  assert.equal(callsById["chat-0003"] || 0, 0);
});

test("model-catalog style reads can share pacing while disabling automatic retries", async () => {
  let calls = 0;
  await assert.rejects(
    source.requestJson(
      async () => {
        calls += 1;
        return {
          ok: false,
          status: 429,
          headers: { get: () => "0" },
          json: async () => ({})
        };
      },
      "https://chatgpt.com/backend-api/models",
      { requestGapMs: 150, maxAttempts: 1 }
    ),
    /429/
  );
  assert.equal(calls, 1);
});

test("modern account conversation API paginates every older message page before export", async () => {
  const calls = [];
  const directMessage = (id, role, text, model = "") => ({
    id,
    author: { role },
    create_time: Number(id.match(/\d+/)?.[0] || 0),
    content: { content_type: "text", parts: [text] },
    metadata: model ? { model_slug: model } : {}
  });
  const fetchImpl = async (url) => {
    calls.push(url);
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/messages")) {
      assert.equal(parsed.searchParams.get("before"), "message-003");
      return response({
        messages: [
          directMessage("message-001", "user", "Old question"),
          directMessage("message-002", "assistant", "Old answer", "gpt-5-6-thinking")
        ],
        page_info: {
          start_cursor: "message-001",
          end_cursor: "message-002",
          has_previous_page: false,
          has_next_page: true
        }
      });
    }
    return response({
      conversation_id: "modern-0001",
      title: "Modern paginated conversation",
      messages: [
        directMessage("message-003", "user", "New question"),
        directMessage("message-004", "assistant", "New answer", "gpt-5-6-pro")
      ],
      page_info: {
        start_cursor: "message-003",
        end_cursor: "message-004",
        has_previous_page: true,
        has_next_page: false
      }
    });
  };

  const result = await source.fetchConversationById("modern-0001", {
    fetchImpl,
    exporter,
    origin: "https://chatgpt.com"
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/backend-api\/conversations\/modern-0001\?/);
  assert.match(calls[1], /\/backend-api\/conversations\/modern-0001\/messages\?/);
  assert.deepEqual(
    result.messages.map((message) => [message.id, message.model]),
    [
      ["message-001", ""],
      ["message-002", "gpt-5-6-thinking"],
      ["message-003", ""],
      ["message-004", "gpt-5-6-pro"]
    ]
  );
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

test("pagination marks a short page incomplete when the reported total has not been reached", async () => {
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

  assert.equal(result.complete, false);
  assert.equal(result.conversations.length, 2);
  assert.equal(calls, 1);
  assert.match(result.warnings[0].error, /short page.*reported total/i);
});

test("pagination treats a short page as complete when no total is reported", async () => {
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
  assert.equal(result.conversations.length, 2);
  assert.equal(calls, 1, "a short page terminates pagination when the server omits total");
});

test("pagination stops on an empty page after full pages when no total is reported", async () => {
  const items = Array.from({ length: 2 }, (_, index) => indexItem(`empty-stop-${String(index).padStart(4, "0")}`));
  let calls = 0;
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    pageSize: 2,
    fetchImpl: async (url) => {
      calls += 1;
      const offset = Number(new URL(url).searchParams.get("offset"));
      return response({ items: items.slice(offset, offset + 2) });
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.conversations.length, 2);
  assert.equal(calls, 2);
});

test("account history supports the current 224-conversation account without truncation", async () => {
  const items = Array.from({ length: 224 }, (_, index) => indexItem(`current-${String(index).padStart(4, "0")}`));
  let calls = 0;
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    pageSize: 100,
    fetchImpl: async (url) => {
      calls += 1;
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset"));
      const limit = Number(parsed.searchParams.get("limit"));
      return response({ items: items.slice(offset, offset + limit), total: items.length });
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.conversations.length, 224);
  assert.equal(calls, 3);
});

test("account history reads beyond six index pages until the reported total is reached", async () => {
  const items = Array.from({ length: 620 }, (_, index) => indexItem(`large-${String(index).padStart(4, "0")}`));
  let calls = 0;
  const result = await source.listAccountConversations({
    includeArchived: false,
    origin: "https://chatgpt.com",
    pageSize: 100,
    fetchImpl: async (url) => {
      calls += 1;
      const parsed = new URL(url);
      const offset = Number(parsed.searchParams.get("offset"));
      const limit = Number(parsed.searchParams.get("limit"));
      return response({ items: items.slice(offset, offset + limit), total: items.length });
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.stopped, false);
  assert.equal(result.conversations.length, 620);
  assert.equal(calls, 7);
  assert.equal(result.warnings.length, 0);
});

test("selected export reads more than 500 conversations sequentially without a hard rejection", async () => {
  const ids = Array.from({ length: 525 }, (_, index) => `selected-${String(index).padStart(4, "0")}`);
  let calls = 0;
  let active = 0;
  let peak = 0;
  const result = await source.collectConversations(ids, {
    exporter,
    origin: "https://chatgpt.com",
    concurrency: 8,
    fetchImpl: async (url) => {
      calls += 1;
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      const id = decodeURIComponent(new URL(url).pathname.split("/").pop());
      return response(conversationPayload(id));
    }
  });

  assert.equal(result.complete, true);
  assert.equal(result.requestedCount, 525);
  assert.equal(result.conversations.length, 525);
  assert.equal(result.failures.length, 0);
  assert.equal(calls, 525);
  assert.equal(peak, 1);
});

test("one long conversation stops after 50 older-message pages and is explicitly incomplete", async () => {
  const id = "long-conversation";
  let detailCalls = 0;
  let messageCalls = 0;
  const directMessage = (messageId, role) => ({
    id: messageId,
    author: { role },
    create_time: messageCalls + 1,
    content: { content_type: "text", parts: [`${role} ${messageId}`] }
  });
  const result = await source.fetchConversationById(id, {
    exporter,
    origin: "https://chatgpt.com",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (!parsed.pathname.endsWith("/messages")) {
        detailCalls += 1;
        return response({
          conversation_id: id,
          title: "Long conversation",
          messages: [directMessage("message-0105", "assistant")],
          page_info: {
            start_cursor: "message-0105",
            has_previous_page: true
          }
        });
      }
      messageCalls += 1;
      const nextNumber = 105 - messageCalls;
      const messageId = `message-${String(nextNumber).padStart(4, "0")}`;
      return response({
        messages: [directMessage(messageId, messageCalls % 2 ? "user" : "assistant")],
        page_info: {
          start_cursor: messageId,
          has_previous_page: true
        }
      });
    }
  });

  assert.equal(detailCalls, 1);
  assert.equal(messageCalls, 50);
  assert.equal(result.messages.length, 51);
  assert.equal(result.incomplete, true);
  assert.equal(result.stopOperation, true);
  assert.equal(result.incompleteCode, "message-page-limit");
  assert.match(result.warnings[0].error, /remaining messages were not read/i);
});

test("a message-page limit stops the selected export before the next conversation starts", async () => {
  const callsByConversation = {};
  const directMessage = (id, role) => ({
    id,
    author: { role },
    create_time: 1,
    content: { content_type: "text", parts: [`${role} ${id}`] }
  });

  await assert.rejects(
    source.collectConversations(["long-first", "never-second"], {
      exporter,
      origin: "https://chatgpt.com",
      fetchImpl: async (url) => {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/");
        const id = decodeURIComponent(parts[parts.indexOf("conversations") + 1] || parts.at(-1));
        callsByConversation[id] = (callsByConversation[id] || 0) + 1;
        if (!parsed.pathname.endsWith("/messages")) {
          return response({
            conversation_id: id,
            title: id,
            messages: [directMessage(`${id}-latest`, "assistant")],
            page_info: {
              start_cursor: `${id}-latest`,
              has_previous_page: true
            }
          });
        }
        const page = callsByConversation[id] - 1;
        return response({
          messages: [directMessage(`${id}-older-${page}`, page % 2 ? "user" : "assistant")],
          page_info: {
            start_cursor: `${id}-older-${page}`,
            has_previous_page: true
          }
        });
      }
    }),
    (error) => error &&
      error.stopOperation === true &&
      error.incomplete === true &&
      error.code === "message-page-limit"
  );

  assert.equal(callsByConversation["long-first"], 51);
  assert.equal(callsByConversation["never-second"] || 0, 0);
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
