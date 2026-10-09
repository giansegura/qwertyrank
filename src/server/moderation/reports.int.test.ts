import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { reports, users } from "../db/schema";
import { createRateLimiter } from "../rate-limit";
import { createRedis } from "../redis";
import { createReports } from "./reports";

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.UPSTASH_REDIS_REST_URL!, process.env.UPSTASH_REDIS_REST_TOKEN!);
const prefix = `${process.env.REDIS_KEY_PREFIX}reports-${randomUUID().slice(0, 8)}:`;
const limit = createRateLimiter(redis, prefix);
const report = createReports(db, limit);

afterAll(async () => {
  const keys = await redis.keys(`${prefix}*`);
  if (keys.length > 0) await redis.del(...keys);
  await db.$client.end();
});

async function newUser(status: "active" | "shadowbanned" = "active") {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick: `Rep_${randomUUID().slice(0, 8)}`, status })
    .returning({ id: users.id, nick: users.nick });
  return row;
}

const openReportsAgainst = (targetId: string) =>
  db
    .select({ reporterId: reports.reporterId, reason: reports.reason, status: reports.status })
    .from(reports)
    .where(eq(reports.targetUserId, targetId));

describe("reports", () => {
  it("creates the report against the nick, in any case", async () => {
    const [reporter, target] = [await newUser(), await newUser()];
    expect(await report(reporter.id, target.nick.toUpperCase(), "cheating")).toEqual({ kind: "ok" });
    expect(await openReportsAgainst(target.id)).toEqual([{ reporterId: reporter.id, reason: "cheating", status: "open" }]);
  });

  it("a nick that does not exist is not_found; oneself, self", async () => {
    const reporter = await newUser();
    expect(await report(reporter.id, `nobody_${randomUUID().slice(0, 6)}`, "cheating")).toEqual({ kind: "not_found" });
    expect(await report(reporter.id, reporter.nick.toLowerCase(), "cheating")).toEqual({ kind: "self" });
  });

  it("repeating an open report does not create another; after dismissing it, it does", async () => {
    const [reporter, target] = [await newUser(), await newUser()];
    await report(reporter.id, target.nick, "offensive_nick");
    expect(await report(reporter.id, target.nick, "offensive_nick")).toEqual({ kind: "ok" });
    expect(await openReportsAgainst(target.id)).toHaveLength(1);
    await db.update(reports).set({ status: "dismissed" }).where(eq(reports.targetUserId, target.id));
    await report(reporter.id, target.nick, "offensive_nick");
    expect(await openReportsAgainst(target.id)).toHaveLength(2);
  });

  it("against a shadow-banned player it responds the same: it does not give them away", async () => {
    const [reporter, target] = [await newUser(), await newUser("shadowbanned")];
    expect(await report(reporter.id, target.nick, "cheating")).toEqual({ kind: "ok" });
  });

  it("past the reporter's daily limit, rate_limited", async () => {
    const limited = createReports(db, limit, { max: 2, windowMs: 86_400_000 });
    const reporter = await newUser();
    await limited(reporter.id, (await newUser()).nick, "cheating");
    await limited(reporter.id, (await newUser()).nick, "cheating");
    const third = await limited(reporter.id, (await newUser()).nick, "cheating");
    expect(third).toMatchObject({ kind: "rate_limited" });
  });
});
