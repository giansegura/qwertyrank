import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "../env";
import * as schema from "./schema";

export function createDb(url: string) {
  // prepare: false because the Neon pooler (PgBouncer in transaction mode) does not support prepared statements.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

let db: Db | null = null;

export function getDb(): Db {
  db ??= createDb(serverEnv().DATABASE_URL);
  return db;
}

/** Drizzle transaction: what the `db.transaction` callback receives. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Runs queries: the connection or a transaction. */
export type DbExecutor = Db | DbTx;
