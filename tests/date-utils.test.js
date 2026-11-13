const assert = require("node:assert/strict");
const test = require("node:test");
const dates = require("../src/date-utils");

test("calendar-only arithmetic is independent of zone and daylight saving", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["Asia/Tokyo", "America/Los_Angeles", "Europe/Berlin"]) {
      process.env.TZ = zone;
      assert.equal(dates.addCalendarDays("2026-03-08", 1), "2026-03-09");
      assert.equal(dates.addCalendarDays("2026-03-29", -1), "2026-03-28");
      assert.equal(dates.addCalendarDays("2026-11-01", -30), "2026-10-02");
      assert.equal(dates.addCalendarDays("2026-02-30", 1), "");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});

test("recorded event days survive a zone change; unknown legacy dates remain unknown", () => {
  const event = { submittedAt: "2026-11-10T15:01:00.000Z", recordedDateKey: "2026-11-11", dateKeyBasis: "local", dateTimeZone: "Asia/Tokyo" };
  const previous = process.env.TZ;
  try {
    for (const zone of ["Asia/Tokyo", "America/Los_Angeles", "Europe/Berlin"]) {
      process.env.TZ = zone;
      assert.equal(dates.eventDateKey(event), "2026-11-11");
      assert.equal(dates.eventDateKey({ submittedAt: event.submittedAt }), "");
      assert.equal(dates.eventDateKey({ submittedAt: event.submittedAt, dateKeyBasis: "utc" }), "2026-11-10");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
});
