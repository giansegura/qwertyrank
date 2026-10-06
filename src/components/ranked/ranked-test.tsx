"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { FinishResponse, PublicReason, StartResponse } from "@/lib/game/types";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import type { TestResult } from "@/lib/scoring/replay";
import type { TestLanguage } from "@/lib/words/languages";
import { ResultView } from "../typing-test/result-view";
import { Timer } from "../typing-test/timer";
import { useTypingInput } from "../typing-test/use-typing-input";
import { useTypingSession } from "../typing-test/use-typing-session";
import { WordsView } from "../typing-test/words-view";
import { GameApiError, finishGame, sendKeys, startGame } from "./api";
import { createBatchSender, type BatchSender } from "./batch-sender";
import { readClientEnv } from "./client-env";

type Phase =
  | { name: "ready" }
  | { name: "starting" }
  | { name: "countdown"; endsAt: number; durationMs: number }
  | { name: "playing" }
  | { name: "submitting" }
  | { name: "result"; response: FinishResponse }
  | { name: "challenging" }
  | { name: "blocked"; reason: BlockReason; minutes: number }
  | { name: "unavailable" }
  | { name: "unscored"; reason: "replaced" | "connection"; local: TestResult };

/** Si el servidor no confirma la partida en este tiempo, se enseña el resultado local (spec §8.4). */
export const SUBMIT_DEADLINE_MS = 10_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Confirmation = { kind: "result"; response: FinishResponse } | { kind: "replaced" | "failed" | "timeout" };

/** Envía lo pendiente y pide el veredicto al servidor. */
async function confirm(gameId: string, sender: BatchSender): Promise<Confirmation> {
  const { lastSeq } = await sender.flush();
  try {
    return { kind: "result", response: await finishGame(gameId, { lastSeq }) };
  } catch (error) {
    return { kind: error instanceof GameApiError && error.code === "closed" ? "replaced" : "failed" };
  }
}

/** Momento (escala de `performance.now()`) en que termina un intervalo que empieza ahora. */
function endsIn(ms: number): number {
  return performance.now() + ms;
}

type VerdictMessage = "verdictConnection" | "verdictUnrecognized" | "verdictLetterByLetter";

const REASON_MESSAGE: Record<PublicReason, VerdictMessage> = {
  connection: "verdictConnection",
  unrecognized: "verdictUnrecognized",
  letter_by_letter: "verdictLetterByLetter",
};

type BlockReason = "challenge_failed" | "banned" | "rate_limited";

const BLOCK_MESSAGE: Record<BlockReason, "challengeFailed" | "banned" | "rateLimited"> = {
  challenge_failed: "challengeFailed",
  banned: "banned",
  rate_limited: "rateLimited",
};

/** El reto no se pudo resolver: el script no cargó, el widget dio error o se agotó el tiempo. */
class ChallengeFailedError extends Error {}

/** Por qué no ha empezado la partida (spec 4a §2.1; spec §8.4). */
function failurePhase(error: unknown): Phase {
  if (error instanceof ChallengeFailedError) return { name: "blocked", reason: "challenge_failed", minutes: 0 };
  if (!(error instanceof GameApiError)) return { name: "unavailable" };
  // Un segundo `needs_challenge` es un token rechazado: no se reintenta en bucle.
  if (error.code === "needs_challenge") return { name: "blocked", reason: "challenge_failed", minutes: 0 };
  if (error.code === "banned") return { name: "blocked", reason: "banned", minutes: 0 };
  if (error.code === "rate_limited") {
    return { name: "blocked", reason: "rate_limited", minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)) };
  }
  return { name: "unavailable" };
}

type RankSummaryComponent = typeof import("./rank-summary").RankSummary;

/**
 * Partida Ranked (spec §3.4): Empezar → el servidor envía el texto → cuenta atrás 3-2-1 con
 * el texto oculto → 30 s que no se pueden parar → las pulsaciones se envían cada ~3 s →
 * el servidor puntúa y da el veredicto.
 */
export function RankedTest({ language }: { language: TestLanguage }) {
  const t = useTranslations("Ranked");
  const tt = useTranslations("TypingTest");
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  // El resumen de posición solo hace falta al terminar: se descarga durante la partida y no pesa en
  // el JS inicial de la portada (spec §7.5). A los 30 s ya está cargado, así que no hay salto (CLS = 0).
  const [RankSummary, setRankSummary] = useState<RankSummaryComponent | null>(null);

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

  useEffect(() => stopCurrent, []);

  async function submit(local: TestResult) {
    const attempt = attemptRef.current;
    const gameId = gameIdRef.current;
    const sender = senderRef.current;
    if (!gameId || !sender) return;
    setPhase({ name: "submitting" });
    const outcome = await Promise.race([
      confirm(gameId, sender),
      wait(SUBMIT_DEADLINE_MS).then((): Confirmation => ({ kind: "timeout" })),
    ]);
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

  /** Pide la partida; si el servidor exige el reto (spec 4a §2.1), lo resuelve y la pide otra vez, una sola vez. */
  async function requestStart(attempt: number): Promise<StartResponse> {
    const body = { language, env: readClientEnv() };
    try {
      return await startGame(body);
    } catch (error) {
      if (!(error instanceof GameApiError) || error.code !== "needs_challenge") throw error;
    }
    if (attempt === attemptRef.current) setPhase({ name: "challenging" });
    let turnstileToken: string;
    try {
      const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
      const container = challengeRef.current;
      if (!siteKey || !container) throw new Error("turnstile not configured");
      const { solveChallenge } = await import("./challenge");
      turnstileToken = await solveChallenge(container, siteKey);
    } catch (error) {
      throw new ChallengeFailedError(undefined, { cause: error });
    }
    return startGame({ ...body, turnstileToken });
  }

  async function start() {
    // Con un inicio en curso, repetir Tab o Espacio no pide otra partida: dos inicios a la vez
    // podrían llegar desordenados y dejar en pantalla una partida que el servidor ya cerró.
    if (startingRef.current) return;
    startingRef.current = true;
    // Si la descarga falla, el resultado sale sin el resumen y se reintenta en la siguiente partida.
    if (!RankSummary) import("./rank-summary").then((module) => setRankSummary(() => module.RankSummary), () => {});
    const attempt = ++attemptRef.current;
    stopCurrent();
    setPhase({ name: "starting" });
    typing.reset();
    try {
      const game = await requestStart(attempt).finally(() => {
        startingRef.current = false;
      });
      if (attempt !== attemptRef.current) return;
      gameIdRef.current = game.gameId;
      session.load(game.words);
      setPhase({ name: "countdown", endsAt: endsIn(game.countdownMs), durationMs: game.countdownMs });
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
      if (attempt === attemptRef.current) setPhase(failurePhase(error));
    }
  }

  const waiting = phase.name === "ready" || phase.name === "unavailable" || phase.name === "blocked";
  const done = phase.name === "result" || phase.name === "unscored";

  const typing = useTypingInput({
    target: session,
    onRestart: () => void start(),
    onEnter: () => {
      if (waiting || done) void start();
    },
    onSpace: () => {
      if (!waiting) return false;
      void start();
      return true;
    },
  });

  let status: { text: string; tone: "neutral" | "good" | "bad" } = { text: "", tone: "neutral" };
  if (phase.name === "countdown" || phase.name === "playing") status = { text: tt("restartHint"), tone: "neutral" };
  if (phase.name === "result") {
    status = phase.response.reason
      ? { text: t(REASON_MESSAGE[phase.response.reason]), tone: "bad" }
      : { text: t("verdictValid"), tone: "good" };
  }
  if (phase.name === "unscored") {
    status = { text: t(phase.reason === "replaced" ? "replaced" : "verdictConnection"), tone: "bad" };
  }
  const toneClass = {
    neutral: "text-zinc-500 dark:text-zinc-400",
    good: "font-medium text-emerald-700 dark:text-emerald-400",
    bad: "font-medium text-red-700 dark:text-red-400",
  }[status.tone];

  return (
    <section
      aria-label={tt("label")}
      data-testid="typing-area"
      className="relative flex flex-col gap-4"
      onClick={typing.focus}
    >
      <div className="flex h-10 items-center justify-between gap-4">
        <Timer endsAt={session.endsAt} durationMs={OFFICIAL_DURATION_MS} />
        <span data-testid="ranked-status" role="status" className={`line-clamp-2 text-right text-sm ${toneClass}`}>
          {status.text}
        </span>
      </div>

      {/* Sin altura reservada: debajo no hay contenido que pueda saltar al crecer el resultado (CLS = 0),
          y la pantalla inicial cabe sin scroll. */}
      <div>
        {waiting || phase.name === "starting" || phase.name === "challenging" ? (
          <div className="flex min-h-30 flex-col items-center justify-center gap-3 text-center">
            {phase.name === "unavailable" && (
              <p className="max-w-md">
                {t("unavailable")}{" "}
                <Link href="/practice" className="font-medium underline">
                  {t("practiceLink")}
                </Link>
              </p>
            )}
            {phase.name === "blocked" && (
              <p data-testid="ranked-blocked" className="max-w-md">
                {t(BLOCK_MESSAGE[phase.reason], { minutes: phase.minutes })}{" "}
                <Link href="/practice" className="font-medium underline">
                  {t("practiceLink")}
                </Link>
              </p>
            )}
            {phase.name === "challenging" && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("challenge")}</p>
            )}
            {/* Turnstile pinta aquí su widget: invisible salvo que Cloudflare pida un clic. */}
            <div ref={challengeRef} data-testid="ranked-challenge" />
            <button
              type="button"
              data-testid="ranked-start"
              onClick={() => void start()}
              disabled={phase.name === "starting" || phase.name === "challenging"}
              className="rounded-md bg-amber-500 px-6 py-3 text-lg font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {t("start")}
            </button>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("startHint")}</p>
            <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">{t("rules")}</p>
          </div>
        ) : phase.name === "countdown" ? (
          <div className="flex h-30 items-center justify-center">
            <Timer
              endsAt={phase.endsAt}
              durationMs={phase.durationMs}
              testId="countdown"
              className="font-mono text-6xl font-semibold tabular-nums text-amber-600 dark:text-amber-400"
            />
          </div>
        ) : phase.name === "playing" || phase.name === "submitting" ? (
          <div className="relative">
            <div className={typing.focused && phase.name === "playing" ? "" : "opacity-40 blur-[2px]"}>
              <WordsView engine={session.engine} />
            </div>
            {phase.name === "submitting" ? (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-medium">
                {t("submitting")}
              </p>
            ) : (
              !typing.focused && (
                <p
                  data-testid="focus-prompt"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center text-center font-medium"
                >
                  {tt("focusPrompt")}
                </p>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {phase.name === "result" && RankSummary && (
              <RankSummary
                ranking={phase.response.ranking}
                gameId={phase.response.gameId}
                language={language}
                inputType={phase.response.inputType}
              />
            )}
            <ResultView result={phase.name === "result" ? phase.response : phase.local} onRestart={() => void start()} />
          </div>
        )}
      </div>

      <input data-testid="typing-input" aria-label={tt("inputLabel")} {...typing.inputProps} />
    </section>
  );
}
