"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { mayEditNotificationRules, setMyNotification, setNotificationRule } from "@/lib/data/notifications";
import { isNotificationKind, kindsFor, normalizeRule } from "@/lib/notifications";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type SwitchState = { error?: string };

// Turns one of the signed-in person's own email notifications on or off (admin.set_my_notification_pref, any signed-in
// user, for themselves only). Only the kinds of the person's view are offered.
export async function setNotificationAction(_previous: SwitchState, form: FormData): Promise<SwitchState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  const kind = String(form.get("kind") ?? "");
  if (!isNotificationKind(kind) || !kindsFor(session.view).includes(kind)) return { error: "That notification is not one of yours." };
  const enabled = form.get("enabled") === "true";
  try {
    await setMyNotification(session, kind, enabled);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(`/notifications?saved=${kind}-${enabled ? "on" : "off"}`);
}

export type RuleState = { error?: string };

// One whole row of the event x audience matrix (admin.set_notification_rule, lab Owner or Admin; the database checks
// the role and the row again). Every cell's form sends the row with that one cell changed.
export async function setRuleAction(_previous: RuleState, form: FormData): Promise<RuleState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (!mayEditNotificationRules(session)) return { error: "Only a lab Owner or Admin changes who gets which email." };
  const row = normalizeRule({
    kind: String(form.get("kind") ?? ""), labRoles: form.getAll("labRoles").map(String), stepOwner: form.get("stepOwner") === "true",
    clientAdmin: form.get("clientAdmin") === "true", requester: form.get("requester") === "true", days: form.get("days") === null ? null : String(form.get("days")).trim(),
  });
  if (!row) return { error: "That row is not valid. Lab staff are chosen by role; the results check waits 1 to 60 days." };
  try {
    await setNotificationRule(row);
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(`/notifications?rule=${row.kind}`);
}
