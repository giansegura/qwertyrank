import { serializeJsonLd, type StructuredData } from "@/lib/seo/structured-data";

/** Datos estructurados en el HTML del servidor (spec 5b §5); no añade JavaScript al cliente. */
export function JsonLd({ data }: { data: StructuredData }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
