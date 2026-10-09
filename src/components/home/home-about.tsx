import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** What the test measures and how the ranking works (spec 5b §7): text for visitors coming from a search engine. */
export function HomeAbout() {
  const t = useTranslations("Home");
  return (
    <section
      data-testid="home-about"
      aria-labelledby="home-about-title"
      className="flex flex-col gap-3 text-zinc-700 dark:text-zinc-300"
    >
      <h2 id="home-about-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {t("aboutTitle")}
      </h2>
      <p>{t("about1")}</p>
      <p>{t("about2")}</p>
      <p>
        {t.rich("about3", {
          practice: (chunks) => (
            <Link href="/practice" className="font-medium underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <p>
        {t.rich("about4", {
          guides: (chunks) => (
            <Link href="/guides" className="font-medium underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </section>
  );
}
