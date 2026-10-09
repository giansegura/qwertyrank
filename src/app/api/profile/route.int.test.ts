import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/profile", () => {
  it("without a session it responds 401 unauthorized", async () => {
    const response = await GET(new NextRequest("http://localhost/api/profile"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
