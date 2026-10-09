import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { LeaderboardTable } from "./leaderboard-table";

describe("LeaderboardTable", () => {
  it("one row per player, with position, flag, profile link, wpm and accuracy", () => {
    renderWithIntl(
      <LeaderboardTable
        entries={[
          { rank: 1, nick: "gian_42", country: "ES", wpm: 98.6, accuracy: 99.4 },
          { rank: 2, nick: "ana", country: null, wpm: 80, accuracy: 95 },
        ]}
      />,
    );
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "#",
      "Player",
      "WPM",
      "Accuracy",
    ]);
    const [first, second] = screen.getAllByTestId("leaderboard-row");
    expect(first).toHaveTextContent("1");
    expect(first).toHaveTextContent("🇪🇸 gian_42");
    expect(first).toHaveTextContent("99");
    expect(first).toHaveTextContent("99%");
    expect(screen.getByRole("link", { name: /gian_42/ })).toHaveAttribute("href", "/en/u/gian_42");
    expect(second).toHaveAttribute("data-nick", "ana");
  });

  it("headers and accuracy formatted for each language", () => {
    renderWithIntl(<LeaderboardTable entries={[{ rank: 1, nick: "ana", country: null, wpm: 80, accuracy: 95.7 }]} />, "es");
    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "#",
      "Jugador",
      "PPM",
      "Precisión",
    ]);
    expect(screen.getByTestId("leaderboard-row")).toHaveTextContent("95 %");
  });

  it("with no players, invites to play", () => {
    renderWithIntl(<LeaderboardTable entries={[]} />);
    expect(screen.getByTestId("leaderboard-empty")).toHaveTextContent("Be the first!");
    expect(screen.getByRole("link", { name: "Play Ranked" })).toHaveAttribute("href", "/en");
  });
});
