const DATE = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export const formatDate = (date: Date) => `${DATE.format(date)} UTC`;

export const STATUS_LABEL: Record<string, string> = { active: "Activo", shadowbanned: "Shadow-ban", banned: "Baneado" };
export const ACTION_LABEL: Record<string, string> = {
  shadowban: "Shadow-ban",
  ban: "Ban",
  restore: "Restaurado",
  reset_nick: "Nick cambiado",
  grant_admin: "Admin concedido",
  revoke_admin: "Admin retirado",
};
export const REASON_LABEL: Record<string, string> = { cheating: "Trampas", offensive_nick: "Nick ofensivo" };
export const REPORT_STATUS_LABEL: Record<string, string> = { open: "Abierta", dismissed: "Descartada", actioned: "Resuelta" };
export const RECORD_STATE_LABEL: Record<string, string> = {
  pending: "Pendiente",
  verified: "Verificado",
  failed: "Fallido",
  expired: "Caducado",
};

export const TABLE = "w-full border-collapse text-left text-sm";
export const HEAD_ROW = "border-b border-zinc-300 dark:border-zinc-700";
export const ROW = "border-b border-zinc-200 dark:border-zinc-800";
export const CELL = "py-2 pr-4";
