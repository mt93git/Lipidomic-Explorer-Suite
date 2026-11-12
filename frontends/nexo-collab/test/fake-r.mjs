import { createServer } from 'node:http';

// Script responses at the HTTP boundary; all requests remain available for assertions. `seen(match, from)` resolves
// with the first call at or after index `from` that matches, already received or still to come. `log` records each
// request's arrival ('in <path>') and answer ('out <path>') in order. A saved checkpoint (`checkpoint.<n>`) keeps its
// canvas and nexo, and opening it answers them, as R does; a scripted reply without a body (headers only) keeps that answer,
// and `raw` sends that text as the body instead of JSON ('' for an empty answer).
export async function fakeR() {
  const calls = [], replies = [], waiting = [], log = [];
  const saved = new Map();
  let opens = 0;
  const server = createServer(async (req, res) => {
    log.push(`in ${req.url}`);
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls.push({ path: req.url, method: req.method, body: raw ? JSON.parse(raw) : null, token: req.headers['x-nexo-service-token'],
      intent: req.headers['x-nexo-intent'] });
    for (const wait of waiting.splice(0)) if (!wait(calls.length - 1)) waiting.push(wait);
    const scripted = replies.shift();
    let body = {};
    const sent = calls.at(-1).body;
    if (req.url === '/api/v1/sessions' || req.url === '/api/v1/datasets/sessions') {
      opens++; body = { sessionId: `generation.${opens}`, generation: 'generation', engineRevision: opens, ...saved.get(sent.checkpointId) };
    }
    if (req.method === 'POST' && req.url.endsWith('/checkpoints') && !scripted?.body) {
      body = { id: `checkpoint.${saved.size + 1}` };
      saved.set(body.id, { canvas: sent.canvas.state, nexo: sent.nexo });
    }
    res.writeHead(scripted?.status ?? 200, { 'Content-Type': 'application/json', ...scripted?.headers });
    log.push(`out ${req.url}`);
    res.end(scripted && 'raw' in scripted ? scripted.raw : JSON.stringify(scripted?.body ?? body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const seen = (match, from = 0) => new Promise(resolve => {
    const wait = i => i >= from && match(calls[i]) && (resolve(calls[i]), true);
    if (!calls.some((_, i) => wait(i))) waiting.push(wait);
  });
  return { url: `http://127.0.0.1:${server.address().port}`, calls, replies, seen, log,
    close: () => new Promise(resolve => server.close(resolve)) };
}
