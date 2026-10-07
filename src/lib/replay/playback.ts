/**
 * La parte de la reproducción que corre en el navegador (spec 4b §6.2). No importa nada: el motor de
 * puntuación se queda en el servidor, y el panel no comparte código con la portada (si lo compartiera,
 * Next lo movería a trozos comunes y crecería el JS de la portada).
 */

/**
 * Un fotograma en compacto: en el instante `t`, lo escrito desde la palabra `from` (las anteriores no
 * cambian). La palabra activa es la última.
 */
export interface FrameDelta {
  t: number;
  from: number;
  tail: string[];
}

/** Lo escrito en `elapsed`: los fotogramas que ya han pasado, aplicados en orden. */
export function typedAt(frames: readonly FrameDelta[], elapsed: number): string[] {
  const typed: string[] = [];
  for (const frame of frames) {
    if (frame.t > elapsed) break;
    typed.length = frame.from;
    typed.push(...frame.tail);
  }
  return typed;
}
