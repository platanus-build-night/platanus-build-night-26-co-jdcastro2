/**
 * EventBus tipado → SSE + NDJSON.
 *
 * Todo lo que pasa en DARWIN pasa por aquí. Dos consumidores:
 *   1. el war room (SSE en vivo)
 *   2. runs/<id>/events.ndjson — que es a la vez el replay del demo y el
 *      fixture para desarrollar la UI sin quemar tokens.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DarwinEvent, Role, AgentState } from "./schemas";

type Listener = (e: DarwinEvent) => void;

class EventBus {
  private listeners = new Set<Listener>();
  private recordPath: string | null = null;
  private now: () => number = Date.now;

  /** Empieza a grabar todo lo emitido a un ndjson (append-only). */
  record(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.recordPath = path;
  }

  /**
   * Reloj inyectable. Solo lo usa demo/generate.ts: fabrica los `ts` de una
   * corrida de 10 minutos sin dormir 10 minutos. En producción nadie lo llama
   * y el bus sigue usando Date.now.
   */
  useClock(fn: () => number) {
    this.now = fn;
  }

  stopRecording() {
    this.recordPath = null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: DarwinEvent) {
    if (this.recordPath) {
      try {
        appendFileSync(this.recordPath, JSON.stringify(e) + "\n");
      } catch {
        // grabar nunca puede tumbar la corrida
      }
    }
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        // un listener roto no tumba a los demás
      }
    }
  }

  /* ── azúcar para los sitios de llamada ── */

  phase(name: string, detail?: string) {
    this.emit({ type: "phase", name, detail });
  }

  agent(role: Role | string, state: AgentState, note?: string) {
    this.emit({ type: "agent", role, state, note });
  }

  log(role: string, line: string) {
    this.emit({ type: "log", ts: this.now(), role, line });
    this.echo(role, line);
  }

  /* ── narración ──
   * El war room no muestra estados, muestra lo que el agente está haciendo y
   * la prueba de que lo hizo. `say` es la voz; `show` es la evidencia. Ese
   * contraste — narración en verde, literal en ámbar — es todo el efecto.
   */

  /** Narración en primera persona. "destapé 412 conversaciones". */
  say(role: Role | string, line: string) {
    this.emit({ type: "log", ts: this.now(), role: String(role), line, kind: "say" });
    this.echo(role, `> ${line}`);
  }

  /**
   * La prueba literal: la cita, la url, el conteo. Es el anti-alucinación en
   * pantalla — si el modelo lo dijo, aquí está de dónde lo sacó.
   */
  show(role: Role | string, label: string, literal: string) {
    const line = `${label} › ${literal}`;
    this.emit({ type: "log", ts: this.now(), role: String(role), line, kind: "literal" });
    this.echo(role, `  ${line}`);
  }

  /**
   * Inventario contable, NUNCA un estado. "18 insights", no "listo".
   * El war room rechaza cualquier note que no empiece con un dígito.
   */
  tally(role: Role | string, n: number, noun: string, state: AgentState = "done") {
    this.emit({ type: "agent", role, state, note: `${n} ${noun}` });
  }

  private echo(role: Role | string, line: string) {
    if (process.env.DARWIN_QUIET !== "1") {
      console.log(`[${String(role)}] ${line}`);
    }
  }
}

export const bus = new EventBus();
