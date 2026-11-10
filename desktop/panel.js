const listEl = document.getElementById("list");
const API = window.vidsniff?.api || "http://127.0.0.1:17890";

document.getElementById("openDir").addEventListener("click", () => {
  window.vidsniff?.openDownloads?.();
});

document.getElementById("openSetup")?.addEventListener("click", () => {
  window.vidsniff?.openSetup?.();
});

document.getElementById("openSettings")?.addEventListener("click", () => {
  window.vidsniff?.openSettings?.();
});

function basename(p) {
  if (!p) return "dosya";
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
    listEl.innerHTML = `<div class="empty">Henüz indirme yok.<br/>Chrome eklentisinden video indir.</div>`;
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
      btn.textContent = "Göster";
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

load();
setInterval(load, 1000);
