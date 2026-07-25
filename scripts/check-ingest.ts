/**
 * Prueba el ingest contra los casos que rompen parsers de WhatsApp reales:
 * formato iOS y Android en el mismo archivo, "p. m." con espacios, mensajes
 * multilínea, mensajes de sistema, multimedia omitido, marcas invisibles, y la
 * frontera fina de la PII (un teléfono se borra, un precio NO).
 *
 *   npm run check:ingest
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingest, parsePosts, parseReviews, redact } from "../src/pipeline/ingest";

const dir = mkdtempSync(join(tmpdir(), "darwin-"));
let bad = 0;

const ok = (cond: boolean, label: string, detail = "") => {
  console.log(`${cond ? "ok " : "BAD"} ${label}${detail ? "  → " + detail : ""}`);
  if (!cond) bad++;
};

/* ───────────────────────── conversaciones ───────────────────────── */

// Ojo: lleva marcas invisibles (‎) como los exports de verdad.
const chat = `===== CONV c001 =====
[12/3/25, 2:32:11 p. m.] Luma Sleep: ‎Hola! En qué te ayudo?
[12/3/25, 2:33:02 p. m.] María G: Hola, quería saber si la pijama llega antes del sábado
me la regalan para el cumpleaños de mi mamá
[12/3/25, 2:33:40 p. m.] Luma Sleep: Sí! Enviamos a Medellín en 2 días
[12/3/25, 2:34:00 p. m.] María G: Perfecto, mi cel es 310 234 5678 y vivo en la Calle 45 #23-11
[12/3/25, 2:34:30 p. m.] Luma Sleep: ‎<Multimedia omitido>
[12/3/25, 2:35:00 p. m.] María G: cuánto vale? vi que estaba en 135.000
===== CONV c002 =====
12/3/25, 09:10 - Los mensajes están cifrados de extremo a extremo.
12/3/25, 09:11 - Luma Sleep: Buenos días
12/3/25, 09:12 - Andrés P: escríbanme a andres.p@correo.com o al +57 300 111 2233
12/3/25, 09:13 - Andrés P: la cobija se destapa toda la noche, es horrible
===== CONV c003 =====
[13/3/25, 10:00] Luma Sleep: Hola
[13/3/25, 10:01] Sofía R: la calidad es INCREÍBLE, ya pedí otra`;

const chatPath = join(dir, "chats.txt");
writeFileSync(chatPath, chat);

const posts = `post_id,platform,Formato,fecha,caption,alcance,likes,comments,saves
p1,Instagram,Reel,2025-03-01,"Pijama en uso, mañana de domingo",41200,980,44,310
p2,instagram,Carrusel,2025-03-03,Guía de tallas,9800,210,12,64
p3,IG,UGC,2025-03-05,"Clienta real, sin filtro",52300,1340,90,520
p4,instagram,imagen,2025-03-07,Producto en fondo blanco,7400,150,6,20`;

const reviews = `review_id,rating,comentario,fecha
r1,5,"Suavísima, y no se destapa en la noche",2025-03-02
r2,4,"Buena pero pedí talla M y me quedó grande. Mi cel 320 555 4433",2025-03-04
r3,5,La regalé y quedó feliz,2025-03-06`;

const postsPath = join(dir, "posts.csv");
const reviewsPath = join(dir, "reviews.csv");
const sitePath = join(dir, "site.html");
writeFileSync(postsPath, posts);
writeFileSync(reviewsPath, reviews);
writeFileSync(
  sitePath,
  `<html><head><style>body{color:red}</style><script>var x=1</script></head>
   <body><h1>Luma Sleep</h1><p>Pijamas de algod&oacute;n pima</p></body></html>`,
);

const res = ingest({
  conversations: chatPath,
  posts: postsPath,
  reviews: reviewsPath,
  site: sitePath,
});

console.log("── conversaciones ──");
ok(res.stats.conversations_total === 3, "3 conversaciones detectadas", `${res.stats.conversations_total}`);
ok(
  res.stats.conversations_with_customer_msg === 3,
  "las 3 tienen mensaje de cliente",
  `${res.stats.conversations_with_customer_msg}`,
);

const c1 = res.conversations[0]!;
const brandMsgs = c1.messages.filter((m) => m.from === "brand").length;
const custMsgs = c1.messages.filter((m) => m.from === "customer").length;
ok(brandMsgs >= 2 && custMsgs >= 3, "marca vs cliente separados", `marca=${brandMsgs} cliente=${custMsgs}`);

const multiline = c1.messages.find((m) => m.text.includes("antes del sábado"));
ok(
  !!multiline && multiline.text.includes("cumpleaños de mi mamá"),
  "mensaje multilínea unido",
  multiline ? JSON.stringify(multiline.text.slice(0, 60)) : "no encontrado",
);

const media = c1.messages.find((m) => m.text.includes("Multimedia"));
ok(media?.from === "system", "multimedia omitido → system", media?.from ?? "no encontrado");

const cifrado = res.conversations[1]!.messages.find((m) => m.text.includes("cifrados"));
ok(cifrado?.from === "system", "aviso de cifrado → system", cifrado?.from ?? "no encontrado");

console.log("\n── PII ──");
const all = res.conversations.flatMap((c) => c.messages.map((m) => m.text)).join(" | ");
ok(!/310\s?234\s?5678/.test(all), "celular colombiano borrado");
ok(!/andres\.p@correo\.com/i.test(all), "email borrado");
ok(!/\+57\s?300\s?111\s?2233/.test(all), "teléfono con indicativo borrado");
ok(!/Calle 45/i.test(all), "dirección borrada");
ok(/135\.000/.test(all), "PRECIO 135.000 intacto (no es un teléfono)");
ok(res.stats.pii_redactions >= 4, "contador de redacciones", `${res.stats.pii_redactions}`);
ok(
  !/María|Andrés|Sofía/.test(JSON.stringify(res.conversations)),
  "nombres de remitentes nunca se guardan",
);

console.log("\n── CSV ──");
const p = parsePosts(posts);
ok(p.length === 4, "4 posts", `${p.length}`);
ok(p[0]!.format === "reel", "Reel → reel", p[0]!.format);
ok(p[1]!.format === "carousel", "Carrusel → carousel", p[1]!.format);
ok(p[2]!.format === "ugc_video", "UGC → ugc_video", p[2]!.format);
ok(p[3]!.format === "static", "imagen → static", p[3]!.format);
ok(p[2]!.platform === "instagram", "IG → instagram", p[2]!.platform);
ok(p[0]!.reach === 41200, "alcance parseado", `${p[0]!.reach}`);
ok(
  p[0]!.caption === "Pijama en uso, mañana de domingo",
  "coma dentro de comillas respetada",
  p[0]!.caption,
);

const rv = parseReviews(reviews);
ok(rv.length === 3, "3 reseñas", `${rv.length}`);
ok(!/320\s?555\s?4433/.test(JSON.stringify(rv)), "PII borrada también en reseñas");

console.log("\n── web ──");
ok(!res.site_text.includes("var x"), "script eliminado");
ok(!res.site_text.includes("color:red"), "style eliminado");
ok(res.site_text.includes("algodón pima"), "entidad HTML decodificada");

console.log("\n── redact() directo ──");
ok(redact("llámame al 3001234567").text.includes("[tel]"), "celular sin separadores");
ok(redact("son 45.000 pesos").text === "son 45.000 pesos", "precio corto intacto");

console.log(bad === 0 ? "\nINGEST OK" : `\n${bad} PROBLEMAS`);
process.exit(bad === 0 ? 0 : 1);
