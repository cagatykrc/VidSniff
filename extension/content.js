(function () {
  const seen = new Set();
  const CLOSED_KEY = "vidsniff_panel_closed";
  const CLOSED_PATH_KEY = "vidsniff_panel_closed_path";

  let panel = null;
  let menuOpen = false;
  let primary = null;
  let allowedToShow = false;
  let pollTimer = null;
  let lastHref = location.href;

  function pageKey() {
    return `${location.origin}${location.pathname}`;
  }

  function isClosed() {
    try {
      // sadece aynı film sayfasında X ile kapattıysa gizli kalsın
      return (
        sessionStorage.getItem(CLOSED_KEY) === "1" &&
        sessionStorage.getItem(CLOSED_PATH_KEY) === pageKey()
      );
    } catch {
      return false;
    }
  }

  function setClosed(v) {
    try {
      if (v) {
        sessionStorage.setItem(CLOSED_KEY, "1");
        sessionStorage.setItem(CLOSED_PATH_KEY, pageKey());
      } else {
        sessionStorage.removeItem(CLOSED_KEY);
        sessionStorage.removeItem(CLOSED_PATH_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  function onNavigate() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    seen.clear();
    setClosed(false);
    allowedToShow = false;
    hidePanel();
    chrome.runtime.sendMessage({ type: "PANEL_NAVIGATE" }).catch(() => {});
    // yeni sayfa medyası
    setTimeout(collect, 400);
    setTimeout(collect, 1200);
    setTimeout(reportCandidate, 1500);
  }

  function collect() {
    onNavigateCheck();
    const media = [];
    const title = document.title || "";

    document.querySelectorAll("video, audio").forEach((el) => {
      const sources = [];
      if (el.currentSrc) sources.push(el.currentSrc);
      if (el.src) sources.push(el.src);
      el.querySelectorAll("source").forEach((s) => {
        if (s.src) sources.push(s.src);
      });
      for (const url of sources) {
        if (!url || url.startsWith("blob:") || url.startsWith("mediasource:")) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        media.push({
          url,
          contentType: el.tagName === "AUDIO" ? "audio/*" : "video/*",
          size: 0,
          pageTitle: title,
        });
      }
    });

    const html = document.documentElement?.innerHTML || "";
    const re = /https?:\/\/[^"'\\\s<>]+?\.(?:m3u8|mpd|mp4|webm|m4v|mp3|m4a|txt)(?:\?[^"'\\\s<>]*)?/gi;
    let match;
    let guard = 0;
    while ((match = re.exec(html)) && guard < 40) {
      guard += 1;
      const url = match[0].replace(/&amp;/g, "&");
      if (seen.has(url)) continue;
      if (!/\/hls\/|m3u8|master\.txt/i.test(url) && /\.txt(?:$|\?)/i.test(url)) continue;
      seen.add(url);
      media.push({ url, contentType: "", size: 0, pageTitle: title });
    }

    if (media.length) {
      chrome.runtime
        .sendMessage({ type: "DOM_MEDIA", media, pageUrl: location.href })
        .catch(() => {});
    }

    reportCandidate();
    refreshPrimary();
  }

  function onNavigateCheck() {
    if (location.href !== lastHref) onNavigate();
  }

  function largestVideo() {
    let best = null;
    let area = 0;
    document.querySelectorAll("video").forEach((v) => {
      const r = v.getBoundingClientRect();
      const a = Math.max(0, r.width) * Math.max(0, r.height);
      if (a > area && r.width >= 120 && r.height >= 70) {
        area = a;
        best = v;
      }
    });
    return { video: best, area };
  }

  function reportCandidate() {
    if (isClosed()) {
      hidePanel();
      return;
    }
    const { video, area } = largestVideo();
    chrome.runtime
      .sendMessage({
        type: "PANEL_CANDIDATE",
        area: video ? area : 0,
        hasVideo: !!video,
      })
      .catch(() => {});
  }

  async function refreshPrimary() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_PRIMARY" });
      if (res?.item) primary = res.item;
      updatePanelLabel();
    } catch {
      /* ignore */
    }
  }

  function tt(key) {
    return globalThis.VidSniffI18n?.t?.(key) || key;
  }

  function ensurePanel() {
    if (panel && document.contains(panel)) return panel;
    panel = document.createElement("div");
    panel.id = "vidsniff-panel";
    panel.innerHTML = `
      <div class="vs-shell">
        <button type="button" class="vs-main" data-act="toggle" title="VidSniff">
          <span class="vs-dot" aria-hidden="true"></span>
          <span data-act="label">${tt("download")}</span>
        </button>
        <button type="button" class="vs-close" data-act="close" title="${tt("close")}" aria-label="${tt("close")}">×</button>
      </div>
      <div class="vs-menu" hidden>
        <div class="vs-title" data-act="title">${tt("video")}</div>
        <div class="vs-meta" data-act="meta">MP4</div>
        <select class="vs-quality" data-act="quality" hidden></select>
        <button type="button" class="vs-dl" data-act="download">${tt("downloadAsMp4")}</button>
        <div class="vs-status" data-act="status" hidden></div>
      </div>
    `;

    panel.querySelector('[data-act="toggle"]').addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      menuOpen = !menuOpen;
      panel.querySelector(".vs-menu").hidden = !menuOpen;
      if (menuOpen) {
        refreshPrimary().then(() => loadQualities());
      }
    });
    panel.querySelector('[data-act="quality"]')?.addEventListener("change", () => {
      updatePanelLabel();
    });
    panel.querySelector('[data-act="close"]').addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setClosed(true);
      menuOpen = false;
      hidePanel();
      chrome.runtime.sendMessage({ type: "PANEL_CLOSE" }).catch(() => {});
    });
    panel.querySelector('[data-act="download"]').addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startDownload();
    });
    return panel;
  }

  function ensureMp4Name(name) {
    const stem = String(name || "video")
      .replace(/\.(m3u8|txt|ts|mp4|m4a|mkv|webm)$/i, "")
      .replace(/\.+$/, "")
      .trim() || "video";
    return `${stem}.mp4`;
  }

  let qualitiesCache = [];
  let qualitiesUrl = "";

  async function loadQualities() {
    if (!panel || !primary?.url) return;
    const sel = panel.querySelector('[data-act="quality"]');
    if (!sel) return;
    const isHls =
      primary.type === "hls" ||
      /\/hls\//i.test(primary.url) ||
      /\.m3u8|master\.txt/i.test(primary.url);
    if (!isHls) {
      sel.hidden = true;
      qualitiesCache = [];
      return;
    }
    if (qualitiesUrl === primary.url && qualitiesCache.length) {
      sel.hidden = false;
      return;
    }
    sel.hidden = false;
    sel.innerHTML = `<option value="auto">…</option>`;
    try {
      const probe = await chrome.runtime.sendMessage({
        type: "PROBE",
        url: primary.url,
        headers: primary.requestHeaders || {},
      });
      qualitiesCache = probe?.ok && probe.qualities?.length
        ? [{ id: "auto", label: "Auto", estimatedBytes: probe.qualities[0]?.estimatedBytes || 0 }, ...probe.qualities]
        : [{ id: "auto", label: "Auto", estimatedBytes: 0 }];
      qualitiesUrl = primary.url;
      sel.innerHTML = qualitiesCache
        .map((q) => `<option value="${q.id}">${q.label}</option>`)
        .join("");
      updatePanelLabel();
    } catch {
      sel.hidden = true;
    }
  }

  function updatePanelLabel() {
    if (!panel) return;
    const title = primary?.displayName || primary?.filename || document.title || tt("video");
    const clean = ensureMp4Name(title);
    panel.querySelector('[data-act="title"]').textContent = clean;
    const sel = panel.querySelector('[data-act="quality"]');
    const q = qualitiesCache.find((x) => x.id === (sel?.value || "auto"));
    const size =
      q?.estimatedBytes > 0
        ? ` · ~${(q.estimatedBytes / (1024 * 1024)).toFixed(0)} MB`
        : "";
    panel.querySelector('[data-act="meta"]').textContent = primary
      ? `${tt("mp4Best")}${size}`
      : tt("waitingCapture");
    panel.querySelector('[data-act="label"]').textContent = tt("download");
    const closeBtn = panel.querySelector('[data-act="close"]');
    if (closeBtn) {
      closeBtn.title = tt("close");
      closeBtn.setAttribute("aria-label", tt("close"));
    }
    const dl = panel.querySelector('[data-act="download"]');
    if (dl) dl.textContent = tt("downloadAsMp4");
  }

  function hidePanel() {
    allowedToShow = false;
    if (panel?.parentElement) panel.parentElement.removeChild(panel);
    menuOpen = false;
  }

  function placePanel() {
    if (!allowedToShow || isClosed()) {
      if (panel?.parentElement) hidePanel();
      return;
    }
    const { video } = largestVideo();
    if (!video) {
      // video henüz yoksa biraz bekle; hemen yok etme — aday raporları gelsin
      return;
    }
    const p = ensurePanel();
    const host = video.parentElement || document.body;
    const cs = getComputedStyle(host);
    if (cs.position === "static") host.style.position = "relative";
    if (p.parentElement !== host) host.appendChild(p);
    p.style.top = "10px";
    p.style.right = "10px";
    if (p.querySelector(".vs-menu")) p.querySelector(".vs-menu").hidden = !menuOpen;
    updatePanelLabel();
  }

  async function startDownload() {
    const status = panel.querySelector('[data-act="status"]');
    const btn = panel.querySelector('[data-act="download"]');
    status.hidden = false;
    status.className = "vs-status";
    status.textContent = tt("starting");
    btn.disabled = true;
    try {
      await refreshPrimary();
      if (!primary) {
        status.className = "vs-status err";
        status.textContent = tt("playFirst");
        return;
      }
      const sel = panel.querySelector('[data-act="quality"]');
      const qid = sel?.value || "auto";
      const q = qualitiesCache.find((x) => x.id === qid);
      const result = await chrome.runtime.sendMessage({
        type: "DOWNLOAD",
        item: { ...primary, estimatedBytes: q?.estimatedBytes || 0 },
        mode: "auto",
        quality: qid,
        estimatedBytes: q?.estimatedBytes || 0,
      });
      if (result?.ok) {
        status.className = "vs-status ok";
        status.textContent = result.jobId ? tt("downloading") : tt("started");
        watchJob(result.jobId, status);
      } else {
        status.className = "vs-status err";
        status.textContent = result?.error || tt("failed");
      }
    } catch (e) {
      status.className = "vs-status err";
      status.textContent = e?.message || String(e);
    } finally {
      btn.disabled = false;
    }
  }

  async function watchJob(jobId, statusEl) {
    if (!jobId) return;
    for (let i = 0; i < 180; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const job = await chrome.runtime.sendMessage({ type: "JOB_STATUS", jobId });
        if (!job || job.error) continue;
        if (job.status === "running") {
          statusEl.className = "vs-status";
          statusEl.textContent = `%${Math.round(job.progress || 0)}`;
        } else if (job.status === "done") {
          statusEl.className = "vs-status ok";
          statusEl.textContent = tt("done");
          return;
        } else if (job.status === "error") {
          statusEl.className = "vs-status err";
          statusEl.textContent = job.error || tt("error");
          return;
        }
      } catch {
        return;
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "PRIMARY_UPDATED") {
      primary = msg.item || null;
      updatePanelLabel();
    }
    if (msg?.type === "PANEL_SHOW") {
      if (isClosed()) return;
      allowedToShow = true;
      placePanel();
      // video geç yüklenirse tekrar dene
      setTimeout(placePanel, 500);
      setTimeout(placePanel, 1500);
    }
    if (msg?.type === "PANEL_HIDE") {
      hidePanel();
    }
  });

  // SPA / history navigasyon
  const _push = history.pushState;
  const _replace = history.replaceState;
  history.pushState = function (...args) {
    const r = _push.apply(this, args);
    queueMicrotask(onNavigate);
    return r;
  };
  history.replaceState = function (...args) {
    const r = _replace.apply(this, args);
    queueMicrotask(onNavigate);
    return r;
  };
  window.addEventListener("popstate", onNavigate);
  window.addEventListener("hashchange", onNavigate);

  collect();
  globalThis.VidSniffI18n?.syncFromService?.().then(() => updatePanelLabel());

  const obs = new MutationObserver(() => {
    window.clearTimeout(obs._t);
    obs._t = window.setTimeout(collect, 600);
  });
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  document.addEventListener("play", () => collect(), true);

  window.clearInterval(pollTimer);
  pollTimer = window.setInterval(() => {
    onNavigateCheck();
    reportCandidate();
    refreshPrimary();
    if (allowedToShow) placePanel();
    globalThis.VidSniffI18n?.syncFromService?.().then(() => {
      if (panel) updatePanelLabel();
    });
  }, 1500);
})();
