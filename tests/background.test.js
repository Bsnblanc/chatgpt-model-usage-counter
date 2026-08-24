const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const background = require("../src/background");

function runtimeModelCatalog() {
  return {
    observedAt: "2026-08-22T12:00:00.000Z",
    models: [
      { slug: "gpt-5-6", title: "GPT-5.6 Luna", reasoning_type: "auto" },
      { slug: "gpt-5-6-mini", title: "GPT-5.6 Luna", reasoning_type: "none" },
      { slug: "auto", title: "Auto", reasoning_type: "auto" }
    ],
    versions: [
      {
        id: "5.6",
        display_text: "Latest • 5.6",
        display_text_for_intelligence: "GPT-5.6 Sol",
        short_display_text_for_intelligence: "5.6 Sol",
        slugs: ["gpt-5-6"],
        intelligence_presets: [
          { title: "Instant", selected_display_title: "Instant", selected_display_version: "5.6", model_slug: "gpt-5-6", lane: "instant" }
        ]
      },
      {
        id: "auto",
        display_text_for_intelligence: "Auto",
        slugs: ["auto"],
        intelligence_presets: []
      }
    ],
    categories: [
      { human_category_name: "Instant", human_category_short_name: "5.6 Luna", default_model: "gpt-5-6", supported_models: ["gpt-5-6"] },
      { human_category_name: "Auto", default_model: "auto", supported_models: [] }
    ]
  };
}

const SUPPORTED_USAGE_FEATURES = ["agent_mode", "audio", "canvas", "deep_research", "image_generation", "realtime", "web_search"];
const SUPPORTED_USAGE_FEATURE_NAMES = {
  agent_mode: "Agent mode",
  audio: "Audio",
  canvas: "Canvas",
  deep_research: "Deep research",
  image_generation: "Image generation",
  realtime: "Realtime",
  web_search: "Web search"
};

test("account request coordinator exports the enforced single-request safety limits", () => {
  assert.equal(background.ACCOUNT_REQUEST_MAX_CONCURRENCY, 1);
  assert.equal(background.ACCOUNT_REQUEST_MIN_GAP_MS, 1000);
  assert.equal(background.ACCOUNT_REQUEST_MAX_INTERACTIVE_WAIT_MS, 60000);
});

function acquireAccountPermit(tabId, url = "https://chatgpt.com/") {
  return new Promise((resolve) => {
    background._testAccountRequests.acquire(
      { tab: { id: tabId, url }, url },
      resolve
    );
  });
}

function completeAccountPermit(tabId, permitId, status = 200, retryAfterMs = 0, url = "https://chatgpt.com/") {
  return new Promise((resolve) => {
    background._testAccountRequests.complete(
      { permitId, status, retryAfterMs },
      { tab: { id: tabId, url }, url },
      resolve
    );
  });
}

test("two ChatGPT tabs share one global request-start interval", async () => {
  background._testAccountRequests.reset();
  const first = await acquireAccountPermit(101);
  assert.equal(first.granted, true);
  const startedAt = Date.now();
  const secondPromise = acquireAccountPermit(202, "https://chat.openai.com/");
  await completeAccountPermit(101, first.permitId);
  const second = await secondPromise;
  const elapsed = Date.now() - startedAt;

  assert.equal(second.granted, true);
  assert.ok(elapsed >= 900, `second tab started after only ${elapsed} ms`);
  await completeAccountPermit(202, second.permitId, 200, 0, "https://chat.openai.com/");
  background._testAccountRequests.reset();
});

test("a 429 cooldown in one tab blocks every other ChatGPT tab", async () => {
  background._testAccountRequests.reset();
  const first = await acquireAccountPermit(303);
  const startedAt = Date.now();
  const secondPromise = acquireAccountPermit(404);
  await completeAccountPermit(303, first.permitId, 429, 1500);
  const second = await secondPromise;
  const elapsed = Date.now() - startedAt;

  assert.equal(second.granted, true);
  assert.ok(elapsed >= 1400, `shared Retry-After cooldown lasted only ${elapsed} ms`);
  await completeAccountPermit(404, second.permitId);

  const longBlock = await acquireAccountPermit(505);
  await completeAccountPermit(505, longBlock.permitId, 429, 120000);
  const rejected = await acquireAccountPermit(606);
  assert.equal(rejected.granted, false);
  assert.equal(rejected.stopOperation, true);
  assert.equal(rejected.status, 429);
  assert.ok(rejected.retryAfterMs > 60000);
  background._testAccountRequests.reset();
});

test("the persisted coordinator snapshot contains timing only and no account credentials", async () => {
  background._testAccountRequests.reset();
  const permit = await acquireAccountPermit(707);
  const snapshot = background._testAccountRequests.snapshot();
  const serialized = JSON.stringify(snapshot);

  assert.deepEqual(Object.keys(snapshot).sort(), ["permits", "states", "version"]);
  assert.match(serialized, /nextStartAt/);
  assert.match(serialized, /cooldownUntil/);
  assert.match(serialized, /expiresAt/);
  assert.doesNotMatch(serialized, /authorization|bearer|cookie|access.?token|account.?id/i);

  await completeAccountPermit(707, permit.permitId);
  background._testAccountRequests.reset();
});

test("statistics import rebuilds events from a strict whitelist and drops sensitive parameter identifiers", () => {
  const submittedAt = "2026-08-24T12:00:00.000Z";
  const model = "gpt-5-6-thinking";
  const stats = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "safe-import-event-0001",
      requestModel: model,
      apiModel: model,
      modelObservedSource: "webRequest",
      modelParameters: {
        model,
        "reasoning.effort": "high",
        prompt_cache_key: "cache-secret",
        safety_identifier: "account-secret"
      },
      sourceMode: "chat",
      source: "send-button",
      submittedAt,
      pageUrl: "https://chatgpt.com/c/safe-import-event-0001",
      pageTitle: "Safe import event"
    },
    new Date(submittedAt)
  );
  const raw = JSON.parse(JSON.stringify(stats));
  const rawEvent = raw.events[0];
  rawEvent.authorization = "Bearer must-not-persist";
  rawEvent.cookie = "session=must-not-persist";
  rawEvent.access_token = "must-not-persist";
  rawEvent.prompt = "private prompt";
  rawEvent.response = "private response";
  rawEvent.runtimeModelCatalog = { accountId: "private-account" };
  rawEvent.unknownNestedState = { secret: "must-not-persist" };
  rawEvent.constructor = { prototype: { polluted: true } };
  rawEvent.prototype = { polluted: true };
  Object.defineProperty(rawEvent, "__proto__", {
    value: { polluted: true },
    enumerable: true,
    configurable: true
  });

  const restored = background.sanitizeStatisticsBackup({
    format: background.STATISTICS_BACKUP_FORMAT,
    formatVersion: background.STATISTICS_BACKUP_VERSION,
    exportedAt: submittedAt,
    extensionVersion: "1.3.3",
    statistics: raw
  }).statistics;
  const event = restored.events[0];
  const serialized = JSON.stringify(restored);

  assert.equal(event.requestModel, model);
  assert.equal(event.modelParameters.model, model);
  assert.equal(event.modelParameters["reasoning.effort"], "high");
  assert.equal(event.modelParameters.prompt_cache_key, undefined);
  assert.equal(event.modelParameters.safety_identifier, undefined);
  assert.equal(event.authorization, undefined);
  assert.equal(event.cookie, undefined);
  assert.equal(event.access_token, undefined);
  assert.equal(event.prompt, undefined);
  assert.equal(event.response, undefined);
  assert.equal(event.runtimeModelCatalog, undefined);
  assert.equal(event.unknownNestedState, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "__proto__"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "prototype"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(event, "constructor"), false);
  assert.equal(Object.prototype.polluted, undefined);
  assert.doesNotMatch(
    serialized,
    /must-not-persist|private prompt|private response|private-account|cache-secret|account-secret/
  );
});

test("computeBadgeCount shows only the selected date range, not the all-time total", () => {
  // 用户:角标不要显示全部总数,只显示面板所选日期范围内的次数。
  const stats = {
    total: 999,
    byDate: {
      "2026-06-02": { "gpt-5-thinking": 7, "o3": 1 },
      "2026-06-03": { "gpt-5-thinking": 27, "o3": 3 },
      "2026-06-27": { "gpt-5-thinking": 50 }
    }
  };
  // 选 06-02~06-03:7+1+27+3 = 38(不含范围外 06-27 的 50)
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-02", endDate: "2026-06-03" }), 38);
  // 叠加模型过滤:只 gpt-5-thinking = 7+27 = 34
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-02", endDate: "2026-06-03", models: ["gpt-5-thinking"] }), 34);
  // 只选范围外那天:50
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-27", endDate: "2026-06-27" }), 50);
  // 颠倒起止也能算(自动交换)
  assert.equal(background.computeBadgeCount(stats, { startDate: "2026-06-03", endDate: "2026-06-02" }), 38);
  // 空过滤器视为无过滤
  assert.equal(background.sanitizeBadgeFilter({ startDate: "", endDate: "", models: [] }), null);
});

test("OpenAI status refresh forces a fresh fetch instead of serving a stale failed cache", () => {
  // 用户:ChatGPT 网页状态点刷新也获取不到、刷新按钮没用。根因是上次抓取失败(ok:false)被缓存后,
  // 之后每次 openai.status.get 都直接返回旧的失败缓存,且刷新没带 cached:false。
  const bg = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  const dash = fs.readFileSync(path.join(__dirname, "..", "src", "dashboard.js"), "utf8");
  // 后台:只有成功且有内容的缓存才直接返回,否则强制重新抓取
  assert.match(bg, /hasGoodCache\s*=\s*statusRecord\s*&&\s*statusRecord\.ok\s*&&\s*statusRecord\.status/);
  assert.match(bg, /if\s*\(hasGoodCache\s*&&\s*message\.cached\s*!==\s*false\)/);
  // 面板:刷新(force=true)时带 cached:false,真正走网络重新抓取
  assert.match(dash, /"openai\.status\.get",\s*cached:\s*force\s*\?\s*false\s*:\s*true/);
  assert.match(dash, /loadOpenAIStatus\(state,\s*force\)/);
});

test("applyIncrement updates totals, daily stats, events, and total count", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "gpt-5-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "gpt-5-thinking" },
      source: "send-button",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/123",
      pageTitle: "Conversation title",
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["gpt-5-thinking"], 1);
  assert.equal(next.byDate["2026-05-23"]["gpt-5-thinking"], 1);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].model, "gpt-5-thinking");
  assert.equal(next.events[0].apiModel, "gpt-5-thinking");
  assert.equal(next.events[0].chatgptModel, "gpt-5-thinking");
  assert.equal(next.events[0].modelParameters.model, "gpt-5-thinking");
  assert.equal(next.events[0].conversationId, "123");
  assert.equal(next.events[0].pageTitle, "Conversation title");
  assert.equal(next.models["gpt-5-thinking"].apiModel, "gpt-5-thinking");
  assert.equal(next.sessionsByModel["gpt-5-thinking"]["123"].count, 1);
  assert.equal(next.sessionsByModel["gpt-5-thinking"]["123"].title, "Conversation title");
  assert.equal(background.totalCount(next), 1);
});

test("GPT-5.6 Sol is the primary count while gpt-5-6-thinking remains an internal variant", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-thinking",
      responseObservedAt: now.toISOString(),
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-thinking",
      model: "GPT-5.6 Sol",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking", "reasoning.effort": "xhigh" },
      runtimeModelCatalog: runtimeModelCatalog(),
      source: "enter-key",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/gpt56-sol",
      pageTitle: "GPT-5.6 Sol verification",
      promptHash: "gpt56-sol",
      promptLength: 20
    },
    now
  );

  assert.equal(next.totals["GPT-5.6 Sol"], 1);
  assert.equal(next.totals["gpt-5-6-thinking"], undefined);
  assert.equal(next.events[0].model, "GPT-5.6 Sol");
  assert.equal(next.events[0].publicModel, "GPT-5.6 Sol");
  assert.equal(next.events[0].requestModel, "gpt-5-6-thinking");
  assert.equal(next.events[0].responseModel, "gpt-5-6-thinking");
  assert.equal(next.events[0].apiModel, "gpt-5-6-thinking");
  assert.equal(next.events[0].chatgptModel, "GPT-5.6 Sol");
  assert.equal(next.events[0].modelMappingStatus, "mapped");
  assert.equal(next.models["GPT-5.6 Sol"].requestModel, "gpt-5-6-thinking");
  assert.equal(next.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-thinking"].count, 1);
  assert.deepEqual(next.parametersByModel["GPT-5.6 Sol"].fields.model, { "gpt-5-6-thinking": 1 });
});

test("Work keeps its explicit public model while preserving exact request, response, effort, features, and conversation", () => {
  const now = new Date("2026-08-22T16:30:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "5.6 Terra",
      publicModel: "5.6 Terra",
      selectedPublicModel: "5.6 Terra",
      selectedPublicModelSource: "work-selector-dom",
      requestModel: "gpt-5.6-terra-wm",
      responseModel: "gpt-5.6-terra-wm",
      responseObservedAt: now.toISOString(),
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5.6-terra-wm",
      modelObservedSource: "webRequest",
      modelParameters: {
        model: "gpt-5.6-terra-wm",
        "reasoning.effort": "high"
      },
      usageFeatures: ["web_search", "connectors"],
      sourceMode: "work",
      source: "enter-key",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/work-terra-0001",
      pageTitle: "Work Terra verification",
      promptHash: "work-terra",
      promptLength: 12
    },
    now
  );

  assert.deepEqual(next.totals, { "5.6 Terra": 1 });
  assert.equal(next.events[0].sourceMode, "work");
  assert.equal(next.events[0].selectedPublicModel, "5.6 Terra");
  assert.equal(next.events[0].selectedPublicModelSource, "work-selector-dom");
  assert.equal(next.events[0].requestModel, "gpt-5.6-terra-wm");
  assert.equal(next.events[0].responseModel, "gpt-5.6-terra-wm");
  assert.equal(next.events[0].modelParameters["reasoning.effort"], "high");
  assert.deepEqual(next.events[0].usageFeatures, ["connectors", "web_search"]);

  const relations = Object.values(next.relationsByModel["5.6 Terra"]);
  assert.equal(relations.length, 1);
  assert.equal(relations[0].count, 1);
  assert.deepEqual(relations[0].efforts, { high: 1 });
  assert.deepEqual(relations[0].features, { connectors: 1, web_search: 1 });
  assert.deepEqual(relations[0].sourceModes, { work: 1 });
  assert.equal(relations[0].conversations["work-terra-0001"].count, 1);
  assert.equal(relations[0].conversations["work-terra-0001"].sourceMode, "work");

  const afterAnotherSubmission = background.applyIncrement(
    next,
    {
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-thinking",
      responseObservedAt: new Date(now.getTime() + 1000).toISOString(),
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      modelObservedSource: "webRequest",
      modelParameters: {
        model: "gpt-5-6-pro",
        "reasoning.effort": "xhigh",
      },
      runtimeModelCatalog: runtimeModelCatalog(),
      usageFeatures: ["file_upload"],
      sourceMode: "chat",
      source: "enter-key",
      submittedAt: new Date(now.getTime() + 1000).toISOString(),
      pageUrl: "https://chatgpt.com/c/chat-sol-0001",
      pageTitle: "Chat Sol verification",
      promptHash: "chat-sol",
      promptLength: 8,
    },
    new Date(now.getTime() + 1000),
  );
  const preservedWorkEvent = afterAnotherSubmission.events.find(
    (event) => event.conversationId === "work-terra-0001",
  );
  assert.equal(afterAnotherSubmission.totals["5.6 Terra"], 1);
  assert.equal(afterAnotherSubmission.totals["gpt-5.6-terra-wm"], undefined);
  assert.equal(preservedWorkEvent.model, "5.6 Terra");
  assert.equal(preservedWorkEvent.modelMappingStatus, "selector");
  assert.equal(preservedWorkEvent.publicModelSource, "work-selector+same-route");
  assert.equal(
    Object.values(afterAnotherSubmission.relationsByModel["5.6 Terra"])[0]
      .conversations["work-terra-0001"].sourceMode,
    "work",
  );
});

test("Work preserves an explicit public model whose product name contains Pro", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "5.6 Pro",
      selectedPublicModel: "5.6 Pro",
      selectedPublicModelSource: "work-selector-dom",
      requestModel: "gpt-5.6-pro-wm",
      responseModel: "gpt-5.6-pro-wm",
      responseObservedAt: now.toISOString(),
      responseObservedSource: "message-dom:model-slug",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5.6-pro-wm" },
      sourceMode: "work",
      source: "send-button",
      submittedAt: now.toISOString(),
      submissionId: "work-pro-0001"
    },
    now
  );

  assert.deepEqual(next.totals, { "5.6 Pro": 1 });
  assert.equal(next.events[0].selectedPublicModel, "5.6 Pro");
  assert.equal(next.events[0].requestModel, "gpt-5.6-pro-wm");
  assert.equal(next.events[0].responseModel, "gpt-5.6-pro-wm");
});

test("Project conversations do not count as GPTs while real custom GPT conversations do", () => {
  const now = new Date("2026-08-23T12:05:00.000Z");
  const base = {
    requestModel: "gpt-5-6-thinking",
    apiModel: "gpt-5-6-thinking",
    modelObservedSource: "webRequest",
    modelParameters: { model: "gpt-5-6-thinking" },
    sourceMode: "chat",
    usageFeatures: ["gpts", "web_search"]
  };
  const project = background.applyIncrement(
    background.createEmptyStats(),
    {
      ...base,
      submissionId: "project-feature-0001",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/g/g-p-project123/c/project-conversation"
    },
    now
  );
  const custom = background.applyIncrement(
    project,
    {
      ...base,
      submissionId: "custom-gpt-feature-0001",
      submittedAt: new Date(now.getTime() + 1000).toISOString(),
      pageUrl: "https://chatgpt.com/g/g-custom123/c/custom-conversation"
    },
    new Date(now.getTime() + 1000)
  );

  const projectEvent = custom.events.find((event) => event.submissionId === "project-feature-0001");
  const customEvent = custom.events.find((event) => event.submissionId === "custom-gpt-feature-0001");
  const countedModel = customEvent.model;
  assert.deepEqual(projectEvent.usageFeatures, ["web_search"]);
  assert.deepEqual(customEvent.usageFeatures, ["gpts", "web_search"]);
  assert.equal(projectEvent.model, countedModel);
  assert.equal(custom.featuresByModel[countedModel].features.gpts.count, 1);
  assert.equal(custom.featuresByModel[countedModel].features.web_search.count, 2);
});

test("history normalization removes legacy Project GPTs without deleting custom GPT usage", () => {
  const now = new Date("2026-08-23T12:06:00.000Z");
  const model = "gpt-5-6-thinking";
  const event = (submissionId, pageUrl, submittedAt) => ({
    submissionId,
    model,
    publicModel: model,
    requestModel: model,
    requestModelEvidence: "trusted",
    responseModel: "",
    apiModel: model,
    chatgptModel: model,
    modelObservedSource: "webRequest",
    modelParameters: { model },
    usageFeatures: ["gpts"],
    sourceMode: "chat",
    submittedAt,
    pageUrl
  });
  const projectEvents = Array.from({ length: 15 }, (_unused, index) => event(
    `legacy-project-gpts-${index + 1}`,
    `https://chatgpt.com/g/g-p-project${index + 1}/c/project-conversation-${index + 1}`,
    new Date(now.getTime() + index * 1000).toISOString()
  ));
  const customEvent = event(
    "legacy-custom-gpts",
    "https://chatgpt.com/g/g-custom123/c/custom-conversation",
    new Date(now.getTime() + 15000).toISOString()
  );
  const existing = {
    version: 1,
    totals: { [model]: 16 },
    byDate: { "2026-08-23": { [model]: 16 } },
    models: {
      [model]: {
        label: model,
        publicModel: model,
        requestModel: model,
        apiModel: model,
        chatgptModel: model,
        observedSource: "webRequest",
        parameters: { model }
      }
    },
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {
      [model]: {
        total: 16,
        features: {
          gpts: { id: "gpts", count: 16 }
        }
      }
    },
    parametersByModel: {},
    relationsByModel: {},
    events: [customEvent].concat(projectEvents.slice().reverse()),
    eventHistoryComplete: true,
    lastUpdated: customEvent.submittedAt
  };

  const normalized = background.applyIncrement(existing, {}, now);
  const normalizedCustom = normalized.events.find((item) => item.submissionId === "legacy-custom-gpts");
  const normalizedProjects = normalized.events.filter((item) => /^legacy-project-gpts-/.test(item.submissionId));

  assert.equal(normalizedProjects.length, 15);
  normalizedProjects.forEach((item) => assert.deepEqual(item.usageFeatures, []));
  assert.deepEqual(normalizedCustom.usageFeatures, ["gpts"]);
  assert.equal(new Set(normalizedProjects.map((item) => item.model)).size, 1);
  assert.equal(normalizedProjects[0].model, normalizedCustom.model);
  assert.equal(normalized.featuresByModel[normalizedCustom.model].features.gpts.count, 1);
});

test("incomplete history subtracts only known Project GPTs and preserves custom GPT plus untracked aggregate usage", () => {
  const model = "future-family-2029-thinking";
  const submittedAt = "2026-08-23T12:07:00.000Z";
  const event = (submissionId, pageUrl) => ({
    submissionId,
    model,
    publicModel: model,
    requestModel: model,
    requestModelEvidence: "trusted",
    responseModel: "",
    apiModel: model,
    chatgptModel: model,
    modelObservedSource: "webRequest",
    modelParameters: { model },
    usageFeatures: ["gpts"],
    sourceMode: "chat",
    submittedAt,
    pageUrl
  });
  const projectEvent = event(
    "partial-project-gpts",
    "https://chatgpt.com/g/g-p-project123?view=project"
  );
  const customEvent = event(
    "partial-custom-gpts",
    "https://chatgpt.com/g/g-custom123/c/custom-conversation"
  );
  const existing = {
    version: 1,
    totals: { [model]: 3 },
    byDate: { "2026-08-23": { [model]: 3 } },
    models: {
      [model]: {
        label: model,
        publicModel: model,
        requestModel: model,
        apiModel: model,
        chatgptModel: model,
        observedSource: "webRequest",
        parameters: { model }
      }
    },
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {
      [model]: {
        total: 3,
        features: {
          gpts: { id: "gpts", count: 3 }
        }
      }
    },
    parametersByModel: {},
    relationsByModel: {
      [model]: {
        [`${model}\u0001`]: {
          requestModel: model,
          responseModel: "",
          count: 3,
          efforts: { unspecified: 3 },
          features: { gpts: 3 },
          sourceModes: { chat: 3 },
          conversations: {},
          firstSubmittedAt: submittedAt,
          lastSubmittedAt: submittedAt
        }
      }
    },
    events: [customEvent, projectEvent],
    eventHistoryComplete: false,
    lastUpdated: submittedAt
  };

  const normalized = background.applyIncrement(existing, {}, new Date(submittedAt));
  const normalizedProject = normalized.events.find((item) => item.submissionId === "partial-project-gpts");
  const normalizedCustom = normalized.events.find((item) => item.submissionId === "partial-custom-gpts");
  const relation = normalized.relationsByModel[model][`${model}\u0001`];

  assert.equal(normalized.eventHistoryComplete, false);
  assert.deepEqual(normalizedProject.usageFeatures, []);
  assert.deepEqual(normalizedCustom.usageFeatures, ["gpts"]);
  assert.equal(normalized.featuresByModel[model].features.gpts.count, 2);
  assert.equal(normalized.featuresByModel[model].total, 2);
  assert.equal(relation.count, 3);
  assert.equal(relation.features.gpts, 2);
});

test("a pending new chat keeps one temporary conversation contribution until the final response supplies its real id", () => {
  const now = new Date("2026-08-22T16:31:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "pending-root-0001",
      requestModel: "gpt-5-6-thinking",
      apiModel: "gpt-5-6-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking" },
      sourceMode: "chat",
      source: "enter-key",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/",
      pageTitle: "ChatGPT",
      promptHash: "pending-root",
      promptLength: 8
    },
    now
  );

  const model = Object.keys(next.totals)[0];
  const relation = Object.values(next.relationsByModel[model])[0];
  assert.equal(relation.count, 1);
  assert.equal(Object.values(relation.conversations).reduce((sum, item) => sum + item.count, 0), 1);
  assert.equal(relation.conversations["pending:pending-root-0001"].sourceMode, "chat");
  assert.deepEqual(relation.sourceModes, { chat: 1 });
});

test("GPT-5.6 Pro effort counts under Sol while the internal pro slug remains a variant", () => {
  const now = new Date("2026-08-22T14:55:48.197Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      publicModel: "GPT-5.6 Luna",
      selectedPublicModel: "GPT-5.6 Luna",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-pro",
      responseObservedAt: now.toISOString(),
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      model: "GPT-5.6 Luna",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-pro" },
      runtimeModelCatalog: runtimeModelCatalog(),
      source: "enter-key",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/gpt56-pro",
      pageTitle: "GPT-5.6 Pro verification",
      promptHash: "gpt56-pro",
      promptLength: 9
    },
    now
  );

  assert.deepEqual(next.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(next.events[0].model, "GPT-5.6 Sol");
  assert.equal(next.events[0].publicModel, "GPT-5.6 Sol");
  assert.equal(next.events[0].requestModel, "gpt-5-6-pro");
  assert.equal(next.events[0].responseModel, "gpt-5-6-pro");
  assert.equal(next.events[0].selectedPublicModel, "GPT-5.6 Luna");
  assert.equal(next.events[0].selectedPublicModelSource, "selector-dom");
  assert.equal(next.events[0].modelMode, "pro");
  assert.equal(next.events[0].publicModelSource, "account-catalog:version-intelligence");
  assert.equal(next.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-pro"].count, 1);
  assert.equal(next.totals["GPT-5.6 Luna"], undefined);
});

test("a missing selector snapshot is recovered from the exact request and live account catalog", () => {
  const now = new Date("2026-08-22T14:57:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-pro",
      responseObservedAt: now.toISOString(),
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-pro" },
      runtimeModelCatalog: runtimeModelCatalog(),
      source: "enter-key",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/inferred-selector",
      promptHash: "inferred-selector",
      promptLength: 8
    },
    now
  );

  assert.deepEqual(next.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(next.events[0].selectedPublicModel, "GPT-5.6 Sol");
  assert.equal(next.events[0].selectedPublicModelSource, "request+account-catalog");
});

test("actual response slug overrides the requested route while preserving the request parameter", () => {
  const base = {
    runtimeModelCatalog: runtimeModelCatalog(),
    modelObservedSource: "webRequest",
    source: "send-button",
    pageUrl: "https://chatgpt.com/c/response-first",
    pageTitle: "Response first",
    submittedAt: "2026-08-22T15:00:00.000Z",
    promptLength: 8
  };

  const routedToSol = background.applyIncrement(
    background.createEmptyStats(),
    {
      ...base,
      submissionId: "response-first-sol",
      model: "GPT-5.6 Luna",
      publicModel: "GPT-5.6 Luna",
      selectedPublicModel: "GPT-5.6 Luna",
      requestModel: "gpt-5-6",
      responseModel: "gpt-5-6-pro",
      responseObservedAt: base.submittedAt,
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6",
      modelMode: "",
      modelParameters: { model: "gpt-5-6" },
      promptHash: "route-sol"
    },
    new Date(base.submittedAt)
  );
  assert.deepEqual(routedToSol.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(routedToSol.events[0].requestModel, "gpt-5-6");
  assert.equal(routedToSol.events[0].responseModel, "gpt-5-6-pro");
  assert.equal(routedToSol.events[0].modelMode, "pro");
  assert.equal(routedToSol.events[0].runtimeModelCatalog, undefined);
  assert.deepEqual(routedToSol.parametersByModel["GPT-5.6 Sol"].fields.model, { "gpt-5-6": 1 });
  assert.equal(routedToSol.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-pro"].count, 1);

  const routedToLuna = background.applyIncrement(
    background.createEmptyStats(),
    {
      ...base,
      submissionId: "response-first-luna",
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-mini",
      responseObservedAt: base.submittedAt,
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      modelMode: "pro",
      modelParameters: { model: "gpt-5-6-pro" },
      promptHash: "route-luna"
    },
    new Date(base.submittedAt)
  );
  assert.deepEqual(routedToLuna.totals, { "GPT-5.6 Luna": 1 });
  assert.equal(routedToLuna.events[0].requestModel, "gpt-5-6-pro");
  assert.equal(routedToLuna.events[0].responseModel, "gpt-5-6-mini");
  assert.equal(routedToLuna.events[0].modelMode, "");
  assert.equal(routedToLuna.events[0].runtimeModelCatalog, undefined);
  assert.equal(routedToLuna.variantsByModel["GPT-5.6 Luna"].variants["gpt-5-6-mini"].count, 1);
});

test("visible labels and answer text cannot override exact response metadata", () => {
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "body-claim-is-not-evidence",
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-mini",
      responseModel: "gpt-5-6-mini",
      responseObservedAt: "2026-08-22T15:01:00.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-mini",
      chatgptModel: "GPT-5.6 Sol",
      modelMode: "pro",
      modelParameters: { model: "gpt-5-6-mini" },
      runtimeModelCatalog: runtimeModelCatalog(),
      modelObservedSource: "webRequest",
      source: "send-button",
      pageUrl: "https://chatgpt.com/c/body-claim",
      pageTitle: "The answer says Sol",
      submittedAt: "2026-08-22T15:01:00.000Z",
      promptHash: "body-claim",
      promptLength: 12
    },
    new Date("2026-08-22T15:01:00.000Z")
  );

  assert.deepEqual(next.totals, { "GPT-5.6 Luna": 1 });
  assert.equal(next.events[0].selectedPublicModel, "GPT-5.6 Sol");
  assert.equal(next.events[0].responseModel, "gpt-5-6-mini");
  assert.equal(next.events[0].modelIdentitySource, "response-model");
});

test("a bare response slug without final assistant metadata remains response-pending", () => {
  const submittedAt = "2026-08-22T15:01:30.000Z";
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "unproven-response",
      requestModel: "future-family-2029-thinking",
      responseModel: "future-family-2029-pro",
      apiModel: "future-family-2029-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "future-family-2029-thinking" },
      sourceMode: "chat",
      submittedAt,
      pageUrl: "https://chatgpt.com/c/unproven-response"
    },
    new Date(submittedAt)
  );
  const relation = Object.values(next.relationsByModel["future-family-2029-thinking"])[0];

  assert.deepEqual(next.totals, { "future-family-2029-thinking": 1 });
  assert.equal(next.events[0].requestModel, "future-family-2029-thinking");
  assert.equal(next.events[0].responseModel, "");
  assert.equal(next.events[0].responseObservedAt, undefined);
  assert.equal(relation.responseModel, "");
});

test("Auto remains the selected request route while the actual response decides the primary count", () => {
  const pending = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "auto-pending",
      model: "Auto",
      publicModel: "Auto",
      selectedPublicModel: "Auto",
      requestModel: "auto",
      apiModel: "auto",
      modelParameters: { model: "auto" },
      runtimeModelCatalog: runtimeModelCatalog(),
      modelObservedSource: "webRequest",
      source: "send-button",
      pageUrl: "https://chatgpt.com/c/auto-pending",
      submittedAt: "2026-08-22T15:02:00.000Z",
      promptHash: "auto-pending",
      promptLength: 4
    },
    new Date("2026-08-22T15:02:00.000Z")
  );
  assert.deepEqual(pending.totals, { Auto: 1 });
  assert.equal(pending.events[0].requestModel, "auto");
  assert.equal(pending.events[0].responseModel, "");
  assert.equal(pending.events[0].selectedPublicModel, "Auto");

  const resolved = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "auto-routed",
      model: "Auto",
      publicModel: "Auto",
      selectedPublicModel: "Auto",
      requestModel: "auto",
      responseModel: "gpt-5-6-thinking",
      responseObservedAt: "2026-08-22T15:03:00.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "auto",
      modelParameters: { model: "auto" },
      runtimeModelCatalog: runtimeModelCatalog(),
      modelObservedSource: "webRequest",
      source: "send-button",
      pageUrl: "https://chatgpt.com/c/auto-routed",
      submittedAt: "2026-08-22T15:03:00.000Z",
      promptHash: "auto-routed",
      promptLength: 4
    },
    new Date("2026-08-22T15:03:00.000Z")
  );
  assert.deepEqual(resolved.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(resolved.events[0].selectedPublicModel, "Auto");
  assert.equal(resolved.events[0].requestModel, "auto");
  assert.equal(resolved.events[0].responseModel, "gpt-5-6-thinking");
  assert.deepEqual(resolved.parametersByModel["GPT-5.6 Sol"].fields.model, { auto: 1 });
  assert.equal(resolved.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-thinking"].count, 1);
});

test("an unknown new response slug is preserved exactly and never renamed by stale selector text", () => {
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "future-response",
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-pro",
      responseModel: "future-family-2027-thinking",
      responseObservedAt: "2026-08-22T15:04:00.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      modelParameters: { model: "gpt-5-6-pro" },
      runtimeModelCatalog: runtimeModelCatalog(),
      modelObservedSource: "webRequest",
      source: "send-button",
      pageUrl: "https://chatgpt.com/c/future-response",
      submittedAt: "2026-08-22T15:04:00.000Z",
      promptHash: "future-response",
      promptLength: 6
    },
    new Date("2026-08-22T15:04:00.000Z")
  );

  assert.deepEqual(next.totals, { "future-family-2027-thinking": 1 });
  assert.equal(next.events[0].publicModel, "future-family-2027-thinking");
  assert.equal(next.events[0].chatgptModel, "future-family-2027-thinking");
  assert.equal(next.events[0].responseModel, "future-family-2027-thinking");
  assert.equal(next.events[0].modelMappingStatus, "unmapped");
  assert.equal(next.events[0].publicModelSource, "unmapped-response-slug");
});

test("late response reconciliation moves one existing count without incrementing total and is idempotent", () => {
  const submittedAt = "2026-08-22T15:05:00.000Z";
  const initial = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "late-response",
      model: "GPT-5.6 Luna",
      publicModel: "GPT-5.6 Luna",
      selectedPublicModel: "GPT-5.6 Luna",
      selectedPublicMode: "instant",
      selectedPublicModeLabel: "Instant",
      selectedPublicModeSource: "selector-dom:model-control",
      requestModel: "gpt-5-6-mini",
      apiModel: "gpt-5-6-mini",
      modelParameters: { model: "gpt-5-6-mini", "reasoning.effort": "xhigh" },
      usageFeatures: ["web_search"],
      runtimeModelCatalog: runtimeModelCatalog(),
      modelObservedSource: "webRequest",
      source: "send-button",
      pageUrl: "https://chatgpt.com/c/late-response",
      pageTitle: "Late response",
      submittedAt,
      promptHash: "late-response",
      promptLength: 13
    },
    new Date(submittedAt)
  );
  assert.deepEqual(initial.totals, { "GPT-5.6 Luna": 1 });

  const reconciled = background.applyResponseObservation(
    initial,
    {
      submissionId: "late-response",
      conversationId: "late-response",
      responseModel: "gpt-5-6-pro",
      runtimeModelCatalog: runtimeModelCatalog(),
      observedSource: "message-dom:model-slug",
      observedAt: "2026-08-22T15:05:20.000Z"
    },
    new Date("2026-08-22T15:05:20.000Z")
  );

  assert.equal(background.totalCount(reconciled), 1);
  assert.deepEqual(reconciled.totals, { "GPT-5.6 Sol": 1 });
  assert.deepEqual(reconciled.byDate["2026-08-22"], { "GPT-5.6 Sol": 1 });
  assert.equal(reconciled.events.length, 1);
  assert.equal(reconciled.events[0].submissionId, "late-response");
  assert.equal(reconciled.events[0].requestModel, "gpt-5-6-mini");
  assert.equal(reconciled.events[0].responseModel, "gpt-5-6-pro");
  assert.equal(reconciled.events[0].selectedPublicMode, "instant");
  assert.equal(reconciled.events[0].selectedPublicModeLabel, "Instant");
  assert.equal(reconciled.events[0].selectedPublicModeSource, "selector-dom:model-control");
  assert.equal(reconciled.events[0].responseObservedSource, "message-dom:model-slug");
  assert.equal(reconciled.events[0].runtimeModelCatalog, undefined);
  assert.equal(reconciled.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-pro"].count, 1);
  assert.deepEqual(reconciled.parametersByModel["GPT-5.6 Sol"].fields.model, { "gpt-5-6-mini": 1 });
  assert.equal(reconciled.featuresByModel["GPT-5.6 Sol"].features.web_search.count, 1);
  assert.equal(reconciled.sessionsByModel["GPT-5.6 Sol"]["late-response"].count, 1);
  assert.equal(reconciled.totals["GPT-5.6 Luna"], undefined);

  const repeated = background.applyResponseObservation(
    reconciled,
    {
      submissionId: "late-response",
      responseModel: "gpt-5-6-pro",
      observedSource: "message-dom:model-slug",
      observedAt: "2026-08-22T15:05:21.000Z"
    },
    new Date("2026-08-22T15:05:21.000Z")
  );
  assert.equal(background.totalCount(repeated), 1);
  assert.deepEqual(repeated.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(repeated.events.length, 1);
  assert.deepEqual(repeated.events, reconciled.events);
  assert.equal(repeated.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-pro"].count, 1);
});

test("a generated-image outcome adds its feature to the same event without inventing a response model", () => {
  const submittedAt = new Date("2026-08-23T11:17:29.289Z");
  const pending = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "image-outcome-0001",
      conversationId: "image-conversation-0001",
      requestModel: "gpt-5-6-thinking",
      apiModel: "gpt-5-6-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking", "reasoning.effort": "max" },
      usageFeatures: [],
      pageUrl: "https://chatgpt.com/c/image-conversation-0001",
      submittedAt: submittedAt.toISOString()
    },
    submittedAt
  );

  const updated = background.applyResponseObservation(
    pending,
    {
      submissionId: "image-outcome-0001",
      conversationId: "image-conversation-0001",
      responseModel: "",
      usageFeatures: ["image_generation"],
      observedSource: "message-dom:feature:image-generation",
      featureObservedSource: "message-dom:feature:image-generation",
      observedAt: "2026-08-23T11:17:40.000Z"
    },
    new Date("2026-08-23T11:17:40.000Z")
  );

  assert.equal(background.totalCount(updated), 1);
  assert.equal(updated.events[0].responseModel, "");
  assert.deepEqual(updated.events[0].usageFeatures, ["image_generation"]);
  assert.equal(
    updated.featuresByModel[updated.events[0].model].features.image_generation.count,
    1
  );
});

test("research and agent request routes survive final-response migration and keep auditable relations", () => {
  [
    ["research", "Deep research", "deep_research"],
    ["agent-mode", "Agent mode", "agent_mode"]
  ].forEach(([requestModel, pendingModel, feature], index) => {
    const submittedAt = new Date(`2026-08-23T11:2${index}:00.000Z`);
    const pending = background.applyIncrement(
      background.createEmptyStats(),
      {
        submissionId: `mode-migration-${index}`,
        conversationId: `mode-conversation-${index}`,
        requestModel,
        apiModel: requestModel,
        modelObservedSource: "webRequest",
        modelParameters: { model: requestModel },
        usageFeatures: [feature],
        pageUrl: `https://chatgpt.com/c/mode-conversation-${index}`,
        submittedAt: submittedAt.toISOString()
      },
      submittedAt
    );
    assert.equal(pending.events[0].model, pendingModel);

    const updated = background.applyResponseObservation(
      pending,
      {
        submissionId: `mode-migration-${index}`,
        conversationId: `mode-conversation-${index}`,
        responseModel: "gpt-5-6-pro",
        runtimeModelCatalog: runtimeModelCatalog(),
        observedSource: "message-dom:model-slug",
        observedAt: new Date(submittedAt.getTime() + 5000).toISOString()
      },
      new Date(submittedAt.getTime() + 5000)
    );

    assert.equal(updated.events[0].requestModel, requestModel);
    assert.equal(updated.events[0].responseModel, "gpt-5-6-pro");
    assert.ok(updated.events[0].usageFeatures.includes(feature));
    const relations = updated.relationsByModel[updated.events[0].model];
    const relation = Object.values(relations)[0];
    assert.equal(relation.requestModel, requestModel);
    assert.equal(relation.responseModel, "gpt-5-6-pro");
    assert.equal(relation.count, 1);
  });
});

test("cloning preserves trusted response evidence and the actual response model", () => {
  const submittedAt = "2026-08-22T15:05:30.000Z";
  const observedAt = "2026-08-22T15:05:35.000Z";
  const stored = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "clone-response-evidence",
      requestModel: "future-family-2029-thinking",
      responseModel: "future-family-2029-pro",
      responseObservedAt: observedAt,
      responseObservedSource: "message-dom:model-slug",
      apiModel: "future-family-2029-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "future-family-2029-thinking" },
      submittedAt,
      pageUrl: "https://chatgpt.com/c/clone-response-evidence"
    },
    new Date(submittedAt)
  );

  const cloned = background.applyIncrement(stored, {}, new Date(observedAt));

  assert.equal(background.totalCount(cloned), 1);
  assert.equal(cloned.events[0].responseModel, "future-family-2029-pro");
  assert.equal(cloned.events[0].responseObservedAt, observedAt);
  assert.equal(cloned.events[0].responseObservedSource, "message-dom:model-slug");
});

test("same-response observation backfills the real conversation and message ids without incrementing", () => {
  const submittedAt = "2026-08-22T15:05:40.000Z";
  const initial = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "same-response-backfill",
      requestModel: "future-family-2029-thinking",
      responseModel: "future-family-2029-pro",
      responseObservedAt: "2026-08-22T15:05:45.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "future-family-2029-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "future-family-2029-thinking" },
      submittedAt,
      pageUrl: "https://chatgpt.com/"
    },
    new Date(submittedAt)
  );

  const updated = background.applyResponseObservation(
    initial,
    {
      submissionId: "same-response-backfill",
      conversationId: "real-conversation-0001",
      requestMessageId: "real-user-message-0001",
      responseMessageId: "real-assistant-message-0001",
      responseModel: "future-family-2029-pro",
      observedSource: "message-dom:model-slug:recovered",
      observedAt: "2026-08-22T15:05:50.000Z",
      pageUrl: "https://chatgpt.com/c/real-conversation-0001",
      pageTitle: "Recovered conversation"
    },
    new Date("2026-08-22T15:05:50.000Z")
  );
  const relation = Object.values(updated.relationsByModel["future-family-2029-pro"])[0];

  assert.equal(background.totalCount(updated), 1);
  assert.equal(updated.events.length, 1);
  assert.equal(updated.events[0].conversationId, "real-conversation-0001");
  assert.equal(updated.events[0].requestMessageId, "real-user-message-0001");
  assert.equal(updated.events[0].responseMessageId, "real-assistant-message-0001");
  assert.equal(updated.events[0].responseModel, "future-family-2029-pro");
  assert.equal(relation.count, 1);
  assert.equal(relation.conversations["real-conversation-0001"].count, 1);
  assert.equal(relation.conversations["pending:same-response-backfill"], undefined);
});

test("late response reconciliation updates the tracked event even when older event history is incomplete", () => {
  const submittedAt = "2026-08-22T15:06:00.000Z";
  const partial = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "partial-late-response",
      selectedPublicModel: "GPT-5.6 Luna",
      requestModel: "gpt-5-6-mini",
      apiModel: "gpt-5-6-mini",
      modelParameters: { model: "gpt-5-6-mini" },
      runtimeModelCatalog: runtimeModelCatalog(),
      modelObservedSource: "webRequest",
      pageUrl: "https://chatgpt.com/c/partial-history",
      submittedAt,
      promptHash: "partial-late",
      promptLength: 7
    },
    new Date(submittedAt)
  );
  partial.totals["GPT-5.6 Luna"] += 1;
  partial.byDate["2026-08-22"]["GPT-5.6 Luna"] += 1;
  partial.sessionsByModel["GPT-5.6 Luna"]["partial-history"].count += 1;
  partial.sessionsByModel["GPT-5.6 Luna"]["partial-history"].models["GPT-5.6 Luna"] += 1;
  // The missing older event already had a confirmed response. The tracked
  // request is still pending and must not be counted as an actual response.
  partial.variantsByModel["GPT-5.6 Luna"] = {
    total: 1,
    variants: {
      "gpt-5-6-mini": {
        name: "gpt-5-6-mini",
        count: 1,
        apiModel: "gpt-5-6-mini",
        lastSubmittedAt: submittedAt
      }
    }
  };
  partial.parametersByModel["GPT-5.6 Luna"].total += 1;
  partial.parametersByModel["GPT-5.6 Luna"].combinations[
    Object.keys(partial.parametersByModel["GPT-5.6 Luna"].combinations)[0]
  ].count += 1;
  partial.parametersByModel["GPT-5.6 Luna"].fields.model["gpt-5-6-mini"] += 1;
  partial.eventHistoryComplete = false;

  const reconciled = background.applyResponseObservation(
    partial,
    {
      submissionId: "partial-late-response",
      responseModel: "gpt-5-6-thinking",
      runtimeModelCatalog: runtimeModelCatalog(),
      observedSource: "message-dom:model-slug",
      observedAt: "2026-08-22T15:06:30.000Z"
    },
    new Date("2026-08-22T15:06:30.000Z")
  );

  assert.equal(background.totalCount(reconciled), 2);
  assert.deepEqual(reconciled.totals, { "GPT-5.6 Luna": 1, "GPT-5.6 Sol": 1 });
  assert.deepEqual(reconciled.byDate["2026-08-22"], { "GPT-5.6 Luna": 1, "GPT-5.6 Sol": 1 });
  assert.equal(reconciled.events.length, 1);
  assert.equal(reconciled.events[0].model, "GPT-5.6 Sol");
  assert.equal(reconciled.variantsByModel["GPT-5.6 Luna"].variants["gpt-5-6-mini"].count, 1);
  assert.equal(reconciled.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-thinking"].count, 1);
  assert.equal(reconciled.parametersByModel["GPT-5.6 Luna"].fields.model["gpt-5-6-mini"], 1);
  assert.equal(reconciled.parametersByModel["GPT-5.6 Sol"].fields.model["gpt-5-6-mini"], 1);
  assert.equal(reconciled.sessionsByModel["GPT-5.6 Luna"]["partial-history"].count, 1);
  assert.equal(reconciled.sessionsByModel["GPT-5.6 Sol"]["partial-history"].count, 1);
});

test("account model catalog remaps existing GPT-5.6 internal counts without losing aggregates", () => {
  const existing = background.createEmptyStats();
  existing.totals["gpt-5-6-thinking"] = 2;
  existing.totals["gpt-5-6"] = 3;
  existing.byDate["2026-08-22"] = { "gpt-5-6-thinking": 2, "gpt-5-6": 3 };
  existing.models["gpt-5-6-thinking"] = {
    label: "gpt-5-6-thinking",
    apiModel: "gpt-5-6-thinking",
    chatgptModel: "gpt-5-6-thinking",
    parameters: { model: "gpt-5-6-thinking" }
  };
  existing.models["gpt-5-6"] = {
    label: "gpt-5-6",
    apiModel: "gpt-5-6",
    chatgptModel: "gpt-5-6",
    parameters: { model: "gpt-5-6" }
  };
  existing.variantsByModel["gpt-5-6-thinking"] = {
    total: 2,
    variants: {
      "gpt-5-6-thinking": { name: "gpt-5-6-thinking", count: 2, apiModel: "gpt-5-6-thinking" }
    }
  };

  const remapped = background.applyRuntimeModelCatalog(existing, runtimeModelCatalog());

  assert.deepEqual(remapped.totals, { "GPT-5.6 Sol": 5 });
  assert.deepEqual(remapped.byDate["2026-08-22"], { "GPT-5.6 Sol": 5 });
  assert.equal(remapped.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-thinking"].count, 2);
  assert.equal(remapped.models["GPT-5.6 Sol"].requestModel, "gpt-5-6-thinking");
  assert.equal(remapped.runtimeModelCatalog, undefined, "the account catalog is session-only, not persisted with usage stats");
});

test("complete event history corrects both paid Instant and Pro routes to Sol", () => {
  const existing = background.createEmptyStats();
  existing.totals["GPT-5.6 Luna"] = 2;
  existing.byDate["2026-08-22"] = { "GPT-5.6 Luna": 2 };
  existing.models["GPT-5.6 Luna"] = {
    label: "GPT-5.6 Luna",
    publicModel: "GPT-5.6 Luna",
    requestModel: "gpt-5-6-pro",
    responseModel: "gpt-5-6-pro",
    apiModel: "gpt-5-6-pro",
    chatgptModel: "GPT-5.6 Luna",
    observedSource: "webRequest",
    parameters: { model: "gpt-5-6-pro" }
  };
  existing.events = [
    {
      model: "GPT-5.6 Luna",
      publicModel: "GPT-5.6 Luna",
      selectedPublicModel: "GPT-5.6 Luna",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-pro",
      responseObservedAt: "2026-08-22T14:55:58.197Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      chatgptModel: "GPT-5.6 Luna",
      modelMode: "pro",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-pro" },
      submittedAt: "2026-08-22T14:55:48.197Z",
      pageUrl: "https://chatgpt.com/c/mixed",
      pageTitle: "Mixed model conversation",
      conversationId: "mixed",
      promptHash: "pro",
      promptLength: 3,
      usageFeatures: []
    },
    {
      model: "GPT-5.6 Luna",
      publicModel: "GPT-5.6 Luna",
      selectedPublicModel: "GPT-5.6 Luna",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5-6",
      responseModel: "gpt-5-6",
      responseObservedAt: "2026-08-22T14:54:46.493Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6",
      chatgptModel: "GPT-5.6 Luna",
      modelMode: "",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6" },
      submittedAt: "2026-08-22T14:54:36.493Z",
      pageUrl: "https://chatgpt.com/c/mixed",
      pageTitle: "Mixed model conversation",
      conversationId: "mixed",
      promptHash: "instant",
      promptLength: 7,
      usageFeatures: []
    }
  ];

  const remapped = background.applyRuntimeModelCatalog(existing, runtimeModelCatalog());

  assert.deepEqual(remapped.totals, { "GPT-5.6 Sol": 2 });
  assert.deepEqual(remapped.byDate["2026-08-22"], { "GPT-5.6 Sol": 2 });
  assert.equal(remapped.events[0].model, "GPT-5.6 Sol");
  assert.equal(remapped.events[0].requestModel, "gpt-5-6-pro");
  assert.equal(remapped.events[0].selectedPublicModel, "GPT-5.6 Luna");
  assert.equal(remapped.events[0].selectedPublicModelSource, "selector-dom");
  assert.equal(remapped.events[1].model, "GPT-5.6 Sol");
  assert.equal(remapped.events[1].requestModel, "gpt-5-6");
  assert.equal(remapped.events[1].selectedPublicModel, "GPT-5.6 Luna");
  assert.equal(remapped.events[1].selectedPublicModelSource, "selector-dom");
  assert.equal(remapped.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-pro"].count, 1);
  assert.equal(remapped.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6"].count, 1);
  assert.equal(remapped.sessionsByModel["GPT-5.6 Sol"].mixed.count, 2);
});

test("publishing the live catalog rebuilds stale variant and request-parameter details even when totals already match", () => {
  const existing = background.createEmptyStats();
  existing.totals["GPT-5.6 Sol"] = 2;
  existing.byDate["2026-08-22"] = { "GPT-5.6 Sol": 2 };
  existing.models["GPT-5.6 Sol"] = {
    label: "GPT-5.6 Sol",
    publicModel: "GPT-5.6 Sol",
    requestModel: "gpt-5-6-pro",
    responseModel: "gpt-5-6-pro",
    apiModel: "gpt-5-6-pro",
    chatgptModel: "GPT-5.6 Sol",
    observedSource: "webRequest",
    parameters: { model: "gpt-5-6-pro" }
  };
  existing.variantsByModel["GPT-5.6 Sol"] = {
    total: 2,
    variants: {
      "gpt-5-6-pro": { name: "gpt-5-6-pro", count: 2, apiModel: "gpt-5-6-pro", mode: "pro" }
    }
  };
  existing.parametersByModel["GPT-5.6 Sol"] = {
    total: 2,
    combinations: {
      stale: {
        count: 2,
        parameters: { model: "gpt-5-6-pro" },
        firstSubmittedAt: "2026-08-22T16:00:00.000Z",
        lastSubmittedAt: "2026-08-22T16:01:00.000Z"
      }
    },
    fields: { model: { "gpt-5-6-pro": 2 } }
  };
  existing.events = [
    {
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-thinking",
      responseObservedAt: "2026-08-22T16:01:10.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-thinking",
      chatgptModel: "GPT-5.6 Sol",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-08-22T16:01:00.000Z",
      pageUrl: "https://chatgpt.com/c/detail-rebuild",
      conversationId: "detail-rebuild",
      promptHash: "thinking",
      promptLength: 8,
      usageFeatures: []
    },
    {
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-pro",
      responseObservedAt: "2026-08-22T16:00:10.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      chatgptModel: "GPT-5.6 Sol",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-pro" },
      submittedAt: "2026-08-22T16:00:00.000Z",
      pageUrl: "https://chatgpt.com/c/detail-rebuild",
      conversationId: "detail-rebuild",
      promptHash: "pro",
      promptLength: 3,
      usageFeatures: []
    }
  ];

  const rebuilt = background.applyRuntimeModelCatalog(existing, runtimeModelCatalog());

  assert.deepEqual(rebuilt.totals, { "GPT-5.6 Sol": 2 });
  assert.equal(rebuilt.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-thinking"].count, 1);
  assert.equal(rebuilt.variantsByModel["GPT-5.6 Sol"].variants["gpt-5-6-pro"].count, 1);
  assert.deepEqual(rebuilt.parametersByModel["GPT-5.6 Sol"].fields.model, {
    "gpt-5-6-pro": 1,
    "gpt-5-6-thinking": 1
  });
});

test("catalog rebuild drops unmatched small legacy aggregates and keeps auditable events", () => {
  const catalog = runtimeModelCatalog();
  const submittedAt = new Date("2026-08-22T17:00:00.000Z");
  const existing = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "auditable-small-history",
      model: "gpt-5-6-pro",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-pro",
      responseObservedAt: "2026-08-22T17:00:05.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-pro",
      chatgptModel: "GPT-5.6 Sol",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-pro" },
      runtimeModelCatalog: catalog,
      submittedAt: submittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/auditable-small-history",
      pageTitle: "Auditable small history",
      source: "send-button",
      sourceMode: "chat",
      promptHash: "transient-only",
      promptLength: 14
    },
    submittedAt
  );

  existing.totals["GPT-5.6 Sol"] += 1;
  existing.byDate["2026-08-22"]["GPT-5.6 Sol"] += 1;
  // Only a ledger explicitly known to be complete may discard an aggregate
  // that has no matching event. Legacy stores without this marker can contain
  // older aggregate-only history and must preserve it.
  existing.eventHistoryComplete = true;

  const rebuilt = background.applyIncrement(
    existing,
    { runtimeModelCatalog: catalog },
    submittedAt
  );

  assert.equal(background.totalCount(rebuilt), 1);
  assert.equal(rebuilt.totals["GPT-5.6 Sol"], 1);
  assert.equal(rebuilt.events.length, 1);
  assert.equal(rebuilt.events[0].submissionId, "auditable-small-history");
  assert.equal(rebuilt.events[0].promptHash, undefined);
  assert.equal(rebuilt.events[0].promptLength, undefined);
  assert.equal(rebuilt.eventHistoryComplete, true);
});

test("catalog rebuild removes legacy pending events whose request model came only from DOM text", () => {
  const existing = background.createEmptyStats();
  existing.totals["GPT-5.6 Sol"] = 1;
  existing.totals["gpt-5.6-sol"] = 1;
  existing.byDate["2026-08-22"] = {
    "GPT-5.6 Sol": 1,
    "gpt-5.6-sol": 1
  };
  existing.events = [
    {
      submissionId: "legacy-dom-only",
      model: "gpt-5.6-sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5.6-sol",
      responseModel: "",
      apiModel: "gpt-5.6-sol",
      modelObservedSource: "message-dom:dom",
      modelParameters: { model: "gpt-5.6-sol" },
      submittedAt: "2026-08-22T16:01:00.000Z",
      pageUrl: "https://chatgpt.com/c/legacy-dom-only",
      conversationId: "legacy-dom-only",
      promptHash: "legacy",
      promptLength: 6,
      usageFeatures: []
    },
    {
      submissionId: "auditable-request-response",
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-thinking",
      responseObservedAt: "2026-08-22T16:00:10.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5-6-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-08-22T16:00:00.000Z",
      pageUrl: "https://chatgpt.com/c/auditable",
      conversationId: "auditable",
      promptHash: "valid",
      promptLength: 5,
      usageFeatures: []
    }
  ];

  const rebuilt = background.applyRuntimeModelCatalog(existing, runtimeModelCatalog());

  assert.deepEqual(rebuilt.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(rebuilt.events.length, 1);
  assert.equal(rebuilt.events[0].submissionId, "auditable-request-response");
  assert.equal(
    rebuilt.relationsByModel["GPT-5.6 Sol"]["gpt-5-6-thinking\u0001gpt-5-6-thinking"].count,
    1
  );
});

test("catalog rebuild preserves an exact legacy response while marking an unproven request unavailable", () => {
  const existing = background.createEmptyStats();
  existing.totals["gpt-5-6-thinking"] = 1;
  existing.byDate["2026-08-22"] = { "gpt-5-6-thinking": 1 };
  existing.events = [
    {
      submissionId: "legacy-response-only",
      model: "gpt-5-6-thinking",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      requestModel: "gpt-5.6-sol",
      responseModel: "gpt-5-6-thinking",
      responseObservedAt: "2026-08-22T16:00:10.000Z",
      responseObservedSource: "message-dom:model-slug",
      apiModel: "gpt-5.6-sol",
      chatgptModel: "GPT-5.6 Sol",
      modelIdentitySource: "response-model",
      modelObservedSource: "message-dom:model-slug",
      modelParameters: {
        model: "gpt-5.6-sol",
        "reasoning.effort": "high"
      },
      submittedAt: "2026-08-22T16:00:00.000Z",
      pageUrl: "https://chatgpt.com/c/legacy-response-only",
      conversationId: "legacy-response-only",
      promptHash: "response",
      promptLength: 8,
      usageFeatures: ["web_search"]
    }
  ];

  const rebuilt = background.applyRuntimeModelCatalog(existing, runtimeModelCatalog());

  assert.deepEqual(rebuilt.totals, { "GPT-5.6 Sol": 1 });
  assert.equal(rebuilt.events.length, 1);
  assert.equal(rebuilt.events[0].requestModel, "");
  assert.equal(rebuilt.events[0].requestModelEvidence, "unavailable");
  assert.equal(rebuilt.events[0].responseModel, "gpt-5-6-thinking");
  assert.equal(rebuilt.events[0].modelParameters.model, undefined);
  assert.equal(rebuilt.events[0].modelParameters["reasoning.effort"], "high");
  const relation = rebuilt.relationsByModel["GPT-5.6 Sol"]["\u0001gpt-5-6-thinking"];
  assert.equal(relation.requestModel, "");
  assert.equal(relation.responseModel, "gpt-5-6-thinking");
  assert.equal(relation.count, 1);
  assert.deepEqual(relation.efforts, { high: 1 });
  assert.equal(relation.conversations["legacy-response-only"].count, 1);
});

test("cloning a public-model aggregate preserves every exact request model instead of replacing them with the latest route", () => {
  const existing = background.createEmptyStats();
  existing.runtimeModelCatalog = runtimeModelCatalog();
  existing.totals["GPT-5.6 Sol"] = 2;
  existing.byDate["2026-08-22"] = { "GPT-5.6 Sol": 2 };
  existing.models["GPT-5.6 Sol"] = {
    label: "GPT-5.6 Sol",
    publicModel: "GPT-5.6 Sol",
    selectedPublicModel: "GPT-5.6 Sol",
    requestModel: "gpt-5-6-pro",
    responseModel: "gpt-5-6-pro",
    apiModel: "gpt-5-6-pro",
    chatgptModel: "GPT-5.6 Sol",
    modelObservedSource: "webRequest",
    parameters: { model: "gpt-5-6-pro" }
  };
  existing.parametersByModel["GPT-5.6 Sol"] = {
    total: 2,
    combinations: {
      thinking: {
        count: 1,
        parameters: { model: "gpt-5-6-thinking" },
        firstSubmittedAt: "2026-08-22T16:00:00.000Z",
        lastSubmittedAt: "2026-08-22T16:00:00.000Z"
      },
      pro: {
        count: 1,
        parameters: { model: "gpt-5-6-pro" },
        firstSubmittedAt: "2026-08-22T16:01:00.000Z",
        lastSubmittedAt: "2026-08-22T16:01:00.000Z"
      }
    },
    fields: {
      model: {
        "gpt-5-6-thinking": 1,
        "gpt-5-6-pro": 1
      }
    }
  };
  existing.events = [
    {
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-pro",
      responseModel: "gpt-5-6-pro",
      apiModel: "gpt-5-6-pro",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-pro" },
      submittedAt: "2026-08-22T16:01:00.000Z",
      promptHash: "pro-existing",
      promptLength: 3
    },
    {
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6-thinking",
      responseModel: "gpt-5-6-thinking",
      apiModel: "gpt-5-6-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: "2026-08-22T16:00:00.000Z",
      promptHash: "thinking-existing",
      promptLength: 8
    }
  ];

  const next = background.applyIncrement(
    existing,
    {
      model: "GPT-5.6 Sol",
      publicModel: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      requestModel: "gpt-5-6",
      responseModel: "gpt-5-6",
      apiModel: "gpt-5-6",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6" },
      runtimeModelCatalog: runtimeModelCatalog(),
      submittedAt: "2026-08-22T16:02:00.000Z",
      promptHash: "instant-new",
      promptLength: 7
    },
    new Date("2026-08-22T16:02:00.000Z")
  );

  assert.deepEqual(next.parametersByModel["GPT-5.6 Sol"].fields.model, {
    "gpt-5-6": 1,
    "gpt-5-6-pro": 1,
    "gpt-5-6-thinking": 1
  });
});

test("applyIncrement dedupes racing observations for the same submitted prompt", () => {
  const stats = background.createEmptyStats();
  const firstSubmittedAt = new Date("2026-05-23T12:00:00.000Z");
  const secondSubmittedAt = new Date("2026-05-23T12:00:00.001Z");
  const first = background.applyIncrement(
    stats,
    {
      submissionId: "usage-duplicate-race",
      model: "future-family-2026-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      source: "send-button",
      submittedAt: firstSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/duplicate-race",
      pageTitle: "Duplicate race",
      promptHash: "same-prompt",
      promptLength: 19
    },
    firstSubmittedAt
  );
  const next = background.applyIncrement(
    first,
    {
      submissionId: "usage-duplicate-race",
      model: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      source: "send-button",
      submittedAt: secondSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/duplicate-race",
      pageTitle: "Duplicate race",
      promptHash: "same-prompt",
      promptLength: 19
    },
    secondSubmittedAt
  );

  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.equal(next.byDate["2026-05-23"]["future-family-2026-thinking"], 1);
  assert.equal(next.sessionsByModel["future-family-2026-thinking"]["duplicate-race"].count, 1);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].modelObservedSource, "webRequest");
});

test("applyIncrement dedupes root ChatGPT submissions observed by webRequest then fetch-request", () => {
  const stats = background.createEmptyStats();
  const firstSubmittedAt = new Date("2026-06-01T12:00:00.000Z");
  const secondSubmittedAt = new Date("2026-06-01T12:00:00.001Z");
  const promptHash = "e78b1273";
  const model = "gpt-5-thinking";
  const first = background.applyIncrement(
    stats,
    {
      submissionId: "usage-root-duplicate-race",
      model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      source: "send-button",
      submittedAt: firstSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/",
      pageTitle: "ChatGPT",
      promptHash,
      promptLength: 55
    },
    firstSubmittedAt
  );
  const next = background.applyIncrement(
    first,
    {
      submissionId: "usage-root-duplicate-race",
      model,
      modelObservedSource: "fetch-request",
      modelParameters: { model },
      source: "send-button",
      submittedAt: secondSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/",
      pageTitle: "ChatGPT",
      promptHash,
      promptLength: 55
    },
    secondSubmittedAt
  );

  assert.equal(background.totalCount(next), 1);
  assert.equal(next.totals[model], 1);
  assert.equal(next.byDate["2026-06-01"][model], 1);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].conversationId, "");
  assert.equal(next.events[0].pageUrl, "https://chatgpt.com/");
  assert.equal(next.events[0].promptHash, undefined);
  assert.equal(next.events[0].promptLength, undefined);
  assert.equal(next.events[0].modelObservedSource, "webRequest");
  assert.equal(next.events[0].source, "send-button");
});

test("applyIncrement preserves known separate conversations and repeated prompts outside dedupe window", () => {
  let stats = background.createEmptyStats();
  const model = "gpt-5-thinking";
  const promptHash = "repeatable-prompt";
  const firstSubmittedAt = new Date("2026-06-01T12:00:00.000Z");
  const secondSubmittedAt = new Date("2026-06-01T12:00:00.001Z");
  const laterSubmittedAt = new Date("2026-06-01T12:00:03.000Z");

  stats = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "webRequest",
      modelParameters: { model },
      source: "send-button",
      submittedAt: firstSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/known-first",
      promptHash,
      promptLength: 17
    },
    firstSubmittedAt
  );
  stats = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "fetch-request",
      modelParameters: { model },
      source: "send-button",
      submittedAt: secondSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/known-second",
      promptHash,
      promptLength: 17
    },
    secondSubmittedAt
  );
  stats = background.applyIncrement(
    stats,
    {
      model,
      modelObservedSource: "fetch-request",
      modelParameters: { model },
      source: "send-button",
      submittedAt: laterSubmittedAt.toISOString(),
      pageUrl: "https://chatgpt.com/c/known-first",
      promptHash,
      promptLength: 17
    },
    laterSubmittedAt
  );

  assert.equal(background.totalCount(stats), 3);
  assert.equal(stats.totals[model], 3);
  assert.equal(stats.sessionsByModel[model]["known-first"].count, 2);
  assert.equal(stats.sessionsByModel[model]["known-second"].count, 1);
});

test("applyIncrement refuses unresolved model records", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "",
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(background.totalCount(next), 0);
  assert.equal(next.events.length, 0);
});

test("applyIncrement refuses unknown and ambiguous GPT family records", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const invalidModels = [
    "Unknown model",
    "unknown",
    "Unknown",
    "unknown_model",
    "unknown-model",
    "Unresolved model",
    "gptLastUsedModel",
    "gptlastusedmodel",
    "agentmode",
    "agentmode-v2",
    "agent-mode-v2",
    "deep-research",
    "deep_research",
    "deepresearch",
    "deepresearch-v2",
    "deepsearch",
    "deepsearch-v2",
    "image-generation",
    "image_generation",
    "imagegeneration",
    "imagegeneration-v2",
    "image-generation-v2",
    "web-search",
    "web_search",
    "websearch",
    "websearch-v2",
    "web-search-v2",
    "realtime",
    "realtime-v2",
    "real-time-v2",
    "real_time",
    "audio",
    "audio-v2",
    "canvas",
    "canvas-v2",
    "voice-v2"
  ];

  invalidModels.forEach((model) => {
    const next = background.applyIncrement(
      background.createEmptyStats(),
      {
        model,
        apiModel: model,
        chatgptModel: model,
        modelObservedSource: "fetch-request",
        modelParameters: { model },
        submittedAt: now.toISOString(),
        promptHash: "abc123",
        promptLength: 42
      },
      now
    );

    assert.equal(background.totalCount(next), 0, model);
    assert.equal(next.events.length, 0, model);
  });
});

test("applyIncrement normalizes stored public dotted GPT labels across every aggregate", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "GPT-5.5": 31,
      "future-family-2026-thinking": 1
    },
    byDate: {
      "2026-05-23": {
        "GPT-5.5": 31,
        "future-family-2026-thinking": 1
      }
    },
    models: {
      "GPT-5.5": {
        label: "GPT-5.5",
        apiModel: "GPT-5.5",
        chatgptModel: "GPT-5.5",
        parameters: { model: "GPT-5.5" }
      },
      "future-family-2026-thinking": {
        label: "future-family-2026-thinking",
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        parameters: { model: "future-family-2026-thinking" }
      }
    },
    sessionsByModel: {
      "GPT-5.5": {
        dirty: {
          conversationId: "dirty",
          title: "Dirty model",
          count: 31,
          models: { "GPT-5.5": 31 },
          lastSubmittedAt: "2026-05-23T10:00:00.000Z"
        }
      },
      "future-family-2026-thinking": {
        clean: {
          conversationId: "clean",
          title: "Clean model",
          count: 1,
          models: { "future-family-2026-thinking": 1 },
          lastSubmittedAt: "2026-05-23T10:05:00.000Z"
        }
      }
    },
    parametersByModel: {
      "GPT-5.5": {
        total: 31,
        combinations: {
          dirty: {
            count: 31,
            parameters: { model: "GPT-5.5", "reasoning.effort": "high" }
          }
        },
        fields: { model: { "GPT-5.5": 31 } }
      }
    },
    variantsByModel: {
      "GPT-5.5": {
        total: 31,
        variants: {
          "GPT-5.5": { name: "GPT-5.5", count: 31 }
        }
      }
    },
    featuresByModel: {
      "GPT-5.5": {
        total: 31,
        features: { agent_mode: { id: "agent_mode", count: 31 } }
      }
    },
    events: [
      {
        model: "GPT-5.5",
        apiModel: "GPT-5.5",
        chatgptModel: "GPT-5.5",
        modelParameters: { model: "GPT-5.5" }
      }
    ]
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "future-family-2026-thinking" },
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["GPT-5.5"], undefined);
  assert.equal(next.byDate["2026-05-23"]["GPT-5.5"], undefined);
  assert.equal(next.models["GPT-5.5"], undefined);
  assert.equal(next.sessionsByModel["GPT-5.5"], undefined);
  assert.equal(next.parametersByModel["GPT-5.5"], undefined);
  assert.equal(next.variantsByModel["GPT-5.5"], undefined);
  assert.equal(next.featuresByModel["GPT-5.5"], undefined);
  assert.equal(next.events.some((event) => event.model === "GPT-5.5"), false);
  assert.equal(next.totals["gpt-5.5"], 31);
  assert.equal(next.byDate["2026-05-23"]["gpt-5.5"], 31);
  assert.equal(next.models["gpt-5.5"].label, "gpt-5.5");
  assert.equal(next.sessionsByModel["gpt-5.5"].dirty.count, 31);
  assert.equal(next.parametersByModel["gpt-5.5"].total, 31);
  assert.equal(next.variantsByModel["gpt-5.5"].total, 31);
  assert.equal(next.featuresByModel["gpt-5.5"].total, 31);
  assert.equal(next.events.some((event) => event.model === "gpt-5.5"), true);
  assert.equal(next.totals["future-family-2026-thinking"], 2);
});

test("applyIncrement migrates public historical labels through exact request metadata", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const invalidModels = ["GPT-5.5", "gpt-5.5", "Unknown model", "gptLastUsedModel"];
  const existingStats = background.createEmptyStats();
  invalidModels.forEach((model, index) => {
    existingStats.totals[model] = index + 1;
    existingStats.byDate["2026-05-22"] = existingStats.byDate["2026-05-22"] || {};
    existingStats.byDate["2026-05-22"][model] = index + 1;
    existingStats.models[model] = {
      label: model,
      apiModel: "gpt-5-thinking",
      chatgptModel: model,
      parameters: { model: "gpt-5-thinking" }
    };
    existingStats.sessionsByModel[model] = {
      dirty: {
        conversationId: "dirty",
        title: "Dirty",
        count: index + 1,
        models: { [model]: index + 1, "gpt-5-thinking": index + 1 }
      }
    };
    existingStats.parametersByModel[model] = {
      total: index + 1,
      combinations: {
        dirty: { count: index + 1, parameters: { model: "gpt-5-thinking", "reasoning.effort": "high" } }
      },
      fields: { "reasoning.effort": { high: index + 1 } }
    };
    existingStats.variantsByModel[model] = {
      total: index + 1,
      variants: {
        "gpt-5-thinking": { name: "gpt-5-thinking", count: index + 1, apiModel: "gpt-5-thinking" }
      }
    };
    existingStats.featuresByModel[model] = {
      total: index + 1,
      features: { deep_research: { id: "deep_research", count: index + 1 } }
    };
    existingStats.events.push({
      model,
      apiModel: "gpt-5-thinking",
      chatgptModel: model,
      modelParameters: { model: "gpt-5-thinking" },
      submittedAt: "2026-05-22T12:00:00.000Z"
    });
  });
  existingStats.eventHistoryComplete = false;

  const next = background.applyIncrement(
    existingStats,
    {
      model: "gpt-5-thinking",
      apiModel: "gpt-5-thinking",
      chatgptModel: "gpt-5-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "gpt-5-thinking", "reasoning.effort": "high" },
      submittedAt: now.toISOString(),
      promptHash: "clean",
      promptLength: 12
    },
    now
  );

  invalidModels.forEach((model) => {
    assert.equal(next.totals[model], undefined, model);
    assert.equal(next.models[model], undefined, model);
    assert.equal(next.parametersByModel[model], undefined, model);
    assert.equal(next.variantsByModel[model], undefined, model);
    assert.equal(next.featuresByModel[model], undefined, model);
    assert.equal(next.sessionsByModel[model], undefined, model);
    assert.equal(next.events.some((event) => event.model === model), false, model);
    assert.equal(JSON.stringify(next).includes(model), false, model);
  });
  assert.equal(next.totals["gpt-5-thinking"], 4);
  assert.equal(next.totals.thinking, undefined);
  assert.equal(next.events[0].model, "gpt-5-thinking");
  assert.equal(next.events[0].modelParameters.model, "gpt-5-thinking");
  assert.equal(next.events.length, 3);
});

test("applyIncrement removes feature-only model keys from stored aggregates", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "agent-mode": 3,
      deep_research: 2,
      "canvas-v2": 4,
      "future-family-2026-thinking": 1
    },
    byDate: {
      "2026-05-23": {
        "agent-mode": 3,
        deep_research: 2,
        "canvas-v2": 4,
        "future-family-2026-thinking": 1
      }
    },
    models: {
      "agent-mode": {
        label: "agent-mode",
        chatgptModel: "agent-mode",
        parameters: { model: "agent-mode" }
      },
      deep_research: {
        label: "deep_research",
        chatgptModel: "deep_research",
        parameters: { model: "deep_research" }
      },
      "canvas-v2": {
        label: "canvas-v2",
        chatgptModel: "canvas-v2",
        parameters: { model: "canvas-v2" }
      },
      "future-family-2026-thinking": {
        label: "future-family-2026-thinking",
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        parameters: { model: "future-family-2026-thinking" }
      }
    },
    sessionsByModel: {
      "agent-mode": {
        legacy: {
          conversationId: "legacy",
          title: "Legacy",
          count: 3,
          models: { "agent-mode": 3 },
          firstSubmittedAt: "2026-05-23T10:00:00.000Z",
          lastSubmittedAt: "2026-05-23T10:00:00.000Z"
        }
      },
      "canvas-v2": {
        canvas: {
          conversationId: "canvas",
          title: "Canvas",
          count: 4,
          models: { "canvas-v2": 4 },
          firstSubmittedAt: "2026-05-23T10:03:00.000Z",
          lastSubmittedAt: "2026-05-23T10:03:00.000Z"
        }
      },
      "future-family-2026-thinking": {
        legacy: {
          conversationId: "legacy",
          title: "Legacy",
          count: 1,
          models: { "future-family-2026-thinking": 1 },
          firstSubmittedAt: "2026-05-23T10:05:00.000Z",
          lastSubmittedAt: "2026-05-23T10:05:00.000Z"
        }
      }
    },
    parametersByModel: {
      "agent-mode": {
        total: 3,
        combinations: {
          feature: {
            count: 3,
            parameters: { model: "agent-mode" }
          }
        },
        fields: { model: { "agent-mode": 3 } }
      },
      "canvas-v2": {
        total: 4,
        combinations: {
          canvas: {
            count: 4,
            parameters: { model: "canvas-v2" }
          }
        },
        fields: { model: { "canvas-v2": 4 } }
      },
      "future-family-2026-thinking": {
        total: 1,
        combinations: {
          thinking: {
            count: 1,
            parameters: { model: "future-family-2026-thinking" }
          }
        },
        fields: { model: { "future-family-2026-thinking": 1 } }
      }
    },
    variantsByModel: {
      "agent-mode": {
        total: 3,
        variants: {
          "agent-mode": {
            name: "agent-mode",
            count: 3
          }
        }
      },
      "canvas-v2": {
        total: 4,
        variants: {
          "canvas-v2": {
            name: "canvas-v2",
            count: 4
          }
        }
      },
      "future-family-2026-thinking": {
        total: 1,
        variants: {
          "future-family-2026-thinking": {
            name: "future-family-2026-thinking",
            count: 1,
            apiModel: "future-family-2026-thinking"
          }
        }
      }
    },
    featuresByModel: {
      "agent-mode": {
        total: 3,
        features: { agent_mode: { id: "agent_mode", count: 3 } }
      },
      "canvas-v2": {
        total: 4,
        features: { canvas: { id: "canvas", count: 4 } }
      },
      "future-family-2026-thinking": {
        total: 1,
        features: { agent_mode: { id: "agent_mode", count: 1 } }
      }
    },
    events: [
      {
        model: "agent-mode",
        chatgptModel: "agent-mode",
        modelParameters: { model: "agent-mode" }
      },
      {
        model: "canvas-v2",
        chatgptModel: "canvas-v2",
        modelParameters: { model: "canvas-v2" },
        usageFeatures: ["canvas"]
      },
      {
        model: "future-family-2026-thinking",
        apiModel: "future-family-2026-thinking",
        chatgptModel: "future-family-2026-thinking",
        modelParameters: { model: "future-family-2026-thinking" },
        usageFeatures: ["agent-mode"]
      }
    ]
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "future-family-2026-thinking" },
      usageFeatures: ["agent-mode"],
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/legacy",
      pageTitle: "Legacy",
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["agent-mode"], undefined);
  assert.equal(next.totals.deep_research, undefined);
  assert.equal(next.totals["canvas-v2"], undefined);
  assert.equal(next.byDate["2026-05-23"]["agent-mode"], undefined);
  assert.equal(next.byDate["2026-05-23"]["canvas-v2"], undefined);
  assert.equal(next.models["agent-mode"], undefined);
  assert.equal(next.models["canvas-v2"], undefined);
  assert.equal(next.sessionsByModel["agent-mode"], undefined);
  assert.equal(next.sessionsByModel["canvas-v2"], undefined);
  assert.equal(next.parametersByModel["agent-mode"], undefined);
  assert.equal(next.parametersByModel["canvas-v2"], undefined);
  assert.equal(next.variantsByModel["agent-mode"], undefined);
  assert.equal(next.variantsByModel["canvas-v2"], undefined);
  assert.equal(next.featuresByModel["agent-mode"], undefined);
  assert.equal(next.featuresByModel["canvas-v2"], undefined);
  assert.equal(next.events.some((event) => event.model === "agent-mode"), false);
  assert.equal(next.events.some((event) => event.model === "canvas-v2"), false);

  assert.equal(next.totals["future-family-2026-thinking"], 2);
  assert.equal(next.events.length, 2);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 2);
});

test("applyIncrement removes legacy ordinary UI labels that have no model evidence", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const existing = background.createEmptyStats();
  existing.totals.Share = 4;
  existing.totals["New chat"] = 3;
  existing.byDate["2026-08-21"] = { Share: 4, "New chat": 3 };
  existing.models.Share = { label: "Share" };
  existing.models["New chat"] = { label: "New chat" };
  existing.events = [
    { model: "Share", submittedAt: "2026-08-21T10:00:00.000Z" },
    { model: "New chat", submittedAt: "2026-08-21T11:00:00.000Z" }
  ];

  const next = background.applyIncrement(
    existing,
    {
      model: "gpt-5.6-sol",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5.6-sol" },
      submittedAt: now.toISOString(),
      promptHash: "valid-after-cleanup",
      promptLength: 12
    },
    now
  );

  assert.equal(next.totals.Share, undefined);
  assert.equal(next.totals["New chat"], undefined);
  assert.equal(next.models.Share, undefined);
  assert.equal(next.models["New chat"], undefined);
  assert.equal(next.events.some((event) => event.model === "Share" || event.model === "New chat"), false);
  assert.equal(next.totals["gpt-5.6-sol"], 1);
});

test("applyIncrement accepts exact request model slugs across model families", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const modelSlugs = [
    { model: "gpt-5", storedModel: "gpt-5", requestModel: "gpt-5" },
    { model: "gpt-5-thinking", storedModel: "gpt-5-thinking", requestModel: "gpt-5-thinking" },
    { model: "gpt-5-5-thinking", storedModel: "gpt-5-5-thinking", requestModel: "gpt-5-5-thinking" },
    { model: "future-family-2026-thinking", storedModel: "future-family-2026-thinking", requestModel: "future-family-2026-thinking" },
    { model: "future-family-2026-instant", storedModel: "future-family-2026-instant", requestModel: "future-family-2026-instant" },
    { model: "gpt-realtime-2", storedModel: "gpt-realtime-2", requestModel: "gpt-realtime-2" },
    { model: "codex-mini-latest", storedModel: "codex-mini-latest", requestModel: "codex-mini-latest" },
    { model: "computer-use-preview", storedModel: "computer-use-preview", requestModel: "computer-use-preview" },
    { model: "text-embedding-3-large", storedModel: "text-embedding-3-large", requestModel: "text-embedding-3-large" },
    { model: "gpt-image", storedModel: "gpt-image", requestModel: "gpt-image" },
    { model: "dall-e", storedModel: "dall-e", requestModel: "dall-e" },
    { model: "image-1", storedModel: "image-1", requestModel: "image-1" },
    { model: "image-2", storedModel: "image-2", requestModel: "image-2" },
    { model: "dall-e-3", storedModel: "dall-e-3", requestModel: "dall-e-3" },
    { model: "whisper-1", storedModel: "whisper-1", requestModel: "whisper-1" },
    { model: "tts-1", storedModel: "tts-1", requestModel: "tts-1" },
    { model: "omni-moderation-latest", storedModel: "omni-moderation-latest", requestModel: "omni-moderation-latest" }
  ];

  modelSlugs.forEach(({ model, storedModel, requestModel }) => {
    const next = background.applyIncrement(
      background.createEmptyStats(),
      {
        model,
        apiModel: "ignored-catalog-value",
        chatgptModel: "ignored-catalog-value",
        modelObservedSource: "fetch-request",
        modelParameters: { model },
        submittedAt: now.toISOString(),
        promptHash: model,
        promptLength: 42
      },
      now
    );

    assert.equal(next.totals[storedModel], 1, model);
    assert.equal(next.events[0].apiModel, requestModel, model);
    assert.equal(next.events[0].chatgptModel, requestModel, model);
    assert.equal(next.events[0].modelParameters.model, requestModel, model);
  });
});

test("applyIncrement does not derive usage features from model names alone", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");

  ["gpt-realtime-2", "tts-1", "whisper-1", "gpt-image", "dall-e", "future-family-2026-thinking"].forEach((model) => {
    const next = background.applyIncrement(
      background.createEmptyStats(),
      {
        model,
        apiModel: model,
        chatgptModel: model,
        modelObservedSource: "fetch-request",
        modelParameters: { model },
        submittedAt: now.toISOString(),
        promptHash: `no-feature-${model}`,
        promptLength: 42
      },
      now
    );

    assert.equal(next.events[0].model, model);
    assert.deepEqual(next.events[0].usageFeatures, [], model);
    assert.equal(next.featuresByModel[model], undefined, model);
  });
});

test("parseNetworkRequestBody prefilters all feature aliases", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(JSON.stringify({
          selected_model: "future-family-2026-thinking",
          features: ["imagegen", "gpt_image", "gpt-image", "dalle", "dall_e", "input_audio", "output_audio", "tts", "whisper", "advanced_voice", "canvases"]
        }), "utf8")
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, ["audio", "canvas", "image_generation"]);
});

test("parseNetworkRequestBody does not derive features from model fields", () => {
  ["gpt-realtime-2", "tts-1", "whisper-1", "gpt-image", "dall-e"].forEach((model) => {
    const parsed = background.parseNetworkRequestBody({
      raw: [
        {
          bytes: Buffer.from(JSON.stringify({ model }), "utf8")
        }
      ]
    });

    assert.equal(parsed.model, model, model);
    assert.deepEqual(parsed.__usageFeatures, [], model);
  });
});

test("applyIncrement canonicalizes mixed-case and underscore request model slugs", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(JSON.stringify({ model: "GPT_4o", reasoning: { effort: "high" } }), "utf8")
      }
    ]
  });
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "GPT_4o",
      apiModel: "GPT_4o",
      chatgptModel: "GPT_4o",
      modelObservedSource: "fetch-request",
      modelParameters: parsed,
      submittedAt: now.toISOString(),
      promptHash: "mixed-case-model",
      promptLength: 42
    },
    now
  );

  assert.equal(parsed.model, "gpt-4o");
  assert.equal(next.totals["gpt-4o"], 1);
  assert.equal(next.totals.GPT_4o, undefined);
  assert.equal(next.events[0].model, "gpt-4o");
  assert.equal(next.events[0].apiModel, "gpt-4o");
  assert.equal(next.events[0].chatgptModel, "gpt-4o");
  assert.equal(next.events[0].modelParameters.model, "gpt-4o");
  assert.equal(next.variantsByModel["gpt-4o"], undefined);
  assert.deepEqual(next.parametersByModel["gpt-4o"].fields.model, { "gpt-4o": 1 });
});

test("applyIncrement stores supplied API model parameters", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelMode: "thinking",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": ["none", "low", "medium", "high", "xhigh"],
        "text.verbosity": ["low", "medium", "high"]
      },
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.models["future-family-2026-thinking"].apiModel, "future-family-2026-thinking");
  assert.equal(next.models["future-family-2026-thinking"].chatgptModel, "future-family-2026-thinking");
  assert.equal(next.models["future-family-2026-thinking"].mode, "thinking");
  assert.equal(next.events[0].chatgptModel, "future-family-2026-thinking");
  assert.deepEqual(next.events[0].modelParameters["text.verbosity"], ["low", "medium", "high"]);
  assert.equal(next.variantsByModel["future-family-2026-thinking"], undefined);
});

test("applyIncrement stores only model call parameters", () => {
  const stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  const next = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        temperature: 0.2,
        "image_generation_options.size": "1024x1024",
        voice: "advanced_voice",
        voice_mode: true,
        audio_mode: true,
        realtime_mode: true,
        size: 43299,
        quality: "attachment-quality",
        text: "Attached prompt text must not be counted as a model parameter.",
        conversation: "conversation-field",
        stream: true,
        conversation_mode: "primary_assistant",
        supports_buffering: true,
        supported_encodings: ["v1"],
        system_hints: "length:0"
      },
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  const parameters = next.events[0].modelParameters;
  assert.equal(parameters.model, "future-family-2026-thinking");
  assert.equal(parameters["reasoning.effort"], "high");
  assert.equal(parameters.temperature, 0.2);
  assert.equal(parameters["image_generation_options.size"], "1024x1024");
  assert.equal(parameters.voice, undefined);
  assert.equal(parameters.voice_mode, undefined);
  assert.equal(parameters.audio_mode, undefined);
  assert.equal(parameters.realtime_mode, undefined);
  assert.equal(parameters.size, undefined);
  assert.equal(parameters.quality, undefined);
  assert.equal(parameters.text, undefined);
  assert.equal(parameters.conversation, undefined);
  assert.equal(parameters.stream, undefined);
  assert.equal(parameters.conversation_mode, undefined);
  assert.equal(parameters.supports_buffering, undefined);
  assert.equal(parameters.supported_encodings, undefined);
  assert.equal(parameters.system_hints, undefined);
});

test("parseNetworkRequestBody covers official model parameters and excludes content transport fields", () => {
  const requestBody = {
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            reasoning: { effort: "high", summary: "auto" },
            text: { verbosity: "medium", format: { type: "json_schema" } },
            temperature: 0.2,
            top_p: 0.9,
            top_logprobs: 5,
            logprobs: true,
            logit_bias: { "123": -1 },
            frequency_penalty: 0.1,
            presence_penalty: 0.2,
            max_output_tokens: 2048,
            max_completion_tokens: 1024,
            max_tool_calls: 4,
            parallel_tool_calls: true,
            service_tier: "auto",
            truncation: "auto",
            stop: ["END"],
            modalities: ["text", "audio"],
            voice: "advanced_voice",
            voice_mode: true,
            audio_mode: true,
            realtime_mode: true,
            audio: { output: { voice: "alloy", speed: 1 }, format: "pcm16" },
            prompt: { id: "pmpt_123", version: "2", variables: { secret: "hidden" } },
            prompt_cache_key: "cache-key",
            prompt_cache_retention: "24h",
            safety_identifier: "user_123",
            include: ["reasoning.encrypted_content"],
            response_format: { type: "json_schema" },
            turn_detection: { type: "server_vad" },
            input_audio_transcription: { model: "gpt-realtime-whisper" },
            web_search_options: { search_context_size: "low" },
            image_generation_options: { size: "1024x1024" },
            tools: [{ type: "deep_search" }],
            size: 43299,
            quality: "attachment-quality",
            unknown_internal_knob: "future-value",
            stream: true,
            stream_options: { include_usage: true },
            conversation_mode: "primary_assistant",
            supports_buffering: true,
            supported_encodings: ["v1"],
            system_hints: "length:0",
            messages: [{ role: "user", content: "secret" }],
            input: "secret",
            instructions: "secret",
            metadata: { hidden: true },
            user: "user-id",
            transport: "sse",
            protocol: "chatgpt"
          }),
          "utf8"
        )
      }
    ]
  };

  const parsed = background.parseNetworkRequestBody(requestBody);

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed["reasoning.effort"], "high");
  assert.equal(parsed["reasoning.summary"], "auto");
  assert.equal(parsed["text.verbosity"], "medium");
  assert.equal(parsed["text.format.type"], "json_schema");
  assert.equal(parsed.temperature, 0.2);
  assert.equal(parsed.top_p, 0.9);
  assert.equal(parsed.top_logprobs, 5);
  assert.equal(parsed.logprobs, true);
  assert.equal(parsed.frequency_penalty, 0.1);
  assert.equal(parsed.presence_penalty, 0.2);
  assert.equal(parsed.max_output_tokens, 2048);
  assert.equal(parsed.max_completion_tokens, 1024);
  assert.equal(parsed.max_tool_calls, 4);
  assert.equal(parsed.parallel_tool_calls, true);
  assert.equal(parsed.service_tier, "auto");
  assert.equal(parsed.truncation, "auto");
  assert.equal(parsed.stop, undefined);
  assert.deepEqual(parsed.modalities, ["text", "audio"]);
  assert.equal(parsed.voice, undefined);
  assert.equal(parsed.voice_mode, undefined);
  assert.equal(parsed.audio_mode, undefined);
  assert.equal(parsed.realtime_mode, undefined);
  assert.equal(parsed["audio.output.voice"], "alloy");
  assert.equal(parsed["audio.output.speed"], 1);
  assert.equal(parsed["prompt.id"], undefined);
  assert.equal(parsed["prompt.version"], undefined);
  assert.equal(parsed.prompt_cache_key, undefined);
  assert.equal(parsed.prompt_cache_retention, "24h");
  assert.equal(parsed.safety_identifier, undefined);
  assert.equal(parsed.include, undefined);
  assert.equal(parsed["response_format.type"], "json_schema");
  assert.equal(parsed["turn_detection.type"], "server_vad");
  assert.equal(parsed["input_audio_transcription.model"], "gpt-realtime-whisper");
  assert.equal(parsed["web_search_options.search_context_size"], "low");
  assert.equal(parsed["image_generation_options.size"], "1024x1024");
  assert.equal(parsed.reasoning, undefined);
  assert.equal(parsed.text, undefined);
  assert.equal(parsed.response_format, undefined);
  assert.equal(parsed.image_generation_options, undefined);
  assert.equal(parsed.tools, undefined);
  assert.equal(parsed["tools.type"], undefined);
  assert.equal(parsed.size, undefined);
  assert.equal(parsed.quality, undefined);
  assert.equal(parsed.unknown_internal_knob, undefined);
  assert.equal(parsed.stream, undefined);
  assert.equal(parsed.stream_options, undefined);
  assert.equal(parsed.conversation_mode, undefined);
  assert.equal(parsed.supports_buffering, undefined);
  assert.equal(parsed.supported_encodings, undefined);
  assert.equal(parsed.system_hints, undefined);
  assert.equal(parsed.messages, undefined);
  assert.equal(parsed.input, undefined);
  assert.equal(parsed.instructions, undefined);
  assert.equal(parsed.metadata, undefined);
  assert.equal(parsed.user, undefined);
  assert.equal(parsed.transport, undefined);
  assert.equal(parsed.protocol, undefined);
  assert.equal(parsed["prompt.variables"], undefined);
  assert.equal(parsed.logit_bias, undefined);
});

test("model parameter sanitization drops free-text schemas, locations, predictions, and object values", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "gpt-5-6-thinking",
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "private_schema",
                description: "User-authored private instructions",
                schema: {
                  type: "object",
                  properties: {
                    secret: { type: "string", description: "Private field" }
                  }
                }
              }
            },
            web_search_options: {
              search_context_size: "low",
              user_location: {
                type: "approximate",
                city: "Denver",
                country: "US"
              }
            },
            prediction: {
              type: "content",
              content: "Private predicted text"
            },
            logit_bias: { "123": -1 },
            stop: ["PRIVATE END"],
            include: ["reasoning.encrypted_content"]
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "gpt-5-6-thinking");
  assert.equal(parsed["response_format.type"], "json_schema");
  assert.equal(parsed["web_search_options.search_context_size"], "low");
  assert.equal(parsed["response_format.json_schema.name"], undefined);
  assert.equal(parsed["response_format.json_schema.description"], undefined);
  assert.equal(parsed["response_format.json_schema.schema"], undefined);
  assert.equal(parsed["web_search_options.user_location.type"], undefined);
  assert.equal(parsed["web_search_options.user_location.city"], undefined);
  assert.equal(parsed["web_search_options.user_location.country"], undefined);
  assert.equal(parsed["prediction.type"], undefined);
  assert.equal(parsed["prediction.content"], undefined);
  assert.equal(parsed.logit_bias, undefined);
  assert.equal(parsed.stop, undefined);
  assert.equal(parsed.include, undefined);
});

test("parseNetworkRequestBody uses only the current request model field", () => {
  const withCurrentModel = {
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            selected_model: "future-family-2026-instant",
            default_model_slug: "gpt-4o-mini",
            last_message_model_slug: "gpt-4o-mini",
            model: "future-family-2026-thinking",
            temperature: 0.1
          }),
          "utf8"
        )
      }
    ]
  };
  const defaultOnly = {
    raw: [
      {
        bytes: Buffer.from(JSON.stringify({ default_model_slug: "gpt-4o-mini", temperature: 0.1 }), "utf8")
      }
    ]
  };

  assert.equal(background.parseNetworkRequestBody(withCurrentModel).model, "future-family-2026-thinking");
  assert.equal(background.parseNetworkRequestBody(defaultOnly).model, undefined);
});

test("parseNetworkRequestBody preserves model aliases while choosing canonical count model", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            selected_model: "gpt-5-3-instant",
            api_model: "gpt-5-2-thinking",
            chatgpt_model: "gpt-5-4-thinking",
            temperature: 0.2
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "gpt-5-4-thinking");
  assert.equal(parsed.api_model, "gpt-5-2-thinking");
  assert.equal(parsed.chatgpt_model, "gpt-5-4-thinking");
  assert.equal(parsed.selected_model, "gpt-5-3-instant");
  assert.equal(parsed.temperature, 0.2);
});

test("image-N-image request fields are feature names, not models", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [{ bytes: Buffer.from(JSON.stringify({ model: "image-2-image" }), "utf8") }]
  });
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "image-2-image",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "image-2-image" },
      source: "send-button",
      submittedAt: "2026-05-23T12:00:00.000Z",
      promptHash: "image-feature",
      promptLength: 10
    },
    new Date("2026-05-23T12:00:00.000Z")
  );

  assert.equal(parsed.model, undefined);
  assert.deepEqual(next.totals, {});
  assert.equal(next.events.length, 0);
});

test("applyIncrement preserves internal numbered GPT mode slugs for storage", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "gpt-5-2-thinking",
      apiModel: "gpt-5-2-thinking",
      chatgptModel: "gpt-5-2-thinking",
      modelObservedSource: "fetch-request:model",
      modelParameters: { model: "gpt-5-2-thinking" },
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "canonical-numbered",
      promptLength: 10
    },
    now
  );

  assert.equal(next.totals["gpt-5-2-thinking"], 1);
  assert.equal(next.totals["gpt-5-thinking"], undefined);
  assert.equal(next.byDate["2026-05-23"]["gpt-5-2-thinking"], 1);
  assert.equal(next.events[0].model, "gpt-5-2-thinking");
  assert.equal(next.events[0].apiModel, "gpt-5-2-thinking");
  assert.equal(next.events[0].chatgptModel, "gpt-5-2-thinking");
  assert.equal(next.events[0].modelParameters.model, "gpt-5-2-thinking");
});

test("applyIncrement counts request feature tags separately from model parameters", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "future-family-2026-thinking",
      apiModel: "ignored",
      chatgptModel: "ignored",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "medium"
      },
      usageFeatures: SUPPORTED_USAGE_FEATURES,
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.deepEqual(Object.keys(next.featuresByModel["future-family-2026-thinking"].features).sort(), SUPPORTED_USAGE_FEATURES);
  assert.equal(next.featuresByModel.thinking, undefined);
  SUPPORTED_USAGE_FEATURES.forEach((feature) => {
    assert.equal(next.featuresByModel["future-family-2026-thinking"].features[feature].count, 1, feature);
    assert.equal(next.featuresByModel["future-family-2026-thinking"].features[feature].name, SUPPORTED_USAGE_FEATURE_NAMES[feature], feature);
    assert.equal(next.totals[feature], undefined, feature);
    assert.equal(next.byDate["2026-05-23"][feature], undefined, feature);
    assert.equal(next.models[feature], undefined, feature);
    assert.equal(next.sessionsByModel[feature], undefined, feature);
    assert.equal(next.parametersByModel[feature], undefined, feature);
    assert.equal(next.variantsByModel[feature], undefined, feature);
    assert.equal(next.events.some((event) => event.model === feature), false, feature);
  });
  assert.deepEqual(next.events[0].usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(next.events[0].modelParameters["reasoning.effort"], "high");
  assert.equal(next.events[0].usageFeatures.includes("thinking"), false);
});

test("parseNetworkRequestBody detects every supported feature signal", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            canvas: true,
            image_generation_options: { size: "1024x1024" },
            conversation_mode: { kind: "agent mode" },
            web_search_options: { search_context_size: "low" },
            input_audio_transcription: { model: "gpt-realtime-whisper" },
            realtime_mode: true,
            audio_mode: true,
            voice_mode: true,
            modalities: ["text", "audio"],
            tools: [{ type: "deep research" }, { type: "search" }, { type: "image generation" }]
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(parsed["web_search_options.search_context_size"], "low");
  assert.equal(parsed["input_audio_transcription.model"], "gpt-realtime-whisper");
  assert.equal(parsed.conversation_mode, undefined);
  assert.equal(parsed.realtime_mode, undefined);
  assert.equal(parsed.audio_mode, undefined);
  assert.equal(parsed.voice_mode, undefined);
});

test("parseNetworkRequestBody detects direct feature flags and ignores disabled or prompt-scoped flags", () => {
  const direct = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            agentmode: true,
            "deep-search": true,
            canvas: true,
            image_generation: true,
            "web-search": true,
            search: true,
            "real-time": true,
            voice: true
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(direct.model, "future-family-2026-thinking");
  assert.deepEqual(direct.__usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(direct.agentmode, undefined);
  assert.equal(direct.canvas, undefined);
  assert.equal(direct["deep-search"], undefined);
  assert.equal(direct.image_generation, undefined);
  assert.equal(direct["web-search"], undefined);
  assert.equal(direct.search, undefined);
  assert.equal(direct["real-time"], undefined);
  assert.equal(direct.voice, undefined);

  const disabledAndPromptScoped = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            agent_mode: false,
            canvas: false,
            deep_search: "off",
            image_generation: { enabled: false },
            web_search: "disabled",
            search: "disabled",
            realtime_mode: false,
            voice_mode: false,
            prompt: {
              agentmode: true,
              canvas: true,
              deepsearch: true,
              image_generation: true,
              web_search: true,
              search: true,
              realtime: true,
              voice: true
            }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(disabledAndPromptScoped.model, "future-family-2026-thinking");
  assert.deepEqual(disabledAndPromptScoped.__usageFeatures, []);
});

test("parseNetworkRequestBody detects URL encoded feature flags without parameter pollution", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          [
            "model=future-family-2026-thinking",
            "reasoning_effort=high",
            "agentmode=true",
            "deepsearch=true",
            "image_generation=true",
            "web_search=true",
            "real_time=true",
            "voice=true",
            "canvas=true"
          ].join("&"),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed["reasoning.effort"], "high");
  assert.deepEqual(parsed.__usageFeatures, SUPPORTED_USAGE_FEATURES);
  assert.equal(parsed.agentmode, undefined);
  assert.equal(parsed.deepsearch, undefined);
  assert.equal(parsed.image_generation, undefined);
  assert.equal(parsed.web_search, undefined);
  assert.equal(parsed.real_time, undefined);
  assert.equal(parsed.voice, undefined);
  assert.equal(parsed.canvas, undefined);
});

test("parseNetworkRequestBody treats search booleans and search tools as web search", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            search: true,
            tools: [{ type: "search" }]
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, ["web_search"]);
  assert.equal(parsed.search, undefined);
  assert.equal(parsed.tools, undefined);
});

test("parseNetworkRequestBody ignores feature words inside prompt content", () => {
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            messages: [
              {
                role: "user",
                content: "Please compare web search, deep research, agent mode, image generation, canvas, realtime, and voice."
              }
            ],
            input: "web search deep research image generation canvas",
            instructions: "Use the words agent mode, canvas, and realtime in the answer.",
            metadata: {
              note: "voice audio web search canvas"
            }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.deepEqual(parsed.__usageFeatures, []);
  assert.equal(parsed.messages, undefined);
  assert.equal(parsed.input, undefined);
  assert.equal(parsed.instructions, undefined);
  assert.equal(parsed.metadata, undefined);
});

test("feature-like model fields do not become model counts", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const parsedFeatureOnly = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "canvas-v2",
            canvas: true,
            tools: [{ type: "deepsearch" }],
            image_generation_options: { size: "1024x1024" }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(parsedFeatureOnly.model, undefined);
  assert.deepEqual(parsedFeatureOnly.__usageFeatures, ["canvas", "deep_research", "image_generation"]);

  const ignored = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "agent-mode-v2",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "agent-mode-v2", temperature: 0.2 },
      usageFeatures: ["agent_mode"],
      submittedAt: now.toISOString(),
      promptHash: "feature-only",
      promptLength: 10
    },
    now
  );

  assert.deepEqual(ignored.totals, {});
  assert.deepEqual(ignored.featuresByModel, {});
  assert.equal(ignored.events.length, 0);

  const ignoredAudio = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "audio-v2",
      modelObservedSource: "fetch-request",
      modelParameters: { model: "audio-v2", temperature: 0.2 },
      usageFeatures: ["audio"],
      submittedAt: now.toISOString(),
      promptHash: "audio-feature-only",
      promptLength: 10
    },
    now
  );

  assert.deepEqual(ignoredAudio.totals, {});
  assert.deepEqual(ignoredAudio.featuresByModel, {});
  assert.equal(ignoredAudio.events.length, 0);
});

test("feature signals bind to selected real request model", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const parsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "canvas-v2",
            selected_model: "future-family-2026-thinking",
            canvas: true,
            reasoning: { effort: "high" },
            conversation_mode: { kind: "agent_mode" },
            tools: [{ type: "deepsearch" }],
            image_generation_options: { size: "1024x1024" }
          }),
          "utf8"
        )
      }
    ]
  });
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: parsed.model,
      chatgptModel: parsed.model,
      apiModel: parsed.model,
      modelObservedSource: "webRequest",
      modelParameters: parsed,
      usageFeatures: parsed.__usageFeatures,
      submittedAt: now.toISOString(),
      promptHash: "real-model",
      promptLength: 12
    },
    now
  );

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed.conversation_mode, undefined);
  assert.equal(parsed.tools, undefined);
  assert.equal(parsed["image_generation_options.size"], "1024x1024");
  assert.deepEqual(parsed.__usageFeatures, ["agent_mode", "canvas", "deep_research", "image_generation"]);
  assert.equal(next.totals["future-family-2026-thinking"], 1);
  assert.equal(next.totals["canvas-v2"], undefined);
  assert.equal(next.events[0].model, "future-family-2026-thinking");
  assert.equal(next.events[0].modelParameters.model, "future-family-2026-thinking");
  assert.deepEqual(next.events[0].usageFeatures, ["agent_mode", "canvas", "deep_research", "image_generation"]);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.canvas.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.deep_research.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.image_generation.count, 1);
  assert.equal(next.parametersByModel["future-family-2026-thinking"].fields.conversation_mode, undefined);
  assert.equal(next.parametersByModel["future-family-2026-thinking"].fields.tools, undefined);

  const audioParsed = background.parseNetworkRequestBody({
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "audio-v2",
            selected_model: "future-family-2026-thinking",
            modalities: ["text", "audio"],
            web_search_options: { search_context_size: "low" },
            input_audio_transcription: { model: "gpt-realtime-whisper" }
          }),
          "utf8"
        )
      }
    ]
  });

  assert.equal(audioParsed.model, "future-family-2026-thinking");
  assert.deepEqual(audioParsed.__usageFeatures, ["audio", "realtime", "web_search"]);
  assert.equal(audioParsed["web_search_options.search_context_size"], "low");
  assert.equal(audioParsed["input_audio_transcription.model"], "gpt-realtime-whisper");
});

test("applyIncrement aggregates observed parameter values and combinations by model", () => {
  let stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "medium",
        temperature: 0.2
      },
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "first",
      promptLength: 10
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "high",
        temperature: 0.2
      },
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: new Date(now.getTime() + 1000).toISOString(),
      promptHash: "second",
      promptLength: 12
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high",
        "text.verbosity": "medium",
        temperature: 0.2
      },
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: new Date(now.getTime() + 2000).toISOString(),
      promptHash: "third",
      promptLength: 14
    },
    now
  );

  const aggregate = stats.parametersByModel["future-family-2026-thinking"];
  const combinations = Object.values(aggregate.combinations);
  const mediumCombination = combinations.find((entry) => entry.parameters["text.verbosity"] === "medium");
  const highCombination = combinations.find((entry) => entry.parameters["text.verbosity"] === "high");

  assert.equal(aggregate.total, 3);
  assert.equal(combinations.length, 2);
  assert.equal(mediumCombination.count, 2);
  assert.equal(highCombination.count, 1);
  assert.deepEqual(aggregate.fields.model, { "future-family-2026-thinking": 3 });
  assert.deepEqual(aggregate.fields["reasoning.effort"], { high: 3 });
  assert.deepEqual(aggregate.fields["text.verbosity"], { medium: 2, high: 1 });
  assert.deepEqual(aggregate.fields.temperature, { "0.2": 3 });
  assert.equal(mediumCombination.parameters.temperature, 0.2);
  assert.equal(stats.variantsByModel["future-family-2026-thinking"], undefined);
});

test("applyIncrement keeps ChatGPT visible mode models as separate counters", () => {
  let stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      modelObservedSource: "fetch-request",
      submittedAt: now.toISOString(),
      promptHash: "thinking",
      promptLength: 12
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-instant",
      modelParameters: { model: "future-family-2026-instant", "reasoning.effort": "low" },
      modelObservedSource: "fetch-request",
      submittedAt: new Date(now.getTime() + 1000).toISOString(),
      promptHash: "instant",
      promptLength: 10
    },
    now
  );
  stats = background.applyIncrement(
    stats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelParameters: { model: "future-family-2026-thinking", "reasoning.effort": "high" },
      modelObservedSource: "fetch-request",
      submittedAt: new Date(now.getTime() + 2000).toISOString(),
      promptHash: "thinking-again",
      promptLength: 14
    },
    now
  );

  assert.equal(stats.totals["future-family-2026-thinking"], 2);
  assert.equal(stats.totals["future-family-2026-instant"], 1);
  assert.equal(stats.variantsByModel["future-family-2026-thinking"], undefined);
  assert.equal(stats.variantsByModel["future-family-2026-instant"], undefined);
  assert.equal(stats.parametersByModel["future-family-2026-thinking"].fields.model["future-family-2026-thinking"], 2);
  assert.equal(stats.parametersByModel["future-family-2026-instant"].fields.model["future-family-2026-instant"], 1);
});

test("applyIncrement migrates and cleans stored parameter aggregates", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "GPT-5.5": 2,
      "Unknown model": 8,
      unknown: 3
    },
    byDate: {
      "2026-05-22": {
        "GPT-5.5": 2,
        "Unknown model": 8,
        unknown: 3
      }
    },
    models: {
      "GPT-5.5": {
        label: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-thinking"
      },
      "Unknown model": {
        label: "Unknown model",
        apiModel: "unknown"
      },
      unknown: {
        label: "unknown",
        apiModel: "unknown"
      }
    },
    sessionsByModel: {},
    parametersByModel: {
      "GPT-5.5": {
        total: "2",
        combinations: {
          staleKey: {
            count: "2",
            parameters: {
              model: "gpt-5.5",
              "reasoning.effort": "low"
            },
            firstSubmittedAt: "2026-05-22T10:00:00.000Z",
            lastSubmittedAt: "2026-05-22T11:00:00.000Z"
          },
          badCount: {
            count: 0,
            parameters: {
              model: "gpt-5.5",
              "reasoning.effort": "high"
            }
          }
        },
        fields: {
          "reasoning.effort": {
            low: "2",
            high: 0
          },
          invalid: null
        }
      },
      "Unknown model": {
        total: 8,
        combinations: {
          unknown: {
            count: 8,
            parameters: {
              model: "unknown"
            }
          }
        },
        fields: {
          model: {
            unknown: 8
          }
        }
      },
      unknown: {
        total: 3,
        combinations: {
          unknown: {
            count: 3,
            parameters: {
              model: "unknown"
            }
          }
        },
        fields: {
          model: {
            unknown: 3
          }
        }
      }
    },
    events: [
      {
        model: "GPT-5.5"
      },
      {
        model: "Unknown model"
      },
      {
        model: "unknown"
      }
    ],
    lastUpdated: "2026-05-22T11:00:00.000Z"
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      source: "send-button",
      submittedAt: now.toISOString(),
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high"
      },
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  const aggregate = next.parametersByModel["future-family-2026-thinking"];
  const combinations = Object.values(aggregate.combinations);
  const lowCombination = combinations.find((entry) => entry.parameters["reasoning.effort"] === "low");
  const highCombination = combinations.find((entry) => entry.parameters["reasoning.effort"] === "high");

  assert.equal(next.parametersByModel["Unknown model"], undefined);
  assert.equal(next.parametersByModel.unknown, undefined);
  assert.equal(next.events.some((event) => event.model === "Unknown model"), false);
  assert.equal(next.events.some((event) => event.model === "unknown"), false);
  assert.equal(aggregate.total, 3);
  assert.equal(combinations.length, 2);
  assert.equal(lowCombination.count, 2);
  assert.equal(highCombination.count, 1);
  assert.equal(aggregate.fields.model["gpt-5.5"], undefined);
  assert.deepEqual(aggregate.fields.model, { "future-family-2026-thinking": 3 });
  assert.deepEqual(aggregate.fields["reasoning.effort"], { low: 2, high: 1 });
});

test("applyIncrement canonicalizes stored model labels across every aggregate", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {
      "GPT-5 5": 2,
      "GPT-5.5": 1
    },
    byDate: {
      "2026-05-23": {
        "GPT-5 5": 2,
        "GPT-5.5": 1
      }
    },
    models: {
      "GPT-5 5": {
        label: "GPT-5 5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-thinking",
        mode: "thinking"
      },
      "GPT-5.5": {
        label: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-instant",
        mode: "instant"
      }
    },
    sessionsByModel: {
      "GPT-5 5": {
        "legacy-conversation": {
          conversationId: "legacy-conversation",
          title: "Legacy title",
          count: 2,
          models: { "GPT-5 5": 2 },
          firstSubmittedAt: "2026-05-23T10:00:00.000Z",
          lastSubmittedAt: "2026-05-23T10:10:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/legacy-conversation"
        }
      },
      "GPT-5.5": {
        "legacy-conversation": {
          conversationId: "legacy-conversation",
          title: "Canonical title",
          count: 1,
          models: { "GPT-5.5": 1 },
          firstSubmittedAt: "2026-05-23T11:00:00.000Z",
          lastSubmittedAt: "2026-05-23T11:10:00.000Z",
          lastPageUrl: "https://chatgpt.com/c/legacy-conversation"
        }
      }
    },
    parametersByModel: {
      "GPT-5 5": {
        total: 2,
        combinations: {
          thinking: {
            count: 2,
            parameters: {
              model: "future-family-2026-thinking",
              "reasoning.effort": "high"
            },
            firstSubmittedAt: "2026-05-23T10:00:00.000Z",
            lastSubmittedAt: "2026-05-23T10:10:00.000Z"
          }
        },
        fields: {
          model: { "future-family-2026-thinking": 2 }
        }
      },
      "GPT-5.5": {
        total: 1,
        combinations: {
          instant: {
            count: 1,
            parameters: {
              model: "future-family-2026-instant",
              "reasoning.effort": "low"
            },
            firstSubmittedAt: "2026-05-23T11:00:00.000Z",
            lastSubmittedAt: "2026-05-23T11:10:00.000Z"
          }
        },
        fields: {
          model: { "future-family-2026-instant": 1 }
        }
      }
    },
    variantsByModel: {
      "GPT-5 5": {
        total: 2,
        variants: {
          "future-family-2026-thinking": {
            name: "future-family-2026-thinking",
            count: 2,
            apiModel: "gpt-5.5",
            mode: "thinking",
            firstSubmittedAt: "2026-05-23T10:00:00.000Z",
            lastSubmittedAt: "2026-05-23T10:10:00.000Z"
          }
        }
      },
      "GPT-5.5": {
        total: 1,
        variants: {
          "future-family-2026-instant": {
            name: "future-family-2026-instant",
            count: 1,
            apiModel: "gpt-5.5",
            mode: "instant",
            firstSubmittedAt: "2026-05-23T11:00:00.000Z",
            lastSubmittedAt: "2026-05-23T11:10:00.000Z"
          }
        }
      }
    },
    events: [
      {
        model: "GPT-5 5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-thinking"
      },
      {
        model: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "future-family-2026-instant"
      }
    ],
    lastUpdated: "2026-05-23T11:10:00.000Z"
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      source: "webRequest",
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/legacy-conversation",
      pageTitle: "Live title",
      modelParameters: {
        model: "future-family-2026-thinking",
        "reasoning.effort": "high"
      },
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.totals["GPT-5 5"], undefined);
  assert.equal(next.byDate["2026-05-23"]["GPT-5 5"], undefined);
  assert.equal(next.models["GPT-5 5"], undefined);
  assert.equal(next.sessionsByModel["GPT-5 5"], undefined);
  assert.equal(next.parametersByModel["GPT-5 5"], undefined);
  assert.equal(next.variantsByModel["GPT-5 5"], undefined);
  assert.equal(next.events.some((event) => event.model === "GPT-5 5"), false);
  assert.equal(next.events.some((event) => event.apiModel === "gpt-5.5"), false);
  assert.equal(next.events.some((event) => event.modelParameters && event.modelParameters.model === "gpt-5.5"), false);
  assert.equal(next.totals["GPT-5.5"], undefined);

  assert.equal(next.totals["future-family-2026-thinking"], 3);
  assert.equal(next.byDate["2026-05-23"]["future-family-2026-thinking"], 3);
  assert.equal(next.models["future-family-2026-thinking"].label, "future-family-2026-thinking");
  assert.equal(next.models["future-family-2026-thinking"].apiModel, "future-family-2026-thinking");
  assert.equal(next.sessionsByModel["future-family-2026-thinking"]["legacy-conversation"].count, 3);
  assert.deepEqual(next.sessionsByModel["future-family-2026-thinking"]["legacy-conversation"].models, { "future-family-2026-thinking": 3 });
  assert.equal(next.parametersByModel["future-family-2026-thinking"].total, 3);
  assert.equal(next.parametersByModel["future-family-2026-thinking"].fields.model["future-family-2026-thinking"], 3);
  assert.equal(next.variantsByModel["future-family-2026-thinking"].total, 2);
  assert.equal(next.variantsByModel["future-family-2026-thinking"].variants["future-family-2026-thinking"].count, 2);

  assert.equal(next.totals["future-family-2026-instant"], 1);
  assert.equal(next.parametersByModel["future-family-2026-instant"].total, 1);
  assert.equal(next.variantsByModel["future-family-2026-instant"].total, 1);
});

test("applyIncrement canonicalizes event-only request model metadata", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const existingStats = {
    version: 1,
    totals: {},
    byDate: {},
    models: {},
    sessionsByModel: {},
    variantsByModel: {},
    parametersByModel: {},
    events: [
      {
        model: "GPT-5.5",
        apiModel: "gpt-5.5",
        chatgptModel: "GPT-5.5",
        modelObservedSource: "fetch-request",
        modelParameters: {
          model: "future-family-2026-thinking",
          "reasoning.effort": "high"
        }
      }
    ]
  };

  const next = background.applyIncrement(
    existingStats,
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "future-family-2026-thinking",
      modelObservedSource: "fetch-request",
      modelParameters: {
        model: "future-family-2026-thinking",
        "text.verbosity": "high"
      },
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42
    },
    now
  );

  assert.equal(next.events.length, 2);
  assert.equal(next.events.some((event) => event.model === "GPT-5.5"), false);
  assert.equal(next.events.some((event) => event.apiModel === "gpt-5.5"), false);
  assert.equal(next.events[0].model, "future-family-2026-thinking");
  assert.equal(next.events[0].apiModel, "future-family-2026-thinking");
  assert.equal(next.events[0].modelParameters.model, "future-family-2026-thinking");
});

test("webRequest observations override DOM metadata with request body parameters", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const requestBody = {
    raw: [
      {
        bytes: Buffer.from(
          JSON.stringify({
            model: "future-family-2026-thinking",
            reasoning: { effort: "xhigh" },
            text: { verbosity: "high" },
            temperature: 0.3,
            top_p: 0.95,
            max_output_tokens: 1024,
            image_generation_options: { size: "1024x1024" },
            conversation_mode: { kind: "agent_mode" },
            tools: [{ type: "deep_research" }]
          }),
          "utf8"
        )
      }
    ]
  };

  const parsed = background.parseNetworkRequestBody(requestBody);
  const observed = background.observeNetworkRequest({
    tabId: 17,
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody
  }, now);
  const merged = background.mergeRecentNetworkObservation(
    {
      model: "GPT-5.5",
      apiModel: "gpt-5.5",
      chatgptModel: "GPT-5.5",
      modelParameters: { model: "gpt-5.5" },
      source: "enter-key",
      submittedAt: now.toISOString(),
      promptHash: "abc123",
      promptLength: 42,
      usageFeatures: ["web_search"]
    },
    { tab: { id: 17 } },
    new Date(now.getTime() + 500)
  );
  const next = background.applyIncrement(background.createEmptyStats(), merged, now);

  assert.equal(parsed.model, "future-family-2026-thinking");
  assert.equal(parsed["reasoning.effort"], "xhigh");
  assert.equal(parsed["text.verbosity"], "high");
  assert.equal(parsed.temperature, 0.3);
  assert.equal(observed.model, "future-family-2026-thinking");
  assert.equal(merged.chatgptModel, "future-family-2026-thinking");
  assert.equal(merged.modelObservedSource, "webRequest");
  assert.equal(merged.modelParameters.model, "future-family-2026-thinking");
  assert.equal(merged.modelParameters.max_output_tokens, 1024);
  assert.deepEqual(merged.usageFeatures, ["agent_mode", "deep_research", "image_generation", "web_search"]);
  assert.equal(next.events[0].modelParameters["reasoning.effort"], "xhigh");
  assert.equal(next.events[0].model, "future-family-2026-thinking");
  assert.equal(next.variantsByModel["future-family-2026-thinking"], undefined);
  assert.deepEqual(next.parametersByModel["future-family-2026-thinking"].fields["text.verbosity"], { high: 1 });
  assert.deepEqual(next.parametersByModel["future-family-2026-thinking"].fields.top_p, { "0.95": 1 });
  assert.deepEqual(next.parametersByModel["future-family-2026-thinking"].fields.max_output_tokens, { "1024": 1 });
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.image_generation.name, "Image generation");
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.deep_research.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.agent_mode.count, 1);
  assert.equal(next.featuresByModel["future-family-2026-thinking"].features.web_search.count, 1);
});

test("webRequest always retains the exact top-level reasoning effort from large ChatGPT request bodies", () => {
  const now = new Date("2026-08-23T07:05:00.000Z");
  const noisyReasoning = {};
  for (let index = 0; index < 70; index += 1) {
    noisyReasoning[`diagnostic_${String(index).padStart(2, "0")}`] = index;
  }
  const payload = JSON.stringify({
    model: "gpt-5-6-thinking",
    reasoning: noisyReasoning,
    reasoning_effort: "extended",
    conversation_id: "conversation-effort-0001",
    messages: [
      {
        id: "user-message-effort-0001",
        author: { role: "user" },
        content: { parts: ["private prompt"] }
      }
    ]
  });
  const requestBody = {
    raw: [
      { bytes: Buffer.from(payload.slice(0, 240), "utf8") },
      { bytes: Buffer.from(payload.slice(240), "utf8") }
    ]
  };

  const parsed = background.parseNetworkRequestBody(requestBody);
  const observed = background.observeNetworkRequest(
    {
      tabId: 171,
      method: "POST",
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody
    },
    now
  );
  const merged = background.mergeRecentNetworkObservation(
    {
      model: "GPT-5.6 Sol",
      selectedPublicModel: "GPT-5.6 Sol",
      selectedPublicModelSource: "selector-dom",
      source: "send-button",
      sourceMode: "chat",
      submittedAt: now.toISOString(),
      submissionId: "usage-effort-0001"
    },
    { tab: { id: 171 } },
    new Date(now.getTime() + 500)
  );
  const next = background.applyIncrement(background.createEmptyStats(), merged, now);

  assert.equal(parsed["reasoning.effort"], "extended");
  assert.equal(observed.modelParameters["reasoning.effort"], "extended");
  assert.equal(merged.modelParameters["reasoning.effort"], "extended");
  assert.equal(next.events[0].requestReasoningEffort, "extended");
  assert.equal(next.events[0].modelParameters["reasoning.effort"], "extended");
});

test("webRequest preserves exact submitted message linkage without storing prompt content", () => {
  const submitted = new Date("2026-08-23T06:10:00.000Z");
  const payload = JSON.stringify({
    model: "gpt-5-6-thinking",
    conversation_id: "conversation-exact-0001",
    messages: [
      {
        id: "user-message-exact-0001",
        author: { role: "user" },
        content: { parts: ["private prompt that must not be stored"] }
      }
    ]
  });
  background.observeNetworkRequest(
    {
      tabId: 160,
      method: "POST",
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody: {
        raw: [
          { bytes: Buffer.from(payload.slice(0, 70), "utf8") },
          { bytes: Buffer.from(payload.slice(70), "utf8") }
        ]
      }
    },
    new Date(submitted.getTime() + 25)
  );

  const merged = background.mergeRecentNetworkObservation(
    {
      submittedAt: submitted.toISOString(),
      pageUrl: "https://chatgpt.com/"
    },
    { tab: { id: 160 } },
    new Date(submitted.getTime() + 500)
  );
  const stored = background.applyIncrement(
    background.createEmptyStats(),
    merged,
    submitted
  );

  assert.equal(merged.conversationId, "conversation-exact-0001");
  assert.equal(merged.requestMessageId, "user-message-exact-0001");
  assert.equal(stored.events[0].conversationId, "conversation-exact-0001");
  assert.equal(stored.events[0].requestMessageId, "user-message-exact-0001");
  assert.doesNotMatch(JSON.stringify(stored), /private prompt/);
});

test("response recovery matches a stored event by exact submitted user message id", () => {
  const now = new Date("2026-08-23T06:12:00.000Z");
  const pending = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "submission-exact-message-0001",
      conversationId: "conversation-exact-0002",
      requestMessageId: "user-message-exact-0002",
      requestModel: "gpt-5-6-thinking",
      apiModel: "gpt-5-6-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: now.toISOString(),
      pageUrl: "https://chatgpt.com/c/conversation-exact-0002"
    },
    now
  );

  const resolved = background.applyResponseObservation(
    pending,
    {
      conversationId: "conversation-exact-0002",
      requestMessageId: "user-message-exact-0002",
      responseMessageId: "assistant-message-exact-0002",
      responseModel: "gpt-5-6-pro",
      observedSource: "message-dom:model-slug:recovered",
      observedAt: new Date(now.getTime() + 5000).toISOString()
    },
    new Date(now.getTime() + 5000)
  );

  assert.equal(resolved.events[0].submissionId, "submission-exact-message-0001");
  assert.equal(resolved.events[0].requestMessageId, "user-message-exact-0002");
  assert.equal(resolved.events[0].responseMessageId, "assistant-message-exact-0002");
  assert.equal(resolved.events[0].responseModel, "gpt-5-6-pro");
  assert.equal(background.totalCount(resolved), 1);
});

test("conversation event lookup exposes only local linkage fields in chronological order", () => {
  const first = new Date("2026-08-23T06:14:00.000Z");
  let stats = background.applyIncrement(
    background.createEmptyStats(),
    {
      submissionId: "pending-lookup-1",
      conversationId: "pending-conversation-0001",
      requestMessageId: "pending-user-1",
      requestModel: "gpt-5-6-thinking",
      apiModel: "gpt-5-6-thinking",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5-6-thinking" },
      submittedAt: first.toISOString(),
      pageUrl: "https://chatgpt.com/c/pending-conversation-0001"
    },
    first
  );
  stats = background.applyIncrement(
    stats,
    {
      submissionId: "pending-lookup-2",
      conversationId: "pending-conversation-0001",
      requestMessageId: "pending-user-2",
      requestModel: "gpt-5.6-luna-wm",
      apiModel: "gpt-5.6-luna-wm",
      modelObservedSource: "webRequest",
      modelParameters: { model: "gpt-5.6-luna-wm" },
      submittedAt: new Date(first.getTime() + 1000).toISOString(),
      pageUrl: "https://chatgpt.com/c/pending-conversation-0001"
    },
    new Date(first.getTime() + 1000)
  );

  const events = background.usageEventsForConversation(
    stats,
    "pending-conversation-0001"
  );
  assert.deepEqual(
    events.map((event) => [event.submissionId, event.requestMessageId]),
    [
      ["pending-lookup-1", "pending-user-1"],
      ["pending-lookup-2", "pending-user-2"]
    ]
  );
  assert.deepEqual(
    Object.keys(events[0]).sort(),
    [
      "conversationId",
      "requestMessageId",
      "requestModel",
      "responseMessageId",
      "responseModel",
      "submissionId",
      "submittedAt"
    ]
  );
});

test("webRequest observations preserve explicit research and agent conversation modes", () => {
  const base = new Date("2026-08-22T12:00:00.000Z");
  [
    ["research", "Deep research", "deep_research"],
    ["agent-mode", "Agent mode", "agent_mode"]
  ].forEach(([requestModel, storedModel, feature], index) => {
    const observedAt = new Date(base.getTime() + index * 1000);
    const observed = background.observeNetworkRequest({
      tabId: 180 + index,
      method: "POST",
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody: {
        raw: [{ bytes: Buffer.from(JSON.stringify({ model: requestModel }), "utf8") }]
      }
    }, observedAt);
    const merged = background.mergeRecentNetworkObservation({
      source: "send-button",
      submittedAt: observedAt.toISOString(),
      promptHash: `mode-${index}`,
      promptLength: 10
    }, { tab: { id: 180 + index } }, new Date(observedAt.getTime() + 200));
    const stats = background.applyIncrement(background.createEmptyStats(), merged, observedAt);

    assert.ok(observed, requestModel);
    assert.equal(merged.modelParameters.model, requestModel);
    assert.ok(merged.usageFeatures.includes(feature));
    assert.equal(stats.totals[storedModel], 1);
    assert.equal(stats.featuresByModel[storedModel].features[feature].count, 1);
  });
});

test("webRequest observations read model parameters from request URLs", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  const observed = background.observeNetworkRequest(
    {
      tabId: 18,
      method: "POST",
      url: "https://chatgpt.com/backend-api/f/conversation?model=future-family-2026-thinking&reasoning_effort=high&temperature=0.2"
    },
    now
  );
  const merged = background.mergeRecentNetworkObservation(
    {
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "url123",
      promptLength: 18
    },
    { tab: { id: 18 } },
    new Date(now.getTime() + 250)
  );
  const next = background.applyIncrement(background.createEmptyStats(), merged, now);

  assert.equal(observed.model, "future-family-2026-thinking");
  assert.equal(merged.modelParameters.model, "future-family-2026-thinking");
  assert.equal(merged.modelParameters["reasoning.effort"], "high");
  assert.equal(merged.modelParameters.temperature, "0.2");
  assert.equal(next.byDate["2026-05-23"]["future-family-2026-thinking"], 1);
});

test("webRequest observations accept a future versioned model family from the exact model field", () => {
  const now = new Date("2026-08-22T12:00:00.000Z");
  const observed = background.observeNetworkRequest(
    {
      tabId: 118,
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody: {
        raw: [{ bytes: Buffer.from(JSON.stringify({ model: "aurora-7" }), "utf8") }]
      }
    },
    now
  );

  assert.ok(observed);
  assert.equal(observed.model, "aurora-7");
  assert.equal(observed.modelParameters.model, "aurora-7");

  const rejected = background.observeNetworkRequest(
    {
      tabId: 119,
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody: {
        raw: [{ bytes: Buffer.from(JSON.stringify({ model: "temperature-v2" }), "utf8") }]
      }
    },
    now
  );
  assert.equal(rejected, null);
});

test("webRequest observations are consumed once per tab", () => {
  const now = new Date("2026-05-23T12:00:00.000Z");
  background.observeNetworkRequest(
    {
      tabId: 19,
      url: "https://chatgpt.com/backend-api/f/conversation",
      requestBody: {
        raw: [{ bytes: Buffer.from(JSON.stringify({ model: "future-family-2026-thinking" }), "utf8") }]
      }
    },
    now
  );

  const first = background.mergeRecentNetworkObservation(
    { source: "send-button", submittedAt: now.toISOString(), promptHash: "one", promptLength: 1 },
    { tab: { id: 19 } },
    new Date(now.getTime() + 100)
  );
  const second = background.mergeRecentNetworkObservation(
    {
      model: "GPT-5.5",
      modelObservedSource: "message-dom",
      modelParameters: { model: "gpt-5.5" },
      source: "send-button",
      submittedAt: now.toISOString(),
      promptHash: "two",
      promptLength: 2
    },
    { tab: { id: 19 } },
    new Date(now.getTime() + 200)
  );

  assert.equal(first.model, "future-family-2026-thinking");
  assert.equal(first.modelObservedSource, "webRequest");
  assert.equal(second.model, "GPT-5.5");
  assert.equal(second.modelObservedSource, "message-dom");
});

test("webRequest observations match the submitted request instead of a stale prior request", () => {
  const submitted = new Date("2026-08-22T12:00:00.000Z");
  background.observeNetworkRequest({
    tabId: 120,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5-5" }), "utf8") }]
    }
  }, new Date(submitted.getTime() - 5000));
  background.observeNetworkRequest({
    tabId: 120,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-sol" }), "utf8") }]
    }
  }, new Date(submitted.getTime() + 40));

  const merged = background.mergeRecentNetworkObservation(
    {
      model: "gpt-5-5",
      modelObservedSource: "message-dom:model-slug",
      modelParameters: { model: "gpt-5-5" },
      submittedAt: submitted.toISOString()
    },
    { tab: { id: 120 } },
    new Date(submitted.getTime() + 1000)
  );

  assert.equal(merged.model, "gpt-5.6-sol");
});

test("webRequest observations choose the first model-bearing request after submission", () => {
  const submitted = new Date("2026-08-22T12:10:00.000Z");
  background.observeNetworkRequest({
    tabId: 121,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-luna" }), "utf8") }]
    }
  }, new Date(submitted.getTime() + 25));
  background.observeNetworkRequest({
    tabId: 121,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-terra" }), "utf8") }]
    }
  }, new Date(submitted.getTime() + 900));

  const merged = background.mergeRecentNetworkObservation(
    { submittedAt: submitted.toISOString() },
    { tab: { id: 121 } },
    new Date(submitted.getTime() + 1200)
  );

  assert.equal(merged.model, "gpt-5.6-luna");
});

test("message DOM fallback matches the closest request before the rendered message", () => {
  const renderedAt = new Date("2026-08-22T12:15:05.000Z");
  background.observeNetworkRequest({
    tabId: 123,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-sol" }), "utf8") }]
    }
  }, new Date(renderedAt.getTime() - 4500));
  background.observeNetworkRequest({
    tabId: 123,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-luna" }), "utf8") }]
    }
  }, new Date(renderedAt.getTime() - 900));
  background.observeNetworkRequest({
    tabId: 123,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-terra" }), "utf8") }]
    }
  }, new Date(renderedAt.getTime() + 100));

  const merged = background.mergeRecentNetworkObservation(
    { source: "message-dom", submittedAt: renderedAt.toISOString() },
    { tab: { id: 123 } },
    new Date(renderedAt.getTime() + 500)
  );

  assert.equal(merged.model, "gpt-5.6-luna");
});

test("webRequest matching prioritizes the exact submitted user message id", () => {
  const renderedAt = new Date("2026-08-22T12:18:05.000Z");
  const requestBody = (model, messageId) => ({
    raw: [{
      bytes: Buffer.from(JSON.stringify({
        model,
        messages: [{ id: messageId, author: { role: "user" } }]
      }), "utf8")
    }]
  });
  background.observeNetworkRequest({
    tabId: 124,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: requestBody("gpt-5.6-sol", "user-exact-0001")
  }, new Date(renderedAt.getTime() - 4500));
  background.observeNetworkRequest({
    tabId: 124,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: requestBody("gpt-5.6-luna", "user-other-0002")
  }, new Date(renderedAt.getTime() - 900));

  const merged = background.mergeRecentNetworkObservation(
    {
      source: "message-dom",
      requestMessageId: "user-exact-0001",
      submittedAt: renderedAt.toISOString()
    },
    { tab: { id: 124 } },
    new Date(renderedAt.getTime() + 500)
  );

  assert.equal(merged.model, "gpt-5.6-sol");
  assert.equal(merged.requestMessageId, "user-exact-0001");
});

test("webRequest fallback never replaces an explicit submit message id or submit-time source mode", () => {
  const submittedAt = new Date("2026-08-22T12:19:00.000Z");
  background.observeNetworkRequest({
    tabId: 126,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{
        bytes: Buffer.from(JSON.stringify({
          model: "gpt-5-6-thinking",
          source_mode: "work",
          messages: [{ id: "different-user-message", author: { role: "user" } }]
        }), "utf8")
      }]
    }
  }, new Date(submittedAt.getTime() + 25));

  const merged = background.mergeRecentNetworkObservation(
    {
      source: "send-button",
      sourceMode: "chat",
      requestMessageId: "submitted-user-message",
      submittedAt: submittedAt.toISOString()
    },
    { tab: { id: 126 } },
    new Date(submittedAt.getTime() + 500)
  );

  assert.equal(merged.model, undefined);
  assert.equal(merged.requestMessageId, "submitted-user-message");
  assert.equal(merged.sourceMode, "chat");
});

test("an observation without a message id may fill the request while submit-time source mode stays authoritative", () => {
  const submittedAt = new Date("2026-08-22T12:19:30.000Z");
  background.observeNetworkRequest({
    tabId: 127,
    method: "POST",
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: {
      raw: [{
        bytes: Buffer.from(JSON.stringify({
          model: "gpt-5-6-thinking",
          source_mode: "work"
        }), "utf8")
      }]
    }
  }, new Date(submittedAt.getTime() + 25));

  const merged = background.mergeRecentNetworkObservation(
    {
      source: "send-button",
      sourceMode: "chat",
      requestMessageId: "submitted-user-message",
      submittedAt: submittedAt.toISOString()
    },
    { tab: { id: 127 } },
    new Date(submittedAt.getTime() + 500)
  );

  assert.equal(merged.requestModel, "gpt-5-6-thinking");
  assert.equal(merged.requestMessageId, "submitted-user-message");
  assert.equal(merged.sourceMode, "chat");
});

test("webRequest ignores read-only URL probes with model query parameters", () => {
  const observed = background.observeNetworkRequest({
    tabId: 122,
    method: "GET",
    url: "https://chatgpt.com/backend-api/models?model=gpt-5.6-terra"
  }, new Date("2026-08-22T12:20:00.000Z"));

  assert.equal(observed, null);
});

test("webRequest ignores model-bearing writes outside conversation submission endpoints", () => {
  const observed = background.observeNetworkRequest({
    tabId: 125,
    method: "POST",
    url: "https://chatgpt.com/backend-api/feedback",
    requestBody: {
      raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5.6-terra" }), "utf8") }]
    }
  }, new Date("2026-08-22T12:21:00.000Z"));

  assert.equal(observed, null);
  assert.equal(background.isConversationSubmissionUrl("https://chatgpt.com/backend-api/f/conversation"), true);
  assert.equal(background.isConversationSubmissionUrl("https://chat.openai.com/backend-api/conversation"), true);
  assert.equal(background.isConversationSubmissionUrl("https://chatgpt.com/backend-api/models"), false);
  assert.equal(background.isConversationSubmissionUrl("https://chatgpt.com/backend-api/conversation/feedback"), false);
});

test("applyIncrement stores daily counts using submittedAt date", () => {
  const next = background.applyIncrement(
    background.createEmptyStats(),
    {
      model: "gpt-4o",
      modelObservedSource: "fetch-response",
      modelParameters: { model: "gpt-4o" },
      source: "send-button",
      submittedAt: "2026-05-23T23:59:59.000Z",
      promptHash: "date123",
      promptLength: 12
    },
    new Date("2026-05-24T00:00:10.000Z")
  );

  assert.equal(next.byDate["2026-05-23"]["gpt-4o"], 1);
  assert.equal(next.byDate["2026-05-24"], undefined);
});

test("applyIncrement limits stored event history", () => {
  let stats = background.createEmptyStats();
  const now = new Date("2026-05-23T12:00:00.000Z");

  for (let index = 0; index < 510; index += 1) {
    stats = background.applyIncrement(
      stats,
      {
        model: "GPT-4o",
        modelObservedSource: "fetch-request",
        modelParameters: { model: "gpt-4o" },
        source: "enter-key",
        submittedAt: new Date(now.getTime() + index).toISOString(),
        promptHash: String(index),
        promptLength: index
      },
      now
    );
  }

  assert.equal(stats.totals["gpt-4o"], 510);
  assert.equal(stats.events.length, 500);
  assert.equal(stats.events[0].promptHash, undefined);
  assert.equal(stats.events[0].promptLength, undefined);
});

test("badgeText keeps action badge compact", () => {
  assert.equal(background.badgeText(0), "");
  assert.equal(background.badgeText(12), "12");
  assert.equal(background.badgeText(99), "99");
  // 数字大就用很短的 99+,避免长数字盖住工具栏图标
  assert.equal(background.badgeText(100), "99+");
  assert.equal(background.badgeText(10000), "99+");
});

test("OpenAI status records drive compact abnormal badge and title", () => {
  const major = background.createOpenAIStatusRecord({
    ok: true,
    status: background.sanitizeOpenAIStatusPayload({
      components: [
        { id: "chatgpt", name: "ChatGPT", status: "major_outage", position: 1 },
        { id: "conversations", name: "Conversations", status: "operational", position: 2 }
      ]
    }, "2026-06-04T04:00:00.000Z")
  }, "2026-06-04T04:00:01.000Z");

  assert.equal(major.state, "major");
  assert.equal(background.isAbnormalOpenAIStatus(major), true);
  assert.equal(background.statusBadgeText(major, 42), "!");
  assert.equal(background.statusBadgeColor(major), "#dc2626");
  assert.match(background.actionTitle({ totals: { "gpt-5-thinking": 42 } }, major), /OpenAI status: Major outage/);

  const operational = background.createOpenAIStatusRecord({
    ok: true,
    status: background.sanitizeOpenAIStatusPayload({
      components: [{ id: "chatgpt", name: "ChatGPT", status: "operational", position: 1 }]
    }, "2026-06-04T04:00:00.000Z")
  }, "2026-06-04T04:00:01.000Z");

  assert.equal(operational.state, "operational");
  assert.equal(background.isAbnormalOpenAIStatus(operational), false);
  assert.equal(background.statusBadgeText(operational, 42), "42");
  assert.equal(background.statusBadgeColor(operational), "#2563eb");

  const timeout = background.createOpenAIStatusRecord({ ok: false, error: "OpenAI status request timed out." }, "2026-06-04T04:00:02.000Z");
  assert.equal(timeout.state, "timeout");
  assert.match(timeout.label, /timed out/);
  assert.equal(background.isAbnormalOpenAIStatus(timeout), true);
  assert.equal(background.statusBadgeText(timeout, 0), "?");
  assert.equal(background.statusBadgeColor(timeout), "#d97706");

  const fetchFail = background.createOpenAIStatusRecord({ ok: false, error: "Fetch is not available in this Chrome runtime." }, "2026-06-04T04:00:03.000Z");
  assert.equal(fetchFail.state, "fetch-failure");
  assert.equal(background.isAbnormalOpenAIStatus(fetchFail), true);
  assert.equal(background.statusBadgeText(fetchFail, 0), "?");
});

test("sanitizeSettings keeps only supported UI languages, main views, and statistics modes", () => {
  assert.deepEqual(background.sanitizeSettings({
    language: "en",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    activeView: "status",
    statisticsMode: "internal",
    chartType: "donut",
    themeMode: "dark",
    sourceModeFilter: "work",
    showTrendChart: false,
    showTextStatistics: true,
    mappedVisibleModels: ["GPT-5.6 Sol"],
    mappedKnownModels: ["GPT-5.6 Sol", "GPT-5.6 Luna"],
    mappedModelSelectionInitialized: true,
    internalVisibleModels: ["gpt-5-6-thinking"],
    internalKnownModels: ["gpt-5-6-thinking", "gpt-5-6-pro"],
    internalModelSelectionInitialized: true
  }), {
    version: 1,
    language: "en",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    activeView: "status",
    statisticsMode: "internal",
    chartType: "donut",
    themeMode: "dark",
    sourceModeFilter: "work",
    showTrendChart: false,
    showTextStatistics: true,
    mappedVisibleModels: ["GPT-5.6 Sol"],
    mappedKnownModels: ["GPT-5.6 Sol", "GPT-5.6 Luna"],
    mappedModelSelectionInitialized: true,
    internalVisibleModels: ["gpt-5-6-thinking"],
    internalKnownModels: ["gpt-5-6-thinking", "gpt-5-6-pro"],
    internalModelSelectionInitialized: true
  });
  assert.deepEqual(background.sanitizeSettings({
    language: "fr",
    startDate: "bad",
    endDate: "2026-05-30",
    activeView: "unsupported",
    statisticsMode: "unsupported",
    mappedVisibleModels: "GPT-5.6 Sol",
    mappedKnownModels: null,
    mappedModelSelectionInitialized: "true",
    internalVisibleModels: {},
    internalKnownModels: 42,
    internalModelSelectionInitialized: 1
  }), {
    version: 1,
    language: "en",
    startDate: "",
    endDate: "2026-05-30",
    activeView: "chart",
    statisticsMode: "mapped",
    chartType: "line",
    themeMode: "system",
    sourceModeFilter: "all",
    showTrendChart: true,
    showTextStatistics: true,
    mappedVisibleModels: [],
    mappedKnownModels: [],
    mappedModelSelectionInitialized: false,
    internalVisibleModels: [],
    internalKnownModels: [],
    internalModelSelectionInitialized: false
  });
  assert.equal(background.sanitizeSettings({ activeView: "export" }).activeView, "export");
  assert.deepEqual(background.sanitizeSettings(null), {
    version: 1,
    language: "en",
    startDate: "",
    endDate: "",
    activeView: "chart",
    statisticsMode: "mapped",
    chartType: "line",
    themeMode: "system",
    sourceModeFilter: "all",
    showTrendChart: true,
    showTextStatistics: true,
    mappedVisibleModels: [],
    mappedKnownModels: [],
    mappedModelSelectionInitialized: false,
    internalVisibleModels: [],
    internalKnownModels: [],
    internalModelSelectionInitialized: false
  });
});

test("sanitizeSettings cleans and bounds mapped and internal model visibility independently", () => {
  const longModel = "x".repeat(120);
  const internalKnownModels = Array.from({ length: 405 }, (_, index) => `internal-${index}`);
  const sanitized = background.sanitizeSettings({
    mappedVisibleModels: [
      " GPT-5.6 Sol ",
      "GPT-5.6 Sol",
      "\u0000gpt-5-6-thinking\u007f",
      "",
      null
    ],
    mappedKnownModels: ["GPT-5.6 Sol", " GPT-5.6 Luna "],
    mappedModelSelectionInitialized: true,
    internalVisibleModels: [" gpt-5-6-thinking ", longModel],
    internalKnownModels,
    internalModelSelectionInitialized: "true"
  });

  assert.deepEqual(sanitized.mappedVisibleModels, ["GPT-5.6 Sol", "gpt-5-6-thinking"]);
  assert.deepEqual(sanitized.mappedKnownModels, ["GPT-5.6 Sol", "GPT-5.6 Luna"]);
  assert.equal(sanitized.mappedModelSelectionInitialized, true);
  assert.deepEqual(sanitized.internalVisibleModels, ["gpt-5-6-thinking", "x".repeat(96)]);
  assert.equal(sanitized.internalKnownModels.length, 400);
  assert.equal(sanitized.internalKnownModels[0], "internal-0");
  assert.equal(sanitized.internalKnownModels[399], "internal-399");
  assert.equal(sanitized.internalModelSelectionInitialized, false);
});

test("sanitizeSettings clamps stored future dates to the current UTC calendar day", () => {
  const today = background.todayKey();
  const tomorrowDate = new Date();
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = background.todayKey(tomorrowDate);

  assert.equal(
    background.todayKey(new Date("2026-08-24T00:30:00.000Z")),
    "2026-08-24",
  );
  assert.equal(background.dateSettingNoLaterThanToday(tomorrow), today);
  assert.deepEqual(background.sanitizeSettings({
    language: "en",
    startDate: tomorrow,
    endDate: tomorrow
  }), {
    version: 1,
    language: "en",
    startDate: today,
    endDate: today,
    activeView: "chart",
    statisticsMode: "mapped",
    chartType: "line",
    themeMode: "system",
    sourceModeFilter: "all",
    showTrendChart: true,
    showTextStatistics: true,
    mappedVisibleModels: [],
    mappedKnownModels: [],
    mappedModelSelectionInitialized: false,
    internalVisibleModels: [],
    internalKnownModels: [],
    internalModelSelectionInitialized: false
  });
});

test("mergeSettings updates one shared UI preference without resetting the other entry point's settings", () => {
  const current = {
    version: 1,
    language: "en",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    activeView: "status",
    statisticsMode: "internal",
    chartType: "donut",
    themeMode: "dark",
    sourceModeFilter: "all",
    showTrendChart: true,
    showTextStatistics: true,
    mappedVisibleModels: ["GPT-5.6 Sol"],
    mappedKnownModels: ["GPT-5.6 Sol", "GPT-5.6 Luna"],
    mappedModelSelectionInitialized: true,
    internalVisibleModels: ["gpt-5-6-thinking"],
    internalKnownModels: ["gpt-5-6-thinking", "gpt-5-6-pro"],
    internalModelSelectionInitialized: true
  };

  assert.deepEqual(background.mergeSettings(current, { activeView: "export" }), {
    version: 1,
    language: "en",
    startDate: "2026-05-01",
    endDate: "2026-05-30",
    activeView: "export",
    statisticsMode: "internal",
    chartType: "donut",
    themeMode: "dark",
    sourceModeFilter: "all",
    showTrendChart: true,
    showTextStatistics: true,
    mappedVisibleModels: ["GPT-5.6 Sol"],
    mappedKnownModels: ["GPT-5.6 Sol", "GPT-5.6 Luna"],
    mappedModelSelectionInitialized: true,
    internalVisibleModels: ["gpt-5-6-thinking"],
    internalKnownModels: ["gpt-5-6-thinking", "gpt-5-6-pro"],
    internalModelSelectionInitialized: true
  });
});

test("mergeSettings cleans one model visibility mode without resetting the other mode", () => {
  const current = background.sanitizeSettings({
    mappedVisibleModels: ["GPT-5.6 Sol"],
    mappedKnownModels: ["GPT-5.6 Sol", "GPT-5.6 Luna"],
    mappedModelSelectionInitialized: true,
    internalVisibleModels: ["gpt-5-6-thinking"],
    internalKnownModels: ["gpt-5-6-thinking", "gpt-5-6-pro"],
    internalModelSelectionInitialized: true
  });

  const merged = background.mergeSettings(current, {
    mappedVisibleModels: [" GPT-5.6 Luna ", "GPT-5.6 Luna"],
    mappedKnownModels: ["GPT-5.6 Sol", " GPT-5.6 Luna "],
    mappedModelSelectionInitialized: true
  });

  assert.deepEqual(merged.mappedVisibleModels, ["GPT-5.6 Luna"]);
  assert.deepEqual(merged.mappedKnownModels, ["GPT-5.6 Sol", "GPT-5.6 Luna"]);
  assert.equal(merged.mappedModelSelectionInitialized, true);
  assert.deepEqual(merged.internalVisibleModels, ["gpt-5-6-thinking"]);
  assert.deepEqual(merged.internalKnownModels, ["gpt-5-6-thinking", "gpt-5-6-pro"]);
  assert.equal(merged.internalModelSelectionInitialized, true);
  assert.deepEqual(current.mappedVisibleModels, ["GPT-5.6 Sol"]);
});

test("settingsSet serializes simultaneous patches so entry points cannot overwrite each other", async () => {
  const previousChrome = globalThis.chrome;
  let stored = background.sanitizeSettings({
    language: "zh",
    activeView: "chart",
    statisticsMode: "mapped",
    sourceModeFilter: "all",
    showTrendChart: true,
    showTextStatistics: true
  });
  let activeStorageOperations = 0;
  let maximumConcurrentStorageOperations = 0;

  globalThis.chrome = {
    storage: {
      local: {
        get(_keys, callback) {
          activeStorageOperations += 1;
          maximumConcurrentStorageOperations = Math.max(
            maximumConcurrentStorageOperations,
            activeStorageOperations
          );
          setTimeout(() => {
            activeStorageOperations -= 1;
            callback({ [background.SETTINGS_KEY]: { ...stored } });
          }, 4);
        },
        set(record, callback) {
          activeStorageOperations += 1;
          maximumConcurrentStorageOperations = Math.max(
            maximumConcurrentStorageOperations,
            activeStorageOperations
          );
          setTimeout(() => {
            stored = { ...record[background.SETTINGS_KEY] };
            activeStorageOperations -= 1;
            callback();
          }, 4);
        }
      }
    }
  };

  try {
    await Promise.all([
      new Promise((resolve) => {
        background.settingsSet({ activeView: "status" }, resolve);
      }),
      new Promise((resolve) => {
        background.settingsSet({ statisticsMode: "internal" }, resolve);
      }),
      new Promise((resolve) => {
        background.settingsSet({ showTrendChart: false }, resolve);
      })
    ]);
  } finally {
    if (typeof previousChrome === "undefined") {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = previousChrome;
    }
  }

  assert.equal(maximumConcurrentStorageOperations, 1);
  assert.equal(stored.activeView, "status");
  assert.equal(stored.statisticsMode, "internal");
  assert.equal(stored.showTrendChart, false);
  assert.equal(stored.showTextStatistics, true);
});

test("sanitizeOpenAIStatusPayload keeps only web ChatGPT availability without incident timeline data", () => {
  const status = background.sanitizeOpenAIStatusPayload(
    {
      page: {
        id: "openai",
        name: "OpenAI",
        url: "https://status.openai.com/",
        updated_at: "2026-05-30T12:00:00.000Z"
      },
      status: {
        indicator: "minor",
        description: "Partially degraded service"
      },
      components: [
        {
          id: "responses",
          name: "Responses",
          status: "operational",
          position: 1,
          updated_at: "2026-05-30T12:01:00.000Z"
        },
        {
          id: "realtime",
          name: "Realtime",
          status: "degraded_performance",
          position: 2,
          updated_at: "2026-05-30T12:02:00.000Z"
        },
        {
          id: "images",
          name: "Images",
          status: "operational",
          position: 3
        },
        {
          id: "chatgpt-atlas",
          name: "ChatGPT Atlas",
          status: "operational",
          position: 4
        },
        {
          id: "agent",
          name: "Agent",
          status: "operational",
          position: 5
        },
        {
          id: "image-generation",
          name: "Image Generation",
          status: "operational",
          position: 6
        },
        {
          id: "file-uploads",
          name: "File uploads",
          status: "operational",
          position: 7
        },
        {
          id: "voice-mode",
          name: "Voice mode",
          status: "operational",
          position: 8
        },
        {
          id: "login",
          name: "Login",
          status: "operational",
          position: 9
        },
        {
          id: "login-web",
          name: "Login",
          status: "degraded_performance",
          position: 10
        }
      ],
      incidents: [
        {
          id: "incident-1",
          name: "Realtime degradation",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/example",
          updated_at: "2026-05-30T12:03:00.000Z"
        },
        {
          id: "incident-1b",
          name: "API users may see increased error rates for GPT-5.4",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/api",
          updated_at: "2026-05-30T12:03:00.000Z"
        },
        {
          id: "incident-1c",
          name: "ChatGPT Atlas browsing issue",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/atlas",
          updated_at: "2026-05-30T12:03:00.000Z",
          components: [{ name: "ChatGPT Atlas" }]
        },
        {
          id: "incident-2",
          name: "ChatGPT conversations latency",
          status: "investigating",
          impact: "minor",
          shortlink: "https://stspg.io/chatgpt",
          updated_at: "2026-05-30T12:03:00.000Z",
          components: [{ name: "Conversations" }],
          incident_updates: [
            {
              body: "Some users may see slower ChatGPT conversations on web.",
              status: "investigating",
              updated_at: "2026-05-30T12:03:00.000Z"
            }
          ]
        }
      ]
    },
    "2026-05-30T12:04:00.000Z"
  );

  assert.equal(status.page.name, "OpenAI");
  assert.equal(status.status.indicator, "minor");
  assert.equal(status.status.description, "");
  assert.equal(status.realtime, undefined);
  assert.equal(status.components.some((component) => component.name === "Responses"), false);
  assert.equal(status.components.some((component) => component.name === "Realtime"), false);
  assert.equal(status.components.some((component) => component.name === "Images"), false);
  assert.equal(status.components.some((component) => component.name === "ChatGPT Atlas"), false);
  assert.equal(status.components.some((component) => component.name === "Agent"), true);
  assert.equal(status.components.some((component) => component.name === "Image Generation"), true);
  assert.equal(status.components.some((component) => component.name === "File uploads"), true);
  assert.equal(status.components.some((component) => component.name === "Voice mode"), true);
  assert.equal(status.components.some((component) => component.name === "Login"), true);
  assert.equal(status.components.filter((component) => component.name === "Login").length, 1);
  assert.equal(status.components.find((component) => component.name === "Login").status, "degraded_performance");
  assert.deepEqual(status.incidents, []);
  assert.equal(status.sourceUrl, "https://status.openai.com/");
});

test("sanitizeOpenAIStatusPayload aggregates top status from filtered ChatGPT web components", () => {
  const status = background.sanitizeOpenAIStatusPayload(
    {
      status: {
        indicator: "critical",
        description: "Major API outage"
      },
      components: [
        { id: "responses", name: "Responses", status: "major_outage", position: 1 },
        { id: "chatgpt", name: "ChatGPT", status: "operational", position: 2 },
        { id: "conversations", name: "Conversations", status: "operational", position: 3 }
      ]
    },
    "2026-05-30T12:04:00.000Z"
  );

  assert.equal(status.status.indicator, "none");
  assert.equal(status.status.description, "");
  assert.deepEqual(
    status.components.map((component) => component.name),
    ["ChatGPT", "Conversations"]
  );
});

test("complete OpenAI status components are merged without truncating ChatGPT web entries", () => {
  const webNames = [
    "Login",
    "Search",
    "Deep Research",
    "Agent",
    "Voice mode",
    "Connectors/Apps",
    "File uploads",
    "GPTs",
    "Conversations",
    "Image Generation",
    "Codex Web",
    "ChatGPT Work",
    "Sites"
  ];
  const merged = background.mergeOpenAIStatusPayloads(
    {
      page: { id: "openai", name: "OpenAI" },
      status: { indicator: "none" },
      components: [{ id: "login", name: "Login", status: "operational", position: 1 }]
    },
    {
      page: { id: "openai", name: "OpenAI" },
      components: webNames.map((name, index) => ({
        id: `web-${index}`,
        name,
        status: "operational",
        position: index + 1
      })).concat([{ id: "responses", name: "Responses", status: "major_outage", position: 50 }])
    }
  );
  const status = background.sanitizeOpenAIStatusPayload(merged, "2026-08-22T20:00:00.000Z");

  assert.equal(status.complete, true);
  assert.deepEqual(status.components.map((component) => component.name), webNames);
  assert.equal(status.components.length, 13);
  assert.equal(status.status.indicator, "none");
});

test("OpenAI status fetch combines summary and full components, reports partial fallback, and fails only when both endpoints fail", async () => {
  function response(status, payload) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload
    };
  }
  function fetchStatus(fetchImpl) {
    return new Promise((resolve) => background.fetchOpenAIStatus(resolve, fetchImpl));
  }
  const summary = {
    page: { id: "openai", name: "OpenAI" },
    status: { indicator: "none" },
    components: [{ id: "login", name: "Login", status: "operational", position: 1 }]
  };
  const components = {
    page: { id: "openai", name: "OpenAI" },
    components: [
      { id: "login", name: "Login", status: "operational", position: 1 },
      { id: "files", name: "File uploads", status: "operational", position: 2 },
      { id: "gpts", name: "GPTs", status: "operational", position: 3 },
      { id: "codex-web", name: "Codex Web", status: "operational", position: 4 },
      { id: "chatgpt-work", name: "ChatGPT Work", status: "operational", position: 5 }
    ]
  };

  const complete = await fetchStatus(async (url) => (
    String(url).includes("components.json") ? response(200, components) : response(200, summary)
  ));
  assert.equal(complete.ok, true);
  assert.equal(complete.status.complete, true);
  assert.deepEqual(
    complete.status.components.map((component) => component.name),
    ["Login", "File uploads", "GPTs", "Codex Web", "ChatGPT Work"]
  );

  const partial = await fetchStatus(async (url) => (
    String(url).includes("components.json") ? response(503, {}) : response(200, summary)
  ));
  assert.equal(partial.ok, true);
  assert.equal(partial.status.complete, false);
  assert.deepEqual(partial.status.components.map((component) => component.name), ["Login"]);
  assert.equal(partial.status.warnings.length, 1);
  assert.match(partial.status.warnings[0], /components HTTP 503/);

  const failed = await fetchStatus(async (url) => (
    response(String(url).includes("components.json") ? 503 : 502, {})
  ));
  assert.equal(failed.ok, false);
  assert.match(failed.error, /summary HTTP 502/);
  assert.match(failed.error, /components HTTP 503/);
});

test("isChatGPTUrl accepts ChatGPT application pages and rejects data endpoints", () => {
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/"), true);
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/c/abc"), true);
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/library"), true);
  assert.equal(background.isChatGPTUrl("https://chat.openai.com/"), true);
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/backend-api/models"), false);
  assert.equal(background.isChatGPTUrl("https://chatgpt.com/api/auth/session"), false);
  assert.equal(background.isChatGPTUrl("https://chat.openai.com/backend-api/conversations"), false);
  assert.equal(background.isChatGPTUrl("https://example.com/"), false);
});

test("MAIN-world project extractor returns real React project names in rendered sidebar order", () => {
  const firstId = "g-p-11111111111111111111111111111111";
  const secondId = "g-p-22222222222222222222222222222222";
  const firstProject = {
    gizmoResource: {
      gizmo: {
        id: firstId,
        short_url: `${firstId}-route-slug`,
        display: { name: "真实项目一" }
      }
    },
    authorization: "Bearer must-not-leave-main-world"
  };
  firstProject.loop = firstProject;
  const firstRow = {
    getAttribute() { return ""; },
    querySelector() { return null; }
  };
  Object.defineProperty(firstRow, "__reactProps$first", {
    value: { project: firstProject },
    enumerable: false
  });

  const secondRow = {
    getAttribute() { return ""; },
    querySelector() { return null; }
  };
  Object.defineProperty(secondRow, "__reactFiber$second", {
    value: {
      memoizedProps: {
        gizmo: {
          id: secondId,
          display_name: "Research / 研究"
        }
      }
    },
    enumerable: false
  });

  const duplicateRow = {
    getAttribute() { return ""; },
    querySelector() { return null; },
    "__reactProps$duplicate": {
      project: { gizmo_id: firstId, project_title: "错误重复名" }
    }
  };
  const unrelatedRow = {
    getAttribute() { return ""; },
    querySelector() { return null; },
    "__reactProps$unrelated": {
      title: "Conversation title",
      accessToken: "must-not-be-returned"
    }
  };
  let requestedSelector = "";
  const document = {
    querySelectorAll(selector) {
      requestedSelector = selector;
      return [firstRow, secondRow, duplicateRow, unrelatedRow];
    }
  };
  const serializedExtractor = `(${background.extractRenderedProjectDirectoriesFromMainWorld.toString()})()`;
  const result = vm.runInNewContext(serializedExtractor, { document });

  assert.equal(requestedSelector, "[class~='group/project-unfurl-row']");
  assert.deepEqual(
    Array.from(result.entries, (entry) => ({
      gizmoId: entry.gizmoId,
      projectName: entry.projectName,
      projectOrder: entry.projectOrder
    })),
    [
      { gizmoId: firstId, projectName: "真实项目一", projectOrder: 0 },
      { gizmoId: secondId, projectName: "Research / 研究", projectOrder: 1 }
    ]
  );
  assert.deepEqual(Array.from(result.projectOrder), [firstId, secondId]);
  assert.doesNotMatch(JSON.stringify(result), /Bearer|accessToken|must-not/i);
});

test("MAIN-world project extractor reads the exact project catalog from bounded React Fiber ancestors", () => {
  const projects = [
    ["g-p-6a4c521f96a88191bddcaf82bb8081ae", "invest"],
    ["g-p-6a4a938ff7888191bd120d64ef3a3b6e", "@#!#"],
    ["g-p-6a4b8296bd608191b14b08be897b746a", "prompt"],
    ["g-p-6a7d3f0e0970819198b164ac76243cb4", "Crea"],
    ["g-p-6a4b80c229f8819185e39d411e12e893", "code"]
  ];
  const catalog = projects.map(([id, name]) => ({
    gizmo: {
      gizmo: {
        id,
        short_url: `${id}-${name.replace(/[^a-z0-9]+/gi, "").toLowerCase()}`,
        display: { name },
        authorization: "must-not-leave-main-world"
      }
    },
    account: { accessToken: "must-not-leave-main-world" }
  }));
  const ancestor = {
    memoizedProps: {
      projects: catalog,
      sessionToken: "must-not-leave-main-world"
    },
    return: null
  };
  const middle = { memoizedProps: {}, return: ancestor };
  const leaf = { memoizedProps: {}, return: middle };
  const row = {
    getAttribute() { return ""; },
    querySelector() { return null; }
  };
  Object.defineProperty(row, "__reactFiber$real", {
    value: leaf,
    enumerable: false
  });
  const document = {
    querySelectorAll(selector) {
      assert.equal(selector, "[class~='group/project-unfurl-row']");
      return [row];
    }
  };
  const serializedExtractor = `(${background.extractRenderedProjectDirectoriesFromMainWorld.toString()})()`;
  const result = vm.runInNewContext(serializedExtractor, { document });

  assert.deepEqual(
    Array.from(result.entries, (entry) => ({
      gizmoId: entry.gizmoId,
      projectName: entry.projectName,
      projectOrder: entry.projectOrder
    })),
    projects.map(([gizmoId, projectName], projectOrder) => ({
      gizmoId,
      projectName,
      projectOrder
    }))
  );
  assert.deepEqual(Array.from(result.projectOrder), projects.map(([id]) => id));
  assert.doesNotMatch(JSON.stringify(result), /authorization|accessToken|sessionToken|must-not/i);
});

test("project directory message uses MAIN-world executeScript without storage, network, click, or refresh", async () => {
  const listeners = [];
  const executeCalls = [];
  let storageReads = 0;
  let storageWrites = 0;
  let networkCalls = 0;
  let logCalls = 0;
  const firstId = "g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const secondId = "g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const context = {
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      scripting: {
        executeScript(options, callback) {
          executeCalls.push(options);
          callback([{
            result: {
              entries: [
                { gizmoId: secondId, projectName: "第二个", projectOrder: 8, authorization: "secret" },
                { gizmoId: firstId, projectName: "第一个", projectOrder: 3 }
              ],
              projectOrder: [firstId, secondId]
            }
          }]);
        }
      },
      alarms: {
        create: () => {},
        onAlarm: { addListener: (listener) => listeners.push(["alarm", listener]) }
      },
      storage: {
        local: {
          get(_keys, callback) {
            storageReads += 1;
            callback({});
          },
          set(_value, callback) {
            storageWrites += 1;
            if (callback) callback();
          }
        }
      },
      action: {
        setBadgeBackgroundColor: () => {},
        setBadgeText: () => {},
        setTitle: () => {}
      }
    },
    fetch() {
      networkCalls += 1;
      throw new Error("must not fetch");
    },
    console: {
      log() { logCalls += 1; },
      info() { logCalls += 1; },
      warn() { logCalls += 1; },
      error() { logCalls += 1; }
    },
    URL,
    Date,
    Math,
    Number,
    Object,
    String,
    Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

  vm.createContext(context);
  vm.runInContext(script, context);
  const messageListener = listeners.find((entry) => entry[0] === "message")[1];
  const storageReadsBeforeMessage = storageReads;
  const response = await new Promise((resolve) => {
    const asyncResponse = messageListener(
      { type: "conversation.projectDirectories.get" },
      {
        url: "https://chatgpt.com/c/project-chat",
        tab: { id: 77, url: "https://chatgpt.com/c/project-chat" }
      },
      resolve
    );
    assert.equal(asyncResponse, true);
  });

  assert.equal(executeCalls.length, 1);
  assert.equal(executeCalls[0].target.tabId, 77);
  assert.deepEqual(Object.keys(executeCalls[0].target), ["tabId"]);
  assert.equal(executeCalls[0].world, "MAIN");
  assert.equal(typeof executeCalls[0].func, "function");
  assert.equal(Object.prototype.hasOwnProperty.call(executeCalls[0], "files"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(executeCalls[0].target, "allFrames"), false);
  assert.deepEqual(
    Array.from(response.entries, (entry) => ({
      gizmoId: entry.gizmoId,
      projectName: entry.projectName,
      projectOrder: entry.projectOrder
    })),
    [
      { gizmoId: firstId, projectName: "第一个", projectOrder: 0 },
      { gizmoId: secondId, projectName: "第二个", projectOrder: 1 }
    ]
  );
  assert.deepEqual(Array.from(response.projectOrder), [firstId, secondId]);
  assert.equal(storageReads, storageReadsBeforeMessage);
  assert.equal(storageWrites, 0);
  assert.equal(networkCalls, 0);
  assert.equal(logCalls, 0);

  const rejected = await new Promise((resolve) => {
    const asyncResponse = messageListener(
      { type: "conversation.projectDirectories.get" },
      {
        url: "https://example.com/",
        tab: { id: 88, url: "https://example.com/" }
      },
      resolve
    );
    assert.equal(asyncResponse, false);
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "untrusted-chatgpt-sender");
  assert.equal(executeCalls.length, 1, "untrusted pages never receive MAIN-world injection");
});

test("service worker script registers available chrome events without requiring optional events", () => {
  const listeners = [];
  const alarms = [];
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      alarms: {
        create: (name, options) => alarms.push({ name, options }),
        onAlarm: { addListener: (listener) => listeners.push(["alarm", listener]) }
      },
      storage: {
        local: {
          get: () => {},
          set: () => {}
        }
      },
      action: {
        setBadgeBackgroundColor: () => {},
        setBadgeText: () => {},
        setTitle: () => {}
      }
    },
    Date,
    Math,
    Number,
    Object,
    String,
    Array
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  assert.equal(listeners.length, 3);
  assert.equal(listeners[0][0], "message");
  assert.equal(listeners[1][0], "installed");
  assert.equal(listeners[2][0], "alarm");
  assert.equal(alarms.length, 1);
  assert.equal(alarms[0].name, background.STATUS_ALARM_NAME);
  assert.equal(alarms[0].options.periodInMinutes, background.STATUS_ALARM_PERIOD_MINUTES);
});

test("service worker wake after extension update preserves the last catalog-proven public mapping", async () => {
  const listeners = [];
  const catalogObservedAt = "2026-08-23T03:17:50.167Z";
  let storedStats = {
    version: 1,
    totals: { "GPT-5.6 Sol": 1 },
    byDate: { "2026-08-23": { "GPT-5.6 Sol": 1 } },
    models: {
      "GPT-5.6 Sol": {
        label: "GPT-5.6 Sol",
        publicModel: "GPT-5.6 Sol",
        chatgptModel: "GPT-5.6 Sol",
        selectedPublicModel: "GPT-5.6 Sol",
        selectedPublicModelSource: "selector-dom",
        requestModel: "gpt-5-6-thinking",
        responseModel: "gpt-5-6-thinking",
        responseObservedAt: "2026-08-23T03:18:10.000Z",
        responseObservedSource: "message-dom:model-slug",
        apiModel: "gpt-5-6-thinking",
        modelIdentitySource: "response-model",
        modelMappingStatus: "mapped",
        publicModelSource: "selector+account-catalog",
        catalogObservedAt,
        parameters: { model: "gpt-5-6-thinking" }
      }
    },
    sessionsByModel: {},
    variantsByModel: {},
    featuresByModel: {},
    parametersByModel: {},
    relationsByModel: {},
    events: [
      {
        model: "GPT-5.6 Sol",
        publicModel: "GPT-5.6 Sol",
        chatgptModel: "GPT-5.6 Sol",
        selectedPublicModel: "GPT-5.6 Sol",
        selectedPublicModelSource: "selector-dom",
        requestModel: "gpt-5-6-thinking",
        requestModelEvidence: "trusted",
        responseModel: "gpt-5-6-thinking",
        responseObservedAt: "2026-08-23T03:18:10.000Z",
        responseObservedSource: "message-dom:model-slug",
        apiModel: "gpt-5-6-thinking",
        modelIdentitySource: "response-model",
        modelMappingStatus: "mapped",
        publicModelSource: "selector+account-catalog",
        catalogObservedAt,
        modelObservedSource: "webRequest",
        modelParameters: { model: "gpt-5-6-thinking" },
        submittedAt: "2026-08-23T03:18:00.000Z",
        sourceMode: "chat",
        usageFeatures: []
      }
    ],
    lastUpdated: "2026-08-23T03:18:00.000Z"
  };
  const context = {
    ChatGPTModelCatalog: require("../src/model-catalog"),
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      alarms: {
        create: () => {},
        onAlarm: { addListener: (listener) => listeners.push(["alarm", listener]) }
      },
      storage: {
        local: {
          get: (_keys, callback) => setTimeout(
            () => callback({ [background.STORAGE_KEY]: storedStats }),
            0
          ),
          set: (value, callback) => {
            if (Object.prototype.hasOwnProperty.call(value, background.STORAGE_KEY)) {
              storedStats = value[background.STORAGE_KEY];
            }
            setTimeout(() => callback && callback(), 0);
          }
        },
        session: {
          // Extension reload/update clears session storage before this worker
          // wake, so the live catalog is intentionally absent.
          get: (_keys, callback) => setTimeout(() => callback({}), 0),
          set: (_value, callback) => setTimeout(() => callback && callback(), 0)
        }
      },
      action: {
        setBadgeBackgroundColor: () => {},
        setBadgeText: () => {},
        setTitle: () => {}
      }
    },
    Date,
    Math,
    Number,
    Object,
    String,
    Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  const messageListener = listeners.find((entry) => entry[0] === "message")[1];
  const response = await new Promise((resolve) => {
    assert.equal(messageListener({ type: "usage.get" }, {}, resolve), true);
  });

  assert.equal(response.ok, true);
  assert.equal(Object.keys(response.stats.totals).length, 1);
  assert.equal(response.stats.totals["GPT-5.6 Sol"], 1);
  assert.equal(response.stats.totals["gpt-5-6-thinking"], undefined);
  assert.equal(response.stats.events[0].model, "GPT-5.6 Sol");
  assert.equal(response.stats.events[0].publicModel, "GPT-5.6 Sol");
  assert.equal(response.stats.events[0].responseModel, "gpt-5-6-thinking");
});

test("runtime reinjection loads the same complete content-script stack as the manifest", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  assert.deepEqual(background.ISOLATED_CONTENT_SCRIPT_FILES, manifest.content_scripts[0].js);
  assert.ok(background.ISOLATED_CONTENT_SCRIPT_FILES.includes("src/conversation-source.js"));
});

test("status alarm stores latest OpenAI status and updates toolbar abnormal state", async () => {
  const listeners = [];
  const stored = {};
  const badgeTexts = [];
  const badgeColors = [];
  let title = "";
  let resolved;
  const updated = new Promise((resolve) => {
    resolved = resolve;
  });
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      alarms: {
        create: () => {},
        onAlarm: { addListener: (listener) => listeners.push(["alarm", listener]) }
      },
      storage: {
        local: {
          get: (keys, callback) => {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(stored, key)) {
                result[key] = stored[key];
              }
            });
            setTimeout(() => callback(result), 0);
          },
          set: (value, callback) => {
            Object.assign(stored, value);
            setTimeout(() => callback && callback(), 0);
          }
        }
      },
      action: {
        setBadgeBackgroundColor: ({ color }) => badgeColors.push(color),
        setBadgeText: ({ text }) => badgeTexts.push(text),
        setTitle: ({ title: nextTitle }) => {
          title = nextTitle;
          resolved();
        }
      }
    },
    fetch: () => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        components: [
          { id: "chatgpt", name: "ChatGPT", status: "major_outage", position: 1 },
          { id: "conversations", name: "Conversations", status: "operational", position: 2 }
        ]
      })
    }),
    Date,
    Math,
    Number,
    Object,
    String,
    Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  const alarmListener = listeners.find((entry) => entry[0] === "alarm")[1];
  alarmListener({ name: background.STATUS_ALARM_NAME });
  await updated;

  assert.equal(stored[background.STATUS_KEY].state, "major");
  assert.equal(badgeTexts.at(-1), "!");
  assert.equal(badgeColors.at(-1), "#dc2626");
  assert.match(title, /OpenAI status: Major outage/);
});

test("usage.increment message path dedupes root submissions across webRequest and fetch-request", async () => {
  const listeners = [];
  let storedStats = null;
  const badgeTexts = [];
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(["message", listener]) },
        onInstalled: { addListener: (listener) => listeners.push(["installed", listener]) }
      },
      storage: {
        local: {
          get: (keys, callback) => {
            setTimeout(() => callback({ [background.STORAGE_KEY]: storedStats }), 0);
          },
          set: (value, callback) => {
            setTimeout(() => {
              if (Object.prototype.hasOwnProperty.call(value, background.STORAGE_KEY)) {
                storedStats = value[background.STORAGE_KEY];
              }
              callback();
            }, 0);
          }
        }
      },
      action: {
        setBadgeBackgroundColor: () => {},
        setBadgeText: ({ text }) => badgeTexts.push(text)
      }
    },
    Date,
    Math,
    Number,
    Object,
    String,
    Array,
    Promise,
    setTimeout,
    clearTimeout
  };
  const script = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");
  const model = "gpt-5-thinking";
  const promptHash = "86bc567";
  const sender = { tab: { id: 31 } };
  const firstPayload = {
    submissionId: "usage-message-path-root-duplicate",
    model,
    apiModel: model,
    chatgptModel: model,
    modelMode: "thinking",
    modelParameters: { model },
    usageFeatures: ["web_search"],
    modelObservedSource: "webRequest",
    source: "send-button",
    pageUrl: "https://chatgpt.com/",
    pageTitle: "ChatGPT",
    submittedAt: "2026-06-01T17:35:28.581Z",
    promptHash,
    promptLength: 139
  };
  const secondPayload = Object.assign({}, firstPayload, {
    modelObservedSource: "fetch-request",
    submittedAt: "2026-06-01T17:35:28.583Z"
  });

  vm.createContext(context);
  assert.doesNotThrow(() => vm.runInContext(script, context));
  const messageListener = listeners.find((entry) => entry[0] === "message")[1];

  const firstResponsePromise = new Promise((resolve) => {
    assert.equal(messageListener({ type: "usage.increment", payload: firstPayload }, sender, resolve), true);
  });
  const secondResponsePromise = new Promise((resolve) => {
    assert.equal(messageListener({ type: "usage.increment", payload: secondPayload }, sender, resolve), true);
  });
  const responses = await Promise.all([firstResponsePromise, secondResponsePromise]);

  assert.equal(responses[0].ok, true);
  assert.equal(responses[0].recorded, true);
  assert.equal(responses[0].duplicate, false);
  assert.equal(responses[1].ok, true);
  assert.equal(responses[1].recorded, false);
  assert.equal(responses[1].duplicate, true);
  assert.equal(background.totalCount(storedStats), 1);
  assert.equal(storedStats.totals[model], 1);
  assert.equal(storedStats.events.length, 1);
  assert.equal(storedStats.events[0].conversationId, "");
  assert.equal(storedStats.events[0].pageUrl, "https://chatgpt.com/");
  assert.equal(storedStats.events[0].promptHash, undefined);
  assert.equal(storedStats.events[0].promptLength, undefined);
  assert.equal(storedStats.events[0].source, "send-button");
  assert.equal(storedStats.events[0].modelObservedSource, "webRequest");
  assert.deepEqual(storedStats.events[0].usageFeatures, ["web_search"]);
  assert.equal(storedStats.featuresByModel[model].features.web_search.name, "Web search");
  assert.equal(storedStats.featuresByModel[model].features.web_search.count, 1);
  assert.equal(storedStats.totals.web_search, undefined);
  assert.equal(badgeTexts[badgeTexts.length - 1], "1");
});

test("mergeRecentNetworkObservation lets the current request model replace stale DOM metadata", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");
  // 网络请求体只给裸基座 gpt-5-5(GPT-5.5 的 /f/conversation 实测如此)
  background.observeNetworkRequest({
    tabId: 71,
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: { raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5-5" }), "utf8") }] }
  }, now);
  // content 据助手消息 data-message-model-slug 给出真实模型 gpt-5-5-thinking
  const merged = background.mergeRecentNetworkObservation(
    { model: "gpt-5-5-thinking", apiModel: "gpt-5-5-thinking", chatgptModel: "gpt-5-5-thinking", modelObservedSource: "message-dom:model-slug", modelParameters: { model: "gpt-5-5-thinking" } },
    { tab: { id: 71 } },
    now
  );
  assert.equal(merged.model, "gpt-5-5");

  // The submitted request is stored exactly, even when the previous assistant
  // message still carries a more specific stale DOM slug.
  const next = background.applyIncrement(background.createEmptyStats(), Object.assign({
    modelObservedSource: "message-dom:model-slug", source: "send-button", submittedAt: now.toISOString(), promptHash: "p1", promptLength: 5
  }, merged), now);
  assert.equal(next.totals["gpt-5-5"], 1);
  assert.equal(next.totals["gpt-5-5-thinking"], undefined);
});

test("mergeRecentNetworkObservation still lets a specific network model override a DOM base", () => {
  const now = new Date("2026-06-26T12:00:00.000Z");
  background.observeNetworkRequest({
    tabId: 72,
    url: "https://chatgpt.com/backend-api/f/conversation",
    requestBody: { raw: [{ bytes: Buffer.from(JSON.stringify({ model: "gpt-5-5-instant" }), "utf8") }] }
  }, now);
  const merged = background.mergeRecentNetworkObservation(
    { model: "gpt-5-5", modelObservedSource: "message-dom:dom", modelParameters: { model: "gpt-5-5" } },
    { tab: { id: 72 } },
    now
  );
  assert.equal(merged.model, "gpt-5-5-instant", "specific network model wins over bare DOM base");
});
