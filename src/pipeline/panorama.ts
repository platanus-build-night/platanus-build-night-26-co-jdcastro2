/**
 * Panorama — qué vende la marca y qué formato le rinde.
 *
 * Diseño: lo que se puede CALCULAR no se le pregunta al modelo. Las métricas de
 * posts.csv se agregan aquí, con aritmética, y el modelo solo interpreta. Un
 * "reel 3.1× el carrusel" salido de una suma es un dato; salido de un LLM es
 * una alucinación con formato de dato.
 *
 * Ninguna fuente es requisito (invariante #3): cada una que falta registra su
 * coverage[].status y el pipeline sigue. Con solo la web y las conversaciones
 * DARWIN entrega estrategia completa.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { config } from "../../config/darwin.config";
import { VOICE, ask } from "../agent";
import { bus } from "../bus";
import type { PanoramaFn, RunContext } from "../contract";
import {
  BrandBrief,
  type BrandResearch,
  type ContentFormat,
  type CoverageEntry,
  FormatInsight,
  type OwnContentStats,
  type PostMetric,
} from "../schemas";

/* ─────────────────── benchmarks de categoría ─────────────────── */

interface BenchmarkFormat {
  platform: string;
  format: string;
  claim: string;
  recommendation: string;
  strength: number;
  source: string;
}
interface BenchmarkFile {
  verticals: Record<string, { aliases: string[]; formats: BenchmarkFormat[] }>;
}

function loadBenchmarks(vertical: string): { key: string; formats: BenchmarkFormat[] } {
  try {
    const file = JSON.parse(
      readFileSync("data/category-benchmarks.json", "utf8"),
    ) as BenchmarkFile;
    const needle = vertical.toLowerCase();
    for (const [key, v] of Object.entries(file.verticals)) {
      if (key === "general") continue;
      if (key === needle || v.aliases.some((a) => needle.includes(a.toLowerCase()))) {
        return { key, formats: v.formats };
      }
    }
    return { key: "general", formats: file.verticals.general?.formats ?? [] };
  } catch {
    return { key: "general", formats: [] };
  }
}

/* ─────────────────── métricas propias: pura aritmética ─────────────────── */

/**
 * Agrega posts.csv por formato. `index_vs_mean` es el número que decide el
 * calendario, así que se calcula, no se opina: reach promedio del formato
 * dividido por el reach promedio de la marca.
 */
function aggregate(posts: PostMetric[]): OwnContentStats | undefined {
  if (posts.length < 4) return undefined;

  const groups = new Map<ContentFormat, PostMetric[]>();
  for (const p of posts) {
    const arr = groups.get(p.format) ?? [];
    arr.push(p);
    groups.set(p.format, arr);
  }

  const mean = posts.reduce((s, p) => s + p.reach, 0) / posts.length || 1;
  const by_format = [...groups.entries()]
    .map(([format, rows]) => {
      const avg_reach = rows.reduce((s, r) => s + r.reach, 0) / rows.length;
      const eng =
        rows.reduce((s, r) => s + (r.reach > 0 ? (r.likes + r.comments) / r.reach : 0), 0) /
        rows.length;
      return {
        format,
        n: rows.length,
        avg_reach: Math.round(avg_reach),
        avg_engagement_rate: Number(eng.toFixed(4)),
        index_vs_mean: Number((avg_reach / mean).toFixed(2)),
      };
    })
    .sort((a, b) => b.index_vs_mean - a.index_vs_mean);

  const ALL: ContentFormat[] = ["reel", "carousel", "static", "story", "ugc_video"];
  return {
    posts_analyzed: posts.length,
    by_format,
    // Solo se corona un ganador si hay muestra suficiente para no leer ruido.
    winner_format: by_format[0] && by_format[0].n >= 3 ? by_format[0].format : undefined,
    missing_formats: ALL.filter((f) => !groups.has(f)),
  };
}

/* ─────────────────────────── el agente ─────────────────────────── */

const BriefOut = z.object({ brand_brief: BrandBrief });
const FormatsOut = z.object({ formats_ranked: z.array(FormatInsight).min(2).max(6) });

export const panorama: PanoramaFn = async (ctx: RunContext) => {
  const site = ctx.data.site_text.trim();
  const coverage: CoverageEntry[] = [];

  /* ── 1. la marca, desde el texto de la web ── */
  bus.say("panorama", "leyendo la web para entender qué vende exactamente");
  if (site) {
    bus.show("panorama", "web", `${site.length.toLocaleString("es-CO")} caracteres leídos`);
    coverage.push({ source: "web", status: "ok", note: `${site.length} caracteres` });
  } else {
    bus.say("panorama", "no hay texto de la web — deduzco la marca de las conversaciones");
    coverage.push({ source: "web", status: "skipped", note: "no se entregó contenido del sitio" });
  }

  const fallbackSample = ctx.data.conversations
    .flatMap((c) => c.messages.filter((m) => m.from === "brand").map((m) => m.text))
    .slice(0, 40)
    .join("\n");

  const { brand_brief } = await ask("panorama", {
    system: `${VOICE}

Eres el Panorama. Tu trabajo es entender QUÉ VENDE esta marca, sin adornarlo.

- "products": máximo 6, los que realmente aparecen. Nombres como los usa la marca.
- "vertical": la categoría en dos o tres palabras ("moda infantil", "café de especialidad").
- "tone": cómo habla la marca HOY, no como debería hablar.
- "audience": quién compra, con la especificidad que el material permita. Si no
  hay evidencia de edad o género, no los inventes.`,
    user: `Marca: ${ctx.brand.name}
URL: ${ctx.brand.url || "(no se entregó)"}

${site ? `CONTENIDO DE LA WEB:\n${site.slice(0, 14000)}` : `NO HAY WEB. Estos son mensajes que la marca envía a sus clientes:\n${fallbackSample.slice(0, 8000)}`}`,
    schema: BriefOut,
    toolName: "entregar_brief_de_marca",
  });

  bus.show("panorama", "marca", `${brand_brief.name} · ${brand_brief.vertical}`);

  /* ── 2. formatos: primero la aritmética, después la interpretación ── */
  const own = aggregate(ctx.data.posts);
  if (own) {
    coverage.push({
      source: "posts_csv",
      status: "ok",
      note: `${own.posts_analyzed} posts en ${own.by_format.length} formatos`,
    });
    for (const f of own.by_format.slice(0, 3)) {
      bus.show(
        "panorama",
        "señal",
        `${f.format} ${f.index_vs_mean}× el reach promedio de la cuenta (n=${f.n})`,
      );
    }
  } else {
    coverage.push({
      source: "posts_csv",
      status: "skipped",
      note: ctx.data.posts.length
        ? `solo ${ctx.data.posts.length} posts: muestra insuficiente`
        : "no se entregó posts.csv",
    });
    bus.say("panorama", "sin métricas propias suficientes — uso benchmarks de la categoría");
  }

  const bench = loadBenchmarks(brand_brief.vertical);
  coverage.push({
    source: "category_benchmarks",
    status: bench.formats.length ? "ok" : "failed",
    note: `vertical ${bench.key} · ${bench.formats.length} formatos`,
  });
  // Invariante #4: el scraping de IG jamás es dependencia.
  coverage.push({
    source: "ig_scrape",
    status: "skipped",
    note: "apagado por defecto (--ig-scrape)",
  });

  const { formats_ranked } = await ask("panorama", {
    system: `${VOICE}

Eres el Panorama. Rankeas FORMATOS de contenido para esta marca.

La regla de evidencia manda:
- Si hay métricas propias, esas ganan sobre cualquier benchmark. evidence="own_metrics".
- Un benchmark de categoría es evidence="category_benchmark" y NUNCA se presenta
  como si fuera dato de la marca.
- Lo que solo se ve en el sitio o en el contenido publicado es evidence="visible_content".

"signal" lleva el dato duro en UNA frase, con el número si existe.
"recommendation" va en imperativo y en una frase.
"confidence" refleja el tamaño de la muestra: con n<5 no pases de 0.6.

Un formato que la marca NO está usando y el benchmark respalda es una
oportunidad legítima: inclúyelo con evidence="category_benchmark".`,
    user: `Marca: ${brand_brief.name} · ${brand_brief.vertical}
Audiencia: ${brand_brief.audience}

MÉTRICAS PROPIAS:
${own ? JSON.stringify(own, null, 1) : "(no hay muestra suficiente)"}

BENCHMARKS DE LA CATEGORÍA "${bench.key}":
${JSON.stringify(bench.formats, null, 1)}`,
    schema: FormatsOut,
    toolName: "entregar_formatos_rankeados",
  });

  const research: BrandResearch = {
    brand_brief,
    formats_ranked,
    own_content_stats: own,
    category_benchmarks: bench.formats.map((f) => ({
      format: f.format as ContentFormat,
      claim: f.claim,
      source: f.source,
    })),
    reviews_summary: ctx.data.reviews.length
      ? {
          top_quotes: ctx.data.reviews
            .filter((r) => r.text.length > 20)
            .slice(0, 8)
            .map((r) => r.text),
          avg_sentiment: Number(
            (
              ctx.data.reviews.reduce((s, r) => s + (r.rating - 3) / 2, 0) /
              ctx.data.reviews.length
            ).toFixed(2),
          ),
          n: ctx.data.reviews.length,
        }
      : undefined,
    coverage,
  };

  const ok = coverage.filter((c) => c.status === "ok").length;
  bus.say(
    "panorama",
    `${ok} de ${coverage.length} fuentes en pie · ${formats_ranked.length} formatos con evidencia`,
  );
  return research;
};

/** Expuesto para los checks: la aritmética de formatos no debe depender del LLM. */
export const _aggregate = aggregate;
export const _timeoutMs = config.panorama_timeout_ms;
