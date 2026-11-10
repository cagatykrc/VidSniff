import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "extension", "icons");
fs.mkdirSync(dir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;
      // yuvarlak turuncu arka plan
      const cx = nx - 0.5;
      const cy = ny - 0.5;
      const inCircle = cx * cx + cy * cy <= 0.48 * 0.48;
      let r = 18, g = 20, b = 26;
      if (inCircle) {
        r = 232; g = 93; b = 4;
        // play üçgeni
        const px = (nx - 0.38) / 0.42;
        const py = (ny - 0.28) / 0.44;
        if (px >= 0 && px <= 1 && py >= 0 && py <= 1) {
          const upper = py >= px * 0.5;
          const lower = py <= 1 - px * 0.5;
          if (upper && lower) {
            r = 255; g = 255; b = 255;
          }
        }
      }
      const i = 1 + x * 3;
      row[i] = r;
      row[i + 1] = g;
      row[i + 2] = b;
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

for (const s of [16, 32, 48, 128, 256, 512]) {
  fs.writeFileSync(path.join(dir, `icon${s}.png`), png(s));
}
console.log("icons ready → extension/icons");
