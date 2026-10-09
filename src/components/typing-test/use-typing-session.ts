"use client";

import { useEffect, useRef, useState } from "react";
import { applyInput, createEngine, isFinished, type EngineState } from "@/lib/scoring/engine";
import { replay, type TestResult } from "@/lib/scoring/replay";
import type { TypingEvent } from "@/lib/scoring/types";
import type { InputDiff } from "./input-diff";

export type SessionStatus = "idle" | "running" | "finished";

export interface KeyInfo {
  type: "down" | "up";
  key: string;
  code: string;
  trusted: boolean;
}

interface Options {
  initialWords: readonly string[];
  durationMs: number;
  /** Words for the next game on restart. */
  nextWords: () => readonly string[];
  /** With `false`, the clock does not start with the first keystroke but when `begin()` is called (Ranked). */
  autoStart?: boolean;
  /** Called once when finished, with the result computed in the browser. */
  onFinish?: (result: TestResult) => void;
  now?: () => number;
}

const defaultNow = () => performance.now();

/**
 * Logic of a game: the clock starts with the first keystroke that changes the text
 * (or with `begin()`), ends after `durationMs` and the result comes from `replay`, the
 * same function the server uses. The `at` times are on the `performance.now()` scale.
 */
export function useTypingSession({
  initialWords,
  durationMs,
  nextWords,
  autoStart = true,
  onFinish,
  now = defaultNow,
}: Options) {
  const [engine, setEngine] = useState(() => createEngine(initialWords));
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const engineRef = useRef(engine);
  const statusRef = useRef<SessionStatus>("idle");
  const eventsRef = useRef<TypingEvent[]>([]);
  const startRef = useRef<number | null>(null);
  const lastTRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
  }, []);

  function finish() {
    if (statusRef.current === "finished") return;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    statusRef.current = "finished";
    const local = replay(engineRef.current.words, eventsRef.current, durationMs);
    setStatus("finished");
    setResult(local);
    onFinish?.(local);
  }

  /**
   * Time since the start, never negative nor less than the previous event's: a keystroke
   * that happened just before `begin()` counts as 0, and a main-thread delay does not
   * reorder the events (the server replays them sorted by `t`).
   */
  function elapsed(at: number): number {
    const t = Math.max(lastTRef.current, at - startRef.current!);
    lastTRef.current = t;
    return t;
  }

  function startClock(at: number) {
    startRef.current = at;
    lastTRef.current = 0;
    statusRef.current = "running";
    setStatus("running");
    setEndsAt(at + durationMs);
    timeoutRef.current = setTimeout(finish, Math.max(0, at + durationMs - now()));
  }

  function handleInput(diff: InputDiff, trusted: boolean, at = now()): EngineState {
    if (statusRef.current === "finished") return engineRef.current;
    const next = applyInput(engineRef.current, diff.deleted, diff.inserted);

    if (statusRef.current === "idle") {
      // Without auto start, or if the keystroke changes nothing (lone space, delete), it does not start.
      if (!autoStart || sameTyping(next, engineRef.current)) return engineRef.current;
      startClock(at);
    }

    const t = elapsed(at);
    if (t > durationMs) {
      finish();
      return engineRef.current;
    }

    eventsRef.current.push({ t, type: "input", deleted: diff.deleted, inserted: diff.inserted, trusted });
    engineRef.current = next;
    setEngine(next);
    if (isFinished(next)) finish();
    return next;
  }

  function handleKey(key: KeyInfo, at = now()) {
    if (statusRef.current !== "running" || startRef.current === null) return;
    const t = elapsed(at);
    if (t > durationMs) return;
    eventsRef.current.push({ t, ...key });
  }

  /** Starts the clock now (Ranked: when the countdown ends). */
  function begin() {
    if (statusRef.current !== "idle") return;
    startClock(now());
  }

  /** Sets a new text and goes back to idle. */
  function load(words: readonly string[]) {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const fresh = createEngine(words);
    engineRef.current = fresh;
    statusRef.current = "idle";
    eventsRef.current = [];
    startRef.current = null;
    lastTRef.current = 0;
    setEngine(fresh);
    setStatus("idle");
    setEndsAt(null);
    setResult(null);
  }

  function restart() {
    load(nextWords());
  }

  function getEvents(): readonly TypingEvent[] {
    return [...eventsRef.current];
  }

  return { engine, status, endsAt, result, handleInput, handleKey, begin, load, restart, getEvents };
}

/** Two states with the same text typed: the keystroke has not changed the text. */
function sameTyping(a: EngineState, b: EngineState): boolean {
  return a.current === b.current && a.typed[a.current] === b.typed[b.current];
}
