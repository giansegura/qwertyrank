"use client";

import { useLayoutEffect, useRef } from "react";
import type { EngineState } from "@/lib/scoring/engine";
import { Word } from "./word";

/**
 * Shows 3 lines of text. Keeps the active word on the second line and
 * moves the cursor with `transform`, without re-rendering the words.
 */
export function WordsView({ engine }: { engine: EngineState }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const caret = caretRef.current;
    if (!inner || !caret) return;
    const word = inner.querySelector<HTMLElement>(`[data-index="${engine.current}"]`);
    if (!word) return;

    const lineHeight = word.offsetHeight;
    const scroll = Math.max(0, word.offsetTop - lineHeight);
    inner.style.transform = `translateY(${-scroll}px)`;

    const letters = word.querySelectorAll<HTMLElement>("[data-letter]");
    const typedLength = engine.typed[engine.current]?.length ?? 0;
    const next = letters[typedLength];
    const last = letters[letters.length - 1];
    const left = next
      ? word.offsetLeft + next.offsetLeft
      : last
        ? word.offsetLeft + last.offsetLeft + last.offsetWidth
        : word.offsetLeft;
    caret.style.transform = `translate(${left}px, ${word.offsetTop - scroll}px)`;
  });

  return (
    <div className="relative h-30 overflow-hidden font-mono text-2xl" data-testid="words">
      <div
        ref={innerRef}
        className="relative flex flex-wrap transition-transform duration-100 motion-reduce:transition-none"
      >
        {engine.words.map((word, index) => (
          <Word
            key={index}
            index={index}
            target={word}
            typed={engine.typed[index] ?? ""}
            state={index < engine.current ? "done" : index === engine.current ? "active" : "pending"}
          />
        ))}
      </div>
      <span
        ref={caretRef}
        aria-hidden="true"
        className="absolute left-0 top-1 h-8 w-0.5 bg-amber-500 transition-transform duration-75 motion-reduce:transition-none"
      />
    </div>
  );
}
