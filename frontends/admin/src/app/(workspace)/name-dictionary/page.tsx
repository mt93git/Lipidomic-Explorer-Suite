import type { Metadata } from "next";
import { requireWorkspace } from "@/lib/session";
import Link from "@/components/app-link";
import { getNameDictionary } from "@/lib/data/results";
import { unmappedAnalytes } from "@/lib/results";
import { EntryForm } from "./entry-form";
import { UnmappedTable } from "./unmapped-table";
import styles from "../ingest-results/results.module.css";

export const metadata: Metadata = { title: "Name dictionary" };

// Lab-wide clean names for SCIEX export names. The last parsed file shows which analytes still have none.
export default async function NameDictionaryPage() {
  await requireWorkspace("staff");
  const { entries, analytes } = await getNameDictionary();
  const missing = unmappedAnalytes(analytes, entries);
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow"><Link href="/pipeline">Lab work / Pipeline</Link> / <Link href="/ingest-results">Ingest results</Link> / Name dictionary</div>
        <h1>Name dictionary</h1>
        <p>Lab-wide clean names. Raw SCIEX names and measurements stay unchanged.</p>
      </div>
      <div className="heading-actions">
        <Link className="button secondary" href="/ingest-results">Ingest results</Link>
        <Link className="button secondary" href="/pipeline">← Back to pipeline</Link>
      </div>
    </div>
    <div className={styles.content}>
      <section className="panel" aria-labelledby="entries-title">
        <div className="eyebrow">Lab-wide</div>
        <h2 id="entries-title">Entries{entries.length ? ` · ${entries.length}` : ""}</h2>
        {!entries.length
          ? <p className="empty-state">No names added yet. Add the first one below.</p>
          : <div className={styles.scroll}><table className={styles.entries} aria-label="Dictionary entries">
            <thead><tr><th scope="col">SCIEX export name</th><th scope="col">Clean name</th><th scope="col"><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>{entries.map(entry => <tr key={entry.id}><td className="mono">{entry.export_name}</td><td>{entry.clean_name}</td><td><details><summary>Edit entry</summary><EntryForm entry={entry} /></details></td></tr>)}</tbody>
          </table></div>}
      </section>
      <section className="panel" aria-labelledby="add-title">
        <div className="eyebrow">New mapping</div>
        <h2 id="add-title">Add a name</h2>
        <EntryForm />
      </section>
      <UnmappedTable analytes={missing} hasFile={analytes.length > 0} />
    </div>
  </>;
}
