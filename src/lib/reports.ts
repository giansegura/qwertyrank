/** Motivos de denuncia (spec 4a §4): los comparten el esquema, la API y el botón del perfil. */
export const REPORT_REASONS = ["cheating", "offensive_nick"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
