// Chart audit b11 F3: Team's configuration file inputs (the pathway "Upload Layout JSON (.json):", upload_config).
// The file goes to Team's module through the API; the card redraws with what the module made of it.
import { useState } from 'react';
import { uploadCardFile, type CardUpload } from '../../api';
import type { UploadControl } from '../../api/types';
import { checkUploadFile, uploadRefused } from '../../state/layoutUpload';
import { collab } from '../../collab/mode';
export function UploadControls({uploads, sessionId, instanceId, onUploaded, onStatus}: {
  uploads: UploadControl[]; sessionId: string; instanceId: string;
  /** The module took the file: record the instance inputs it set and the file (Nexo's member); redraw the card. */
  onUploaded: (id: string, file: {name: string; content: string}, result: CardUpload) => void; onStatus: (status: string) => void;
}) {
  const [message, setMessage] = useState<Record<string, {text: string; error: boolean}>>({}), [busy, setBusy] = useState(false);
  async function pick(control: UploadControl, input: HTMLInputElement) {
    const chosen = input.files?.[0]; input.value = '';
    if (!chosen) return;
    const say = (text: string, error: boolean) => setMessage(m => ({...m, [control.id]: {text, error}}));
    const refused = checkUploadFile(chosen.name, chosen.size);
    if (refused) { say(refused, true); return; }
    // Progress stays in the field: the card's badge is owned by its render (a refused file never redraws it).
    setBusy(true); say('Uploading…', false);
    try {
      const file = {name: chosen.name, content: await chosen.text()};
      const result = await uploadCardFile(sessionId, instanceId, control.id, file);
      onUploaded(control.id, file, result); say(`Loaded ${file.name}`, false); onStatus('Up to date');
    // A refused file changed nothing: the card stays up to date; only a failed request marks it.
    } catch (error) { say(error instanceof Error ? error.message : String(error), true); onStatus(uploadRefused(error) ? 'Up to date' : 'Update failed'); }
    finally { setBusy(false); }
  }
  // Phase 3 as cut: uploads are not intents yet; on a shared board the control says so.
  const single = collab() !== null;
  return <div className="schema-form upload-controls">{uploads.map(control => { const id = `upload-${instanceId}-${control.id}`, note = single ? {text: 'Uploads are single-user for now', error: false} : message[control.id];
    return <div key={control.id} className="field">
      <label htmlFor={id}>{control.label}</label>
      <input id={id} type="file" accept={control.accept || undefined} disabled={busy || single} aria-describedby={note ? `${id}-note` : undefined}
        onChange={e => void pick(control, e.currentTarget)}/>
      {note && <p id={`${id}-note`} className={note.error ? 'field-error' : 'field-help'} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
    </div>; })}</div>;
}
