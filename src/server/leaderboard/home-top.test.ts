// @vitest-environment node
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readHomeTop } from "./home-top";

const ENTRY = { rank: 1, nick: "Gian", country: null, wpm: 90, accuracy: 98 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readHomeTop", () => {
  it("returns the top", async () => {
    expect(await readHomeTop(async () => [ENTRY], undefined)).toEqual([ENTRY]);
  });

  it("at runtime rethrows the error: Next keeps serving the last good home page", async () => {
    const failure = new Error("db down");
    await expect(readHomeTop(() => Promise.reject(failure), undefined)).rejects.toBe(failure);
  });

  it("during the build, no top", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readHomeTop(() => Promise.reject(new Error("db down")), PHASE_PRODUCTION_BUILD)).toBeNull();
  });
});
