import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { buildFrames, compactFrames, replayInputs, rhythm } from "@/lib/replay/timeline";
import { OFFICIAL_DURATION_MS } from "@/lib/scoring/durations";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { gameDetail } from "@/server/moderation/records";
import { MODE_LABEL, formatDate } from "../../format";
import { AdminNav } from "../../nav";
import { Replay } from "./replay";
import { RhythmChart } from "./rhythm-chart";

/** The title is computed after `requireAdmin()`: that way the 404 for non-admins does not give it away. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Game · Moderation" };
}

/** Any game (spec 4b §6.2): its data, its replay and its rhythm. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const game = await gameDetail(getDb(), id);
  if (!game) notFound();

  const events = game.log.kind === "ok" ? game.log.events : [];
  const steps = replayInputs(events);
  // The frames are computed here: the scoring engine does not travel to the panel's browser.
  const frames = compactFrames(buildFrames(game.log.kind === "ok" ? game.log.words : null, steps));
  const beat = rhythm(events, game.inputType);
  const durationMs = Math.max(OFFICIAL_DURATION_MS, ...steps.map((step) => step.t));
  const facts: [string, string][] = [
    ["Mode", MODE_LABEL[game.mode]],
    ["Verdict", game.rejectReason ? `${game.verdict} (${game.rejectReason})` : game.verdict],
    ["WPM", game.wpm.toFixed(1)],
    ["Raw WPM", game.rawWpm.toFixed(1)],
    ["Accuracy", `${game.accuracy.toFixed(1)} %`],
    ["Risk", String(game.riskScore)],
    ["Start", formatDate(game.startsAt)],
    ["Language and keyboard", `${game.language} · ${game.inputType}`],
  ];

  return (
    <>
      <AdminNav />
      <div className="flex flex-col gap-1">
        <h1 data-testid="admin-game-title" className="text-2xl font-semibold">
          Game by{" "}
          {game.userId ? (
            <Link href={`/admin/players/${game.userId}`} className="underline">
              {game.nick}
            </Link>
          ) : (
            "a player without an account"
          )}
        </h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-zinc-600 dark:text-zinc-400">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Replay</h2>
        {game.log.kind === "missing" ? (
          <p data-testid="admin-game-no-log" className="text-zinc-600 dark:text-zinc-400">
            No keystrokes.
          </p>
        ) : game.log.kind === "unreadable" ? (
          <p data-testid="admin-game-no-log" className="text-zinc-600 dark:text-zinc-400">
            The keystroke log cannot be read.
          </p>
        ) : (
          <>
            {game.log.words === null && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Game from before record verification: it is replayed without the text, only what was typed.
              </p>
            )}
            <Replay words={game.log.words} frames={frames} />
          </>
        )}
      </section>

      {game.log.kind === "ok" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Rhythm</h2>
          <RhythmChart intervals={beat.intervals} holds={beat.holds} durationMs={durationMs} />
        </section>
      )}
    </>
  );
}
