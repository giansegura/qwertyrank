"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { hoursLeft, type PendingVerification } from "@/lib/verification";
import { useNow } from "../use-now";

/**
 * Pending-record notice (spec 4b §4.3), under the user menu. It sits out of the flow (`absolute`):
 * appearing does not move the header or the page (CLS = 0). Counts the hours of the one expiring first.
 */
export function PendingNotice({ pending }: { pending: PendingVerification[] }) {
  const t = useTranslations("Verification");
  const now = useNow();
  if (now === null) return null;
  // The `GET /api/verification` response is validated here and not on the home page, where every byte counts:
  // anything without its deadline (e.g. `null`) does not count, and never breaks the header.
  const hours = Math.min(
    ...pending.flatMap((verification: PendingVerification | null) =>
      typeof verification?.expiresAt === "string" ? [hoursLeft(verification.expiresAt, now)] : [],
    ),
  );
  // No pending ones (`Infinity`) or a deadline that makes no sense (`NaN`): no notice.
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
