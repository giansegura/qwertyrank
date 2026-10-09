import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "pt"],
  defaultLocale: "en",
  // By default it is a session cookie: the manual choice would be lost when the browser
  // is closed, and the spec (§7.2) asks for it to always prevail.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
  // No `Link` header with alternates: each page's HTML sets them (spec 5b §3.2), with its own x-default.
  alternateLinks: false,
  pathnames: {
    "/": "/",
    "/practice": {
      en: "/practice",
      es: "/practica",
      pt: "/pratica",
    },
    "/login": {
      en: "/sign-in",
      es: "/entrar",
      pt: "/entrar",
    },
    "/settings": {
      en: "/settings",
      es: "/ajustes",
      pt: "/configuracoes",
    },
    "/leaderboard": {
      en: "/leaderboard",
      es: "/ranking",
      pt: "/ranking",
    },
    // One fixed route per ranking (spec §7.1); the page is leaderboard/[input], and the ranking's language is
    // the page's.
    "/leaderboard/physical": {
      en: "/leaderboard/physical",
      es: "/ranking/fisico",
      pt: "/ranking/fisico",
    },
    "/leaderboard/touch": {
      en: "/leaderboard/touch",
      es: "/ranking/tactil",
      pt: "/ranking/tatil",
    },
    "/save/[gameId]": {
      en: "/save/[gameId]",
      es: "/guardar/[gameId]",
      pt: "/salvar/[gameId]",
    },
    "/u/[nick]": "/u/[nick]",
    // Result page of a game (spec 5d §3.1).
    "/r/[id]": "/r/[id]",
    // Legal pages (spec 5a §4.1).
    "/privacy": {
      en: "/privacy",
      es: "/privacidad",
      pt: "/privacidade",
    },
    "/terms": {
      en: "/terms",
      es: "/terminos",
      pt: "/termos",
    },
    // Records pending verification (spec 4b §4.3).
    "/verify": {
      en: "/verify",
      es: "/verificar",
      pt: "/verificar",
    },
  },
});

export type Locale = (typeof routing.locales)[number];
