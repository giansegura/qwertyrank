"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { hoursLeft, type PendingVerification } from "@/lib/verification";
import { useNow } from "../use-now";
import { useVerificationModule } from "./use-verification-module";

/**
 * `/verify` (spec 4b §4.3): las verificaciones pendientes del jugador y, al elegir una, su partida de
 * verificación, con el mismo módulo que "Verificar ahora".
 */
export function VerifyList({ pending }: { pending: PendingVerification[] }) {
  const t = useTranslations("Verification");
  const tp = useTranslations("Profile");
  const router = useRouter();
  const now = useNow();
  const verification = useVerificationModule();

  // Al acabar, «Jugar Ranked» lleva a la portada: tras verificarla, si ya no estaba disponible (409, spec 4b
  // §4.2) o si no quedan otras. Con otras pendientes, sin superarla, «Volver a tus récords» vuelve a la
  // lista, pedida otra vez al servidor: puede haber cambiado (sin intentos, caducada).
  const verifying = verification.view(
    (play) => {
      if (play) return router.push("/");
      verification.close();
      router.refresh();
    },
    pending.length > 1 ? t("backToRecords") : undefined,
  );
  if (verifying) return verifying;

  if (pending.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-zinc-600 dark:text-zinc-400">{t("empty")}</p>
        <Link href="/" className="self-start font-medium underline">
          {t("play")}
        </Link>
      </div>
    );
  }

  return (
    <ul data-testid="verify-list" className="flex flex-col">
      {pending.map((item) => (
        <li
          key={item.id}
          data-testid="verify-item"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-zinc-200 py-3 dark:border-zinc-800"
        >
          <div className="flex flex-col">
            <span className="font-medium">{tp("board", { language: item.language, input: item.inputType })}</span>
            <span className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
              {t("item", { target: item.targetWpm, required: item.requiredWpm, attempts: item.attemptsLeft })}
              {now !== null && ` · ${t("hoursLeft", { hours: hoursLeft(item.expiresAt, now) })}`}
            </span>
          </div>
          <button
            type="button"
            data-testid="verify-start"
            onClick={() => verification.verify(item)}
            className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400"
          >
            {t("verify")}
          </button>
        </li>
      ))}
    </ul>
  );
}
