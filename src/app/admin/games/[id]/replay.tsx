"use client";

import { memo, useEffect, useRef, useState } from "react";
import { typedAt, type FrameDelta } from "@/lib/replay/playback";

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

const BUTTON = "rounded-md border border-zinc-300 px-3 py-1.5 font-medium dark:border-zinc-700";

/*
 * Las letras se pintan aquí y no con `Word` de la prueba: si el panel importara código de la portada,
 * Next lo movería a trozos compartidos y crecería el JS de la portada (≤ 30 KB). Mismos estados y colores.
 */
type WordState = "done" | "active" | "pending";
type LetterStatus = "pending" | "correct" | "incorrect" | "extra" | "missed";

const LETTER_CLASS: Record<LetterStatus, string> = {
  pending: "text-zinc-400 dark:text-zinc-500",
  correct: "text-zinc-900 dark:text-zinc-100",
  incorrect: "text-red-600 dark:text-red-400",
  extra: "text-red-800 opacity-70 dark:text-red-300",
  missed: "text-zinc-400 dark:text-zinc-500",
};

function letterStatus(expected: string | undefined, actual: string | undefined, state: WordState): LetterStatus {
  if (actual === undefined) return state === "done" ? "missed" : "pending";
  if (expected === undefined) return "extra";
  return actual === expected ? "correct" : "incorrect";
}

const ReplayWord = memo(function ReplayWord({ index, target, typed, state }: { index: number; target: string; typed: string; state: WordState }) {
  const letters = [];
  for (let i = 0; i < Math.max(target.length, typed.length); i++) {
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
      className={`mr-[1ch] h-10 leading-10 ${wrong ? "underline decoration-red-500" : ""}`}
    >
      {letters}
    </div>
  );
});

/**
 * Reproducción de una partida (spec 4b §6.2): las letras aparecen con sus tiempos reales (`t`), los
 * errores en rojo. Play/pausa y velocidad ×1, ×2 y ×4. Los fotogramas vienen ya calculados del servidor
 * (`compactFrames`). Sin `words` (registros anteriores a la 4b), solo lo tecleado.
 */
export function Replay({ words, frames }: { words: string[] | null; frames: FrameDelta[] }) {
  const end = frames.at(-1)?.t ?? 0;
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  // El tiempo que avanza la animación: se lee en cada fotograma, no durante el render.
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsedRef.current = Math.min(end, elapsedRef.current + (now - last) * speed);
      last = now;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= end) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, end]);

  function toggle() {
    // Al acabar, "Reproducir" vuelve a empezar.
    if (!playing && elapsedRef.current >= end) {
      elapsedRef.current = 0;
      setElapsed(0);
    }
    setPlaying(!playing);
  }

  const typed = typedAt(frames, elapsed);
  const current = typed.length - 1;
  const shown = words ?? typed;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" data-testid="replay-play" onClick={toggle} className={BUTTON}>
          {playing ? "Pausa" : "Reproducir"}
        </button>
        {SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`replay-speed-${value}`}
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
            className={`${BUTTON} ${speed === value ? "bg-zinc-200 dark:bg-zinc-800" : ""}`}
          >
            ×{value}
          </button>
        ))}
        <span data-testid="replay-time" className="tabular-nums text-zinc-600 dark:text-zinc-400">
          {(elapsed / 1000).toFixed(1)} s / {(end / 1000).toFixed(1)} s
        </span>
      </div>
      <div data-testid="replay-words" className="flex flex-wrap font-mono text-lg">
        {shown.map((word, index) => (
          <ReplayWord
            key={index}
            index={index}
            target={words ? word : (typed[index] ?? "")}
            typed={typed[index] ?? ""}
            state={index < current ? "done" : index === current ? "active" : "pending"}
          />
        ))}
      </div>
    </div>
  );
}
