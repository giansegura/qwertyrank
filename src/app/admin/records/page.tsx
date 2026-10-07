import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { recordQueues, type RecordRow } from "@/server/moderation/records";
import { CELL, HEAD_ROW, RECORD_STATE_LABEL, ROW, TABLE, formatDate } from "../format";
import { AdminNav } from "../nav";

/** El título se calcula tras `requireAdmin()`: así la 404 para quien no es admin no lo delata. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Récords · Moderación" };
}

function RecordTable({ rows, testId, empty }: { rows: RecordRow[]; testId: string; empty: string }) {
  if (rows.length === 0) return <p className="text-zinc-600 dark:text-zinc-400">{empty}</p>;
  return (
    // Siete columnas: en pantallas estrechas, la tabla se desplaza en horizontal.
    <div className="overflow-x-auto">
      <table data-testid={testId} className={TABLE}>
        <thead>
          <tr className={HEAD_ROW}>
            <th scope="col" className={CELL}>Jugador</th>
            <th scope="col" className={CELL}>Idioma y teclado</th>
            <th scope="col" className={CELL}>PPM</th>
            <th scope="col" className={CELL}>Intentos</th>
            <th scope="col" className={CELL}>Creado</th>
            <th scope="col" className={CELL}>Caduca o se resolvió</th>
            <th scope="col" className={CELL}>Partida</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid="admin-record-row" data-nick={row.nick} className={ROW}>
              <td className={CELL}>
                <Link href={`/admin/players/${row.userId}`} className="font-medium underline">
                  {row.nick}
                </Link>
              </td>
              <td className={CELL}>
                {row.language} · {row.inputType}
              </td>
              <td className={`${CELL} tabular-nums`}>{row.wpm.toFixed(1)}</td>
              <td className={`${CELL} tabular-nums`}>{row.attempts}</td>
              <td className={CELL}>{formatDate(row.createdAt)}</td>
              <td className={CELL}>
                {RECORD_STATE_LABEL[row.state]} · {formatDate(row.resolvedAt ?? row.expiresAt)}
              </td>
              <td className={CELL}>
                <Link href={`/admin/games/${row.gameId}`} data-testid="admin-record-replay" className="underline">
                  Reproducción
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cola de récords (spec 4b §6.1): solo consulta; el admin actúa con las sanciones de la ficha. */
export default async function RecordsPage() {
  await requireAdmin();
  const { pending, verified, closed } = await recordQueues(getDb());

  return (
    <>
      <AdminNav />
      <h1 className="text-2xl font-semibold">Récords</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pendientes</h2>
        <RecordTable rows={pending} testId="admin-records-pending" empty="No hay récords pendientes." />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Verificados (7 días)</h2>
        <RecordTable rows={verified} testId="admin-records-verified" empty="Ninguno en los últimos 7 días." />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Fallidos o caducados (7 días)</h2>
        <RecordTable rows={closed} testId="admin-records-closed" empty="Ninguno en los últimos 7 días." />
      </section>
    </>
  );
}
