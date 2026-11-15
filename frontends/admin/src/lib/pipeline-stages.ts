import { gateStatus, stages, type Order } from "./models";

// The minimap and columns describe the same filtered, open population.
export function pipelineStages(orders: Order[]) {
  return stages.map((label, index) => {
    const column = orders.filter(order => !order.released && order.stage === index);
    return {
      label,
      index,
      orders: column,
      count: column.length,
      blocked: column.some(order => gateStatus(order.gates) === "fail"),
      collapsed: column.length === 0,
    };
  });
}
