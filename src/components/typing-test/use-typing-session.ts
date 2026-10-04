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
  /** Palabras para la siguiente partida al reiniciar. */
  nextWords: () => readonly string[];
  now?: () => number;
}

const defaultNow = () => performance.now();

/**
 * Lógica de una partida local: el reloj empieza con la primera entrada de texto,
 * termina a los `durationMs` y el resultado sale de `replay`, la misma función
 * que usará el servidor.
 */
export function useTypingSession({ initialWords, durationMs, nextWords, now = defaultNow }: Options) {
  const [engine, setEngine] = useState(() => createEngine(initialWords));
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const engineRef = useRef(engine);
  const statusRef = useRef<SessionStatus>("idle");
  const eventsRef = useRef<TypingEvent[]>([]);
  const startRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
  }, []);

  function finish() {
    if (statusRef.current === "finished") return;
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    statusRef.current = "finished";
    setStatus("finished");
    setResult(replay(engineRef.current.words, eventsRef.current, durationMs));
  }

  function handleInput(diff: InputDiff, trusted: boolean): EngineState {
    if (statusRef.current === "finished") return engineRef.current;

    let t: number;
    if (startRef.current === null) {
      startRef.current = now();
      statusRef.current = "running";
      setStatus("running");
      setEndsAt(startRef.current + durationMs);
      timeoutRef.current = setTimeout(finish, durationMs);
      t = 0;
    } else {
      t = now() - startRef.current;
    }

    eventsRef.current.push({ t, type: "input", deleted: diff.deleted, inserted: diff.inserted, trusted });
    const next = applyInput(engineRef.current, diff.deleted, diff.inserted);
    engineRef.current = next;
    setEngine(next);
    if (isFinished(next)) finish();
    return next;
  }

  function handleKey(key: KeyInfo) {
    if (statusRef.current !== "running" || startRef.current === null) return;
    eventsRef.current.push({ t: now() - startRef.current, ...key });
  }

  function restart() {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    const fresh = createEngine(nextWords());
    engineRef.current = fresh;
    statusRef.current = "idle";
    eventsRef.current = [];
    startRef.current = null;
    setEngine(fresh);
    setStatus("idle");
    setEndsAt(null);
    setResult(null);
  }

  function getEvents(): readonly TypingEvent[] {
    return [...eventsRef.current];
  }

  return { engine, status, endsAt, result, handleInput, handleKey, restart, getEvents };
}
