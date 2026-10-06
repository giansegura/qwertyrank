import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt.json";

const MESSAGES = { en, es, pt };

export function withIntl(ui: ReactElement, locale: keyof typeof MESSAGES = "en") {
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      {ui}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(ui: ReactElement, locale: keyof typeof MESSAGES = "en") {
  return render(withIntl(ui, locale));
}
