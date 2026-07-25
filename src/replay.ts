/**
 * Re-emite una corrida grabada al bus, a N× velocidad.
 *
 * Por qué existe: la corrida completa tarda 6-10 min y el demo son 3. Grabamos
 * una corrida REAL y la reproducimos a 8×, con el banner diciéndolo en pantalla.
 * Lo honesto vende. Además es el fixture para desarrollar la UI sin gastar tokens.
 */
import { readFileSync } from "node:fs";
import { bus } from "./bus";
import type { DarwinEvent } from "./schemas";

interface Recorded {
  e: DarwinEvent;
  /** ms desde el inicio de la corrida original */
  offset: number;
}

function parse(path: string): Recorded[] {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const out: Recorded[] = [];
  let t0: number | null = null;

  for (const line of lines) {
    let e: DarwinEvent;
    try {
      e = JSON.parse(line) as DarwinEvent;
    } catch {
      continue;
    }
    // Solo los `log` traen timestamp propio; para el resto interpolamos.
    const ts = e.type === "log" ? e.ts : null;
    if (ts !== null && t0 === null) t0 = ts;
    out.push({ e, offset: ts !== null && t0 !== null ? ts - t0 : -1 });
  }

  // Los eventos sin timestamp heredan el del último que sí lo tenía.
  let last = 0;
  for (const r of out) {
    if (r.offset < 0) r.offset = last;
    else last = r.offset;
  }
  return out;
}

export async function replay(path: string, speed = 8): Promise<void> {
  const events = parse(path);
  if (events.length === 0) {
    console.error(`  ${path} está vacío`);
    return;
  }

  const total = events[events.length - 1]!.offset;
  console.log(
    `  reproduciendo ${events.length} eventos · ${(total / 1000).toFixed(0)}s reales → ${(
      total /
      1000 /
      speed
    ).toFixed(0)}s a ${speed}×\n`,
  );

  bus.emit({
    type: "phase",
    name: "replay",
    detail: `corrida real pre-grabada · ${speed}× · ${events.length} eventos`,
  });

  let clock = 0;
  for (const { e, offset } of events) {
    const wait = Math.max(0, (offset - clock) / speed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    clock = offset;
    bus.emit(e);
  }

  console.log("  replay terminado\n");
}
