const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export const formatDate = (date: Date) => `${DATE.format(date)} UTC`;

export const STATUS_LABEL: Record<string, string> = { active: "Active", shadowbanned: "Shadow ban", banned: "Banned" };
export const ACTION_LABEL: Record<string, string> = {
  shadowban: "Shadow ban",
  ban: "Ban",
  restore: "Restored",
  reset_nick: "Nick changed",
  grant_admin: "Admin granted",
  revoke_admin: "Admin revoked",
};
export const REASON_LABEL: Record<string, string> = { cheating: "Cheating", offensive_nick: "Offensive nick" };
export const REPORT_STATUS_LABEL: Record<string, string> = { open: "Open", dismissed: "Dismissed", actioned: "Actioned" };
export const RECORD_STATE_LABEL: Record<string, string> = {
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
  expired: "Expired",
};
export const MODE_LABEL: Record<string, string> = { ranked: "Ranked", verification: "Verification" };

export const TABLE = "w-full border-collapse text-left text-sm";
export const HEAD_ROW = "border-b border-zinc-300 dark:border-zinc-700";
export const ROW = "border-b border-zinc-200 dark:border-zinc-800";
export const CELL = "py-2 pr-4";
