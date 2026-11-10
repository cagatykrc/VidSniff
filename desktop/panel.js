const listEl = document.getElementById("list");
const API = window.vidsniff?.api || "http://127.0.0.1:17890";

/** @type {Record<string, string>} */
let S = {};

document.getElementById("openDir").addEventListener("click", () => {
  window.vidsniff?.openDownloads?.();
});
document.getElementById("openSetup")?.addEventListener("click", () => {
  window.vidsniff?.openSetup?.();
});
document.getElementById("openSettings")?.addEventListener("click", () => {
  window.vidsniff?.openSettings?.();
});

function applyStatic() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key && S[key]) el.innerHTML = S[key];
  });
}

async function refreshI18n() {
  try {
    const data = await window.vidsniff?.getI18n?.();
    if (data?.strings) {
      S = data.strings;
      document.documentElement.lang = data.lang || "en";
      applyStatic();
      await load();
    }
  } catch {
    /* ignore */
  }
}

function basename(p) {
  if (!p) return S.panelFile || "file";
  return String(p).split(/[/\\]/).pop();
}

async function load() {
  let jobs = [];
  try {
    const res = await fetch(`${API}/jobs`);
    const data = await res.json();
    jobs = data.jobs || [];
  } catch {
    try {
      jobs = (await window.vidsniff?.listJobs?.()) || [];
    } catch {
      jobs = [];
    }
  }
  render(jobs);
}

function render(jobs) {
  if (!jobs.length) {
    listEl.innerHTML = `<div class="empty">${S.panelEmpty || ""}</div>`;
    return;
  }

  listEl.innerHTML = "";
  for (const job of jobs) {
    const el = document.createElement("article");
    el.className = "job";
    const pct = Math.round(job.progress || 0);
    el.innerHTML = `
      <div class="job-top">
        <div class="name" title="${esc(job.path || job.url)}">${esc(basename(job.path) || job.id)}</div>
        <span class="badge ${job.status}">${esc(job.status)}</span>
      </div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <div class="meta">
        <span>${pct}%${job.quality && job.quality !== "auto" ? ` · ${esc(job.quality)}` : " · auto"}</span>
        <span></span>
      </div>
      ${job.error ? `<div class="err">${esc(job.error)}</div>` : ""}
    `;
    if (job.status === "done" && job.path) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = S.panelShow || "Show";
      btn.addEventListener("click", () => window.vidsniff?.showInFolder?.(job.path));
      el.querySelector(".meta span:last-child").appendChild(btn);
    }
    listEl.appendChild(el);
  }
}

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

refreshI18n();
window.vidsniff?.onLangChanged?.(() => refreshI18n());
setInterval(load, 1000);
