import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { VerifyList } from "./verify-list";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));
// La partida tiene sus propias pruebas: aquí solo importa que se carga con la verificación elegida y
// cómo acaba (`gone`: la verificación ya no existía, 409).
const fakeGame = () => ({
  VerificationGame: ({ verification, onDone }: { verification: { id: string }; onDone: (gone: boolean) => void }) => (
    <>
      <button type="button" data-testid="verification-game" onClick={() => onDone(false)}>
        {verification.id}
      </button>
      <button type="button" data-testid="verification-gone" onClick={() => onDone(true)}>
        gone
      </button>
    </>
  ),
});
vi.mock("./verification-game", () => fakeGame());

const PENDING = [
  {
    id: "v1",
    language: "es" as const,
    inputType: "touch" as const,
    targetWpm: 61.5,
    requiredWpm: 52.3,
    attemptsLeft: 1,
    expiresAt: new Date(Date.now() + 2.5 * 3_600_000).toISOString(),
  },
];

/** Elige la primera verificación y espera a que se descargue su partida. */
async function startFirst() {
  fireEvent.click(screen.getByTestId("verify-start"));
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("VerifyList", () => {
  it("lista cada récord con lo que necesita, intentos y horas", async () => {
    renderWithIntl(<VerifyList pending={PENDING} />);
    const item = screen.getByTestId("verify-item");
    expect(item).toHaveTextContent("Spanish · touch keyboard");
    expect(item).toHaveTextContent("Record: 61.5 wpm · you need 52.3 wpm · 1 attempt");
    expect(await screen.findByText(/· 3 h left/)).toBeInTheDocument();
  });

  it("al elegir uno empieza su partida de verificación; al acabar, vuelve a pedir la lista", async () => {
    renderWithIntl(<VerifyList pending={PENDING} />);
    await startFirst();
    expect(screen.getByTestId("verification-game")).toHaveTextContent("v1");
    expect(screen.queryByTestId("verify-list")).toBeNull();
    fireEvent.click(screen.getByTestId("verification-game"));
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId("verify-list")).toBeInTheDocument();
  });

  it("si la verificación ya no estaba disponible (409), «Jugar Ranked» lleva a la portada", async () => {
    renderWithIntl(<VerifyList pending={PENDING} />, "es");
    await startFirst();
    fireEvent.click(screen.getByTestId("verification-gone"));
    expect(router.push).toHaveBeenCalledWith("/es");
  });

  it("sin pendientes lo dice y lleva a jugar", () => {
    renderWithIntl(<VerifyList pending={[]} />);
    expect(screen.getByText("You have no records waiting for verification.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play Ranked" })).toHaveAttribute("href", "/en");
  });

  it("si no se puede descargar la partida de verificación, dice que Ranked no está disponible", async () => {
    // Sin el módulo ya cargado: la descarga de la partida falla.
    vi.doMock("./verification-game", () => {
      throw new Error("chunk load failed");
    });
    vi.resetModules();
    try {
      renderWithIntl(<VerifyList pending={PENDING} />);
      await startFirst();
      expect(screen.getByRole("alert")).toHaveTextContent("Ranked isn't available right now.");
      expect(screen.getByRole("link", { name: "Go to practice" })).toHaveAttribute("href", "/en/practice");
      expect(screen.queryByTestId("verification-game")).toBeNull();
    } finally {
      vi.doMock("./verification-game", () => fakeGame());
      vi.resetModules();
    }
  });
});
