import { createDb } from "@/server/db/client";
import { setAdminRole } from "@/server/moderation/roles";
import { loadScriptEnv } from "./env";

/** `pnpm admin:grant <email> [--env <file>]` / `pnpm admin:revoke <email> [--env <file>]` (spec 4a §5.2). */
async function main() {
  const { env, args } = loadScriptEnv(process.argv.slice(2));
  const [command, email] = args;
  if ((command !== "grant" && command !== "revoke") || !email) {
    console.error("Usage: pnpm admin:grant <email> [--env <file>] | pnpm admin:revoke <email> [--env <file>]");
    process.exitCode = 1;
    return;
  }
  const db = createDb(env.databaseUrl);
  try {
    const changed = await setAdminRole(db, email, command === "grant" ? "admin" : "user");
    if (!changed) {
      console.error(`There is no account with the email ${email}.`);
      process.exitCode = 1;
      return;
    }
    console.log(command === "grant" ? `${email} is now an admin.` : `${email} is no longer an admin.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
