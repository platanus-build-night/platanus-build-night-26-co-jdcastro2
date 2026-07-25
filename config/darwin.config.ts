/**
 * El playbook, anonimizado y editable.
 *
 * Esto NO son números inventados para un demo: es la destilación de un año
 * operando paid en e-commerce colombiano. Cada regla lleva su evidencia como
 * comentario, porque una regla sin su porqué se borra en la primera discusión.
 *
 * Todo aquí es editable sin tocar código del pipeline.
 */

export const config = {
  /* ─────────────────────── testing 1:1 ─────────────────────── */
  testing: {
    /** 1 ad = 1 ad set. Aislar la variable es lo único que hace legible el test. */
    budget_per_adset_usd: 5,
    /** Techo del spend total dedicado a probar cosas nuevas. */
    lane_pct_max: 0.15,
    /** Cuántos ads entran a la primera ronda. */
    n_ads_first_round: 6,
  },

  /* ─────────────────────── kill rules v3 ───────────────────────
   * Por tiers, según qué señal dio el ad. La lección cara: matar por
   * impaciencia cuesta tanto como no matar nunca.
   */
  kill_rules: [
    {
      tier: 1,
      condition: "0 compras Y 0 add-to-cart al llegar a ~3x el CPA objetivo",
      action: "kill",
      window: "hasta 3x CPA objetivo",
      // Evidencia: 0 de 14 ads en este estado resucitaron. Ninguno. Matar sin culpa.
      evidence: "0/14 resucitó",
      atc_min: 0,
      purchases_min: 0,
      cpa_multiple: 3,
    },
    {
      tier: 2,
      condition: "hay add-to-cart pero 0 compras",
      action: "correr ventana completa con checkpoint intermedio",
      window: "7 días o ~7x CPA objetivo",
      // Evidencia: ~30% de estos convierten después del día 3. Matarlos al día 2
      // es quemar plata ya gastada justo antes del retorno.
      evidence: "~30% convierte después",
      atc_min: 1,
      purchases_min: 0,
      cpa_multiple: 7,
      checkpoint_day: 3,
    },
    {
      tier: 3,
      condition: ">=1 compra",
      action: "corre los 7 días completos, siempre",
      window: "7 días",
      evidence: "una compra es señal; no se mata señal por ruido diario",
      purchases_min: 1,
      cpa_multiple: 999,
    },
  ],

  /** Al cerrar la ventana hay que emitir veredicto terminal. Un HOLD sin fecha es una fuga. */
  require_terminal_verdict: true,

  /* ─────────────────────── graduación ─────────────────────── */
  graduation: {
    roas_min: 3.5,
    purchases_min: 3,
    /** en cuántos días debe lograrlo para considerarse winner */
    within_days: 5,
    min_days: 2,
    /** escalar más rápido que esto rompe el aprendizaje del ad set */
    scale_pct_day: 25,
    scale_pct_day_max: 30,
  },

  fatigue: {
    /** Correlación observada ~85% entre frequency >3 y caída de CTR. */
    frequency_max: 3.0,
    action: "rotar creativo",
  },

  /** Un día raro con el upstream sano se observa 24-48h. No se mata. */
  anomaly_grace_hours: 48,

  /* ─────────────── priors de simulación ───────────────
   * OJO: alimentan el motor de evolución y calibran los umbrales de kill.
   * NUNCA se presentan al usuario como pronóstico de su negocio. El sim se
   * rotula siempre como "simulación con supuestos de categoría".
   */
  sim_priors: {
    currency: "COP",
    cpm: { p10: 6300, p50: 8400, p90: 10500 },
    ctr: { p10: 0.0148, p50: 0.0188, p90: 0.0227 },
    cpa_platform_p50: 30000,
    aov: 135000,
    roas_target: 3.5,
    /**
     * click → add-to-cart. Estas dos NO son libres: tienen que cuadrar con el
     * CPA declarado arriba, o el simulador miente.
     *   CPC = CPM/1000/CTR = 8400/1000/0.0188 ≈ 447 COP
     *   click→compra necesario para CPA 30K = 447/30000 = 0.0149
     *   0.09 × 0.165 = 0.0149 ✓
     * Y 0.165 de carrito→compra (≈83% de abandono) es además el número real
     * de e-commerce, no una concesión al modelo.
     */
    click_to_atc: 0.09,
    atc_to_purchase: 0.165,
    usd_cop: 4000,
  },

  /* ─────────────── embudo realista del miner ───────────────
   * Calibra las expectativas del demo: de 500 conversaciones no salen 500
   * insights. Salen ~15-20 consolidados y un puñado de testimonios sueltos.
   */
  miner_funnel: {
    pct_with_customer_msg: 0.45,
    pct_with_signal: 0.35,
    expected_insights: [15, 20] as const,
    batch_size: 25,
  },

  /* ─────────────── modelos y esfuerzo por rol ───────────────
   * "low" no es tacañería: estas tareas son extracción y redacción con
   * restricciones duras, no razonamiento profundo. Y el demo tiene que caber
   * en 6-10 minutos de reloj.
   */
  roles: {
    panorama: { tier: "volume", effort: "low", max_tokens: 3000 },
    miner_map: { tier: "volume", effort: "low", max_tokens: 4000 },
    miner_reduce: { tier: "judge", effort: "medium", max_tokens: 8000 },
    angles: { tier: "judge", effort: "medium", max_tokens: 6000 },
    strategist: { tier: "judge", effort: "medium", max_tokens: 5000 },
    paid: { tier: "judge", effort: "low", max_tokens: 6000 },
    organic: { tier: "judge", effort: "low", max_tokens: 6000 },
    creators: { tier: "judge", effort: "low", max_tokens: 4000 },
    email: { tier: "volume", effort: "low", max_tokens: 4000 },
    blog: { tier: "volume", effort: "low", max_tokens: 5000 },
    mutator: { tier: "judge", effort: "low", max_tokens: 3000 },
    memory: { tier: "judge", effort: "low", max_tokens: 2500 },
    generator: { tier: "volume", effort: "low", max_tokens: 8000 },
  },

  /* ─────────────── timeouts del panorama ───────────────
   * Ninguna fuente puede bloquear la corrida. 15s y seguimos.
   */
  panorama_timeout_ms: 15000,

  /* ─────────────── briefs ─────────────── */
  ad_limits: {
    headline_max: 54,
    sub_max: 90,
  },

  /* ─────────────── PII ───────────────
   * Redacción en el momento de extracción. Solo sobrevive el id de conversación.
   */
  pii: {
    replacement: {
      phone: "[tel]",
      email: "[email]",
      address: "[dirección]",
      id_number: "[documento]",
    },
  },
} as const;

export type DarwinConfig = typeof config;
