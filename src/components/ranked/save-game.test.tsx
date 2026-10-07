import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { GameApiError, claimGame } from "./api";
import { SaveGame } from "./save-game";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  claimGame: vi.fn(),
}));

const router = { push: vi.fn() };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));

// La partida de verificación tiene sus propias pruebas: aquí solo importa que se carga en su lugar.
vi.mock("../verification/verification-game", () => ({
  VerificationGame: ({ verification, onDone }: { verification: { id: string }; onDone: () => void }) => (
    <button type="button" data-testid="verification-game" onClick={onDone}>
      {verification.id}
    </button>
  ),
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

  it("en review, «Verificar ahora» empieza la verificación en esta misma pantalla; al acabar, a jugar Ranked", async () => {
    const verification = {
      id: "v1",
      language: "en" as const,
      inputType: "touch" as const,
      targetWpm: 120,
      requiredWpm: 102,
      attemptsLeft: 3,
      expiresAt: "2026-10-08T10:00:00.000Z",
    };
    vi.mocked(claimGame).mockResolvedValue({ ...SAVED, ranking: { kind: "review", ranks: { day: 1, all: 7 }, verification } });
    renderWithIntl(<SaveGame gameId="g1" />);
    fireEvent.click(await screen.findByTestId("verify-now"));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("verification-game")).toHaveTextContent("v1");
    expect(screen.queryByTestId("save-result")).toBeNull();

    fireEvent.click(screen.getByTestId("verification-game"));
    expect(router.push).toHaveBeenCalledWith("/en");
  });
});
