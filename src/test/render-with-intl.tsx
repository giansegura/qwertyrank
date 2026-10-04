import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import messages from "../../messages/en.json";

export function withIntl(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

export function renderWithIntl(ui: ReactElement) {
  return render(withIntl(ui));
}
