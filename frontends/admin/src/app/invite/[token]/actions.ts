"use server";

import { acceptInvitation, acceptMyInvitation, DataError } from "@/lib/data/people";

export type AcceptState = { error?: string; email?: string };

// The public last step of an invitation: the person sets a password; the server creates the account and accepts.
// The password goes to GoTrue only (live) and is never stored or logged by the app.
export async function acceptInvitationAction(_previous: AcceptState, form: FormData): Promise<AcceptState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  try {
    return { email: (await acceptInvitation({ token, password })).email };
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
}

// A person who already has an account, signed in as the invited email: the role is added, the password untouched.
export async function acceptMyInvitationAction(_previous: AcceptState, form: FormData): Promise<AcceptState> {
  try {
    return { email: (await acceptMyInvitation(String(form.get("token") ?? ""))).email };
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
}
