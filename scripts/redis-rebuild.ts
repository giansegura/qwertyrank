import { createDb } from "@/server/db/client";
import { rebuildLeaderboards } from "@/server/leaderboard/rebuild";
import { createRedis } from "@/server/redis";
import { loadScriptEnv } from "./env";

/** `pnpm redis:rebuild [--env <file>] [--yes]`: rebuilds the Redis leaderboards from PostgreSQL (spec 4a §6.1). */
async function main() {
  const { env, args } = loadScriptEnv(process.argv.slice(2));
  const write = args.includes("--yes");
  const db = createDb(env.databaseUrl);
  const redis = createRedis(env.redisUrl, env.redisToken);
  try {
    const report = await rebuildLeaderboards(db, redis, env.redisKeyPrefix, { write });
    console.log(
      write
        ? `Rewrote ${report.boards} leaderboards (${report.entries} records); deleted ${report.removed} leftover keys.`
        : `Would rewrite ${report.boards} leaderboards (${report.entries} records) and delete ${report.removed} leftover keys. Nothing written: run again with --yes to apply it.`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
