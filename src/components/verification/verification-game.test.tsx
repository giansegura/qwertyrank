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
// La página en la que se juega: a ella vuelve el enlace a entrar si la sesión ha caducado.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/en/verify",
}));
// jsdom no dibuja: el canvas tiene sus propias pruebas.
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

/** Monta la partida y deja que empiece sola (y que pase lo que tarde el servidor). */
async function mount(onDone = vi.fn()) {
  renderWithIntl(<VerificationGame verification={VERIFICATION} onDone={onDone} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(0);
  });
  return onDone;
}

/** Cuenta las veces que la partida avisa a la cabecera de que sus verificaciones han cambiado. */
function listenVerificationChanged() {
  const changed = vi.fn();
  window.addEventListener(VERIFICATION_CHANGED_EVENT, changed);
  onTestFinished(() => window.removeEventListener(VERIFICATION_CHANGED_EVENT, changed));
  return changed;
}

/** Cuenta atrás y 30 s de partida hasta el resultado. */
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
  it("empieza sola: pide la partida de verificación y, tras la cuenta atrás, el texto va en el canvas y no en el DOM", async () => {
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

  it("al tocar el texto se enfoca el campo oculto (el que abre el teclado del móvil)", async () => {
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

  it("superada: ¡verificado!, con sus posiciones, y vuelve a Ranked", async () => {
    vi.mocked(finishGame).mockResolvedValue(
      response({
        wpm: 110,
        verification: { kind: "verified", ranking: { kind: "ranked", ranks: { day: 3, all: 40 }, improved: ["day"] } },
      }),
    );
    const changed = listenVerificationChanged();
    const onDone = await mount();
    expect(changed).not.toHaveBeenCalled();
    await playToTheEnd();
    expect(finishGame).toHaveBeenCalledWith("g1", { lastSeq: 0 });
    expect(screen.getByTestId("verify-result")).toHaveTextContent("Verified! Your record is now on the ranking.");
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("#3 today · #40 all time");
    // El aviso de la cabecera vuelve a pedir las pendientes: esta ya no lo está.
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("verify-done"));
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("no superada: cuánto le faltó y cuántos intentos quedan, y deja reintentar", async () => {
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

  it("lo que le faltó se cuenta en centésimas: 85 − 84,8 son 0,2 y no 0,3", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ wpm: 84.8 }));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("You were 0.2 wpm short. You have 2 attempts left.");
  });

  it("con poca precisión o con otro teclado, lo explica", async () => {
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

  it("sin intentos: no se ha podido verificar, sin reintentar", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verification: { kind: "failed", requiredWpm: 85, attemptsLeft: 0 } }));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("It couldn't be verified. Your game won't enter the ranking");
    expect(screen.queryByTestId("verify-retry")).toBeNull();
    expect(screen.getByTestId("verify-done")).toBeInTheDocument();
  });

  it("si la verificación ya no existe (requiredWpm 0), no habla de PPM que faltan: no se ha podido verificar", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ wpm: 90, verification: { kind: "failed", requiredWpm: 0, attemptsLeft: 0 } }));
    await mount();
    await playToTheEnd();
    const result = screen.getByTestId("verify-result");
    expect(result).toHaveTextContent("It couldn't be verified. Your game won't enter the ranking");
    expect(result).not.toHaveTextContent("short");
    expect(screen.queryByTestId("verify-retry")).toBeNull();
  });

  it("si el servidor la da por fallida sin que falten PPM, no enseña una diferencia de 0 ni negativa", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ wpm: 90 }));
    await mount();
    await playToTheEnd();
    const result = screen.getByTestId("verify-result");
    expect(result).not.toHaveTextContent("short");
    expect(result).toHaveTextContent("You have 2 attempts left.");
    expect(screen.getByTestId("verify-retry")).toBeInTheDocument();
  });

  it("si el final no llega al servidor, lo dice como problema de conexión y deja reintentar", async () => {
    vi.mocked(finishGame).mockRejectedValue(new GameApiError(404, "not_found"));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("Connection problem: this game doesn't count.");
    fireEvent.click(screen.getByTestId("verify-retry"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(startGame).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("verify-countdown")).toBeInTheDocument();
  });

  it("si el servidor rechaza la partida, da el motivo", async () => {
    vi.mocked(finishGame).mockResolvedValue(response({ verdict: "rejected", reason: "letter_by_letter" }));
    await mount();
    await playToTheEnd();
    expect(screen.getByTestId("verify-result")).toHaveTextContent("you have to type letter by letter");
  });

  it("Tab no empieza otra partida: cada inicio gasta un intento", async () => {
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

  it("si se sale antes de que el servidor conteste, la partida no llega a arrancar", async () => {
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

  it("si ya no está pendiente (409), lo dice, avisa a la cabecera y «Jugar Ranked» sabe que ya no existe", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(409, "no_pending_verification"));
    const changed = listenVerificationChanged();
    const onDone = await mount();
    expect(screen.getByTestId("verify-unavailable")).toHaveTextContent("This verification is no longer available.");
    expect(changed).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId("verify-done"));
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("si la sesión ha caducado (401), lo dice y enlaza a entrar y volver aquí", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(401, "unauthorized"));
    await mount();
    const unavailable = screen.getByTestId("verify-unavailable");
    expect(unavailable).toHaveTextContent("Your session has expired.");
    expect(unavailable).not.toHaveTextContent("Ranked isn't available");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/en/sign-in?next=%2Fen%2Fverify");
    expect(screen.queryByRole("link", { name: "Go to practice" })).toBeNull();
  });

  it("los errores de la puerta se tratan como en Ranked", async () => {
    vi.mocked(startGame).mockRejectedValue(new GameApiError(429, "rate_limited", 125));
    await mount();
    expect(screen.getByTestId("verify-unavailable")).toHaveTextContent("Come back in 3 min.");
    expect(screen.getByRole("link", { name: "Go to practice" })).toBeInTheDocument();
  });

  it("si el servidor pide el reto, lo resuelve y pide otra vez la misma verificación con el token", async () => {
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
