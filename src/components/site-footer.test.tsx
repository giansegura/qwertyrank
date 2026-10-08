import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("la beta y los comentarios abren un correo; las páginas legales, con su ruta traducida", () => {
    renderWithIntl(<SiteFooter />, "es");
    expect(screen.getByRole("link", { name: "Beta: envíanos tus comentarios" })).toHaveAttribute("href", "mailto:feedback@qwertyrank.com");
    expect(screen.getByRole("link", { name: "Envíanos tus comentarios" })).toHaveAttribute(
      "href",
      "mailto:feedback@qwertyrank.com",
    );
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/es/privacidad");
    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/es/terminos");
  });

  it.each([
    ["en", "/en/privacy", "/en/terms"],
    ["pt", "/pt/privacidade", "/pt/termos"],
  ] as const)("en %s, las rutas de su idioma", (locale, privacy, terms) => {
    renderWithIntl(<SiteFooter />, locale);
    const links = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toContain(privacy);
    expect(links).toContain(terms);
  });
});
