"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { loginHref } from "@/lib/auth-paths";
import { REPORT_REASONS, type ReportReason } from "@/lib/reports";
import { getViewer, type Viewer } from "@/lib/viewer";

type State = "idle" | "choosing" | "sending" | "sent" | "failed";

/** Report a player from their profile (spec 4a §4.1). Not shown on the player's own profile. */
export function ReportButton({ nick }: { nick: string }) {
  const t = useTranslations("Profile");
  const pathname = usePathname();
  // `undefined`: who is viewing is not known yet.
  const [viewer, setViewer] = useState<Viewer | undefined>(undefined);
  const [state, setState] = useState<State>("idle");
  const [reason, setReason] = useState<ReportReason>("cheating");

  useEffect(() => {
    let active = true;
    void getViewer().then((value) => {
      if (active) setViewer(value);
    });
    return () => {
      active = false;
    };
  }, []);

  async function send() {
    setState("sending");
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nick, reason }),
    }).catch(() => null);
    setState(response?.ok ? "sent" : "failed");
  }

  const linkClass = "self-start text-sm text-zinc-500 underline dark:text-zinc-400";
  if (viewer === undefined || viewer?.nick.toLowerCase() === nick.toLowerCase()) return null;
  if (viewer === null) {
    return (
      <Link data-testid="report-sign-in" href={loginHref(pathname)} className={linkClass}>
        {t("report")}
      </Link>
    );
  }
  if (state === "sent") {
    return (
      <p role="status" data-testid="report-sent" className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("reportSent")}
      </p>
    );
  }
  if (state === "idle") {
    return (
      <button type="button" data-testid="report-open" onClick={() => setState("choosing")} className={linkClass}>
        {t("report")}
      </button>
    );
  }

  return (
    <form
      data-testid="report-form"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="mt-2 flex max-w-sm flex-col gap-3 rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">{t("reportTitle", { nick })}</legend>
        {REPORT_REASONS.map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
            {t("reportReason", { reason: value })}
          </label>
        ))}
      </fieldset>
      {state === "failed" && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {t("reportFailed")}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          data-testid="report-send"
          disabled={state === "sending"}
          className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {t("reportSend")}
        </button>
        <button type="button" onClick={() => setState("idle")} className="underline">
          {t("reportCancel")}
        </button>
      </div>
    </form>
  );
}
