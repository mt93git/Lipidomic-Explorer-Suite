"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { archiveFreezer, archiveRack, createFreezer, createRack, setBoxLocation } from "@/lib/data/freezers";
import { parsePlaceValue } from "@/lib/freezers";
import { DataError } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

// Freezers & racks (0041): add and archive freezers and racks (Owner or Admin), set a box's freezer and rack (lab
// writers); the data seam and the database check the role again. A refusal comes back with the typed values; on
// success the Storage screen reopens with a confirmation (and on the box, for a box's place).
export type FreezerActionState = { error?: string; values?: Record<string, string> };

const ID = /^[A-Za-z0-9-]{1,64}$/;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").slice(0, 600);

async function run(form: FormData, names: string[], work: () => Promise<string>): Promise<FreezerActionState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const values = Object.fromEntries(names.map(name => [name, text(form, name)]));
  let next: string;
  try {
    next = await work();
  } catch (error) {
    if (error instanceof DataError) return { error: error.message, values };
    throw error;
  }
  return redirectAfterAction(next);
}

const done = (code: string, box?: string) => `/storage?${new URLSearchParams({ ...(box ? { box } : {}), done: code })}${box ? "" : "#freezers"}`;
const idOf = (form: FormData, name: string) => {
  const value = text(form, name);
  if (!ID.test(value)) throw new DataError("That freezer or rack is not valid. Reload the page.");
  return value;
};

export async function createFreezerAction(_previous: FreezerActionState, form: FormData): Promise<FreezerActionState> {
  return run(form, ["name", "temperature", "note"], async () => {
    await createFreezer({ name: text(form, "name"), temperature: text(form, "temperature"), note: text(form, "note") });
    return done("freezer-added");
  });
}

export async function createRackAction(_previous: FreezerActionState, form: FormData): Promise<FreezerActionState> {
  return run(form, ["name"], async () => {
    await createRack(idOf(form, "freezerId"), text(form, "name"));
    return done("rack-added");
  });
}

export async function archiveFreezerAction(_previous: FreezerActionState, form: FormData): Promise<FreezerActionState> {
  return run(form, ["reason"], async () => {
    await archiveFreezer(idOf(form, "id"), text(form, "reason"));
    return done("freezer-archived");
  });
}

export async function archiveRackAction(_previous: FreezerActionState, form: FormData): Promise<FreezerActionState> {
  return run(form, ["reason"], async () => {
    await archiveRack(idOf(form, "id"), text(form, "reason"));
    return done("rack-archived");
  });
}

export async function setBoxLocationAction(_previous: FreezerActionState, form: FormData): Promise<FreezerActionState> {
  return run(form, ["place"], async () => {
    const box = text(form, "box").trim();
    if (!box) throw new DataError("Enter a box.");
    const { freezerId, rackId } = parsePlaceValue(text(form, "place"));
    if ((freezerId && !ID.test(freezerId)) || (rackId && !ID.test(rackId))) throw new DataError("That freezer or rack is not valid. Reload the page.");
    await setBoxLocation(box, freezerId, rackId);
    return done("box-place", box);
  });
}
