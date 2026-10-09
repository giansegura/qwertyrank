import type { RhythmPoint } from "@/lib/replay/timeline";

const WIDTH = 600;
const HEIGHT = 160;
/** Above half a second, everything is "a pause": the chart is cut off there. */
const MAX_MS = 500;

/**
 * Rhythm of a game (spec 4b §6.2) in SVG: the interval between letters (line) and, with a physical
 * keyboard, the duration of each keystroke (dots). A flat rhythm without pauses is what is odd for a person.
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
        aria-label="Rhythm: interval between letters and duration of each keystroke"
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
        Amber line: ms between letters. Blue dots: ms of each keystroke (physical keyboard). Vertical axis up to {MAX_MS} ms.
      </figcaption>
    </figure>
  );
}
