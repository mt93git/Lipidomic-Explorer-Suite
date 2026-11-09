// Playwright setup and teardown share the coordinator process, even when another seed replaces the file.
import { existsSync, readFileSync } from "node:fs";

export default async function setup() {
  delete process.env.ADMIN_PILOT_RUN_ORDER_CODE;
  if (process.env.ADMIN_E2E_PILOT !== "1") return;
  const file = process.env.ADMIN_PILOT_CREDENTIALS;
  if (!file || !existsSync(file)) return;
  const run = JSON.parse(readFileSync(file, "utf8"));
  if (/^ORD\d{3,}$/.test(run.orderCode ?? "")) process.env.ADMIN_PILOT_RUN_ORDER_CODE = run.orderCode;
}
