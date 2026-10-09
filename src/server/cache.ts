import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Un jugador ha cambiado de nick o de país, o ha borrado su cuenta (cambios raros): se invalidan
 * en caché (ISR) todos los perfiles y rankings, la portada con su top 10 (spec 5b §7) y las páginas de
 * resultado (spec 5d §3.1), y cada página se regenera en su siguiente visita. Así ninguna sigue enseñando
 * el nick o la bandera de antes (spec §6).
 */
export function revalidatePlayerPages(): void {
  revalidatePath("/[locale]/u/[nick]", "page");
  revalidatePath("/[locale]/leaderboard/[input]", "page");
  revalidatePath("/[locale]", "page");
  // `layout` y no `page`: así también caduca la imagen de cada partida, que cuelga de la ruta (spec 5d §4).
  revalidatePath("/[locale]/r/[id]", "layout");
}
