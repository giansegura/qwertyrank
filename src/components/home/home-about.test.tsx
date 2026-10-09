import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { HomeAbout } from "./home-about";

describe("HomeAbout", () => {
  it("links to practice and to the guides index in the page's language", () => {
    renderWithIntl(<HomeAbout />, "pt");
    expect(screen.getByRole("link", { name: "prática de 15 segundos" })).toHaveAttribute("href", "/pt/pratica");
    expect(screen.getByRole("link", { name: "guias de digitação" })).toHaveAttribute("href", "/pt/guias");
  });
});
