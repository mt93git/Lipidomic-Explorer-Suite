"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "@/components/app-link";
import { stripBasePath } from "@/lib/base-path";
import { usePathname } from "next/navigation";
import { signOut, switchView } from "@/app/actions";
import type { AppSession } from "@/lib/models";
import { initials } from "@/lib/initials";
import { sidebarNavigation, waveTag } from "@/lib/navigation";
import { GlobalSearch } from "./global-search";
import { ScopeControl } from "./scope-control";
import { Companion } from "./companion/Companion";
import { clientScreen } from "./companion/model";

const countLabels: Record<string, string> = { "/people": "access requests waiting" };

// counts: waiting items per sidebar href (only numbers above zero are shown). nexoApiBase: where the client view's
// companion asks its questions (NEXO_API_BASE, read by the workspace layout).
export function AppShell({ session, children, counts = {}, nexoApiBase }: { session: AppSession; children: ReactNode; counts?: Record<string, number>; nexoApiBase?: string }) {
  const pathname = stripBasePath(usePathname() || "/");
  const staff = session.view === "staff";
  // Phone only (CSS decides): the view switch, scope, user chip and sign-out sit behind a Menu button.
  // Desktop always shows them; the state only drives aria-expanded and the data-open hook.
  // It is remembered with the page it was opened on, so navigating (a scope link, say) closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === pathname;
  const setMenuOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !menuOpen) return;
    setMenuOpen(false);
    menuButton.current?.focus();
  };
  // Phone: the sidebar is one strip that scrolls sideways. It opens on the current screen's link, with the end of
  // the link before it in view (a hint that the strip goes on to the left).
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = sidebar.current;
    const link = strip?.querySelector('[aria-current="page"]');
    if (strip && link && strip.scrollWidth > strip.clientWidth) strip.scrollLeft += link.getBoundingClientRect().left - strip.getBoundingClientRect().left - 40;
  }, [pathname]);
  const { groups, comingNext } = sidebarNavigation(session.view, session.role);
  // Order pages are reached from cards and tables; the sidebar marks their home.
  const current = (href: string) => pathname === href || (href === (staff ? "/pipeline" : "/client/home") && pathname.startsWith("/orders/")) ? "page" as const : undefined;
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar" onKeyDown={closeOnEscape}>
      <Link className="brand" href={staff ? "/pipeline" : "/client/home"}>
        <span className="brand-name">Lipidomic Explorer</span><span className="badge">{staff ? "ADMIN" : "CLIENT PORTAL"}</span>
      </Link>
      {/* A client has few orders, all on Client home: no search box until client search exists. */}
      {staff && <GlobalSearch staff clients={session.clients} />}
      {/* The neutrophil companion: the client view only, never lab staff; it stays in the bar on a phone (not in Menu). */}
      {!staff && <Companion screen={clientScreen(pathname)} user={session.userId} apiBase={nexoApiBase} />}
      <button type="button" className="menu-button" ref={menuButton} aria-expanded={menuOpen} aria-controls="topbar-menu" onClick={() => setMenuOpen(!menuOpen)}>
        Menu <span aria-hidden="true">{menuOpen ? "▴" : "▾"}</span>
      </button>
      <div className="topbar-tools" id="topbar-menu" data-open={menuOpen || undefined} onClick={event => { if ((event.target as HTMLElement).closest("a")) setMenuOpen(false); }}>
        {session.mock && <form action={switchView} className="view-switch" aria-label="Example view">
          <button name="view" value="staff" aria-pressed={staff}>Lab staff</button>
          <button name="view" value="client" aria-pressed={!staff}>Client</button>
        </form>}
        {staff ? <ScopeControl clients={session.clients} />
          : session.clients.length > 1 ? <Link className="client-context" href="/choose-client" title="Change selected client">{session.selectedClient?.name ?? "Choose client"} <span aria-hidden="true">⌄</span></Link>
          : <span className="client-context">{session.selectedClient?.name ?? "No client"}</span>}
        <div className="user-chip">
          <span className="avatar" aria-hidden="true">{initials(session.displayName)}</span>
          <span><span className="user-name">{session.displayName}</span><span className="user-role">{session.role}</span></span>
        </div>
        <form action={signOut}><button className="sign-out">Sign out</button></form>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar" ref={sidebar}>
        <nav aria-label="Admin navigation">
          {groups.map(group => <div className="nav-group" key={group.title}>
            <h2 className="nav-heading">{group.title}</h2>
            {group.items.map(item => <Link className="nav-link" href={item.href} key={item.href} aria-current={current(item.href)}>
              <span className="nav-mark" aria-hidden="true">{item.label === "Pipeline" ? "▥" : "◇"}</span>{item.label}
              {(counts[item.href] ?? 0) > 0 && <span className="nav-count">{counts[item.href]}<span className="sr-only"> {countLabels[item.href] ?? "waiting"}</span></span>}
            </Link>)}
          </div>)}
          {comingNext.length > 0 && <details className="nav-group nav-coming" open={comingNext.some(item => item.href === pathname) || undefined}>
            <summary className="nav-heading">Coming next · {comingNext.length} screens</summary>
            {comingNext.map(item => { const tag = waveTag(item.phase); return <Link className="nav-link" href={item.href} key={item.href} aria-current={current(item.href)}>
              <span className="nav-mark" aria-hidden="true">◇</span>{item.label}{tag && <span className="nav-tag">{tag}</span>}
            </Link>; })}
          </details>}
        </nav>
        <div className="sidebar-footer">LIPIDOMICS SERVICE<br />{staff ? "Admin · Phase 1" : "Client portal"}</div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        {session.mock && <div className="example-banner"><span className="example-label">Example data</span><span>A demo workspace. No lab records are changed.</span></div>}
        {children}
      </main>
    </div>
  </>;
}
