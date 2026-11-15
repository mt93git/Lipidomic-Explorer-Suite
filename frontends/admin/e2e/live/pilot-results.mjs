// The pilot's results file (e2e/live/pilot.spec.ts): the synthetic SCIEX export
// (packages/admin-ingest/test/fixtures/sciex-synthetic.txt, injections S1–S3, one blank, one QC) renamed to the
// injections of the batch the pilot planned, the way SCIEX OS would name them after running that sequence. Unknown
// columns become the sample code (ORD123-S001), found through the bench sheet's FullName (the fixture's names are the
// registered FullNames); the blank and the QC take the batch's control names in sequence order. Only the Sample Name
// row changes. Test helper only: never used by the app.

/** RFC 4180 records (quoted cells, CRLF or LF), as src/lib/batch/csv.ts writes them; header row → objects. */
function records(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...body] = rows.filter(r => r.some(Boolean));
  return body.map(r => Object.fromEntries(header.map((name, i) => [name, r[i] ?? ""])));
}

/**
 * @param {{ fixture: string, sequence: string, benchSheet: string }} files the TXT, and the batch's two downloaded CSVs
 * @returns {{ text: string, unknownNames: string[] }} the renamed TXT and its Unknown injection names, in file order
 */
export function resultsForBatch({ fixture, sequence, benchSheet }) {
  const codeOf = new Map(records(benchSheet).filter(row => row.sample_type === "Unknown").map(row => [row.FullName, row.sample_name]));
  const steps = records(sequence).sort((a, b) => Number(a.seq) - Number(b.seq));
  const controls = { Blank: steps.filter(row => row.sample_type === "Blank").map(row => row.sample_name),
    "Quality Control": steps.filter(row => row.sample_type === "Quality Control").map(row => row.sample_name) };
  const lines = fixture.split("\n");
  const names = lines[0].replace(/\r$/, "").split("\t");
  const types = (lines.find(line => line.startsWith("Sample Type\t")) ?? "").replace(/\r$/, "").split("\t");
  if (names[0] !== "Sample Name" || types.length !== names.length) throw new Error("pilot results: the fixture has no Sample Name / Sample Type rows");
  const used = new Set();
  const renamed = names.map((name, i) => {
    if (i === 0) return name;
    const type = types[i];
    if (type === "Unknown") {
      const code = codeOf.get(name);
      if (!code) throw new Error(`pilot results: the batch has no sample with FullName ${name}`);
      used.add(code);
      return code;
    }
    const next = controls[type]?.shift();
    if (!next) throw new Error(`pilot results: the batch has no ${type} injection left for ${name}`);
    return next;
  });
  const left = [...codeOf.values()].filter(code => !used.has(code));
  if (left.length) throw new Error(`pilot results: the export has no column for the batch's samples ${left.join(", ")}`);
  lines[0] = renamed.join("\t") + (lines[0].endsWith("\r") ? "\r" : "");
  return { text: lines.join("\n"), unknownNames: renamed.filter((_, i) => types[i] === "Unknown") };
}
