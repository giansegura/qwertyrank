import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db/client";
import { requireAdmin } from "@/server/moderation/admin";
import { searchPlayers } from "@/server/moderation/queries";
import { CELL, HEAD_ROW, ROW, STATUS_LABEL, TABLE, formatDate } from "../format";
import { AdminNav } from "../nav";

/** El título se calcula tras `requireAdmin()`: así la 404 para quien no es admin no lo delata. */
export async function generateMetadata(): Promise<Metadata> {
  await requireAdmin();
  return { title: "Jugadores · Moderación" };
}

interface PlayersPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  await requireAdmin();
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const players = await searchPlayers(getDb(), query);

  return (
    <>
      <AdminNav />
      <h1 className="text-2xl font-semibold">Jugadores</h1>
      <form role="search" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          aria-label="Buscar jugador"
          placeholder="Nick (empieza por…) o email exacto"
          data-testid="admin-search"
          className="w-full max-w-md rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="submit" className="rounded-md bg-zinc-900 px-4 py-2 text-white dark:bg-zinc-100 dark:text-zinc-900">
          Buscar
        </button>
      </form>
      {query.trim() !== "" &&
        (players.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nadie coincide.</p>
        ) : (
          <table className={TABLE}>
            <thead>
              <tr className={HEAD_ROW}>
                <th scope="col" className={CELL}>Nick</th>
                <th scope="col" className={CELL}>Email</th>
                <th scope="col" className={CELL}>Estado</th>
                <th scope="col" className={CELL}>Rol</th>
                <th scope="col" className={CELL}>Alta</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.id} className={ROW}>
                  <td className={CELL}>
                    <Link href={`/admin/players/${player.id}`} className="font-medium underline">
                      {player.nick}
                    </Link>
                  </td>
                  <td className={CELL}>{player.email}</td>
                  <td className={CELL}>{STATUS_LABEL[player.status]}</td>
                  <td className={CELL}>{player.role === "admin" ? "Admin" : "Jugador"}</td>
                  <td className={CELL}>{formatDate(player.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </>
  );
}
