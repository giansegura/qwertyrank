import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createSaveGame, type GameRecord } from "../game/persist";
import { getPublicProfile } from "./public";

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
    batches: [],
    ...overrides,
  };
}

describe("perfil público", () => {
  it("se busca sin distinguir mayúsculas y trae récords de siempre e historial de partidas válidas", async () => {
    const user = await newUser();
    await saveGame(game(user.id));
    await saveGame(game(user.id, { verdict: "rejected", rejectReason: "untrusted" }));
    const profile = await getPublicProfile(db, user.nick.toLowerCase());
    expect(profile).toMatchObject({ nick: user.nick, country: "PT", memberSince: expect.any(Date) });
    expect(profile!.records).toEqual([
      { language: "pt", inputType: "touch", wpm: 55, accuracy: 96 },
    ]);
    expect(profile!.history).toHaveLength(1);
  });

  it("no existe para un nick desconocido ni para un jugador en shadow-ban", async () => {
    expect(await getPublicProfile(db, `nadie_${randomUUID().slice(0, 6)}`)).toBeNull();
    const hidden = await newUser("shadowbanned");
    expect(await getPublicProfile(db, hidden.nick)).toBeNull();
  });
});
