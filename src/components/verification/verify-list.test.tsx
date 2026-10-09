import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { VerifyList } from "./verify-list";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));
// The game has its own tests: here all that matters is that it loads with the chosen verification, the
// label it is given to go back to the list and how it ends (`play`: to play Ranked; otherwise, to the list).
const fakeGame = () => ({
  VerificationGame: ({
    verification,
    onDone,
    doneLabel,
  }: {
    verification: { id: string };
    onDone: (play: boolean) => void;
    doneLabel?: string;
  }) => (
    <>
      <button type="button" data-testid="verification-game" onClick={() => onDone(false)}>
        {verification.id}
      </button>
      <button type="button" data-testid="verification-play" onClick={() => onDone(true)}>
        play
      </button>
      <span data-testid="verification-done-label">{doneLabel ?? ""}</span>
    </>
  ),
});
vi.mock("./verification-game", () => fakeGame());

const PENDING = [
  {
    id: "v1",
    language: "es" as const,
    inputType: "touch" as const,
    targetWpm: 61.5,
    requiredWpm: 52.3,
    attemptsLeft: 1,
    expiresAt: new Date(Date.now() + 2.5 * 3_600_000).toISOString(),
  },
];
const OTHER = { ...PENDING[0], id: "v2", language: "en" as const, inputType: "physical" as const };

/** Picks the first verification and waits for its game to download. */
async function startFirst() {
  fireEvent.click(screen.getAllByTestId("verify-start")[0]);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("VerifyList", () => {
  it("lists each record with what it needs, attempts and hours", async () => {
    renderWithIntl(<VerifyList pending={PENDING} />);
    const item = screen.getByTestId("verify-item");
    expect(item).toHaveTextContent("Spanish · touch keyboard");
    expect(item).toHaveTextContent("Record: 61.5 wpm · you need 52.3 wpm · 1 attempt");
    expect(await screen.findByText(/· 3 h left/)).toBeInTheDocument();
  });

  it('with other pending ones, picking one starts its game; when not passed, "Back to your records" requests the list again', async () => {
    renderWithIntl(<VerifyList pending={[...PENDING, OTHER]} />, "es");
    await startFirst();
    expect(screen.getByTestId("verification-game")).toHaveTextContent("v1");
    expect(screen.queryByTestId("verify-list")).toBeNull();
    expect(screen.getByTestId("verification-done-label")).toHaveTextContent("Volver a tus récords");
    fireEvent.click(screen.getByTestId("verification-game"));
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("verify-list")).toBeInTheDocument();
  });

  it('with no other pending ones, the game does not offer going back to the list: when done, "Play Ranked" goes to the home page', async () => {
    renderWithIntl(<VerifyList pending={PENDING} />, "es");
    await startFirst();
    expect(screen.getByTestId("verification-done-label")).toHaveTextContent(/^$/);
    fireEvent.click(screen.getByTestId("verification-play"));
    expect(router.push).toHaveBeenCalledWith("/es");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('verified, or if it was no longer available (409), "Play Ranked" goes to the home page even if others remain', async () => {
    renderWithIntl(<VerifyList pending={[...PENDING, OTHER]} />, "es");
    await startFirst();
    fireEvent.click(screen.getByTestId("verification-play"));
    expect(router.push).toHaveBeenCalledWith("/es");
  });

  it("with no pending ones says so and leads to play", () => {
    renderWithIntl(<VerifyList pending={[]} />);
    expect(screen.getByText("You have no records waiting for verification.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play Ranked" })).toHaveAttribute("href", "/en");
  });

  it("if the verification game cannot be downloaded, says Ranked is unavailable", async () => {
    // Without the module already loaded: downloading the game fails.
    vi.doMock("./verification-game", () => {
      throw new Error("chunk load failed");
    });
    vi.resetModules();
    try {
      renderWithIntl(<VerifyList pending={PENDING} />);
      await startFirst();
      expect(screen.getByRole("alert")).toHaveTextContent("Ranked isn't available right now.");
      expect(screen.getByRole("link", { name: "Go to practice" })).toHaveAttribute("href", "/en/practice");
      expect(screen.queryByTestId("verification-game")).toBeNull();
    } finally {
      vi.doMock("./verification-game", () => fakeGame());
      vi.resetModules();
    }
  });
});
