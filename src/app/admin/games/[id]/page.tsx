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

/** El título se calcula tras `requireAdmin()`: así la 404 para quien no es admin no lo delata. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Partida · Moderación" };
}

/** Una partida cualquiera (spec 4b §6.2): sus datos, su reproducción y su ritmo. */
export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const game = await gameDetail(getDb(), id);
  if (!game) notFound();

  const events = game.log.kind === "ok" ? game.log.events : [];
  const steps = replayInputs(events);
  // Los fotogramas se calculan aquí: el motor de puntuación no viaja al navegador del panel.
  const frames = compactFrames(buildFrames(game.log.kind === "ok" ? game.log.words : null, steps));
  const beat = rhythm(events, game.inputType);
  const durationMs = Math.max(OFFICIAL_DURATION_MS, ...steps.map((step) => step.t));
  const facts: [string, string][] = [
    ["Modo", MODE_LABEL[game.mode]],
    ["Veredicto", game.rejectReason ? `${game.verdict} (${game.rejectReason})` : game.verdict],
    ["PPM", game.wpm.toFixed(1)],
    ["PPM brutas", game.rawWpm.toFixed(1)],
    ["Precisión", `${game.accuracy.toFixed(1)} %`],
    ["Riesgo", String(game.riskScore)],
    ["Inicio", formatDate(game.startsAt)],
    ["Idioma y teclado", `${game.language} · ${game.inputType}`],
  ];

  return (
    <>
      <AdminNav />
      <div className="flex flex-col gap-1">
        <h1 data-testid="admin-game-title" className="text-2xl font-semibold">
          Partida de{" "}
          {game.userId ? (
            <Link href={`/admin/players/${game.userId}`} className="underline">
              {game.nick}
            </Link>
          ) : (
            "un jugador sin cuenta"
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
        <h2 className="text-lg font-semibold">Reproducción</h2>
        {game.log.kind === "missing" ? (
          <p data-testid="admin-game-no-log" className="text-zinc-600 dark:text-zinc-400">
            Sin pulsaciones.
          </p>
        ) : game.log.kind === "unreadable" ? (
          <p data-testid="admin-game-no-log" className="text-zinc-600 dark:text-zinc-400">
            No se puede leer el registro de pulsaciones.
          </p>
        ) : (
          <>
            {game.log.words === null && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Partida anterior a la verificación de récords: se reproduce sin el texto, solo lo tecleado.
              </p>
            )}
            <Replay words={game.log.words} frames={frames} />
          </>
        )}
      </section>

      {game.log.kind === "ok" && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Ritmo</h2>
          <RhythmChart intervals={beat.intervals} holds={beat.holds} durationMs={durationMs} />
        </section>
      )}
    </>
  );
}
