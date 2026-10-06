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

  it("si no hay ranking (no válida o Redis caído), no enseña nada", () => {
    const { container } = renderWithIntl(
      <RankSummary ranking={{ kind: "unavailable" }} gameId="g1" language="en" inputType="touch" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
