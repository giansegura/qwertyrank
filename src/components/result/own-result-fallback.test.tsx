import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getViewer } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { OwnResultFallback } from "./own-result-fallback";

const ID = "3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f";
const pathname = vi.hoisted(() => ({ value: "" }));

vi.mock("@/lib/viewer", () => ({ getViewer: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => pathname.value,
}));

const RESULT = {
  id: ID,
  language: "en",
  inputType: "physical",
  wpm: 80,
  accuracy: 97,
  startsAt: "2026-10-02T10:00:00.000Z",
  player: { nick: "Gian", country: null },
};
const fetchMock = vi.fn();

beforeEach(() => {
  pathname.value = `/en/r/${ID}`;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const page = () => renderWithIntl(<OwnResultFallback><p>not found</p></OwnResultFallback>);

describe("OwnResultFallback", () => {
  it("with a session requests the game and, if it is theirs, shows it", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "Gian" });
    fetchMock.mockResolvedValue(Response.json(RESULT));
    page();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("80 wpm");
    expect(fetchMock).toHaveBeenCalledWith(`/api/game/${ID}/result`, { cache: "no-store" });
    expect(screen.queryByText("not found")).toBeNull();
  });

  it("if it is not theirs, the usual 404", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "otro" });
    fetchMock.mockResolvedValue(Response.json({ error: "not_found" }, { status: 404 }));
    page();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByText("not found")).toBeInTheDocument();
  });

  it("without a session or with an id that is not a UUID, does not even ask", async () => {
    vi.mocked(getViewer).mockResolvedValue(null);
    page();
    await waitFor(() => expect(getViewer).toHaveBeenCalled());
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    cleanup();

    pathname.value = "/en/r/hola";
    vi.mocked(getViewer).mockResolvedValue({ nick: "Gian" });
    page();
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("not found")).toBeInTheDocument();
  });
});
