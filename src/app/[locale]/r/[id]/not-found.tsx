import { useTranslations } from "next-intl";
import { OwnResultFallback } from "@/components/result/own-result-fallback";
import { Link } from "@/i18n/navigation";

/** Nonexistent or non-public result. If it is the sanctioned player's own game, it is shown to them (spec 5d §5). */
export default function ResultNotFound() {
  const t = useTranslations("Share");
  return (
    <OwnResultFallback>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("notFoundText")}</p>
        <Link href="/" className="self-start font-medium underline">
          {t("notFoundHome")}
        </Link>
      </div>
    </OwnResultFallback>
  );
}
