const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = require("../src/conversation-source.js");

test("conversation source contains only the bounded model-catalog JSON helper", async () => {
  const payload = await source.requestJson(async (url, options) => {
    assert.equal(url, "/backend-api/models?history_and_training_disabled=false");
    assert.equal(options.method, "GET");
    return { ok: true, status: 200, json: async () => ({ models: [] }) };
  }, "/backend-api/models?history_and_training_disabled=false", { maxAttempts: 1 });
  assert.deepEqual(payload, { models: [] });
  assert.equal(typeof source.listAccountConversations, "undefined");
  assert.equal(typeof source.collectConversations, "undefined");
  assert.equal(typeof source.fetchConversationById, "undefined");
});

test("conversation source release code contains no account-history endpoint", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "src", "conversation-source.js"), "utf8");
  assert.doesNotMatch(code, /backend-api\/conversations|backend-api\/conversation\//);
  assert.doesNotMatch(code, /api\/auth\/session|accessToken|chatgpt-account-id/i);
});

test("model-catalog helper stops after a final 429 without an early retry", async () => {
  let calls = 0;
  await assert.rejects(
    source.requestJson(async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        headers: { get: () => "120" },
        json: async () => ({})
      };
    }, "/backend-api/models", { maxAttempts: 1 }),
    (error) => error && error.stopOperation === true && error.retryAfterMs === 120000
  );
  assert.equal(calls, 1);
});
