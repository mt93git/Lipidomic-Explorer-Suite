import { useEffect, useRef, useState } from 'react';
import { uploadDataset, type UploadAnswers, type UploadChoice } from '../../api/datasetUpload';
import './UploadDataset.css';
export function UploadDataset({ onUploaded, onCancel, workspace }: { onUploaded(adminDatasetId: string): void; onCancel(): void; workspace?: string }) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  dialog.current?.showModal();
  return () => { dialog.current?.close(); previous?.focus(); };
 }, []);
 const [file, setFile] = useState<File>();
 const [metadataFile, setMetadataFile] = useState<File>();
 const [choices, setChoices] = useState<UploadAnswers>({});
 const [missing, setMissing] = useState<UploadChoice[]>([]);
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function submit() {
  if (!file || busy) return;
  setBusy(true); setError('');
  try {
   const result = await uploadDataset(file, choices, workspace, metadataFile);
   if (result.status === 'ready') onUploaded(result.adminDatasetId);
   else setMissing(result.missing);
  } catch (e) { setError((e as Error).message); }
  finally { setBusy(false); }
 }
 return <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }} className="upload-dataset" role="dialog" aria-modal="true" aria-labelledby="upload-dataset-title">
  <h2 id="upload-dataset-title">Upload an Excel workbook</h2>
  <p>Add an extra dataset, then prepare it with Team’s settings.</p>
  <form onSubmit={e => { e.preventDefault(); void submit(); }}>
   <label>Excel workbook<input type="file" accept=".xlsx,.xls" disabled={busy} required onChange={e => { setFile(e.target.files?.[0]); setChoices({}); setMissing([]); setError(''); }} /></label>
   <label>Sample labels (optional)<input type="file" accept=".csv,.tsv,.txt,.xlsx" disabled={busy} onChange={e => { setMetadataFile(e.target.files?.[0]); setChoices({}); setMissing([]); setError(''); }} /></label>
   {missing.map(choice => <label key={choice.name}>{choice.label}<select required value={typeof choices[choice.name] === 'string' ? choices[choice.name] as string : ''} disabled={busy} onChange={e => setChoices({ ...choices, [choice.name]: e.target.value })}>
    <option value="">Choose an option</option>{choice.choices.map(value => <option key={value} value={value}>{value === '__none__' ? 'Continue without sample labels' : value === '__all__' ? 'All sheets combined' : value}</option>)}
   </select></label>)}
   {error && <p role="alert">{error}</p>}
   {busy && <p role="status">Reading workbook…</p>}
   <footer><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={!file || busy}>Continue</button></footer>
  </form>
 </dialog>;
}
