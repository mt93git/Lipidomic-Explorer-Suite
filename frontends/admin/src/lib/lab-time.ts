// The lab (New Haven) reads clocks in America/New_York. Formatting in one fixed zone keeps server and
// client markup identical, so there is no hydration mismatch, and labels stay unambiguous for everyone.
export const LAB_TIME_ZONE = "America/New_York";

const clock = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LAB_TIME_ZONE, timeZoneName: "short" });
const day = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: LAB_TIME_ZONE });

// "16:35 EST" for the attention tiles' "as of" note.
export function formatClock(instant: Date): string {
  return clock.format(instant);
}
// "5 Nov" for the released list; the day the lab signed, in the lab's zone.
export function formatLabDay(iso: string): string {
  const instant = new Date(iso);
  return Number.isNaN(instant.getTime()) ? "" : day.format(instant);
}
const instant = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LAB_TIME_ZONE, timeZoneName: "short" });
// "7 Nov 2026, 10:41 EST" for a recorded arrival.
export function formatLabInstant(iso: string): string {
  const value = new Date(iso);
  return Number.isNaN(value.getTime()) ? "" : instant.format(value);
}
