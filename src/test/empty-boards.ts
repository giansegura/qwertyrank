import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/db/client";
import { bests } from "@/server/db/schema";

/**
 * Empties the rankings of the test database (all its `bests`): a test that needs to enter a top 10
 * cannot count on nobody having published faster records before. It is safe because only these tests
 * use that database and their files run one at a time (`fileParallelism: false`).
 * If a `DATABASE_URL` exported in the shell points to another database, it refuses to delete anything.
 */
export async function emptyBoards(db: DbExecutor): Promise<void> {
  const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!row?.name.endsWith("_test")) {
    throw new Error(`emptyBoards only empties test databases (name ending in "_test"), not "${row?.name}"`);
  }
  await db.delete(bests);
}
