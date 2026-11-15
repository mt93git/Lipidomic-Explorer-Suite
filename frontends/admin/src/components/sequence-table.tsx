import type { Injection } from "@/lib/batch";

const typeLabel = { Unknown: "Sample", Blank: "Blank", "Quality Control": "Pooled QC" } as const;

// The injection list in run order. `detail` says which registry sample a row is (controls have none).
export function SequenceTable<Row extends Injection>({ rows, detail, label }: { rows: readonly Row[]; detail: (row: Row) => string; label: string }) {
  return <div className="grid-frame"><div className="grid-scroll" role="region" aria-label={`${label} (scrolls)`} tabIndex={0}>
    <table className="registry-table registered" aria-label={label}>
      <thead><tr><th scope="col">Seq</th><th scope="col">Plate · well</th><th scope="col">Type</th><th scope="col">Injection name</th><th scope="col">Sample</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.seq}>
        <td className="mono">{row.seq}</td><td className="mono">{row.plate} · {row.vial}</td><td>{typeLabel[row.sample_type]}</td>
        <td className="mono">{row.sample_name}</td><td>{detail(row)}</td>
      </tr>)}</tbody>
    </table>
  </div></div>;
}
