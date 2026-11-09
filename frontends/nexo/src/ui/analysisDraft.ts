import type { AnalysisSettings, Inputs } from '../api';
import { coerceValue } from './forms/schemaForm';
export function conditionVisible(condition: string | null | undefined, values: Inputs): boolean {
 const match = condition?.match(/^\s*input\.([\w]+)\s*==\s*(?:'([^']*)'|(true|false))\s*$/);
 if (!match) return true;
 return values[match[1]] === (match[3] ? match[3] === 'true' : match[2]);
}
export function analysisValues(settings: AnalysisSettings): Inputs {
 return Object.fromEntries(settings.sections.flatMap(section => section.controls.map(c => [c.id, coerceValue(c, c.value ?? c.default ?? (c.multiple || c.type === 'multiselect' || c.type === 'checkboxgroup' ? [] : c.type === 'boolean' ? false : ''))])));
}
export interface AnalysisDraft { applied: Inputs; draft: Inputs }
export function analysisReducer(state: AnalysisDraft, action: {type:'change'|'apply'; inputs:Inputs} | {type:'discard'}): AnalysisDraft {
 if (action.type === 'discard') return {...state, draft: structuredClone(state.applied)};
 if (action.type === 'apply') return {applied:structuredClone(action.inputs),draft:structuredClone(action.inputs)};
 return {...state,draft:{...state.draft,...action.inputs}};
}
