import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4">
      <Link href="/" className="font-mono text-lg font-semibold">
        QwertyRank
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link href="/">{t("home")}</Link>
        <Link href="/practice">{t("practice")}</Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
