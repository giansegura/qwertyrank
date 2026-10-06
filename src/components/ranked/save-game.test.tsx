import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { GameApiError, claimGame } from "./api";
import { SaveGame } from "./save-game";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  claimGame: vi.fn(),
}));

const SAVED = {
  ranking: { kind: "ranked" as const, ranks: { day: 2, week: 2, month: 5, all: 40 }, improved: ["day" as const] },
  language: "en" as const,
  inputType: "touch" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SaveGame", () => {
  it("guarda la partida y enseña sus posiciones", async () => {
    vi.mocked(claimGame).mockResolvedValue(SAVED);
    renderWithIntl(<SaveGame gameId="g1" />);
    expect(await screen.findByTestId("save-result")).toHaveTextContent("Game saved to your account.");
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("#2 today");
    expect(claimGame).toHaveBeenCalledWith("g1");
  });

  it("pasados 10 minutos, lo explica", async () => {
    vi.mocked(claimGame).mockRejectedValue(new GameApiError(410, "expired"));
    renderWithIntl(<SaveGame gameId="g1" />);
    expect(await screen.findByTestId("save-error")).toHaveTextContent("More than 10 minutes");
  });

  it("si falla, se puede reintentar", async () => {
    vi.mocked(claimGame).mockRejectedValueOnce(new GameApiError(503, "unavailable")).mockResolvedValueOnce(SAVED);
    renderWithIntl(<SaveGame gameId="g1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("save-result")).toBeInTheDocument();
  });
});
