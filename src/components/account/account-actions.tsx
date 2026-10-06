"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { navigateTo } from "@/lib/navigate";
import { Reauth } from "./reauth";

type DeleteStep = "idle" | "confirm" | "deleting" | "error" | "reauth";

export function AccountActions({ locale }: { locale: Locale }) {
  const t = useTranslations("Settings");
  const [step, setStep] = useState<DeleteStep>("idle");

  async function signOut() {
    await authClient.signOut();
    navigateTo(`/${locale}`);
  }

  async function deleteAccount() {
    setStep("deleting");
    const { error } = await authClient.deleteUser({});
    if (!error) navigateTo(`/${locale}`);
    else setStep(error.code === "SESSION_EXPIRED" ? "reauth" : "error");
  }

  return (
    <section aria-labelledby="account-title" className="flex max-w-xl flex-col items-start gap-3">
      <h2 id="account-title" className="text-lg font-semibold">
        {t("accountTitle")}
      </h2>
      <button
        type="button"
        data-testid="sign-out"
        onClick={() => void signOut()}
        className="rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {t("signOut")}
      </button>
      {step === "reauth" ? (
        <Reauth locale={locale} />
      ) : step === "confirm" || step === "deleting" ? (
        <div className="flex flex-col gap-3 rounded-md border border-red-300 p-3 dark:border-red-900">
          <p className="text-sm">{t("deleteWarning")}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              data-testid="delete-confirm"
              disabled={step === "deleting"}
              onClick={() => void deleteAccount()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
            >
              {t("deleteConfirm")}
            </button>
            <button type="button" onClick={() => setStep("idle")} className="text-sm underline">
              {t("deleteCancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="delete-account"
          onClick={() => setStep("confirm")}
          className="text-sm font-medium text-red-700 underline dark:text-red-400"
        >
          {t("deleteAccount")}
        </button>
      )}
      {step === "error" && (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {t("errorDelete")}
        </p>
      )}
    </section>
  );
}
