import {diffSettings,type Settings} from '../../statistics/settings';
export function StatsDiff({applied,staged}:{applied:Settings|null;staged:Settings}){
 return <table aria-label="Settings changes"><thead><tr><th>Setting</th><th>Applied</th><th>New</th></tr></thead><tbody>{diffSettings(applied,staged).map(d=><tr key={d.setting}><th>{d.setting}</th><td>{d.applied}</td><td>{d.next}</td></tr>)}</tbody></table>;
}
