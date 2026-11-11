import { adminHeaders, AdminSignInRequired } from './adminToken';
export type UploadChoice = { name: string; label: string; choices: string[] };
export type UploadAnswers = Record<string, string | Record<string, string>>;
export type UploadResult = { status: 'ready'; adminDatasetId: string } | { status: 'choices'; missing: UploadChoice[] };
export function interpretUploadResponse(status: number, body: unknown): UploadResult {
 const value = (body ?? {}) as { adminDatasetId?: string; reason?: string; missing?: UploadChoice[]; error?: string; message?: string };
 if (status === 401) throw new AdminSignInRequired();
 if (status === 422 && value.reason === 'upload_choices_required' && Array.isArray(value.missing)) return { status: 'choices', missing: value.missing };
 if (status >= 200 && status < 300 && typeof value.adminDatasetId === 'string') return { status: 'ready', adminDatasetId: value.adminDatasetId };
 throw new Error(value.error === 'lab_prepares' ? 'The lab prepares data for your client. Ask the lab to upload this workbook.' : value.message ?? `Upload failed (${status}).`);
}
export async function uploadDataset(file: File, choices: UploadAnswers = {}, workspace?: string, metadataFile?: File): Promise<UploadResult> {
 // The mock build: Team read the workbook; it opens as the mock's dataset under its new upload id (mock/dataset.ts).
 if (import.meta.env.VITE_API_MOCK === '1') return { status: 'ready', adminDatasetId: `upload-${crypto.randomUUID()}` };
 const { workspace: detectedWorkspace, ...answers } = choices;
 const form = new FormData(); form.append('file', file); form.append('choices', JSON.stringify(answers));
 const selectedWorkspace = workspace ?? (typeof detectedWorkspace === 'string' ? detectedWorkspace : undefined);
 if (selectedWorkspace) form.append('workspace', selectedWorkspace);
 if (metadataFile) form.append('metadataFile', metadataFile);
 const response = await fetch(`${import.meta.env.VITE_API_BASE ?? '/api/v1'}/datasets/upload`, { method: 'POST', headers: await adminHeaders(undefined, true), body: form });
 return interpretUploadResponse(response.status, await response.json());
}
