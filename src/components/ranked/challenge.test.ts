import { afterEach, describe, expect, it, vi } from "vitest";

type Options = { sitekey: string; callback: (token: string) => void; "error-callback": () => void };

// The module remembers the already loaded script: each test loads it again.
async function load() {
  vi.resetModules();
  return import("./challenge");
}

function fakeTurnstile() {
  const widgets: Options[] = [];
  const turnstile = {
    render: vi.fn((_container: HTMLElement, options: Options) => {
      widgets.push(options);
      return `w${widgets.length}`;
    }),
    remove: vi.fn(),
  };
  return { turnstile, widgets };
}

const scripts = () => document.head.querySelectorAll<HTMLScriptElement>("script");

afterEach(() => {
  delete window.turnstile;
  document.head.innerHTML = "";
  vi.useRealTimers();
});

describe("Turnstile challenge", () => {
  it("loads the script once, renders the invisible widget and returns the token", async () => {
    const { solveChallenge, TURNSTILE_SCRIPT } = await load();
    const { turnstile, widgets } = fakeTurnstile();
    const container = document.createElement("div");

    const first = solveChallenge(container, "site-key");
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toBe(TURNSTILE_SCRIPT);
    window.turnstile = turnstile as unknown as Window["turnstile"];
    scripts()[0].dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());
    expect(turnstile.render.mock.calls[0][0]).toBe(container);
    expect(turnstile.render.mock.calls[0][1]).toMatchObject({
      sitekey: "site-key",
      action: "ranked-start",
      appearance: "interaction-only",
    });
    widgets[0].callback("tok");
    await expect(first).resolves.toBe("tok");
    expect(turnstile.remove).toHaveBeenCalledWith("w1");

    const second = solveChallenge(container, "site-key");
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(2));
    widgets[1].callback("tok2");
    await expect(second).resolves.toBe("tok2");
    expect(scripts()).toHaveLength(1);
  });

  it("if the widget errors, fails", async () => {
    const { solveChallenge } = await load();
    const { turnstile, widgets } = fakeTurnstile();
    window.turnstile = turnstile as unknown as Window["turnstile"];
    const result = solveChallenge(document.createElement("div"), "k");
    await vi.waitFor(() => expect(widgets).toHaveLength(1));
    widgets[0]["error-callback"]();
    await expect(result).rejects.toThrow();
    expect(turnstile.remove).toHaveBeenCalledWith("w1");
  });

  it("if the script does not load, fails and the next attempt requests it again", async () => {
    const { solveChallenge } = await load();
    const first = solveChallenge(document.createElement("div"), "k");
    scripts()[0].dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow();
    void solveChallenge(document.createElement("div"), "k").catch(() => {});
    expect(scripts()).toHaveLength(2);
  });

  it("if there is no token within 15 s, fails", async () => {
    vi.useFakeTimers();
    const { solveChallenge, CHALLENGE_TIMEOUT_MS } = await load();
    const result = solveChallenge(document.createElement("div"), "k");
    const assertion = expect(result).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(CHALLENGE_TIMEOUT_MS);
    await assertion;
  });
});
