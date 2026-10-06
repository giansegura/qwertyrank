import "server-only";
import { disposableEmailBlocklistSet } from "disposable-email-domains-js";

// La librería reconstruye el Set en cada llamada a sus helpers: se crea una sola vez.
const BLOCKED: ReadonlySet<string> = disposableEmailBlocklistSet();

/** Emails desechables (spec §3.6), también en subdominios: `x@inbox.mailinator.com`. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  let domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  while (domain.includes(".")) {
    if (BLOCKED.has(domain)) return true;
    domain = domain.slice(domain.indexOf(".") + 1);
  }
  return false;
}
