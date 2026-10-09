import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/** Only returns to own routes in the same language: prevents open redirects (`?next=https://…`). */
export function safeNext(locale: Locale, next: string | null | undefined): string {
  const home = `/${locale}`;
  if (!next || next.startsWith("//") || next.includes("\\")) return home;
  return next === home || next.startsWith(`${home}/`) || next.startsWith(`${home}?`) ? next : home;
}

export function loginPath(locale: Locale, next?: string): string {
  const path = getPathname({ locale, href: "/login" });
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/** Where a newly created account goes: settings, in welcome mode, and then to `next`. */
export function welcomePath(locale: Locale, next: string): string {
  return `${getPathname({ locale, href: "/settings" })}?welcome=1&next=${encodeURIComponent(next)}`;
}

/** Sign-in link that returns to the current page (`pathname` from `usePathname()` of `next/navigation`). */
export function loginHref(pathname: string | null) {
  return pathname ? { pathname: "/login" as const, query: { next: pathname } } : ("/login" as const);
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
