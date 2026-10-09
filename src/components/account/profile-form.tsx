"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { SESSION_CHANGED_EVENT } from "@/lib/viewer";
import { flagEmoji, type CountryCode, type CountryOption } from "@/lib/countries";
import { navigateTo } from "@/lib/navigate";

type SaveError = "errorNickTaken" | "errorNickInvalid" | "errorNickProfane" | "errorCountry" | "errorSave";

const SAVE_ERRORS: Record<string, SaveError> = {
  nick_taken: "errorNickTaken",
  invalid_nick: "errorNickInvalid",
  profane_nick: "errorNickProfane",
  invalid_country: "errorCountry",
};

type SaveState = { name: "idle" | "saving" | "saved" } | { name: "error"; message: SaveError };

async function saveProfile(nick: string, country: string): Promise<SaveError | null> {
  const response = await fetch("/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nick: nick.trim(), country: country || null }),
  }).catch(() => null);
  if (response?.ok) return null;
  const data = (await response?.json().catch(() => null)) as { error?: string } | null | undefined;
  return SAVE_ERRORS[data?.error ?? ""] ?? "errorSave";
}

export interface ProfileFormProps {
  /** Computed on the server with `countryOptions` (see there for why). */
  countries: readonly CountryOption[];
  initialNick: string;
  initialCountry: CountryCode | null;
  /** On the welcome page: where to go after saving. */
  continueTo: string | null;
}

const FIELD = "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-base font-normal dark:border-zinc-700";

export function ProfileForm({ countries, initialNick, initialCountry, continueTo }: ProfileFormProps) {
  const t = useTranslations("Settings");
  const [nick, setNick] = useState(initialNick);
  const [country, setCountry] = useState<string>(initialCountry ?? "");
  const [state, setState] = useState<SaveState>({ name: "idle" });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ name: "saving" });
    const error = await saveProfile(nick, country);
    if (error) {
      setState({ name: "error", message: error });
      return;
    }
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
    if (continueTo) navigateTo(continueTo);
    else setState({ name: "saved" });
  }

  return (
    <form onSubmit={save} data-testid="profile-form" className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("nickLabel")}
        <input
          data-testid="profile-nick"
          value={nick}
          onChange={(event) => setNick(event.target.value)}
          maxLength={20}
          autoComplete="nickname"
          spellCheck={false}
          className={`${FIELD} font-mono`}
        />
        <span className="font-normal text-zinc-500 dark:text-zinc-400">{t("nickHelp")}</span>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("countryLabel")}
        <select
          data-testid="profile-country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          className={FIELD}
        >
          <option value="">{t("noCountry")}</option>
          {countries.map(({ code, name }) => (
            <option key={code} value={code}>
              {`${flagEmoji(code)} ${name}`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        data-testid="profile-save"
        disabled={state.name === "saving"}
        className="self-start rounded-md bg-amber-500 px-4 py-2 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
      >
        {continueTo ? t("saveAndContinue") : t("save")}
      </button>
      {state.name === "saved" && (
        <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {t("saved")}
        </p>
      )}
      {state.name === "error" && (
        <p role="alert" data-testid="profile-error" className="text-sm font-medium text-red-700 dark:text-red-400">
          {t(state.message)}
        </p>
      )}
    </form>
  );
}
