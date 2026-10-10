import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * A shared game whose player now has to verify it (`isPendingResult`): neither its score nor its nick, which
 * would publish an unverified record, and a way into the test.
 */
export function PendingResult() {
  const t = useTranslations("Share");
  return (
    <div data-testid="pending-result" className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{t("pendingTitle")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("pendingText")}</p>
      <Link href="/" className="self-start font-medium underline">
        {t("takeTest")}
      </Link>
    </div>
  );
}
