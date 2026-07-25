/**
 * Ingest — cero LLM, cero red.
 *
 * Convierte lo que el usuario tenga a mano en el formato que el pipeline
 * entiende: el .txt que WhatsApp deja descargar con dos taps, el CSV de posts
 * que exporta cualquier herramienta de social, el CSV de reseñas, y la web.
 *
 * Regla dura: **la PII se borra en el momento de la extracción**. Los nombres
 * de los remitentes nunca llegan a estructurarse — solo sobrevive `conv_id` y
 * si el mensaje es del cliente o de la marca. Lo que no se guarda no se filtra.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { config } from "../../config/darwin.config";
import type { Conversation, IngestResult, PostMetric, Review } from "../schemas";
import { ContentFormat, Platform } from "../schemas";

/* ────────────────────────────── PII ────────────────────────────── */

const R = config.pii.replacement;

const PII_RULES: { re: RegExp; with: string }[] = [
  // email
  { re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/gi, with: R.email },
  // teléfono con indicativo internacional explícito
  { re: /\+\d[\d\s\-().]{7,}\d/g, with: R.phone },
  // celular colombiano: 3XX XXX XXXX, con o sin separadores
  { re: /\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, with: R.phone },
  // fijo con indicativo: (601) 234 5678
  { re: /\(\d{1,3}\)\s?\d{3}[\s.-]?\d{4}\b/g, with: R.phone },
  // documento: solo cuando viene rotulado (si no, se confunde con precios)
  { re: /\b(?:c\.?c\.?|c[ée]dula|documento|nit)\s*:?\s*[\d.,-]{6,15}\b/gi, with: R.id_number },
  // dirección: vía + número. Cortamos en la primera coma o fin de frase.
  {
    re: /\b(?:calle|cll?|carrera|cra|kr|kra|avenida|av|diagonal|dg|transversal|tv|manzana|mz)\s*\.?\s*\d+[\w\s#°\-.]{0,25}/gi,
    with: R.address,
  },
];

export interface RedactResult {
  text: string;
  count: number;
}

export function redact(input: string): RedactResult {
  let text = input;
  let count = 0;
  for (const rule of PII_RULES) {
    text = text.replace(rule.re, () => {
      count++;
      return rule.with;
    });
  }
  return { text, count };
}

/* ──────────────────────── WhatsApp .txt ──────────────────────── */

/** Marcas invisibles que WhatsApp mete en sus exports y rompen los regex. */
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;

/** `[12/3/25, 2:32:11 p. m.] Ana: hola`  (iOS) */
const IOS_LINE =
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?)\]\s*(.*)$/i;

/** `12/3/25, 14:32 - Ana: hola`  (Android) */
const ANDROID_LINE =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s?m\.?)?)\s+-\s+(.*)$/i;

/** Separador para meter varias conversaciones en un solo archivo. */
const CONV_SEPARATOR = /^={3,}\s*conv(?:ersaci[oó]n)?\s*[:# ]\s*(\S+)\s*={3,}$/i;

const SYSTEM_PHRASES = [
  "cifrados de extremo a extremo",
  "end-to-end encrypted",
  "multimedia omitido",
  "media omitted",
  "imagen omitida",
  "audio omitido",
  "video omitido",
  "sticker omitido",
  "gif omitido",
  "documento omitido",
  "se eliminó este mensaje",
  "eliminaste este mensaje",
  "this message was deleted",
  "cambió su número",
  "changed their phone number",
  "se unió usando",
  "creó el grupo",
  "se cambió el asunto",
  "llamada perdida",
  "missed voice call",
];

function isSystemText(t: string): boolean {
  const low = t.toLowerCase();
  return SYSTEM_PHRASES.some((p) => low.includes(p));
}

interface RawMsg {
  ts: string;
  sender: string | null;
  text: string;
}

/** Parte "Ana Pérez: hola" en remitente + texto. Null si no hay remitente. */
function splitSender(rest: string): { sender: string | null; text: string } {
  const idx = rest.indexOf(": ");
  const idxColon = rest.indexOf(":");
  const at = idx > -1 ? idx : idxColon;
  if (at < 1 || at > 60) return { sender: null, text: rest };
  const sender = rest.slice(0, at).trim();
  // Un remitente con salto de línea o muy largo no es un remitente.
  if (!sender || sender.includes("\n")) return { sender: null, text: rest };
  return { sender, text: rest.slice(at + 1).trimStart() };
}

function parseChatLines(raw: string): RawMsg[] {
  const lines = raw.replace(INVISIBLE, "").split(/\r?\n/);
  const msgs: RawMsg[] = [];

  for (const line of lines) {
    const m = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);
    if (m) {
      const [, date, time, rest] = m;
      const { sender, text } = splitSender(rest ?? "");
      msgs.push({ ts: `${date} ${time}`, sender, text });
    } else if (msgs.length > 0 && line.trim() !== "") {
      // Continuación de un mensaje multilínea.
      msgs[msgs.length - 1]!.text += "\n" + line;
    }
  }
  return msgs;
}

/**
 * Quién es la marca: el remitente que aparece en MÁS conversaciones distintas.
 * Empate → el que más mensajes escribió. En un chat de negocio esto acierta.
 */
function detectBrand(chats: RawMsg[][], override?: string): string | null {
  if (override) return override;
  const convCount = new Map<string, number>();
  const msgCount = new Map<string, number>();

  for (const chat of chats) {
    const seen = new Set<string>();
    for (const m of chat) {
      if (!m.sender) continue;
      msgCount.set(m.sender, (msgCount.get(m.sender) ?? 0) + 1);
      seen.add(m.sender);
    }
    for (const s of seen) convCount.set(s, (convCount.get(s) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestScore = [-1, -1];
  for (const [sender, convs] of convCount) {
    const score = [convs, msgCount.get(sender) ?? 0];
    if (score[0]! > bestScore[0]! || (score[0] === bestScore[0] && score[1]! > bestScore[1]!)) {
      best = sender;
      bestScore = score as [number, number];
    }
  }
  return best;
}

export interface ParsedChats {
  conversations: Conversation[];
  redactions: number;
  messages: number;
  brand: string | null;
}

/**
 * Acepta:
 *  - una carpeta de exports (cada .txt = una conversación) — lo que tiene un negocio real
 *  - un solo .txt con separadores `===== CONV <id> =====`
 *  - un solo .txt sin separadores (= una sola conversación)
 */
export function parseWhatsApp(path: string, brandName?: string): ParsedChats {
  const chats: { id: string; msgs: RawMsg[] }[] = [];

  if (existsSync(path) && statSync(path).isDirectory()) {
    for (const f of readdirSync(path).sort()) {
      if (extname(f).toLowerCase() !== ".txt") continue;
      chats.push({
        id: basename(f, extname(f)),
        msgs: parseChatLines(readFileSync(join(path, f), "utf8")),
      });
    }
  } else {
    const raw = readFileSync(path, "utf8").replace(INVISIBLE, "");
    const lines = raw.split(/\r?\n/);
    const hasSeparators = lines.some((l) => CONV_SEPARATOR.test(l.trim()));

    if (hasSeparators) {
      let currentId: string | null = null;
      let buffer: string[] = [];
      const flush = () => {
        if (currentId !== null) chats.push({ id: currentId, msgs: parseChatLines(buffer.join("\n")) });
        buffer = [];
      };
      for (const line of lines) {
        const sep = CONV_SEPARATOR.exec(line.trim());
        if (sep) {
          flush();
          currentId = sep[1]!;
        } else {
          buffer.push(line);
        }
      }
      flush();
    } else {
      chats.push({ id: basename(path, extname(path)), msgs: parseChatLines(raw) });
    }
  }

  const brand = detectBrand(
    chats.map((c) => c.msgs),
    brandName,
  );

  let redactions = 0;
  let messages = 0;
  const conversations: Conversation[] = [];

  for (const { id, msgs } of chats) {
    const out: Conversation["messages"] = [];
    for (const m of msgs) {
      const text = m.text.trim();
      if (!text) continue;
      messages++;

      const system = m.sender === null || isSystemText(text);
      // La PII se va aquí. El nombre del remitente no viaja: solo su rol.
      const { text: clean, count } = redact(text);
      redactions += count;

      out.push({
        ts: m.ts,
        from: system ? "system" : m.sender === brand ? "brand" : "customer",
        text: clean,
      });
    }
    if (out.length > 0) conversations.push({ conv_id: id, messages: out });
  }

  return { conversations, redactions, messages, brand };
}

/* ─────────────────────────────── CSV ─────────────────────────────── */

/** Parser CSV honesto: comillas, comas dentro de comillas, `""` escapado, CRLF. */
export function parseCSV(raw: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const text = raw.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);

  if (rows.length < 2) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

/** "1.234" / "1,234" / "12%" / "" → número. Nunca NaN. */
function num(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = v.replace(/[^\d.,-]/g, "").replace(/[.,](?=\d{3}\b)/g, "");
  const n = Number.parseFloat(cleaned.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Toma el primer campo que exista de una lista de alias. */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k]!;
  return "";
}

const FORMAT_ALIASES: Record<string, ContentFormat> = {
  reel: "reel",
  reels: "reel",
  video: "reel",
  "video corto": "reel",
  short: "reel",
  carousel: "carousel",
  carrusel: "carousel",
  album: "carousel",
  static: "static",
  estatico: "static",
  "estático": "static",
  imagen: "static",
  image: "static",
  foto: "static",
  photo: "static",
  post: "static",
  story: "story",
  stories: "story",
  historia: "story",
  ugc: "ugc_video",
  ugc_video: "ugc_video",
  "video ugc": "ugc_video",
  testimonial: "ugc_video",
  testimonio: "ugc_video",
};

function normFormat(v: string): ContentFormat {
  const key = v.trim().toLowerCase().replace(/\s+/g, " ");
  return FORMAT_ALIASES[key] ?? FORMAT_ALIASES[key.replace(/ /g, "_")] ?? "static";
}

function normPlatform(v: string): Platform {
  const key = v.trim().toLowerCase();
  if (key.startsWith("ig") || key.includes("insta")) return "instagram";
  if (key.includes("tik")) return "tiktok";
  if (key.startsWith("fb") || key.includes("face")) return "facebook";
  if (key.includes("mail")) return "email";
  if (key.includes("blog")) return "blog";
  if (key.includes("whats")) return "whatsapp";
  return "instagram";
}

export function parsePosts(raw: string): PostMetric[] {
  return parseCSV(raw).map((r, i) => ({
    post_id: pick(r, "post_id", "id", "permalink") || `post_${i + 1}`,
    platform: normPlatform(pick(r, "platform", "plataforma", "red")),
    format: normFormat(pick(r, "format", "formato", "type", "tipo", "media_type")),
    posted_at: pick(r, "posted_at", "fecha", "date", "publicado"),
    caption: pick(r, "caption", "texto", "copy", "descripcion", "descripción"),
    reach: num(pick(r, "reach", "alcance", "impressions", "impresiones", "views", "vistas")),
    likes: num(pick(r, "likes", "me_gusta", "reactions")),
    comments: num(pick(r, "comments", "comentarios")),
    saves: num(pick(r, "saves", "guardados", "saved")),
    shares: num(pick(r, "shares", "compartidos", "compartir")),
  }));
}

export function parseReviews(raw: string): Review[] {
  const out: Review[] = [];
  parseCSV(raw).forEach((r, i) => {
    const text = pick(r, "text", "review", "comentario", "opinion", "opinión", "body");
    if (!text) return;
    const rating = num(pick(r, "rating", "stars", "estrellas", "calificacion", "calificación"));
    out.push({
      review_id: pick(r, "review_id", "id") || `rev_${i + 1}`,
      rating: Math.min(5, Math.max(1, rating || 3)),
      text: redact(text).text,
      date: pick(r, "date", "fecha") || undefined,
    });
  });
  return out;
}

/* ──────────────────────────── la web ──────────────────────────── */

/** Una web colombiana viene llena de `&oacute;` y `&ntilde;`. Hay que decodificarlas. */
const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  iexcl: "¡", iquest: "¿", ordm: "º", ordf: "ª", deg: "°",
  hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  euro: "€", pound: "£", copy: "©", reg: "®", trade: "™",
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number.parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? m);
}

/** HTML local → texto plano. Sin red: el demo corre en avión. */
export function htmlToText(html: string, maxChars = 6000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|section|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

/* ─────────────────────────── orquestación ─────────────────────────── */

export interface IngestInput {
  /** carpeta de exports, o un .txt (con o sin separadores) */
  conversations?: string;
  posts?: string;
  reviews?: string;
  /** archivo .html/.txt local con el contenido de la web */
  site?: string;
  brandName?: string;
}

/** Cada fuente es opcional y falla sola: lo que no esté, no bloquea. */
export function ingest(input: IngestInput): IngestResult {
  let conversations: Conversation[] = [];
  let redactions = 0;
  let messages = 0;

  if (input.conversations && existsSync(input.conversations)) {
    const parsed = parseWhatsApp(input.conversations, input.brandName);
    conversations = parsed.conversations;
    redactions += parsed.redactions;
    messages = parsed.messages;
  }

  const posts =
    input.posts && existsSync(input.posts) ? parsePosts(readFileSync(input.posts, "utf8")) : [];

  const reviews =
    input.reviews && existsSync(input.reviews)
      ? parseReviews(readFileSync(input.reviews, "utf8"))
      : [];

  let site_text = "";
  if (input.site && existsSync(input.site)) {
    const raw = readFileSync(input.site, "utf8");
    site_text = /\.html?$/i.test(input.site) ? htmlToText(raw) : raw.slice(0, 6000);
  }

  const withCustomer = conversations.filter((c) =>
    c.messages.some((m) => m.from === "customer"),
  ).length;

  return {
    conversations,
    posts,
    reviews,
    site_text,
    stats: {
      conversations_total: conversations.length,
      conversations_with_customer_msg: withCustomer,
      messages_total: messages,
      posts_total: posts.length,
      reviews_total: reviews.length,
      pii_redactions: redactions,
    },
  };
}
