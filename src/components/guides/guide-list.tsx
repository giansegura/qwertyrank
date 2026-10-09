import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GUIDE_IDS, type GuideId, guideHref } from "@/lib/guides";

/** The guides with their description (spec 5c §4): all of them on the index, the others under a guide. */
export function GuideList({ exclude }: { exclude?: GuideId }) {
  const t = useTranslations("Guides");
  return (
    <ul className="flex flex-col gap-4">
      {GUIDE_IDS.filter((id) => id !== exclude).map((id) => (
        <li key={id} className="flex flex-col gap-1">
          <Link href={guideHref(id)} className="font-medium underline">
            {t(`${id}.title`)}
          </Link>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(`${id}.description`)}</p>
        </li>
      ))}
    </ul>
  );
}
