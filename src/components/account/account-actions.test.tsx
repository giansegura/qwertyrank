import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import { navigateTo } from "@/lib/navigate";
import { renderWithIntl } from "@/test/render-with-intl";
import { AccountActions } from "./account-actions";

vi.mock("@/lib/auth-client", () => ({ authClient: { deleteUser: vi.fn(), signOut: vi.fn() } }));
vi.mock("@/lib/navigate", () => ({ navigateTo: vi.fn() }));

const deleteUser = vi.mocked(authClient.deleteUser);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountActions", () => {
  it("cerrar sesión vuelve a la portada", async () => {
    vi.mocked(authClient.signOut).mockResolvedValue({ data: { success: true }, error: null } as never);
    renderWithIntl(<AccountActions locale="en" />);
    fireEvent.click(screen.getByTestId("sign-out"));
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith("/en"));
  });

  it("borrar pide confirmación y, al confirmar, borra y vuelve a la portada", async () => {
    deleteUser.mockResolvedValue({ data: { success: true }, error: null } as never);
    renderWithIntl(<AccountActions locale="en" />);
    fireEvent.click(screen.getByTestId("delete-account"));
    expect(deleteUser).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("delete-confirm"));
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith("/en"));
  });

  it("con una sesión de hace más de un día, pide volver a entrar", async () => {
    deleteUser.mockResolvedValue({ data: null, error: { code: "SESSION_EXPIRED", status: 400 } } as never);
    renderWithIntl(<AccountActions locale="en" />);
    fireEvent.click(screen.getByTestId("delete-account"));
    fireEvent.click(screen.getByTestId("delete-confirm"));
    expect(await screen.findByTestId("reauth")).toHaveTextContent("sign in again");
    expect(navigateTo).not.toHaveBeenCalled();
  });
});
