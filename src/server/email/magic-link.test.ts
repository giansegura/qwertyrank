import { describe, expect, it } from "vitest";
import { magicLinkEmail, magicLinkLocale } from "./magic-link";

const VERIFY = "http://localhost:3000/api/auth/magic-link/verify?token=abc";

describe("magicLinkLocale", () => {
  it("el idioma es el de la página desde la que se pidió (callbackURL)", () => {
    expect(magicLinkLocale(`${VERIFY}&callbackURL=%2Fes%2Fpractica`)).toBe("es");
    expect(magicLinkLocale(`${VERIFY}&callbackURL=%2Fpt`)).toBe("pt");
  });

  it("sin callbackURL o con un idioma que no existe, inglés", () => {
    expect(magicLinkLocale(VERIFY)).toBe("en");
    expect(magicLinkLocale(`${VERIFY}&callbackURL=%2Ffr%2Fx`)).toBe("en");
  });
});

describe("magicLinkEmail", () => {
  it("lleva el enlace en el texto y en el HTML, en el idioma de la página", async () => {
    const url = `${VERIFY}&callbackURL=%2Fes`;
    const email = await magicLinkEmail("ana@example.com", url);
    expect(email).toMatchObject({ to: "ana@example.com", subject: "Tu enlace para entrar en QwertyRank" });
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${url.replaceAll("&", "&amp;")}"`);
  });
});
