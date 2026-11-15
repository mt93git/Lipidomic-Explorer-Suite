import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "@/components/app-link";
import { clientRoleNames, clientRoles, labRoleNames, labRoles, permissions, roleDescriptions, type RoleKey } from "@/lib/roles";
import { requireWorkspace } from "@/lib/session";
import styles from "./roles.module.css";

export const metadata: Metadata = { title: "Roles & permissions" };
const columns: { key: RoleKey; label: string }[] = [
  ...labRoles.map(key => ({ key, label: labRoleNames[key] })), ...clientRoles.map(key => ({ key, label: clientRoleNames[key] })),
];
const areas = [...new Set(permissions.map(permission => permission.area))];

// Read-only: what each role may do, from src/lib/roles.ts (the same rules the database enforces).
export default async function RolesPermissionsPage() {
  await requireWorkspace("staff");
  return <>
    <div className="page-heading"><div><div className="eyebrow">Organization</div><h1>Roles &amp; permissions</h1>
      <p>What each role can do. Each person has one lab role at most and a client role in each client they belong to. Roles are given in People.</p></div>
      <div className="heading-actions"><Link className="button secondary" href="/people">People</Link></div>
    </div>
    <section className="panel" aria-labelledby="matrix-title"><h2 id="matrix-title">Permissions</h2>
      <div className={styles.scroll}><table className={styles.table} aria-label="Permissions by role">
        <thead>
          <tr><th scope="col" rowSpan={2}>Action</th><th scope="colgroup" colSpan={labRoles.length}>Lab roles</th><th scope="colgroup" colSpan={clientRoles.length}>Client roles</th></tr>
          <tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>{areas.map(area => <Fragment key={area}>
          <tr><th scope="rowgroup" colSpan={columns.length + 1} className={styles.area}>{area}</th></tr>
          {permissions.filter(permission => permission.area === area).map(permission => <tr key={permission.key}>
            <th scope="row">{permission.action}{permission.note && <small className={styles.note}>{permission.note}</small>}</th>
            {columns.map(column => { const yes = permission.roles.includes(column.key); return <td key={column.key} className={yes ? styles.yes : styles.no}>
              <span aria-hidden="true">{yes ? "✓" : "—"}</span><span className="sr-only">{yes ? "Allowed" : "Not allowed"}</span></td>; })}
          </tr>)}
        </Fragment>)}</tbody>
      </table></div>
    </section>
    <section className={`panel ${styles.section}`} aria-labelledby="roles-title"><h2 id="roles-title">The roles</h2>
      <dl className="facts">{columns.map(column => <div className="fact-row" key={column.key}><dt>{column.label}</dt><dd>{roleDescriptions[column.key]}</dd></div>)}</dl>
    </section>
  </>;
}
