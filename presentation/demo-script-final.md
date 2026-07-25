# DARWIN — Guion final del demo

## La historia en una frase

> DARWIN convierte las palabras reales de los clientes en hipótesis de
> distribución trazables, listas para aprobar, probar y aprender.

## El problema que resolvemos

Construir software se volvió rápido. Descubrir qué mensaje mueve una compra, en
qué formato decirlo y qué campaña merece más presupuesto sigue siendo un proceso
manual. Las herramientas generativas suelen llenar ese vacío inventando copy.
DARWIN parte de la evidencia que la marca ya tiene.

## Cómo lo resolvemos

1. Lee la web, conversaciones y métricas de contenido.
2. Redacta datos personales antes de procesar las conversaciones.
3. Encuentra patrones y conserva la cita textual y su frecuencia.
4. Invierte cada problema real en una promesa de venta.
5. Cruza ángulos, formatos y canales para producir un plan y borradores.
6. Todo queda en `draft` hasta recibir GO humano.
7. El MVP simula la competencia con reglas explícitas y guarda el aprendizaje
   para la siguiente corrida.

## Guion hablado · 60 segundos

### 0:00–0:10 · ① La fuente

**Acción:** recargar la página y señalar `cobertura`.

> Esto es un replay acelerado con datos reales de Dosmicos. Entraron su web,
> cuatrocientas doce conversaciones y las métricas de sesenta y ocho
> publicaciones. Antes de usar un modelo, DARWIN redacta los datos personales y
> muestra exactamente qué fuentes pudo usar y cuáles faltaron.

### 0:10–0:23 · ② La cadena

**Acción:** señalar el hilo `noche_completa`.

> El Oído encontró este problema en veintitrés conversaciones: “se le destapa
> toda la noche y amanece heladita”. DARWIN no inventa un eslogan: invierte esa
> frase en una promesa —“la cobijita que sí se queda puesta”— y conserva la cita
> pegada al anuncio. Sin cita, el schema lo rechaza.

### 0:23–0:35 · ③ El plan

**Acción:** señalar el mix y los borradores.

> Después cruza el ángulo con evidencia propia: en esta cuenta, los reels
> alcanzan tres coma uno veces más que los carruseles. Los agentes preparan
> anuncios, contenido, creators, email y SEO. Todo queda en borrador: los agentes
> proponen, el humano decide.

### 0:35–0:52 · ④ Selección natural

**Acción:** cuando aparezca el ganador, hacer clic en la fila `ad_noche_reel`.
La interfaz volverá a la tarjeta que lo originó; ahí presionar `GO`.

> Esta arena es una simulación con supuestos de categoría, no una predicción.
> Cada anuncio tiene su propio presupuesto y reglas visibles. Después de siete
> días, cuatro mueren, uno se sostiene y este gradúa. El ganador produce dos
> variantes: una cambia el hook y la otra cambia el formato. Yo puedo aprobar
> este borrador, pero DARWIN nunca publica sin control humano.

### 0:52–1:00 · ⑤ La memoria

**Acción:** señalar las líneas nuevas en verde.

> Finalmente, DARWIN escribe qué combinación funcionó y cuál debe dejar de
> probar. La próxima corrida no empieza de cero. Convertimos distribución en un
> ciclo de evidencia, experimentación y aprendizaje.

## Secuencia técnica real del replay a 8×

- `0s`: ingesta.
- `4s`: Panorama.
- `10s`: insights.
- `12–15s`: ángulos.
- `16s`: estrategia.
- `17–23s`: artefactos de los canales.
- `24s`: comienza la arena.
- `38s`: aparece el ganador.
- `45s`: aparecen los dos hijos.
- `49s`: estado final del día 7.
- `58s`: kills y Memoria.
- `60s`: fin.

## Qué no debemos afirmar

- `GO` aprueba; todavía no publica en Meta, email o CMS.
- La arena usa datos simulados; no son resultados de una campaña real.
- La Memoria del MVP aprende de esa simulación.
- El replay no es una corrida live contra la API.
- Los perfiles de creators son perfiles tipo; no cuentas verificadas.

## Fallback

Si el replay ya terminó, recargar reconstruye inmediatamente el estado final
desde el backlog del servidor. Ese estado sirve como fallback estático:

> Aquí vemos el cierre: cuatro campañas murieron, una se sostuvo y esta graduó.
> DARWIN creó dos variantes y guardó estas nuevas instrucciones para la próxima
> corrida.
