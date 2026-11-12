import { adminBase } from './adminBase';
import { forgetAdminToken } from './adminToken';
import { mockAdminSignInFetch } from '../mock/adminSignIn';

type Answer = 'ok' | 'code_required' | 'invalid_credentials' | 'invalid_code' | 'unavailable';
const request = (url: string, init: RequestInit) => import.meta.env?.VITE_API_MOCK === '1' ? mockAdminSignInFetch(url, init) : fetch(url, init);
export async function signIn(credentials: { email: string; password: string; code?: string }): Promise<Answer> {
  try {
    const response = await request(`${adminBase}/api/sign-in`, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    if (response.ok) { forgetAdminToken(); return 'ok'; }
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (body?.error === 'missing_fields') return 'invalid_credentials';
    if (body?.error === 'code_required' || body?.error === 'invalid_credentials' || body?.error === 'invalid_code') return body.error;
  } catch { /* Admin is unavailable. */ }
  return 'unavailable';
}
export async function signOut(): Promise<void> {
  try { await request(`${adminBase}/api/sign-out`, { method: 'POST', credentials: 'same-origin', cache: 'no-store' }); }
  finally { forgetAdminToken(); }
}
