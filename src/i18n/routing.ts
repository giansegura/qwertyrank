import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "pt"],
  defaultLocale: "en",
  // Por defecto es una cookie de sesión: la elección manual se perdería al cerrar el
  // navegador, y el spec (§7.2) pide que siempre prevalezca.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
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
    // Una ruta fija por ranking (spec §7.1); la página es leaderboard/[input], y el idioma del ranking es
    // el de la página.
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
    // Récords pendientes de verificar (spec 4b §4.3).
    "/verify": {
      en: "/verify",
      es: "/verificar",
      pt: "/verificar",
    },
  },
});

export type Locale = (typeof routing.locales)[number];
