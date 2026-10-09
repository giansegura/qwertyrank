import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { ProfileView } from "./profile-view";

const RECORD_GAME = "3f6c1e2a-9b4d-4c8e-a1f2-0d9e8b7c6a5f";
const HISTORY_GAME = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

describe("ProfileView", () => {
  it("each record and each game in the history links to its result page", () => {
    renderWithIntl(
      <ProfileView
        profile={{
          nick: "Gian",
          country: null,
          memberSince: new Date("2026-10-01T00:00:00.000Z"),
          records: [{ gameId: RECORD_GAME, language: "es", inputType: "physical", wpm: 80, accuracy: 97 }],
          history: [{ id: HISTORY_GAME, startsAt: new Date("2026-10-02T10:00:00.000Z"), language: "es", inputType: "physical", wpm: 70, accuracy: 95 }],
        }}
      />,
      "es",
    );
    expect(within(screen.getByTestId("profile-records")).getByRole("link")).toHaveAttribute("href", `/es/r/${RECORD_GAME}`);
    expect(within(screen.getByTestId("profile-history")).getByRole("link")).toHaveAttribute("href", `/es/r/${HISTORY_GAME}`);
  });
});
