import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { recordQueues, type RecordRow } from "@/server/moderation/records";
import { CELL, HEAD_ROW, RECORD_STATE_LABEL, ROW, TABLE, formatDate } from "../format";
import { AdminNav } from "../nav";

/** The title is computed after `requireAdmin()`: that way the 404 for non-admins does not give it away. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Records · Moderation" };
}

function RecordTable({ rows, testId, empty }: { rows: RecordRow[]; testId: string; empty: string }) {
  if (rows.length === 0) return <p className="text-zinc-600 dark:text-zinc-400">{empty}</p>;
  return (
    // Seven columns: on narrow screens, the table scrolls horizontally.
    <div className="overflow-x-auto">
      <table data-testid={testId} className={TABLE}>
        <thead>
          <tr className={HEAD_ROW}>
            <th scope="col" className={CELL}>Player</th>
            <th scope="col" className={CELL}>Language and keyboard</th>
            <th scope="col" className={CELL}>WPM</th>
            <th scope="col" className={CELL}>Attempts</th>
            <th scope="col" className={CELL}>Created</th>
            <th scope="col" className={CELL}>Expires or resolved</th>
            <th scope="col" className={CELL}>Game</th>
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
                  Replay
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Records queue (spec 4b §6.1): read-only; the admin acts with the sanctions on the player page. */
export default async function RecordsPage() {
  await requireAdmin();
  const { pending, verified, closed } = await recordQueues(getDb());

  return (
    <>
      <AdminNav />
      <h1 className="text-2xl font-semibold">Records</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Pending</h2>
        <RecordTable rows={pending} testId="admin-records-pending" empty="There are no pending records." />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Verified (7 days)</h2>
        <RecordTable rows={verified} testId="admin-records-verified" empty="None in the last 7 days." />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Failed or expired (7 days)</h2>
        <RecordTable rows={closed} testId="admin-records-closed" empty="None in the last 7 days." />
      </section>
    </>
  );
}
