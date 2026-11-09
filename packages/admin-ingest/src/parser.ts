import type { ParsedSciex } from './types.js';

/** Iterates lines without allocating an additional array for the whole file. */
function* lines(text: string): Generator<string, void, unknown> {
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (start < text.length) {
    const end = text.indexOf('\n', start);
    const stop = end < 0 ? text.length : end;
    yield text.slice(start, text[stop - 1] === '\r' ? stop - 1 : stop);
    if (end < 0) return;
    start = end + 1;
  }
}

const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** Parse a UTF-8 SCIEX OS TSV export; rejects malformed rows rather than losing cells. */
export function parseSciexTxt(text: string): ParsedSciex {
  const iterator = lines(text);
  const names = (iterator.next().value ?? '').split('\t');
  if (names[0] !== 'Sample Name') throw new Error('Row 1 must begin with "Sample Name".');
  const types = (iterator.next().value ?? '').split('\t');
  if (types[0] !== 'Sample Type') throw new Error('Row 2 must begin with "Sample Type".');
  if (names.length < 2) throw new Error('Row 1 must contain at least one sample column.');
  if (types.length !== names.length) throw new Error(`Row 2 has ${types.length} columns; expected ${names.length}.`);
  const samples = names.slice(1).map((name, index) => {
    if (!name.trim()) throw new Error(`Row 1 has an empty sample name at column ${index + 2}.`);
    const type = types[index + 1]!;
    if (!type.trim()) throw new Error(`Row 2 has an empty Sample Type at column ${index + 2}.`);
    return { name, type };
  });
  const analytes: ParsedSciex['analytes'] = [];
  let row = 2;
  for (const line of iterator) {
    row++;
    const fields = line.split('\t');
    if (fields.length !== names.length) throw new Error(`Row ${row} has ${fields.length} columns; expected ${names.length}.`);
    const name = fields[0]!;
    if (!name.trim()) throw new Error(`Row ${row} has an empty analyte name.`);
    const values = fields.slice(1).map((field, index) => {
      const value = field.trim();
      if (value === '' || value === 'N/A') return null;
      const result = Number(value);
      if (!numeric.test(value) || !Number.isFinite(result)) {
        throw new Error(`Row ${row}, column ${index + 2} (${samples[index]!.name}): expected a finite numeric peak area, N/A, or empty cell; got "${field}".`);
      }
      return result;
    });
    analytes.push({ name, values });
  }
  return { samples, analytes };
}
