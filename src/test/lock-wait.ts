import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";

/**
 * Waits until some session of the test database is blocked waiting for a lock: to release a
 * transaction that holds rows right when another one is already waiting for them (race tests).
 */
export async function untilASessionWaitsForALock(db: Db): Promise<void> {
  for (let tries = 0; tries < 250; tries++) {
    const waiting = await db.execute(
      sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (waiting.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("no session ended up waiting for a lock");
}
