import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Blocks nothing (spec 5a §5, 5b §4): a search engine that cannot read a page does not see its `noindex` either,
 * and the panel and the API already send it in a header or have nothing to index. It only declares the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
