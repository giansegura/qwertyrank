import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { moderationActions, users } from "../db/schema";

/** Grants or revokes the admin role by email (spec 4a §5.2), logging it without an admin: a script does it. */
export async function setAdminRole(db: Db, email: string, role: "admin" | "user"): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .update(users)
      .set({ role })
      .where(sql`lower(${users.email}) = lower(${email.trim()})`)
      .returning({ id: users.id });
    if (!user) return false;
    await tx.insert(moderationActions).values({
      adminId: null,
      targetUserId: user.id,
      action: role === "admin" ? "grant_admin" : "revoke_admin",
      reason: "script",
    });
    return true;
  });
}
