import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GameResult } from "@/lib/game/result";
import { renderWithIntl } from "@/test/render-with-intl";
import { ResultCard } from "./result-card";

const RESULT: GameResult = {
  id: "3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f",
  language: "pt",
  inputType: "touch",
  wpm: 81.6,
  accuracy: 97.9,
  startsAt: new Date("2026-10-02T10:00:00.000Z"),
  player: { nick: "Gian", country: "ES" },
};

describe("ResultCard", () => {
  it("la cifra redondeada, la precisión hacia abajo, el ranking y el jugador enlazado a su perfil", () => {
    renderWithIntl(<ResultCard result={RESULT} />, "es");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("82 ppm");
    expect(screen.getByText("97 % de precisión")).toBeInTheDocument();
    expect(screen.getByText("Portugués · teclado táctil")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Gian/ })).toHaveAttribute("href", "/es/u/Gian");
  });

  it("anónima: «Anónimo» sin enlace", () => {
    renderWithIntl(<ResultCard result={{ ...RESULT, player: null }} />, "es");
    expect(screen.getByText("Anónimo")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Anónimo/ })).toBeNull();
  });

  it("la llamada a jugar lleva al test y al ranking del idioma de la partida", () => {
    renderWithIntl(<ResultCard result={RESULT} />, "es");
    expect(screen.getByRole("link", { name: "Hacer el test" })).toHaveAttribute("href", "/pt");
    expect(screen.getByRole("link", { name: "Ver ranking" })).toHaveAttribute("href", "/pt/ranking/tatil");
  });
});
