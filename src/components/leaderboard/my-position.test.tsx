import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetViewer } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { MyPosition } from "./my-position";

afterEach(() => {
  vi.unstubAllGlobals();
  forgetViewer();
});

/** The session (the same request the header makes) and, if there is a session, the position. */
function respond(viewer: { nick: string } | null, position?: unknown) {
  const fetchMock = vi.fn(async (url: string) =>
    url === "/api/auth/get-session"
      ? new Response(JSON.stringify(viewer ? { session: {}, user: viewer } : null))
      : new Response(JSON.stringify(position)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MyPosition", () => {
  it("with a best, shows the position and the best", async () => {
    const fetchMock = respond({ nick: "gian_42" }, { rank: 7, wpm: 88.4, accuracy: 97.6 });
    renderWithIntl(<MyPosition language="es" input="touch" />);
    expect(await screen.findByText("Your position: #7 · 88 wpm · 97%")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leaderboard/me?lang=es&input=touch",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("with no best in that ranking, says so", async () => {
    respond({ nick: "gian_42" }, { rank: null });
    renderWithIntl(<MyPosition language="en" input="physical" />);
    expect(await screen.findByText("You're not on this ranking yet.")).toBeInTheDocument();
  });

  it("without a session, invites to sign in without asking for the position", async () => {
    const fetchMock = respond(null);
    renderWithIntl(<MyPosition language="en" input="physical" />);
    expect(await screen.findByRole("link", { name: "Sign in to appear in the ranking" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/en\/sign-in/),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/get-session"]);
  });
});
