// Stremio Sentinel - background service worker

function findVersionInJson(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.version === "string") return obj.version;
  // try some common places
  if (obj.manifest && typeof obj.manifest.version === "string")
    return obj.manifest.version;
  // deep search fallback
  try {
    const stack = [obj];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== "object") continue;
      if (seen.has(cur)) continue;
      seen.add(cur);
      if (typeof cur.version === "string") return cur.version;
      for (const k of Object.keys(cur)) {
        const v = cur[k];
        if (v && typeof v === "object") stack.push(v);
      }
    }
  } catch (_) {}
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "fetchManifest" && typeof msg.url === "string") {
    (async () => {
      try {
        const res = await fetch(msg.url, { method: "GET" });
        const contentType = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let json;
        if (contentType.includes("application/json")) {
          json = await res.json();
        } else {
          // Some manifests may be served as text; try to parse.
          const text = await res.text();
          json = JSON.parse(text);
        }
        const version = findVersionInJson(json);
        sendResponse({ ok: true, version, json });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true; // keep the message channel open for async response
  }
});

// When user clicks the extension icon, try to trigger the panel & scan
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab || !tab.id) return;
    // only act on Stremio Web
    if (typeof tab.url === "string" && !tab.url.includes("web.stremio.com")) {
      // Optionally, open the addons page
      await chrome.tabs.create({ url: "https://web.stremio.com/#/addons" });
      return;
    }
    // Ask content script to open panel and run scan
    await chrome.tabs.sendMessage(tab.id, { type: "openPanelAndScan" });
  } catch (e) {
    // In MV3, service worker may be asleep; attempt to inject content.js if messaging fails
    try {
      if (tab && tab.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        await chrome.tabs.sendMessage(tab.id, { type: "openPanelAndScan" });
      }
    } catch (_) {}
  }
});
