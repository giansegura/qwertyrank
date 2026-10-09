/** Web Analytics and Speed Insights queue until their scripts load, as documented by Vercel. */
const QUEUE =
  "window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};" +
  "window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments)};";

/**
 * Vercel Web Analytics and Speed Insights (spec 5a §6.2) with their scripts and no own JS on the home page: the
 * browser downloads them separately. They track App Router navigations (`pushState`) on their own. Only in
 * production: locally and in preview deployments those routes do not exist.
 */
export function VercelInsights({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: QUEUE }} />
      <script defer src="/_vercel/insights/script.js" />
      <script defer src="/_vercel/speed-insights/script.js" />
    </>
  );
}
