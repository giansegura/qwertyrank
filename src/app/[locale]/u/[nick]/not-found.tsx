import { useTranslations } from "next-intl";
import { OwnProfileFallback } from "@/components/profile/own-profile-fallback";
import { Link } from "@/i18n/navigation";

/** Nonexistent or non-public profile. If it is the sanctioned player's own, it is shown to them (spec 4a §6.2). */
export default function ProfileNotFound() {
  const t = useTranslations("Profile");
  return (
    <OwnProfileFallback>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("notFoundText")}</p>
        <Link href="/" className="self-start font-medium underline">
          {t("notFoundHome")}
        </Link>
      </div>
    </OwnProfileFallback>
  );
}
