/**
 * La Memoria — lo que una corrida le deja a la siguiente.
 *
 * Storage: JSON en runs/memory/<marca>.json. Fuera de runs/<id>/, que es por
 * corrida: la memoria es de la MARCA y sobrevive a las corridas.
 *
 * Lo importante del diseño: las estadísticas se ACUMULAN con aritmética, no se
 * le preguntan al modelo. El modelo solo destila el digest (qué hacer distinto
 * la próxima vez). Un ROAS histórico inventado por un LLM contaminaría todas
 * las corridas siguientes — el error se propagaría en vez de corregirse.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { VOICE, ask } from "../agent";
import { bus } from "../bus";
import type { MemoryCommitFn, MemoryDigestFn, MemoryLoadFn } from "../contract";
import { MemoryDigest, MemoryEntry, type Angle, type Verdict } from "../schemas";

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "marca";

const pathFor = (brand: string) => `runs/memory/${slug(brand)}.json`;

const Stored = z.object({
  brand: z.string(),
  updated_at: z.string(),
  entries: z.array(MemoryEntry),
});

/* ─────────────────────────── load ─────────────────────────── */

export const loadMemory: MemoryLoadFn = (brand) => {
  const path = pathFor(brand);
  if (!existsSync(path)) return [];
  try {
    const parsed = Stored.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success) {
      bus.say("memory", "la memoria guardada no pasa el schema — arranco de cero");
      return [];
    }
    return parsed.data.entries;
  } catch {
    // Una memoria corrupta nunca puede tumbar una corrida.
    return [];
  }
};

/* ─────────────────────────── digest ─────────────────────────── */

export const digestMemory: MemoryDigestFn = async (entries) => {
  if (!entries.length) return { learnings: [], prioritize: [], deprioritize: [] };

  return ask("memory", {
    system: `${VOICE}

Eres la Memoria de DARWIN. Destilas el histórico de una marca en instrucciones
accionables para la PRÓXIMA corrida.

- "learnings": máximo 6, concretas y con el número cuando exista.
  Bien:  "regalo + ugc_video graduó 2 de 3 veces (ROAS 4.1x promedio)"
  Mal:   "el contenido auténtico conecta mejor con la audiencia"
- "prioritize" y "deprioritize": combinaciones de familia × formato × canal, en
  frases cortas.
- Si la muestra es chica, DILO en el learning ("una sola corrida"). No conviertas
  una casualidad en una ley.
- No inventes cifras que no estén en las entradas.`,
    user: `HISTÓRICO ACUMULADO:\n${JSON.stringify(entries, null, 1)}`,
    schema: MemoryDigest,
    toolName: "destilar_memoria",
  });
};

/* ─────────────────────────── commit ─────────────────────────── */

/**
 * Acumula el resultado de esta corrida y devuelve el diff que pinta el war room.
 *
 * OJO con `added_lines`: app.js marca en verde las líneas de `markdown` que
 * aparecen aquí, comparando por igualdad EXACTA de string. Por eso el markdown
 * se construye A PARTIR de este array, nunca al revés.
 */
export const commitMemory: MemoryCommitFn = (brand, { angles, ads, outcome }) => {
  const byAngle = new Map<string, Angle>(angles.map((a) => [a.id, a]));
  const adAngle = new Map(ads.map((a) => [a.id, a.angle_id]));
  const previous = loadMemory(brand);
  const merged = new Map(previous.map((e) => [`${e.angle_id}|${e.format}|${e.channel}`, e]));

  const all = [...outcome.ads, ...outcome.children];
  const added: string[] = [];

  for (const sim of all) {
    // Los hijos heredan el ángulo del padre: "ad_x-h" → "ad_x".
    const rootId = sim.id.replace(/-(h|f)$/, "");
    const angleId = adAngle.get(rootId) ?? sim.angle_id;
    const angle = byAngle.get(angleId);
    if (!angle) continue;

    const key = `${angleId}|${sim.format}|paid`;
    const prev = merged.get(key);
    const revenue = sim.revenue ?? 0;
    const roas = sim.spend > 0 ? revenue / sim.spend : 0;

    merged.set(key, {
      angle_id: angleId,
      angle_family: angle.angle_family,
      format: sim.format,
      channel: "paid",
      stats: {
        spend: Math.round((prev?.stats.spend ?? 0) + sim.spend),
        purchases: (prev?.stats.purchases ?? 0) + sim.purchases,
        roas: Number(
          (((prev?.stats.roas ?? 0) * (prev?.stats.runs ?? 0) + roas) /
            ((prev?.stats.runs ?? 0) + 1)).toFixed(2),
        ),
        runs: (prev?.stats.runs ?? 0) + 1,
      },
      verdicts: [...(prev?.verdicts ?? []), sim.verdict as Verdict],
      learnings: prev?.learnings ?? [],
    });
  }

  const graduados = all.filter((a) => a.status === "graduated");
  const muertos = all.filter((a) => a.status === "killed");

  for (const g of graduados) {
    const angleId = adAngle.get(g.id.replace(/-(h|f)$/, "")) ?? g.angle_id;
    const fam = byAngle.get(angleId)?.angle_family ?? "?";
    added.push(
      `- ${angleId} (${fam}) + ${g.format} graduó a ROAS ${(g.spend > 0 ? (g.revenue ?? 0) / g.spend : 0).toFixed(1)}x con ${g.purchases} compras`,
    );
  }
  for (const m of muertos) {
    const angleId = adAngle.get(m.id.replace(/-(h|f)$/, "")) ?? m.angle_id;
    added.push(`- ${angleId} + ${m.format} murió: ${m.rule_fired}`);
  }
  // Señal de checkout, no de ángulo: mucho carrito y cero compra es otra cosa.
  const atcSinCompra = all.filter((a) => a.atc >= 15 && a.purchases === 0);
  for (const a of atcSinCompra) {
    added.push(
      `- ${a.id}: ${a.atc} carritos y 0 compras → revisar checkout antes de culpar al ángulo`,
    );
  }
  if (!added.length) added.push("- corrida sin veredictos terminales: nada concluyente todavía");

  const entries = [...merged.values()];
  const markdown = [
    `# Memoria · ${brand}`,
    "",
    `## Corrida ${new Date().toISOString().slice(0, 10)}`,
    ...added,
    "",
    "## Acumulado",
    ...entries
      .sort((a, b) => b.stats.roas - a.stats.roas)
      .slice(0, 8)
      .map(
        (e) =>
          `- ${e.angle_id} × ${e.format} × ${e.channel} · ROAS ${e.stats.roas}x · ${e.stats.purchases} compras · ${e.stats.runs} corrida(s)`,
      ),
  ].join("\n");

  const path = pathFor(brand);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        Stored.parse({ brand, updated_at: new Date().toISOString(), entries }),
        null,
        2,
      ),
    );
    bus.show("memory", "guardado", `${path} · ${entries.length} combinaciones acumuladas`);
  } catch (err) {
    // No poder escribir la memoria no invalida la corrida que acaba de pasar.
    bus.say("memory", `no pude escribir la memoria: ${String(err)}`);
  }

  return { markdown, added_lines: added };
};
