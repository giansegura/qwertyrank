// @vitest-environment node
import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { revalidatePlayerPages } from "./cache";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("revalidatePlayerPages", () => {
  it("invalida perfiles, rankings, la portada (con su top 10) y los resultados", () => {
    revalidatePlayerPages();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/[locale]/u/[nick]", "page"],
      ["/[locale]/leaderboard/[input]", "page"],
      ["/[locale]", "page"],
      ["/[locale]/r/[id]", "layout"],
    ]);
  });
});
