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

  function setup(words = ["hola", "mundo", "azul"], durationMs = 15_000) {
    const nextWords = vi.fn(() => ["nuevo", "texto"]);
    const hook = renderHook(() => useTypingSession({ initialWords: words, durationMs, nextWords, now }));
    return { ...hook, nextWords };
  }

  it("empieza en reposo", () => {
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    expect(result.current.endsAt).toBeNull();
  });

  it("arranca con la primera entrada y fija la hora de fin", () => {
    const { result } = setup();
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "h" }, true);
    });
    expect(result.current.status).toBe("running");
    expect(result.current.endsAt).toBe(1000 + 15_000);
    expect(result.current.engine.typed[0]).toBe("h");
  });

  it("termina al agotarse el tiempo y calcula el resultado", () => {
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

  it("ignora la entrada después de terminar", () => {
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

  it("termina antes de tiempo si se escriben todas las palabras", () => {
    const { result } = setup(["fin"]);
    act(() => {
      result.current.handleInput({ deleted: 0, inserted: "fin " }, true);
    });
    expect(result.current.status).toBe("finished");
  });

  it("solo registra teclas mientras la partida está en marcha", () => {
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

  it("reiniciar pide palabras nuevas y vuelve al reposo", () => {
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
});
