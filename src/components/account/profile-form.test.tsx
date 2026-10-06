import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CHANGED_EVENT } from "@/components/user-menu";
import { navigateTo } from "@/lib/navigate";
import { renderWithIntl } from "@/test/render-with-intl";
import { ProfileForm } from "./profile-form";

vi.mock("@/lib/navigate", () => ({ navigateTo: vi.fn() }));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const COUNTRIES = [
  { code: "BR", name: "Brazil" },
  { code: "ES", name: "Spain" },
] as const;

function renderForm(continueTo: string | null = null) {
  return renderWithIntl(
    <ProfileForm countries={COUNTRIES} initialNick="gian_42" initialCountry={null} continueTo={continueTo} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfileForm", () => {
  it("guarda nick y país, y avisa a la cabecera", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    window.addEventListener(SESSION_CHANGED_EVENT, listener);
    renderForm();

    fireEvent.change(screen.getByTestId("profile-nick"), { target: { value: " gian_rapido " } });
    fireEvent.change(screen.getByTestId("profile-country"), { target: { value: "ES" } });
    fireEvent.click(screen.getByTestId("profile-save"));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ nick: "gian_rapido", country: "ES" }) }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_CHANGED_EVENT, listener);
  });

  it("si el nick está ocupado, lo explica", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nick_taken" }, 409)));
    renderForm();
    fireEvent.click(screen.getByTestId("profile-save"));
    expect(await screen.findByTestId("profile-error")).toHaveTextContent("That nick is taken");
  });

  it("en la bienvenida, tras guardar sigue adonde iba", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    renderForm("/en/practice");
    expect(screen.getByTestId("profile-save")).toHaveTextContent("Save and continue");
    fireEvent.click(screen.getByTestId("profile-save"));
    await vi.waitFor(() => expect(navigateTo).toHaveBeenCalledWith("/en/practice"));
  });

  it("el país empieza sin elegir y las opciones son las que calcula el servidor, en su orden", () => {
    // Una sola fuente para los nombres: Node y el navegador traen datos de ICU distintos y,
    // si cada uno calculase los suyos, el HTML no coincidiría al hidratar.
    renderForm();
    const select = screen.getByTestId("profile-country") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect([...select.options].map((option) => option.value)).toEqual(["", "BR", "ES"]);
    expect(select.querySelector('option[value="ES"]')).toHaveTextContent("🇪🇸 Spain");
  });
});
