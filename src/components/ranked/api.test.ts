import { afterEach, describe, expect, it, vi } from "vitest";
import { GameApiError, REQUEST_TIMEOUT_MS, claimGame, finishGame, isRetryable, sendKeys, startGame } from "./api";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("games api", () => {
  it("startGame POSTs JSON and returns the game", async () => {
    const fetchMock = vi.fn(async () => reply(200, { gameId: "g1", words: ["a"], countdownMs: 3000, durationMs: 30000 }));
    vi.stubGlobal("fetch", fetchMock);
    const game = await startGame({ language: "es", env: { coarse: false, touchPoints: 0 } });
    expect(game.gameId).toBe("g1");
    expect(fetchMock).toHaveBeenCalledWith("/api/game/start", expect.objectContaining({ method: "POST" }));
  });

  it("HTTP errors arrive as GameApiError with the server's code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(409, { error: "out_of_order" })));
    const error = await sendKeys("g1", { seq: 3, events: [] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GameApiError);
    expect(error).toMatchObject({ status: 409, code: "out_of_order" });
  });

  it("finishGame retries while the server is busy or not responding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(409, { error: "busy" }))
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(reply(200, { verdict: "valid" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await finishGame("g1", { lastSeq: 2 }, { delayMs: 0 });
    expect(response).toEqual({ verdict: "valid" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("aborts a request that does not respond within 5 s, and that error is retryable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    const pending = startGame({ language: "es", env: { coarse: false, touchPoints: 0 } }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    const error = await pending;
    vi.useRealTimers();
    expect(error).toBeInstanceOf(DOMException);
    expect(isRetryable(error)).toBe(true);
  });

  it("finishGame does not retry a closed or nonexistent game", async () => {
    const fetchMock = vi.fn(async () => reply(409, { error: "closed" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(finishGame("g1", { lastSeq: 0 }, { delayMs: 0 })).rejects.toMatchObject({ code: "closed" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("claimGame POSTs to /api/game/{id}/claim and returns the ranking", async () => {
    const claimed = { ranking: { kind: "low_accuracy" }, language: "es", inputType: "touch" };
    const fetchMock = vi.fn(async () => reply(200, claimed));
    vi.stubGlobal("fetch", fetchMock);
    expect(await claimGame("g1")).toEqual(claimed);
    expect(fetchMock).toHaveBeenCalledWith("/api/game/g1/claim", expect.objectContaining({ method: "POST" }));
  });
});
