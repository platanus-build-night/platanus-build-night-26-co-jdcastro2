/**
 * El Ejército — los 5 agentes que ejecutan la estrategia.
 *
 * STUB. Se implementa en el worktree `army`.
 *   paid      → AdDraft[]              (source_quote OBLIGATORIO, 54/90 chars)
 *   organic   → ContentCalendarItem[]  (2 semanas, cargado al formato ganador)
 *   creators  → InfluencerProspect[]   (con el DM ya escrito, sin plantilla)
 *   email     → EmailFlow[]
 *   blog      → BlogDraft[]
 *
 * Los 5 corren en paralelo: no dependen entre sí, solo de strategy+angles.
 * Cada uno emite su propio bus.tally() al cerrar.
 *
 * Recortes en orden si hay atraso (CLAUDE.md): blog+email primero (dejar 1
 * email), luego creators a 2 prospects pre-generados.
 */
import { NotImplemented, type ArmyFn, type ToSimAdsFn } from "./contract";

export const runArmy: ArmyFn = async () => {
  throw new NotImplemented("El Ejército", "army");
};

/**
 * Puente al motor de evolución. Traduce AdFormat (static|ugc) a ContentFormat
 * (reel|carousel|static|story|ugc_video) y adjunta el evidence_strength del
 * ángulo — el motor lo usa para modular la verdad oculta del ad.
 * El `id` DEBE conservarse: el war room cruza fila de evolución ↔ tarjeta por id.
 */
export const toSimAds: ToSimAdsFn = () => {
  throw new NotImplemented("toSimAds", "army");
};
