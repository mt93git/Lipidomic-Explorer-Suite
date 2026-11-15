// Synthetic Group comparison message (made-up groups, classes and values): the shape R sends as
// team-group-comparison-data (R/frontends/team/group_comparison.R), rows column-oriented like Shiny's JSON.
import type {GcMessage} from './model';
const groups = ['Control','Case A','Case B'];
const features = ['PC','PE'];
const samples: Record<string,string[]> = {Control:['S1','S2','S3'],'Case A':['S4','S5','=S6'],'Case B':['S7','S8','S9']};
const p: Record<string,Record<string,number|null>> = {PC:{'Case A':0.012,'Case B':0.31},PE:{'Case A':0.0004,'Case B':null}};
const sig = (v: number|null) => v == null ? null : v < .001 ? '***' : v < .01 ? '**' : v < .05 ? '*' : 'ns';
const cols: Record<string,unknown[]> = {Sample:[],GroupingVal:[],Feature:[],Plot_Value:[],P_Value:[],Significance:[],Is_Baseline:[],X_Grp:[],Facet_Grp:[]};
features.forEach((f,fi) => groups.forEach((g,gi) => samples[g].forEach((s,si) => {
  const base = g === 'Control', pv = base ? null : p[f][g];
  cols.Sample.push(s); cols.GroupingVal.push(g); cols.Feature.push(f);
  cols.Plot_Value.push(Number((gi*.4 - fi*.2 + si*.15 - .2).toFixed(3))); cols.P_Value.push(pv); cols.Significance.push(sig(pv));
  cols.Is_Baseline.push(base); cols.X_Grp.push(g); cols.Facet_Grp.push(null);
})));
const settings = {method:'auto',test:"Welch's t-test",comparison:'Global (Combined Reference)',scale:'log2fc',significance:'star',grouping:['Group1'],baseline:['Control']};
export const unconfirmedMessage: GcMessage = {id:'mock',rows:[],groups,baseline:['Control'],settings,requiresConfirmation:true,confirmationToken:'mock-reference'};
export const confirmedMessage: GcMessage = {id:'mock',rows:cols,groups,baseline:['Control'],settings,families:{PC:'Glycerophospholipids',PE:'Glycerophospholipids'},
  conditionColors:{},requiresConfirmation:false,scienceSignature:'a'.repeat(64),inferenceAllowed:true};
