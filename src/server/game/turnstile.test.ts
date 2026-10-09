// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { SITEVERIFY_URL, TurnstileUnavailableError, createTurnstileVerifier } from "./turnstile";

function fakeFetch(result: Response | Error) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    if (result instanceof Error) throw result;
    return result;
  });
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Turnstile verification", () => {
  it("sends secret, token and IP, and passes if Cloudflare answers success", async () => {
    const fetch = fakeFetch(json({ success: true, action: "test" }));
    expect(await createTurnstileVerifier("secret", fetch)("token", "1.2.3.4")).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({ secret: "secret", response: "token", remoteip: "1.2.3.4" });
    expect(init?.signal).toBeDefined();
  });

  it("a rejected or already used token does not pass", async () => {
    const fetch = fakeFetch(json({ success: false, "error-codes": ["timeout-or-duplicate"] }));
    expect(await createTurnstileVerifier("secret", fetch)("token", null)).toBe(false);
    expect(Object.fromEntries(fetch.mock.calls[0][1]?.body as URLSearchParams)).toEqual({ secret: "secret", response: "token" });
  });

  it("if Cloudflare fails or does not respond, throws TurnstileUnavailableError", async () => {
    await expect(createTurnstileVerifier("s", fakeFetch(json({}, 500)))("t", null)).rejects.toBeInstanceOf(
      TurnstileUnavailableError,
    );
    await expect(createTurnstileVerifier("s", fakeFetch(new TypeError("fetch failed")))("t", null)).rejects.toBeInstanceOf(
      TurnstileUnavailableError,
    );
  });
});
