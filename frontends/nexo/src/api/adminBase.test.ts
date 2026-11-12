import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
it('uses the default Admin prefix', async () => {
  vi.stubEnv('VITE_ADMIN_BASE', '');
  expect((await import('./adminBase')).adminBase).toBe('/admin');
});
it('uses the configured Admin prefix', async () => {
  vi.stubEnv('VITE_ADMIN_BASE', '/admin-staging/');
  expect((await import('./adminBase')).adminBase).toBe('/admin-staging');
  const { adminSignInUrl, adminTokenUrl } = await import('./adminToken');
  expect(adminTokenUrl).toBe('/admin-staging/api/session-token');
  expect(adminSignInUrl('/nexo/')).toBe('/admin-staging/sign-in?next=%2Fnexo%2F');
});
