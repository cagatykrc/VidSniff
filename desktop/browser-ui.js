const api = window.vidsniffBrowser;
/** @type {Record<string, string>} */
let S = {};
/** @type {object | null} */
let primary = null;
/** @type {object[]} */
let qualities = [];
let probeUrl = "";
let loading = false;

const urlInput = document.getElementById("url");
const backBtn = document.getElementById("back");
const forwardBtn = document.getElementById("forward");
const reloadBtn = document.getElementById("reload");
const dlBtn = document.getElementById("download");
const qualityEl = document.getElementById("quality");
const capTitle = document.getElementById("capTitle");
const capMeta = document.getElementById("capMeta");
const statusEl = document.getElementById("status");

function t(key, fallback = "") {
  return S[key] || fallback || key;
}

function applyI18n() {
  urlInput.placeholder = t("browserUrlPlaceholder", "https://…");
  document.getElementById("go").textContent = t("browserGo", "Go");
  dlBtn.textContent = t("browserDownload", "Download MP4");
  if (!primary) {
    capTitle.textContent = t("browserNoCapture", "—");
    capMeta.textContent = t("browserPlayHint", "Play a video on the page to capture it");
  }
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

qualityEl.addEventListener("change", () => {
  /* selection used on download */
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
    capMeta.textContent = t("browserPlayHint", "Play a video on the page to capture it");
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
        ? "HLS · master"
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
  qualityEl.innerHTML = `<option value="auto">${t("browserProbing", "Probing…")}</option>`;
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
    setStatus(t("browserPlayFirst", "Play the video first"), "err");
    return;
  }
  dlBtn.disabled = true;
  setStatus(t("browserStarting", "Starting…"), "run");
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
    if (result.jobId) watchJob(result.jobId);
    else setStatus(t("browserStarted", "Started"), "ok");
  } catch (e) {
    setStatus(e?.message || String(e), "err");
  } finally {
    dlBtn.disabled = !primary;
  }
}

async function watchJob(jobId) {
  for (let i = 0; i < 240; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    const job = await api.job(jobId);
    if (!job) continue;
    if (job.status === "running") {
      setStatus(`${t("browserDownloading", "Downloading…")} ${Math.round(job.progress || 0)}%`, "run");
    } else if (job.status === "done") {
      setStatus(t("browserDone", "Saved"), "ok");
      return;
    } else if (job.status === "error") {
      setStatus(job.error || t("browserFailed", "Failed"), "err");
      return;
    }
  }
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
