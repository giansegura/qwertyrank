import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ReceivedBatch } from "../anticheat/rules";

/**
 * `keystroke_logs.events`: JSON comprimido con gzip. Desde la 4b guarda también las palabras de la
 * partida (spec 4b §6.3): `{ words, batches }`. Antes era solo la lista de tandas.
 */
export function encodeKeystrokeLog(log: { words: readonly string[]; batches: readonly ReceivedBatch[] }): Buffer {
  return gzipSync(JSON.stringify({ words: log.words, batches: log.batches }));
}

/** Un registro leído: sus palabras (`null` si es anterior a la 4b) y sus eventos, sin validar, en orden de llegada. */
export interface StoredKeystrokeLog {
  words: string[] | null;
  events: unknown[];
}

function eventsOf(batches: unknown): unknown[] {
  if (!Array.isArray(batches)) return [];
  return batches.flatMap((batch: unknown) => {
    const events = (batch as { events?: unknown } | null)?.events;
    return Array.isArray(events) ? events : [];
  });
}

/**
 * Lee un registro en cualquiera de los dos formatos. Nunca lanza: un registro que no se puede leer
 * devuelve `null` (el panel lo dice en vez de romperse).
 */
export function decodeKeystrokeLog(data: Buffer): StoredKeystrokeLog | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(data).toString("utf8"));
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return { words: null, events: eventsOf(parsed) };
  if (typeof parsed !== "object" || parsed === null) return null;
  const { words, batches } = parsed as { words?: unknown; batches?: unknown };
  const validWords = Array.isArray(words) && words.every((word) => typeof word === "string") ? words : null;
  return { words: validWords, events: eventsOf(batches) };
}
