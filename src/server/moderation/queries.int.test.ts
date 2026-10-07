import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { accounts, moderationActions, reports, users } from "../db/schema";
import { createSaveGame } from "../game/persist";
import { isAdmin, openReportsByPlayer, playerDetail, searchPlayers } from "./queries";

const db = createDb(process.env.DATABASE_URL!);
const saveGame = createSaveGame(db);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(nick = `q_${randomUUID().slice(0, 8)}`, role: "user" | "admin" = "user") {
  const email = `${randomUUID()}@example.com`;
  const [row] = await db.insert(users).values({ name: "", email, nick, role }).returning({ id: users.id });
  await verifyEverywhere(db, row.id);
  return { id: row.id, nick, email };
}

describe("consultas del panel", () => {
  it("cola: denuncias abiertas por jugador, cuántas de cada motivo, primero los más denunciados", async () => {
    const [a, b, first, second] = [await newUser(), await newUser(), await newUser(), await newUser()];
    await db.insert(reports).values([
      { reporterId: a.id, targetUserId: first.id, reason: "cheating" },
      { reporterId: b.id, targetUserId: first.id, reason: "cheating" },
      { reporterId: a.id, targetUserId: first.id, reason: "offensive_nick" },
      { reporterId: a.id, targetUserId: second.id, reason: "cheating" },
      { reporterId: b.id, targetUserId: second.id, reason: "cheating", status: "dismissed" },
    ]);
    const queue = (await openReportsByPlayer(db, 10_000)).filter((row) => [first.id, second.id].includes(row.id));
    expect(queue.map(({ id, nick, cheating, offensiveNick }) => ({ id, nick, cheating, offensiveNick }))).toEqual([
      { id: first.id, nick: first.nick, cheating: 2, offensiveNick: 1 },
      { id: second.id, nick: second.nick, cheating: 1, offensiveNick: 0 },
    ]);
    expect(queue[0].latest).toBeInstanceOf(Date);
  });

  it("busca por el principio del nick sin distinguir mayúsculas, o por el email exacto", async () => {
    const tag = randomUUID().slice(0, 6);
    const ana = await newUser(`Ana_${tag}`);
    expect((await searchPlayers(db, `ana_${tag.toUpperCase()}`)).map((player) => player.id)).toEqual([ana.id]);
    expect((await searchPlayers(db, ana.email.toUpperCase())).map((player) => player.id)).toEqual([ana.id]);
    expect(await searchPlayers(db, "   ")).toEqual([]);
  });

  it("busca el texto tal cual, sin comodines", async () => {
    const tag = randomUUID().slice(0, 6);
    const literal = await newUser(`ab_${tag}`);
    await newUser(`abx${tag}`);
    expect((await searchPlayers(db, `ab_${tag}`)).map((player) => player.id)).toEqual([literal.id]);
    expect(await searchPlayers(db, `%${tag}`)).toEqual([]);
  });

  it("ficha: datos, proveedores, récords, partidas, denuncias y acciones con sus nicks", async () => {
    const [admin, reporter, player] = [await newUser(), await newUser(), await newUser()];
    await db.insert(accounts).values({ userId: player.id, accountId: randomUUID(), providerId: "google" });
    const startsAt = new Date();
    await saveGame({
      id: randomUUID(),
      userId: player.id,
      anonId: randomUUID(),
      language: "en",
      inputType: "physical",
      wpm: 90,
      rawWpm: 91,
      accuracy: 97,
      verdict: "valid",
      rejectReason: null,
      ipHash: null,
      startsAt,
      finishedAt: startsAt,
      words: [],
      batches: [],
    });
    await db.insert(reports).values({ reporterId: reporter.id, targetUserId: player.id, reason: "cheating" });
    await db.insert(moderationActions).values({ adminId: admin.id, targetUserId: player.id, action: "shadowban", reason: "x" });

    expect(await playerDetail(db, player.id)).toMatchObject({
      id: player.id,
      nick: player.nick,
      email: player.email,
      status: "active",
      role: "user",
      providers: ["google"],
      records: [expect.objectContaining({ language: "en", inputType: "physical", wpm: 90 })],
      games: [expect.objectContaining({ verdict: "valid", rejectReason: null, mode: "ranked" })],
      reports: [expect.objectContaining({ reason: "cheating", status: "open", reporterNick: reporter.nick })],
      actions: [expect.objectContaining({ action: "shadowban", reason: "x", adminNick: admin.nick })],
    });
    // Sus niveles verificados (los de `verifyEverywhere`).
    expect((await playerDetail(db, player.id))!.verifiedLevels).toContainEqual({
      language: "en",
      inputType: "physical",
      wpm: 1_000,
      verifiedAt: expect.any(Date),
    });
    expect(await playerDetail(db, randomUUID())).toBeNull();
  });

  it("solo es admin quien tiene el rol en la base de datos", async () => {
    expect(await isAdmin(db, (await newUser(undefined, "admin")).id)).toBe(true);
    expect(await isAdmin(db, (await newUser()).id)).toBe(false);
    expect(await isAdmin(db, randomUUID())).toBe(false);
  });
});
