import type { AdminView } from '../api';
/** Upload ZIP (POST /checkpoints) is for lab staff once the store is scoped per client (docs/integration/nexo-store-scope.md):
 *  hidden once Admin says the person is a client member, shown as today otherwise (staff, signed out, no Admin on the host,
 *  not asked yet). The API refuses a member's upload (403 staff_only) either way. */
/** The Excel upload (POST /datasets/upload, C5): lab staff, or a client member whose client prepares (membersPrepare);
 *  never read-only, nor without Admin's view (the API needs the caller). */
export const datasetUploadAllowed = (view: AdminView | null, membersPrepare: boolean, readOnly: boolean) =>
  !readOnly && (view === 'staff' || (view === 'client' && membersPrepare));
export const uploadAllowed = (view: AdminView | null, readOnly: boolean) => !readOnly && view !== 'client';
