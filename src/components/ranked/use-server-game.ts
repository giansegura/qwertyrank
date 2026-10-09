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
 * Phase of a game against the server. `result` carries the `finish` response; `unscored`, the local result
 * when the server has not confirmed it; `not_started`, why it has not started.
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
 * A game with the server (spec §3.4), the same in Ranked and in verification (spec 4b §4.2):
 * request it (with the challenge if needed) → countdown with the text hidden → 30 s that cannot be stopped,
 * with keystrokes sent every ~3 s → the server scores and gives the verdict. `T` is the response of
 * `finish`. Turnstile renders the challenge in the `challengeRef` element, which is taken out of the result
 * by destructuring: the React Compiler treats `game.challengeRef` in render as a ref read.
 */
export function useServerGame<T>() {
  const [phase, setPhase] = useState<ServerGamePhase<T>>({ name: "idle" });

  // Each started game has a number; responses from earlier games are ignored.
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

  // On unmount the game stops, and a start still in progress no longer launches it.
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
   * Requests a new game and drops the previous one. `onStart` is called when the request begins (e.g. to
   * empty the hidden field); it is not called if another one is already being requested.
   */
  async function start(body: StartRequest, onStart: () => void) {
    // With a start in progress, repeating Tab or Space does not request another game: two starts at once
    // could arrive out of order and leave on screen a game the server already closed.
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

  /** Drops the game in progress (its responses are ignored) and goes back to the start, or to `failure`. */
  function leave(failure?: StartFailure) {
    attemptRef.current++;
    stopCurrent();
    setPhase(failure ? { name: "not_started", failure } : { name: "idle" });
  }

  return { phase, session, challengeRef, start, leave };
}
