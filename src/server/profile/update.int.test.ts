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

describe("cambiar nick y país", () => {
  it("guarda el nick y el país", async () => {
    const id = await newUser();
    const nick = freeNick("Nuevo");
    expect(await updateProfile(id, { nick, country: "ES" })).toEqual({ ok: true });
    expect(await profileOf(id)).toEqual({ nick, country: "ES" });
  });

  it("un nick ya usado con otras mayúsculas está ocupado", async () => {
    const nick = freeNick("Gian");
    await newUser(nick);
    const id = await newUser();
    expect(await updateProfile(id, { nick: nick.toUpperCase(), country: null })).toEqual({
      ok: false,
      error: "nick_taken",
    });
  });

  it("guardar su propio nick con otras mayúsculas no cuenta como ocupado", async () => {
    const nick = freeNick("mio");
    const id = await newUser(nick);
    expect(await updateProfile(id, { nick: nick.toUpperCase(), country: null })).toEqual({ ok: true });
  });

  it("rechaza nicks con formato inválido o con palabrotas", async () => {
    const id = await newUser();
    expect(await updateProfile(id, { nick: "a b", country: null })).toEqual({ ok: false, error: "invalid_nick" });
    expect(await updateProfile(id, { nick: "sh1t_lord", country: null })).toEqual({ ok: false, error: "profane_nick" });
  });

  it("el país es opcional y tiene que ser un código ISO", async () => {
    const id = await newUser();
    expect(await updateProfile(id, { nick: freeNick("sin"), country: null })).toEqual({ ok: true });
    expect(await updateProfile(id, { nick: freeNick("mal"), country: "XX" })).toEqual({
      ok: false,
      error: "invalid_country",
    });
  });

  it("cada cambio guardado (nick o país) avisa de que cambian sus páginas en caché; uno rechazado, no", async () => {
    const id = await newUser();
    const before = changes;
    await updateProfile(id, { nick: freeNick("cambio"), country: "ES" });
    expect(changes).toBe(before + 1);
    await updateProfile(id, { nick: "a b", country: null });
    expect(changes).toBe(before + 1);
  });
});
