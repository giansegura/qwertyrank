import "server-only";
import { revalidatePath } from "next/cache";

/**
 * A player has changed nick or country, or has deleted their account (rare changes): every cached (ISR)
 * profile and ranking, the home page with its top 10 (spec 5b §7) and the result pages (spec 5d §3.1)
 * are invalidated, and each page is regenerated on its next visit. That way none of them keeps showing
 * the old nick or flag (spec §6).
 */
export function revalidatePlayerPages(): void {
  revalidatePath("/[locale]/u/[nick]", "page");
  revalidatePath("/[locale]/leaderboard/[input]", "page");
  revalidatePath("/[locale]", "page");
  // `layout` and not `page`: that way each game's image, which hangs off the route, expires too (spec 5d §4).
  revalidatePath("/[locale]/r/[id]", "layout");
}
