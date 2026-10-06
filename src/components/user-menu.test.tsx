import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { SESSION_CHANGED_EVENT, UserMenu } from "./user-menu";

function sessionResponse(user: { nick: string } | null) {
  return new Response(JSON.stringify(user ? { session: {}, user } : null), {
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserMenu", () => {
  it("sin sesión enlaza a entrar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse(null)));
    renderWithIntl(<UserMenu />);
    const link = await screen.findByTestId("user-menu");
    expect(link).toHaveAttribute("aria-label", "Sign in");
    expect(link.getAttribute("href")).toMatch(/^\/en\/sign-in/);
  });

  it("con sesión enseña el nick y enlaza a la cuenta", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sessionResponse({ nick: "gian_42" })));
    renderWithIntl(<UserMenu />);
    const link = await screen.findByTestId("user-menu");
    expect(link).toHaveAttribute("aria-label", "Your account: gian_42");
    expect(link).toHaveAttribute("href", "/en/settings");
  });

  it("vuelve a pedir la sesión cuando cambia (p. ej. tras cambiar el nick)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionResponse({ nick: "viejo_1" }))
      .mockResolvedValueOnce(sessionResponse({ nick: "nuevo_2" }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithIntl(<UserMenu />);
    expect(await screen.findByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: viejo_1");
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    });
    expect(screen.getByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: nuevo_2");
  });
});
