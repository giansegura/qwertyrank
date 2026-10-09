import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { GuideCta } from "@/components/guides/guide-cta";
import { GuideList } from "@/components/guides/guide-list";
import { Prose } from "@/components/prose";
import { JsonLd } from "@/components/seo/json-ld";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { GUIDE_IDS, guideHref, parseGuideId } from "@/lib/guides";
import { pageMetadata } from "@/lib/seo/metadata";
import { articleStructuredData, breadcrumbStructuredData } from "@/lib/seo/structured-data";

/** Every guide in every locale is built ahead of time; anything else is a 404. */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) => GUIDE_IDS.map((slug) => ({ locale, slug })));
}

export const dynamicParams = false;

interface GuidePageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const id = parseGuideId(slug);
  if (!hasLocale(routing.locales, locale) || !id) return {};
  const t = await getTranslations({ locale, namespace: "Guides" });
  return pageMetadata({
    locale,
    href: guideHref(id),
    title: t(`${id}.title`),
    description: t(`${id}.description`),
    ogType: "article",
  });
}

/** A guide (spec 5c §4). The param is always the internal id: /es/guias/ppm-y-cpm arrives as wpm-vs-cpm. */
export default async function GuidePage({ params }: GuidePageProps) {
  const { locale, slug } = await params;
  const id = parseGuideId(slug);
  if (!hasLocale(routing.locales, locale) || !id) notFound();

  const t = await getTranslations("Guides");
  const { default: Body } = await import(`@content/${locale}/${id}.mdx`);
  const title = t(`${id}.title`);
  const href = guideHref(id);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <article className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Link href="/guides" className="self-start text-sm text-zinc-600 underline dark:text-zinc-400">
            {t("back")}
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        <Prose as="div" testId="guide-body">
          <Body />
        </Prose>
      </article>
      <GuideCta />
      <section aria-labelledby="more-guides-title" className="flex flex-col gap-3">
        <h2 id="more-guides-title" className="text-lg font-semibold">
          {t("more")}
        </h2>
        <GuideList exclude={id} />
      </section>
      <JsonLd data={articleStructuredData({ locale, href, title, description: t(`${id}.description`) })} />
      <JsonLd data={breadcrumbStructuredData(locale, href, title, { href: "/guides", name: t("indexTitle") })} />
    </div>
  );
}
