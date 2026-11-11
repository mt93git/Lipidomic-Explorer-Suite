"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { setMyNotification } from "@/lib/data/notifications";
import { isNotificationKind, kindsFor } from "@/lib/notifications";
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
