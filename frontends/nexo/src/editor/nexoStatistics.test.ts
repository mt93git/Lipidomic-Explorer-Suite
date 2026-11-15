import {expect,it} from 'vitest';
import {applyNexoStatistics} from './applyNexoStatistics';
import {applyStatisticsToFigure} from '../statistics/annotations';
import {DEFAULT_PRESENTATION,DEFAULT_SETTINGS} from '../statistics/settings';
import {mockViolinStatistics} from '../mock/statistics';
it('keeps statistic labels unchanged while positioning labels and brackets on log axes',async()=>{
 const result=(await mockViolinStatistics('i',{mode:'apply',settings:DEFAULT_SETTINGS})).result;
 const stats={presentation:DEFAULT_PRESENTATION,applied:DEFAULT_SETTINGS,result};
 const raw={data:[{x:['Control','Case'],y:[1,100]}],layout:{yaxis:{range:[1,100]}}};
 const normal=applyStatisticsToFigure(raw,stats),figure={...raw,layout:{yaxis:{type:'log',range:[0,2]}}};
 const log=applyNexoStatistics(figure,stats);
 expect(log.data).toEqual(figure.data);expect(log.layout.yaxis).toEqual(figure.layout.yaxis);expect(log.layout.shapes).toEqual(normal.layout.shapes);
 const annotations=log.layout.annotations as {name:string;y:number;text:string}[],before=normal.layout.annotations as {name:string;y:number;text:string}[];
 expect(annotations.map(a=>a.text)).toEqual(before.map(a=>a.text));annotations.forEach((a,i)=>expect(a.y).toBeCloseTo(Math.log10(before[i].y)));
 expect(applyNexoStatistics(figure,null)).toEqual(applyStatisticsToFigure(figure,null));
});
