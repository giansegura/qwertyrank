import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import { renderWithIntl } from "@/test/render-with-intl";
import { PasskeyList } from "./passkey-list";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useListPasskeys: vi.fn(),
    passkey: { addPasskey: vi.fn(), deletePasskey: vi.fn() },
    signOut: vi.fn(),
  },
}));
vi.mock("@/lib/navigate", () => ({ navigateTo: vi.fn() }));

const addPasskey = vi.mocked(authClient.passkey.addPasskey);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authClient.useListPasskeys).mockReturnValue({ data: [], isPending: false } as never);
});

describe("PasskeyList", () => {
  it("lista las passkeys con su fecha", () => {
    vi.mocked(authClient.useListPasskeys).mockReturnValue({
      data: [{ id: "p1", name: null, createdAt: "2026-10-05T10:00:00.000Z" }],
      isPending: false,
    } as never);
    renderWithIntl(<PasskeyList locale="en" />);
    expect(screen.getByTestId("passkey-item")).toHaveTextContent("Passkey");
    expect(screen.getByTestId("passkey-item")).toHaveTextContent("2026");
  });

  it("si la sesión no es reciente, pide volver a entrar", async () => {
    addPasskey.mockResolvedValue({ data: null, error: { code: "SESSION_NOT_FRESH", status: 403 } } as never);
    renderWithIntl(<PasskeyList locale="en" />);
    fireEvent.click(screen.getByTestId("passkey-add"));
    expect(await screen.findByTestId("reauth")).toHaveTextContent("sign in again");
  });

  it("cancelar el diálogo del navegador no es un error", async () => {
    addPasskey.mockResolvedValue({ data: null, error: { code: "ERROR_CEREMONY_ABORTED", status: 400 } } as never);
    renderWithIntl(<PasskeyList locale="en" />);
    fireEvent.click(screen.getByTestId("passkey-add"));
    await vi.waitFor(() => expect(addPasskey).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
