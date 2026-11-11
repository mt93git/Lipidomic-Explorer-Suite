import { datasetTypeLabels, datasetTypes, type Instrument, type PanelRecord } from "@/lib/data/instruments-panels";
import type { LabPerson } from "@/lib/release";
import { DemoActor } from "../people/demo-actor";

const HINT = "Choose a demo Owner or Admin to manage instruments and panels.";

// Edit opens with the focus in the name (the Edit link that opened it is up in the table), as Storage's forms do.
export function InstrumentFields({ instrument, actors }: { instrument?: Instrument; actors: LabPerson[] | null }) {
  const key = instrument ? "edit-instrument" : "new-instrument";
  return <>
    {instrument && <input type="hidden" name="id" value={instrument.id} />}
    <label className="field"><span className="field-label">Instrument name</span><input id={`${key}-name`} name="name" required autoFocus={!!instrument} defaultValue={instrument?.name ?? ""} /></label>
    <label className="field"><span className="field-label">Model</span><input name="model" defaultValue={instrument?.model ?? ""} /></label>
    <label className="field"><span className="field-label">Serial number</span><input name="serialNumber" defaultValue={instrument?.serialNumber ?? ""} /></label>
    <DemoActor actors={actors} id={`${key}-actor`} hint={HINT} />
  </>;
}

// The dataset type decides how a panel's results are read: once an order or a batch uses the panel it stays as it is
// (update_panel refuses a change), so the control is shown fixed and the current value is sent.
export function PanelFields({ panel, instruments, actors }: { panel?: PanelRecord; instruments: Instrument[]; actors: LabPerson[] | null }) {
  const key = panel ? "edit-panel" : "new-panel";
  const choices = instruments.filter(instrument => !instrument.archivedAt || instrument.id === panel?.instrumentId);
  const fixed = !!panel && panel.orderCount + panel.batchCount > 0;
  return <>
    {panel && <input type="hidden" name="id" value={panel.id} />}
    <label className="field"><span className="field-label">Panel name</span><input id={`${key}-name`} name="name" required autoFocus={!!panel} defaultValue={panel?.name ?? ""} /></label>
    <div className="field"><label className="field-label" htmlFor={`${key}-instrument`}>Instrument</label>
      <select id={`${key}-instrument`} name="instrumentId" defaultValue={panel?.instrumentId ?? ""}>
        <option value="">No instrument</option>
        {choices.map(instrument => <option key={instrument.id} value={instrument.id}>{instrument.name}{instrument.archivedAt ? " (archived)" : ""}</option>)}
      </select></div>
    <label className="field"><span className="field-label">LC method</span><input name="lcMethod" defaultValue={panel?.lcMethod ?? ""} /></label>
    <div className="field"><label className="field-label" htmlFor={`${key}-kits`}>ISTD kits</label>
      <input id={`${key}-kits`} name="istdKits" defaultValue={panel?.istdKits.join(", ") ?? ""} aria-describedby={`${key}-kits-hint`} />
      <small id={`${key}-kits-hint`}>Separate kits with commas.</small></div>
    <div className="field"><label className="field-label" htmlFor={`${key}-type`}>Dataset type</label>
      <select id={`${key}-type`} name={fixed ? undefined : "datasetType"} defaultValue={panel?.datasetType ?? "global"} disabled={fixed} aria-describedby={`${key}-type-hint`}>
        {datasetTypes.map(type => <option key={type} value={type}>{datasetTypeLabels[type]}</option>)}
      </select>
      {fixed && <input type="hidden" name="datasetType" value={panel.datasetType} />}
      <small id={`${key}-type-hint`}>{fixed ? "Fixed: orders or batches already use this panel. For another type, create a new panel." : "How the panel's results are read. It cannot change once an order or a batch uses the panel."}</small>
    </div>
    <DemoActor actors={actors} id={`${key}-actor`} hint={HINT} />
  </>;
}
