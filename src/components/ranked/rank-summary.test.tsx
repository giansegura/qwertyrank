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
  // In five and a half hours: "6 h left".
  expiresAt: new Date(Date.now() + 5.5 * 3_600_000).toISOString(),
};

describe("RankSummary", () => {
  it("with an account: their position, whether it is a new best and the link to the test language's ranking", () => {
    renderWithIntl(
      <RankSummary ranking={{ kind: "ranked", rank: 3, improved: true }} gameId="g1" language="es" inputType="physical" />,
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("#3 on the leaderboard");
    expect(summary).toHaveTextContent("New personal best!");
    expect(screen.getByRole("link", { name: "View ranking" })).toHaveAttribute("href", "/es/ranking/fisico");
  });

  it('with an account and no improvement on their best: their position, without "new best"', () => {
    renderWithIntl(
      <RankSummary ranking={{ kind: "ranked", rank: 120, improved: false }} gameId="g1" language="es" inputType="physical" />,
      "es",
    );
    const summary = screen.getByTestId("rank-summary");
    expect(summary).toHaveTextContent("#120 en el ranking");
    expect(summary).not.toHaveTextContent("¡Nueva mejor marca!");
  });

  it("anonymous: the position it would have and the button to save it", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "would_rank", rank: 3 }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("You'd be #3 on the leaderboard.");
    expect(screen.getByTestId("save-game")).toHaveAttribute("href", "/en/save/g1");
  });

  it("with low accuracy, explains the minimum", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "low_accuracy" }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("at least 90% accuracy");
  });

  it("with Redis down warns that the ranking is unavailable, and the anonymous game can still be saved", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "unavailable", canSave: true }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("The ranking is temporarily unavailable");
    expect(screen.getByTestId("save-game")).toHaveAttribute("href", "/en/save/g1");
  });

  it("with Redis down and an account, only the warning", () => {
    renderWithIntl(<RankSummary ranking={{ kind: "unavailable", canSave: false }} gameId="g1" language="en" inputType="touch" />);
    expect(screen.getByTestId("rank-summary")).toHaveTextContent("The ranking is temporarily unavailable");
    expect(screen.queryByTestId("save-game")).toBeNull();
  });

  it("an invalid game shows nothing", () => {
    const { container } = renderWithIntl(
      <RankSummary ranking={{ kind: "unranked" }} gameId="g1" language="en" inputType="touch" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("in review: the position it would have, what it needs, attempts and hours, and the verify button", async () => {
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

  it('in review after "Save it" (no game on the same screen), "Verify now" goes to /verify', () => {
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

  it("a record in review tells the header there is a new verification; a published best does not", () => {
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

  it('in review, in Spanish: "Tu marca entraría…" and the wpm with a decimal comma', () => {
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

  it("in review with no attempts left: it cannot be verified, without the button or what it would need", () => {
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
