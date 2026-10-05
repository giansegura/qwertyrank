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
  /** Con `false`, el reloj no arranca con la primera pulsación sino al llamar a `begin()` (Ranked). */
  autoStart?: boolean;
  /** Se llama una vez al terminar, con el resultado calculado en el navegador. */
  onFinish?: (result: TestResult) => void;
  now?: () => number;
}

const defaultNow = () => performance.now();

/**
 * Lógica de una partida: el reloj empieza con la primera pulsación que cambia el texto
 * (o con `begin()`), termina a los `durationMs` y el resultado sale de `replay`, la
 * misma función que usa el servidor. Los tiempos `at` van en la escala de `performance.now()`.
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
   * Tiempo desde el inicio, nunca negativo ni menor que el del evento anterior: una pulsación
   * que ocurrió justo antes de `begin()` cuenta como 0, y un retraso del hilo principal no
   * desordena los eventos (el servidor los reproduce ordenados por `t`).
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
      // Sin arranque automático, o si la pulsación no cambia nada (espacio suelto, borrar), no empieza.
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

  /** Arranca el reloj ahora (Ranked: al terminar la cuenta atrás). */
  function begin() {
    if (statusRef.current !== "idle") return;
    startClock(now());
  }

  /** Pone un texto nuevo y vuelve al reposo. */
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

/** Dos estados con lo mismo escrito: la pulsación no ha cambiado el texto. */
function sameTyping(a: EngineState, b: EngineState): boolean {
  return a.current === b.current && a.typed[a.current] === b.typed[b.current];
}
