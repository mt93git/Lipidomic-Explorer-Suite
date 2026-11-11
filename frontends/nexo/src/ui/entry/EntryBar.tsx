import { useState } from 'react';
import { signOut } from '../../api/adminSignIn';
import { strings as s } from '../strings';
import '../topBar.css';
import './EntryBar.css';
/** The navy bar over the entry screens: the lab logo, the app's name and the three steps, Data (Start) and Review (Prepare and
 *  the quality check) current before the Canvas. `account`: the signed-in person's name, with the board's account menu
 *  (TopBar: the person icon, Sign out through Admin). */
export function EntryBar({ step, account }: { step?: 'data' | 'review'; account?: string | null }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return <header className="topbar"><img className="logo" src={`${import.meta.env.BASE_URL}entry/libreros-lab-logo.webp`} alt={s.logo} width="63" height="30"/><span className="app-name">{s.app}</span>
    {step && <nav aria-label={s.steps}>{([['data', s.data], ['review', s.review], ['canvas', s.canvas]] as const).map(([key, name]) => <span key={key} aria-current={key === step ? 'step' : undefined}>{name}</span>)}</nav>}
    {account && <div className="entry-account"><span className="entry-account-name">{account}</span>
      <details className="account-menu" onToggle={e => setAccountOpen(e.currentTarget.open)}><summary className="avatar" aria-label={s.accountLabel} data-tip={s.accountLabel}><svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="6" r="3"/><path d="M3 16c0-3.3 2.7-5 6-5s6 1.7 6 5"/></svg></summary><button type="button" className="account-signout" hidden={!accountOpen} onClick={() => { void signOut().then(() => location.reload()); }}>Sign out</button></details></div>}
  </header>;
}
