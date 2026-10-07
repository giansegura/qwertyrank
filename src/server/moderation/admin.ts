import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getSessionUser } from "../auth/session";
import { getDb } from "../db/client";
import { isAdmin } from "./queries";

/**
 * La llaman todas las páginas y Server Actions del panel (spec 4a §5): un layout no basta, porque no
 * se vuelve a ejecutar en cada navegación. Sin rol de admin, 404: el panel no existe.
 */
export async function requireAdmin(): Promise<{ id: string }> {
  const user = await getSessionUser(await headers());
  if (!user || !(await isAdmin(getDb(), user.id))) notFound();
  return { id: user.id };
}
