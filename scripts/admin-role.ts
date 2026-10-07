import { createDb } from "@/server/db/client";
import { setAdminRole } from "@/server/moderation/roles";
import { loadScriptEnv } from "./env";

/** `pnpm admin:grant <email> [--env <archivo>]` / `pnpm admin:revoke <email> [--env <archivo>]` (spec 4a §5.2). */
async function main() {
  const { env, args } = loadScriptEnv(process.argv.slice(2));
  const [command, email] = args;
  if ((command !== "grant" && command !== "revoke") || !email) {
    console.error("Uso: pnpm admin:grant <email> [--env <archivo>] | pnpm admin:revoke <email> [--env <archivo>]");
    process.exitCode = 1;
    return;
  }
  const db = createDb(env.databaseUrl);
  try {
    const changed = await setAdminRole(db, email, command === "grant" ? "admin" : "user");
    if (!changed) {
      console.error(`No hay ninguna cuenta con el email ${email}.`);
      process.exitCode = 1;
      return;
    }
    console.log(command === "grant" ? `${email} ya es admin.` : `${email} ya no es admin.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
