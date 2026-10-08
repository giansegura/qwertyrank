import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { RankSummary } from "./rank-summary";

const VERIFICATION = {
  id: "v1",
  language: "es" as const,
  inputType: "physical" as const,
  targetWpm: 61.5,
  requiredWpm: 52.3,
  attemptsLeft: 2,
  // Dentro de 5 h y media: "quedan 6 h".
  expiresAt: new Date(Date.now() + 5.5 * 3_600_000).toISOString(),
};

describe("RankSummary", () => {
  it("con cuenta: su posición, si es nueva marca y el enlace al ranking del idioma del test", () => {
    renderWithIntl(
      <RankSummary ranking={{ kind: "ranked", rank: 3, improved: true }} gameId="g1" language="es" inputType="physical" />,
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("#3 on the leaderboard");
    expect(summary).toHaveTextContent("New personal best!");
    expect(screen.getByRole("link", { name: "View ranking" })).toHaveAttribute("href", "/es/ranking/fisico/siempre");
  });

  it("con cuenta y sin mejorar su marca: su posición, sin «nueva marca»", () => {
    renderWithIntl(
      <RankSummary ranking={{ kind: "ranked", rank: 120, improved: false }} gameId="g1" language="es" inputType="physical" />,
      "es",
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("#120 en el ranking");
    expect(summary).not.toHaveTextContent("¡Nueva mejor marca!");
  });

  it("anónima: la posición que tendría y el botón para guardarla", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "would_rank", rank: 3 }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("You'd be #3 on the leaderboard.");
    expect(screen.getByTestId("save-game")).toHaveAttribute("href", "/en/save/g1");
  });

  it("con poca precisión, explica el mínimo", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "low_accuracy" }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("at least 90% accuracy");
  });

  it("con Redis caído avisa de que el ranking no está disponible, y la anónima se puede guardar igual", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "unavailable", canSave: true }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("The ranking is temporarily unavailable");
    expect(screen.getByTestId("save-game")).toHaveAttribute("href", "/en/save/g1");
  });

  it("con Redis caído y cuenta, solo el aviso", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "unavailable", canSave: false }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("The ranking is temporarily unavailable");
    expect(screen.queryByTestId("save-game")).toBeNull();
  });

  it("una partida no válida no enseña nada", () => {
    const { container } = renderWithIntl(
      <RankSummary ranking={{ kind: "unranked" }} gameId="g1" language="en" inputType="touch" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("en review: la posición que tendría, lo que necesita, intentos y horas, y el botón de verificar", async () => {
    const onVerify = vi.fn();
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", rank: 4, verification: VERIFICATION }}
        gameId="g1"
        language="es"
        inputType="physical"
        onVerify={onVerify}
      />,
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("Your score would be #4.");
    expect(summary).toHaveTextContent("a 30-second game with the text shown as an image. You need 52.3 wpm.");
    expect(await screen.findByText("2 attempts · 6 h left")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("verify-now"));
    expect(onVerify).toHaveBeenCalledWith(VERIFICATION);
  });

  it("en review tras «Guárdalo» (sin partida en la misma pantalla), «Verificar ahora» lleva a /verify", () => {
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", rank: 4, verification: VERIFICATION }}
        gameId="g1"
        language="es"
        inputType="physical"
      />,
      "es",
    );
    expect(screen.getByTestId("verify-now")).toHaveAttribute("href", "/es/verificar");
  });

  it("un récord en review avisa a la cabecera de que hay una verificación nueva; una marca publicada, no", () => {
    const changed = vi.fn();
    window.addEventListener(VERIFICATION_CHANGED_EVENT, changed);
    onTestFinished(() => window.removeEventListener(VERIFICATION_CHANGED_EVENT, changed));
    const { unmount } = renderWithIntl(
      <RankSummary ranking={{ kind: "ranked", rank: 3, improved: false }} gameId="g1" language="es" inputType="physical" />,
    );
    unmount();
    expect(changed).not.toHaveBeenCalled();

    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", rank: 4, verification: VERIFICATION }}
        gameId="g1"
        language="es"
        inputType="physical"
      />,
    );
    expect(changed).toHaveBeenCalledOnce();
  });

  it("en review, en español: «Tu marca entraría…» y las PPM con coma", () => {
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", rank: 2, verification: VERIFICATION }}
        gameId="g1"
        language="es"
        inputType="physical"
        onVerify={() => {}}
      />,
      "es",
    );
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("Tu marca entraría el #2.");
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("Necesitas 52,3 ppm.");
  });

  it("en review sin intentos: no se puede verificar, sin el botón ni lo que necesitaría", () => {
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", rank: 9, verification: { ...VERIFICATION, attemptsLeft: 0 } }}
        gameId="g1"
        language="es"
        inputType="physical"
        onVerify={() => {}}
      />,
      "es",
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("Tu marca entraría el #9.");
    expect(summary).toHaveTextContent("No se ha podido verificar. Tu partida no entra en el ranking; puedes intentarlo con otra.");
    expect(summary).not.toHaveTextContent("Necesitas");
    expect(screen.queryByTestId("verify-now")).toBeNull();
  });
});
