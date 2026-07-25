#!/usr/bin/env node
/**
 * Genera `project-logo.png` — la marca cuadrada de DARWIN.
 *
 * Se dibuja pixel a pixel en vez de exportar un SVG porque esta máquina no
 * tiene rasterizador (ni rsvg-convert, ni ImageMagick, ni sharp) y el proyecto
 * no instala dependencias para una sola imagen. Node trae `zlib`, que es lo
 * único que hace falta para escribir un PNG a mano.
 *
 * La marca es la del wordmark: la D en casi-blanco y la flecha verde
 * atravesándola. La flecha lleva un contorno del color del fondo para que al
 * cruzar la letra se lea el corte y no una mancha — a 64px en una galería de
 * proyectos, eso es la diferencia entre un logo y un borrón.
 *
 *   node scripts/make-logo.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const N = Number(process.env.LOGO_N ?? 512); // lado final
const SS = 4; // supermuestreo por eje: 16 muestras por pixel

/* La paleta del war room. */
const BG = [0x0b, 0x0c, 0x10];
const INK = [0xf1, 0xf3, 0xf5];
const GREEN = [0x6f, 0xcf, 0x87];

/* ── geometría ───────────────────────────────────────────────────────────
 * Todo en coordenadas del lienzo de 512. Las formas se definen como campos
 * de distancia con signo: negativo = adentro. Así el antialias sale de
 * promediar muestras y no hay que trazar contornos. */

const K = N / 512; // la geometría se escribe en coordenadas de 512
const TILE_R = 110 * K; // radio del cuadrado redondeado

// La D: tronco recto a la izquierda + panza semicircular a la derecha.
const D_TOP = 132 * K, D_BOT = 380 * K, D_MID = (D_TOP + D_BOT) / 2;
const D_LEFT = 144 * K, D_SPINE = 244 * K, D_R = 124 * K, D_W = 46 * K;

/* La flecha: cápsula horizontal + punta triangular, sobre la línea media.
 *
 * Arranca DENTRO del ojo de la D, no a la izquierda de la letra. Cruzarla
 * entera cortaba el tronco en dos y la D dejaba de leerse como letra: a 64px
 * quedaban dos arcos sueltos. Saliendo desde adentro, el tronco queda intacto
 * y la flecha se lee como algo que escapa hacia adelante. */
const A_Y = D_MID, A_X0 = 206 * K, A_X1 = 356 * K, A_HALF = 13 * K;
const HEAD = [[344 * K, 214 * K], [428 * K, A_Y], [344 * K, 298 * K]];
const HALO = 9 * K; // contorno del color del fondo alrededor de la flecha

const sdBox = (px, py, x0, y0, x1, y1) => {
  const dx = Math.max(x0 - px, px - x1);
  const dy = Math.max(y0 - py, py - y1);
  const out = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return out + Math.min(Math.max(dx, dy), 0);
};

const sdDisc = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r;

/** Cápsula: distancia al segmento menos el radio. */
function sdSeg(px, py, ax, ay, bx, by, r) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t) - r;
}

/** Triángulo por mitad de plano: exacto para uno convexo. */
function sdTri(px, py, [a, b, c]) {
  let d = -Infinity;
  const edges = [[a, b, c], [b, c, a], [c, a, b]];
  for (const [p0, p1, opp] of edges) {
    const nx = p1[1] - p0[1], ny = p0[0] - p1[0];
    const len = Math.hypot(nx, ny);
    const sign = Math.sign((opp[0] - p0[0]) * nx + (opp[1] - p0[1]) * ny);
    d = Math.max(d, -sign * ((px - p0[0]) * nx + (py - p0[1]) * ny) / len);
  }
  return d;
}

const sdTile = (px, py) => sdBox(px, py, TILE_R, TILE_R, N - TILE_R, N - TILE_R) - TILE_R;

function sdD(px, py) {
  // Las esquinas del tronco van redondeadas: la baldosa lo está, y una caja
  // cruda al lado se ve como un error de trazado, no como una letra.
  const r = 14 * K, ri = 9 * K;
  const outer = Math.min(
    sdBox(px, py, D_LEFT + r, D_TOP + r, D_SPINE, D_BOT - r) - r,
    sdDisc(px, py, D_SPINE, D_MID, D_R),
  );
  const inner = Math.min(
    sdBox(px, py, D_LEFT + D_W + ri, D_TOP + D_W + ri, D_SPINE, D_BOT - D_W - ri) - ri,
    sdDisc(px, py, D_SPINE, D_MID, D_R - D_W),
  );
  return Math.max(outer, -inner); // anillo: dentro del contorno y fuera del ojo
}

const sdArrow = (px, py) =>
  Math.min(sdSeg(px, py, A_X0, A_Y, A_X1, A_Y, A_HALF), sdTri(px, py, HEAD));

/* ── pintado ─────────────────────────────────────────────────────────── */

/** Color de UNA muestra. El orden es el orden de pintado. */
function sample(x, y) {
  if (sdTile(x, y) > 0) return null; // fuera de la baldosa: transparente
  let c = BG;
  if (sdD(x, y) <= 0) c = INK;
  if (sdArrow(x, y) - HALO <= 0) c = BG; // el corte alrededor de la flecha
  if (sdArrow(x, y) <= 0) c = GREEN;
  return c;
}

const rgba = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (!c) continue;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
    }
    const n = SS * SS;
    const i = (y * N + x) * 4;
    // Premultiplicado inverso: el color promedia solo sobre las muestras
    // opacas, si no el borde de la baldosa se oscurece contra el fondo.
    const cover = a / 255;
    rgba[i] = cover ? Math.round(r / cover) : 0;
    rgba[i + 1] = cover ? Math.round(g / cover) : 0;
    rgba[i + 2] = cover ? Math.round(b / cover) : 0;
    rgba[i + 3] = Math.round(a / n);
  }
}

/* ── PNG a mano ──────────────────────────────────────────────────────── */

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
// [10..12] = deflate, filtro adaptativo, sin entrelazar (ya son 0)

// Una fila = byte de filtro (0 = ninguno) + los pixeles.
const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  rgba.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = new URL(process.env.LOGO_OUT ?? "../project-logo.png", import.meta.url);
writeFileSync(out, png);
console.log(`project-logo.png · ${N}×${N} · ${(png.length / 1024).toFixed(1)} KB`);
