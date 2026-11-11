import { expect, it } from 'vitest';
import { interpretUploadResponse } from './datasetUpload';
it('returns the uploaded id', () => expect(interpretUploadResponse(200, { adminDatasetId: 'upload-synthetic' })).toEqual({ status: 'ready', adminDatasetId: 'upload-synthetic' }));
it('returns Team choices', () => expect(interpretUploadResponse(422, { reason: 'upload_choices_required', missing: [] }).status).toBe('choices'));
it('explains lab-only upload', () => expect(() => interpretUploadResponse(403, { error: 'lab_prepares' })).toThrow('lab'));
it('sends a detected workspace choice as multipart workspace', async () => {
 const { vi } = await import('vitest');
 const { uploadDataset } = await import('./datasetUpload');
 const { useAdminTokenFetch, forgetAdminToken } = await import('./adminToken');
 forgetAdminToken(); useAdminTokenFetch(async () => new Response('{}', { status: 403 }));
 const fake = vi.fn(async () => new Response(JSON.stringify({ adminDatasetId: 'upload-synthetic' })));
 vi.stubGlobal('fetch', fake);
 try {
  await uploadDataset(new File(['synthetic'], 'matrix.xlsx'), { workspace: 'nexo-client-synthetic', sheet: 'Matrix' });
  const form = (fake.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
  expect(form.get('workspace')).toBe('nexo-client-synthetic');
  expect(JSON.parse(form.get('choices') as string)).toEqual({ sheet: 'Matrix' });
 } finally { vi.unstubAllGlobals(); forgetAdminToken(); }
});
