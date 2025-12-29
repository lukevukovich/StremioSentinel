(function () {
  const SELECTORS = {
    listContainer: '[class*="addons-list-container"]',
    listItemName: '[class*="name-container"]',
    listItemVersion: '[class*="version-container"]',
    detailsManifestUrl: '[class*="transport-url-label"]',
    detailsVersion: '.name-container-XxPAj [class*="version-"]',
    cancelButton: '[class*="cancel-button"]',
    modalsContainer: ".modals-container",
    closeButton: '[class*="close-button-container"]',
    detailsContainer: '[class*="addon-details-container"]',
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitForSelector(
    selector,
    { timeout = 8000, root = document } = {}
  ) {
    const start = performance.now();
    let el = root.querySelector(selector);
    if (el) return el;
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        el = root.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(root, { childList: true, subtree: true });
      const check = async () => {
        while (!el && performance.now() - start < timeout) {
          el = root.querySelector(selector);
          if (el) {
            observer.disconnect();
            resolve(el);
            return;
          }
          await sleep(100);
        }
        observer.disconnect();
        resolve(null);
      };
      check();
    });
  }

  function getModalsContainer() {
    return document.querySelector(SELECTORS.modalsContainer);
  }

  function getModalCount() {
    const cont = getModalsContainer();
    if (!cont) return 0;

    const els = cont.querySelectorAll(".modal-container");
    if (els && els.length) return els.length;
    return cont.children.length || 0;
  }

  function getLatestModalRoot() {
    const cont = getModalsContainer();
    if (!cont) return null;
    const els = cont.querySelectorAll(".modal-container");
    if (els && els.length) return els[els.length - 1];
    return cont.lastElementChild;
  }

  function findModalRootFrom(node) {
    if (!node) return null;
    let cur = node;
    while (cur && cur !== document.body) {
      if (
        cur.classList &&
        Array.from(cur.classList).some((c) => c.toLowerCase().includes("modal"))
      ) {
        return cur;
      }
      if (
        cur.parentElement &&
        cur.parentElement.matches(SELECTORS.modalsContainer)
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function normalizeVersion(v) {
    if (!v) return null;
    return String(v).trim().replace(/^v\.?/i, "");
  }

  function compareSemver(a, b) {
    const pa = normalizeVersion(a)?.split(".") || [];
    const pb = normalizeVersion(b)?.split(".") || [];
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const na = parseInt(pa[i] || "0", 10);
      const nb = parseInt(pb[i] || "0", 10);
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  async function fetchManifestVersion(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "fetchManifest", url }, (resp) => {
        if (!resp || !resp.ok) {
          resolve({
            ok: false,
            error: resp?.error || "Failed to fetch manifest",
          });
        } else {
          resolve({ ok: true, version: resp.version, json: resp.json });
        }
      });
    });
  }

  const highlightedNodes = new Set();

  let scanAbort = { cancelled: false };
  let isScanning = false;

  function styleButton(btn, { primary = false } = {}) {
    btn.style.background = primary ? "#6a5acd" : "transparent";
    btn.style.color = primary ? "#fff" : "#c6c6d4";
    btn.style.border = primary ? "none" : "1px solid #4a4379";
    btn.style.borderRadius = "6px";
    btn.style.padding = "8px";
    btn.style.cursor = "pointer";
    btn.style.fontWeight = "600";
    btn.style.minHeight = "32px";
    btn.style.whiteSpace = "nowrap";
    btn.style.lineHeight = "1.2";
  }

  function setScanningUIState(active) {
    const scanBtn = document.getElementById("stremio-sentinel-scan-btn");
    const clearBtn = document.getElementById("stremio-sentinel-clear-btn");
    const cancelBtn = document.getElementById("stremio-sentinel-cancel-btn");
    // Disable starting new scans while active; allow cancel
    if (scanBtn) {
      scanBtn.disabled = !!active;
      scanBtn.style.opacity = active ? "0.6" : "1";
      scanBtn.style.cursor = active ? "not-allowed" : "pointer";
      // Reset any hover/press transform when disabling/enabling
      scanBtn.style.transform = "scale(1)";
    }
    if (clearBtn) {
      clearBtn.disabled = !!active;
      clearBtn.style.opacity = active ? "0.6" : "1";
      clearBtn.style.cursor = active ? "not-allowed" : "pointer";
      clearBtn.style.transform = "scale(1)";
    }
    if (cancelBtn) {
      cancelBtn.disabled = !active;
      cancelBtn.style.opacity = !active ? "0.6" : "1";
      cancelBtn.style.cursor = !active ? "not-allowed" : "pointer";
      cancelBtn.style.transform = "scale(1)";
    }
  }

  function setMinimizeUIState(isHidden) {
    const btn = document.getElementById("stremio-sentinel-minimize-btn");
    const headerEl = document.getElementById("stremio-sentinel-header");
    if (!btn) return;
    if (isHidden) {
      // Hidden (panel minimized): match panel outline color for clear cue
      btn.style.background = "#4a4379";
      btn.style.color = "#fff";
      btn.style.border = "1px solid #4a4379";
      if (headerEl) {
        headerEl.style.borderBottom = "none";
        headerEl.style.paddingBottom = "0px";
      }
    } else {
      // Expanded: transparent background for subtle, clean look
      btn.style.background = "transparent";
      btn.style.color = "#c6c6d4";
      btn.style.border = "1px solid #4a4379";
      if (headerEl) {
        headerEl.style.borderBottom = "2px solid rgba(255,255,255,0.12)";
        headerEl.style.paddingBottom = "10px";
      }
    }
  }

  function attachButtonInteractions(btn) {
    if (!btn || btn.dataset.interactions === "1") return;
    btn.style.transition = "transform 120ms ease";
    btn.style.willChange = "transform";
    btn.style.transformOrigin = "center center";
    btn.style.position = "relative";
    btn.style.zIndex = "2";
    btn.addEventListener("mouseenter", () => {
      if (btn.disabled) return;
      btn.style.transform = "scale(1.04)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "scale(1)";
    });
    btn.addEventListener("mousedown", () => {
      if (btn.disabled) return;
      btn.style.transform = "scale(0.97)";
    });
    btn.addEventListener("mouseup", () => {
      if (btn.disabled) return;
      btn.style.transform = "scale(1.04)";
    });
    btn.dataset.interactions = "1";
  }

  function updatePanelWidth() {
    try {
      const panel = document.getElementById("stremio-sentinel-panel");
      if (!panel) return;
      const w = window.innerWidth || document.documentElement.clientWidth || 0;
      if (w <= 1600) {
        panel.style.maxWidth = "461px";
      } else {
        panel.style.maxWidth = "473px";
      }
    } catch (_) {}
  }

  // Append results without transitions to avoid issues when minimized
  function appendRowSmooth(listNode, rowNode) {
    if (!listNode || !rowNode) return;
    listNode.appendChild(rowNode);
    // Ensure list is visible once we have content
    listNode.style.display = "block";
    // Clear any leftover animation styles from previous versions
    try {
      listNode.style.height = "";
      listNode.style.transition = "";
      listNode.style.overflow = "";
      listNode.style.willChange = "";
      if (listNode.dataset) listNode.dataset.animating = "0";
    } catch (_) {}
    const emptyMsg = document.getElementById("stremio-sentinel-empty");
    if (emptyMsg) emptyMsg.style.display = "none";
  }

  function ensureUI() {
    let panel = document.getElementById("stremio-sentinel-panel");
    if (panel) {
      // Ensure controls reflect current scanning/minimize state on re-use
      setScanningUIState(isScanning);
      const existingBody = panel.children && panel.children[1];
      setMinimizeUIState(existingBody && existingBody.style.display === "none");
      attachButtonInteractions(
        document.getElementById("stremio-sentinel-scan-btn")
      );
      attachButtonInteractions(
        document.getElementById("stremio-sentinel-clear-btn")
      );
      attachButtonInteractions(
        document.getElementById("stremio-sentinel-cancel-btn")
      );
      attachButtonInteractions(
        document.getElementById("stremio-sentinel-minimize-btn")
      );
      return panel;
    }
    panel = document.createElement("div");
    panel.id = "stremio-sentinel-panel";
    panel.style.position = "fixed";
    panel.style.right = "18px";
    panel.style.bottom = "10px";
    panel.style.zIndex = "2147483647";
    panel.style.background = "#2a2843";
    panel.style.color = "#fff";
    updatePanelWidth();
    panel.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, Arial";
    panel.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
    panel.style.borderRadius = "8px";
    panel.style.padding = "12px";
    panel.style.paddingTop = "0px";
    panel.style.paddingRight = "10px";
    panel.style.width = "auto";
    // Apply initial responsive max-width on creation
    (function () {
      const w = window.innerWidth || document.documentElement.clientWidth || 0;
      panel.style.maxWidth = w <= 1600 ? "461px" : "473px";
    })();
    panel.style.marginBottom = "8px";
    panel.style.maxHeight = "60vh";
    // Avoid horizontal clipping issues with sticky header; only scroll vertically
    panel.style.overflowY = "auto";
    panel.style.overflowX = "hidden";
    panel.style.border = "2px solid #4a4379";

    const header = document.createElement("div");
    header.id = "stremio-sentinel-header";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "start";
    header.style.gap = "8px";
    // Keep header visible while scrolling the panel
    header.style.position = "sticky";
    header.style.top = "0";
    header.style.background = "#2a2843";
    header.style.zIndex = "1";
    header.style.paddingTop = "12px";
    header.style.paddingBottom = "10px";
    // Visual separation indicating scroll beneath header
    header.style.borderBottom = "2px solid rgba(255,255,255,0.12)";

    const title = document.createElement("div");
    title.textContent = "Stremio Sentinel";
    title.style.fontWeight = "700";
    title.style.letterSpacing = "0.2px";
    title.style.fontSize = "16px";
    title.style.overflow = "hidden";
    title.style.textWrap = "nowrap";
    title.style.textOverflow = "ellipsis";

    // SVG icon to the left of the title
    // Header icon: load from icons/icon.svg via extension URL
    const icon = document.createElement("img");
    try {
      icon.src = chrome.runtime.getURL("icons/icon.svg");
    } catch (_) {}
    icon.width = 21;
    icon.height = 21;
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    icon.style.display = "block";
    icon.style.flex = "0 0 auto";
    icon.style.marginTop = "2px";
    icon.style.marginRight = "-2px";

    const btn = document.createElement("button");
    btn.textContent = "Scan Addons";
    btn.id = "stremio-sentinel-scan-btn";
    styleButton(btn, { primary: true });

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.id = "stremio-sentinel-clear-btn";
    styleButton(clearBtn);

    const minimizeBtn = document.createElement("button");
    minimizeBtn.textContent = "−";
    minimizeBtn.title = "Minimize";
    minimizeBtn.id = "stremio-sentinel-minimize-btn";
    styleButton(minimizeBtn);
    minimizeBtn.style.fontWeight = "800";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.id = "stremio-sentinel-cancel-btn";
    styleButton(cancelBtn);

    const status = document.createElement("div");
    status.id = "stremio-sentinel-status";
    status.style.marginTop = "10px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.9";

    const list = document.createElement("div");
    list.id = "stremio-sentinel-results";
    list.style.marginTop = "10px";
    // Hide results list by default when empty
    list.style.display = "none";
    list.style.marginBottom = "-6px";

    // Empty-state message shown only when the list is empty
    const emptyMsg = document.createElement("div");
    emptyMsg.id = "stremio-sentinel-empty";
    emptyMsg.textContent =
      "No results yet — click Scan Addons to check for updates.";
    emptyMsg.style.marginTop = "2px";
    emptyMsg.style.fontSize = "12px";
    emptyMsg.style.opacity = "0.85";
    emptyMsg.style.color = "#c6c6d4";
    emptyMsg.style.display = "block";

    const body = document.createElement("div");
    body.id = "stremio-sentinel-body";
    body.appendChild(status);
    body.appendChild(emptyMsg);
    body.appendChild(list);

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "8px";
    controls.style.flexWrap = "nowrap";
    // Keep right-side breathing room and allow interaction scale without clipping
    controls.style.paddingRight = "2px";
    controls.style.overflow = "visible";
    controls.appendChild(btn);
    controls.appendChild(clearBtn);
    controls.appendChild(cancelBtn);
    controls.appendChild(minimizeBtn);

    header.appendChild(icon);
    header.appendChild(title);
    header.appendChild(controls);

    panel.appendChild(header);
    panel.appendChild(body);

    // Attach consistent hover/press effects to all controls
    attachButtonInteractions(btn);
    attachButtonInteractions(clearBtn);
    attachButtonInteractions(cancelBtn);
    attachButtonInteractions(minimizeBtn);

    btn.addEventListener("click", () => {
      if (isScanning) {
        status.textContent = "Already scanning…";
        return;
      }
      // Prefer a fresh page load on addons to ensure fast scanning
      try {
        sessionStorage.setItem("stremioSentinelAutoScan", "1");
      } catch (_) {}
      if (!location.hash.startsWith("#/addons")) {
        location.hash = "#/addons";
      }
      location.reload();
    });
    clearBtn.addEventListener("click", () => clearResults(status, list));
    cancelBtn.addEventListener("click", () => {
      if (!isScanning) return;
      scanAbort.cancelled = true;
      status.textContent = "Cancelling…";
    });
    minimizeBtn.addEventListener("click", () => {
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "block" : "none";
      const nowHidden = !isHidden;
      minimizeBtn.textContent = nowHidden ? "+" : "−";
      minimizeBtn.title = nowHidden ? "Expand" : "Minimize";
      setMinimizeUIState(nowHidden);
      // On expand, clear any stale animation styles so list shows correctly
      if (!nowHidden) {
        const list = document.getElementById("stremio-sentinel-results");
        if (list) {
          try {
            list.style.height = "";
            list.style.transition = "";
            list.style.overflow = "";
            list.style.willChange = "";
            if (list.dataset) list.dataset.animating = "0";
            if (list.children && list.children.length > 0) {
              list.style.display = "block";
            }
          } catch (_) {}
        }
      }
    });

    document.body.appendChild(panel);
    // Initialize controls to idle state on first render
    setScanningUIState(false);
    setMinimizeUIState(false);
    return panel;
  }

  function clearResults(statusNode, resultsNode) {
    resultsNode.innerHTML = "";
    statusNode.textContent = "";
    for (const node of highlightedNodes) {
      try {
        node.style.outline = "";
        node.style.outlineOffset = "";
        updatePanelWidth();
      } catch (_) {}
    }
    highlightedNodes.clear();
    // Hide list when empty
    if (
      resultsNode &&
      resultsNode.children &&
      resultsNode.children.length === 0
    ) {
      resultsNode.style.display = "none";
      const emptyMsg = document.getElementById("stremio-sentinel-empty");
      if (emptyMsg) emptyMsg.style.display = "block";
    }
  }

  function removeUI() {
    const panel = document.getElementById("stremio-sentinel-panel");
    if (panel) {
      try {
        panel.remove();
      } catch (_) {
        panel.parentNode && panel.parentNode.removeChild(panel);
      }
    }
  }

  // Removed pre-warm logic per user request

  async function waitForNewModal(beforeCount, timeout = 2500) {
    // If the modal container already exists, skip waiting for it
    if (!getModalsContainer()) {
      await waitForSelector(SELECTORS.modalsContainer, { timeout });
    }
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const cnt = getModalCount();
      if (cnt > beforeCount) {
        const root = getLatestModalRoot();
        if (root) return root;
      }
      await sleep(50);
    }
    // Fallback: try to locate details container quickly
    const detailsNode = await waitForSelector(SELECTORS.detailsContainer, {
      timeout: 1000,
      root: document,
    });
    if (detailsNode) {
      const altRoot = findModalRootFrom(detailsNode) || detailsNode;
      return altRoot;
    }
    return null;
  }

  async function extractUiVersion(modalRoot) {
    const v = await waitForSelector(SELECTORS.detailsVersion, {
      timeout: 4000,
      root: modalRoot,
    });
    if (v && v.textContent) return v.textContent.trim();
    const header =
      modalRoot.querySelector(".name-container-XxPAj") || modalRoot;
    const cand = header.querySelector('[class*="version"]');
    if (cand && cand.textContent) return cand.textContent.trim();
    const m = (header.textContent || "").match(/v\.?\d+(?:\.\d+){0,3}/i);
    return m ? m[0] : null;
  }

  async function extractManifestUrl(modalRoot) {
    const el = await waitForSelector(SELECTORS.detailsManifestUrl, {
      timeout: 3000,
      root: modalRoot,
    });
    if (el && el.textContent) return el.textContent.trim();
    const rows = modalRoot.querySelectorAll('[class*="section-container"]');
    for (const row of rows) {
      const label = row.querySelector('[class*="section-header"]');
      const labelText =
        label && label.textContent ? label.textContent.trim() : "";
      if (labelText.toLowerCase() === "url:" || /url\s*:/i.test(labelText)) {
        const direct = row.querySelector('[class*="transport-url-label"]');
        if (direct && direct.textContent) return direct.textContent.trim();
        const value = row.querySelector('[class*="section-label"]');
        if (value && value.textContent) return value.textContent.trim();
      }
      const spanLike = row.querySelector("span");
      if (
        spanLike &&
        /(https?:\/\/.*\.(json|manifest))/i.test(spanLike.textContent || "")
      ) {
        return spanLike.textContent.trim();
      }
    }
    const allSpans = modalRoot.querySelectorAll("span");
    for (const s of allSpans) {
      const txt = (s.textContent || "").trim();
      if (/https?:\/\/.*\.json/i.test(txt)) return txt;
    }
    return null;
  }

  async function openAddonDetails(listItem) {
    const before = getModalCount();
    listItem.click();
    const modalRoot = await waitForNewModal(before, 2500);
    if (!modalRoot) {
      // As a last resort, try to find details anywhere in the document
      const detailsNode = await waitForSelector(SELECTORS.detailsContainer, {
        timeout: 1500,
        root: document,
      });
      if (!detailsNode)
        return { versionText: null, manifestUrl: null, modalRoot: null };
      const altRoot = findModalRootFrom(detailsNode) || detailsNode;
      // Proceed using the alternative root
      const manifestUrl = await extractManifestUrl(altRoot);
      return { versionText: null, manifestUrl, modalRoot: altRoot };
    }

    const detailsReady = await waitForSelector(SELECTORS.detailsContainer, {
      timeout: 2000,
      root: modalRoot,
    });
    if (!detailsReady) {
      await sleep(180);
    }

    // Only use modal to get manifest URL; installed version comes from list item
    const manifestUrl = await extractManifestUrl(modalRoot);
    return { versionText: null, manifestUrl, modalRoot };
  }

  async function closeDetails(modalRoot) {
    let cancel = null;
    if (modalRoot) cancel = modalRoot.querySelector(SELECTORS.cancelButton);
    if (!cancel) cancel = document.querySelector(SELECTORS.cancelButton);
    if (cancel) cancel.click();
    else {
      let closeBtn = null;
      if (modalRoot) closeBtn = modalRoot.querySelector(SELECTORS.closeButton);
      if (!closeBtn) closeBtn = document.querySelector(SELECTORS.closeButton);
      if (closeBtn) closeBtn.click();
      else
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }

    const start = performance.now();
    while (performance.now() - start < 1500) {
      if (modalRoot && !modalRoot.isConnected) break;
      const cnt = getModalCount();
      if (cnt === 0) break;
      await sleep(50);
    }
    await sleep(50);
  }

  function scrollToAddon(node) {
    try {
      const list = document.querySelector(SELECTORS.listContainer);
      if (list && typeof list.scrollTop === "number") {
        const childRect = node.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const offset = childRect.top - listRect.top;
        const centerAdjust = Math.max(
          0,
          (list.clientHeight - childRect.height) / 2
        );
        const target = Math.max(0, list.scrollTop + offset - centerAdjust);
        list.scrollTo({ top: target, behavior: "smooth" });
        return;
      }
    } catch (_) {}
    try {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    } catch (_) {}
    try {
      const bottom = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      window.scrollTo({ top: bottom, behavior: "smooth" });
    } catch (_) {}
  }

  function renderResult(listNode, item) {
    const row = document.createElement("div");
    row.style.display = "grid";
    row.style.gridTemplateColumns = "1fr auto auto";
    row.style.gap = "8px";
    row.style.alignItems = "center";
    row.style.padding = "8px 0";
    row.style.borderTop = "1px solid rgba(255,255,255,0.08)";

    const name = document.createElement("div");
    name.textContent = item.name;
    name.style.flex = "1";
    name.style.fontWeight = "600";

    const versions = document.createElement("div");
    versions.textContent = `${item.currentVersion || "n/a"} → ${
      item.manifestVersion || "n/a"
    }`;
    versions.style.opacity = "0.9";

    const status = document.createElement("div");
    status.textContent = item.needsUpdate ? "Update available" : "Up-to-date";
    status.style.fontWeight = "600";
    status.style.color = item.needsUpdate ? "#ffb02e" : "#7bd88f";

    const details = document.createElement("div");
    details.style.gridColumn = "1 / -1";
    details.style.display = "none";
    details.style.fontSize = "12px";
    details.style.opacity = "0.9";
    details.style.marginTop = "4px";
    details.style.borderLeft = "2px solid #4a4379";
    details.style.paddingLeft = "8px";
    const urlEl = document.createElement("div");
    urlEl.textContent = `URL: ${item.manifestUrl || "n/a"}`;
    const urlBtn = document.createElement("button");
    urlBtn.textContent = "Copy manifest URL";
    urlBtn.style.marginTop = "4px";
    urlBtn.style.background = "transparent";
    urlBtn.style.color = "#c6c6d4";
    urlBtn.style.border = "1px solid #4a4379";
    urlBtn.style.borderRadius = "6px";
    urlBtn.style.padding = "4px 8px";
    urlBtn.style.cursor = "pointer";
    urlBtn.addEventListener("click", async () => {
      const text = item.manifestUrl || "";
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    });
    details.appendChild(urlEl);
    details.appendChild(urlBtn);

    const toggle = document.createElement("a");
    toggle.href = "#";
    toggle.textContent = "Details";
    toggle.style.fontSize = "12px";
    toggle.style.opacity = "0.9";
    toggle.style.textDecoration = "underline";
    toggle.style.color = "#6a5acd";
    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      details.style.display =
        details.style.display === "none" ? "block" : "none";
    });

    row.appendChild(name);
    row.appendChild(versions);
    row.appendChild(status);
    row.appendChild(toggle);
    row.appendChild(details);
    appendRowSmooth(listNode, row);

    // No auto-scroll within the extension panel

    try {
      item.node.style.outline = item.needsUpdate
        ? "2px solid #ffb02e"
        : "2px solid #2e8b57";
      item.node.style.outlineOffset = "2px";
      highlightedNodes.add(item.node);
    } catch (_) {}
  }

  async function scan(statusNode, resultsNode, abort = { cancelled: false }) {
    isScanning = true;
    setScanningUIState(true);
    statusNode.textContent = "Scanning addons…";
    resultsNode.innerHTML = "";
    // Start with hidden list until results appear
    resultsNode.style.display = "none";
    const emptyMsg = document.getElementById("stremio-sentinel-empty");
    if (emptyMsg) emptyMsg.style.display = "block";

    const list = document.querySelector(SELECTORS.listContainer);
    if (!list) {
      statusNode.textContent = "Addons list not found on this page.";
      resultsNode.style.display = "none";
      return;
    }

    const children = Array.from(list.children);
    if (!children.length) {
      statusNode.textContent = "No addons listed.";
      resultsNode.style.display = "none";
      const emptyMsg2 = document.getElementById("stremio-sentinel-empty");
      if (emptyMsg2) emptyMsg2.style.display = "block";
      return;
    }

    // Pre-warm removed; proceed directly to scanning

    for (let i = 0; i < children.length; i++) {
      if (abort.cancelled) {
        statusNode.textContent = "Scan cancelled.";
        break;
      }
      const child = children[i];
      const nameNode = child.querySelector(SELECTORS.listItemName);
      const versionNode = child.querySelector(SELECTORS.listItemVersion);
      const name = nameNode ? nameNode.textContent.trim() : `Addon #${i + 1}`;
      const listedVersion = versionNode ? versionNode.textContent.trim() : null;

      statusNode.textContent = `Processing: ${name}`;

      let details;
      let modalRoot = null;
      try {
        const d = await openAddonDetails(child);
        details = d;
        modalRoot = d.modalRoot;
      } catch (e) {
        details = {
          versionText: listedVersion,
          manifestUrl: null,
          modalRoot: null,
        };
      }

      // Installed version should come from the initial list element (not modal)
      const currentVersion = listedVersion;
      let manifestVersion = null;
      let manifestJson = null;

      if (details.manifestUrl) {
        const resp = await fetchManifestVersion(details.manifestUrl);
        if (resp.ok) {
          manifestVersion = resp.version;
          manifestJson = resp.json;
        }
      }

      const needsUpdate =
        currentVersion && manifestVersion
          ? compareSemver(currentVersion, manifestVersion) < 0
          : false;

      renderResult(resultsNode, {
        name,
        currentVersion,
        manifestVersion,
        needsUpdate,
        manifestUrl: details.manifestUrl,
        manifestJson,
        node: child,
      });

      await closeDetails(modalRoot);
      await sleep(100);
    }

    if (!abort.cancelled) {
      statusNode.textContent = "Scan complete.";
    } else {
      statusNode.textContent = "Scan cancelled.";
    }
    isScanning = false;
    setScanningUIState(false);
    abort.cancelled = false;
  }

  function maybeInit() {
    const onAddons = location.hash.startsWith("#/addons");
    if (onAddons) {
      ensureUI();
      // If a refresh-before-scan was requested, run scan automatically
      try {
        const auto = sessionStorage.getItem("stremioSentinelAutoScan");
        if (auto === "1") {
          sessionStorage.removeItem("stremioSentinelAutoScan");
          const statusNode = document.getElementById("stremio-sentinel-status");
          const resultsNode = document.getElementById(
            "stremio-sentinel-results"
          );
          setTimeout(() => {
            if (statusNode && resultsNode) {
              // Ensure cancel flag is reset for a fresh run
              scanAbort.cancelled = false;
              scan(statusNode, resultsNode, scanAbort);
            }
          }, 400);
        }
      } catch (_) {}
    } else {
      removeUI();
    }
  }

  window.addEventListener("hashchange", maybeInit);

  // Keep panel width responsive to window size
  window.addEventListener("resize", updatePanelWidth);

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    maybeInit();
  } else {
    window.addEventListener("DOMContentLoaded", maybeInit);
  }

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === "openPanelAndScan") {
        const panel = ensureUI();
        const statusNode = panel.querySelector("div:nth-child(3)");
        const resultsNode = document.getElementById("stremio-sentinel-results");

        if (!location.hash.startsWith("#/addons")) {
          location.hash = "#/addons";
        }

        setTimeout(() => {
          if (isScanning) {
            const s =
              document.getElementById("stremio-sentinel-status") || statusNode;
            if (s) s.textContent = "Already scanning…";
            return;
          }
          const finalStatus =
            document.getElementById("stremio-sentinel-status") ||
            statusNode ||
            document.createElement("div");
          const finalResults =
            resultsNode || document.getElementById("stremio-sentinel-results");
          if (finalStatus && finalResults) {
            // Reset cancel flag and pass shared abort object
            scanAbort.cancelled = false;
            scan(finalStatus, finalResults, scanAbort);
          }
        }, 600);
      }
    });
  } catch (_) {}
})();
