import type { AdminView } from '../api';
/** Upload ZIP (POST /checkpoints) is for lab staff once the store is scoped per client (docs/integration/nexo-store-scope.md):
 *  hidden once Admin says the person is a client member, shown as today otherwise (staff, signed out, no Admin on the host,
 *  not asked yet). The API refuses a member's upload (403 staff_only) either way. */
export const uploadAllowed = (view: AdminView | null, readOnly: boolean) => !readOnly && view !== 'client';
