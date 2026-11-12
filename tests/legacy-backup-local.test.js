const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const background = require("../src/background");

// The optional input is a local private backup and must never be checked in.
test("private 1.2.15 backup preserves its incomplete daily history", { skip: !process.env.LEGACY_USAGE_BACKUP_PATH }, () => {
  const raw = JSON.parse(fs.readFileSync(process.env.LEGACY_USAGE_BACKUP_PATH, "utf8"));
  const stats = raw[background.STORAGE_KEY];
  assert.ok(stats);
  assert.equal(background.totalCount(stats), 788);
  assert.equal(Object.keys(stats.byDate).length, 8);
  assert.equal(stats.events.length, 500);
  const first = background.cloneStats(stats);
  const backup = background.createStatisticsBackup(first);
  const restored = background.sanitizeStatisticsBackup(backup).statistics;
  assert.equal(background.totalCount(restored), 788);
  assert.deepEqual(restored.byDate, stats.byDate);
  assert.equal(restored.events.length, 500);
  assert.equal(restored.analyticsHistoryComplete, false);
  assert.deepEqual(background.cloneStats(restored).byDate, restored.byDate);
});
