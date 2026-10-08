import type { DbExecutor } from "@/server/db/client";
import { bests } from "@/server/db/schema";

/**
 * Vacía los rankings de la base de datos de pruebas (todas sus `bests`): una prueba que necesita entrar
 * en un top 10 no puede contar con que nadie haya publicado antes marcas más rápidas. Es seguro porque
 * esa base solo la usan estas pruebas y sus archivos se ejecutan de uno en uno (`fileParallelism: false`).
 */
export async function emptyBoards(db: DbExecutor): Promise<void> {
  await db.delete(bests);
}
