import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { openReportsByPlayer } from "@/server/moderation/queries";
import { CELL, HEAD_ROW, ROW, STATUS_LABEL, TABLE, formatDate } from "./format";
import { AdminNav } from "./nav";

/** The title is computed after `requireAdmin()`: that way the 404 for non-admins does not give it away. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Moderation · QwertyRank" };
}

export default async function AdminHome() {
  await requireAdmin();
  const queue = await openReportsByPlayer(getDb());

  return (
    <>
      <AdminNav />
      <h1 className="text-2xl font-semibold">Open reports</h1>
      {queue.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">There are no open reports.</p>
      ) : (
        <table data-testid="admin-reports" className={TABLE}>
          <thead>
            <tr className={HEAD_ROW}>
              <th scope="col" className={CELL}>Player</th>
              <th scope="col" className={CELL}>Status</th>
              <th scope="col" className={CELL}>Cheating</th>
              <th scope="col" className={CELL}>Offensive nick</th>
              <th scope="col" className={CELL}>Latest</th>
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
