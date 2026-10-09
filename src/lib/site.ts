/** Production domain: base of the canonical, `hreflang`, Open Graph and sitemap URLs (spec 5b §2). */
export const SITE_URL = "https://qwertyrank.com";
export const SITE_NAME = "QwertyRank";

/**
 * During the beta (spec 5a §5) no page is indexed: `robots` metadata and `X-Robots-Tag` header.
 * Phase 5 (SEO) switches it to `true`.
 */
export const INDEXABLE = false;

/** Data controller and their contact (spec 5a §4.2). */
export const CONTROLLER = "Gianmarco Segura";
export const PRIVACY_EMAIL = "privacy@qwertyrank.com";
/** Beta feedback (spec 5a §4.4): the "beta" badge and the footer open an email to this address. */
export const FEEDBACK_EMAIL = "feedback@qwertyrank.com";
