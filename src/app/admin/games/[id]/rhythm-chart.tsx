import type { RhythmPoint } from "@/lib/replay/timeline";

const WIDTH = 600;
const HEIGHT = 160;
/** Por encima de medio segundo, todo es "una pausa": la gráfica se corta ahí. */
const MAX_MS = 500;

/**
 * Ritmo de una partida (spec 4b §6.2) en SVG: el intervalo entre letras (línea) y, con teclado físico,
 * la duración de cada pulsación (puntos). Un ritmo plano y sin pausas es lo raro en una persona.
 */
export function RhythmChart({ intervals, holds, durationMs }: { intervals: RhythmPoint[]; holds: RhythmPoint[]; durationMs: number }) {
  const x = (t: number) => ((t / durationMs) * WIDTH).toFixed(1);
  const y = (ms: number) => (HEIGHT - (Math.min(Math.max(ms, 0), MAX_MS) / MAX_MS) * HEIGHT).toFixed(1);
  return (
    <figure className="flex flex-col gap-1">
      <svg
        data-testid="rhythm-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Ritmo: intervalo entre letras y duración de cada pulsación"
        className="w-full max-w-2xl rounded-md border border-zinc-200 dark:border-zinc-800"
      >
        <polyline
          points={intervals.map((point) => `${x(point.t)},${y(point.ms)}`).join(" ")}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
        {holds.map((point, index) => (
          <circle key={index} cx={x(point.t)} cy={y(point.ms)} r={1.5} fill="#3b82f6" />
        ))}
      </svg>
      <figcaption className="text-xs text-zinc-600 dark:text-zinc-400">
        Línea ámbar: ms entre letras. Puntos azules: ms de cada pulsación (teclado físico). Eje vertical hasta {MAX_MS} ms.
      </figcaption>
    </figure>
  );
}
