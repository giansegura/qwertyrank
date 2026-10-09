import "server-only";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { TopEntry } from "@/lib/leaderboard/types";

/**
 * El top 10 de la portada (spec 5b §7). Si la base de datos falla al regenerarla, el error se relanza: Next
 * sigue sirviendo la última versión buena, con su top, en vez de cambiarla por una sin él (spec 5d §8). Solo
 * en el build, donde no hay versión anterior, la portada sale sin top: el test nunca depende del ranking.
 */
export async function readHomeTop(
  read: () => Promise<TopEntry[]>,
  phase: string | undefined = process.env.NEXT_PHASE,
): Promise<TopEntry[] | null> {
  try {
    return await read();
  } catch (error) {
    if (phase !== PHASE_PRODUCTION_BUILD) throw error;
    console.error("No se pudo leer el top de la portada", error);
    return null;
  }
}
