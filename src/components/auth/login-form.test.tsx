import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import { navigateTo } from "@/lib/navigate";
import { renderWithIntl } from "@/test/render-with-intl";
import { LoginForm } from "./login-form";

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { magicLink: vi.fn(), passkey: vi.fn(), social: vi.fn() } },
}));
vi.mock("@/lib/navigate", () => ({ navigateTo: vi.fn() }));

const magicLink = vi.mocked(authClient.signIn.magicLink);
const passkey = vi.mocked(authClient.signIn.passkey);

function renderForm(props: Partial<Parameters<typeof LoginForm>[0]> = {}) {
  return renderWithIntl(
    <LoginForm locale="en" next="/en/practice" googleEnabled={false} callbackError={null} {...props} />,
  );
}

function askForLink(email: string) {
  fireEvent.change(screen.getByTestId("login-email"), { target: { value: email } });
  fireEvent.click(screen.getByTestId("login-send"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("pide el enlace con las URLs de vuelta y avisa de abrirlo en este dispositivo", async () => {
    magicLink.mockResolvedValue({ data: { status: true }, error: null } as never);
    renderForm();
    askForLink("ana@example.com");
    const sent = await screen.findByTestId("login-sent");
    expect(sent).toHaveTextContent("ana@example.com");
    expect(sent).toHaveTextContent("Open it on this device");
    expect(magicLink).toHaveBeenCalledWith({
      email: "ana@example.com",
      callbackURL: "/en/practice",
      newUserCallbackURL: "/en/settings?welcome=1&next=%2Fen%2Fpractice",
      errorCallbackURL: "/en/sign-in?next=%2Fen%2Fpractice",
    });
  });

  it("un email desechable tiene su propio mensaje", async () => {
    magicLink.mockResolvedValue({ data: null, error: { code: "DISPOSABLE_EMAIL", status: 400 } } as never);
    renderForm();
    askForLink("x@mailinator.com");
    expect(await screen.findByTestId("login-error")).toHaveTextContent("Temporary email addresses aren't allowed");
  });

  it("si se pidió otro enlace hace menos de un minuto, lo explica", async () => {
    magicLink.mockResolvedValue({ data: null, error: { code: "EMAIL_THROTTLED", status: 429 } } as never);
    renderForm();
    askForLink("ana@example.com");
    expect(await screen.findByTestId("login-error")).toHaveTextContent("Wait a minute");
  });

  it("al volver de un enlace caducado o usado, lo explica", () => {
    renderForm({ callbackError: "INVALID_TOKEN" });
    expect(screen.getByTestId("login-error")).toHaveTextContent("expired or was already used");
  });

  it("con passkey, entra y vuelve a donde iba", async () => {
    passkey.mockResolvedValue({ data: { session: {} }, error: null } as never);
    renderForm();
    fireEvent.click(screen.getByTestId("login-passkey"));
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith("/en/practice"));
  });

  it("sin credenciales de Google no aparece su botón", () => {
    renderForm({ googleEnabled: false });
    expect(screen.queryByTestId("login-google")).toBeNull();
    renderForm({ googleEnabled: true });
    expect(screen.getByTestId("login-google")).toBeInTheDocument();
  });
});
