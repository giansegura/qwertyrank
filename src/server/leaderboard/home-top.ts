import "server-only";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import type { TopEntry } from "@/lib/leaderboard/types";

/**
 * The home page top 10 (spec 5b §7). If the database fails while regenerating it, the error is rethrown: Next
 * keeps serving the last good version, with its top, instead of replacing it with one without it (spec 5d §8).
 * Only during the build, where there is no previous version, does the home page come out without a top: the
 * test never depends on the ranking.
 */
export async function readHomeTop(
  read: () => Promise<TopEntry[]>,
  phase: string | undefined = process.env.NEXT_PHASE,
): Promise<TopEntry[] | null> {
  try {
    return await read();
  } catch (error) {
    if (phase !== PHASE_PRODUCTION_BUILD) throw error;
    console.error("Could not read the home page top", error);
    return null;
  }
}
