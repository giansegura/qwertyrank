import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { FinishResponse } from "@/lib/game/types";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { GameApiError, finishGame, sendKeys, startGame } from "./api";
import { solveChallenge } from "./challenge";
import { SUBMIT_DEADLINE_MS } from "./game-flow";
import { RankedTest } from "./ranked-test";

vi.mock("./challenge", () => ({ solveChallenge: vi.fn() }));

// The verification game has its own tests: here all that matters is that it loads in its place.
vi.mock("../verification/verification-game", () => ({
  VerificationGame: ({ verification, onDone }: { verification: { id: string }; onDone: () => void }) => (
    <button type="button" data-testid="verification-game" onClick={onDone}>
      {verification.id}
    </button>
  ),
}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  startGame: vi.fn(),
  sendKeys: vi.fn(),
  finishGame: vi.fn(),
}));

const GAME = { gameId: "g1", words: ["hola", "mundo"], countdownMs: 3_000, durationMs: 30_000 };

function response(overrides: Partial<FinishResponse> = {}): FinishResponse {
  return {
    gameId: "g1",
    wpm: 2,
    rawWpm: 2,
    accuracy: 100,
    correctChars: 5,
    typedChars: 5,
    perSecond: Array(30).fill(2),
    mistakes: {},
    inputType: "physical",
    verdict: "valid",
    reason: null,
    ranking: { kind: "unranked" },
    ...overrides,
  };
}

function typeText(input: HTMLInputElement, text: string) {
  for (const char of text) fireEvent.input(input, { target: { value: input.value + char } });
}

async function startAndCountDown() {
  fireEvent.click(screen.getByTestId("ranked-start"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByTestId("countdown")).toBeInTheDocument();
  expect(screen.queryAllByTestId("word")).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3_000);
  });
}

describe("RankedTest", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(startGame).mockResolvedValue(GAME);
    vi.mocked(sendKeys).mockResolvedValue(undefined);
    vi.mocked(finishGame).mockResolvedValue(response());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("before starting shows no words, only the button", () => {
    renderWithIntl(<RankedTest language="es" />);
    expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
    expect(screen.queryAllByTestId("word")).toHaveLength(0);
  });

  it("full game: countdown, text, keystrokes sent and server verdict", async () => {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    expect(startGame).toHaveBeenCalledWith({ language: "es", env: { coarse: false, touchPoints: 0 } });
    expect(screen.getAllByTestId("word")).toHaveLength(2);

    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "hola ");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(sendKeys).toHaveBeenCalled();
    expect(vi.mocked(sendKeys).mock.calls[0][1].seq).toBe(1);
    const lastSeq = vi.mocked(sendKeys).mock.calls.at(-1)![1].seq;
    expect(finishGame).toHaveBeenCalledWith("g1", { lastSeq });
    expect(screen.getByTestId("result")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Valid game");
    // Valid: it can be shared (spec 5d §6).
    expect(screen.getByTestId("share-result")).toBeInTheDocument();
  });

  it("shows the reason when the server rejects the game", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "letter_by_letter" }));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("type letter by letter");
    expect(screen.queryByTestId("share-result")).toBeNull();
  });

  it("a finish that arrives late (e.g. with the tab in the background) is explained as a connection problem", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "connection" }));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Connection problem");
  });

  it("if the server does not recognise the game (e.g. blocked cookies), shows the local result as invalid", async () => {
    vi.mocked(sendKeys).mockRejectedValue(new GameApiError(404, "not_found"));
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(404, "not_found"));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    typeText(screen.getByTestId("typing-input") as HTMLInputElement, "hola ");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Connection problem");
    expect(screen.getByTestId("result-accuracy")).toHaveTextContent("100%");
  });

  it("if the server does not answer at the end, it does not hang: after 10 s shows the local result", async () => {
    vi.mocked(sendKeys).mockReturnValue(new Promise(() => {}));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    typeText(screen.getByTestId("typing-input") as HTMLInputElement, "hola ");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByText("Checking your game…")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SUBMIT_DEADLINE_MS);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Connection problem");
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  it("several Tabs while the game is being requested only request one", async () => {
    let resolveStart: (game: typeof GAME) => void = () => {};
    vi.mocked(startGame).mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    renderWithIntl(<RankedTest language="es" />);
    fireEvent.click(screen.getByTestId("ranked-start"));
    const input = screen.getByTestId("typing-input");
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    fireEvent.keyDown(input, { key: "Tab", code: "Tab" });
    expect(startGame).toHaveBeenCalledOnce();
    await act(async () => {
      resolveStart(GAME);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("typing is not possible during the countdown", async () => {
    renderWithIntl(<RankedTest language="es" />);
    fireEvent.click(screen.getByTestId("ranked-start"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    const input = screen.getByTestId("typing-input") as HTMLInputElement;
    typeText(input, "ho");
    expect(input.value).toBe("");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getAllByTestId("word")[0].querySelectorAll('[data-status="pending"]')).toHaveLength(4);
  });

  it("Space starts the game", async () => {
    renderWithIntl(<RankedTest language="en" />);
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: " ", code: "Space" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledOnce();
  });

  it("if the server is unavailable, says so and offers practice", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(503, "unavailable"));
    renderWithIntl(<RankedTest language="es" />);
    fireEvent.click(screen.getByTestId("ranked-start"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/isn't available right now/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
    expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
  });

  it("if another game closed it, explains it and shows the local result", async () => {
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(409, "closed"));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("You started another game");
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  it("Tab mid-game starts a new one", async () => {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: "Tab", code: "Tab" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("anonymous with a good game: the position it would have and the button to save it", async () => {
    vi.mocked(finishGame).mockResolvedValue(
      response({ ranking: { kind: "would_rank", rank: 4 } }),
    );
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("You'd be #4 on the leaderboard.");
    expect(screen.getByTestId("save-game")).toHaveAttribute("href", "/en/save/g1");
  });
});

describe("RankedTest: record in review", () => {
  const VERIFICATION = {
    id: "v1",
    language: "es" as const,
    inputType: "physical" as const,
    targetWpm: 120,
    requiredWpm: 102,
    attemptsLeft: 3,
    expiresAt: "2026-10-08T10:00:00.000Z",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(startGame).mockResolvedValue(GAME);
    vi.mocked(sendKeys).mockResolvedValue(undefined);
    vi.mocked(finishGame).mockResolvedValue(
      response({ verdict: "review", ranking: { kind: "review", rank: 1, verification: VERIFICATION } }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('"Verify now" loads the verification game on the same screen; when done, goes back to Ranked', async () => {
    const changed = vi.fn();
    window.addEventListener(VERIFICATION_CHANGED_EVENT, changed);
    onTestFinished(() => window.removeEventListener(VERIFICATION_CHANGED_EVENT, changed));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("Your score would be #1.");
    // In `review` it is not valid yet: it is not shared.
    expect(screen.queryByTestId("share-result")).toBeNull();
    // The header notice requests the pending verifications again.
    expect(changed).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByTestId("verify-now"));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("verification-game")).toHaveTextContent("v1");
    expect(screen.queryByTestId("typing-area")).toBeNull();

    fireEvent.click(screen.getByTestId("verification-game"));
    expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
  });

  /** Plays a game that ends up in `review` (with the summary already downloaded). */
  async function playToReview() {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.dynamicImportSettled();
    });
  }

  /** Presses "Verify now" and lets the verification game download. */
  async function verifyNow() {
    fireEvent.click(screen.getByTestId("verify-now"));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }

  it("on return from the verification, the hidden field has focus: Space starts another game", async () => {
    await playToReview();
    await verifyNow();
    fireEvent.click(screen.getByTestId("verification-game"));
    const input = screen.getByTestId("typing-input");
    expect(input).toHaveFocus();

    vi.mocked(startGame).mockClear();
    fireEvent.keyDown(input, { key: " ", code: "Space" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledOnce();
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("if the verification game cannot be downloaded, goes back to Ranked and says it is unavailable", async () => {
    await playToReview();
    // With the summary already downloaded, downloading the verification game fails.
    const fakeGame = await import("../verification/verification-game");
    vi.doMock("../verification/verification-game", () => {
      throw new Error("chunk load failed");
    });
    vi.resetModules();
    try {
      await verifyNow();
      expect(screen.queryByTestId("verification-game")).toBeNull();
      expect(screen.getByText(/isn't available right now/)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
      expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
    } finally {
      vi.doMock("../verification/verification-game", () => fakeGame);
      vi.resetModules();
    }
  });
});

describe("RankedTest: challenge and blocks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key");
    vi.mocked(startGame).mockResolvedValue(GAME);
    vi.mocked(sendKeys).mockResolvedValue(undefined);
    vi.mocked(finishGame).mockResolvedValue(response());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  /** Presses Start and lets the promises and the `import()` downloads finish. */
  async function clickStart() {
    fireEvent.click(screen.getByTestId("ranked-start"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("if the server asks for the challenge, solves it and requests the game again with the token", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockResolvedValue("tok");
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(solveChallenge).toHaveBeenCalledWith(expect.any(HTMLElement), "site-key");
    expect(startGame).toHaveBeenLastCalledWith(expect.objectContaining({ language: "es", turnstileToken: "tok" }));
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("if the challenge fails, says so, offers practice and allows trying again", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockRejectedValue(new Error("turnstile timeout"));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("We couldn't check that you're human");
    expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
    expect(screen.getByTestId("ranked-start")).toBeEnabled();
  });

  it("if the server rejects the token, does not retry it in a loop", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockResolvedValue("tok");
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(solveChallenge).toHaveBeenCalledOnce();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("We couldn't check that you're human");
  });

  it("without a site key does not attempt the challenge", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(solveChallenge).not.toHaveBeenCalled();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("We couldn't check that you're human");
  });

  it("a banned account sees the notice", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "banned"));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("Your account can't play ranked games.");
  });

  it("with the game limit says how many minutes are left", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(429, "rate_limited", 125));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("Come back in 3 min.");
  });
});
