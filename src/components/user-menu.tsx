"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { loginHref } from "@/lib/auth-paths";
import type { PendingVerification } from "@/lib/verification";
import {
  SESSION_CHANGED_EVENT,
  VERIFICATION_CHANGED_EVENT,
  fetchPendingVerifications,
  forgetViewer,
  getViewer,
  type Viewer,
} from "@/lib/viewer";

function UserIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" strokeLinecap="round" />
    </svg>
  );
}

/** El aviso de récord pendiente, ya descargado, con las pendientes que enseña. */
interface Notice {
  PendingNotice: typeof import("./verification/pending-notice").PendingNotice;
  pending: PendingVerification[];
}

export function UserMenu() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer | undefined>(undefined);
  // Récords pendientes de verificar (spec 4b §4.3): el aviso se descarga solo si hay alguno.
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // Cada carga tiene un número y solo cuenta la última: una respuesta que llega tarde no pisa a la
    // siguiente. Al desmontar, ninguna.
    let latest = 0;
    const load = async () => {
      const id = ++latest;
      const value = await getViewer();
      if (id !== latest) return;
      setViewer(value);
      const pending = value ? await fetchPendingVerifications() : [];
      const loaded = pending.length > 0 ? await import("./verification/pending-notice").catch(() => null) : null;
      if (id === latest) setNotice(loaded && { PendingNotice: loaded.PendingNotice, pending });
    };
    const reload = () => {
      forgetViewer();
      void load();
    };
    void load();
    window.addEventListener(SESSION_CHANGED_EVENT, reload);
    // Las pendientes cambian sin cambiar la sesión: un récord en `review`, una verificación superada…
    window.addEventListener(VERIFICATION_CHANGED_EVENT, load);
    return () => {
      latest = -1;
      window.removeEventListener(SESSION_CHANGED_EVENT, reload);
      window.removeEventListener(VERIFICATION_CHANGED_EVENT, load);
    };
  }, []);

  // Hueco de tamaño fijo (24 px de alto, como la fila del logo en móvil): la cabecera no se mueve
  // cuando llega la sesión (CLS = 0). El aviso va debajo, fuera del flujo.
  return (
    <div className="relative flex w-7 justify-end sm:w-32">
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
      {notice && <notice.PendingNotice pending={notice.pending} />}
    </div>
  );
}
