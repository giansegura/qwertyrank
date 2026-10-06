import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { moderationActions, users } from "../db/schema";

/** Da o quita el rol de admin por email (spec 4a §5.2), registrándolo sin admin: lo hace un script. */
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
