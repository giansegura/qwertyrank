import "server-only";
import { createTranslator, hasLocale } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import type { EmailMessage } from "./mailer";

/** The email is in the language of the page it was requested from: the first segment of `callbackURL`. */
export function magicLinkLocale(url: string): Locale {
  const callback = new URL(url).searchParams.get("callbackURL") ?? "/";
  const segment = new URL(callback, "http://localhost").pathname.split("/")[1] ?? "";
  return hasLocale(routing.locales, segment) ? segment : routing.defaultLocale;
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export async function magicLinkEmail(to: string, url: string): Promise<EmailMessage> {
  const locale = magicLinkLocale(url);
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "Email" });
  const link = escapeHtml(url);
  return {
    to,
    subject: t("magicLinkSubject"),
    text: `${t("magicLinkIntro")}\n\n${url}\n\n${t("magicLinkIgnore")}`,
    html: [
      `<p>${escapeHtml(t("magicLinkIntro"))}</p>`,
      `<p><a href="${link}">${escapeHtml(t("magicLinkButton"))}</a></p>`,
      `<p>${escapeHtml(t("magicLinkIgnore"))}</p>`,
    ].join(""),
  };
}
