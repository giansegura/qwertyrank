import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as finish } from "./[id]/finish/route";
import { POST as keys } from "./[id]/keys/route";
import { POST as start } from "./start/route";

const BASE = "http://localhost/api/game";

function post(url: string, body: unknown, cookie?: string) {
  return new NextRequest(url, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const START = { language: "es", env: { coarse: false, touchPoints: 0 } };

describe("API de partidas", () => {
  it("start devuelve el texto y crea la cookie anónima firmada", async () => {
    const response = await start(post(`${BASE}/start`, START));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.words).toHaveLength(160);
    expect(body).toMatchObject({ countdownMs: 3_000, durationMs: 30_000 });
    const cookie = response.cookies.get("qr_anon");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).toMatch(/^[0-9a-f-]{36}\./);
  });

  it("con la cookie ya creada no la vuelve a enviar", async () => {
    const first = await start(post(`${BASE}/start`, START));
    const cookie = `qr_anon=${first.cookies.get("qr_anon")!.value}`;
    const second = await start(post(`${BASE}/start`, START, cookie));
    expect(second.cookies.get("qr_anon")).toBeUndefined();
  });

  it("rechaza cuerpos inválidos con 400", async () => {
    expect((await start(post(`${BASE}/start`, { language: "fr", env: START.env }))).status).toBe(400);
    expect((await start(post(`${BASE}/start`, "no es json"))).status).toBe(400);
  });

  it("un token de Turnstile demasiado largo es un cuerpo inválido", async () => {
    const response = await start(post(`${BASE}/start`, { ...START, turnstileToken: "x".repeat(2_049) }));
    expect(response.status).toBe(400);
  });

  it("keys y finish sin cookie, o de una partida ajena, dan 404", async () => {
    const res = await start(post(`${BASE}/start`, START));
    const { gameId } = await res.json();
    expect((await keys(post(`${BASE}/${gameId}/keys`, { seq: 1, events: [] }), params(gameId))).status).toBe(404);
    const other = await start(post(`${BASE}/start`, START));
    const otherCookie = `qr_anon=${other.cookies.get("qr_anon")!.value}`;
    expect((await finish(post(`${BASE}/${gameId}/finish`, { lastSeq: 0 }, otherCookie), params(gameId))).status).toBe(404);
  });

  it("keys valida los eventos y acepta tandas en orden", async () => {
    const res = await start(post(`${BASE}/start`, START));
    const cookie = `qr_anon=${res.cookies.get("qr_anon")!.value}`;
    const { gameId } = await res.json();
    const bad = await keys(post(`${BASE}/${gameId}/keys`, { seq: 1, events: [{ t: "0", type: "input" }] }, cookie), params(gameId));
    expect(bad.status).toBe(400);
    const ok = await keys(post(`${BASE}/${gameId}/keys`, { seq: 1, events: [] }, cookie), params(gameId));
    expect(await ok.json()).toEqual({ status: "ok" });
    const gap = await keys(post(`${BASE}/${gameId}/keys`, { seq: 3, events: [] }, cookie), params(gameId));
    expect(gap.status).toBe(409);
  });
});
