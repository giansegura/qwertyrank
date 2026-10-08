import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * No bloquea nada (spec 5a §5, 5b §4): un buscador que no puede leer una página tampoco ve su `noindex`, y el
 * panel y la API ya lo mandan en cabecera o no tienen nada que indexar. Solo declara el sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
