import Link from "next/link";

export default function NotFound() {
  return <div className="auth-page"><section className="auth-card"><div className="eyebrow">Lipidomic Explorer Admin</div><h1>Page not found</h1><p className="muted">This route or example order is not available.</p><Link className="button" href="/">Back to workspace</Link></section></div>;
}
