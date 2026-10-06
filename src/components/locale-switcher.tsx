"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Href = ComponentProps<typeof Link>["href"];
type Pathname = ReturnType<typeof usePathname>;

/**
 * La misma página en otro idioma. Las rutas fijas (también los rankings) las traduce next-intl;
 * las que tienen parámetros (perfil, guardar) los conservan tal cual.
 */
export function localizedHref(pathname: Pathname, params: Record<string, string | string[] | undefined>): Href {
  switch (pathname) {
    case "/u/[nick]":
      return { pathname, params: { nick: String(params.nick) } };
    case "/save/[gameId]":
      return { pathname, params: { gameId: String(params.gameId) } };
    default:
      return pathname;
  }
}

const OPTION =
  "rounded px-1.5 py-0.5 font-mono text-xs uppercase text-zinc-500 aria-[current]:bg-zinc-200 aria-[current]:text-zinc-900 dark:aria-[current]:bg-zinc-800 dark:aria-[current]:text-zinc-100";

/** Al elegir un idioma en el desplegable, se cierra (en la lista de escritorio no hace nada). */
function closeMenu(event: MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useParams();
  const options = () =>
    routing.locales.map((option) => (
      <li key={option}>
        <Link
          href={localizedHref(pathname, params)}
          locale={option}
          onClick={closeMenu}
          aria-current={option === locale ? "true" : undefined}
          className={OPTION}
        >
          {option}
        </Link>
      </li>
    ));

  return (
    <nav aria-label={t("label")}>
      <ul className="hidden gap-2 sm:flex">{options()}</ul>
      {/* En móvil no caben los tres junto al menú: un desplegable con el idioma actual. */}
      <details className="relative sm:hidden">
        <summary
          data-testid="locale-menu"
          aria-label={t("open")}
          className="flex cursor-pointer list-none items-center gap-0.5 rounded px-1 py-0.5 font-mono text-xs uppercase text-zinc-500 [&::-webkit-details-marker]:hidden"
        >
          {locale}
          <span aria-hidden>▾</span>
        </summary>
        <ul className="absolute right-0 z-10 mt-1 flex flex-col gap-1 rounded-md border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          {options()}
        </ul>
      </details>
    </nav>
  );
}
