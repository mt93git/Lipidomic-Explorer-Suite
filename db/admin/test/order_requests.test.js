// Client order requests (0019_order_requests.sql): request_order, accept_order, decline_order, receive_shipment on a
// pending request, and the lab's shipping instructions. Synthetic data only.
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { freshDb, as, count, id, U, C } from './helpers.js';

let db;
beforeEach(async () => { db = await freshDb(); });
afterEach(async () => { await db?.close(); });

const PANEL = id(501);
const request = (client = C.A, panel = PANEL, { title = 'Synthetic diet study', expected = 24 } = {}) =>
  db.query("SELECT admin.request_order($1, $2, $3, 'plasma', $4, 'PO-SYN-9', 'two synthetic diets') AS id", [client, panel, title, expected])
    .then((r) => r.rows[0].id);
const accept = (oid, panel = null) => db.query('SELECT admin.accept_order($1, $2)', [oid, panel]);
const decline = (oid, reason) => db.query('SELECT admin.decline_order($1, $2)', [oid, reason]);
const receive = (oid) => db.query("SELECT admin.receive_shipment($1, 'courier', 'TRK-SYN', 'ok', 1, NULL) AS id", [oid]);
const orderRow = async (oid) => {
  await as(db, null);
  return (await db.query('SELECT * FROM admin."order" WHERE id = $1', [oid])).rows[0];
};
const pendingFor = async (who = U.aReq, client = C.A) => {
  await as(db, who);
  return request(client);
};

describe('order review column', () => {
  test('existing orders and create_order are accepted, never reviewed', async () => {
    await as(db, null);
    expect((await db.query('SELECT DISTINCT review FROM admin."order"')).rows).toEqual([{ review: 'accepted' }]);
    await as(db, U.operator);
    const oid = (await db.query("SELECT admin.create_order($1, $2, 'Lab order', NULL, 4, NULL, NULL) AS id", [C.A, PANEL])).rows[0].id;
    expect(await orderRow(oid)).toMatchObject({ review: 'accepted', reviewed_at: null, reviewed_by: null });
  });

  test('a declined order must be archived, and a pending one carries no answer', async () => {
    await as(db, null);
    await expect(db.query("UPDATE admin.\"order\" SET review = 'declined' WHERE id = $1", [id(101)])).rejects.toThrow(/order_declined_is_archived/);
    await expect(db.query("UPDATE admin.\"order\" SET review = 'pending', reviewed_at = now() WHERE id = $1", [id(101)])).rejects.toThrow(/order_pending_not_reviewed/);
    await expect(db.query("UPDATE admin.\"order\" SET review = 'maybe' WHERE id = $1", [id(101)])).rejects.toThrow(/check constraint/);
  });
});

describe('admin.request_order', () => {
  test('a requester and a client admin request for their client: pending, at Request, requested_by = caller, audited', async () => {
    for (const u of [U.aReq, U.aAdmin]) {
      const oid = await pendingFor(u);
      const o = await orderRow(oid);
      expect(o).toMatchObject({
        client_id: C.A, panel_id: PANEL, title: 'Synthetic diet study', matrix: 'plasma', expected_samples: 24, billing_ref: 'PO-SYN-9',
        notes: 'two synthetic diets', stage: 'request', review: 'pending', requested_by: u, reviewed_at: null, archived_at: null,
      });
      expect(o.code).toMatch(/^ORD\d{3,}$/);
      expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'order' AND entity_id = $1 AND action = 'INSERT' AND actor = $2 AND client_id = $3", [oid, u, C.A])).toBe(1);
    }
  });

  test('the requester reads the order they asked for; another client does not', async () => {
    const oid = await pendingFor();
    expect(await count(db, 'SELECT 1 FROM admin."order" WHERE id = $1', [oid])).toBe(1);
    await as(db, U.bReq);
    expect(await count(db, 'SELECT 1 FROM admin."order" WHERE id = $1', [oid])).toBe(0);
  });

  test('a null panel ("let the lab advise") and blank optional text are allowed', async () => {
    await as(db, U.aReq);
    const oid = (await db.query("SELECT admin.request_order($1, NULL, ' Trimmed ', ' ', NULL, '', '  ') AS id", [C.A])).rows[0].id;
    expect(await orderRow(oid)).toMatchObject({ panel_id: null, title: 'Trimmed', matrix: null, expected_samples: null, billing_ref: null, notes: null, review: 'pending' });
  });

  test('refuses the wrong role: viewer, lab staff (they use create_order), lab member', async () => {
    for (const u of [U.aView, U.operator, U.admin, U.owner, U.member]) {
      await as(db, u);
      await expect(request(), u).rejects.toThrow(/only a client admin or requester of this client/);
    }
    await as(db, U.both); // requester in A, viewer in B
    await expect(request(C.B)).rejects.toThrow(/only a client admin or requester/);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.\"order\" WHERE title = 'Synthetic diet study'")).toBe(0);
  });

  test('refuses another client and an unknown client with the same message (nothing is revealed)', async () => {
    await as(db, U.aReq);
    await expect(request(C.B)).rejects.toThrow(/only a client admin or requester of this client/);
    await expect(request(id(999))).rejects.toThrow(/only a client admin or requester of this client/);
  });

  test('refuses an archived membership and an archived client', async () => {
    await as(db, null);
    await db.query("UPDATE admin.client_member SET archived_at = now(), archived_reason = 'left' WHERE user_id = $1 AND client_id = $2", [U.aAdmin, C.A]);
    await db.query("UPDATE admin.client SET archived_at = now(), archived_reason = 'synthetic' WHERE id = $1", [C.B]);
    await as(db, U.aAdmin);
    await expect(request()).rejects.toThrow(/only a client admin or requester/);
    await as(db, U.bReq);
    await expect(request(C.B)).rejects.toMatchObject({ code: '55000', message: expect.stringMatching(/is archived; it cannot request new orders/) });
  });

  test('refuses an archived or unknown panel, a missing title and a negative count', async () => {
    await as(db, null);
    await db.query("INSERT INTO admin.panel(id, name, dataset_type, archived_at, archived_reason) VALUES ($1, 'Retired panel', 'global', now(), 'synthetic')", [id(502)]);
    await as(db, U.aReq);
    await expect(request(C.A, id(502))).rejects.toThrow(/panel .* is archived/);
    await expect(request(C.A, id(998))).rejects.toThrow(/panel .* not found/);
    await expect(request(C.A, PANEL, { title: ' ' })).rejects.toThrow(/title is required/);
    await expect(request(C.A, PANEL, { expected: -2 })).rejects.toThrow(/expected samples/);
  });

  test('client roles still have no direct write: the review cannot be flipped with their own token', async () => {
    const oid = await pendingFor();
    const r = await db.query("UPDATE admin.\"order\" SET review = 'accepted' WHERE id = $1", [oid]);
    expect(r.affectedRows).toBe(0);
    await expect(db.query("INSERT INTO admin.\"order\"(client_id, title, review) VALUES ($1, 'direct', 'accepted')", [C.A])).rejects.toThrow(/row-level security/);
    expect((await orderRow(oid)).review).toBe('pending');
  });
});

describe('admin.accept_order', () => {
  test('owner, admin and operator accept a pending request: who and when, audited', async () => {
    for (const u of [U.operator, U.admin, U.owner]) {
      const oid = await pendingFor();
      await as(db, u);
      await accept(oid);
      const o = await orderRow(oid);
      expect(o).toMatchObject({ review: 'accepted', reviewed_by: u, panel_id: PANEL, stage: 'request', archived_at: null });
      expect(o.reviewed_at).toBeInstanceOf(Date);
      expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'order' AND entity_id = $1 AND action = 'UPDATE' AND actor = $2 AND after->>'review' = 'accepted'", [oid, u])).toBe(1);
    }
  });

  test('sets the panel when given (a request without one), keeps the client\'s when null; refuses an archived panel', async () => {
    await as(db, U.aReq);
    const oid = (await db.query("SELECT admin.request_order($1, NULL, 'No panel yet', NULL, 3, NULL, NULL) AS id", [C.A])).rows[0].id;
    await as(db, null);
    await db.query("INSERT INTO admin.panel(id, name, dataset_type) VALUES ($1, 'Sterol panel', 'global')", [id(503)]);
    await db.query("INSERT INTO admin.panel(id, name, dataset_type, archived_at, archived_reason) VALUES ($1, 'Retired panel', 'global', now(), 'synthetic')", [id(502)]);
    await as(db, U.operator);
    await expect(accept(oid, id(502))).rejects.toThrow(/panel .* is archived/);
    expect((await orderRow(oid)).review).toBe('pending');
    await as(db, U.operator);
    await accept(oid, id(503));
    expect(await orderRow(oid)).toMatchObject({ review: 'accepted', panel_id: id(503) });
  });

  test('refuses client roles and lab members', async () => {
    const oid = await pendingFor();
    for (const u of [U.aReq, U.aAdmin, U.aView, U.member]) {
      await as(db, u);
      await expect(accept(oid), u).rejects.toThrow(/only lab staff/);
    }
    expect((await orderRow(oid)).review).toBe('pending');
  });

  test('refuses an order that is not pending with PT409; an unknown or declined order is not found', async () => {
    const oid = await pendingFor();
    await as(db, U.operator);
    await accept(oid);
    await expect(accept(oid)).rejects.toMatchObject({ code: 'PT409', message: expect.stringMatching(/not waiting for an answer; it is already accepted/) });
    await expect(accept(id(101))).rejects.toMatchObject({ code: 'PT409' }); // a lab order, accepted from birth
    await expect(accept(id(997))).rejects.toThrow(/not found or archived/);
    const other = await pendingFor();
    await as(db, U.operator);
    await decline(other, 'Synthetic reason');
    await expect(accept(other)).rejects.toThrow(/not found or archived/);
  });
});

describe('admin.decline_order', () => {
  test('a lab writer declines with a reason: declined, archived with that reason, audited; the client still reads it', async () => {
    const oid = await pendingFor();
    await as(db, U.operator);
    await decline(oid, '  The custom list needs a method we cannot run before March.  ');
    const o = await orderRow(oid);
    expect(o).toMatchObject({ review: 'declined', reviewed_by: U.operator, archived_reason: 'The custom list needs a method we cannot run before March.' });
    expect(o.archived_at).toBeInstanceOf(Date);
    expect(o.reviewed_at).toEqual(o.archived_at);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'order' AND entity_id = $1 AND actor = $2 AND after->>'review' = 'declined'", [oid, U.operator])).toBe(1);
    await as(db, U.aView);
    expect((await db.query('SELECT review, archived_reason FROM admin."order" WHERE id = $1', [oid])).rows)
      .toEqual([{ review: 'declined', archived_reason: 'The custom list needs a method we cannot run before March.' }]);
    await as(db, U.bReq);
    expect(await count(db, 'SELECT 1 FROM admin."order" WHERE id = $1', [oid])).toBe(0);
  });

  test('refuses a missing or blank reason', async () => {
    const oid = await pendingFor();
    await as(db, U.operator);
    for (const reason of [null, '', '   ']) {
      await expect(decline(oid, reason)).rejects.toMatchObject({ code: '22023', message: expect.stringMatching(/needs a reason/) });
    }
    expect((await orderRow(oid)).review).toBe('pending');
  });

  test('refuses client roles and lab members', async () => {
    const oid = await pendingFor();
    for (const u of [U.aReq, U.aAdmin, U.aView, U.member]) {
      await as(db, u);
      await expect(decline(oid, 'no'), u).rejects.toThrow(/only lab staff/);
    }
  });

  test('refuses an accepted order with PT409 and an already declined one as archived', async () => {
    const oid = await pendingFor();
    await as(db, U.admin);
    await accept(oid);
    await expect(decline(oid, 'too late')).rejects.toMatchObject({ code: 'PT409' });
    const other = await pendingFor();
    await as(db, U.admin);
    await decline(other, 'first answer');
    await expect(decline(other, 'second answer')).rejects.toThrow(/not found or archived/);
  });
});

describe('receive_shipment on a request', () => {
  test('refuses a pending request ("Accept the request first"); after accepting, it receives', async () => {
    const oid = await pendingFor();
    await as(db, U.operator);
    await expect(receive(oid)).rejects.toMatchObject({ code: '55000', message: expect.stringMatching(/Accept the request first/) });
    expect(await count(db, 'SELECT 1 FROM admin.shipment WHERE order_id = $1', [oid])).toBe(0);
    await accept(oid);
    await receive(oid);
    expect((await orderRow(oid)).stage).toBe('received');
  });

  test('a lab-created order still receives as before', async () => {
    await as(db, U.operator);
    const oid = (await db.query("SELECT admin.create_order($1, $2, 'Lab order', NULL, 4, NULL, NULL) AS id", [C.A, PANEL])).rows[0].id;
    await receive(oid);
    expect((await orderRow(oid)).stage).toBe('received');
  });
});

describe('shipping instructions', () => {
  const current = async () => (await db.query('SELECT body FROM admin.shipping_instructions WHERE archived_at IS NULL')).rows.map((r) => r.body);
  const set = (body) => db.query('SELECT admin.set_shipping_instructions($1)', [body]);

  test('every signed-in role reads the current text', async () => {
    for (const u of [U.aReq, U.aView, U.bReq, U.operator, U.member]) {
      await as(db, u);
      expect(await current(), u).toEqual(['Ship on dry ice, Monday to Wednesday, to the synthetic lab address.']);
    }
  });

  test('owner and admin replace it; the earlier text is kept archived and every change is audited', async () => {
    await as(db, U.owner);
    await set('  First synthetic text.  ');
    await as(db, U.admin);
    await set('Second synthetic text.');
    expect(await current()).toEqual(['Second synthetic text.']);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.shipping_instructions WHERE archived_reason = 'replaced'")).toBe(2);
    expect(await count(db, "SELECT 1 FROM admin.audit_event WHERE entity = 'shipping_instructions' AND action = 'INSERT' AND actor = $1", [U.owner])).toBe(1);
    expect((await db.query('SELECT set_by FROM admin.shipping_instructions WHERE archived_at IS NULL')).rows).toEqual([{ set_by: U.admin }]);
  });

  test('a blank text clears it', async () => {
    await as(db, U.admin);
    await set('   ');
    expect(await current()).toEqual([]);
    await as(db, null);
    expect(await count(db, "SELECT 1 FROM admin.shipping_instructions WHERE archived_reason = 'cleared'")).toBe(1);
  });

  test('refuses operators, lab members and client roles; refuses a text over 2000 characters', async () => {
    for (const u of [U.operator, U.member, U.aAdmin, U.aReq, U.aView]) {
      await as(db, u);
      await expect(set('Not allowed'), u).rejects.toMatchObject({ code: '42501' });
    }
    await as(db, U.owner);
    await expect(set('x'.repeat(2001))).rejects.toMatchObject({ code: '22023' });
    expect(await current()).toEqual(['Ship on dry ice, Monday to Wednesday, to the synthetic lab address.']);
  });

  test('no direct writes for anyone through the app role', async () => {
    for (const u of [U.owner, U.aReq]) {
      await as(db, u);
      await expect(db.query("INSERT INTO admin.shipping_instructions(body) VALUES ('direct')"), u).rejects.toThrow(/permission denied/);
      await expect(db.query("UPDATE admin.shipping_instructions SET body = 'direct'"), u).rejects.toThrow(/permission denied/);
    }
  });
});

describe('function definitions', () => {
  test('SECURITY DEFINER, search_path pinned; executable by authenticated, not by anon; the lock helper is not granted', async () => {
    await as(db, null);
    const sigs = ['admin.request_order(uuid, uuid, text, text, int, text, text)', 'admin.accept_order(uuid, uuid)', 'admin.decline_order(uuid, text)',
      'admin.set_shipping_instructions(text)', 'admin.receive_shipment(uuid, text, text, text, int, text)'];
    for (const sig of sigs) {
      const f = (await db.query(`SELECT prosecdef, proconfig, has_function_privilege('authenticated', oid, 'EXECUTE') AS app,
        has_function_privilege('anon', oid, 'EXECUTE') AS anon FROM pg_proc WHERE oid = '${sig}'::regprocedure`)).rows[0];
      expect(f.prosecdef, sig).toBe(true);
      expect(f.proconfig.join(), sig).toMatch(/^search_path=pg_catalog, ?admin$/);
      expect({ app: f.app, anon: f.anon }, sig).toEqual({ app: true, anon: false });
    }
    const lock = (await db.query("SELECT has_function_privilege('authenticated', 'admin.lock_pending_order(uuid)', 'EXECUTE') AS app")).rows[0];
    expect(lock.app).toBe(false);
  });
});
