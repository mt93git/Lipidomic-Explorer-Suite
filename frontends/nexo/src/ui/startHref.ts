/** Start (the Data step) under the app's own base: /nexo/ in production, /nexo-staging/ on staging (vite build --base). */
export const startHref = () => import.meta.env.BASE_URL;
