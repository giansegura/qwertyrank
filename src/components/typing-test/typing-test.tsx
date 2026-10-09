"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { generateWords } from "@/lib/words/generate";
import { WORDS_PER_TEST, type TestLanguage } from "@/lib/words/languages";
import { loadWordList } from "@/lib/words/load";
import { ResultView } from "./result-view";
import { Timer } from "./timer";
import { useTypingInput } from "./use-typing-input";
import { useTypingSession } from "./use-typing-session";
import { WordsView } from "./words-view";

export interface TypingTestProps {
  language: TestLanguage;
  durationMs: number;
  initialWords: readonly string[];
}

/** Local test (practice): starts with the first keystroke and is not sent to the server. */
export function TypingTest({ language, durationMs, initialWords }: TypingTestProps) {
  const t = useTranslations("TypingTest");
  const listRef = useRef<readonly string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadWordList(language).then((list) => {
      if (!cancelled) listRef.current = list;
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const session = useTypingSession({
    initialWords,
    durationMs,
    nextWords: () => generateWords(listRef.current ?? initialWords, WORDS_PER_TEST, Math.random),
  });

  function restart() {
    session.restart();
    typing.reset();
  }

  const typing = useTypingInput({
    target: session,
    onRestart: restart,
    onEnter: () => {
      if (session.status === "finished") restart();
    },
  });

  return (
    <section
      aria-label={t("label")}
      data-testid="typing-area"
      className="relative flex flex-col gap-4"
      onClick={typing.focus}
    >
      <div className="flex h-10 items-center justify-between">
        <Timer endsAt={session.endsAt} durationMs={durationMs} />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("restartHint")}</span>
      </div>

      {/* No reserved height: there is no content below that could shift when the result grows (CLS = 0),
          and the initial screen fits without scrolling. */}
      <div>
        {session.status === "finished" && session.result ? (
          <ResultView result={session.result} onRestart={restart} />
        ) : (
          <div className="relative">
            <div className={typing.focused ? "" : "opacity-40 blur-[2px]"}>
              <WordsView engine={session.engine} />
            </div>
            {!typing.focused && (
              <p
                data-testid="focus-prompt"
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-center font-medium"
              >
                {t("focusPrompt")}
              </p>
            )}
          </div>
        )}
      </div>

      <input data-testid="typing-input" aria-label={t("inputLabel")} {...typing.inputProps} />
    </section>
  );
}
