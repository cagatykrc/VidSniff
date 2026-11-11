import { t, syncLangFromService } from "./lib/i18n.js";
import { formatBytes, ensureMp4Name } from "./lib/media.js";

const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const jobsEl = document.getElementById("jobs");
const primaryEl = document.getElementById("primary");
const dlPrimaryBtn = document.getElementById("dlPrimary");
const primaryMsg = document.getElementById("primaryMsg");
const qualityRow = document.getElementById("qualityRow");
const qualitySelect = document.getElementById("qualitySelect");

/** @type {object[]} */
let serverJobs = [];
/** @type {object | null} */
let primaryItem = null;
/** @type {object[]} */
let qualities = [];
let probeUrl = "";

document.getElementById("dlPrimary").addEventListener("click", () => downloadPrimary());

function applyStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
}

function prettyName(item) {
  if (!item) return t("video");
  const fn = item.displayName || item.filename || item.pageTitle || "video";
  if (
    /master\.(txt|m3u8)/i.test(item.url || "") ||
    item.hlsKind === "master" ||
    /\/hls\//i.test(item.url || "") ||
    item.type === "hls"
  ) {
    return ensureMp4Name(fn);
  }
  return fn;
}

function basename(p) {
  return String(p || "").split(/[/\\]/).pop() || "file";
}

function selectedQuality() {
  const id = qualitySelect?.value || "auto";
  const q = qualities.find((x) => x.id === id);
  return { id, estimatedBytes: q?.estimatedBytes || 0, label: q?.label || id };
}

async function load() {
  await syncLangFromService();
  applyStatic();

  const jobsRes = await chrome.runtime.sendMessage({ type: "LIST_JOBS" });
  serverJobs = jobsRes?.jobs || [];
  renderJobsBar();

  const prim = await chrome.runtime.sendMessage({ type: "GET_PRIMARY" });
  primaryItem = prim?.item || null;
  renderPrimary(!!(prim?.downloaderOnline ?? jobsRes?.downloaderOnline));
  if (primaryItem) await ensureProbe(primaryItem);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const res = await chrome.runtime.sendMessage({ type: "GET_ITEMS", tabId: tab?.id ?? -1 });
  renderList((res?.items || []).filter((i) => !isNoise(i)));
}

function isNoise(it) {
  const u = `${it.url || ""} ${it.filename || ""}`;
  return /site\.webm|sublist_aud|\/aud\d|sprite|thumbnail/i.test(u);
}

async function ensureProbe(item) {
  if (!item?.url) return;
  const isHls =
    item.type === "hls" ||
    /\/hls\//i.test(item.url) ||
    /\.m3u8|master\.txt/i.test(item.url);
  if (!isHls) {
    qualityRow.hidden = true;
    qualities = [];
    return;
  }
  if (probeUrl === item.url && qualities.length) {
    qualityRow.hidden = false;
    return;
  }
  qualityRow.hidden = false;
  qualitySelect.innerHTML = `<option value="auto">${t("probing")}</option>`;
  const headers = item.requestHeaders || {};
  const probe = await chrome.runtime.sendMessage({
    type: "PROBE",
    url: item.url,
    headers,
  });
  if (!probe?.ok || !probe.qualities?.length) {
    qualities = [{ id: "auto", label: t("qualityAuto"), estimatedBytes: 0 }];
  } else {
    qualities = [
      {
        id: "auto",
        label: t("qualityAuto"),
        estimatedBytes: probe.qualities[0]?.estimatedBytes || 0,
      },
      ...probe.qualities,
    ];
    probeUrl = item.url;
  }
  qualitySelect.innerHTML = qualities
    .map((q) => `<option value="${escapeAttr(q.id)}">${escapeHtml(q.label)}</option>`)
    .join("");
  renderPrimaryMeta();
}

function renderPrimaryMeta() {
  if (!primaryItem) return;
  const sel = selectedQuality();
  const size =
    sel.estimatedBytes > 0
      ? t("sizeApprox", { size: formatBytes(sel.estimatedBytes) })
      : primaryItem.size > 0
        ? formatBytes(primaryItem.size)
        : null;
  primaryEl.querySelector(".p-meta").textContent = [
    "MP4",
    primaryItem.hlsKind === "master" || primaryItem.type === "hls" ? "HLS→MP4" : primaryItem.type,
    size,
  ]
    .filter(Boolean)
    .join(" · ");
}

qualitySelect?.addEventListener("change", () => renderPrimaryMeta());

function renderPrimary(online) {
  statusEl.textContent = online ? t("serviceOn") : t("serviceOff");
  statusEl.className = `status ${online ? "online" : "offline"}`;

  if (!primaryItem) {
    primaryEl.className = "primary empty";
    primaryEl.querySelector(".p-title").textContent = t("emptyPrimary");
    primaryEl.querySelector(".p-meta").textContent = t("emptyPrimaryMeta");
    dlPrimaryBtn.disabled = true;
    dlPrimaryBtn.textContent = t("mp4Download");
    qualityRow.hidden = true;
    return;
  }

  const job = serverJobs.find((j) => j.url === primaryItem.url);
  const name = prettyName(primaryItem);
  primaryEl.className = "primary";
  primaryEl.querySelector(".p-title").textContent = name;
  renderPrimaryMeta();

  dlPrimaryBtn.disabled = job?.status === "running" || !online;
  dlPrimaryBtn.textContent =
    job?.status === "running" ? t("downloadingEllipsis") : t("mp4Download");

  if (job?.status === "done") {
    primaryMsg.hidden = false;
    primaryMsg.className = "msg ok";
    const sz = job.bytesDone ? ` · ${formatBytes(job.bytesDone)}` : "";
    primaryMsg.textContent = t("complete", { name: basename(job.path) }) + sz;
  } else if (job?.status === "error") {
    primaryMsg.hidden = false;
    primaryMsg.className = "msg err";
    primaryMsg.textContent = job.error || t("error");
  } else if (job?.status === "running") {
    primaryMsg.hidden = false;
    primaryMsg.className = "msg";
    const est = job.estimatedBytes ? ` / ~${formatBytes(job.estimatedBytes)}` : "";
    primaryMsg.textContent = `${t("downloadingEllipsis")} %${Math.round(job.progress || 0)}${est}`;
  } else {
    primaryMsg.hidden = true;
  }
}

async function downloadPrimary() {
  if (!primaryItem) return;
  const sel = selectedQuality();
  dlPrimaryBtn.disabled = true;
  dlPrimaryBtn.textContent = "...";
  primaryMsg.hidden = false;
  primaryMsg.className = "msg";
  primaryMsg.textContent = t("startMp4");
  const result = await chrome.runtime.sendMessage({
    type: "DOWNLOAD",
    item: { ...primaryItem, estimatedBytes: sel.estimatedBytes },
    mode: "auto",
    quality: sel.id || "auto",
    estimatedBytes: sel.estimatedBytes,
  });
  if (!result?.ok) {
    primaryMsg.className = "msg err";
    primaryMsg.textContent = result?.error || t("failed");
    dlPrimaryBtn.disabled = false;
    dlPrimaryBtn.textContent = t("mp4Download");
  }
  await load();
}

function renderJobsBar() {
  if (!jobsEl) return;
  const recent = [...serverJobs]
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .slice(0, 6);
  if (!recent.length) {
    jobsEl.hidden = true;
    jobsEl.innerHTML = "";
    return;
  }
  jobsEl.hidden = false;
  jobsEl.innerHTML = `
    <div class="jobs-head">
      <div class="jobs-title">${escapeHtml(t("bgJobs"))}</div>
      <button type="button" class="ghost mini" id="openFolder">${escapeHtml(t("openFolder"))}</button>
    </div>
    ${recent
      .map((job) => {
        const pct = Math.round(job.progress || 0);
        const cls = job.status === "done" ? "ok" : job.status === "error" ? "err" : "run";
        const sizeBit =
          job.bytesDone || job.estimatedBytes
            ? ` · ${formatBytes(job.bytesDone || job.estimatedBytes)}`
            : "";
        const label =
          job.status === "running"
            ? `%${pct}${sizeBit}`
            : job.status === "done"
              ? `${t("jobDone")}${sizeBit}`
              : t("jobError");
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
    listEl.innerHTML = `<div class="empty-mini">${escapeHtml(t("noOther"))}</div>`;
    return;
  }
  listEl.innerHTML = "";
  for (const item of items.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "mini-row";
    const size = item.size > 1024 ? ` · ${formatBytes(item.size)}` : "";
    row.innerHTML = `
      <div class="mini-name" title="${escapeAttr(item.url)}">${escapeHtml(prettyName(item))}${escapeHtml(size)}</div>
      <button type="button" class="ghost mini" data-act="dl">${escapeHtml(t("download"))}</button>
    `;
    row.querySelector('[data-act="dl"]').addEventListener("click", async () => {
      await chrome.runtime.sendMessage({
        type: "DOWNLOAD",
        item,
        mode: "auto",
        quality: "auto",
      });
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
setInterval(load, 2000);
