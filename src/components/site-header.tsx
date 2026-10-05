import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4">
      <Link href="/" className="font-mono text-base font-semibold sm:text-lg">
        QwertyRank
      </Link>
      <div className="flex items-center gap-3 text-sm sm:gap-6">
        <Link href="/">{t("home")}</Link>
        <Link href="/practice">{t("practice")}</Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
