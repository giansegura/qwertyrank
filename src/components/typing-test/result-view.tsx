import { useTranslations } from "next-intl";
import type { TestResult } from "@/lib/scoring/replay";
import { WpmChart } from "./wpm-chart";

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd data-testid={testId} className="font-mono text-4xl font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

export function ResultView({ result, onRestart }: { result: TestResult; onRestart: () => void }) {
  const t = useTranslations("Result");
  const mistakes = Object.entries(result.mistakes)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div data-testid="result" role="status" aria-live="polite" className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-4">
        <Stat label={t("wpm")} value={String(Math.round(result.wpm))} testId="result-wpm" />
        <Stat label={t("accuracy")} value={`${Math.floor(result.accuracy)}%`} testId="result-accuracy" />
        <Stat label={t("raw")} value={String(Math.round(result.rawWpm))} testId="result-raw" />
      </dl>
      <WpmChart perSecond={result.perSecond} label={t("chartLabel")} />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("mistakesTitle")}</h2>
        {mistakes.length === 0 ? (
          <p>{t("noMistakes")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2" data-testid="result-mistakes">
            {mistakes.map(([char, count]) => (
              <li key={char} className="rounded bg-zinc-100 px-2 py-1 font-mono dark:bg-zinc-800">
                <kbd>{char}</kbd> ×{count}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-md bg-amber-500 px-4 py-2 font-medium text-zinc-950 hover:bg-amber-400"
        >
          {t("restart")}
        </button>
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{t("restartHint")}</span>
      </div>
    </div>
  );
}
