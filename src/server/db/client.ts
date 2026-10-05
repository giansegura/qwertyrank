import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "../env";
import * as schema from "./schema";

export function createDb(url: string) {
  // prepare: false porque el pooler de Neon (PgBouncer en modo transacción) no admite sentencias preparadas.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | null = null;

export function getDb(): Db {
  db ??= createDb(serverEnv().DATABASE_URL);
  return db;
}
