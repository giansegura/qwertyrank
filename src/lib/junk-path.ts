import { routing } from "@/i18n/routing";
import { parseBoardParams } from "./leaderboard/slugs";
import { NICK_PATTERN } from "./nick";

const LOCALES = routing.locales.join("|");
const PROFILE = new RegExp(`^/(?:${LOCALES})/u/([^/]+)/?$`);
const BOARD = new RegExp(`^/(?:${LOCALES})/leaderboard/([^/]+)/([^/]+)/?$`);

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/**
 * URL de perfil o de ranking que no puede existir (spec 4a §6.4). El proxy la corta antes de renderizar:
 * si no, cada URL inventada dejaría su propia página de 404 en la caché de ISR.
 */
export function isJunkPath(pathname: string): boolean {
  const profile = PROFILE.exec(pathname);
  if (profile) return !NICK_PATTERN.test(decode(profile[1]));
  const board = BOARD.exec(pathname);
  if (board) return parseBoardParams(board[1], board[2]) === null;
  return false;
}
