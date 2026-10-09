import type { ReactNode } from "react";
import { Prose } from "@/components/prose";

/** Wrapper for the legal pages (spec 5a §4.1): reading text, no client JS. */
export function LegalArticle({ children }: { children: ReactNode }) {
  return (
    <Prose testId="legal-article" className="text-sm leading-6">
      {children}
    </Prose>
  );
}
