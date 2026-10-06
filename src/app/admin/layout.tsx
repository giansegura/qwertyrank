import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../globals.css";

export const dynamic = "force-dynamic";

/** Panel de moderación (spec 4a §5): layout raíz propio, fuera de `[locale]`, solo en español y sin indexar. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
