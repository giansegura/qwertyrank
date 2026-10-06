"use client";

import { useTranslations } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { loginPath } from "@/lib/auth-paths";
import { navigateTo } from "@/lib/navigate";

/** Añadir una passkey o borrar la cuenta exige una sesión de menos de un día: se vuelve a entrar y se regresa aquí. */
export function Reauth({ locale }: { locale: Locale }) {
  const t = useTranslations("Settings");

  async function signInAgain() {
    await authClient.signOut();
    navigateTo(loginPath(locale, getPathname({ locale, href: "/settings" })));
  }

  return (
    <div role="alert" data-testid="reauth" className="flex flex-col items-start gap-2 text-sm">
      <p className="font-medium">{t("reauthMessage")}</p>
      <button type="button" onClick={() => void signInAgain()} className="font-medium underline">
        {t("reauthButton")}
      </button>
    </div>
  );
}
