"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { loginHref } from "@/lib/auth-paths";
import type { VerificationFinishResponse } from "@/lib/game/types";
import { displayAccuracy, displayWpm } from "@/lib/scoring/metrics";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import { VERIFICATION_MIN_ACCURACY, type PendingVerification } from "@/lib/verification";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
import { readClientEnv } from "../ranked/client-env";
import { BLOCK_MESSAGE, REASON_MESSAGE } from "../ranked/game-flow";
import { RankSummary } from "../ranked/rank-summary";
import { useServerGame } from "../ranked/use-server-game";
import { Timer } from "../typing-test/timer";
import { useTypingInput } from "../typing-test/use-typing-input";
import { CanvasWords } from "./canvas-words";

export interface VerificationGameProps {
  verification: PendingVerification;
  /**
   * Label of the finish button if the verification was not passed and still exists: on `/verify`, with other
   * pending ones, "Back to your records". Without it, or when passed, or if it no longer existed (409), "Play Ranked".
   */
  doneLabel?: string;
  /** When done. `play`: the button said "Play Ranked"; otherwise, the `doneLabel` one. */
  onDone: (play: boolean) => void;
}

/**
 * WPM it fell short by, rounded up to a tenth. In whole hundredths, like `requiredWpm`: with
 * decimals, 85 − 84.8 gives 0.20000000000000284 and it would come out as 0.3.
 */
function wpmShort(requiredWpm: number, wpm: number): number {
  return Math.ceil((Math.round(requiredWpm * 100) - Math.round(wpm * 100)) / 10) / 10;
}

/**
 * The verification game of a record (spec 4b §3.2, §4.2): the same sequence as Ranked (countdown,
 * 30 s, result), with the text in a `canvas`. Starts by itself: the player has already pressed
 * "Verify". Each start uses an attempt, so Tab does not start another one.
 */
export function VerificationGame({ verification, doneLabel, onDone }: VerificationGameProps) {
  const t = useTranslations("Verification");
  const tr = useTranslations("Ranked");
  const tt = useTranslations("TypingTest");
  const tn = useTranslations("Nav");
  const pathname = usePathname();
  const { phase, session, challengeRef, ...game } = useServerGame<VerificationFinishResponse>();
  // Tab does not start another game: each start uses an attempt.
  const typing = useTypingInput({ target: session, onRestart: () => {} });

  function start() {
    void game.start(
      { language: verification.language, env: readClientEnv(), mode: "verification", verificationId: verification.id },
      typing.reset,
    );
  }

  // Starts on mount, on the next tick: no synchronous `setState` inside the effect.
  const startOnMount = useEffectEvent(start);
  useEffect(() => {
    const timer = setTimeout(startOnMount, 0);
    return () => clearTimeout(timer);
  }, []);

  // The verification has changed (passed, with one attempt fewer or exhausted; also with the game
  // unscored, which already used its attempt: after the third there is nothing left to verify) or no longer
  // exists: the header notice requests the pending ones again.
  const gone = phase.name === "not_started" && phase.failure.kind === "no_pending";
  useEffect(() => {
    if (phase.name === "result" || phase.name === "unscored" || gone) {
      window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
    }
  }, [phase, gone]);

  const verified = phase.name === "result" && phase.response.verification.kind === "verified";
  const play = !doneLabel || verified || gone;
  const doneButton = (
    <button type="button" data-testid="verify-done" onClick={() => onDone(play)} className="self-start font-medium underline">
      {play ? t("play") : doneLabel}
    </button>
  );
  const retryButton = (
    <button
      type="button"
      data-testid="verify-retry"
      onClick={start}
      className="self-start rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400"
    >
      {t("retry")}
    </button>
  );

  /** Why it was not passed, or `null` if there is no reason to give. */
  function failureText(response: VerificationFinishResponse, requiredWpm: number): string | null {
    if (response.reason) return tr(REASON_MESSAGE[response.reason]);
    if (response.accuracy < VERIFICATION_MIN_ACCURACY) return t("lowAccuracy");
    if (response.inputType !== verification.inputType) return t("otherKeyboard", { input: verification.inputType });
    const short = wpmShort(requiredWpm, response.wpm);
    return short > 0 ? t("short", { wpm: short }) : null;
  }

  let body: ReactNode;
  if (phase.name === "idle" || phase.name === "starting" || phase.name === "challenging") {
    body = (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {phase.name === "challenging" ? tr("challenge") : t("starting")}
      </p>
    );
  } else if (phase.name === "countdown") {
    body = (
      <div className="flex h-30 items-center justify-center">
        <Timer
          endsAt={phase.endsAt}
          durationMs={phase.durationMs}
          testId="verify-countdown"
          className="font-mono text-6xl font-semibold tabular-nums text-amber-600 dark:text-amber-400"
        />
      </div>
    );
  } else if (phase.name === "playing" || phase.name === "submitting") {
    body = (
      <div className="relative">
        <div className={typing.focused && phase.name === "playing" ? "" : "opacity-40 blur-[2px]"}>
          <CanvasWords engine={session.engine} />
        </div>
        {phase.name === "submitting" ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center font-medium">
            {tr("submitting")}
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
    );
  } else if (phase.name === "result") {
    const { response } = phase;
    const outcome = response.verification;
    const score = t("score", { wpm: displayWpm(response.wpm), accuracy: displayAccuracy(response.accuracy) });
    if (outcome.kind === "verified") {
      body = (
        <div data-testid="verify-result" className="flex flex-col gap-3">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("verified")}</p>
          <p className="text-sm">{score}</p>
          <RankSummary
            ranking={outcome.ranking}
            gameId={response.gameId}
            language={verification.language}
            inputType={verification.inputType}
          />
          {doneButton}
        </div>
      );
    } else {
      // `requiredWpm` 0: the verification no longer exists (e.g. the account was deleted mid-attempt).
      const canRetry = outcome.attemptsLeft > 0 && outcome.requiredWpm > 0;
      const reason = canRetry ? failureText(response, outcome.requiredWpm) : null;
      const left = t("attemptsLeft", { attempts: outcome.attemptsLeft });
      body = (
        <div data-testid="verify-result" className="flex flex-col gap-3">
          <p className="font-medium text-red-700 dark:text-red-400">
            {canRetry ? (reason ? `${reason} ${left}` : left) : t("exhausted")}
          </p>
          <p className="text-sm">{score}</p>
          {canRetry ? retryButton : doneButton}
        </div>
      );
    }
  } else if (phase.name === "unscored") {
    body = (
      <div data-testid="verify-result" className="flex flex-col gap-3">
        <p className="font-medium text-red-700 dark:text-red-400">
          {tr(phase.reason === "replaced" ? "replaced" : "verdictConnection")}
        </p>
        {retryButton}
      </div>
    );
  } else {
    const { failure } = phase;
    body = (
      <div data-testid="verify-unavailable" className="flex flex-col gap-3">
        {failure.kind === "no_pending" ? (
          <p className="max-w-md">{t("noLongerAvailable")}</p>
        ) : failure.kind === "unauthorized" ? (
          // The session has expired: to sign in and back to this page.
          <p className="max-w-md">
            {t("sessionExpired")}{" "}
            <Link href={loginHref(pathname)} className="font-medium underline">
              {tn("signIn")}
            </Link>
          </p>
        ) : (
          <p className="max-w-md">
            {failure.kind === "blocked"
              ? tr(BLOCK_MESSAGE[failure.reason], { minutes: failure.minutes })
              : tr("unavailable")}{" "}
            <Link href="/practice" className="font-medium underline">
              {tr("practiceLink")}
            </Link>
          </p>
        )}
        {doneButton}
      </div>
    );
  }

  return (
    // Tapping or clicking anywhere (also on the `canvas`) focuses the hidden field: on mobile,
    // that is what opens the keyboard.
    <section
      aria-label={t("label")}
      data-testid="verify-area"
      className="relative flex flex-col gap-4"
      onClick={typing.focus}
    >
      <div className="flex h-10 items-center justify-between gap-4">
        <Timer endsAt={session.endsAt} durationMs={OFFICIAL_DURATION_MS} />
        <span className="text-right text-sm text-zinc-500 dark:text-zinc-400">
          {t("needs", { required: verification.requiredWpm })}
        </span>
      </div>
      {body}
      {/* Turnstile renders its widget here, if the server asks for the challenge. */}
      <div ref={challengeRef} />
      <input data-testid="typing-input" aria-label={tt("inputLabel")} {...typing.inputProps} />
    </section>
  );
}
