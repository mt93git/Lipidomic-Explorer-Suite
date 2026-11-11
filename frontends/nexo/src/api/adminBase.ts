/** Admin and Nexo share an origin; the prefix selects the Admin deployment. */
export const adminBase = (import.meta.env?.VITE_ADMIN_BASE || '/admin').replace(/\/$/, '');
