"use client";

import { useEffect, useState } from "react";

const defaultNow = () => performance.now();

/** Seconds remaining. Updates itself, without making the text re-render. */
export function Timer({
  endsAt,
  durationMs,
  testId = "timer",
  className = "font-mono text-2xl tabular-nums text-amber-600 dark:text-amber-400",
  now = defaultNow,
}: {
  endsAt: number | null;
  durationMs: number;
  testId?: string;
  className?: string;
  now?: () => number;
}) {
  const [tick, setTick] = useState<{ endsAt: number; seconds: number } | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    let frame = 0;
    const update = () => {
      const seconds = Math.ceil(Math.max(0, endsAt - now()) / 1000);
      setTick((prev) => (prev?.endsAt === endsAt && prev.seconds === seconds ? prev : { endsAt, seconds }));
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [endsAt, now]);

  const seconds =
    endsAt !== null && tick?.endsAt === endsAt ? tick.seconds : Math.ceil(durationMs / 1000);
  return (
    <span data-testid={testId} className={className}>
      {seconds}
    </span>
  );
}
