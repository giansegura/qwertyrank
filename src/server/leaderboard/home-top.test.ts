// @vitest-environment node
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readHomeTop } from "./home-top";

const ENTRY = { rank: 1, nick: "Gian", country: null, wpm: 90, accuracy: 98 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readHomeTop", () => {
  it("devuelve el top", async () => {
    expect(await readHomeTop(async () => [ENTRY], undefined)).toEqual([ENTRY]);
  });

  it("en ejecución relanza el error: Next sigue sirviendo la última portada buena", async () => {
    const failure = new Error("db down");
    await expect(readHomeTop(() => Promise.reject(failure), undefined)).rejects.toBe(failure);
  });

  it("en el build, sin top", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readHomeTop(() => Promise.reject(new Error("db down")), PHASE_PRODUCTION_BUILD)).toBeNull();
  });
});
