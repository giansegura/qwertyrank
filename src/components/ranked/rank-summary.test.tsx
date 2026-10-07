import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { VERIFICATION_CHANGED_EVENT } from "@/lib/viewer";
import { renderWithIntl } from "@/test/render-with-intl";
import { RankSummary } from "./rank-summary";

const RANKS = { day: 3, week: 10, month: 25, all: 120 };
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
  it("con cuenta: la posición en cada periodo, si es nueva marca y el enlace al ranking del idioma del test", () => {
    renderWithIntl(
      <RankSummary ranking={{ kind: "ranked", ranks: RANKS, improved: ["day"] }} gameId="g1" language="es" inputType="physical" />,
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("#3 today · #10 this week · #25 this month · #120 all time");
    expect(summary).toHaveTextContent("New personal best!");
    expect(screen.getByRole("link", { name: "View ranking" })).toHaveAttribute("href", "/es/ranking/fisico/hoy");
  });

  it("anónima: la posición que tendría hoy y el botón para guardarla", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "would_rank", ranks: RANKS }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("You'd be #3 today.");
    expect(screen.getByTestId("save-game")).toHaveAttribute("href", "/en/save/g1");
  });

  it("con poca precisión, explica el mínimo", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "low_accuracy" }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("at least 90% accuracy");
  });

  it("si el día ya ha acabado (partida de antes de medianoche), empieza por la semana y enlaza a ella", () => {
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "ranked", ranks: { week: 10, month: 25, all: 120 }, improved: [] }}
        gameId="g1"
        language="es"
        inputType="physical"
      />,
    );
    expect(screen.getByTestId("rank-summary")).toHaveTextContent(/^#10 this week · #25 this month · #120 all time/);
    expect(screen.getByRole("link", { name: "View ranking" })).toHaveAttribute("href", "/es/ranking/fisico/semana");
  });

  it("anónima sin el día: la posición que tendría en la semana", () => {
    renderWithIntl(
      <RankSummary ranking={{ kind: "would_rank", ranks: { week: 10, all: 120 } }} gameId="g1" language="en" inputType="touch" />,
    );
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("You'd be #10 this week.");
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
        ranking={{ kind: "review", ranks: { week: 1, all: 4 }, verification: VERIFICATION }}
        gameId="g1"
        language="es"
        inputType="physical"
        onVerify={onVerify}
      />,
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("Your score would be #1 this week · #4 all time.");
    expect(summary).toHaveTextContent("a 30-second game with the text shown as an image. You need 52.3 wpm.");
    expect(await screen.findByText("2 attempts · 6 h left")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("verify-now"));
    expect(onVerify).toHaveBeenCalledWith(VERIFICATION);
  });

  it("en review tras «Guárdalo» (sin partida en la misma pantalla), «Verificar ahora» lleva a /verify", () => {
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", ranks: { all: 4 }, verification: VERIFICATION }}
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
      <RankSummary ranking={{ kind: "ranked", ranks: RANKS, improved: [] }} gameId="g1" language="es" inputType="physical" />,
    );
    unmount();
    expect(changed).not.toHaveBeenCalled();

    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", ranks: { all: 4 }, verification: VERIFICATION }}
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
        ranking={{ kind: "review", ranks: { day: 2, week: 2, month: 2, all: 9 }, verification: VERIFICATION }}
        gameId="g1"
        language="es"
        inputType="physical"
        onVerify={() => {}}
      />,
      "es",
    );
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("Tu marca entraría #2 hoy · #2 esta semana · #2 este mes · #9 de siempre.");
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("Necesitas 52,3 ppm.");
  });

  it("en review sin intentos: no se puede verificar, sin el botón ni lo que necesitaría", () => {
    renderWithIntl(
      <RankSummary
        ranking={{ kind: "review", ranks: { day: 2, all: 9 }, verification: { ...VERIFICATION, attemptsLeft: 0 } }}
        gameId="g1"
        language="es"
        inputType="physical"
        onVerify={() => {}}
      />,
      "es",
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("Tu marca entraría #2 hoy · #9 de siempre.");
    expect(summary).toHaveTextContent("No se ha podido verificar. Tu partida no entra en el ranking; puedes intentarlo con otra.");
    expect(summary).not.toHaveTextContent("Necesitas");
    expect(screen.queryByTestId("verify-now")).toBeNull();
  });
});
