"use server";

import { redirectAfterAction } from "@/lib/action-redirect";
import { DataError, getReleasePolicy, setReleasePolicy } from "@/lib/data/release";
import { policyProblem } from "@/lib/release";
import { getAppSession } from "@/lib/session";

export type PolicyState = { error?: string };
const ID = /^[A-Za-z0-9-]{1,64}$/;

// Saves the policy (eligible signers, required count). Checked here against the lab's staff list, then by
// admin.set_release_policy (or the demo rule) again.
export async function setReleasePolicyAction(_previous: PolicyState, form: FormData): Promise<PolicyState> {
  const session = await getAppSession();
  if (!session) return redirectAfterAction("/sign-in");
  if (session.view !== "staff") return redirectAfterAction("/client/home");
  const eligibleSigners = Array.from(new Set(form.getAll("signer").map(String).filter(value => ID.test(value))));
  const requiredSignatures = Number(form.get("required"));
  const actorValue = String(form.get("actor") ?? "");
  const actorId = actorValue && ID.test(actorValue) ? actorValue : undefined;
  try {
    const { staff } = await getReleasePolicy();
    const problem = policyProblem(eligibleSigners, requiredSignatures, staff);
    if (problem) return { error: problem };
    await setReleasePolicy({ eligibleSigners, requiredSignatures, actorId });
  } catch (error) {
    if (error instanceof DataError) return { error: error.message };
    throw error;
  }
  return redirectAfterAction("/release-policy?saved=1");
}
