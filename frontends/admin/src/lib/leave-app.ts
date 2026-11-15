// A full navigation to a same-origin path outside Admin's base path (Nexo). Next's router would prefix the base path to
// an in-app redirect, so the browser is sent there directly. Client only.
export function leaveApp(path: string) {
  window.location.assign(path);
}
