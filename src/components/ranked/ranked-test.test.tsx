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

// La partida de verificación tiene sus propias pruebas: aquí solo importa que se carga en su lugar.
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

  it("antes de empezar no muestra ninguna palabra, solo el botón", () => {
    renderWithIntl(<RankedTest language="es" />);
    expect(screen.getByTestId("ranked-start")).toBeInTheDocument();
    expect(screen.queryAllByTestId("word")).toHaveLength(0);
  });

  it("partida completa: cuenta atrás, texto, envío de pulsaciones y veredicto del servidor", async () => {
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
    // Valid: it can be shared (spec 5d §6). The button ships in the lazily loaded summary module: on a slow
    // machine its `import()` may not have finished yet.
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.getByTestId("share-result")).toBeInTheDocument();
  });

  it("muestra el motivo cuando el servidor rechaza la partida", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "letter_by_letter" }));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("type letter by letter");
    expect(screen.queryByTestId("share-result")).toBeNull();
  });

  it("un final que llega tarde (p. ej. con la pestaña en segundo plano) se explica como problema de conexión", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "connection" }));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("Connection problem");
  });

  it("si el servidor no reconoce la partida (p. ej. cookies bloqueadas), enseña el resultado local como no válido", async () => {
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

  it("si el servidor no contesta al terminar, no se queda colgado: a los 10 s enseña el resultado local", async () => {
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

  it("varios Tab mientras se pide la partida solo piden una", async () => {
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

  it("durante la cuenta atrás no se puede escribir", async () => {
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

  it("Espacio empieza la partida", async () => {
    renderWithIntl(<RankedTest language="en" />);
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: " ", code: "Space" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledOnce();
  });

  it("si el servidor no está disponible, lo dice y ofrece la práctica", async () => {
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

  it("si otra partida la cerró, lo explica y enseña el resultado local", async () => {
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(409, "closed"));
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByTestId("ranked-status")).toHaveTextContent("You started another game");
    expect(screen.getByTestId("result")).toBeInTheDocument();
  });

  it("Tab a mitad de partida empieza otra nueva", async () => {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    fireEvent.keyDown(screen.getByTestId("typing-input"), { key: "Tab", code: "Tab" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("anónima con buena partida: la posición que tendría y el botón para guardarla", async () => {
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

describe("RankedTest: récord en review", () => {
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

  it("«Verificar ahora» carga la partida de verificación en la misma pantalla; al acabar, vuelve a Ranked", async () => {
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
    // En `review` todavía no es válida: no se comparte.
    expect(screen.queryByTestId("share-result")).toBeNull();
    // El aviso de la cabecera vuelve a pedir las verificaciones pendientes.
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

  /** Juega una partida que queda en `review` (con el resumen ya descargado). */
  async function playToReview() {
    renderWithIntl(<RankedTest language="es" />);
    await startAndCountDown();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.dynamicImportSettled();
    });
  }

  /** Pulsa «Verificar ahora» y deja que se descargue la partida de verificación. */
  async function verifyNow() {
    fireEvent.click(screen.getByTestId("verify-now"));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
  }

  it("al volver de la verificación, el campo oculto tiene el foco: Espacio empieza otra partida", async () => {
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

  it("si no se puede descargar la partida de verificación, vuelve a Ranked y dice que no está disponible", async () => {
    await playToReview();
    // Con el resumen ya descargado, falla la descarga de la partida de verificación.
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

describe("RankedTest: reto y bloqueos", () => {
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

  /** Pulsa Empezar y deja que terminen las promesas y las descargas con `import()`. */
  async function clickStart() {
    fireEvent.click(screen.getByTestId("ranked-start"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("si el servidor pide el reto, lo resuelve y vuelve a pedir la partida con el token", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockResolvedValue("tok");
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(solveChallenge).toHaveBeenCalledWith(expect.any(HTMLElement), "site-key");
    expect(startGame).toHaveBeenLastCalledWith(expect.objectContaining({ language: "es", turnstileToken: "tok" }));
    expect(screen.getByTestId("countdown")).toBeInTheDocument();
  });

  it("si el reto falla, lo dice, ofrece la práctica y deja volver a intentarlo", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockRejectedValue(new Error("turnstile timeout"));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("We couldn't check that you're human");
    expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
    expect(screen.getByTestId("ranked-start")).toBeEnabled();
  });

  it("si el servidor rechaza el token, no lo reintenta en bucle", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(403, "needs_challenge"));
    vi.mocked(solveChallenge).mockResolvedValue("tok");
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(solveChallenge).toHaveBeenCalledOnce();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("We couldn't check that you're human");
  });

  it("sin clave de sitio no intenta el reto", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "needs_challenge"));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(solveChallenge).not.toHaveBeenCalled();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("We couldn't check that you're human");
  });

  it("una cuenta baneada ve el aviso", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(403, "banned"));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("Your account can't play ranked games.");
  });

  it("con el límite de partidas dice cuántos minutos faltan", async () => {
    vi.mocked(startGame).mockRejectedValueOnce(new GameApiError(429, "rate_limited", 125));
    renderWithIntl(<RankedTest language="es" />);
    await clickStart();
    expect(screen.getByTestId("ranked-blocked")).toHaveTextContent("Come back in 3 min.");
  });
});
