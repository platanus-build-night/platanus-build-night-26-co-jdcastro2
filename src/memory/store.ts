/**
 * La Memoria — lo que una corrida le deja a la siguiente.
 *
 * STUB. Se implementa en el worktree `memory`.
 *   Storage: JSON en runs/memory/<brand>.json (fuera de runs/<id>/, que es
 *   por corrida). Zod valida cada write.
 *
 * `commit` devuelve el diff que pinta el war room. Cuidado con esto:
 * app.js marca en verde las líneas de `markdown` que aparecen en `added_lines`
 * comparando por igualdad EXACTA de string. Si difieren en un espacio, la línea
 * se pinta como vieja y el diff no se ve.
 */
import {
  NotImplemented,
  type MemoryCommitFn,
  type MemoryDigestFn,
  type MemoryLoadFn,
} from "../contract";

/** [] si la marca es nueva. Nunca lanza: la primera corrida no tiene memoria. */
export const loadMemory: MemoryLoadFn = () => {
  throw new NotImplemented("loadMemory", "memory");
};

/** Destila las entradas en algo accionable para el Estratega. Máximo 6 learnings. */
export const digestMemory: MemoryDigestFn = async () => {
  throw new NotImplemented("digestMemory", "memory");
};

export const commitMemory: MemoryCommitFn = () => {
  throw new NotImplemented("commitMemory", "memory");
};
