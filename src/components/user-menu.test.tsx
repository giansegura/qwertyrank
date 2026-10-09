import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { SESSION_CHANGED_EVENT, VERIFICATION_CHANGED_EVENT, forgetViewer } from "@/lib/viewer";
import { UserMenu } from "./user-menu";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sessionResponse = (user: { nick: string } | null) => json(user ? { session: {}, user } : null);

const PENDING = {
  id: "v1",
  language: "en",
  inputType: "physical",
  targetWpm: 100,
  requiredWpm: 85,
  attemptsLeft: 3,
  // In five and a half hours: "6 h left".
  expiresAt: new Date(Date.now() + 5.5 * 3_600_000).toISOString(),
};

/** `fetch` by URL: the sessions in order and a fixed response for `/api/verification`. */
function fakeServer(sessions: ({ nick: string } | null)[], verification: () => Promise<Response>) {
  const fetchMock = vi.fn(async (url: string) =>
    url === "/api/verification" ? verification() : sessionResponse(sessions.shift() ?? null),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const verificationCalls = (fetchMock: ReturnType<typeof fakeServer>) =>
  fetchMock.mock.calls.filter(([url]) => url === "/api/verification").length;

afterEach(() => {
  vi.unstubAllGlobals();
  forgetViewer();
});

describe("UserMenu", () => {
  it("without a session links to sign in and does not ask for pending records", async () => {
    const fetchMock = fakeServer([null], async () => json({ pending: [PENDING] }));
    renderWithIntl(<UserMenu />);
    const link = await screen.findByTestId("user-menu");
    expect(link).toHaveAttribute("aria-label", "Sign in");
    expect(link.getAttribute("href")).toMatch(/^\/en\/sign-in/);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/verification", expect.anything());
  });

  it("with a session shows the nick and links to the account", async () => {
    fakeServer([{ nick: "gian_42" }], async () => json({ pending: [] }));
    renderWithIntl(<UserMenu />);
    const link = await screen.findByTestId("user-menu");
    expect(link).toHaveAttribute("aria-label", "Your account: gian_42");
    expect(link).toHaveAttribute("href", "/en/settings");
  });

  it("requests the session again when it changes (e.g. after changing the nick)", async () => {
    fakeServer([{ nick: "viejo_1" }, { nick: "nuevo_2" }], async () => json({ pending: [] }));
    renderWithIntl(<UserMenu />);
    expect(await screen.findByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: viejo_1");
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    });
    await waitFor(() => expect(screen.getByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: nuevo_2"));
  });

  it("with a pending record, a notice with the hours left goes to /verify", async () => {
    const fetchMock = fakeServer([{ nick: "gian_42" }], async () => json({ pending: [PENDING] }));
    renderWithIntl(<UserMenu />);
    const notice = await screen.findByTestId("verify-notice");
    expect(notice).toHaveTextContent("Record pending verification · 6 h left");
    expect(notice).toHaveAttribute("href", "/en/verify");
    expect(fetchMock).toHaveBeenCalledWith("/api/verification", { cache: "no-store" });
  });

  it("anything that is not a pending one with its deadline does not count: the notice shows for those that are", async () => {
    fakeServer([{ nick: "gian_42" }], async () => json({ pending: [null, 3, { id: "v2" }, PENDING] }));
    renderWithIntl(<UserMenu />);
    expect(await screen.findByTestId("verify-notice")).toHaveTextContent("Record pending verification · 6 h left");
  });

  it("when the verifications change (a record in review, one verified) requests them again, without requesting the session again", async () => {
    let pending: (typeof PENDING)[] = [];
    const fetchMock = fakeServer([{ nick: "gian_42" }], async () => json({ pending }));
    renderWithIntl(<UserMenu />);
    await waitFor(() => expect(verificationCalls(fetchMock)).toBe(1));
    expect(screen.queryByTestId("verify-notice")).toBeNull();

    // A record goes into review: the notice appears.
    pending = [PENDING];
    await act(async () => {
      window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
    });
    expect(await screen.findByTestId("verify-notice")).toHaveTextContent("6 h left");

    // It is verified: the notice goes away.
    pending = [];
    await act(async () => {
      window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
    });
    await waitFor(() => expect(screen.queryByTestId("verify-notice")).toBeNull());
    expect(verificationCalls(fetchMock)).toBe(3);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/get-session")).toHaveLength(1);
  });

  it("an old response that arrives late does not overwrite the new one", async () => {
    let answerFirst: (response: Response) => void = () => {};
    const responses = [
      new Promise<Response>((resolve) => {
        answerFirst = resolve;
      }),
      Promise.resolve(json({ pending: [PENDING] })),
    ];
    fakeServer([{ nick: "gian_42" }], () => responses.shift()!);
    renderWithIntl(<UserMenu />);
    expect(await screen.findByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: gian_42");
    await act(async () => {
      window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
    });
    expect(await screen.findByTestId("verify-notice")).toBeInTheDocument();

    // The first request (from before the record) now answers that there were none.
    await act(async () => {
      answerFirst(json({ pending: [] }));
    });
    expect(screen.getByTestId("verify-notice")).toBeInTheDocument();
  });

  it.each([
    ["the session was closed in another tab (401)", async () => json({ error: "unauthorized" }, 401)],
    ["the server fails (503)", async () => json({ error: "unavailable" }, 503)],
    ["the network fails", async (): Promise<Response> => Promise.reject(new TypeError("fetch failed"))],
    ["the response is not the expected one", async () => json({ pendingCount: 3 })],
    ["the pending ones lack their deadline", async () => json({ pending: [{ id: "v1" }] })],
    ["a pending one is null", async () => json({ pending: [null] })],
  ])("if %s, neither notice nor error", async (_, verification) => {
    const fetchMock = fakeServer([{ nick: "gian_42" }], verification);
    renderWithIntl(<UserMenu />);
    expect(await screen.findByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: gian_42");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/verification", { cache: "no-store" }));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(screen.queryByTestId("verify-notice")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
