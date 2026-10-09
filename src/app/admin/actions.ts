"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/moderation/admin";
import { getSanctions } from "@/server/moderation/instance";
import { dismissInput, nickInput, statusInput } from "./schemas";

/** Only the form's text fields (Next adds its own; Zod ignores them). */
const fields = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string"));

const playerPath = (id: FormDataEntryValue | null) =>
  `/admin/players/${typeof id === "string" ? encodeURIComponent(id) : ""}`;

/** Shadow ban, ban or restore from the player page (spec 4a §5). Each action checks the role again. */
export async function setStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const input = statusInput.safeParse(fields(formData));
  if (!input.success) redirect(`${playerPath(formData.get("playerId"))}?error=invalid`);
  const { playerId: id, status, reason: why } = input.data;
  const outcome = await getSanctions().setStatus(admin.id, id, status, why);
  const query =
    outcome.kind === "ok" ? `done=${status}` : outcome.kind === "redis_failed" ? "error=redis" : `error=${outcome.why}`;
  redirect(`/admin/players/${id}?${query}`);
}

export async function resetNickAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const input = nickInput.safeParse(fields(formData));
  if (!input.success) redirect(`${playerPath(formData.get("playerId"))}?error=invalid`);
  const outcome = await getSanctions().resetNick(admin.id, input.data.playerId, input.data.reason);
  // `resetNick` does not touch Redis: it never returns `redis_failed`.
  const query = outcome.kind === "rejected" ? `error=${outcome.why}` : "done=nick";
  redirect(`/admin/players/${input.data.playerId}?${query}`);
}

export async function dismissReportsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const input = dismissInput.safeParse(fields(formData));
  if (!input.success) redirect(`${playerPath(formData.get("playerId"))}?error=invalid`);
  await getSanctions().dismissReports(admin.id, input.data.playerId);
  redirect(`/admin/players/${input.data.playerId}?done=dismissed`);
}
