import "server-only";
import { NICK_PATTERN } from "@/lib/nick";
import { isProfane } from "./profanity";

/** Spec §3.6: 3–20 caracteres `[a-zA-Z0-9_]`, único sin distinguir mayúsculas, sin palabrotas. */
export { NICK_PATTERN };

export type NickProblem = "invalid" | "profane";

export function checkNick(nick: string): NickProblem | null {
  if (!NICK_PATTERN.test(nick)) return "invalid";
  if (isProfane(nick)) return "profane";
  return null;
}

/**
 * Base del nick automático: la primera palabra del nombre o, si no hay nombre, del email.
 * Solo la primera palabra, para no publicar el email entero en los rankings.
 */
export function nickBase(email: string, name: string): string {
  const source = name.trim() || email.split("@")[0];
  const word = source
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-zA-Z0-9]+/)
    .find((part) => part.length > 0);
  const base = (word ?? "").toLowerCase().slice(0, 12);
  return base.length >= 3 && !isProfane(base) ? base : "player";
}

/** `base_NN` con cifras al azar hasta encontrar uno libre; tras 6 intentos, 4 cifras. */
export async function findFreeNick(
  base: string,
  isTaken: (nick: string) => Promise<boolean>,
  random: () => number,
): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const digits = attempt < 6 ? 2 : 4;
    const suffix = String(Math.floor(random() * 10 ** digits)).padStart(digits, "0");
    const nick = `${base}_${suffix}`;
    if (checkNick(nick) === null && !(await isTaken(nick))) return nick;
  }
  throw new Error(`no free nick for ${base}`);
}
