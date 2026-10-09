import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { REPORT_REASONS } from "../../lib/reports";
import { GAME_MODES, VERIFICATION_STATUSES } from "../../lib/verification";
import { USER_STATUSES, users } from "./auth-schema";

export * from "./auth-schema";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * One row per finished game (spec §5.2), Ranked or verification (spec 4b §5.1). When the account is
 * deleted, `user_id` becomes NULL; when its verification goes away, so does `verification_id`.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    anonId: text("anon_id"),
    language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
    inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
    wpm: doublePrecision("wpm").notNull(),
    rawWpm: doublePrecision("raw_wpm").notNull(),
    accuracy: doublePrecision("accuracy").notNull(),
    verdict: text("verdict", { enum: ["valid", "review", "rejected"] }).notNull(),
    rejectReason: text("reject_reason"),
    riskScore: integer("risk_score").notNull().default(0),
    ipHash: text("ip_hash"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    mode: text("mode", { enum: GAME_MODES }).notNull().default("ranked"),
    // `AnyPgColumn`: `games` and `record_verifications` point at each other.
    verificationId: uuid("verification_id").references((): AnyPgColumn => recordVerifications.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    // On verification, every `review` game of a verification is published (spec 4b §3.3).
    index("games_verification_idx").on(table.verificationId),
    check("games_language_check", sql`${table.language} in ('en', 'es', 'pt')`),
    check("games_input_type_check", sql`${table.inputType} in ('physical', 'touch')`),
    check("games_verdict_check", sql`${table.verdict} in ('valid', 'review', 'rejected')`),
    check("games_mode_check", sql`${table.mode} in ('ranked', 'verification')`),
  ],
);

/** Raw keystrokes of each game, as gzip-compressed JSON. Deleted after 30 days (phase 5). */
export const keystrokeLogs = pgTable("keystroke_logs", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  events: bytea("events").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Each player's best game per language and keyboard (spec §5.2): the source of truth for the rankings.
 * `score` is the composite score (§5.4): it orders the top and decides whether a game is an improvement.
 */
export const bests = pgTable(
  "bests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
    inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    wpm: doublePrecision("wpm").notNull(),
    accuracy: doublePrecision("accuracy").notNull(),
    score: bigint("score", { mode: "number" }).notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.language, table.inputType] }),
    // A ranking's top: filters by language and keyboard and walks the score from highest to lowest.
    index("bests_board_idx").on(table.language, table.inputType, table.score.desc()),
  ],
);

/**
 * Rhythm extract of a game whose keystrokes are deleted after 30 days (spec 5a §3.3), to calibrate
 * the risk score (4c). It is anonymous: no player, no game, no IP, no text, no keys.
 */
export const rhythmSamples = pgTable("rhythm_samples", {
  id: uuid("id").primaryKey().defaultRandom(),
  language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
  inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
  mode: text("mode", { enum: GAME_MODES }).notNull(),
  verdict: text("verdict", { enum: ["valid", "review", "rejected"] }).notNull(),
  rejectReason: text("reject_reason"),
  wpm: doublePrecision("wpm").notNull(),
  accuracy: doublePrecision("accuracy").notNull(),
  /** Monday (UTC) of the game's week: not the day. */
  playedWeek: date("played_week").notNull(),
  /** Player status when the extract was made (`anonymous` if the game had none): the label for calibration. */
  playerStatus: text("player_status", { enum: [...USER_STATUSES, "anonymous"] }).notNull(),
  /** Milliseconds between consecutive text changes. */
  intervalsMs: integer("intervals_ms").array().notNull(),
  /** How long each keystroke lasts, in milliseconds (from `down` to its `up`). */
  holdsMs: integer("holds_ms").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const REPORT_STATUSES = ["open", "dismissed", "actioned"] as const;
export const MODERATION_ACTIONS = ["shadowban", "ban", "restore", "reset_nick", "grant_admin", "revoke_admin"] as const;
export const IDENTITY_KINDS = ["email", "google"] as const;

/**
 * Player reports (spec 4a §4). Only one open per reporter, reported player and reason. If the reported
 * player deletes their account, their reports disappear; if the reporter does, the reports stay without them.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason", { enum: REPORT_REASONS }).notNull(),
    status: text("status", { enum: REPORT_STATUSES }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("reports_open_unique_idx")
      .on(table.reporterId, table.targetUserId, table.reason)
      .where(sql`${table.status} = 'open'`),
    // The panel queue: open reports grouped by reported player.
    index("reports_status_target_idx").on(table.status, table.targetUserId),
    check("reports_reason_check", sql`${table.reason} in ('cheating', 'offensive_nick')`),
    check("reports_status_check", sql`${table.status} in ('open', 'dismissed', 'actioned')`),
  ],
);

/** Log of every moderation action (spec §4.7). No `admin_id` when a script performs it. */
export const moderationActions = pgTable(
  "moderation_actions",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    adminId: uuid("admin_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action", { enum: MODERATION_ACTIONS }).notNull(),
    reason: text("reason").notNull(),
    details: jsonb("details").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("moderation_actions_target_idx").on(table.targetUserId, table.createdAt),
    check(
      "moderation_actions_action_check",
      sql`${table.action} in ('shadowban', 'ban', 'restore', 'reset_nick', 'grant_admin', 'revoke_admin')`,
    ),
  ],
);

/**
 * Identities of banned accounts (spec 4a §3.3): HMAC of the normalized email or of the Google account.
 * They survive account deletion (`user_id` becomes NULL): that is what prevents coming back.
 */
export const bannedIdentities = pgTable(
  "banned_identities",
  {
    hash: text("hash").primaryKey(),
    kind: text("kind", { enum: IDENTITY_KINDS }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("banned_identities_user_idx").on(table.userId),
    check("banned_identities_kind_check", sql`${table.kind} in ('email', 'google')`),
  ],
);

/**
 * Verification of a record (spec 4b §5.1): only one `pending` per player, language and keyboard. `game_id`
 * is the `review` game with the highest wpm; if it is deleted, the verification goes too. It expires after
 * 24 h (`expires_at`), and that is decided when reading it.
 */
export const recordVerifications = pgTable(
  "record_verifications",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
    inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    status: text("status", { enum: VERIFICATION_STATUSES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("record_verifications_pending_idx")
      .on(table.userId, table.language, table.inputType)
      .where(sql`${table.status} = 'pending'`),
    // The panel lists (spec 4b §6.1).
    index("record_verifications_status_created_idx").on(table.status, table.createdAt),
    check("record_verifications_language_check", sql`${table.language} in ('en', 'es', 'pt')`),
    check("record_verifications_input_type_check", sql`${table.inputType} in ('physical', 'touch')`),
    check("record_verifications_status_check", sql`${table.status} in ('pending', 'verified', 'failed')`),
    // Safety net for the atomic `UPDATE` in `start` (spec 4b §3.1): never more than 3 attempts.
    check("record_verifications_attempts_check", sql`${table.attempts} between 0 and 3`),
  ],
);

/** Each player's verified level per language and keyboard (spec 4b §5.1): the wpm of the last verified record. */
export const verifiedLevels = pgTable(
  "verified_levels",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
    inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
    wpm: doublePrecision("wpm").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.language, table.inputType] }),
    check("verified_levels_language_check", sql`${table.language} in ('en', 'es', 'pt')`),
    check("verified_levels_input_type_check", sql`${table.inputType} in ('physical', 'touch')`),
  ],
);
