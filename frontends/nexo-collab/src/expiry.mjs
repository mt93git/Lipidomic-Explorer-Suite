// Admin verifies the JWT; only its expiry is decoded here. Timers belong to one connection.
export function watchExpiry({ token, close, revalidate, every = 60_000 }) {
  let exp;
  try { exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp; } catch { /* old opaque test tokens */ }
  let stopped = false;
  let expiry;
  const stop = () => { stopped = true; clearTimeout(expiry); clearInterval(scope); };
  const refuse = (code, reason) => { if (stopped) return; stop(); close({ code, reason }); };
  const scope = setInterval(async () => {
    try { await revalidate(); }
    catch (e) {
      if (e.reason === 'forbidden_scope' || e.reason === 'unknown_project') refuse(4403, 'No access');
      else if (e.reason === 'admin_auth_required') refuse(4401, 'Refresh token');
    }
  }, every);
  if (Number.isFinite(exp)) {
    // Long-lived tokens must not overflow Node's signed 32-bit timeout.
    const schedule = () => {
      const remaining = exp * 1000 - Date.now();
      if (remaining <= 0) { refuse(4401, 'Token expired'); return; }
      expiry = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    };
    schedule();
  }
  return stop;
}
