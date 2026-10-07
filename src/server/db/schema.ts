import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
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
import { PERIODS } from "../../lib/leaderboard/periods";
import { REPORT_REASONS } from "../../lib/reports";
import { users } from "./auth-schema";

export * from "./auth-schema";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Una fila por partida Ranked terminada (spec §5.2). Al borrar la cuenta, `user_id` pasa a NULL. */
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
  },
  (table) => [
    check("games_language_check", sql`${table.language} in ('en', 'es', 'pt')`),
    check("games_input_type_check", sql`${table.inputType} in ('physical', 'touch')`),
    check("games_verdict_check", sql`${table.verdict} in ('valid', 'review', 'rejected')`),
  ],
);

/** Pulsaciones en bruto de cada partida, en JSON comprimido con gzip. Se borran a los 30 días (fase 5). */
export const keystrokeLogs = pgTable("keystroke_logs", {
  gameId: uuid("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  events: bytea("events").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mejor partida de cada jugador por idioma, teclado y periodo (spec §5.2): la fuente de verdad de
 * los rankings. `score` es la puntuación compuesta (§5.4): ordena el top y decide si una partida mejora.
 */
export const periodBests = pgTable(
  "period_bests",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    language: text("language", { enum: ["en", "es", "pt"] }).notNull(),
    inputType: text("input_type", { enum: ["physical", "touch"] }).notNull(),
    periodType: text("period_type", { enum: PERIODS }).notNull(),
    periodKey: text("period_key").notNull(),
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id),
    wpm: doublePrecision("wpm").notNull(),
    accuracy: doublePrecision("accuracy").notNull(),
    score: bigint("score", { mode: "number" }).notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.language, table.inputType, table.periodType, table.periodKey] }),
    // El top de un ranking: filtra por la combinación y recorre la puntuación de mayor a menor.
    index("period_bests_board_idx").on(
      table.language,
      table.inputType,
      table.periodType,
      table.periodKey,
      table.score.desc(),
    ),
    check("period_bests_period_type_check", sql`${table.periodType} in ('day', 'week', 'month', 'year', 'all')`),
  ],
);

export const REPORT_STATUSES = ["open", "dismissed", "actioned"] as const;
export const MODERATION_ACTIONS = ["shadowban", "ban", "restore", "reset_nick", "grant_admin", "revoke_admin"] as const;
export const IDENTITY_KINDS = ["email", "google"] as const;

/**
 * Denuncias de jugadores (spec 4a §4). Una sola abierta por denunciante, denunciado y motivo. Si el
 * denunciado borra su cuenta, sus denuncias desaparecen; si la borra el denunciante, quedan sin él.
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
    // La cola del panel: denuncias abiertas agrupadas por denunciado.
    index("reports_status_target_idx").on(table.status, table.targetUserId),
    check("reports_reason_check", sql`${table.reason} in ('cheating', 'offensive_nick')`),
    check("reports_status_check", sql`${table.status} in ('open', 'dismissed', 'actioned')`),
  ],
);

/** Registro de cada acción de moderación (spec §4.7). Sin `admin_id` cuando la hace un script. */
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
 * Identidades de cuentas baneadas (spec 4a §3.3): HMAC del email normalizado o de la cuenta de Google.
 * Sobreviven al borrado de la cuenta (`user_id` pasa a NULL): es lo que impide volver.
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
