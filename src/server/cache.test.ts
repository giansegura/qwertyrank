// @vitest-environment node
import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { revalidatePlayerPages } from "./cache";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("revalidatePlayerPages", () => {
  it("invalida perfiles, rankings y la portada, que enseña el top 10", () => {
    revalidatePlayerPages();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ["/[locale]/u/[nick]", "page"],
      ["/[locale]/leaderboard/[input]", "page"],
      ["/[locale]", "page"],
    ]);
  });
});
