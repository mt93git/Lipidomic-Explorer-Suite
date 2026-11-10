// Playwright setup and teardown share the coordinator process, even when another seed replaces the file.
// The run marker is the title the seed chose for this run's order (the pilot creates the order in New order); an
// older seed's file named the order by code instead, and is still honoured so its order can be archived.
import { existsSync, readFileSync } from "node:fs";

export const RUN_TITLE = /^Admin pilot simulation \d{4}-\d{2}-\d{2} \d{2}:\d{2} · run [0-9a-f]{8}$/;
export const RUN_CODE = /^ORD\d{3,}$/;

export default async function setup() {
  delete process.env.ADMIN_PILOT_RUN_ORDER_TITLE;
  delete process.env.ADMIN_PILOT_RUN_ORDER_CODE;
  if (process.env.ADMIN_E2E_PILOT !== "1") return;
  const file = process.env.ADMIN_PILOT_CREDENTIALS;
  if (!file || !existsSync(file)) return;
  const run = JSON.parse(readFileSync(file, "utf8"));
  if (RUN_TITLE.test(run.orderTitle ?? "")) process.env.ADMIN_PILOT_RUN_ORDER_TITLE = run.orderTitle;
  else if (RUN_CODE.test(run.orderCode ?? "")) process.env.ADMIN_PILOT_RUN_ORDER_CODE = run.orderCode;
}
