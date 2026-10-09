import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
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

// The verification game has its own tests: here all that matters is that it loads in its place.
vi.mock("../verification/verification-game", () => ({
  VerificationGame: ({ verification, onDone }: { verification: { id: string }; onDone: () => void }) => (
    <button type="button" data-testid="verification-game" onClick={onDone}>
      {verification.id}
    </button>
  ),
}));

const SAVED = {
  ranking: { kind: "ranked" as const, rank: 2, improved: true },
  language: "en" as const,
  inputType: "touch" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SaveGame", () => {
  it("saves the game and shows its position", async () => {
    vi.mocked(claimGame).mockResolvedValue(SAVED);
    renderWithIntl(<SaveGame gameId="g1" />);
    expect(await screen.findByTestId("save-result")).toHaveTextContent("Game saved to your account.");
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("#2 on the leaderboard");
    expect(claimGame).toHaveBeenCalledWith("g1");
  });

  it("after 10 minutes, explains it", async () => {
    vi.mocked(claimGame).mockRejectedValue(new GameApiError(410, "expired"));
    renderWithIntl(<SaveGame gameId="g1" />);
    expect(await screen.findByTestId("save-error")).toHaveTextContent("More than 10 minutes");
  });

  it("if it fails, it can be retried", async () => {
    vi.mocked(claimGame).mockRejectedValueOnce(new GameApiError(503, "unavailable")).mockResolvedValueOnce(SAVED);
    renderWithIntl(<SaveGame gameId="g1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("save-result")).toBeInTheDocument();
  });

  it('in review, "Verify now" starts the verification on this same screen; when done, to play Ranked', async () => {
    const verification = {
      id: "v1",
      language: "en" as const,
      inputType: "touch" as const,
      targetWpm: 120,
      requiredWpm: 102,
      attemptsLeft: 3,
      expiresAt: "2026-10-08T10:00:00.000Z",
    };
    vi.mocked(claimGame).mockResolvedValue({ ...SAVED, ranking: { kind: "review", rank: 7, verification } });
    const changed = vi.fn();
    window.addEventListener(VERIFICATION_CHANGED_EVENT, changed);
    onTestFinished(() => window.removeEventListener(VERIFICATION_CHANGED_EVENT, changed));
    renderWithIntl(<SaveGame gameId="g1" />);
    fireEvent.click(await screen.findByTestId("verify-now"));
    // The header notice requests the pending verifications again.
    expect(changed).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("verification-game")).toHaveTextContent("v1");
    expect(screen.queryByTestId("save-result")).toBeNull();

    fireEvent.click(screen.getByTestId("verification-game"));
    expect(router.push).toHaveBeenCalledWith("/en");
  });
});
