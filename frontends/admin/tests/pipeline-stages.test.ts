import { describe, expect, it } from "vitest";
import { demoOrders } from "@/lib/demo";
import { stages, type Order } from "@/lib/models";
import { pipelineStages } from "@/lib/pipeline-stages";

const order = (overrides: Partial<Order>): Order => ({ ...demoOrders[0], released: false, ...overrides });

describe("pipeline stage summary", () => {
  it("keeps all ten stages in order and collapses every empty stage", () => {
    const columns = pipelineStages([]);
    expect(columns.map(column => column.label)).toEqual(stages);
    expect(columns.map(column => column.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(columns.every(column => column.count === 0 && !column.blocked && column.collapsed && column.orders.length === 0)).toBe(true);
  });

  it("counts only open orders and keeps their original order within each stage", () => {
    const first = order({ code: "SYN001", stage: 6 });
    const second = order({ code: "SYN002", stage: 6 });
    const columns = pipelineStages([first, order({ stage: 9, released: true }), second]);
    expect(columns[6].orders).toEqual([first, second]);
    expect(columns.map(column => column.count)).toEqual([0, 0, 0, 0, 0, 0, 2, 0, 0, 0]);
    expect(columns[9].collapsed).toBe(true);
  });

  it("marks a stage blocked if any open order fails a gate, including mixed gate states", () => {
    const columns = pipelineStages([
      order({ stage: 1, gates: [{ label: "Pending", status: "pending" }] }),
      order({ stage: 1, gates: [{ label: "Passed", status: "ok" }] }),
      order({ stage: 2, gates: [{ label: "Pending", status: "pending" }, { label: "Failed", status: "fail" }] }),
      order({ stage: 9, released: true, gates: [{ label: "Failed", status: "fail" }] }),
    ]);
    expect(columns.map(column => column.blocked)).toEqual([false, false, true, false, false, false, false, false, false, false]);
  });

  it("expands a rail when an order arrives and collapses it when the filtered scope empties", () => {
    const orders = [order({ stage: 7 })];
    expect(pipelineStages(orders)[7].collapsed).toBe(false);
    expect(pipelineStages(orders.filter(item => item.stage === 2))[7].collapsed).toBe(true);
    expect(pipelineStages(orders)[7].count).toBe(1);
  });
});
