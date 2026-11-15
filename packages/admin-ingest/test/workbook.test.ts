import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildDatasetV1, classify, parseSciexTxt } from '../src/index.js';
const sourceText = readFileSync(new URL('./fixtures/sciex-synthetic.txt', import.meta.url), 'utf8');
const classified = () => classify(parseSciexTxt(sourceText));
const provenance = { sourceText, datasetVersion: 'synthetic-v1', sciexOsVersion: 'synthetic', processingMethod: 'Synthetic method', signatures: ['Synthetic signer A', 'Synthetic signer B'] };
const metadata = ['S1','S2','S3'].map((sampleName,i) => ({ sampleName, FullName: `Group_${i+1}`, Group1Term: 'Group', Group2Term: 'Cohort', ReplicateTerm: i+1, PatientTerm: `P${i+1}`, TimePointTerm: '0h' }));
async function read(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as Parameters<typeof book.xlsx.load>[0]);
  return book;
}
describe('buildDatasetV1', () => {
  it('round-trips every abundance cell exactly, preserving nulls and zero', async () => {
    const input = classified(); const before = structuredClone(input);
    const bytes = await buildDatasetV1(input, { headerMode: 'sampleName', provenance });
    expect(Buffer.isBuffer(bytes)).toBe(true);
    const book = await read(bytes);
    expect(book.worksheets.map(s => s.name)).toEqual(['Abundance','Metadata','Internal_Standards','QC_Injections','Provenance']);
    const sheet = book.getWorksheet('Abundance')!;
    expect(sheet.getRow(1).values).toEqual([,'Lipid','S1','S2','S3']);
    input.lipids.forEach((row, index) => {
      expect(sheet.getCell(index+2,1).value).toBe(row.name);
      row.values.forEach((value,col) => expect(sheet.getCell(index+2,col+2).value).toBe(value));
    });
    expect(sheet.rowCount).toBe(34);
    expect(sheet.columnCount).toBe(4);
    expect(book.getWorksheet('Internal_Standards')!.rowCount).toBe(7);
    expect(book.getWorksheet('Internal_Standards')!.getRow(1).values).toEqual([,'Lipid','S1','S2','S3']);
    input.internalStandards.forEach((row, r) => row.values.forEach((value,c) => expect(book.getWorksheet('Internal_Standards')!.getCell(r+2,c+2).value).toBe(value)));
    const qc = book.getWorksheet('QC_Injections')!;
    expect(qc.getRow(1).values).toEqual([,'Lipid','BLANK1','QC1']);
    input.qcInjections.analytes.forEach((row,r) => row.values.forEach((value,c) => expect(qc.getCell(r+2,c+2).value).toBe(value)));
    expect(book.getWorksheet('Metadata')!.getRow(1).values).toEqual([,'FullName','Group1Term','Group2Term','ReplicateTerm','PatientTerm','TimePointTerm']);
    expect(book.getWorksheet('Metadata')!.getCell('A2').value).toBe('S1');
    expect(input).toEqual(before);
  });
  it('writes complete provenance, hashing exact source bytes including BOM/CRLF', async () => {
    const exactSource = '\uFEFF' + sourceText.replace(/\n/g,'\r\n');
    const book = await read(await buildDatasetV1(classified(), { headerMode: 'sampleName', provenance: { ...provenance, sourceText: exactSource } }));
    const sheet = book.getWorksheet('Provenance')!;
    const values: Record<string, unknown> = {};
    sheet.eachRow((row, i) => { if(i > 1) values[String(row.getCell(1).value)] = row.getCell(2).value; });
    expect(values.dataset_format).toBe(1);
    expect(values.dataset_version).toBe('synthetic-v1');
    expect(values.source_txt_sha256).toBe(createHash('sha256').update(exactSource,'utf8').digest('hex'));
    expect(values.sciex_os_version).toBe('synthetic');
    expect(values.processing_method).toBe('Synthetic method');
    expect(values.value_type).toBe('raw peak area');
    expect(JSON.parse(String(values.exclusions))).toEqual(['DAG(20:0_20:4)+NH4 b']);
    expect(String(values.filters)).toContain('Unknown');
    expect(JSON.parse(String(values.signatures))).toEqual(provenance.signatures);
  });
  it('renames included sample headers via metadata and aligns the six metadata columns', async () => {
    const book = await read(await buildDatasetV1(classified(), { metadata: [...metadata].reverse(), headerMode: 'fullName', provenance }));
    expect(book.getWorksheet('Abundance')!.getRow(1).values).toEqual([,'Lipid','Group_1','Group_2','Group_3']);
    expect(book.getWorksheet('Internal_Standards')!.getRow(1).values).toEqual([,'Lipid','Group_1','Group_2','Group_3']);
    expect(book.getWorksheet('Metadata')!.getRow(2).values).toEqual([,'Group_1','Group','Cohort',1,'P1','0h']);
    expect(book.getWorksheet('QC_Injections')!.getRow(1).values).toEqual([,'Lipid','BLANK1','QC1']);
  });
  it('keeps sampleName metadata aligned even when supplied FullNames differ', async () => {
    const book = await read(await buildDatasetV1(classified(), { metadata, headerMode: 'sampleName', provenance }));
    expect(book.getWorksheet('Metadata')!.getCell('A2').value).toBe('S1');
    expect(book.getWorksheet('Metadata')!.getCell('B2').value).toBe('Group');
  });
  it('rejects missing, empty, duplicated FullNames and duplicated metadata keys', async () => {
    for (const bad of [undefined, metadata.slice(1), metadata.map((r,i)=>({...r, FullName:i===0?'':r.FullName})), metadata.map(r=>({...r,FullName:'Same'})), [...metadata, metadata[0]!]]) {
      await expect(buildDatasetV1(classified(), { ...(bad ? { metadata: bad } : {}), headerMode: 'fullName', provenance })).rejects.toThrow(/metadata|FullName/i);
    }
  });
  it('rejects duplicate sample headers in either mode', async () => {
    const c=classified(); c.samples[1]!.name='S1';
    await expect(buildDatasetV1(c, { headerMode: 'sampleName', provenance })).rejects.toThrow(/duplicat/i);
  });
});
