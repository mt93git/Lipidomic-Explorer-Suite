// Chart audit only: serve Nexo at /nexo/ and proxy /api to the synthetic-only audit API
// (RTX :3961, reached on the M1 through a tunnel at 127.0.0.1:3961). One port per batch.
export default { base: '/nexo/', server: { host: '127.0.0.1', port: Number(process.env.NEXO_AUDIT_PORT || 5180), strictPort: true,
  proxy: { '/api': process.env.NEXO_AUDIT_API || 'http://127.0.0.1:3961' } } };
