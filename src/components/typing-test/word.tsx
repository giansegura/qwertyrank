import { memo } from "react";
import { letterStatus, type LetterStatus, type WordState } from "./letter-status";

export type { WordState };

const LETTER_CLASS: Record<LetterStatus, string> = {
  pending: "text-zinc-400 dark:text-zinc-500",
  correct: "text-zinc-900 dark:text-zinc-100",
  incorrect: "text-red-600 dark:text-red-400",
  extra: "text-red-800 opacity-70 dark:text-red-300",
  missed: "text-zinc-400 dark:text-zinc-500",
};

interface WordProps {
  index: number;
  target: string;
  typed: string;
  state: WordState;
}

/** Una palabra del texto. Memoizada: al teclear solo se vuelve a pintar la palabra activa. */
export const Word = memo(function Word({ index, target, typed, state }: WordProps) {
  const length = Math.max(target.length, typed.length);
  const letters = [];
  for (let i = 0; i < length; i++) {
    const status = letterStatus(target[i], typed[i], state);
    letters.push(
      <span key={i} data-letter="" data-status={status} className={LETTER_CLASS[status]}>
        {status === "extra" ? typed[i] : target[i]}
      </span>,
    );
  }
  const wrong = state === "done" && typed !== target;
  return (
    <div
      data-testid="word"
      data-index={index}
      data-word={target}
      data-state={state}
      className={`relative mr-[1ch] h-10 leading-10 ${wrong ? "underline decoration-red-500" : ""}`}
    >
      {letters}
    </div>
  );
});
