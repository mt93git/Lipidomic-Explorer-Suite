import type { Metadata } from "next";
import { proposeCleanNames, ruleLabel } from "@lipidomic/admin-ingest";
import { requireWorkspace } from "@/lib/session";
import { getNameDictionary } from "@/lib/data/results";
import { unmappedAnalytes } from "@/lib/results";
import { EntryForm } from "./entry-form";
import { ProposalTable } from "./proposal-table";
import styles from "../ingest-results/results.module.css";

export const metadata: Metadata = { title: "Name dictionary" };

// Lab-wide clean names for SCIEX export names (prototype a13). Names of the last parsed file that the dictionary does
// not map yet get a rule-based proposal; a person approves it, one by one or all at once. Names no rule settles go
// to a chemist. Raw SCIEX names and peak areas stay unchanged: the dictionary only says how a name is shown.
export default async function NameDictionaryPage() {
  await requireWorkspace("staff");
  const { entries, analytes } = await getNameDictionary();
  const missing = unmappedAnalytes(analytes, entries);
  const summary = proposeCleanNames(missing);
  const proposals = summary.proposals.map(p => ({ exportName: p.exportName, proposed: p.proposed, rule: ruleLabel(p.rules), needsChemist: p.needsChemist }));
  const mapped = analytes.length ? new Set(analytes).size - missing.length : entries.length;
  return <>
    <ProposalTable proposals={proposals} mapped={mapped} classesRenamed={summary.classesRenamed} hasFile={analytes.length > 0} />
    <div className={styles.content} style={{ marginTop: 28 }}>
      <details className="panel">
        <summary><strong>Dictionary entries · {entries.length}</strong> <span className="muted">— edit an entry, or add a name by hand</span></summary>
        {!entries.length
          ? <p className="empty-state">No names added yet. Approve proposals above, import a list, or add the first one below.</p>
          : <div className={styles.scroll}><table className={styles.entries} aria-label="Dictionary entries">
            <thead><tr><th scope="col">SCIEX export name</th><th scope="col">Clean name</th><th scope="col">Rule</th><th scope="col"><span className="sr-only">Edit</span></th></tr></thead>
            <tbody>{entries.map(entry => <tr key={entry.id}><td className="mono">{entry.export_name}</td><td className="mono">{entry.clean_name}</td><td>{entry.rule ?? "by hand"}</td><td><details><summary>Edit entry</summary><EntryForm entry={entry} /></details></td></tr>)}</tbody>
          </table></div>}
        <section aria-labelledby="add-title" style={{ marginTop: 20 }}>
          <h2 id="add-title">Add a name</h2>
          <EntryForm />
        </section>
      </details>
    </div>
  </>;
}
