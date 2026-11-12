(function initUsageDates(root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChatGPTUsageDates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function usageDatesFactory() {
  "use strict";

  function localDateKey(value) {
    var d = value || new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function utcDateKey(value) {
    var d = value || new Date();
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }

  function isDateKey(value) {
    var key = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    var d = new Date(key + "T00:00:00.000Z");
    return !Number.isNaN(d.getTime()) && utcDateKey(d) === key;
  }

  function eventDateKey(event) {
    var key = String(event && event.recordedDateKey || "");
    if (isDateKey(key)) return key;
    if (!event || event.dateKeyBasis !== "utc") return "";
    var d = new Date(String(event.submittedAt || ""));
    return Number.isNaN(d.getTime()) ? "" : utcDateKey(d);
  }

  function addCalendarDays(key, days) {
    if (!isDateKey(key) || !Number.isInteger(days)) return "";
    var d = new Date(key + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + days);
    return utcDateKey(d);
  }

  return { localDateKey: localDateKey, utcDateKey: utcDateKey, isDateKey: isDateKey, eventDateKey: eventDateKey, addCalendarDays: addCalendarDays };
});
