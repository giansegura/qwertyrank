"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/server/moderation/admin";
import { getSanctions } from "@/server/moderation/instance";

const playerId = z.uuid();
const reason = z.string().trim().min(1).max(500);
const statusInput = z.object({ playerId, reason, status: z.enum(["active", "shadowbanned", "banned"]) });
const nickInput = z.object({ playerId, reason });
const dismissInput = z.object({ playerId });

/** Solo los campos de texto del formulario (Next añade los suyos; Zod los ignora). */
const fields = (formData: FormData) =>
  Object.fromEntries([...formData.entries()].filter(([, value]) => typeof value === "string"));

const playerPath = (id: FormDataEntryValue | null) =>
  `/admin/players/${typeof id === "string" ? encodeURIComponent(id) : ""}`;

/** Shadow-ban, ban o restaurar desde la ficha (spec 4a §5). Cada acción vuelve a comprobar el rol. */
export async function setStatusAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const input = statusInput.safeParse(fields(formData));
  if (!input.success) redirect(`${playerPath(formData.get("playerId"))}?error=invalid`);
  const { playerId: id, status, reason: why } = input.data;
  const outcome = await getSanctions().setStatus(admin.id, id, status, why);
  redirect(`/admin/players/${id}?${outcome.kind === "ok" ? `done=${status}` : `error=${outcome.why}`}`);
}

export async function resetNickAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const input = nickInput.safeParse(fields(formData));
  if (!input.success) redirect(`${playerPath(formData.get("playerId"))}?error=invalid`);
  const outcome = await getSanctions().resetNick(admin.id, input.data.playerId, input.data.reason);
  redirect(`/admin/players/${input.data.playerId}?${outcome.kind === "ok" ? "done=nick" : `error=${outcome.why}`}`);
}

export async function dismissReportsAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const input = dismissInput.safeParse(fields(formData));
  if (!input.success) redirect(`${playerPath(formData.get("playerId"))}?error=invalid`);
  await getSanctions().dismissReports(admin.id, input.data.playerId);
  redirect(`/admin/players/${input.data.playerId}?done=dismissed`);
}
