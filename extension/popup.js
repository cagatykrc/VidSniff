const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const jobsEl = document.getElementById("jobs");
const primaryEl = document.getElementById("primary");
const dlPrimaryBtn = document.getElementById("dlPrimary");
const primaryMsg = document.getElementById("primaryMsg");

/** @type {Map<string, object>} */
const probeCache = new Map();
/** @type {object[]} */
let serverJobs = [];
/** @type {object | null} */
let primaryItem = null;

document.getElementById("dlPrimary").addEventListener("click", () => downloadPrimary());

function prettyName(item) {
  if (!item) return "Video";
  const url = item.url || "";
  const fn = item.displayName || item.filename || item.pageTitle || "video";
  if (/master\.(txt|m3u8)/i.test(url) || item.hlsKind === "master" || /\/hls\//i.test(url)) {
    const base = String(fn).replace(/\.(m3u8|txt|ts)$/i, "");
    return base.endsWith(".mp4") ? base : `${base}.mp4`;
  }
  return fn;
}

function basename(p) {
  return String(p || "").split(/[/\\]/).pop() || "dosya";
}

function formatBytes(n) {
  if (!n || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

async function load() {
  const jobsRes = await chrome.runtime.sendMessage({ type: "LIST_JOBS" });
  serverJobs = jobsRes?.jobs || [];
  renderJobsBar();

  const prim = await chrome.runtime.sendMessage({ type: "GET_PRIMARY" });
  primaryItem = prim?.item || null;
  renderPrimary(!!(prim?.downloaderOnline ?? jobsRes?.downloaderOnline));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.runtime.sendMessage({ type: "GET_ITEMS", tabId: tab?.id ?? -1 });
  renderList((res?.items || []).filter((i) => !isNoise(i)));
}

function isNoise(it) {
  const u = `${it.url || ""} ${it.filename || ""}`;
  return /site\.webm|sublist_aud|\/aud\d|sprite|thumbnail/i.test(u);
}

function renderPrimary(online) {
  statusEl.textContent = online ? "servis açık" : "servis kapalı";
  statusEl.className = `status ${online ? "online" : "offline"}`;

  if (!primaryItem) {
    primaryEl.className = "primary empty";
    primaryEl.querySelector(".p-title").textContent = "Video oynatınca burada görünür";
    primaryEl.querySelector(".p-meta").textContent = "Sayfada videoyu başlat → MP4 indirme çıkar";
    dlPrimaryBtn.disabled = true;
    return;
  }

  const job = serverJobs.find((j) => j.url === primaryItem.url);
  const name = prettyName(primaryItem);
  primaryEl.className = "primary";
  primaryEl.querySelector(".p-title").textContent = name;
  primaryEl.querySelector(".p-meta").textContent = [
    "MP4",
    primaryItem.hlsKind === "master" ? "HLS→MP4" : primaryItem.type,
    job?.status === "running" ? `%${Math.round(job.progress || 0)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  dlPrimaryBtn.disabled = job?.status === "running" || !online;
  dlPrimaryBtn.textContent = job?.status === "running" ? "İndiriliyor…" : "MP4 İndir";

  if (job?.status === "done") {
    primaryMsg.hidden = false;
    primaryMsg.className = "msg ok";
    primaryMsg.textContent = `Tamam: ${basename(job.path)}`;
  } else if (job?.status === "error") {
    primaryMsg.hidden = false;
    primaryMsg.className = "msg err";
    primaryMsg.textContent = job.error || "Hata";
  } else if (job?.status === "running") {
    primaryMsg.hidden = false;
    primaryMsg.className = "msg";
    primaryMsg.textContent = `İndiriliyor… %${Math.round(job.progress || 0)}`;
  } else {
    primaryMsg.hidden = true;
  }
}

async function downloadPrimary() {
  if (!primaryItem) return;
  dlPrimaryBtn.disabled = true;
  dlPrimaryBtn.textContent = "...";
  primaryMsg.hidden = false;
  primaryMsg.className = "msg";
  primaryMsg.textContent = "MP4 indirme başlatılıyor…";
  const result = await chrome.runtime.sendMessage({
    type: "DOWNLOAD",
    item: primaryItem,
    mode: "auto",
    quality: "auto",
  });
  if (!result?.ok) {
    primaryMsg.className = "msg err";
    primaryMsg.textContent = result?.error || "Başarısız";
    dlPrimaryBtn.disabled = false;
    dlPrimaryBtn.textContent = "MP4 İndir";
  }
  await load();
}

function renderJobsBar() {
  if (!jobsEl) return;
  const recent = [...serverJobs].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, 6);
  if (!recent.length) {
    jobsEl.hidden = true;
    jobsEl.innerHTML = "";
    return;
  }
  jobsEl.hidden = false;
  jobsEl.innerHTML = `
    <div class="jobs-head">
      <div class="jobs-title">Arka plan indirmeleri</div>
      <button type="button" class="ghost mini" id="openFolder">Klasör</button>
    </div>
    ${recent
      .map((job) => {
        const pct = Math.round(job.progress || 0);
        const cls = job.status === "done" ? "ok" : job.status === "error" ? "err" : "run";
        const label =
          job.status === "running" ? `%${pct}` : job.status === "done" ? "tamam" : "hata";
        return `<div class="job-row ${cls}">
          <div class="job-name">${escapeHtml(basename(job.path) || job.id)}</div>
          <div class="job-meta">${escapeHtml(label)}</div>
          <div class="job-bar"><span style="width:${job.status === "done" ? 100 : pct}%"></span></div>
          ${job.error ? `<div class="job-err">${escapeHtml(job.error)}</div>` : ""}
        </div>`;
      })
      .join("")}
  `;
  document.getElementById("openFolder")?.addEventListener("click", async () => {
    const res = await chrome.runtime.sendMessage({ type: "OPEN_DOWNLOADS_FOLDER" });
    if (res?.path) {
      await navigator.clipboard.writeText(res.path);
      alert(res.path);
    }
  });
}

function renderList(items) {
  if (!items.length) {
    listEl.innerHTML = `<div class="empty-mini">Başka yakalama yok</div>`;
    return;
  }
  listEl.innerHTML = "";
  for (const item of items.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "mini-row";
    row.innerHTML = `
      <div class="mini-name" title="${escapeAttr(item.url)}">${escapeHtml(prettyName(item))}</div>
      <button type="button" class="ghost mini" data-act="dl">İndir</button>
    `;
    row.querySelector('[data-act="dl"]').addEventListener("click", async () => {
      await chrome.runtime.sendMessage({ type: "DOWNLOAD", item, mode: "auto", quality: "auto" });
      await load();
    });
    listEl.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

load();
setInterval(load, 1500);
