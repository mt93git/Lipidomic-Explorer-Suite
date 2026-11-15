import type { CheckResult } from "@lipidomic/admin-ingest";
export function canAcceptResults(checks: CheckResult[], reason: string) {
  return !checks.some(check => check.status === "stop") || reason.trim().length > 0;
}
