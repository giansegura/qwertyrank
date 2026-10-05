"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-1 sm:gap-2">
        {routing.locales.map((option) => (
          <li key={option}>
            <Link
              href={pathname}
              locale={option}
              aria-current={option === locale ? "true" : undefined}
              className="rounded px-1 py-0.5 font-mono sm:px-1.5 text-xs uppercase text-zinc-500 aria-[current]:bg-zinc-200 aria-[current]:text-zinc-900 dark:aria-[current]:bg-zinc-800 dark:aria-[current]:text-zinc-100"
            >
              {option}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
