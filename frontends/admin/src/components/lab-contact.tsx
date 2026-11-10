import styles from "./client-portal.module.css";

// The lab's contact for clients (0023, Shipping instructions page): where a client writes when something changed, a
// request is waiting or was declined. Nothing is shown while the lab has not set it. quote: a reference to mention.
export function LabContact({ text, quote }: { text: string | null | undefined; quote?: string | null }) {
  if (!text) return null;
  return <div className={styles.contact} role="note" aria-label="Contact the lab">
    <div className="eyebrow">Contact the lab</div>
    <p>{text}</p>
    {quote && <p className="muted">Quote <span className="mono">{quote}</span> when you write.</p>}
  </div>;
}
