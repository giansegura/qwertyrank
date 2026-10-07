"use client";

import { useEffect, useRef, useState } from "react";
import { Word } from "@/components/typing-test/word";
import { buildFrames, frameAt, type InputStep } from "@/lib/replay/timeline";

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

const BUTTON = "rounded-md border border-zinc-300 px-3 py-1.5 font-medium dark:border-zinc-700";

/**
 * Reproducción de una partida (spec 4b §6.2): las letras aparecen con sus tiempos reales (`t`), los
 * errores en rojo (como en `Word`). Play/pausa y velocidad ×1, ×2 y ×4. Sin `words` (registros
 * anteriores a la 4b), solo lo tecleado.
 */
export function Replay({ words, steps }: { words: string[] | null; steps: InputStep[] }) {
  const frames = buildFrames(words, steps);
  const end = frames[frames.length - 1].t;
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

  const current = frameAt(frames, elapsed);
  const shown = words ?? current.typed;

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
          <Word
            key={index}
            index={index}
            target={words ? word : (current.typed[index] ?? "")}
            typed={current.typed[index] ?? ""}
            state={index < current.current ? "done" : index === current.current ? "active" : "pending"}
          />
        ))}
      </div>
    </div>
  );
}
