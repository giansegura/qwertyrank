// @vitest-environment node
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeKeystrokeLog, encodeKeystrokeLog } from "./keystroke-log";

const EVENT = { t: 0, type: "input", deleted: 0, inserted: "a", trusted: true } as const;
const BATCHES = [
  { seq: 1, arrivedAt: 100, events: [EVENT] },
  { seq: 2, arrivedAt: 200, events: [{ ...EVENT, t: 150, inserted: "b" }] },
];

describe("registro de pulsaciones", () => {
  it("guarda las palabras junto a las tandas y lo lee igual", () => {
    expect(decodeKeystrokeLog(encodeKeystrokeLog({ words: ["ab", "cd"], batches: BATCHES }))).toEqual({
      words: ["ab", "cd"],
      events: [EVENT, { ...EVENT, t: 150, inserted: "b" }],
    });
  });

  it("lee los registros anteriores a la 4b (solo tandas) sin palabras", () => {
    expect(decodeKeystrokeLog(gzipSync(JSON.stringify(BATCHES)))).toEqual({
      words: null,
      events: [EVENT, { ...EVENT, t: 150, inserted: "b" }],
    });
  });

  it("un registro roto no lanza", () => {
    expect(decodeKeystrokeLog(Buffer.from("no es gzip"))).toBeNull();
    expect(decodeKeystrokeLog(gzipSync("{no es json"))).toBeNull();
    expect(decodeKeystrokeLog(gzipSync("42"))).toBeNull();
    expect(decodeKeystrokeLog(gzipSync(JSON.stringify({ words: [1, 2], batches: [null, { events: "x" }] })))).toEqual({
      words: null,
      events: [],
    });
  });
});
