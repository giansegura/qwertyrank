import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Un jugador ha cambiado de nick o de país, o ha borrado su cuenta (cambios raros): se invalidan
 * en caché (ISR) todos los perfiles y rankings, y cada página se regenera en su siguiente visita.
 * Así ninguna sigue enseñando el nick o la bandera de antes (spec §6).
 */
export function revalidatePlayerPages(): void {
  revalidatePath("/[locale]/u/[nick]", "page");
  revalidatePath("/[locale]/leaderboard/[input]", "page");
}
