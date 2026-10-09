import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTypingSession } from "./use-typing-session";

describe("useTypingSession", () => {
  let clock = 0;
  const now = () => clock;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1000;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(words = ["hola", "mundo", "azul"], durationMs = 15_000, extra: { autoStart?: boolean; onFinish?: () => void } = {}) {
    const nextWords = vi.fn(() => ["nuevo", "texto"]);
    const hook = renderHook(() => useTypingSession({ initialWords: words, durationMs, nextWords, now, ...extra }));
    return { ...hook, nextWords };
  }

  it("starts idle", () => {
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    expect(result.current.endsAt).toBeNull();
  });

  it("starts with the first input and sets the end time", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.status).toBe("running");
    expect(result.current.endsAt).toBe(1000 + 15_000);
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("finishes when time runs out and computes the result", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "hola " }, true);
    });
    act(() => {
      clock += 15_000;
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.status).toBe("finished");
    expect(result.current.result?.correctChars).toBe(5);
    expect(result.current.result?.wpm).toBe(4);
  });

  it("ignores input after finishing", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "ola" }, true);
    });
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("finishes early if all the words are typed", () => {
    const { result } = setup(["fin"]);
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "fin " }, true);
    });
    expect(result.current.status).toBe("finished");
  });

  it("only records keys while the game is running", () => {
    const { result } = setup(["ab"], 1000);
    act(() => {
      result.current.handleKey({ type: "down", key: "a", code: "KeyA", trusted: true });
      result.current.handleInput({ deleted: 0, inserted: "a" }, true);
      clock += 100;
      result.current.handleKey({ type: "down", key: "b", code: "KeyB", trusted: true });
    });
    expect(result.current.getEvents()).toEqual([
      { t: 0, type: "input", deleted: 0, inserted: "a", trusted: true },
      { t: 100, type: "down", key: "b", code: "KeyB", trusted: true },
    ]);
    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.handleKey({ type: "down", key: "c", code: "KeyC", trusted: true });
    });
    expect(result.current.getEvents()).toHaveLength(2);
  });

  it("restarting requests new words and goes back to idle", () => {
    const { result, nextWords } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "ho" }, true);
    });
    act(() => {
      result.current.restart();
    });
    expect(nextWords).toHaveBeenCalledOnce();
    expect(result.current.status).toBe("idle");
    expect(result.current.engine.words).toEqual(["nuevo", "texto"]);
    expect(result.current.endsAt).toBeNull();
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(result.current.status).toBe("idle");
  });

  it("a lone space or a deletion at the start does not start the clock", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: " " }, true);
      result.current.handleInput({ deleted: 1, inserted: "" }, true);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.getEvents()).toEqual([]);
  });

  it("uses the event time if given", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true, 1_000);
      result.current.handleKey({ type: "up", key: "h", code: "KeyH", trusted: true }, 1_080);
    });
    expect(result.current.getEvents().map((event) => event.t)).toEqual([0, 80]);
  });

  it("an input arriving after the time is up finishes the game and does not count", () => {
    const { result } = setup(["hola", "mundo"], 1_000);
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    act(() => {
      clock += 1_500;
      result.current.handleInput({ deleted: 0, inserted: "o" }, true);
    });
    expect(result.current.status).toBe("finished");
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("with autoStart disabled ignores input until begin() is called", () => {
    const { result } = setup(["hola"], 15_000, { autoStart: false });
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.engine.typed[0]).toBe("");
    act(() => {
      result.current.begin();
    });
    expect(result.current.status).toBe("running");
    expect(result.current.endsAt).toBe(1_000 + 15_000);
    act(() => {
      clock += 200;
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.getEvents()).toEqual([{ t: 200, type: "input", deleted: 0, inserted: "h", trusted: true }]);
  });

  it("a keystroke just before begin() counts as t = 0 and times never go backwards", () => {
    const { result } = setup(["hola"], 15_000, { autoStart: false });
    act(() => {
      result.current.begin();
    });
    act(() => {
      result.current.handleKey({ type: "down", key: "h", code: "KeyH", trusted: true }, 995);
      result.current.handleInput({ deleted: 0, inserted: "h" }, true, 996);
      result.current.handleInput({ deleted: 0, inserted: "o" }, true, 1_300);
      result.current.handleKey({ type: "up", key: "o", code: "KeyO", trusted: true }, 1_250);
    });
    expect(result.current.getEvents().map((event) => event.t)).toEqual([0, 0, 300, 300]);
  });

  it("load() sets a new text and goes back to idle", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "ho" }, true);
    });
    act(() => {
      result.current.load(["del", "servidor"]);
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.engine.words).toEqual(["del", "servidor"]);
    expect(result.current.getEvents()).toEqual([]);
  });

  it("calls onFinish when finished, with the local result", () => {
    const onFinish = vi.fn();
    const { result } = setup(["fin"], 15_000, { onFinish });
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "fin " }, true);
    });
    expect(onFinish).toHaveBeenCalledOnce();
    expect(onFinish.mock.calls[0][0]).toMatchObject({ correctChars: 4 });
  });
});
