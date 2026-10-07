"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { hoursLeft, type PendingVerification } from "@/lib/verification";
import { useNow } from "../use-now";

/**
 * Aviso de récord pendiente (spec 4b §4.3), bajo el menú de usuario. Va fuera del flujo (`absolute`):
 * aparecer no mueve la cabecera ni la página (CLS = 0). Cuenta las horas de la que antes caduca.
 */
export function PendingNotice({ pending }: { pending: PendingVerification[] }) {
  const t = useTranslations("Verification");
  const now = useNow();
  if (now === null) return null;
  // La respuesta de `GET /api/verification` se valida aquí y no en la portada, donde cada byte cuenta: lo
  // que no traiga su plazo (p. ej. `null`) no cuenta, y nunca rompe la cabecera.
  const hours = Math.min(
    ...pending.flatMap((verification: PendingVerification | null) =>
      typeof verification?.expiresAt === "string" ? [hoursLeft(verification.expiresAt, now)] : [],
    ),
  );
  // Sin pendientes (`Infinity`) o con un plazo que no se entiende (`NaN`): sin aviso.
  if (!Number.isFinite(hours)) return null;
  return (
    <Link
      href="/verify"
      data-testid="verify-notice"
      className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-900 dark:text-amber-100"
    >
      {t("notice", { hours })}
    </Link>
  );
}
