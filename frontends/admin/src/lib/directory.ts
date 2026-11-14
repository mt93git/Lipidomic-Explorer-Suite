// Presentation rules shared by Datasets, Clients and Client detail (prototypes a16/a17/a18): status pills, the
// "last active" wording, how a person is named, and the short day. Pure: no computed value changes here.
import type { DatasetStatus } from "./release";
import { LAB_TIME_ZONE } from "./lab-time";

export type DatasetPill = { tone: "awaiting" | "ready" | "released" | "superseded" | "withdrawn" | "processing"; label: string };

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

// A built version waits for its next signature until the policy's count is reached, then waits to be released.
// "processing": an order whose results were accepted and whose Excel is not built yet. An archived build waits for
// nothing: it reads "archived" (grey), never "awaiting" or "ready".
export function datasetPill(dataset: { status: DatasetStatus; signatures: number; archived?: boolean } | "processing", requiredSignatures: number): DatasetPill {
  if (dataset === "processing") return { tone: "processing", label: "processing" };
  if (dataset.status === "built" && dataset.archived) return { tone: "superseded", label: "archived" };
  if (dataset.status === "built") {
    return dataset.signatures >= requiredSignatures
      ? { tone: "ready", label: "signed · ready to release" }
      : { tone: "awaiting", label: `awaiting ${ordinal(dataset.signatures + 1)} signature` };
  }
  return { tone: dataset.status, label: dataset.status };
}

// Order stage pill on Client detail: released green, waiting for the lab's answer grey, any working stage amber.
export function stageTone(stage: string): "released" | "awaiting" | "processing" {
  if (stage === "Released") return "released";
  if (stage === "Request") return "processing";
  return "awaiting";
}

// A member as the lab reads them: the name they were given, else their email; never the user id.
export function personLabel(member: { name?: string | null; email?: string | null }): string {
  return member.name?.trim() || member.email?.trim() || "Name not recorded";
}

const DAY = 24 * 60 * 60 * 1000;
const labDate = new Intl.DateTimeFormat("en-CA", { timeZone: LAB_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const longDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: LAB_TIME_ZONE });
// Last sign-in in lab days: "today", "1 d" … "59 d", then the date; "never" when the person has not signed in.
export function lastActive(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "never";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "never";
  const days = Math.round((Date.parse(labDate.format(now)) - Date.parse(labDate.format(at))) / DAY);
  if (days <= 0) return "today";
  return days < 60 ? `${days} d` : longDay.format(at);
}

// "Charge code" → "charge code", as the lists and the header read it; "QC reviewed" keeps its acronym.
export const lowerFirst = (text: string) => !text || /^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);

const shortDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: LAB_TIME_ZONE });
// "28 Oct": the day a version was released, in the lab's zone.
export function releasedDay(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : shortDay.format(at);
}
