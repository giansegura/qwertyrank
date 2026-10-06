import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { RankSummary } from "./rank-summary";

const RANKS = { day: 3, week: 10, month: 25, all: 120 };

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
});
