import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSessionUser } from "../auth/session";
import { getDb } from "../db/client";
import { isAdmin } from "./queries";

/**
 * Called by every page and Server Action of the panel (spec 4a §5): a layout is not enough, because it
 * does not run again on every navigation. Without the admin role, 404: the panel does not exist.
 */
export async function requireAdmin(): Promise<{ id: string }> {
  const user = await getSessionUser(await headers());
  if (!user || !(await isAdmin(getDb(), user.id))) notFound();
  return { id: user.id };
}
