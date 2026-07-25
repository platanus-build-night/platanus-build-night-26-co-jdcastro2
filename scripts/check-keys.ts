/**
 * Verifica que las credenciales de .env funcionan, SIN imprimirlas.
 * Cero tokens: solo consulta metadatos.
 *
 *   npm run check:keys
 */
try { process.loadEnvFile(".env"); } catch { /* usa el entorno */ }

const mask = (k?: string) =>
  !k ? "AUSENTE" : `${k.slice(0, 7)}…${k.slice(-4)} · ${k.length} chars`;

let bad = 0;
const ok = (c: boolean, label: string, detail = "") => {
  console.log(`  ${c ? "ok " : "BAD"} ${label}${detail ? "  → " + detail : ""}`);
  if (!c) bad++;
};

/* ── OpenRouter ── */
const or = process.env.OPENROUTER_API_KEY;
console.log(`\n  OPENROUTER_API_KEY  ${mask(or)}`);
if (or) {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { authorization: `Bearer ${or}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.ok) {
    const d = (await res.json()).data ?? {};
    const limit = d.limit == null ? "sin tope" : `$${d.limit}`;
    ok(true, "la key es válida", `usado $${(d.usage ?? 0).toFixed(4)} · límite ${limit}`);
    if (d.is_free_tier) console.log("      ⚠ cuenta en free tier: algunos modelos no estarán disponibles");
  } else {
    ok(false, "OpenRouter la rechazó", `HTTP ${res.status}`);
  }
} else ok(false, "falta OPENROUTER_API_KEY");

/* ── Supabase ── */
const url = process.env.SUPABASE_URL;
const srv = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log(`\n  SUPABASE_SERVICE_ROLE_KEY  ${mask(srv)}`);
if (url && srv) {
  // Escribir en `events` es justo lo que la key pública NO puede hacer:
  // si esto pasa, la service_role es de verdad.
  const h = { apikey: srv, authorization: `Bearer ${srv}`, "content-type": "application/json" };
  const runs = await fetch(`${url}/rest/v1/runs?select=id&limit=1`, { headers: h });
  ok(runs.ok, "lee la base", `HTTP ${runs.status}`);

  const probe = await fetch(`${url}/rest/v1/runs`, {
    method: "POST",
    headers: { ...h, prefer: "return=representation" },
    body: JSON.stringify({ brand_name: "__probe__", status: "approved" }),
  });
  const created = probe.ok ? (await probe.json())[0] : null;
  ok(!!created, "escribe saltándose RLS (crea status='approved')", `HTTP ${probe.status}`);
  if (created) {
    await fetch(`${url}/rest/v1/runs?id=eq.${created.id}`, { method: "DELETE", headers: h });
    console.log("      (fila de prueba borrada)");
  }
} else ok(false, "faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");

/* ── modelos configurados ── */
console.log(`\n  proveedor  ${process.env.DARWIN_PROVIDER ?? "anthropic"}`);
console.log(`  juicio     ${process.env.DARWIN_JUDGE_MODEL}`);
console.log(`  volumen    ${process.env.DARWIN_VOLUME_MODEL}`);
console.log(`  hard stop  $${process.env.DARWIN_HARD_STOP}`);

console.log(bad === 0 ? "\n  KEYS OK\n" : `\n  ${bad} PROBLEMAS\n`);
process.exit(bad === 0 ? 0 : 1);
