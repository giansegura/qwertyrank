import { routing } from "@/i18n/routing";
import { parseInput } from "./leaderboard/slugs";
import { NICK_PATTERN } from "./nick";

const LOCALES = routing.locales.join("|");
const PROFILE = new RegExp(`^/(?:${LOCALES})/u/([^/]+)/?$`);
const BOARD = new RegExp(`^/(?:${LOCALES})/leaderboard/([^/]+)/?$`);

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/**
 * Profile or ranking URL that cannot exist (spec 4a §6.4). The proxy cuts it off before rendering:
 * otherwise every made-up URL would leave its own 404 page in the ISR cache.
 */
export function isJunkPath(pathname: string): boolean {
  const profile = PROFILE.exec(pathname);
  if (profile) return !NICK_PATTERN.test(decode(profile[1]));
  const board = BOARD.exec(pathname);
  if (board) return parseInput(board[1]) === null;
  return false;
}
