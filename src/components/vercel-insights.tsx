/** Cola de Web Analytics y Speed Insights hasta que cargan sus scripts, como documenta Vercel. */
const QUEUE =
  "window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};" +
  "window.si=window.si||function(){(window.siq=window.siq||[]).push(arguments)};";

/**
 * Web Analytics y Speed Insights de Vercel (spec 5a §6.2) con sus scripts y sin JS propio en la portada: el
 * navegador los descarga aparte. Siguen solos las navegaciones del App Router (`pushState`). Solo en
 * producción: en local y en las vistas previas esas rutas no existen.
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
