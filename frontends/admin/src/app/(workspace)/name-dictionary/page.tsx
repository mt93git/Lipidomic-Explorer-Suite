import Link from "next/link";
import { getNameDictionary } from "@/lib/data/results";
import { unmappedAnalytes } from "@/lib/results";
import { EntryForm } from "./entry-form";
import styles from "../ingest-results/results.module.css";
export default async function NameDictionaryPage() {
  const { entries, analytes } = await getNameDictionary();
  const missing = unmappedAnalytes(analytes, entries);
  return <><div className="page-heading"><div><h1>Name dictionary</h1><p>Lab-wide clean names. Raw SCIEX names and measurements stay unchanged.</p></div><Link href="/ingest-results">Ingest results</Link></div>
    <div className={styles.content}><section className={styles.panel}><h2>Entries</h2>
      {!entries.length ? <p>No names added yet.</p> : <table><thead><tr><th>SCIEX export name</th><th>Clean name</th><th>Edit</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td className="mono">{entry.export_name}</td><td>{entry.clean_name}</td><td><details><summary>Edit entry</summary><EntryForm entry={entry} /></details></td></tr>)}</tbody></table>}
    </section><section className={styles.panel}><h2>Add a name</h2><EntryForm /></section>
    <section className={styles.panel}><h2>Unmapped analytes from the last file</h2><p>{missing.length} without a clean name</p>{!analytes.length ? <p>Upload a results file first. The last file is retained for one hour in this session.</p> : <ul>{missing.map(name => <li className="mono" key={name}>{name}</li>)}</ul>}</section></div></>;
}
