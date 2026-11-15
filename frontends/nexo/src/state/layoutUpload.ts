// Chart audit b11 F3: a module's configuration file input (the pathway "Upload Layout JSON (.json):", upload_config).
// The file reaches Team's module through the API (export.R api_card_upload); its effect lands in the card's instance
// inputs (the module's own *_json layout inputs, which Team saves). Nexo also keeps the uploaded file itself in its
// member (NexoNode.inputs[<id>] = {name, content}), never re-sent on reopen: the instance inputs already carry it.
import { setNexoInputs, type NexoInputs } from './nexo';
import type { Command } from './commands';
/** Same limit as the API (export.R api_upload_limit). */
export const LAYOUT_UPLOAD_LIMIT = 256 * 1024;
/** Same rule as the API (export.R api_config_id): a module file input whose id ends in "config". */
export const isUploadId = (id: string): boolean => /config$/.test(id);
export interface UploadRecord { name: string; content: string }
/** Null when the file can go to the API; otherwise the message to show (as the API answers). */
export function checkUploadFile(name: string, size: number): string | null {
  if (!/\.json$/i.test(name)) return 'Upload a .json file.';
  if (size > LAYOUT_UPLOAD_LIMIT) return 'The file is larger than 256 KiB.';
  return null;
}
/** Team's own message for a file that does not parse (13_pathway_module.R upload_config observer). */
export function parseLayoutJson(text: string): {value: unknown} | {error: string} {
  try { return {value: JSON.parse(text)}; } catch (e) { return {error: `Error loading layout JSON: ${e instanceof Error ? e.message : String(e)}`}; }
}
const isRecord = (v: unknown): v is UploadRecord => !!v && typeof v === 'object' && !Array.isArray(v)
  && typeof (v as UploadRecord).name === 'string' && typeof (v as UploadRecord).content === 'string' && (v as UploadRecord).content.length <= LAYOUT_UPLOAD_LIMIT;
/** The uploaded files kept in a node's member inputs. */
export function uploadsOf(inputs: Record<string, unknown> | undefined): NexoInputs {
  return Object.fromEntries(Object.entries(inputs ?? {}).filter(([k, v]) => isUploadId(k) && isRecord(v)).map(([k, v]) => [k, {name:(v as UploadRecord).name, content:(v as UploadRecord).content}]));
}
/** Duplicate / paste: the copy's member gets the original's uploaded files, beside the computed values it carries. */
export function carryUploads(id: string, inputs: Record<string, unknown> | undefined, computed: NexoInputs = {}): Command {
  const values = {...structuredClone(computed), ...structuredClone(uploadsOf(inputs))};
  return setNexoInputs(id, Object.keys(values).length ? values : undefined);
}
/** The API refused the file (400: not .json, too large, not JSON, unknown input): nothing changed on the card. */
export const uploadRefused = (error: unknown): boolean => (error as {status?: unknown} | null)?.status === 400;
/** A refusal as the API answers it (status 400, code api_bad_request), for the mock. */
export const refusal = (message: string): Error => Object.assign(new Error(message), {status: 400, code: 'api_bad_request'});
