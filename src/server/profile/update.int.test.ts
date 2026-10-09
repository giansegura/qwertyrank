import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../db/client";
import { users } from "../db/schema";
import { createUpdateProfile } from "./update";

const db = createDb(process.env.DATABASE_URL!);
let changes = 0;
const updateProfile = createUpdateProfile(db, () => {
  changes++;
});

afterAll(async () => {
  await db.$client.end();
});

const freeNick = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

async function newUser(nick = freeNick("p")): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ name: "", email: `${randomUUID()}@example.com`, nick })
    .returning({ id: users.id });
  return row.id;
}

async function profileOf(id: string) {
  const [row] = await db.select({ nick: users.nick, country: users.country }).from(users).where(eq(users.id, id));
  return row;
}

describe("changing nick and country", () => {
  it("saves the nick and the country", async () => {
    const id = await newUser();
    const nick = freeNick("New");
    expect(await updateProfile(id, { nick, country: "ES" })).toEqual({ ok: true });
    expect(await profileOf(id)).toEqual({ nick, country: "ES" });
  });

  it("a nick already used with different casing is taken", async () => {
    const nick = freeNick("Gian");
    await newUser(nick);
    const id = await newUser();
    expect(await updateProfile(id, { nick: nick.toUpperCase(), country: null })).toEqual({
      ok: false,
      error: "nick_taken",
    });
  });

  it("saving their own nick with different casing does not count as taken", async () => {
    const nick = freeNick("mine");
    const id = await newUser(nick);
    expect(await updateProfile(id, { nick: nick.toUpperCase(), country: null })).toEqual({ ok: true });
  });

  it("rejects nicks with an invalid format or with swear words", async () => {
    const id = await newUser();
    expect(await updateProfile(id, { nick: "a b", country: null })).toEqual({ ok: false, error: "invalid_nick" });
    expect(await updateProfile(id, { nick: "sh1t_lord", country: null })).toEqual({ ok: false, error: "profane_nick" });
  });

  it("the country is optional and must be an ISO code", async () => {
    const id = await newUser();
    expect(await updateProfile(id, { nick: freeNick("none"), country: null })).toEqual({ ok: true });
    expect(await updateProfile(id, { nick: freeNick("bad"), country: "XX" })).toEqual({
      ok: false,
      error: "invalid_country",
    });
  });

  it("each saved change (nick or country) signals that their cached pages change; a rejected one does not", async () => {
    const id = await newUser();
    const before = changes;
    await updateProfile(id, { nick: freeNick("change"), country: "ES" });
    expect(changes).toBe(before + 1);
    await updateProfile(id, { nick: "a b", country: null });
    expect(changes).toBe(before + 1);
  });
});
