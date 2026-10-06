import { createDb } from "@/server/db/client";
import { rebuildLeaderboards } from "@/server/leaderboard/rebuild";
import { createRedis } from "@/server/redis";
import { loadScriptEnv } from "./env";

/** `pnpm redis:rebuild [--env <archivo>] [--yes]`: rehace los rankings de Redis desde PostgreSQL (spec 4a §6.1). */
async function main() {
  const { env, args } = loadScriptEnv(process.argv.slice(2));
  const write = args.includes("--yes");
  const db = createDb(env.databaseUrl);
  const redis = createRedis(env.redisUrl, env.redisToken);
  try {
    const report = await rebuildLeaderboards(db, redis, env.redisKeyPrefix, { write });
    console.log(
      write
        ? `Reescritos ${report.boards} rankings (${report.entries} marcas); borradas ${report.removed} claves sobrantes.`
        : `Se reescribirían ${report.boards} rankings (${report.entries} marcas) y se borrarían ${report.removed} claves sobrantes. Nada escrito: repite con --yes para aplicarlo.`,
    );
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
