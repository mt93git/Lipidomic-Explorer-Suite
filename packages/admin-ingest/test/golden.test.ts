import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { buildDatasetV1, classify, parseSciexTxt } from '../src/index.js';

const txtPath = process.env.ADMIN_GOLDEN_TXT;
const xlsxPath = process.env.ADMIN_GOLDEN_XLSX;

function scalar(cell: ExcelJS.Cell): string | number | null {
  const value = cell.value;
  if (value === null || value === undefined || value === '' || value === 'N/A') return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  throw new Error(`Unsupported reference cell ${cell.address}: ${cell.type}`);
}

// Values keyed by "lipid|sample header" for every data cell of a sheet.
function cellsByKey(sheet: ExcelJS.Worksheet): Map<string, string | number | null> {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { if (col > 1) headers[col] = String(cell.value); });
  const out = new Map<string, string | number | null>();
  for (let row = 2; row <= sheet.rowCount; row++) {
    const lipid = String(sheet.getCell(row, 1).value);
    for (let col = 2; col <= sheet.columnCount; col++) out.set(`${lipid}|${headers[col]}`, scalar(sheet.getCell(row, col)));
  }
  return out;
}

// Today's hand-built workbook keeps every injection as a sample column. Admin moves Blank and
// Quality Control injections to QC_Injections (the real SCD file has one, SCD037_C1), so the
// reference is compared against Abundance and QC_Injections together, keyed by lipid and sample.
it.skipIf(!txtPath || !xlsxPath)('matches private golden sheet 1 cell by cell', async () => {
  const sourceText = await readFile(txtPath!, 'utf8');
  const classified = classify(parseSciexTxt(sourceText));
  const buffer = await buildDatasetV1(classified, {
    headerMode: 'sampleName',
    provenance: { sourceText, datasetVersion: 'golden-comparison' },
  });
  const actualBook = new ExcelJS.Workbook();
  await actualBook.xlsx.load(buffer as unknown as Parameters<typeof actualBook.xlsx.load>[0]);
  const referenceBook = new ExcelJS.Workbook();
  await referenceBook.xlsx.readFile(xlsxPath!);
  const expected = referenceBook.worksheets[0];
  expect(expected, 'Reference workbook needs sheet 1').toBeDefined();
  const abundance = cellsByKey(actualBook.getWorksheet('Abundance')!);
  const qc = cellsByKey(actualBook.getWorksheet('QC_Injections')!);
  const reference = cellsByKey(expected!);
  expect(actualBook.getWorksheet('Abundance')!.rowCount, 'lipid rows').toBe(expected!.rowCount);
  let cells = 0; let numeric = 0; let nulls = 0; let missing = 0; let differences = 0;
  const examples: string[] = [];
  for (const [key, want] of reference) {
    cells++;
    const got = abundance.has(key) ? abundance.get(key) : qc.get(key);
    if (got === undefined) { missing++; if (examples.length < 10) examples.push(`${key}: missing`); continue; }
    if (want === null && got === null) nulls++;
    let equal: boolean;
    if (typeof got === 'number' && typeof want === 'number') {
      numeric++;
      equal = Math.abs(got - want) <= 1e-9 * Math.max(Math.abs(got), Math.abs(want));
    } else {
      equal = got === want;
    }
    if (!equal) { differences++; if (examples.length < 10) examples.push(`${key}: actual=${String(got)} expected=${String(want)}`); }
  }
  console.log(`Golden comparison: cells=${cells} numeric=${numeric} null=${nulls} missing=${missing} differences=${differences}`);
  console.log(`Classification counts: ${JSON.stringify(classified.counts)}`);
  expect(missing, examples.join('\n')).toBe(0);
  expect(differences, examples.join('\n')).toBe(0);
}, 60_000);
