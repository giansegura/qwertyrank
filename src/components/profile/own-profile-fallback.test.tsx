import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getViewer } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { OwnProfileFallback } from "./own-profile-fallback";

vi.mock("@/lib/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/en/u/Gian",
}));

const PROFILE = {
  nick: "Gian",
  country: "ES",
  memberSince: "2026-10-01T00:00:00.000Z",
  records: [{ gameId: "3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f", language: "en", inputType: "physical", wpm: 80, accuracy: 97 }],
  history: [{ id: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d", startsAt: "2026-10-02T10:00:00.000Z", language: "en", inputType: "physical", wpm: 80, accuracy: 97 }],
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const page = () => renderWithIntl(<OwnProfileFallback><p>not found</p></OwnProfileFallback>);

describe("OwnProfileFallback", () => {
  it("shows the player their own profile", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "gian" });
    fetchMock.mockResolvedValue(Response.json(PROFILE));
    page();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Gian");
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", { cache: "no-store" });
    expect(screen.queryByText("not found")).toBeNull();
  });

  it("to another player or without a session, the usual 404", async () => {
    for (const viewer of [{ nick: "otro" }, null]) {
      vi.mocked(getViewer).mockResolvedValue(viewer);
      page();
      await waitFor(() => expect(getViewer).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.getByText("not found")).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      cleanup();
      vi.mocked(getViewer).mockClear();
    }
  });
});
