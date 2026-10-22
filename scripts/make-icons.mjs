// Génère les icônes PNG de la PWA (vinyle + étiquette ambre), sans dépendance externe.
// Usage : npm run icons
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // anticrénelage simple : 4 échantillons par pixel
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) { const p = pixel((x + dx) / size, (y + dy) / size); r += p[0]; g += p[1]; b += p[2]; a += p[3]; }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r / 4; raw[o + 1] = g / 4; raw[o + 2] = b / 4; raw[o + 3] = a / 4;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const BG = [14, 15, 18, 255], AMBER = [245, 180, 60, 255];
// pad = marge autour du disque (plus grande pour l'icône "maskable")
const vinyl = pad => (u, v) => {
  const d = Math.hypot(u - .5, v - .5) / (.5 - pad);
  if (d > 1) return BG;
  if (d < .055) return BG;                       // trou central
  if (d < .34) return AMBER;                     // étiquette
  if (d < .37) return [17, 17, 17, 255];
  const groove = Math.sin(d * 140) > 0 ? 32 : 22; // sillons
  const ang = Math.atan2(v - .5, u - .5);
  const shine = Math.max(0, Math.cos(ang * 2 - .6)) * 18;
  const c = groove + shine;
  return [c, c, c + 4, 255];
};

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", png(192, vinyl(.04)));
writeFileSync("public/icons/icon-512.png", png(512, vinyl(.04)));
writeFileSync("public/icons/maskable-512.png", png(512, vinyl(.12)));
writeFileSync("public/icons/apple-touch-icon.png", png(180, vinyl(.06)));
console.log("Icônes écrites dans public/icons/");
