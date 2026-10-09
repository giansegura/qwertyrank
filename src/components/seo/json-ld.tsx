import { serializeJsonLd, type StructuredData } from "@/lib/seo/structured-data";

/** Structured data in the server HTML (spec 5b §5); adds no JavaScript to the client. */
export function JsonLd({ data }: { data: StructuredData }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
