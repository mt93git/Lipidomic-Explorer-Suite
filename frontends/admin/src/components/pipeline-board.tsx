import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Order } from "@/lib/models";
import { pipelineStages } from "@/lib/pipeline-stages";
import styles from "./pipeline.module.css";

export function PipelineBoard({ orders, renderOrder }: { orders: Order[]; renderOrder: (order: Order) => ReactNode }) {
  const columns = pipelineStages(orders);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      setVisible(current => {
        const next = { ...current };
        for (const entry of entries) next[(entry.target as HTMLElement).dataset.stage!] = entry.isIntersecting;
        return next;
      });
    }, { root });
    root.querySelectorAll("[data-stage]").forEach(column => observer.observe(column));
    return () => observer.disconnect();
  }, []);

  return <div className={styles.board}>
    <p className={styles.help} id="board-help">Stages · select to jump <span>Empty stages collapse</span></p>
    <span className="sr-only" id="pipeline-blocked-hint">Contains blocked orders</span>
    <div className={styles.minimap} role="group" aria-label="Pipeline stages">
      {columns.map(({ label, index, count, blocked }) => {
        const number = String(index + 1).padStart(2, "0");
        const name = `Stage ${number} ${label}, ${count} ${count === 1 ? "order" : "orders"}`;
        return <button key={label} type="button" aria-label={name} title={name}
          aria-describedby={blocked ? "pipeline-blocked-hint" : undefined} aria-controls={`pipeline-stage-${index}`}
          data-visible={Boolean(visible[index])}
          onClick={() => scrollRef.current?.querySelector<HTMLElement>(`[data-stage="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" })}>
          <span>{number}</span><span className={`column-count ${styles.count}`} data-blocked={blocked} data-empty={count === 0}>{blocked && <span aria-hidden="true">⚠ </span>}{count}</span>
        </button>;
      })}
    </div>
    <div ref={scrollRef} className="kanban-scroll" role="region" aria-label="Order pipeline" aria-describedby="board-help" tabIndex={0}>
      <div className="kanban">{columns.map(({ label, index, orders, count, collapsed }) =>
        <section className={`kanban-column ${styles.column}`} key={label} id={`pipeline-stage-${index}`} data-stage={index} data-collapsed={collapsed} aria-label={label}>
          <div className="column-heading"><div><span className="column-index">{String(index + 1).padStart(2, "0")}</span><h2>{label}</h2></div><span className="column-count">{count}</span></div>
          {orders.map(order => renderOrder(order))}
          {collapsed && <p className="sr-only">No orders at this stage</p>}
        </section>)}
      </div>
    </div>
  </div>;
}
