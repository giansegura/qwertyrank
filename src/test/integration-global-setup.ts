import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Crea la base de datos de test si no existe y le aplica las migraciones. Requiere `docker compose up -d`. */
export default async function setup() {
  loadEnvConfig(process.cwd());
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  const [exists] = await admin`select 1 from pg_database where datname = ${name}`;
  if (!exists) await admin`create database ${admin(name)}`;
  await admin.end();

  const client = postgres(url.toString(), { max: 1, onnotice: () => {} });
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  await client.end();
}
