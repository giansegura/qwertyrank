import type { ReactNode } from "react";

/** Envoltura de las páginas legales (spec 5a §4.1): texto de lectura, sin JS de cliente. */
export function LegalArticle({ children }: { children: ReactNode }) {
  return (
    <article
      data-testid="legal-article"
      className="flex max-w-2xl flex-col gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300 [&_a]:underline [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-zinc-950 dark:[&_h1]:text-zinc-50 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-950 dark:[&_h2]:text-zinc-50 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5"
    >
      {children}
    </article>
  );
}
