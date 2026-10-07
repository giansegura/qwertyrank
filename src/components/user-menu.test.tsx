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
  // Dentro de 5 h y media: "quedan 6 h".
  expiresAt: new Date(Date.now() + 5.5 * 3_600_000).toISOString(),
};

/** `fetch` según la URL: las sesiones en orden y una respuesta fija para `/api/verification`. */
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
  it("sin sesión enlaza a entrar y no pregunta por récords pendientes", async () => {
    const fetchMock = fakeServer([null], async () => json({ pending: [PENDING] }));
    renderWithIntl(<UserMenu />);
    const link = await screen.findByTestId("user-menu");
    expect(link).toHaveAttribute("aria-label", "Sign in");
    expect(link.getAttribute("href")).toMatch(/^\/en\/sign-in/);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/verification", expect.anything());
  });

  it("con sesión enseña el nick y enlaza a la cuenta", async () => {
    fakeServer([{ nick: "gian_42" }], async () => json({ pending: [] }));
    renderWithIntl(<UserMenu />);
    const link = await screen.findByTestId("user-menu");
    expect(link).toHaveAttribute("aria-label", "Your account: gian_42");
    expect(link).toHaveAttribute("href", "/en/settings");
  });

  it("vuelve a pedir la sesión cuando cambia (p. ej. tras cambiar el nick)", async () => {
    fakeServer([{ nick: "viejo_1" }, { nick: "nuevo_2" }], async () => json({ pending: [] }));
    renderWithIntl(<UserMenu />);
    expect(await screen.findByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: viejo_1");
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    });
    await waitFor(() => expect(screen.getByTestId("user-menu")).toHaveAttribute("aria-label", "Your account: nuevo_2"));
  });

  it("con un récord pendiente, un aviso con las horas que quedan lleva a /verify", async () => {
    const fetchMock = fakeServer([{ nick: "gian_42" }], async () => json({ pending: [PENDING] }));
    renderWithIntl(<UserMenu />);
    const notice = await screen.findByTestId("verify-notice");
    expect(notice).toHaveTextContent("Record pending verification · 6 h left");
    expect(notice).toHaveAttribute("href", "/en/verify");
    expect(fetchMock).toHaveBeenCalledWith("/api/verification", { cache: "no-store" });
  });

  it("al cambiar las verificaciones (un récord en review, una verificada) vuelve a pedirlas, sin pedir otra vez la sesión", async () => {
    let pending: (typeof PENDING)[] = [];
    const fetchMock = fakeServer([{ nick: "gian_42" }], async () => json({ pending }));
    renderWithIntl(<UserMenu />);
    await waitFor(() => expect(verificationCalls(fetchMock)).toBe(1));
    expect(screen.queryByTestId("verify-notice")).toBeNull();

    // Un récord queda en review: aparece el aviso.
    pending = [PENDING];
    await act(async () => {
      window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
    });
    expect(await screen.findByTestId("verify-notice")).toHaveTextContent("6 h left");

    // Se verifica: el aviso se va.
    pending = [];
    await act(async () => {
      window.dispatchEvent(new Event(VERIFICATION_CHANGED_EVENT));
    });
    await waitFor(() => expect(screen.queryByTestId("verify-notice")).toBeNull());
    expect(verificationCalls(fetchMock)).toBe(3);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/get-session")).toHaveLength(1);
  });

  it("una respuesta antigua que llega tarde no pisa a la nueva", async () => {
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

    // La primera petición (de antes del récord) contesta ahora que no había ninguna.
    await act(async () => {
      answerFirst(json({ pending: [] }));
    });
    expect(screen.getByTestId("verify-notice")).toBeInTheDocument();
  });

  it.each([
    ["la sesión se ha cerrado en otra pestaña (401)", async () => json({ error: "unauthorized" }, 401)],
    ["el servidor falla (503)", async () => json({ error: "unavailable" }, 503)],
    ["la red falla", async (): Promise<Response> => Promise.reject(new TypeError("fetch failed"))],
    ["la respuesta no es la esperada", async () => json({ pendientes: 3 })],
    ["las pendientes no traen su plazo", async () => json({ pending: [{ id: "v1" }] })],
  ])("si %s, ni aviso ni error", async (_, verification) => {
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
