import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "extension", "icons");
const source = path.join(dir, "icon-source.png");
fs.mkdirSync(dir, { recursive: true });

if (!fs.existsSync(source)) {
  console.error("Missing extension/icons/icon-source.png");
  process.exit(1);
}

fs.copyFileSync(source, path.join(dir, "logo.png"));
fs.copyFileSync(source, path.join(root, "desktop", "logo.png"));

const sizes = [16, 32, 48, 128, 256, 512];
const ps = `
Add-Type -AssemblyName System.Drawing
$src = ${JSON.stringify(source)}
$dir = ${JSON.stringify(dir)}
foreach ($s in @(${sizes.join(",")})) {
  $img = [System.Drawing.Image]::FromFile($src)
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $s, $s)
  $out = Join-Path $dir ("icon{0}.png" -f $s)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}
`;

const r = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
  { encoding: "utf8" }
);
if (r.status !== 0) {
  console.error(r.stderr || r.stdout || "icon resize failed");
  process.exit(1);
}
console.log("icons ready → extension/icons (+ desktop/logo.png)");
