(function initPopupDashboard() {
  "use strict";

  var root = document.getElementById("dashboard-root");
  if (!root || !window.ChatGPTUsageDashboard) {
    return;
  }

  window.ChatGPTUsageDashboard.init(root, { surface: "popup" });
})();
