import { describe, expect, it } from "vitest";
import { typed } from "@/test/typing-events";
import { typedAt } from "./playback";
import { buildFrames, compactFrames, replayInputs, rhythm } from "./timeline";

describe("keystrokes to replay", () => {
  it("only well-formed `input`s, in order; a negative `t` counts as 0 and a late one stays", () => {
    const steps = replayInputs([
      { t: 300, type: "input", deleted: 0, inserted: "b", trusted: true },
      { t: -50, type: "input", deleted: 0, inserted: "a", trusted: false },
      { t: 31_000, type: "input", deleted: 1, inserted: "", trusted: true },
      { t: 10, type: "down", key: "a", code: "KeyA", trusted: true },
      { t: "100", type: "input", deleted: 0, inserted: "x" },
      { t: 100, type: "input", deleted: -1, inserted: "x" },
      { t: Number.NaN, type: "input", deleted: 0, inserted: "x" },
      null,
      "junk",
    ]);
    expect(steps).toEqual([
      { t: 0, deleted: 0, inserted: "a" },
      { t: 300, deleted: 0, inserted: "b" },
      { t: 31_000, deleted: 1, inserted: "" },
    ]);
  });
});

describe("frames", () => {
  it("with the words, as the server scored it: the error stays in its word", () => {
    const frames = buildFrames(["hola", "sol"], replayInputs(typed("hxla s", { every: 100 })));
    expect(frames[0]).toEqual({ t: 0, typed: [""], current: 0 });
    expect(frames.at(-1)).toMatchObject({ typed: ["hxla", "s"], current: 1 });
    expect(typedAt(compactFrames(frames), 150)).toEqual(["hx"]);
  });

  it("without words (log from before 4b), only what was typed, with deletions and spaces", () => {
    const steps = [
      { t: 0, deleted: 0, inserted: "c" },
      { t: 100, deleted: 0, inserted: "x" },
      { t: 200, deleted: 1, inserted: "asa" },
      { t: 300, deleted: 0, inserted: " " },
      { t: 400, deleted: 0, inserted: " " },
      { t: 500, deleted: 0, inserted: "y" },
    ];
    expect(buildFrames(null, steps).at(-1)).toEqual({ t: 500, typed: ["casa", "y"], current: 1 });
  });

  it("what was typed at an instant is that of the last frame that has already passed", () => {
    const frames = compactFrames(buildFrames(null, replayInputs(typed("abc", { every: 100 }))));
    expect(typedAt(frames, 0)).toEqual([""]);
    expect(typedAt(frames, 101)).toEqual(["ab"]);
    expect(typedAt(frames, 99_999)).toEqual(["abc"]);
  });

  it("in compact form, each frame carries only the words that change and is rebuilt the same", () => {
    const steps = [...replayInputs(typed("hxla s", { every: 100 })), { t: 700, deleted: 1, inserted: "sol m" }];
    const frames = buildFrames(["hola", "sol", "mar"], steps);
    const compact = compactFrames(frames);
    expect(compact[0]).toEqual({ t: 0, from: 0, tail: [""] });
    expect(compact.at(-1)).toEqual({ t: 700, from: 1, tail: ["sol", "m"] });
    frames.forEach((frame, index) => {
      expect(typedAt(compact.slice(0, index + 1), Number.POSITIVE_INFINITY)).toEqual(frame.typed);
    });
  });
});

describe("rhythm", () => {
  it("intervals between letters and, with a physical keyboard, how long each keystroke lasts", () => {
    const events = typed("abc", { every: 120, hold: 70 });
    expect(rhythm(events, "physical")).toEqual({
      intervals: [
        { t: 121, ms: 120 },
        { t: 241, ms: 120 },
      ],
      holds: [
        { t: 0, ms: 70 },
        { t: 120, ms: 70 },
        { t: 240, ms: 70 },
      ],
    });
    expect(rhythm(events, "touch").holds).toEqual([]);
  });

  it("does not break with odd events: keys that are never released, without a code or with an impossible `t`", () => {
    const events = [
      { t: 0, type: "down", key: "a", code: "" },
      { t: 50, type: "up", key: "a", code: "" },
      { t: 60, type: "down", key: "b", code: "KeyB" },
      { t: Number.POSITIVE_INFINITY, type: "up", key: "b", code: "KeyB" },
      { t: "x", type: "down" },
    ];
    expect(rhythm(events, "physical")).toEqual({ intervals: [], holds: [{ t: 0, ms: 50 }] });
  });
});
