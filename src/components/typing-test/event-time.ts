/**
 * Hora de un evento en la escala de `performance.now()`. Los navegadores actuales dan
 * `event.timeStamp` en esa escala; si no (navegadores antiguos, jsdom), se usa la hora actual.
 */
export function eventTime(timeStamp: number, now = performance.now()): number {
  return timeStamp > 0 && timeStamp <= now && now - timeStamp < 1_000 ? timeStamp : now;
}
