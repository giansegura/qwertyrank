import "server-only";
import { disposableEmailBlocklistSet } from "disposable-email-domains-js";

// The library rebuilds the Set on every call to its helpers: create it only once.
const BLOCKED: ReadonlySet<string> = disposableEmailBlocklistSet();

/** Disposable emails (spec §3.6), also in subdomains: `x@inbox.mailinator.com`. */
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
