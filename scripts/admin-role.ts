import { loadEnvConfig } from "@next/env";
import { createDb } from "@/server/db/client";
import { setAdminRole } from "@/server/moderation/roles";

/** `pnpm admin:grant <email>` / `pnpm admin:revoke <email>` (spec 4a §5.2). */
async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const [command, email] = process.argv.slice(2);
  if ((command !== "grant" && command !== "revoke") || !email) {
    console.error("Uso: pnpm admin:grant <email> | pnpm admin:revoke <email>");
    process.exitCode = 1;
    return;
  }
  const db = createDb(process.env.DATABASE_URL!);
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
  console.error(error);
  process.exitCode = 1;
});
