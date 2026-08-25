const {
  Cdp,
  EXTENSION_ID,
  findTarget,
  sleep,
  targets
} = require("./manual-bitbrowser-cdp-check");

async function popupTarget() {
  const existing = (await targets()).find((target) =>
    target.type === "page" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/popup.html`
  );
  if (existing) return existing;
  const worker = await findTarget((target) =>
    target.type === "service_worker" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/background.js`
  );
  const cdp = await new Cdp(worker.webSocketDebuggerUrl).connect();
  try {
    await cdp.evaluate(`chrome.tabs.create({
      url: chrome.runtime.getURL("src/popup.html"),
      active: false
    }).then(() => true)`);
  } finally {
    cdp.close();
  }
  return findTarget((target) =>
    target.type === "page" &&
    target.url === `chrome-extension://${EXTENSION_ID}/src/popup.html`
  );
}

async function chatTarget() {
  return findTarget((target) =>
    target.type === "page" &&
    /^https:\/\/(?:chatgpt\.com|chat\.openai\.com)\//.test(target.url)
  );
}

async function inspectTheme(cdp) {
  return cdp.evaluate(`(function () {
    const dashboard = document.querySelector(".usage-dashboard");
    const style = dashboard && getComputedStyle(dashboard);
    return {
      className: dashboard ? dashboard.className : "",
      background: style ? style.getPropertyValue("--usage-surface-panel").trim() : "",
      color: style ? style.getPropertyValue("--usage-text-primary").trim() : ""
    };
  })()`);
}

async function main() {
  const popup = await new Cdp((await popupTarget()).webSocketDebuggerUrl).connect();
  const chat = await new Cdp((await chatTarget()).webSocketDebuggerUrl).connect();
  let originalSettings = null;
  try {
    originalSettings = await popup.evaluate(`(async function () {
      const key = "chatgptModelUsageSettings.v1";
      const stored = await chrome.storage.local.get(key);
      return stored[key] || null;
    })()`);

    await popup.evaluate(`(async function () {
      const key = "chatgptModelUsageSettings.v1";
      const stored = await chrome.storage.local.get(key);
      await chrome.storage.local.set({
        [key]: Object.assign({}, stored[key] || {}, { activeView: "chart" })
      });
      return true;
    })()`);
    await popup.send("Page.reload", { ignoreCache: true });
    await sleep(700);

    const preview = await popup.evaluate(`(async function () {
      const tabs = document.querySelector(".usage-view-tabs");
      const status = document.querySelector('[data-view-tab="status"]');
      status.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      const during = document.querySelector('[data-view-tab][aria-selected="true"]')?.getAttribute("data-view-tab") || "";
      tabs.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, relatedTarget: document.body }));
      await new Promise((resolve) => setTimeout(resolve, 80));
      const after = document.querySelector('[data-view-tab][aria-selected="true"]')?.getAttribute("data-view-tab") || "";
      const stored = await chrome.storage.local.get("chatgptModelUsageSettings.v1");
      return {
        during,
        after,
        committed: stored["chatgptModelUsageSettings.v1"]?.activeView || ""
      };
    })()`);
    if (preview.during !== "status" || preview.after !== "chart" || preview.committed !== "chart") {
      throw new Error(`Hover preview did not restore the committed view: ${JSON.stringify(preview)}`);
    }

    await popup.evaluate(`document.querySelector('[data-view-tab="status"]')?.click(); true`);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const committed = await popup.evaluate(`chrome.storage.local.get("chatgptModelUsageSettings.v1")
        .then((stored) => stored["chatgptModelUsageSettings.v1"]?.activeView || "")`);
      if (committed === "status") break;
      await sleep(100);
    }
    await chat.evaluate(`(function () {
      const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
      const panel = document.getElementById("chatgpt-model-usage-counter-panel");
      if (panel && !panel.hidden) toggle.click();
      if (panel && !panel.hidden) toggle.click();
      if (panel && panel.hidden) toggle.click();
      return true;
    })()`);
    await sleep(800);
    const pageRestoredView = await chat.evaluate(
      `document.querySelector('#chatgpt-model-usage-counter-panel [data-view-tab][aria-selected="true"]')?.getAttribute("data-view-tab") || ""`
    );
    if (pageRestoredView !== "status") {
      throw new Error(`The page entry did not restore the popup's committed view: ${pageRestoredView}`);
    }

    await chat.evaluate(
      `document.querySelector('#chatgpt-model-usage-counter-panel [data-view-tab="chart"]')?.click(); true`
    );
    await sleep(350);
    const popupSyncedView = await popup.evaluate(
      `document.querySelector('[data-view-tab][aria-selected="true"]')?.getAttribute("data-view-tab") || ""`
    );
    if (popupSyncedView !== "chart") {
      throw new Error(`The popup did not synchronize the page entry's committed view: ${popupSyncedView}`);
    }

    const settingsHover = await popup.evaluate(`(async function () {
      const root = document.querySelector(".usage-dashboard");
      const menu = document.querySelector(".usage-settings-menu");
      menu.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const category = document.querySelector('[data-settings-category="theme"]');
      category.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      const popover = document.querySelector(".usage-settings-popover");
      const submenu = category.querySelector(".usage-settings-submenu");
      const rootRect = root.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const submenuRect = submenu.getBoundingClientRect();
      return {
        menuOpen: menu.open,
        categoryOpen: category.open,
        rootRect: { left: rootRect.left, right: rootRect.right, top: rootRect.top, bottom: rootRect.bottom },
        popoverRect: { left: popoverRect.left, right: popoverRect.right, top: popoverRect.top, bottom: popoverRect.bottom },
        submenuRect: { left: submenuRect.left, right: submenuRect.right, top: submenuRect.top, bottom: submenuRect.bottom },
        categories: Array.from(document.querySelectorAll("[data-settings-category]")).map((item) =>
          item.getAttribute("data-settings-category")
        )
      };
    })()`);
    if (!settingsHover.menuOpen || !settingsHover.categoryOpen) {
      throw new Error(`The hover settings tree is not continuously usable: ${JSON.stringify(settingsHover)}`);
    }
    if (
      settingsHover.submenuRect.left < settingsHover.rootRect.left - 1 ||
      settingsHover.submenuRect.right > settingsHover.rootRect.right + 1 ||
      settingsHover.submenuRect.right < settingsHover.popoverRect.left - 2
    ) {
      throw new Error(`The settings submenu leaves or disconnects from the panel: ${JSON.stringify(settingsHover)}`);
    }
    const expectedCategories = ["language", "theme", "source", "statistics", "sections", "data"];
    if (JSON.stringify(settingsHover.categories) !== JSON.stringify(expectedCategories)) {
      throw new Error(`Settings categories are incomplete or out of order: ${JSON.stringify(settingsHover.categories)}`);
    }

    await popup.evaluate(`document.querySelector('[data-theme-select="dark"]')?.click(); true`);
    await sleep(250);
    const popupDark = await inspectTheme(popup);
    const pageDark = await chat.evaluate(`(function () {
      const panel = document.getElementById("chatgpt-model-usage-counter-panel");
      const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
      return {
        panelTheme: panel?.getAttribute("data-chatgpt-model-usage-theme") || "",
        hostTheme: host?.getAttribute("data-chatgpt-model-usage-theme") || ""
      };
    })()`);
    if (popupDark.background !== "#2a2b32" || pageDark.panelTheme !== "dark" || pageDark.hostTheme !== "dark") {
      throw new Error(`Manual dark theme is not shared by both entries: ${JSON.stringify({ popupDark, pageDark })}`);
    }
    const hoverMenuAfterTheme = await popup.evaluate(`(function () {
      const menu = document.querySelector(".usage-settings-menu");
      return {
        open: menu?.open || false,
        category: document.querySelector('[data-settings-category="theme"]')?.open || false
      };
    })()`);
    if (!hoverMenuAfterTheme.open || !hoverMenuAfterTheme.category) {
      throw new Error(`Choosing a hover-menu option closed the menu prematurely: ${JSON.stringify(hoverMenuAfterTheme)}`);
    }

    await popup.evaluate(`document.querySelector('[data-theme-select="light"]')?.click(); true`);
    await sleep(250);
    const popupLight = await inspectTheme(popup);
    if (popupLight.background !== "#fbfcfa" || popupDark.background === popupLight.background) {
      throw new Error(`Light and dark themes are not visually distinct: ${JSON.stringify({ popupDark, popupLight })}`);
    }

    const modelMenu = await popup.evaluate(`(async function () {
      const item = document.querySelector(".usage-view-tab-item-chart");
      item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      await new Promise((resolve) => setTimeout(resolve, 60));
      const menu = item.querySelector(".usage-view-model-menu");
      const itemRect = item.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const option = menu.querySelector("[data-model-toggle]");
      const before = option ? option.getAttribute("aria-pressed") : "";
      if (option) option.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const liveItem = document.querySelector(".usage-view-tab-item-chart");
      const liveMenu = liveItem && liveItem.querySelector(".usage-view-model-menu");
      return {
        openBefore: item.getAttribute("data-model-menu-open") === "true",
        widthDelta: Math.abs(itemRect.width - menuRect.width),
        optionPresent: Boolean(option),
        changed: option
          ? document.querySelector('[data-model-toggle="' + option.getAttribute("data-model-toggle") + '"]')?.getAttribute("aria-pressed") !== before
          : true,
        openAfter: liveItem?.getAttribute("data-model-menu-open") === "true",
        menuInteractiveAfter: Boolean(liveMenu && getComputedStyle(liveMenu).pointerEvents !== "none")
      };
    })()`);
    if (
      !modelMenu.openBefore ||
      modelMenu.widthDelta > 2.5 ||
      !modelMenu.optionPresent ||
      !modelMenu.changed ||
      !modelMenu.openAfter ||
      !modelMenu.menuInteractiveAfter
    ) {
      throw new Error(`The Usage model submenu is not a stable same-width interactive menu: ${JSON.stringify(modelMenu)}`);
    }

    const sectionOrder = await popup.evaluate(`(async function () {
      const menu = document.querySelector(".usage-settings-menu");
      menu.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      const category = document.querySelector('[data-settings-category="sections"]');
      category.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      for (const section of ["line", "donut", "text"]) {
        const button = document.querySelector('[data-statistics-section="' + section + '"]');
        if (button?.getAttribute("aria-pressed") === "true") button.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      for (const section of ["donut", "text", "line"]) {
        document.querySelector('[data-statistics-section="' + section + '"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 70));
      }
      const panel = document.querySelector(".usage-chart-panel");
      const order = Array.from(panel?.querySelectorAll(
        ":scope > .usage-line-chart-wrap,:scope > .usage-donut-wrap,:scope > .usage-count-list"
      ) || []).map((node) => {
        if (node.matches(".usage-donut-wrap")) return "donut";
        if (node.matches(".usage-chart-wrap")) return "line";
        if (node.matches(".usage-count-list")) return "text";
        return "";
      }).filter(Boolean);
      const stored = await chrome.storage.local.get("chatgptModelUsageSettings.v1");
      return {
        order,
        stored: stored["chatgptModelUsageSettings.v1"]?.statisticsSectionOrder || []
      };
    })()`);
    if (
      JSON.stringify(sectionOrder.order) !== JSON.stringify(["donut", "text", "line"]) ||
      JSON.stringify(sectionOrder.stored) !== JSON.stringify(["donut", "text", "line"])
    ) {
      throw new Error(`Enabled content did not follow activation order: ${JSON.stringify(sectionOrder)}`);
    }

    const accountReadsBefore = await chat.evaluate(`performance.getEntriesByType("resource").filter((entry) =>
      /\\/api\\/auth\\/session|\\/backend-api\\/models/.test(entry.name)
    ).length`);
    await chat.evaluate(`(function () {
      const toggle = document.getElementById("chatgpt-model-usage-counter-panel-toggle");
      const panel = document.getElementById("chatgpt-model-usage-counter-panel");
      if (panel && !panel.hidden) toggle.click();
      const host = document.getElementById("chatgpt-model-usage-counter-panel-host");
      host.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
      return true;
    })()`);
    await sleep(1200);
    const hoverAccountResult = await chat.evaluate(`(function () {
      const panel = document.getElementById("chatgpt-model-usage-counter-panel");
      const reads = performance.getEntriesByType("resource").filter((entry) =>
        /\\/api\\/auth\\/session|\\/backend-api\\/models/.test(entry.name)
      ).length;
      document.getElementById("chatgpt-model-usage-counter-panel-host")
        ?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false, relatedTarget: document.body }));
      return { reads, panelOpen: panel ? !panel.hidden : false };
    })()`);
    if (!hoverAccountResult.panelOpen || hoverAccountResult.reads !== accountReadsBefore) {
      throw new Error(`Hover preview caused an account read: ${JSON.stringify({ accountReadsBefore, hoverAccountResult })}`);
    }

    console.log(JSON.stringify({
      preview,
      pageRestoredView,
      popupSyncedView,
      settingsHover,
      popupDark,
      pageDark,
      popupLight,
      hoverMenuAfterTheme,
      modelMenu,
      sectionOrder,
      hoverAccountResult
    }, null, 2));
  } finally {
    if (originalSettings) {
      await popup.evaluate(`chrome.storage.local.set({
        "chatgptModelUsageSettings.v1": ${JSON.stringify(originalSettings)}
      }).then(() => true)`).catch(() => null);
    }
    popup.close();
    chat.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
