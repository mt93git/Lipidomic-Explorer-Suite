// Team's longitudinal time-course designer (R/modules/11_longitudinal_module.R:1265-1320): a source bucket of
// cohorts (sortable pull "clone", put FALSE) and one "Timecourse i" bucket per case (sortable rank_list, input
// case_bucket_<id>, value = the item ids in order, as sortable's JS sends them). The real API reads the buckets from
// the module's rendered designer (schema.R api_schema_rank_buckets); nothing here knows a case id.
import type { SchemaControl } from '../api/types';

export interface Bucket { id: string; label: string; items: string[] }
export type BucketPatch = Record<string, string[]>;
export const isBucketControl = (c: SchemaControl): boolean => (c.type as string) === 'bucket' && /^case_bucket_.+$/.test(c.id);
const strings = (v: unknown): string[] | undefined => Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : undefined;

/** The buckets in schema order; a bucket's items are Nexo's member value, else the live value, else what the module drew. */
export function bucketsOf(controls: readonly SchemaControl[], own: Record<string, unknown> | undefined): {source: string[]; buckets: Bucket[]} {
  const list = controls.filter(isBucketControl);
  const source = [...new Set(list.flatMap(c => (c.options ?? []).map(o => String(o.value))))];
  return {source, buckets: list.map(c => ({id: c.id, label: c.label || c.id, items: strings(own?.[c.id]) ?? strings(c.value) ?? strings(c.default) ?? []}))};
}
const find = (buckets: readonly Bucket[], id: string) => buckets.find(b => b.id === id);

/** Drag (or "Move to") between time-course buckets: out of its own bucket, appended to the target. */
export function moveItem(buckets: readonly Bucket[], fromId: string, index: number, toId: string): BucketPatch {
  const from = find(buckets, fromId), to = find(buckets, toId), item = from?.items[index];
  if (!from || !to || item === undefined || fromId === toId || to.items.includes(item)) return {};
  return {[fromId]: from.items.filter((_, i) => i !== index), [toId]: [...to.items, item]};
}
/** The source bucket clones: the cohort is added to the target and stays in the source. */
export function addCohort(buckets: readonly Bucket[], cohort: string, toId: string): BucketPatch {
  const to = find(buckets, toId);
  return !to || to.items.includes(cohort) ? {} : {[toId]: [...to.items, cohort]};
}
/** Team's × on one item (delete_timecourse_item {case_id, item_idx}): the bucket without that item. */
export function removeItem(buckets: readonly Bucket[], id: string, index: number): BucketPatch {
  const b = find(buckets, id);
  return !b || index < 0 || index >= b.items.length ? {} : {[id]: b.items.filter((_, i) => i !== index)};
}
/** Reorder inside a bucket (drag within the rank list); delta -1 = up, +1 = down. */
export function reorderItem(buckets: readonly Bucket[], id: string, index: number, delta: number): BucketPatch {
  const b = find(buckets, id), target = index + delta;
  if (!b || index < 0 || index >= b.items.length || target < 0 || target >= b.items.length) return {};
  const items = [...b.items]; [items[index], items[target]] = [items[target], items[index]];
  return {[id]: items};
}
/** Team applies a designer change only on "Generate Analysis" (longitudinal_design is an eventReactive on
 *  submit_longitudinal_btn): any PATCH that re-sends buckets (undo, duplicate, reopen) presses it too, so the card
 *  draws what the buckets say. */
export const designerActions = (inputs: Record<string, unknown>): string[] => Object.keys(inputs).some(k => /^case_bucket_.+$/.test(k)) ? ['submit_longitudinal_btn'] : [];
