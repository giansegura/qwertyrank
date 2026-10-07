import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { playerDetail } from "@/server/moderation/queries";
import { dismissReportsAction, resetNickAction, setStatusAction } from "../../actions";
import {
  ACTION_LABEL,
  CELL,
  HEAD_ROW,
  REASON_LABEL,
  REPORT_STATUS_LABEL,
  ROW,
  STATUS_LABEL,
  TABLE,
  formatDate,
} from "../../format";
import { AdminNav } from "../../nav";

/** El título se calcula tras `requireAdmin()`: así la 404 para quien no es admin no lo delata. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Jugador · Moderación" };
}

const DONE: Record<string, string> = {
  shadowbanned: "Jugador en shadow-ban.",
  banned: "Jugador baneado.",
  active: "Jugador restaurado.",
  nick: "Nick cambiado.",
  dismissed: "Denuncias descartadas.",
};
const ERROR: Record<string, string> = {
  self: "No puedes actuar sobre tu propia cuenta.",
  admin: "No se puede actuar sobre otro admin.",
  unchanged: "El jugador ya tenía ese estado.",
  not_found: "El jugador no existe.",
  invalid: "Falta el motivo o no es válido (de 1 a 500 caracteres).",
  redis: "Estado guardado, pero Redis no se ha actualizado: ejecuta pnpm redis:rebuild.",
};
const STATUS_BUTTONS = [
  { status: "shadowbanned", label: "Shadow-ban" },
  { status: "banned", label: "Banear" },
  { status: "active", label: "Restaurar" },
] as const;

const FIELD = "rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";
const BUTTON = "rounded-md border border-zinc-300 px-3 py-1.5 font-medium dark:border-zinc-700";

interface PlayerPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}

export default async function PlayerPage({ params, searchParams }: PlayerPageProps) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const player = await playerDetail(getDb(), id);
  if (!player) notFound();
  const { done, error } = await searchParams;
  // `Object.hasOwn`: `?error=constructor` no debe devolver algo del prototipo.
  const notice =
    error && Object.hasOwn(ERROR, error) ? ERROR[error] : done && Object.hasOwn(DONE, done) ? DONE[done] : undefined;

  return (
    <>
      <AdminNav />
      <div className="flex flex-col gap-1">
        <h1 data-testid="admin-player-nick" className="text-2xl font-semibold">
          {player.nick}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {player.email} · {STATUS_LABEL[player.status]} · {player.role === "admin" ? "Admin" : "Jugador"} · alta{" "}
          {formatDate(player.createdAt)} · país {player.country ?? "—"} · entra con{" "}
          {player.providers.length > 0 ? player.providers.join(", ") : "enlace por email"}
        </p>
      </div>

      {notice && (
        <p
          role="status"
          data-testid="admin-notice"
          className={error ? "font-medium text-red-700 dark:text-red-400" : "font-medium text-emerald-700 dark:text-emerald-400"}
        >
          {notice}
        </p>
      )}

      {player.role === "admin" ? (
        <p className="text-zinc-600 dark:text-zinc-400">Es admin: no se puede sancionar.</p>
      ) : (
        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold">Acciones</h2>
          <form action={setStatusAction} className="flex max-w-xl flex-col gap-2">
            <input type="hidden" name="playerId" value={player.id} />
            <label className="flex flex-col gap-1 text-sm">
              Motivo (queda en el historial)
              <textarea name="reason" required maxLength={500} rows={2} data-testid="admin-reason" className={FIELD} />
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_BUTTONS.filter((button) => button.status !== player.status).map((button) => (
                <button
                  key={button.status}
                  type="submit"
                  name="status"
                  value={button.status}
                  data-testid={`admin-set-${button.status}`}
                  className={BUTTON}
                >
                  {button.label}
                </button>
              ))}
            </div>
          </form>
          <form action={resetNickAction} className="flex max-w-xl flex-col gap-2">
            <input type="hidden" name="playerId" value={player.id} />
            <label className="flex flex-col gap-1 text-sm">
              Motivo del cambio de nick
              <textarea name="reason" required maxLength={500} rows={2} data-testid="admin-nick-reason" className={FIELD} />
            </label>
            <button type="submit" data-testid="admin-reset-nick" className={`${BUTTON} self-start`}>
              Cambiar el nick por uno automático
            </button>
          </form>
          <form action={dismissReportsAction}>
            <input type="hidden" name="playerId" value={player.id} />
            <button type="submit" data-testid="admin-dismiss" className={BUTTON}>
              Descartar las denuncias abiertas
            </button>
          </form>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Récords</h2>
        {player.records.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Sin récords.</p>
        ) : (
          <ul className="text-sm">
            {player.records.map((record) => (
              <li key={`${record.language}-${record.inputType}`}>
                {record.language} · {record.inputType}: {record.wpm.toFixed(1)} ppm, {record.accuracy.toFixed(1)} %
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Últimas partidas</h2>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th scope="col" className={CELL}>Fecha</th>
              <th scope="col" className={CELL}>Idioma</th>
              <th scope="col" className={CELL}>Teclado</th>
              <th scope="col" className={CELL}>PPM</th>
              <th scope="col" className={CELL}>Precisión</th>
              <th scope="col" className={CELL}>Veredicto</th>
            </tr>
          </thead>
          <tbody>
            {player.games.map((game) => (
              <tr key={game.id} className={ROW}>
                <td className={CELL}>{formatDate(game.startsAt)}</td>
                <td className={CELL}>{game.language}</td>
                <td className={CELL}>{game.inputType}</td>
                <td className={`${CELL} tabular-nums`}>{game.wpm.toFixed(1)}</td>
                <td className={`${CELL} tabular-nums`}>{game.accuracy.toFixed(1)} %</td>
                <td className={CELL}>
                  {game.verdict}
                  {game.rejectReason ? ` (${game.rejectReason})` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Denuncias recibidas</h2>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th scope="col" className={CELL}>Fecha</th>
              <th scope="col" className={CELL}>Motivo</th>
              <th scope="col" className={CELL}>Estado</th>
              <th scope="col" className={CELL}>Denunciante</th>
            </tr>
          </thead>
          <tbody>
            {player.reports.map((report) => (
              <tr key={report.id} className={ROW}>
                <td className={CELL}>{formatDate(report.createdAt)}</td>
                <td className={CELL}>{REASON_LABEL[report.reason]}</td>
                <td className={CELL}>{REPORT_STATUS_LABEL[report.status]}</td>
                <td className={CELL}>{report.reporterNick ?? "(cuenta borrada)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Historial de moderación</h2>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th scope="col" className={CELL}>Fecha</th>
              <th scope="col" className={CELL}>Acción</th>
              <th scope="col" className={CELL}>Motivo</th>
              <th scope="col" className={CELL}>Admin</th>
            </tr>
          </thead>
          <tbody>
            {player.actions.map((action) => (
              <tr key={action.id} className={ROW}>
                <td className={CELL}>{formatDate(action.createdAt)}</td>
                <td className={CELL}>
                  {ACTION_LABEL[action.action]}
                  {action.details ? ` (${action.details.from} → ${action.details.to})` : ""}
                </td>
                <td className={CELL}>{action.reason}</td>
                <td className={CELL}>{action.adminNick ?? "script"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
