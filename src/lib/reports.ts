/** Report reasons (spec 4a §4): shared by the schema, the API and the profile button. */
export const REPORT_REASONS = ["cheating", "offensive_nick"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
