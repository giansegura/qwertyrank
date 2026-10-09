import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";

export const dynamic = "force-dynamic";

/** Moderation panel (spec 4a §5): its own root layout, outside `[locale]`, only in English and not indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
