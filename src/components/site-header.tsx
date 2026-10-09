import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FEEDBACK_EMAIL } from "@/lib/site";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";

export function SiteHeader() {
  const t = useTranslations("Nav");

  return (
    <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="font-mono text-base font-semibold sm:text-lg">
          QwertyRank
        </Link>
        {/* Desktop only: at 360 px it does not fit on the header line. On mobile the beta shows in the footer (spec 5a §4.4). */}
        <a
          href={`mailto:${FEEDBACK_EMAIL}`}
          aria-label={t("betaLabel")}
          data-testid="beta-badge"
          className="hidden rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900 uppercase sm:inline dark:bg-amber-900/40 dark:text-amber-200"
        >
          {t("beta")}
        </a>
      </div>
      <div className="flex items-center gap-3 text-sm sm:gap-6">
        {/* On mobile the logo already goes to Ranked: without this link, the header with the account menu fits in 360 px. */}
        <Link href="/" className="hidden sm:inline">
          {t("home")}
        </Link>
        <Link href="/practice">{t("practice")}</Link>
        <Link href="/leaderboard">{t("leaderboard")}</Link>
        <LocaleSwitcher />
        <UserMenu />
      </div>
    </header>
  );
}
