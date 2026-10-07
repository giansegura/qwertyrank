import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";

/**
 * Espera a que alguna sesión de la base de datos de pruebas esté bloqueada esperando un cerrojo: para
 * soltar una transacción que retiene filas justo cuando otra ya espera por ellas (pruebas de carreras).
 */
export async function untilASessionWaitsForALock(db: Db): Promise<void> {
  for (let tries = 0; tries < 250; tries++) {
    const waiting = await db.execute(
      sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if (waiting.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("ninguna sesión llegó a esperar un cerrojo");
}
