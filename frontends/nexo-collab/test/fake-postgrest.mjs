// Fake Admin PostgREST for tests: POST /rpc/nexo_caller answers from `table`, keyed by the Bearer token. The same answer
// at /rest/v1/rpc/nexo_caller, where R asks (frontends/nexo-api/datasets.R api_admin_caller, Supabase URL = `url`).
// A value is the rows to return (200) or an HTTP status (e.g. 401 for an expired token); an unknown token answers 401.
// POST /rpc/nexo_people answers `people[p_client_id]` (or []) to a known token. `calls` records each request's headers
// and body. `dataset = { row, bytes }`, for R's Admin dataset open: nexo_dataset_for_caller answers the row with the
// caller's columns to a known token, nexo_dataset the row, and Storage's admin-files/<row.storage_path> the bytes.
// nexo_datasets_for_caller (C2) answers the row's C2 columns to lab staff and to a member of the row's client, else [].
// Synthetic tokens only.
import { createServer } from 'node:http';

const released = ({ dataset_id, order_code, version, client_id, client_name, released_at, members_prepare }) =>
  ({ dataset_id, order_code, version, client_id, client_name, released_at, members_prepare });

export async function fakePostgrest(table, { people = {}, dataset = null } = {}) {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    calls.push({ method: req.method, url: req.url, headers: req.headers, body });
    // R's Admin client asks under /rest/v1 (its URL is the project base); the sidecar's under the REST base itself.
    const url = req.url.replace(/^\/rest\/v1/, '');
    if (dataset && req.method === 'GET' && url === `/storage/v1/object/authenticated/admin-files/${dataset.row.storage_path}`) {
      res.writeHead(200).end(dataset.bytes); return;
    }
    const answer = req.method !== 'POST' ? 404
      : url === '/rpc/nexo_caller' ? table[token] ?? 401
      : dataset && url === '/rpc/nexo_dataset' ? [dataset.row]
      : dataset && url === '/rpc/nexo_dataset_for_caller' ? (table[token] ? [{ ...dataset.row, caller: table[token][0].caller, caller_view: table[token][0].caller_view }] : 401)
      : url === '/rpc/nexo_datasets_for_caller' ? (table[token] ? (dataset && table[token].some(r => r.caller_view === 'staff' || r.client_id === dataset.row.client_id) ? [released(dataset.row)] : []) : 401)
      : url === '/rpc/nexo_people' ? (table[token] ? people[JSON.parse(body).p_client_id] ?? [] : 401) : 404;
    if (typeof answer === 'number') { res.writeHead(answer).end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(answer));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
