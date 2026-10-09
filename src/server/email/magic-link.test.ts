import { describe, expect, it } from "vitest";
import { magicLinkEmail, magicLinkLocale } from "./magic-link";

const VERIFY = "http://localhost:3000/api/auth/magic-link/verify?token=abc";

describe("magicLinkLocale", () => {
  it("the language is the one of the page it was requested from (callbackURL)", () => {
    expect(magicLinkLocale(`${VERIFY}&callbackURL=%2Fes%2Fpractica`)).toBe("es");
    expect(magicLinkLocale(`${VERIFY}&callbackURL=%2Fpt`)).toBe("pt");
  });

  it("without callbackURL or with a language that does not exist, English", () => {
    expect(magicLinkLocale(VERIFY)).toBe("en");
    expect(magicLinkLocale(`${VERIFY}&callbackURL=%2Ffr%2Fx`)).toBe("en");
  });
});

describe("magicLinkEmail", () => {
  it("carries the link in the text and in the HTML, in the page's language", async () => {
    const url = `${VERIFY}&callbackURL=%2Fes`;
    const email = await magicLinkEmail("ana@example.com", url);
    expect(email).toMatchObject({ to: "ana@example.com", subject: "Tu enlace para entrar en QwertyRank" });
    expect(email.text).toContain(url);
    expect(email.html).toContain(`href="${url.replaceAll("&", "&amp;")}"`);
  });
});
