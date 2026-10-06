"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";

/** Evento para que la cabecera vuelva a pedir la sesión, p. ej. tras cambiar el nick. */
export const SESSION_CHANGED_EVENT = "qr:session-changed";

type Viewer = { nick: string } | null;

/** Sin el cliente de Better Auth: en la portada cada KB cuenta (spec §7.5). */
async function fetchViewer(): Promise<Viewer> {
  const response = await fetch("/api/auth/get-session", { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { user?: { nick?: string } } | null;
  return data?.user?.nick ? { nick: data.user.nick } : null;
}

function UserIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" />
    </svg>
  );
}

export function UserMenu() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const load = () =>
      fetchViewer().then(
        (value) => active && setViewer(value),
        () => active && setViewer(null),
      );
    void load();
    window.addEventListener(SESSION_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, load);
    };
  }, []);

  // Hueco de tamaño fijo (24 px de alto, como la fila del logo en móvil): la cabecera no se mueve
  // cuando llega la sesión (CLS = 0).
  return (
    <div className="flex w-7 justify-end sm:w-32">
      {viewer === null && (
        <Link
          href={pathname ? { pathname: "/login", query: { next: pathname } } : "/login"}
          data-testid="user-menu"
          aria-label={t("signIn")}
          className="flex items-center font-medium"
        >
          <UserIcon className="size-6 sm:hidden" />
          <span className="hidden sm:inline">{t("signIn")}</span>
        </Link>
      )}
      {viewer && (
        <Link
          href="/settings"
          data-testid="user-menu"
          aria-label={t("account", { nick: viewer.nick })}
          className="flex min-w-0 items-center font-medium"
        >
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-full bg-amber-500 font-mono text-xs font-semibold uppercase text-zinc-950 sm:hidden"
          >
            {viewer.nick[0]}
          </span>
          <span className="hidden truncate sm:inline">{viewer.nick}</span>
        </Link>
      )}
    </div>
  );
}
