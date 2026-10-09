"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { Reauth } from "./reauth";

type AddStatus = "idle" | "added" | "error" | "reauth";

export function PasskeyList({ locale }: { locale: Locale }) {
  const t = useTranslations("Settings");
  const format = useFormatter();
  const { data: passkeys } = authClient.useListPasskeys();
  const [status, setStatus] = useState<AddStatus>("idle");

  async function add() {
    setStatus("idle");
    const { error } = await authClient.passkey.addPasskey();
    if (!error) {
      setStatus("added");
      return;
    }
    const code = "code" in error ? error.code : undefined;
    if (code === "SESSION_NOT_FRESH" || error.status === 403) setStatus("reauth");
    // Closing the browser dialog is not an error worth showing.
    else if (code !== "ERROR_CEREMONY_ABORTED") setStatus("error");
  }

  return (
    <section aria-labelledby="passkeys-title" className="flex max-w-xl flex-col gap-3">
      <h2 id="passkeys-title" className="text-lg font-semibold">
        {t("passkeysTitle")}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t("passkeysIntro")}</p>
      {passkeys && passkeys.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {passkeys.map((key) => (
            <li
              key={key.id}
              data-testid="passkey-item"
              className="flex items-center justify-between gap-4 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <span>
                {key.name ?? t("passkeyUnnamed")}
                {key.createdAt && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {" · "}
                    {t("passkeyCreated", { date: format.dateTime(new Date(key.createdAt), { dateStyle: "medium" }) })}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void authClient.passkey.deletePasskey({ id: key.id })}
                className="text-sm underline"
              >
                {t("passkeyDelete")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">{t("noPasskeys")}</p>
      )}
      <button
        type="button"
        data-testid="passkey-add"
        onClick={() => void add()}
        className="self-start rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {t("passkeyAdd")}
      </button>
      {status === "added" && (
        <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t("passkeyAdded")}
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {t("errorPasskeyAdd")}
        </p>
      )}
      {status === "reauth" && <Reauth locale={locale} />}
    </section>
  );
}
