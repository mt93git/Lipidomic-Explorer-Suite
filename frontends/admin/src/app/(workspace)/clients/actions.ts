"use server";

import { revalidatePath } from "next/cache";
import { redirectAfterAction } from "@/lib/action-redirect";
import { archiveClient, createClient, DataError, updateClient } from "@/lib/data/clients";
import { getAppSession } from "@/lib/session";

export type ClientActionState = { error?: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
async function authorize() {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
}
function input(form: FormData) {
  return { name: value(form, "name"), kind: value(form, "kind"), billingMethod: value(form, "billingMethod") || null,
    notes: value(form, "notes") || null, actorId: value(form, "actor") || undefined };
}
export async function createClientAction(_previous: ClientActionState, form: FormData): Promise<ClientActionState> {
  await authorize();
  let id: string;
  try { id = await createClient(input(form)); }
  catch (error) { if (error instanceof DataError) return { error: error.message }; throw error; }
  revalidatePath("/clients");
  return redirectAfterAction(`/clients/${encodeURIComponent(id)}?created=1`);
}
export async function updateClientAction(_previous: ClientActionState, form: FormData): Promise<ClientActionState> {
  await authorize();
  const clientId = value(form, "clientId");
  try { await updateClient({ ...input(form), clientId }); }
  catch (error) { if (error instanceof DataError) return { error: error.message }; throw error; }
  revalidatePath("/clients");
  revalidatePath(`/clients/${encodeURIComponent(clientId)}`);
  return redirectAfterAction(`/clients/${encodeURIComponent(clientId)}?saved=1`);
}
export async function archiveClientAction(_previous: ClientActionState, form: FormData): Promise<ClientActionState> {
  await authorize();
  const clientId = value(form, "clientId");
  try { await archiveClient({ clientId, reason: value(form, "reason"), actorId: value(form, "actor") || undefined }); }
  catch (error) { if (error instanceof DataError) return { error: error.message }; throw error; }
  revalidatePath("/clients");
  revalidatePath(`/clients/${encodeURIComponent(clientId)}`);
  return redirectAfterAction("/clients?archived=1");
}
