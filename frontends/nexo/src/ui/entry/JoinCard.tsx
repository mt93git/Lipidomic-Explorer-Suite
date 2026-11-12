// The join card (prototype scene 3 "joiner"): a joiner's board loads behind it, saying who prepared the board and with
// which settings (the project's, C3). Nothing to choose: the shared board opens as it is.
import type { DatasetSettings } from '../../api';
import { noticeStrings, settingsFacts } from './BoardNotice';
import './JoinCard.css';
export const joinStrings = {
  lede: (who: string) => `Nothing to prepare. You are joining the board ${who} prepared.`, opening: 'Opening the shared board…',
};
export function JoinCard({ settings, preparedBy }: { settings: DatasetSettings; preparedBy: string }) {
  return <div className="entry entry-art-matrix"><section className="picker join-card" aria-labelledby="join-title">
    <div className="join-head"><img src={`${import.meta.env.BASE_URL}entry/help-neutrophil.svg`} alt="" width="56" height="56"/>
      <div><h1 id="join-title">{noticeStrings.chip(preparedBy)}</h1><p>{joinStrings.lede(preparedBy)}</p></div></div>
    <dl>{settingsFacts(settings).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    <div role="status" className="join-status"><p>{joinStrings.opening}</p><div className="join-progress"><i/></div></div>
  </section></div>;
}
