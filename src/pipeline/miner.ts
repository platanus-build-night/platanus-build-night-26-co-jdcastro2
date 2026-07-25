/**
 * El Oído — map+reduce sobre las conversaciones.
 *
 * STUB. Se implementa en el worktree `pipeline`.
 *   Lee: ctx.data.conversations
 *   Debe: lotes de config.miner_funnel.batch_size, un callRole por lote (map),
 *         y un reduce que agrupe lo repetido. Los testimonios NO se agrupan:
 *         cada voz es su propia fila (is_testimonial).
 *   Todo insight lleva al menos una cita textual. Sin cita no hay insight.
 */
import { NotImplemented, type MinerFn } from "../contract";

export const miner: MinerFn = async () => {
  throw new NotImplemented("El Oído", "pipeline");
};
