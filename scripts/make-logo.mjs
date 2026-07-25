#!/usr/bin/env node
/**
 * Genera `project-logo.png` — el cuadrado que Build Night muestra en la galería.
 *
 * Es el wordmark de DARWIN sobre blanco: letras en azul casi negro y el dardo
 * verde entre la A y la R. No se dibuja de cero: se recolorea y se reescala el
 * `public/assets/darwin-wordmark.png` que ya usa la app, así que la marca del
 * repo y la del producto no pueden divergir.
 *
 * El PNG se decodifica y se escribe a mano porque esta máquina no tiene
 * rasterizador ni librería de imágenes (ni rsvg-convert, ni ImageMagick, ni
 * sharp) y no vale instalar una dependencia para una imagen. `zlib` de Node
 * alcanza.
 *
 *   node scripts/make-logo.mjs
 *   LOGO_N=64 LOGO_OUT=/tmp/prueba.png node scripts/make-logo.mjs   # verlo chico
 */
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const N = Number(process.env.LOGO_N ?? 512);
const SRC = new URL("../public/assets/darwin-wordmark.png", import.meta.url);

/* El #6fcf87 del war room está calibrado para fondo oscuro; sobre blanco se
 * lava y el dardo desaparece a tamaño de galería. Sobre papel va oscurecido. */
const PAPER = [0xff, 0xff, 0xff];
const NAVY = [0x14, 0x22, 0x30];
const GREEN = [0x1e, 0x7a, 0x3a];

/** Ancho que ocupa el wordmark dentro del cuadrado. */
const FILL = 0.84;

/* ── decodificar el PNG de origen ────────────────────────────────────── */

function decodePng(buf) {
  let w = 0, h = 0, colorType = 0, bitDepth = 0;
  const idat = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error("PNG entrelazado: no soportado");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`se esperaba RGBA de 8 bits, llegó colorType=${colorType} bits=${bitDepth}`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);

  // Deshacer los filtros por línea (PNG §9): cada línea trae el suyo adelante.
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0; // izquierda
      const b = y > 0 ? px[(y - 1) * stride + x] : 0; // arriba
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0; // diagonal
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      px[y * stride + x] = v & 0xff;
    }
  }
  return { w, h, px };
}

const src = decodePng(readFileSync(SRC));

/* ── recolorear ──────────────────────────────────────────────────────── */

/** El dardo es lo único verde del origen; el resto son las letras. */
const isGreen = (r, g, b) => g > r + 18 && g > b + 18;

const tinted = Buffer.alloc(src.w * src.h * 4);
for (let i = 0; i < src.w * src.h; i++) {
  const c = isGreen(src.px[i * 4], src.px[i * 4 + 1], src.px[i * 4 + 2]) ? GREEN : NAVY;
  tinted[i * 4] = c[0];
  tinted[i * 4 + 1] = c[1];
  tinted[i * 4 + 2] = c[2];
  tinted[i * 4 + 3] = src.px[i * 4 + 3];
}

/* ── componer sobre el cuadrado blanco ───────────────────────────────── */

const destW = Math.round(N * FILL);
const destH = Math.max(1, Math.round((destW * src.h) / src.w));
const x0 = Math.round((N - destW) / 2);
const y0 = Math.round((N - destH) / 2);

const canvas = Buffer.alloc(N * N * 4);
for (let i = 0; i < N * N; i++) {
  canvas[i * 4] = PAPER[0];
  canvas[i * 4 + 1] = PAPER[1];
  canvas[i * 4 + 2] = PAPER[2];
  canvas[i * 4 + 3] = 255;
}

/* Reducción por promedio de área: el wordmark baja de 1621px a ~430 y un
 * muestreo puntual dejaría las astas de las letras entrecortadas. */
for (let y = 0; y < destH; y++) {
  const sy0 = (y * src.h) / destH, sy1 = ((y + 1) * src.h) / destH;
  for (let x = 0; x < destW; x++) {
    const sx0 = (x * src.w) / destW, sx1 = ((x + 1) * src.w) / destW;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
      for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
        const i = (sy * src.w + sx) * 4;
        const al = tinted[i + 3] / 255;
        r += tinted[i] * al;
        g += tinted[i + 1] * al;
        b += tinted[i + 2] * al;
        a += al;
        n++;
      }
    }
    if (!n || a <= 0) continue;
    const cov = a / n;
    // El color promedia solo sobre lo que cubre; si no, los bordes se aclaran.
    const d = ((y0 + y) * N + (x0 + x)) * 4;
    canvas[d] = Math.round(PAPER[0] * (1 - cov) + (r / a) * cov);
    canvas[d + 1] = Math.round(PAPER[1] * (1 - cov) + (g / a) * cov);
    canvas[d + 2] = Math.round(PAPER[2] * (1 - cov) + (b / a) * cov);
  }
}

/* ── escribir el PNG ─────────────────────────────────────────────────── */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; // bits por canal
ihdr[9] = 6; // RGBA

const rows = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
  rows[y * (N * 4 + 1)] = 0; // sin filtro
  canvas.copy(rows, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(rows, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = new URL(process.env.LOGO_OUT ?? "../project-logo.png", import.meta.url);
writeFileSync(out, png);
console.log(`${out.pathname.split("/").pop()} · ${N}×${N} · ${(png.length / 1024).toFixed(1)} KB`);
