import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/** At the end of every guide (spec 5c §4): from reading to typing. */
export function GuideCta() {
  const t = useTranslations("Guides");
  return (
    <section
      data-testid="guide-cta"
      aria-labelledby="guide-cta-title"
      className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <h2 id="guide-cta-title" className="font-semibold">
        {t("ctaTitle")}
      </h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400">
          {t("ctaTest")}
        </Link>
        <Link href="/practice" className="text-sm underline">
          {t("ctaPractice")}
        </Link>
      </div>
    </section>
  );
}
