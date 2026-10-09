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
    // Guides (spec 5c §2): the index and one fixed route per guide, with its slug in every locale. The page
    // is guides/[slug], whose param is always the internal id.
    "/guides": {
      en: "/guides",
      es: "/guias",
      pt: "/guias",
    },
    "/guides/average-typing-speed": {
      en: "/guides/average-typing-speed",
      es: "/guias/velocidad-media-de-escritura",
      pt: "/guias/velocidade-media-de-digitacao",
    },
    "/guides/how-to-type-faster": {
      en: "/guides/how-to-type-faster",
      es: "/guias/como-escribir-mas-rapido",
      pt: "/guias/como-digitar-mais-rapido",
    },
    "/guides/wpm-vs-cpm": {
      en: "/guides/wpm-vs-cpm",
      es: "/guias/ppm-y-cpm",
      pt: "/guias/ppm-e-cpm",
    },
    "/guides/finger-placement": {
      en: "/guides/finger-placement",
      es: "/guias/posicion-de-los-dedos",
      pt: "/guias/posicao-dos-dedos",
    },
    "/guides/physical-vs-touch-keyboard": {
      en: "/guides/physical-vs-touch-keyboard",
      es: "/guias/teclado-fisico-o-tactil",
      pt: "/guias/teclado-fisico-ou-touch",
    },
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
