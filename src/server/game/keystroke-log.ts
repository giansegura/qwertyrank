import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ReceivedBatch } from "../anticheat/rules";

/**
 * `keystroke_logs.events`: gzip-compressed JSON. Since 4b it also stores the game's words
 * (spec 4b §6.3): `{ words, batches }`. Before, it was only the list of batches.
 */
export function encodeKeystrokeLog(log: { words: readonly string[]; batches: readonly ReceivedBatch[] }): Buffer {
  return gzipSync(JSON.stringify({ words: log.words, batches: log.batches }));
}

/** A read log: its words (`null` if it predates 4b) and its events, unvalidated, in arrival order. */
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
 * Reads a log in either format. Never throws: a log that cannot be read
 * returns `null` (the panel says so instead of breaking).
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
