"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import type { Locale } from "@/i18n/routing";
import { authClient } from "@/lib/auth-client";
import { loginPath, welcomePath } from "@/lib/auth-paths";
import { navigateTo } from "@/lib/navigate";

type LoginMessage = "errorDisposable" | "errorThrottled" | "errorFailed" | "errorLinkInvalid" | "errorPasskey";

type FormState =
  | { name: "idle" }
  | { name: "sending" }
  | { name: "sent"; email: string }
  | { name: "error"; message: LoginMessage };

const EMAIL_ERRORS: Record<string, LoginMessage> = {
  DISPOSABLE_EMAIL: "errorDisposable",
  EMAIL_THROTTLED: "errorThrottled",
};

/** Error con el que Better Auth vuelve a esta página (`?error=…`) tras un enlace caducado o ya usado. */
export function messageForCallbackError(code: string | null): LoginMessage | null {
  if (!code) return null;
  return code === "INVALID_TOKEN" || code === "EXPIRED_TOKEN" ? "errorLinkInvalid" : "errorFailed";
}

export interface LoginFormProps {
  locale: Locale;
  next: string;
  googleEnabled: boolean;
  callbackError: string | null;
}

const BUTTON = "rounded-md border border-zinc-300 px-4 py-2 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900";

export function LoginForm({ locale, next, googleEnabled, callbackError }: LoginFormProps) {
  const t = useTranslations("Login");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>(() => {
    const message = messageForCallbackError(callbackError);
    return message ? { name: "error", message } : { name: "idle" };
  });
  const returnUrls = {
    callbackURL: next,
    newUserCallbackURL: welcomePath(locale, next),
    errorCallbackURL: loginPath(locale, next),
  };

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ name: "sending" });
    const { error } = await authClient.signIn.magicLink({ email, ...returnUrls });
    if (error) setState({ name: "error", message: EMAIL_ERRORS[error.code ?? ""] ?? "errorFailed" });
    else setState({ name: "sent", email });
  }

  async function signInWithPasskey() {
    const { error } = await authClient.signIn.passkey();
    if (error) setState({ name: "error", message: "errorPasskey" });
    else navigateTo(next);
  }

  if (state.name === "sent") {
    return (
      <div data-testid="login-sent" role="status" className="flex max-w-sm flex-col gap-2">
        <p className="font-medium">{t("sentTitle")}</p>
        <p className="text-zinc-600 dark:text-zinc-400">{t("sentBody", { email: state.email })}</p>
      </div>
    );
  }

  return (
    <div className="flex max-w-sm flex-col gap-6">
      <form onSubmit={sendLink} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("emailLabel")}
          <input
            type="email"
            required
            autoComplete="email"
            data-testid="login-email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base font-normal dark:border-zinc-700"
          />
        </label>
        <button
          type="submit"
          data-testid="login-send"
          disabled={state.name === "sending"}
          className="rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {t("sendLink")}
        </button>
      </form>
      {state.name === "error" && (
        <p role="alert" data-testid="login-error" className="text-sm font-medium text-red-700 dark:text-red-400">
          {t(state.message)}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {googleEnabled && (
          <button
            type="button"
            data-testid="login-google"
            onClick={() => void authClient.signIn.social({ provider: "google", ...returnUrls })}
            className={BUTTON}
          >
            {t("google")}
          </button>
        )}
        <button type="button" data-testid="login-passkey" onClick={() => void signInWithPasskey()} className={BUTTON}>
          {t("passkey")}
        </button>
      </div>
    </div>
  );
}
