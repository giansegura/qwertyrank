const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 8;

/** Chart of WPM per second, in SVG to avoid adding dependencies. */
export function WpmChart({ perSecond, label }: { perSecond: readonly number[]; label: string }) {
  const max = Math.max(10, ...perSecond);
  const points = perSecond
    .map((value, i) => {
      const x =
        perSecond.length === 1
          ? WIDTH / 2
          : PADDING + (i * (WIDTH - 2 * PADDING)) / (perSecond.length - 1);
      const y = HEIGHT - PADDING - (value / max) * (HEIGHT - 2 * PADDING);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      data-testid="wpm-chart"
      className="h-40 w-full text-amber-500"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
