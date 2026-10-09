import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/game/{id}/result", () => {
  it("sin sesión responde 401 unauthorized", async () => {
    const response = await GET(new NextRequest("http://localhost/api/game/x/result"), {
      params: Promise.resolve({ id: "3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f" }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
