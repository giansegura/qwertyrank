/** Spec §3.6: 3–20 characters `[a-zA-Z0-9_]`. Shared by the server and the proxy. */
export const NICK_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;
