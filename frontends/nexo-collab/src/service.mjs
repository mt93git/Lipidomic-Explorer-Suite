import { createHmac } from 'node:crypto';

/** Short lived identity scoped to this project's workspace; never relay a person's token to R. */
export function serviceToken({ workspace, project, actor, secret = process.env.NEXO_SERVICE_SECRET, now = Math.floor(Date.now() / 1000) }) {
  if (!secret) throw new Error('NEXO_SERVICE_SECRET is required');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'nexo-collab', aud: 'nexo-api', sub: 'service', workspace, project, actor, exp: now + 45,
  })}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
