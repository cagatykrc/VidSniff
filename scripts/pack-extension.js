import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "extension");
const out = path.join(root, "release");
const appData = path.join(process.env.LOCALAPPDATA || root, "VidSniff");

const SHARED = [
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.js",
  "popup.css",
  "lib/media.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

async function buildVariant(name, manifestFile) {
  const dir = path.join(out, name);
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });

  await fsp.copyFile(path.join(src, manifestFile), path.join(dir, "manifest.json"));
  for (const rel of SHARED) {
    const to = path.join(dir, rel);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.copyFile(path.join(src, rel), to);
  }
  return dir;
}

function zipDir(dir, zipPath) {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  const ps = `Compress-Archive -Path '${dir}\\*' -DestinationPath '${zipPath}' -Force`;
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: "inherit" });
}

await fsp.mkdir(out, { recursive: true });

const ff = await buildVariant("extension-firefox", "manifest.json");
const ch = await buildVariant("extension-chrome", "manifest.chrome.json");

zipDir(ff, path.join(out, "VidSniff-Firefox-Zen.zip"));
zipDir(ch, path.join(out, "VidSniff-Chrome-Edge.zip"));

// Stabil kurulum yolu (Chrome kalıcı unpacked için)
const stableChrome = path.join(appData, "extension-chrome");
await fsp.rm(stableChrome, { recursive: true, force: true });
await fsp.cp(ch, stableChrome, { recursive: true });

const stableFf = path.join(appData, "extension-firefox");
await fsp.rm(stableFf, { recursive: true, force: true });
await fsp.cp(ff, stableFf, { recursive: true });

await fsp.writeFile(
  path.join(out, "KURULUM.txt"),
  `VidSniff eklenti kurulumu
========================

1) Önce masaüstü uygulamasını çalıştır (VidSniff / baslat.bat)
   → Arka plan indirme servisi otomatik açılır.

2) Chrome / Edge / Brave (ÖNERİLEN — kalıcı)
   - chrome://extensions  veya  edge://extensions
   - Geliştirici modu: AÇ
   - "Paketlenmemiş öğe yükle"
   - Klasör seç:
     ${stableChrome}
   - Bir kez yüklemen yeterli; PC yeniden açılınca da kalır.
   - Güncelleme sonrası aynı sayfada "Yenile" / Reload bas.

3) Firefox / Zen
   - Geçici (her açılışta): about:debugging → This Firefox → Load Temporary Add-on
     → ${path.join(stableFf, "manifest.json")}
   - Kalıcı için Mozilla imzası gerekir (AMO) veya Firefox Developer Edition'da
     xpinstall.signatures.required = false + XPI kurulum.
   - Zen'de imzasız kalıcı kurulum çoğu zaman engellenir.
   - Bu yüzden günlük kullanımda Chrome/Edge önerilir.

Zip dosyaları:
- VidSniff-Chrome-Edge.zip
- VidSniff-Firefox-Zen.zip
`,
  "utf8"
);

console.log("OK");
console.log(" release/VidSniff-Chrome-Edge.zip");
console.log(" release/VidSniff-Firefox-Zen.zip");
console.log(" stabil Chrome:", stableChrome);
console.log(" stabil Firefox:", stableFf);
