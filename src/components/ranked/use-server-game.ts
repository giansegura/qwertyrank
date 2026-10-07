"use client";

import { useEffect, useRef, useState } from "react";
import type { StartRequest } from "@/lib/game/types";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import type { TestResult } from "@/lib/scoring/replay";
import { useTypingSession } from "../typing-test/use-typing-session";
import { sendKeys } from "./api";
import { createBatchSender, type BatchSender } from "./batch-sender";
import { confirmFinish, requestStart, startFailure, type StartFailure } from "./game-flow";

/**
 * Fase de una partida contra el servidor. `result` lleva la respuesta de `finish`; `unscored`, el resultado
 * local cuando el servidor no la ha confirmado; `not_started`, por qué no ha empezado.
 */
export type ServerGamePhase<T> =
  | { name: "idle" }
  | { name: "starting" }
  | { name: "challenging" }
  | { name: "countdown"; endsAt: number; durationMs: number }
  | { name: "playing" }
  | { name: "submitting" }
  | { name: "result"; response: T }
  | { name: "unscored"; reason: "replaced" | "connection"; local: TestResult }
  | { name: "not_started"; failure: StartFailure };

/**
 * Una partida con el servidor (spec §3.4), la misma en Ranked y en la verificación (spec 4b §4.2):
 * pedirla (con el reto si hace falta) → cuenta atrás con el texto oculto → 30 s que no se pueden parar,
 * con las pulsaciones enviadas cada ~3 s → el servidor puntúa y da el veredicto. `T` es la respuesta de
 * `finish`. Turnstile pinta el reto en el elemento de `challengeRef`, que se saca del resultado al
 * desestructurarlo: el React Compiler toma `game.challengeRef` en el render por una lectura del ref.
 */
export function useServerGame<T>() {
  const [phase, setPhase] = useState<ServerGamePhase<T>>({ name: "idle" });

  // Cada partida empezada tiene un número; las respuestas de partidas anteriores se ignoran.
  const attemptRef = useRef(0);
  const startingRef = useRef(false);
  const gameIdRef = useRef<string | null>(null);
  const senderRef = useRef<BatchSender | null>(null);
  const challengeRef = useRef<HTMLDivElement>(null);
  const countdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopCurrent() {
    if (countdownRef.current !== null) clearTimeout(countdownRef.current);
    countdownRef.current = null;
    senderRef.current?.stop();
    senderRef.current = null;
    gameIdRef.current = null;
  }

  // Al desmontar se para la partida, y un inicio que siga en curso ya no la arranca.
  useEffect(
    () => () => {
      attemptRef.current++;
      stopCurrent();
    },
    [],
  );

  async function submit(local: TestResult) {
    const attempt = attemptRef.current;
    const gameId = gameIdRef.current;
    const sender = senderRef.current;
    if (!gameId || !sender) return;
    setPhase({ name: "submitting" });
    const outcome = await confirmFinish<T>(gameId, sender);
    if (attempt !== attemptRef.current) return;
    if (outcome.kind === "result") setPhase({ name: "result", response: outcome.response });
    else setPhase({ name: "unscored", reason: outcome.kind === "replaced" ? "replaced" : "connection", local });
  }

  const session = useTypingSession({
    initialWords: [],
    durationMs: OFFICIAL_DURATION_MS,
    nextWords: () => [],
    autoStart: false,
    onFinish: (local) => void submit(local),
  });

  /**
   * Pide una partida nueva y deja la anterior. `onStart` se llama al empezar a pedirla (p. ej. para
   * vaciar el campo oculto); no se llama si ya se está pidiendo otra.
   */
  async function start(body: StartRequest, onStart: () => void) {
    // Con un inicio en curso, repetir Tab o Espacio no pide otra partida: dos inicios a la vez
    // podrían llegar desordenados y dejar en pantalla una partida que el servidor ya cerró.
    if (startingRef.current) return;
    startingRef.current = true;
    const attempt = ++attemptRef.current;
    stopCurrent();
    setPhase({ name: "starting" });
    onStart();
    try {
      const game = await requestStart(body, {
        container: () => challengeRef.current,
        onChallenge: () => {
          if (attempt === attemptRef.current) setPhase({ name: "challenging" });
        },
      }).finally(() => {
        startingRef.current = false;
      });
      if (attempt !== attemptRef.current) return;
      gameIdRef.current = game.gameId;
      session.load(game.words);
      setPhase({ name: "countdown", endsAt: performance.now() + game.countdownMs, durationMs: game.countdownMs });
      countdownRef.current = setTimeout(() => {
        if (attempt !== attemptRef.current) return;
        session.begin();
        const sender = createBatchSender({
          getEvents: session.getEvents,
          send: (seq, events) => sendKeys(game.gameId, { seq, events }),
        });
        senderRef.current = sender;
        sender.start();
        setPhase({ name: "playing" });
      }, game.countdownMs);
    } catch (error) {
      if (attempt === attemptRef.current) setPhase({ name: "not_started", failure: startFailure(error) });
    }
  }

  /** Deja la partida en curso (sus respuestas se ignoran) y vuelve al principio, o a `failure`. */
  function leave(failure?: StartFailure) {
    attemptRef.current++;
    stopCurrent();
    setPhase(failure ? { name: "not_started", failure } : { name: "idle" });
  }

  return { phase, session, challengeRef, start, leave };
}
