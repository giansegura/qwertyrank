import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { VerificationFinishResponse } from "@/lib/game/types";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { GameApiError, finishGame, sendKeys, startGame } from "../ranked/api";
import { solveChallenge } from "../ranked/challenge";
import { VerificationGame } from "./verification-game";

vi.mock("../ranked/challenge", () => ({ solveChallenge: vi.fn() }));
vi.mock("../ranked/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ranked/api")>()),
  startGame: vi.fn(),
  sendKeys: vi.fn(),
  finishGame: vi.fn(),
}));
// The page the game is played on: the sign-in link returns to it if the session has expired.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/en/verify",
}));
// jsdom does not draw: the canvas has its own tests.
vi.mock("./canvas-words", () => ({ CanvasWords: () => <canvas data-testid="verify-canvas" /> }));

const VERIFICATION = {
  id: "v1",
  language: "es" as const,
  inputType: "physical" as const,
  targetWpm: 100,
  requiredWpm: 85,
  attemptsLeft: 3,
  expiresAt: "2026-10-08T10:00:00.000Z",
};
const GAME = { gameId: "g1", words: ["hola", "mundo"], countdownMs: 3_000, durationMs: 30_000 };

function response(overrides: Partial<VerificationFinishResponse> = {}): VerificationFinishResponse {
  return {
    gameId: "g1",
    wpm: 80,
    rawWpm: 80,
    accuracy: 98,
    correctChars: 200,
    typedChars: 200,
    perSecond: Array(30).fill(80),
    mistakes: {},
    inputType: "physical",
    verdict: "valid",
    reason: null,
    verification: { kind: "failed", requiredWpm: 85, attemptsLeft: 2 },
    ...overrides,
  };
}

/** Mounts the game and lets it start by itself (and lets the server's delay pass). */
async function mount(onDone = vi.fn(), doneLabel?: string) {
  renderWithIntl(<VerificationGame verification={VERIFICATION} onDone={onDone} doneLabel={doneLabel} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
  });
  return onDone;
}

/** Counts the times the game tells the header that its verifications have changed. */
function listenVerificationChanged() {
  const changed = vi.fn();
  window.addEventListener(VERIFICATION_CHANGED_EVENT, changed);
  onTestFinished(() => window.removeEventListener(VERIFICATION_CHANGED_EVENT, changed));
  return changed;
}

/** Countdown and 30 s of game until the result. */
async function playToTheEnd() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(startGame).mockResolvedValue(GAME);
  vi.mocked(sendKeys).mockResolvedValue(undefined);
  vi.mocked(finishGame).mockResolvedValue(response());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("VerificationGame", () => {
  it("starts by itself: requests the verification game and, after the countdown, the text goes in the canvas and not in the DOM", async () => {
    await mount();
    expect(startGame).toHaveBeenCalledWith({
      language: "es",
      env: { coarse: false, touchPoints: 0 },
      mode: "verification",
      verificationId: "v1",
    });
    expect(screen.getByTestId("verify-countdown")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByTestId("verify-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("verify-area")).not.toHaveTextContent("hola");
    expect(screen.queryAllByTestId("word")).toHaveLength(0);
  });

  it("tapping the text focuses the hidden field (the one that opens the mobile keyboard)", async () => {
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    const input = screen.getByTestId("typing-input");
    act(() => input.blur());
    expect(input).not.toHaveFocus();
    expect(screen.getByTestId("focus-prompt")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("verify-canvas"));
    expect(input).toHaveFocus();
    expect(screen.queryByTestId("focus-prompt")).toBeNull();
  });

  it("passed: verified!, with its position, and goes back to Ranked", async () => {
    vi.mocked(finishGame).mockResolvedValue(
      response({
        wpm: 110,
        verification: { kind: "verified", ranking: { kind: "ranked", rank: 3, improved: true } },
      }),
    );
    const changed = listenVerificationChanged();
    const onDone = await mount();
    expect(changed).not.toHaveBeenCalled();
    await playToTheEnd();
    expect(finishGame).toHaveBeenCalledWith("g1", { lastSeq: 0 });
    expect(screen.getByTestId("verify-result")).toHaveTextContent("Verified! Your record is now on the ranking.");
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("#3 on the leaderboard");
    // The header notice requests the pending ones again: this one no longer is.
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("verify-done"));
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("not passed: how much it fell short by and how many attempts are left, and allows retrying", async () => {
    const changed = listenVerificationChanged();
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("You were 5 wpm short. You have 2 attempts left.");
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("verify-retry"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("verify-countdown")).toBeInTheDocument();
  });

  it("the shortfall is counted in hundredths: 85 − 84.8 is 0.2 and not 0.3", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ wpm: 84.8 }));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("You were 0.2 wpm short. You have 2 attempts left.");
  });

  it("with low accuracy or another keyboard, explains it", async () => {
    vi.mocked(finishGame).mockResolvedValueOnce(response({ wpm: 90, accuracy: 85 }));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("You need at least 90% accuracy. You have 2 attempts left.");

    vi.mocked(finishGame).mockResolvedValueOnce(response({ wpm: 90, inputType: "touch" }));
    fireEvent.click(screen.getByTestId("verify-retry"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("You have to use the same keyboard as in your record (physical).");
  });

  it('no attempts left: could not be verified, no retry; "Play Ranked" leads to play', async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verification: { kind: "failed", requiredWpm: 85, attemptsLeft: 0 } }));
    const onDone = await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("It couldn't be verified. Your game won't enter the ranking");
    expect(screen.queryByTestId("verify-retry")).toBeNull();
    fireEvent.click(screen.getByTestId("verify-done"));
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("with `doneLabel` (on /verify, with other pending ones), when not passed the button says that and goes back to the list", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verification: { kind: "failed", requiredWpm: 85, attemptsLeft: 0 } }));
    const onDone = await mount(vi.fn(), "Back to your records");
    await playToTheEnd();
    const done = screen.getByTestId("verify-done");
    expect(done).toHaveTextContent("Back to your records");
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("with `doneLabel`, when passed it still leads to play Ranked", async () => {
    vi.mocked(finishGame).mockResolvedValue(
      response({
        wpm: 110,
        verification: { kind: "verified", ranking: { kind: "ranked", rank: 3, improved: true } },
      }),
    );
    const onDone = await mount(vi.fn(), "Back to your records");
    await playToTheEnd();
    const done = screen.getByTestId("verify-done");
    expect(done).toHaveTextContent("Play Ranked");
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("if the verification no longer exists (requiredWpm 0), does not mention missing wpm: could not be verified", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ wpm: 90, verification: { kind: "failed", requiredWpm: 0, attemptsLeft: 0 } }));
    await mount();
    await playToTheEnd();
    const result = screen.getByTestId("verify-result");
    expect(result).toHaveTextContent("It couldn't be verified. Your game won't enter the ranking");
    expect(result).not.toHaveTextContent("short");
    expect(screen.queryByTestId("verify-retry")).toBeNull();
  });

  it("if the server marks it failed with no wpm missing, does not show a zero or negative difference", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ wpm: 90 }));
    await mount();
    await playToTheEnd();
    const result = screen.getByTestId("verify-result");
    expect(result).not.toHaveTextContent("short");
    expect(result).toHaveTextContent("You have 2 attempts left.");
    expect(screen.getByTestId("verify-retry")).toBeInTheDocument();
  });

  it("if the finish does not reach the server, reports it as a connection problem, notifies the header and allows retrying", async () => {
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(404, "not_found"));
    const changed = listenVerificationChanged();
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("Connection problem: this game doesn't count.");
    // The attempt was used anyway (and if it was the third, none are left): the notice requests the pending ones again.
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("verify-retry"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("verify-countdown")).toBeInTheDocument();
  });

  it("if the server rejects the game, gives the reason", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "letter_by_letter" }));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("you have to type letter by letter");
  });

  it("Tab does not start another game: each start uses an attempt", async () => {
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: "Tab", code: "Tab" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledOnce();
  });

  it("if the player leaves before the server answers, the game never starts", async () => {
    let resolveStart: (game: typeof GAME) => void = () => {};
    vi.mocked(startGame).mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const { unmount } = renderWithIntl(<VerificationGame verification={VERIFICATION} onDone={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      resolveStart(GAME);
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(finishGame).not.toHaveBeenCalled();
  });

  it('if it is no longer pending (409), says so, notifies the header and "Play Ranked" leads to play (also on /verify)', async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(409, "no_pending_verification"));
    const changed = listenVerificationChanged();
    const onDone = await mount(vi.fn(), "Back to your records");
    expect(screen.getByTestId("verify-unavailable")).toHaveTextContent("This verification is no longer available.");
    expect(changed).toHaveBeenCalledOnce();
    const done = screen.getByTestId("verify-done");
    expect(done).toHaveTextContent("Play Ranked");
    fireEvent.click(done);
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("if the session has expired (401), says so and links to sign in and come back here", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(401, "unauthorized"));
    await mount();
    const unavailable = screen.getByTestId("verify-unavailable");
    expect(unavailable).toHaveTextContent("Your session has expired.");
    expect(unavailable).not.toHaveTextContent("Ranked isn't available");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in?next=%2Fen%2Fverify");
    expect(screen.queryByRole("link", { name: "Go to practice" })).toBeNull();
  });

  it("gate errors are handled as in Ranked", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(429, "rate_limited", 125));
    await mount();
    expect(screen.getByTestId("verify-unavailable")).toHaveTextContent("Come back in 3 min.");
    expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
  });

  it("if the server asks for the challenge, solves it and requests the same verification again with the token", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockResolvedValue("tok");
    await mount();
    expect(startGame).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "verification", verificationId: "v1", turnstileToken: "tok" }),
    );
    expect(screen.getByTestId("verify-countdown")).toBeInTheDocument();
  });
});
