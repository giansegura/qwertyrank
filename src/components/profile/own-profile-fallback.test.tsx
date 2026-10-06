import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getViewer } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { OwnProfileFallback } from "./own-profile-fallback";

vi.mock("@/lib/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/u/Gian" }));

const PROFILE = {
  nick: "Gian",
  country: "ES",
  memberSince: "2026-10-01T00:00:00.000Z",
  records: [{ language: "en", inputType: "physical", wpm: 80, accuracy: 97 }],
  history: [{ startsAt: "2026-10-02T10:00:00.000Z", language: "en", inputType: "physical", wpm: 80, accuracy: 97 }],
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
  it("al propio jugador le enseña su perfil", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "gian" });
    fetchMock.mockResolvedValue(Response.json(PROFILE));
    page();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Gian");
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", { cache: "no-store" });
    expect(screen.queryByText("not found")).toBeNull();
  });

  it("a otro jugador o sin sesión, la 404 de siempre", async () => {
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
