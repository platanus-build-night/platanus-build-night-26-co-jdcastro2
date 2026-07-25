/**
 * Cliente mínimo de PostgREST.
 *
 * Por qué no @supabase/supabase-js: el frontend es vanilla sin bundler ni CDN
 * (invariante del wifi hostil), así que la librería no puede llegar al
 * navegador de todos modos. Y del lado del worker, PostgREST por fetch es
 * literalmente esto — 40 líneas contra una dependencia de 300 KB.
 *
 * El war room hace POLLING, no websockets: sobrevive mejor a una red mala y no
 * necesita nada que bundlear. (Okara, que es lo que estamos copiando en
 * presentación, hace exactamente lo mismo con su terminal-activity.)
 */

export interface SupabaseConfig {
  url: string;
  /** anon para leer · service_role para el worker. */
  key: string;
}

export function supabaseFromEnv(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export class PostgrestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PostgrestError";
  }
}

async function call(
  cfg: SupabaseConfig,
  method: string,
  path: string,
  body?: unknown,
  prefer?: string,
): Promise<unknown> {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new PostgrestError(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  return text ? JSON.parse(text) : null;
}

export const db = {
  select: <T>(cfg: SupabaseConfig, table: string, query: string) =>
    call(cfg, "GET", `${table}?${query}`) as Promise<T[]>,

  insert: <T>(cfg: SupabaseConfig, table: string, rows: unknown, returning = false) =>
    call(
      cfg,
      "POST",
      table,
      rows,
      returning ? "return=representation" : "return=minimal",
    ) as Promise<T[] | null>,

  update: <T>(cfg: SupabaseConfig, table: string, query: string, patch: unknown) =>
    call(cfg, "PATCH", `${table}?${query}`, patch, "return=representation") as Promise<T[]>,

  /** Insert-or-update por primary key. Lo usa la proyección de artefactos. */
  upsert: (cfg: SupabaseConfig, table: string, rows: unknown) =>
    call(cfg, "POST", table, rows, "resolution=merge-duplicates,return=minimal"),
};
