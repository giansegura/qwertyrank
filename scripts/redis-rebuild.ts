import { loadEnvConfig } from "@next/env";
import { createDb } from "@/server/db/client";
import { rebuildLeaderboards } from "@/server/leaderboard/rebuild";
import { createRedis } from "@/server/redis";

/** `pnpm redis:rebuild [--yes]`: rehace los rankings de Redis desde PostgreSQL (spec 4a §6.1). */
async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const write = process.argv.includes("--yes");
  const db = createDb(process.env.DATABASE_URL!);
  const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
  try {
    const report = await rebuildLeaderboards(db, redis, process.env.REDIS_KEY_PREFIX ?? "qr:", { write });
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
  console.error(error);
  process.exitCode = 1;
});
