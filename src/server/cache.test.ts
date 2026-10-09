// @vitest-environment node
import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { revalidatePlayerPages } from "./cache";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("revalidatePlayerPages", () => {
  it("invalidates profiles, rankings, the home page (with its top 10) and the results", () => {
    revalidatePlayerPages();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/[locale]/u/[nick]", "page"],
      ["/[locale]/leaderboard/[input]", "page"],
      ["/[locale]", "page"],
      ["/[locale]/r/[id]", "layout"],
    ]);
  });
});
