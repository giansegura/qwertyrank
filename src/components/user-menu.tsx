"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { loginHref } from "@/lib/auth-paths";
import { SESSION_CHANGED_EVENT, forgetViewer, getViewer, type Viewer } from "@/lib/viewer";

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
    const load = () => getViewer().then((value) => active && setViewer(value));
    const reload = () => {
      forgetViewer();
      void load();
    };
    void load();
    window.addEventListener(SESSION_CHANGED_EVENT, reload);
    return () => {
      active = false;
      window.removeEventListener(SESSION_CHANGED_EVENT, reload);
    };
  }, []);

  // Hueco de tamaño fijo (24 px de alto, como la fila del logo en móvil): la cabecera no se mueve
  // cuando llega la sesión (CLS = 0).
  return (
    <div className="flex w-7 justify-end sm:w-32">
      {viewer === null && (
        <Link
          href={loginHref(pathname)}
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
