import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/server/db/client";
import { bests } from "@/server/db/schema";

/**
 * Vacía los rankings de la base de datos de pruebas (todas sus `bests`): una prueba que necesita entrar
 * en un top 10 no puede contar con que nadie haya publicado antes marcas más rápidas. Es seguro porque
 * esa base solo la usan estas pruebas y sus archivos se ejecutan de uno en uno (`fileParallelism: false`).
 * Si una `DATABASE_URL` exportada en la shell apunta a otra base, se niega a borrar nada.
 */
export async function emptyBoards(db: DbExecutor): Promise<void> {
  const [row] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  if (!row?.name.endsWith("_test")) {
    throw new Error(`emptyBoards solo vacía bases de pruebas (nombre acabado en «_test»), no «${row?.name}»`);
  }
  await db.delete(bests);
}
