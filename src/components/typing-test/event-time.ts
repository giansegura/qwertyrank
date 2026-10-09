/**
 * Time of an event on the `performance.now()` scale. Current browsers give
 * `event.timeStamp` on that scale; otherwise (old browsers, jsdom), the current time is used.
 */
export function eventTime(timeStamp: number, now = performance.now()): number {
  return timeStamp > 0 && timeStamp <= now && now - timeStamp < 1_000 ? timeStamp : now;
}
