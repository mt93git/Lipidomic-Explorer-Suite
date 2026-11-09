import Link from "next/link";
import type { NavItem } from "@/lib/navigation";

export function Placeholder({ title, phase, description, homeHref = "/pipeline" }: { title: string; phase: string; description: NavItem["description"]; homeHref?: string }) {
  return <>
    <div className="page-heading"><div><div className="eyebrow">Workspace / Coming next</div><h1>{title}</h1><p>{description}</p></div></div>
    <section className="placeholder" aria-label={`${title} implementation phase`}>
      <h2>This workspace is taking shape.</h2><span className="phase">{phase}</span>
      <p className="muted">{title} is planned for {phase}. This route is ready; its workflow will be built in that phase.</p>
      <Link className="button secondary" href={homeHref}>Back to workspace</Link>
    </section>
  </>;
}
