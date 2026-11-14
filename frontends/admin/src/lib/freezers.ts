// Freezers & racks (0041): the lab's freezers (name, temperature as text, a note), the racks in each one, and where
// each storage box sits. Pure: the types the Storage screen shows and the demo's version of create_freezer,
// create_freezer_rack, archive_freezer, archive_freezer_rack and set_box_location (same rules, same wording). The data
// seam is data/freezers.ts.
import { DataError } from "./samples";

export type FreezerRack = { id: string; name: string };
export type Freezer = { id: string; name: string; temperature: string | null; note: string | null; racks: FreezerRack[] };
// A box with a place: its freezer and, when chosen, a rack of that freezer.
export type BoxPlace = { box: string; freezerId: string; freezerName: string; temperature: string | null; rackId: string | null; rackName: string | null };
export type FreezerCatalog = { freezers: Freezer[]; locations: BoxPlace[] };

export const placeLabel = (place: Pick<BoxPlace, "freezerName" | "rackName">) => place.rackName ? `${place.freezerName} · ${place.rackName}` : place.freezerName;
export const placeOf = (catalog: FreezerCatalog, box: string) => catalog.locations.find(place => place.box === box.trim()) ?? null;
// The box form's one select: "freezer|rack", "freezer|" for a freezer without a rack, "" for not set.
export const placeValue = (place: Pick<BoxPlace, "freezerId" | "rackId"> | null) => place ? `${place.freezerId}|${place.rackId ?? ""}` : "";
export function parsePlaceValue(value: string): { freezerId: string | null; rackId: string | null } {
  const [freezer = "", rack = ""] = value.split("|");
  return { freezerId: freezer.trim() || null, rackId: rack.trim() || null };
}

const clean = (value: string | null | undefined, label: string, max: number) => {
  const text = (value ?? "").trim();
  if (text.length > max) throw new DataError(`${label} is longer than ${max} characters.`);
  return text || null;
};
export const archiveReason = (reason: string) => {
  const text = reason.trim();
  if (!text || text.length > 500) throw new DataError("Say why it is archived (500 characters at most).");
  return text;
};

// ---------------------------------------------------------------- demo

export type DemoRack = FreezerRack & { archivedReason: string | null };
export type DemoFreezer = Omit<Freezer, "racks"> & { archivedReason: string | null; racks: DemoRack[] };
export type DemoBoxLocation = { box: string; freezerId: string | null; rackId: string | null };
export type DemoFreezerState = { freezers: DemoFreezer[]; boxes: DemoBoxLocation[] };

// One synthetic freezer with two racks; the example box F1-R1-B01 sits in rack 1.
export const initialDemoFreezers = (): DemoFreezerState => ({
  freezers: [{
    id: "example-freezer-f1", name: "Freezer F1", temperature: "−80 °C", note: "Synthetic example freezer", archivedReason: null,
    racks: [{ id: "example-rack-f1-r1", name: "Rack 1", archivedReason: null }, { id: "example-rack-f1-r2", name: "Rack 2", archivedReason: null }],
  }],
  boxes: [{ box: "F1-R1-B01", freezerId: "example-freezer-f1", rackId: "example-rack-f1-r1" }],
});

export function catalogView(state: DemoFreezerState): FreezerCatalog {
  const freezers = state.freezers.filter(freezer => !freezer.archivedReason).map(freezer => ({
    id: freezer.id, name: freezer.name, temperature: freezer.temperature, note: freezer.note,
    racks: freezer.racks.filter(rack => !rack.archivedReason).map(rack => ({ id: rack.id, name: rack.name })),
  }));
  const locations = state.boxes.flatMap(row => {
    const freezer = state.freezers.find(item => item.id === row.freezerId);
    if (!freezer) return [];
    const rack = freezer.racks.find(item => item.id === row.rackId) ?? null;
    return [{ box: row.box, freezerId: freezer.id, freezerName: freezer.name, temperature: freezer.temperature, rackId: rack?.id ?? null, rackName: rack?.name ?? null }];
  });
  return { freezers, locations };
}

const findFreezer = (state: DemoFreezerState, id: string) => {
  const found = state.freezers.find(item => item.id === id);
  if (!found) throw new DataError("Freezer not found.");
  return found;
};
const findRack = (state: DemoFreezerState, id: string) => {
  for (const freezer of state.freezers) {
    const rack = freezer.racks.find(item => item.id === id);
    if (rack) return { freezer, rack };
  }
  throw new DataError("Rack not found.");
};
const boxesIn = (state: DemoFreezerState, test: (row: DemoBoxLocation) => boolean) => state.boxes.filter(test).map(row => row.box).sort().join(", ");

export function demoCreateFreezer(state: DemoFreezerState, input: { name: string; temperature: string; note: string }, id: string): DemoFreezerState {
  const name = clean(input.name, "The freezer name", 80);
  if (!name) throw new DataError("Enter the freezer's name.");
  if (state.freezers.some(item => item.name === name)) throw new DataError(`A freezer named "${name}" already exists (archived freezers keep their names).`);
  const freezer: DemoFreezer = { id, name, temperature: clean(input.temperature, "The temperature", 40), note: clean(input.note, "The note", 500), archivedReason: null, racks: [] };
  return { ...state, freezers: [...state.freezers, freezer] };
}

export function demoCreateRack(state: DemoFreezerState, freezerId: string, rackName: string, id: string): DemoFreezerState {
  const freezer = findFreezer(state, freezerId);
  if (freezer.archivedReason) throw new DataError(`Freezer ${freezer.name} is archived.`);
  const name = clean(rackName, "The rack name", 80);
  if (!name) throw new DataError("Enter the rack's name or number.");
  if (freezer.racks.some(item => item.name === name)) throw new DataError(`Freezer ${freezer.name} already has a rack named "${name}".`);
  return { ...state, freezers: state.freezers.map(item => item === freezer ? { ...item, racks: [...item.racks, { id, name, archivedReason: null }] } : item) };
}

export function demoArchiveFreezer(state: DemoFreezerState, id: string, reasonText: string): DemoFreezerState {
  const reason = archiveReason(reasonText);
  const freezer = findFreezer(state, id);
  if (freezer.archivedReason) throw new DataError(`Freezer ${freezer.name} is already archived.`);
  const held = boxesIn(state, row => row.freezerId === id);
  if (held) throw new DataError(`Freezer ${freezer.name} still holds box ${held}; move the boxes to another freezer first.`);
  return {
    ...state,
    freezers: state.freezers.map(item => item !== freezer ? item
      : { ...item, archivedReason: reason, racks: item.racks.map(rack => rack.archivedReason ? rack : { ...rack, archivedReason: reason }) }),
  };
}

export function demoArchiveRack(state: DemoFreezerState, id: string, reasonText: string): DemoFreezerState {
  const reason = archiveReason(reasonText);
  const { freezer, rack } = findRack(state, id);
  if (rack.archivedReason) throw new DataError(`Rack ${rack.name} is already archived.`);
  const held = boxesIn(state, row => row.rackId === id);
  if (held) throw new DataError(`Rack ${rack.name} still holds box ${held}; move the boxes to another rack first.`);
  return { ...state, freezers: state.freezers.map(item => item !== freezer ? item : { ...item, racks: item.racks.map(r => r === rack ? { ...r, archivedReason: reason } : r) }) };
}

export function demoSetBoxLocation(state: DemoFreezerState, boxText: string, freezerId: string | null, rackId: string | null): DemoFreezerState {
  const box = boxText.trim();
  if (!box || box.length > 120) throw new DataError("Enter a box.");
  if (!freezerId && rackId) throw new DataError("Choose the freezer the rack is in.");
  if (freezerId) {
    const freezer = findFreezer(state, freezerId);
    if (freezer.archivedReason) throw new DataError(`Freezer ${freezer.name} is archived; choose another one.`);
    if (rackId) {
      const { freezer: home, rack } = findRack(state, rackId);
      if (home.id !== freezer.id) throw new DataError(`Rack ${rack.name} is not in freezer ${freezer.name}.`);
      if (rack.archivedReason) throw new DataError(`Rack ${rack.name} is archived; choose another one.`);
    }
  }
  const rest = state.boxes.filter(row => row.box !== box);
  return { ...state, boxes: freezerId ? [...rest, { box, freezerId, rackId }] : rest };
}
