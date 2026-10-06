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
    // Una ruta fija por ranking visible (spec §7.1); la página es leaderboard/[input]/[period].
    "/leaderboard/physical/today": {
      en: "/leaderboard/physical/today",
      es: "/ranking/fisico/hoy",
      pt: "/ranking/fisico/hoje",
    },
    "/leaderboard/physical/week": {
      en: "/leaderboard/physical/week",
      es: "/ranking/fisico/semana",
      pt: "/ranking/fisico/semana",
    },
    "/leaderboard/physical/month": {
      en: "/leaderboard/physical/month",
      es: "/ranking/fisico/mes",
      pt: "/ranking/fisico/mes",
    },
    "/leaderboard/physical/all-time": {
      en: "/leaderboard/physical/all-time",
      es: "/ranking/fisico/siempre",
      pt: "/ranking/fisico/sempre",
    },
    "/leaderboard/touch/today": {
      en: "/leaderboard/touch/today",
      es: "/ranking/tactil/hoy",
      pt: "/ranking/tatil/hoje",
    },
    "/leaderboard/touch/week": {
      en: "/leaderboard/touch/week",
      es: "/ranking/tactil/semana",
      pt: "/ranking/tatil/semana",
    },
    "/leaderboard/touch/month": {
      en: "/leaderboard/touch/month",
      es: "/ranking/tactil/mes",
      pt: "/ranking/tatil/mes",
    },
    "/leaderboard/touch/all-time": {
      en: "/leaderboard/touch/all-time",
      es: "/ranking/tactil/siempre",
      pt: "/ranking/tatil/sempre",
    },
    "/save/[gameId]": {
      en: "/save/[gameId]",
      es: "/guardar/[gameId]",
      pt: "/salvar/[gameId]",
    },
    "/u/[nick]": "/u/[nick]",
  },
});

export type Locale = (typeof routing.locales)[number];
