import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

describe("POST /api/reports", () => {
  it("un motivo desconocido es un cuerpo inválido; sin sesión, 401", async () => {
    expect((await POST(post({ nick: "ana", reason: "spam" }))).status).toBe(400);
    expect((await POST(post({ nick: "ana", reason: "cheating" }))).status).toBe(401);
  });
});
