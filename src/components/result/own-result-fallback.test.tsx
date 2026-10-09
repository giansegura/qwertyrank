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
  it("con sesión pide la partida y, si es suya, la enseña", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "Gian" });
    fetchMock.mockResolvedValue(Response.json(RESULT));
    page();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("80 wpm");
    expect(fetchMock).toHaveBeenCalledWith(`/api/game/${ID}/result`, { cache: "no-store" });
    expect(screen.queryByText("not found")).toBeNull();
  });

  it("si no es suya, la 404 de siempre", async () => {
    vi.mocked(getViewer).mockResolvedValue({ nick: "otro" });
    fetchMock.mockResolvedValue(Response.json({ error: "not_found" }, { status: 404 }));
    page();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.getByText("not found")).toBeInTheDocument();
  });

  it("sin sesión o con un id que no es UUID, ni pregunta", async () => {
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
