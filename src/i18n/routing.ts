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
  },
});

export type Locale = (typeof routing.locales)[number];
