import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FEEDBACK_EMAIL } from "@/lib/site";

const FEEDBACK = `mailto:${FEEDBACK_EMAIL}`;

/**
 * Pie de todas las páginas (spec 5a §4.4), en una línea: la marca de beta, cómo enviar comentarios y las
 * páginas legales. En la pantalla inicial queda abajo del todo, porque el `main` se estira.
 */
export function SiteFooter() {
  const t = useTranslations("Footer");
  const nav = useTranslations("Nav");

  return (
    <footer
      data-testid="site-footer"
      className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400"
    >
      <a
        href={FEEDBACK}
        aria-label={nav("betaLabel")}
        className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900 uppercase dark:bg-amber-900/40 dark:text-amber-200"
      >
        {t("beta")}
      </a>
      <span aria-hidden="true">·</span>
      <a href={FEEDBACK} className="hover:underline">
        {t("feedback")}
      </a>
      <span aria-hidden="true">·</span>
      <Link href="/privacy" className="hover:underline">
        {t("privacy")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/terms" className="hover:underline">
        {t("terms")}
      </Link>
    </footer>
  );
}
