import { describe, expect, it } from 'vitest';
import { proposeCleanName, proposeCleanNames, ruleLabel } from '../src/index.js';

const cases: [string, string, string, boolean][] = [
  ['CE 24:4 +NH4', 'CE(24:4)+NH4', 'spacing', false],
  ['Cer(d19:1/20:0)+ H', 'Cer(d19:1/20:0)+H', 'spacing', false],
  ['CER(d18:0/14:0)+H', 'Cer(d18:0/14:0)+H', 'class spelling', false],
  ['GluCer(d18:1-d7/15:0)+H_Sigma.IS', 'GlcCer(d18:1-d7/15:0)+H', 'ISTD · class spelling', false],
  ['DG(17:0-16:1)+NH4_d5_..IS', 'DAG(17:0_16:1)+NH4 d5', 'ISTD · class + separator', false],
  ['DAG(20:0_20:4)+NH4 b', 'DAG(20:0_20:4)+NH4 [isomer b]', 'needs chemist', true],
  ['ACar 4:0', 'ACar(4:0)', 'spacing · no adduct in name', true],
];

describe('proposeCleanName', () => {
  it.each(cases)('%s → %s (%s)', (raw, proposed, rule, chemist) => {
    const result = proposeCleanName(raw);
    expect(result.proposed).toBe(proposed);
    expect(ruleLabel(result.rules)).toBe(rule);
    expect(result.needsChemist).toBe(chemist);
    expect(result.exportName).toBe(raw);
  });
  it('handles every ISTD suffix form and keeps the chain untouched', () => {
    for (const raw of ['PC(15:0_18:1)+H.IS', 'PC(15:0_18:1)+H_IS', 'PC(15:0_18:1)+H_SPLASH.IS', 'PC(15:0_18:1)+H_Ultimate_SPLASH_ONE.IS', 'PC(15:0_18:1)+H (IS)']) {
      expect(proposeCleanName(raw)).toMatchObject({ proposed: 'PC(15:0_18:1)+H', rules: ['ISTD'], needsChemist: false });
    }
  });
  it('leaves a clean name as it is and says so', () => {
    expect(proposeCleanName('PC(14:0_16:0)+AcO')).toEqual({ exportName: 'PC(14:0_16:0)+AcO', proposed: 'PC(14:0_16:0)+AcO', rules: ['already clean'], needsChemist: false });
  });
  it('does not turn a deuterium label into a separator', () => {
    expect(proposeCleanName('Cer(d18:1-d7/15:0)+H').rules).toEqual(['already clean']);
  });
  it('marks names no rule understands for a chemist', () => {
    for (const raw of ['Synthetic lipid 1', 'unknown peak 12.3', 'PC(34:1']) expect(proposeCleanName(raw)).toMatchObject({ needsChemist: true });
    expect(proposeCleanName('Synthetic lipid 1').rules).toEqual(['not recognised']);
  });
  it('summarises a list: approvable, for a chemist, distinct class renames', () => {
    const summary = proposeCleanNames([...cases.map(c => c[0]), 'CER(d18:1/16:0)+H', 'CE 24:4 +NH4']);
    expect(summary.proposals).toHaveLength(8);
    expect(summary.approvable).toBe(6);
    expect(summary.needsChemist).toBe(2);
    expect(summary.classesRenamed).toEqual([{ from: 'CER', to: 'Cer' }, { from: 'GluCer', to: 'GlcCer' }, { from: 'DG', to: 'DAG' }]);
  });
});
