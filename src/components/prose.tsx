import type { ReactNode } from "react";

const PROSE =
  "flex max-w-2xl flex-col gap-3 text-zinc-700 dark:text-zinc-300 [&_a]:underline [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-zinc-950 dark:[&_h1]:text-zinc-50 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-950 dark:[&_h2]:text-zinc-50 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-zinc-950 dark:[&_h3]:text-zinc-50 [&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1 [&_ol]:pl-5 [&_strong]:font-semibold [&_strong]:text-zinc-950 dark:[&_strong]:text-zinc-50 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5";

/**
 * Long reading text (legal pages, guides): styles for the plain HTML that JSX or MDX renders, no client JS.
 * `className` sets the size and line height (by default, body text with a roomy line height).
 */
export function Prose({
  children,
  as: Tag = "article",
  className = "leading-7",
  testId,
}: {
  children: ReactNode;
  /** `div` when the page wraps the text in its own `article` with the heading (a guide). */
  as?: "article" | "div";
  className?: string;
  testId?: string;
}) {
  return (
    <Tag data-testid={testId} className={`${PROSE} ${className}`}>
      {children}
    </Tag>
  );
}
