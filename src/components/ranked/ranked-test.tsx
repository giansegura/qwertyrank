"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "@/i18n/navigation";
import type { FinishResponse } from "@/lib/game/types";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import type { PendingVerification } from "@/lib/verification";
import type { TestLanguage } from "@/lib/words/languages";
import { ResultView } from "../typing-test/result-view";
import { Timer } from "../typing-test/timer";
import { useTypingInput } from "../typing-test/use-typing-input";
import { WordsView } from "../typing-test/words-view";
import { readClientEnv } from "./client-env";
import { BLOCK_MESSAGE, REASON_MESSAGE, type StartFailure } from "./game-flow";
import { useServerGame } from "./use-server-game";

type RankSummaryModule = typeof import("./rank-summary");

/**
 * Partida Ranked (spec §3.4): Empezar → el servidor envía el texto → cuenta atrás 3-2-1 con
 * el texto oculto → 30 s que no se pueden parar → las pulsaciones se envían cada ~3 s →
 * el servidor puntúa y da el veredicto.
 */
export function RankedTest({ language }: { language: TestLanguage }) {
  const t = useTranslations("Ranked");
  const tt = useTranslations("TypingTest");
  const { phase, session, challengeRef, ...game } = useServerGame<FinishResponse>();
  // El resumen de posición solo hace falta al terminar: su módulo se descarga durante la partida y no pesa
  // en el JS inicial de la portada (spec §7.5). A los 30 s ya está cargado, así que no hay salto (CLS = 0).
  const [summary, setSummary] = useState<RankSummaryModule | null>(null);
  // "Verificar ahora" (spec 4b §4.1): la partida de verificación ocupa esta pantalla. La descarga y la pinta
  // el módulo del resumen; aquí solo se esconde Ranked mientras tanto.
  const [verifying, setVerifying] = useState<PendingVerification | null>(null);

  function start() {
    void game.start({ language, env: readClientEnv() }, () => {
      // Si la descarga falla, el resultado sale sin el resumen y se reintenta en la siguiente partida.
      if (!summary) import("./rank-summary").then(setSummary, () => {});
      typing.reset();
    });
  }

  /**
   * Al acabar la verificación, de vuelta al principio de Ranked (o a `failure`, si no se pudo descargar). El
   * campo oculto se crea de nuevo: se pinta ya para darle el foco, y Espacio o Intro empiezan otra partida.
   */
  function endVerification(failure?: StartFailure) {
    game.leave(failure);
    flushSync(() => setVerifying(null));
    typing.reset();
  }

  const waiting = phase.name === "idle" || phase.name === "not_started";
  const failure = phase.name === "not_started" ? phase.failure : null;
  const done = phase.name === "result" || phase.name === "unscored";

  const typing = useTypingInput({
    target: session,
    onRestart: start,
    onEnter: () => {
      if (waiting || done) start();
    },
    onSpace: () => {
      if (!waiting) return false;
      start();
      return true;
    },
  });

  if (summary && verifying) {
    return (
      <summary.LazyVerificationGame
        verification={verifying}
        onDone={() => endVerification()}
        onUnavailable={() => endVerification({ kind: "unavailable" })}
      />
    );
  }

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
            {failure !== null && failure.kind !== "blocked" && (
              <p className="max-w-md">
                {t("unavailable")}{" "}
                <Link href="/practice" className="font-medium underline">
                  {t("practiceLink")}
                </Link>
              </p>
            )}
            {failure?.kind === "blocked" && (
              <p data-testid="ranked-blocked" className="max-w-md">
                {t(BLOCK_MESSAGE[failure.reason], { minutes: failure.minutes })}{" "}
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
              onClick={start}
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
            {phase.name === "result" && summary && (
              <summary.RankSummary
                ranking={phase.response.ranking}
                gameId={phase.response.gameId}
                language={language}
                inputType={phase.response.inputType}
                onVerify={setVerifying}
              />
            )}
            <ResultView result={phase.name === "result" ? phase.response : phase.local} onRestart={start} />
          </div>
        )}
      </div>

      <input data-testid="typing-input" aria-label={tt("inputLabel")} {...typing.inputProps} />
    </section>
  );
}
