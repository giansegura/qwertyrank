/** Spec §3.6: 3–20 caracteres `[a-zA-Z0-9_]`. Lo comparten el servidor y el proxy. */
export const NICK_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
