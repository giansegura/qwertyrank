import "server-only";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import type { RateLimit, RateLimiter } from "../rate-limit";
import { isValidHumanPass, issueHumanPass } from "./human-pass";
import type { VerifyTurnstile } from "./turnstile";

const HOUR_MS = 60 * 60 * 1000;

/** Spec 4a §2: partidas Ranked por hora, por cuenta (o anónimo) y por IP. */
export const START_LIMITS = {
  owner: { max: 100, windowMs: HOUR_MS },
  ip: { max: 150, windowMs: HOUR_MS },
} satisfies Record<string, RateLimit>;

export interface StartGateDeps {
  db: Db;
  limit: RateLimiter;
  /** `null` sin claves de Turnstile (desarrollo local): no se exige el pase. */
  verifyTurnstile: VerifyTurnstile | null;
  passSecret: string;
  ipSecret: string;
  limits?: { owner: RateLimit; ip: RateLimit };
  now?: () => Date;
}

export interface StartGateInput {
  anonId: string;
  userId: string | null;
  ip: string | null;
  /** Valor de la cookie `qr_human`. */
  pass: string | undefined;
  turnstileToken: string | undefined;
}

/** `newPass`: pase recién ganado con el token; la ruta lo pone en la cookie aunque luego no se juegue. */
export type StartGateOutcome =
  | { kind: "needs_challenge" }
  | { kind: "ok" | "banned"; newPass: string | null }
  | { kind: "rate_limited"; retryAfter: number; newPass: string | null };

export type StartGate = (input: StartGateInput) => Promise<StartGateOutcome>;

/** Clave de la IP en los límites: HMAC con clave fija (no la sal diaria de §6: la clave vive una hora). */
export function ipLimitKey(ip: string, secret: string): string {
  return createHmac("sha256", `rate-limit:${secret}`).update(ip).digest("hex");
}

/** Antes de crear una partida Ranked (spec 4a §2): pase humano, cuenta no baneada y límites. */
export function createStartGate(deps: StartGateDeps): StartGate {
  const limits = deps.limits ?? START_LIMITS;
  const now = deps.now ?? (() => new Date());

  /** `null`: hace falta el reto. Lanza `TurnstileUnavailableError` si Cloudflare no responde. */
  async function humanPass(input: StartGateInput): Promise<{ newPass: string | null } | null> {
    if (!deps.verifyTurnstile) return { newPass: null };
    if (isValidHumanPass(input.pass, input.anonId, deps.passSecret, now())) return { newPass: null };
    if (!input.turnstileToken || !(await deps.verifyTurnstile(input.turnstileToken, input.ip))) return null;
    return { newPass: issueHumanPass(input.anonId, deps.passSecret, now()) };
  }

  return async (input) => {
    const pass = await humanPass(input);
    if (!pass) return { kind: "needs_challenge" };

    if (input.userId) {
      const [row] = await deps.db.select({ status: users.status }).from(users).where(eq(users.id, input.userId));
      // El shadow-ban juega como si nada: no debe notarse (spec §4.7).
      if (row?.status === "banned") return { kind: "banned", newPass: pass.newPass };
    }

    const owner = input.userId ? `user:${input.userId}` : `anon:${input.anonId}`;
    const results = await Promise.all([
      deps.limit("start:owner", owner, limits.owner),
      input.ip ? deps.limit("start:ip", ipLimitKey(input.ip, deps.ipSecret), limits.ip) : ({ ok: true } as const),
    ]);
    const retryAfter = Math.max(0, ...results.map((result) => (result.ok ? 0 : result.retryAfterSeconds)));
    if (retryAfter > 0) return { kind: "rate_limited", retryAfter, newPass: pass.newPass };
    return { kind: "ok", newPass: pass.newPass };
  };
}
