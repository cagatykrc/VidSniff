const api = window.vidsniffBrowser;
/** @type {Record<string, string>} */
let S = {};
/** @type {object | null} */
let primary = null;
/** @type {object[]} */
let qualities = [];
let probeUrl = "";
let loading = false;
const API = "http://127.0.0.1:17890";

const urlInput = document.getElementById("url");
const backBtn = document.getElementById("back");
const forwardBtn = document.getElementById("forward");
const reloadBtn = document.getElementById("reload");
const dlBtn = document.getElementById("download");
const qualityEl = document.getElementById("quality");
const capTitle = document.getElementById("capTitle");
const capMeta = document.getElementById("capMeta");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const jobsPanel = document.getElementById("jobsPanel");
const jobsBadge = document.getElementById("jobsBadge");

function t(key, fallback = "") {
  return S[key] || fallback || key;
}

function applyI18n() {
  urlInput.placeholder = t("browserUrlPlaceholder", "https://…");
  dlBtn.textContent = t("browserDownloadShort", "MP4");
  const clearBtn = document.getElementById("clearList");
  if (clearBtn) clearBtn.textContent = t("panelClear", "Clear");
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && S[key]) el.textContent = S[key];
  });
  if (!primary) {
    capTitle.textContent = t("browserNoCapture", "—");
    capMeta.textContent = t("browserPlayHintShort", "Play a video to capture");
  }
  const empty = document.getElementById("jobsEmpty");
  if (empty && !listEl.querySelector(".job")) {
    empty.textContent = t("panelEmptyShort", "No downloads yet");
  }
}

function setJobsOpen(open) {
  jobsPanel.hidden = !open;
  api.setJobsOpen?.(!!open);
}

document.getElementById("urlForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api.navigate(urlInput.value);
});

backBtn.addEventListener("click", () => api.back());
forwardBtn.addEventListener("click", () => api.forward());
reloadBtn.addEventListener("click", () => {
  if (loading) api.stop();
  else api.reload();
});
dlBtn.addEventListener("click", () => startDownload());
document.getElementById("openFolder")?.addEventListener("click", () => api.openFolder?.());
document.getElementById("openSettings")?.addEventListener("click", () => api.openSettings?.());
document.getElementById("jobsToggle")?.addEventListener("click", () => {
  setJobsOpen(jobsPanel.hidden);
});
document.getElementById("jobsClose")?.addEventListener("click", () => setJobsOpen(false));
document.getElementById("clearList")?.addEventListener("click", async () => {
  try {
    await fetch(`${API}/jobs/clear`, { method: "POST" });
  } catch {
    /* ignore */
  }
  await loadJobs();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setJobsOpen(false);
});

function setStatus(text, cls = "") {
  if (!text) {
    statusEl.hidden = true;
    statusEl.textContent = "";
    return;
  }
  statusEl.hidden = false;
  statusEl.className = `status ${cls}`.trim();
  statusEl.textContent = text;
}

function renderPrimary(item) {
  primary = item;
  if (!item) {
    capTitle.textContent = t("browserNoCapture", "—");
    capMeta.textContent = t("browserPlayHintShort", "Play a video to capture");
    dlBtn.disabled = true;
    qualityEl.hidden = true;
    qualities = [];
    probeUrl = "";
    return;
  }
  capTitle.textContent = item.displayName || item.filename || t("browserVideo", "Video");
  const kind =
    item.type === "hls"
      ? item.hlsKind === "master"
        ? "HLS"
        : "HLS"
      : item.type || "video";
  capMeta.textContent = kind;
  dlBtn.disabled = false;
  ensureProbe(item);
}

async function ensureProbe(item) {
  const isHls =
    item.type === "hls" ||
    /\/hls\//i.test(item.url || "") ||
    /\.m3u8|master\.txt/i.test(item.url || "");
  if (!isHls) {
    qualityEl.hidden = true;
    qualities = [];
    return;
  }
  if (probeUrl === item.url && qualities.length) {
    qualityEl.hidden = false;
    return;
  }
  qualityEl.hidden = false;
  qualityEl.innerHTML = `<option value="auto">${t("browserProbing", "…")}</option>`;
  const probe = await api.probe({ url: item.url });
  if (!probe?.ok || !probe.qualities?.length) {
    qualities = [{ id: "auto", label: t("browserQualityAuto", "Auto"), estimatedBytes: 0 }];
  } else {
    qualities = [
      {
        id: "auto",
        label: t("browserQualityAuto", "Auto"),
        estimatedBytes: probe.qualities[0]?.estimatedBytes || 0,
      },
      ...probe.qualities,
    ];
  }
  probeUrl = item.url;
  qualityEl.innerHTML = qualities
    .map((q) => `<option value="${escAttr(q.id)}">${esc(q.label)}</option>`)
    .join("");
  qualityEl.hidden = false;
}

async function startDownload() {
  if (!primary?.url) {
    setStatus(t("browserPlayFirst", "Play first"), "err");
    return;
  }
  dlBtn.disabled = true;
  setStatus(t("browserStarting", "…"), "run");
  const qid = qualityEl.value || "auto";
  const q = qualities.find((x) => x.id === qid);
  try {
    const result = await api.download({
      url: primary.url,
      quality: qid,
      estimatedBytes: q?.estimatedBytes || 0,
    });
    if (!result?.ok) {
      setStatus(result?.error || t("browserFailed", "Failed"), "err");
      return;
    }
    setStatus(t("browserDownloading", "Downloading…"), "run");
    setJobsOpen(true);
    await loadJobs();
    if (result.jobId) watchJob(result.jobId);
    else setStatus(t("browserStarted", "Started"), "ok");
  } catch (e) {
    setStatus(e?.message || String(e), "err");
  } finally {
    dlBtn.disabled = !primary;
  }
}

async function watchJob(jobId) {
  for (let i = 0; i < 600; i += 1) {
    await new Promise((r) => setTimeout(r, 800));
    const job = await api.job(jobId);
    if (!job) continue;
    await loadJobs();
    if (job.status === "running") {
      setStatus(`${t("browserDownloading", "Downloading…")} ${Math.round(job.progress || 0)}%`, "run");
    } else if (job.status === "done") {
      setStatus(t("browserDone", "Saved"), "ok");
      return;
    } else if (job.status === "cancelled") {
      setStatus(t("browserCancelled", "Stopped"), "err");
      return;
    } else if (job.status === "error") {
      setStatus(job.error || t("browserFailed", "Failed"), "err");
      return;
    }
  }
}

async function cancelJob(id) {
  try {
    await fetch(`${API}/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  } catch {
    /* ignore */
  }
  await loadJobs();
}

async function removeJob(id) {
  try {
    await fetch(`${API}/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
  await loadJobs();
}

function basename(p) {
  return String(p || "").split(/[/\\]/).pop() || "file";
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function escAttr(s) {
  return esc(s).replaceAll('"', "&quot;");
}

async function loadJobs() {
  let jobs = [];
  try {
    const res = await fetch(`${API}/jobs`);
    const data = await res.json();
    jobs = data.jobs || [];
  } catch {
    jobs = [];
  }

  const running = jobs.filter((j) => j.status === "running").length;
  if (running > 0) {
    jobsBadge.hidden = false;
    jobsBadge.textContent = String(running);
  } else {
    jobsBadge.hidden = true;
  }

  if (!jobs.length) {
    listEl.innerHTML = `<div class="empty" id="jobsEmpty">${t("panelEmptyShort", "No downloads yet")}</div>`;
    return;
  }
  listEl.innerHTML = "";
  for (const job of jobs.slice(0, 20)) {
    const el = document.createElement("article");
    el.className = "job";
    const pct = Math.round(job.progress || 0);
    const statusLabel =
      job.status === "running"
        ? t("browserStatusRunning", "running")
        : job.status === "done"
          ? t("browserStatusDone", "done")
          : job.status === "cancelled"
            ? t("browserStatusCancelled", "stopped")
            : t("browserStatusError", "error");
    el.innerHTML = `
      <div class="job-top">
        <div class="name" title="${escAttr(job.path || job.url)}">${esc(basename(job.path) || job.id)}</div>
        <span class="badge ${escAttr(job.status)}">${esc(statusLabel)}</span>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="meta">
        <span>${pct}%</span>
        <span class="acts"></span>
      </div>
      ${job.error ? `<div class="err">${esc(job.error)}</div>` : ""}
    `;
    const acts = el.querySelector(".acts");
    if (job.status === "running") {
      const stop = document.createElement("button");
      stop.type = "button";
      stop.className = "danger";
      stop.textContent = t("browserStop", "Stop");
      stop.addEventListener("click", () => cancelJob(job.id));
      acts.appendChild(stop);
    }
    if (job.status === "done" && job.path) {
      const show = document.createElement("button");
      show.type = "button";
      show.textContent = t("panelShow", "Show");
      show.addEventListener("click", () => api.showInFolder?.(job.path));
      acts.appendChild(show);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = t("browserRemove", "Close");
    close.title = t("browserRemoveHint", "Remove from list");
    close.addEventListener("click", () => removeJob(job.id));
    acts.appendChild(close);
    listEl.appendChild(el);
  }
}

api.onEvent((msg) => {
  if (!msg?.type) return;
  if (msg.type === "i18n") {
    S = msg.strings || {};
    document.documentElement.lang = msg.lang || "tr";
    applyI18n();
  }
  if (msg.type === "nav") {
    if (document.activeElement !== urlInput) urlInput.value = msg.url || "";
    backBtn.disabled = !msg.canBack;
    forwardBtn.disabled = !msg.canForward;
  }
  if (msg.type === "loading") {
    loading = !!msg.loading;
    reloadBtn.textContent = loading ? "✕" : "↻";
  }
  if (msg.type === "primary") {
    renderPrimary(msg.item || null);
  }
});

applyI18n();
loadJobs();
setInterval(loadJobs, 1000);
