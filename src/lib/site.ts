/**
 * Durante la beta (spec 5a §5) ninguna página se indexa: metadatos `robots` y cabecera `X-Robots-Tag`.
 * La fase 5 (SEO) lo pasa a `true`.
 */
export const INDEXABLE = false;

/** Responsable del tratamiento y su contacto (spec 5a §4.2). */
export const CONTROLLER = "Gianmarco Segura";
export const PRIVACY_EMAIL = "privacy@qwertyrank.com";
/** Comentarios de la beta (spec 5a §4.4): la etiqueta "beta" y el pie abren un correo a esta dirección. */
export const FEEDBACK_EMAIL = "feedback@qwertyrank.com";
