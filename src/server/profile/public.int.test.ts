import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { verifyEverywhere } from "@/test/verified";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createSaveGame, insertGame, type GameRecord } from "../game/persist";
import { getOwnProfile, getPublicProfile } from "./public";

const db = createDb(process.env.DATABASE_URL!);
const saveGame = createSaveGame(db);

afterAll(async () => {
  await db.$client.end();
});

async function newUser(status: "active" | "shadowbanned" = "active") {
  const nick = `Pub_${randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick, country: "PT", status })
    .returning({ id: users.id });
  await verifyEverywhere(db, row.id);
  return { id: row.id, nick };
}

function game(userId: string, overrides: Partial<GameRecord> = {}): GameRecord {
  const startsAt = new Date();
  return {
    id: randomUUID(),
    userId,
    anonId: randomUUID(),
    language: "pt",
    inputType: "touch",
    wpm: 55,
    rawWpm: 56,
    accuracy: 96,
    verdict: "valid",
    rejectReason: null,
    ipHash: null,
    startsAt,
    finishedAt: startsAt,
    words: [],
    batches: [],
    ...overrides,
  };
}

describe("public profile", () => {
  it("is looked up case-insensitively and brings all-time records and a history of valid games", async () => {
    const user = await newUser();
    const valid = game(user.id);
    await saveGame(valid);
    await saveGame(game(user.id, { verdict: "rejected", rejectReason: "untrusted" }));
    const profile = await getPublicProfile(db, user.nick.toLowerCase());
    expect(profile).toMatchObject({ nick: user.nick, country: "PT", memberSince: expect.any(Date) });
    // Each record and each game carries its id: they link to their result page (spec 5d §7).
    expect(profile!.records).toEqual([
      { gameId: valid.id, language: "pt", inputType: "touch", wpm: 55, accuracy: 96 },
    ]);
    expect(profile!.history).toEqual([expect.objectContaining({ id: valid.id })]);
  });

  it("does not exist for an unknown nick or for a shadow-banned player", async () => {
    expect(await getPublicProfile(db, `nobody_${randomUUID().slice(0, 6)}`)).toBeNull();
    const hidden = await newUser("shadowbanned");
    expect(await getPublicProfile(db, hidden.nick)).toBeNull();
  });

  it("the own profile shows even when shadow-banned", async () => {
    const { id, nick } = await newUser("shadowbanned");
    await saveGame(game(id));
    expect(await getPublicProfile(db, nick)).toBeNull();
    expect(await getOwnProfile(db, id)).toMatchObject({ nick, records: [expect.objectContaining({ language: "pt" })] });
  });

  it("verification games do not show in the history", async () => {
    const user = await newUser();
    await saveGame(game(user.id));
    await insertGame(db, game(user.id), { mode: "verification" });
    const profile = await getPublicProfile(db, user.nick);
    expect(profile!.history).toHaveLength(1);
  });
});
