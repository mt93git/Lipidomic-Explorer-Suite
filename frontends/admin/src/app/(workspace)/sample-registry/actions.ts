"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { DataError, getRegistryOrder, registerSamples } from "@/lib/data/samples";
import { normalizeSampleInputs, registryClosedProblem, sampleListProblem, type SampleInput } from "@/lib/samples";
import { getAppSession } from "@/lib/session";

export type RegisterSamplesPayload = { orderId: string; orderCode: string; shipmentId: string | null; samples: SampleInput[] };
export type RegisterSamplesState = { error?: string };

// Saves the grid all at once. The list is re-checked here (nothing from the browser is trusted), the
// database checks it again, and on success the registry page reopens showing the generated codes.
export async function registerSamplesAction(_previous: RegisterSamplesState, payload: RegisterSamplesPayload): Promise<RegisterSamplesState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const orderId = typeof payload?.orderId === "string" ? payload.orderId : "";
  const orderCode = typeof payload?.orderCode === "string" && /^ORD\d{3,}$/.test(payload.orderCode) ? payload.orderCode : "";
  const shipmentId = typeof payload?.shipmentId === "string" && payload.shipmentId ? payload.shipmentId : null;
  if (!orderId || !orderCode) return { error: "Choose an order before registering samples." };
  const samples = normalizeSampleInputs(payload?.samples);
  const problem = sampleListProblem(samples);
  if (problem) return { error: problem };
  let saved: SampleInput[];
  try {
    const detail = await getRegistryOrder(orderCode);
    if (!detail || detail.order.id !== orderId) return { error: `Order ${orderCode} was not found.` };
    const closed = registryClosedProblem(detail.order.code, detail.order.stage); // the page may be stale
    if (closed) return { error: closed };
    const registered = sampleListProblem(samples, detail.samples.map(sample => sample.full_name));
    if (registered) return { error: registered };
    saved = await registerSamples({ orderId, shipmentId, samples });
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction(`/sample-registry?order=${orderCode}&saved=${saved.length}`);
}
