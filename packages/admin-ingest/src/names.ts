/**
 * Rule-based clean-name proposals for SCIEX export names that the lab dictionary does not map yet.
 * Pure: it only proposes a display name. Raw export names and peak areas are never changed, and a
 * proposal reaches the dictionary only when a person approves it.
 */

export type NameRule = 'spacing' | 'class spelling' | 'separator' | 'ISTD' | 'no adduct in name' | 'needs chemist' | 'not recognised' | 'already clean';

export interface NameProposal {
  exportName: string;
  proposed: string;
  /** In the order they were applied. */
  rules: NameRule[];
  /** True when no rule settles the name: a chemist decides it. */
  needsChemist: boolean;
  /** Class rename applied, e.g. { from: 'DG', to: 'DAG' }. */
  classRename?: { from: string; to: string };
}

/** Spellings seen in SCIEX exports → the lab's class name. Only exact class tokens are renamed. */
export const CLASS_SPELLINGS: Readonly<Record<string, string>> = Object.freeze({
  CER: 'Cer', GluCer: 'GlcCer', GLUCER: 'GlcCer', GlcCER: 'GlcCer', HexCER: 'HexCer', HEXCER: 'HexCer',
  DG: 'DAG', TG: 'TAG', MG: 'MAG',
});

const CHAIN = String.raw`(?:[dmt]|[OP]-)?\d+:\d+(?:;O\d*)?`;
const CHAINS = String.raw`${CHAIN}(?:[_/-]${CHAIN})*`;
const KITS = 'Ultimate_SPLASH_ONE|SphingoSPLASH_ONE|SPLASH|Sigma';
const ISTD_SUFFIX = new RegExp(String.raw`(?:_(?:${KITS}))?(?:_?\.{1,2}IS|_IS|\s*\(IS\))$`);
const CANONICAL = /^[A-Za-z][A-Za-z0-9]*\([^()\s]+\)[+-][A-Za-z0-9]+(?: d\d+)?(?: \[isomer [a-z]\])?$/;

export function proposeCleanName(exportName: string): NameProposal {
  const rules: NameRule[] = [];
  const add = (rule: NameRule) => { if (!rules.includes(rule)) rules.push(rule); };
  let name = exportName.trim();
  let label = '';
  let classRename: NameProposal['classRename'];

  // ISTD suffix (.IS, _IS, _<kit>.IS, _..IS, (IS)); a trailing deuterium label (_d5) is kept as " d5".
  if (ISTD_SUFFIX.test(name)) {
    name = name.replace(ISTD_SUFFIX, '');
    const deuterium = name.match(/_(d\d+)$/);
    if (deuterium) { label = ` ${deuterium[1]}`; name = name.slice(0, -deuterium[0].length); }
    add('ISTD');
  }

  // Spacing: "CE 24:4 +NH4" → "CE(24:4)+NH4", "Cer(d19:1/20:0)+ H" → "Cer(d19:1/20:0)+H".
  const spaced = name.replace(/\s+/g, ' ')
    .replace(new RegExp(String.raw`^([A-Za-z][A-Za-z0-9]*) (${CHAINS})(?=[\s+]|$)`), '$1($2)')
    .replace(/^([A-Za-z][A-Za-z0-9]*) \(/, '$1(')
    .replace(/\) ?([+-]) ?([A-Za-z0-9]+)/, ')$1$2');
  if (spaced !== name) { name = spaced; add('spacing'); }

  // Class spelling: the token before "(".
  const classMatch = name.match(/^([A-Za-z][A-Za-z0-9]*)\(/);
  if (classMatch) {
    const spelling = CLASS_SPELLINGS[classMatch[1]!];
    if (spelling && spelling !== classMatch[1]) {
      classRename = { from: classMatch[1]!, to: spelling };
      name = spelling + name.slice(classMatch[1]!.length);
      add('class spelling');
    }
  }

  // Separator: an acyl-chain dash between two chains becomes "_" (deuterium labels like d18:1-d7 are kept).
  const separated = name.replace(/\(([^()]*)\)/, (_whole, inside: string) => {
    let out = inside;
    const dash = new RegExp(String.raw`(\d+:\d+(?:;O\d*)?)-((?:[dmt]|[OP]-)?\d+:\d+)`);
    while (dash.test(out)) out = out.replace(dash, '$1_$2');
    return `(${out})`;
  });
  if (separated !== name) { name = separated; add('separator'); }

  let needsChemist = false;
  // Isomer letter after the adduct: which isomer it is is a chemist's call.
  const isomer = name.match(/^(.*\)[+-][A-Za-z0-9]+) ([a-z])$/);
  if (isomer) { name = `${isomer[1]} [isomer ${isomer[2]}]`; add('needs chemist'); needsChemist = true; }
  name += label;

  if (!needsChemist && /^[A-Za-z][A-Za-z0-9]*\([^()]+\)(?: d\d+)?$/.test(name)) { add('no adduct in name'); needsChemist = true; }
  if (!needsChemist && !CANONICAL.test(name)) { add('not recognised'); needsChemist = true; }
  if (!rules.length) add('already clean');
  return { exportName, proposed: name, rules, needsChemist, ...(classRename ? { classRename } : {}) };
}

/** "class spelling" + "separator" read as "class + separator"; the rest are joined with " · ". */
export function ruleLabel(rules: readonly NameRule[]): string {
  const parts: string[] = [...rules];
  const cls = parts.indexOf('class spelling');
  const sep = parts.indexOf('separator');
  if (cls >= 0 && sep >= 0) { parts[cls] = 'class + separator'; parts.splice(sep, 1); }
  return parts.join(' · ');
}

export interface NameProposalSummary {
  proposals: NameProposal[];
  approvable: number;
  needsChemist: number;
  /** Distinct class renames among the proposals, e.g. DG → DAG. */
  classesRenamed: { from: string; to: string }[];
}

export function proposeCleanNames(exportNames: readonly string[]): NameProposalSummary {
  const proposals = [...new Set(exportNames)].map(proposeCleanName);
  const renames = new Map<string, { from: string; to: string }>();
  for (const p of proposals) if (p.classRename) renames.set(p.classRename.from, p.classRename);
  return {
    proposals,
    approvable: proposals.filter(p => !p.needsChemist).length,
    needsChemist: proposals.filter(p => p.needsChemist).length,
    classesRenamed: [...renames.values()],
  };
}
