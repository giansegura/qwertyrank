import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { openReportsByPlayer } from "@/server/moderation/queries";
import { CELL, HEAD_ROW, ROW, STATUS_LABEL, TABLE, formatDate } from "./format";
import { AdminNav } from "./nav";

/** El título se calcula tras `requireAdmin()`: así la 404 para quien no es admin no lo delata. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Moderación · QwertyRank" };
}

export default async function AdminHome() {
  await requireAdmin();
  const queue = await openReportsByPlayer(getDb());

  return (
    <>
      <AdminNav />
      <h1 className="text-2xl font-semibold">Denuncias abiertas</h1>
      {queue.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">No hay denuncias abiertas.</p>
      ) : (
        <table data-testid="admin-reports" className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th scope="col" className={CELL}>Jugador</th>
              <th scope="col" className={CELL}>Estado</th>
              <th scope="col" className={CELL}>Trampas</th>
              <th scope="col" className={CELL}>Nick ofensivo</th>
              <th scope="col" className={CELL}>Última</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.id} data-testid="admin-report-row" data-nick={row.nick} className={ROW}>
                <td className={CELL}>
                  <Link href={`/admin/players/${row.id}`} className="font-medium underline">
                    {row.nick}
                  </Link>
                </td>
                <td className={CELL}>{STATUS_LABEL[row.status]}</td>
                <td className={`${CELL} tabular-nums`}>{row.cheating}</td>
                <td className={`${CELL} tabular-nums`}>{row.offensiveNick}</td>
                <td className={CELL}>{formatDate(row.latest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
