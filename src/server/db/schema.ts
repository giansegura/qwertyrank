import { sql } from "drizzle-orm";
import { check, customType, doublePrecision, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Una fila por partida Ranked terminada (spec §5.2). `user_id` se enlaza con `users` en la fase 3. */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id"),
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
