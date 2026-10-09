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

/** The pending-record notice, already downloaded, with the pending ones it shows. */
interface Notice {
  PendingNotice: typeof import("./verification/pending-notice").PendingNotice;
  pending: PendingVerification[];
}

export function UserMenu() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [viewer, setViewer] = useState<Viewer | undefined>(undefined);
  // Records pending verification (spec 4b §4.3): the notice is downloaded only if there are any.
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    // Each load has a number and only the latest counts: a response that arrives late does not overwrite the
    // next one. On unmount, none.
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
    // The pending ones change without the session changing: a record in `review`, a verification passed…
    window.addEventListener(VERIFICATION_CHANGED_EVENT, load);
    return () => {
      latest = -1;
      window.removeEventListener(SESSION_CHANGED_EVENT, reload);
      window.removeEventListener(VERIFICATION_CHANGED_EVENT, load);
    };
  }, []);

  // Fixed-size slot (24 px tall, like the logo row on mobile): the header does not move
  // when the session arrives (CLS = 0). The notice goes below, out of the flow.
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
