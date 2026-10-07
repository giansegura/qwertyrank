import "server-only";
import type { Redis } from "@upstash/redis";
import type { ClientEnv } from "@/lib/game/types";
import type { TestLanguage } from "@/lib/words/languages";

/**
 * Partidas en curso en Redis. Todas las horas oficiales salen de `TIME` dentro de los
 * scripts Lua: un único reloj para todas las funciones del servidor (spec §4.2).
 */

export const GAME_TTL_SECONDS = 120;
export const FINISHED_TTL_SECONDS = 600;
/** Topes por partida: una honesta de 30 s a 320 PPM ronda 2.400–4.000 eventos y unos 300 KB. */
export const MAX_EVENTS_PER_GAME = 6_000;
export const MAX_BYTES_PER_GAME = 512 * 1024;

export interface GameTimes {
  countdownMs: number;
  durationMs: number;
  graceMs: number;
}

/** Partida de verificación (spec 4b §3.1): de qué verificación y qué intento es. */
export interface StartedVerification {
  id: string;
  attempt: number;
}

export interface NewGame {
  id: string;
  owner: string;
  userId: string | null;
  language: TestLanguage;
  words: readonly string[];
  env: ClientEnv;
  times: GameTimes;
  /** Solo en una partida de verificación. */
  verification?: StartedVerification;
}

export interface StoredGame {
  id: string;
  owner: string;
  userId: string | null;
  language: TestLanguage;
  words: string[];
  env: ClientEnv;
  durationMs: number;
  issuedAt: number;
  startsAt: number;
  deadline: number;
  lastSeq: number;
  /** `null` en una partida Ranked. */
  verification: StartedVerification | null;
}

export interface StoredBatch {
  seq: number;
  arrivedAt: number;
  payload: string;
}

export type AppendStatus = "ok" | "duplicate" | "out_of_order" | "too_large" | "closed" | "not_found";

export type FinishClaim =
  | { kind: "ready"; game: StoredGame; batches: StoredBatch[]; finishedAt: number }
  | { kind: "done"; result: string }
  | { kind: "busy" }
  | { kind: "closed" }
  | { kind: "not_found" };

export interface GameStore {
  create(game: NewGame): Promise<StoredGame>;
  append(id: string, owner: string, seq: number, payload: string, eventCount: number): Promise<AppendStatus>;
  claimFinish(id: string, owner: string): Promise<FinishClaim>;
  complete(id: string, result: string): Promise<void>;
  release(id: string): Promise<void>;
}

const NOW_MS = `local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)`;

const CREATE = `${NOW_MS}
local startsAt = now + tonumber(ARGV[6])
local deadline = startsAt + tonumber(ARGV[7]) + tonumber(ARGV[8])
redis.call('HSET', KEYS[1],
  'owner', ARGV[2], 'userId', ARGV[10], 'language', ARGV[3], 'words', ARGV[4], 'env', ARGV[5], 'durationMs', ARGV[7],
  'issuedAt', string.format('%.0f', now), 'startsAt', string.format('%.0f', startsAt),
  'deadline', string.format('%.0f', deadline), 'lastSeq', '0', 'status', 'active',
  'mode', ARGV[11], 'verificationId', ARGV[12], 'verificationAttempt', ARGV[13])
redis.call('EXPIRE', KEYS[1], ARGV[9])
local previous = redis.call('GET', KEYS[2])
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[9])
return {string.format('%.0f', now), previous or ''}`;

const ABANDON = `if redis.call('HGET', KEYS[1], 'status') == 'active' then
  redis.call('HSET', KEYS[1], 'status', 'abandoned')
end
return 1`;

const APPEND = `local status = redis.call('HGET', KEYS[1], 'status')
if not status or redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return 'not_found' end
if status ~= 'active' then return 'closed' end
local lastSeq = tonumber(redis.call('HGET', KEYS[1], 'lastSeq'))
local seq = tonumber(ARGV[2])
if seq <= lastSeq then return 'duplicate' end
if seq ~= lastSeq + 1 then return 'out_of_order' end
local events = tonumber(redis.call('HGET', KEYS[1], 'events') or '0') + tonumber(ARGV[5])
local bytes = tonumber(redis.call('HGET', KEYS[1], 'bytes') or '0') + string.len(ARGV[3])
if events > tonumber(ARGV[6]) or bytes > tonumber(ARGV[7]) then return 'too_large' end
${NOW_MS}
redis.call('RPUSH', KEYS[2], ARGV[2] .. '|' .. string.format('%.0f', now) .. '|' .. ARGV[3])
redis.call('HSET', KEYS[1], 'lastSeq', ARGV[2], 'events', events, 'bytes', bytes)
redis.call('EXPIRE', KEYS[2], ARGV[4])
return 'ok'`;

const CLAIM = `local status = redis.call('HGET', KEYS[1], 'status')
if not status or redis.call('HGET', KEYS[1], 'owner') ~= ARGV[1] then return {'not_found'} end
if status == 'finished' then return {'done', redis.call('HGET', KEYS[1], 'result')} end
if status == 'finishing' then return {'busy'} end
if status ~= 'active' then return {'closed'} end
${NOW_MS}
redis.call('HSET', KEYS[1], 'status', 'finishing')
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return {'ready', string.format('%.0f', now), redis.call('HGETALL', KEYS[1]), redis.call('LRANGE', KEYS[2], 0, -1)}`;

const COMPLETE = `redis.call('HSET', KEYS[1], 'status', 'finished', 'result', ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('DEL', KEYS[2])
return 1`;

const RELEASE = `if redis.call('HGET', KEYS[1], 'status') == 'finishing' then
  redis.call('HSET', KEYS[1], 'status', 'active')
end
return 1`;

function parseGame(id: string, flat: string[]): StoredGame {
  const fields = new Map<string, string>();
  for (let i = 0; i < flat.length; i += 2) fields.set(flat[i], flat[i + 1]);
  const field = (name: string) => fields.get(name) ?? "";
  return {
    id,
    owner: field("owner"),
    userId: field("userId") || null,
    language: field("language") as TestLanguage,
    words: JSON.parse(field("words")),
    env: JSON.parse(field("env")),
    durationMs: Number(field("durationMs")),
    issuedAt: Number(field("issuedAt")),
    startsAt: Number(field("startsAt")),
    deadline: Number(field("deadline")),
    lastSeq: Number(field("lastSeq")),
    verification:
      field("mode") === "verification"
        ? { id: field("verificationId"), attempt: Number(field("verificationAttempt")) }
        : null,
  };
}

/** Cada tanda se guarda como `<seq>|<hora de llegada>|<JSON de eventos>`. */
function parseBatch(entry: string): StoredBatch {
  const first = entry.indexOf("|");
  const second = entry.indexOf("|", first + 1);
  return {
    seq: Number(entry.slice(0, first)),
    arrivedAt: Number(entry.slice(first + 1, second)),
    payload: entry.slice(second + 1),
  };
}

export function createGameStore(redis: Redis, prefix: string): GameStore {
  const gameKey = (id: string) => `${prefix}game:${id}`;
  const eventsKey = (id: string) => `${prefix}game:${id}:events`;
  // Una sola partida activa por jugador (spec §4.2): por usuario si tiene sesión; si no, por navegador.
  const activeKey = (game: Pick<NewGame, "owner" | "userId">) =>
    `${prefix}active:${game.userId ? `user:${game.userId}` : `anon:${game.owner}`}`;

  return {
    async create(game) {
      const { countdownMs, durationMs, graceMs } = game.times;
      const [issuedAt, previous] = (await redis.eval(
        CREATE,
        [gameKey(game.id), activeKey(game)],
        [
          game.id,
          game.owner,
          game.language,
          JSON.stringify(game.words),
          JSON.stringify(game.env),
          String(countdownMs),
          String(durationMs),
          String(graceMs),
          String(GAME_TTL_SECONDS),
          game.userId ?? "",
          game.verification ? "verification" : "ranked",
          game.verification?.id ?? "",
          game.verification ? String(game.verification.attempt) : "",
        ],
      )) as [string, string];
      if (previous && previous !== game.id) await redis.eval(ABANDON, [gameKey(previous)], []);
      const startsAt = Number(issuedAt) + countdownMs;
      return {
        id: game.id,
        owner: game.owner,
        userId: game.userId,
        language: game.language,
        words: [...game.words],
        env: game.env,
        durationMs,
        issuedAt: Number(issuedAt),
        startsAt,
        deadline: startsAt + durationMs + graceMs,
        lastSeq: 0,
        verification: game.verification ?? null,
      };
    },

    async append(id, owner, seq, payload, eventCount) {
      return (await redis.eval(
        APPEND,
        [gameKey(id), eventsKey(id)],
        [
          owner,
          String(seq),
          payload,
          String(GAME_TTL_SECONDS),
          String(eventCount),
          String(MAX_EVENTS_PER_GAME),
          String(MAX_BYTES_PER_GAME),
        ],
      )) as AppendStatus;
    },

    async claimFinish(id, owner) {
      const reply = (await redis.eval(CLAIM, [gameKey(id), eventsKey(id)], [owner, String(FINISHED_TTL_SECONDS)])) as unknown[];
      const kind = reply[0] as string;
      if (kind === "done") return { kind, result: reply[1] as string };
      if (kind !== "ready") return { kind: kind as "busy" | "closed" | "not_found" };
      return {
        kind,
        finishedAt: Number(reply[1]),
        game: parseGame(id, reply[2] as string[]),
        batches: (reply[3] as string[]).map(parseBatch),
      };
    },

    async complete(id, result) {
      await redis.eval(COMPLETE, [gameKey(id), eventsKey(id)], [result, String(FINISHED_TTL_SECONDS)]);
    },

    async release(id) {
      await redis.eval(RELEASE, [gameKey(id)], []);
    },
  };
}
