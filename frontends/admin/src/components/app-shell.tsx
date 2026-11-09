"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, switchView } from "@/app/actions";
import type { AppSession } from "@/lib/models";
import { navigation } from "@/lib/navigation";
import { GlobalSearch } from "./global-search";
import { ScopeControl } from "./scope-control";

export function AppShell({ session, children }: { session: AppSession; children: ReactNode }) {
  const pathname = (usePathname() || "/").replace(/^\/admin(?=\/|$)/, "") || "/";
  const initials = session.displayName.split(" ").slice(0, 2).map(part => part[0]).join("");
  const staff = session.view === "staff";
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="topbar">
      <Link className="brand" href={staff ? "/pipeline" : "/client/home"}>
        <span className="brand-name">Lipidomic Explorer</span><span className="badge">ADMIN</span>
      </Link>
      <GlobalSearch staff={staff} clients={session.clients} />
      <div className="topbar-tools">
        {session.mock && <form action={switchView} className="view-switch" aria-label="Example view">
          <button name="view" value="staff" aria-pressed={staff}>Lab staff</button>
          <button name="view" value="client" aria-pressed={!staff}>Client</button>
        </form>}
        {staff ? <ScopeControl clients={session.clients} />
          : session.clients.length > 1 ? <Link className="client-context" href="/choose-client" title="Change selected client">{session.selectedClient?.name ?? "Choose client"} <span aria-hidden="true">⌄</span></Link>
          : <span className="client-context">{session.selectedClient?.name ?? "No client"}</span>}
        <div className="user-chip">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span><span className="user-name">{session.displayName}</span><span className="user-role">{session.role}</span></span>
        </div>
        <form action={signOut}><button className="sign-out">Sign out</button></form>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <nav aria-label="Admin navigation">
          {navigation.filter(group => group.audience === "all" || group.audience === session.view).map(group => <div className="nav-group" key={group.title}>
            <h2 className="nav-heading">{group.title}</h2>
            {group.items.filter(item => item.href !== "/choose-client" || !staff).map(item => <Link className="nav-link" href={item.href} key={item.href} aria-current={pathname === item.href || (item.label === "Order detail" && pathname.startsWith("/orders/")) ? "page" : undefined}>
              <span className="nav-mark" aria-hidden="true">{item.label === "Pipeline" ? "▥" : "◇"}</span>{item.label}
            </Link>)}
          </div>)}
        </nav>
        <div className="sidebar-footer">LIPIDOMICS SERVICE<br />Admin · Phase 1</div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        {session.mock && <div className="example-banner"><span className="example-label">Example data</span><span>A demo workspace. No lab records are changed.</span></div>}
        {children}
      </main>
    </div>
  </>;
}
