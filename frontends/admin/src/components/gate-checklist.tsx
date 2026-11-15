import type { Gate } from "@/lib/models";

const labels = { ok: "OK", fail: "Failed", pending: "Pending" };
const symbols = { ok: "✓", fail: "!", pending: "·" };

export function GateChecklist({ gates }: { gates: Gate[] }) {
  return <ul className="checklist" aria-label="Next gate checklist">{gates.map(gate => <li className="check-row" key={gate.label}>
    <span className={`check-status ${gate.status}`} aria-hidden="true">{symbols[gate.status]}</span><span className="check-label">{gate.label}</span><span className="check-word">{labels[gate.status]}</span>
  </li>)}</ul>;
}
