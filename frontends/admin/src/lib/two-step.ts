// The two-step rule (security review finding 2). "verify": the account has a verified factor this session has not
// passed (sign in again with the code). "enroll": a lab-role account (owner, admin, operator or lab member) with no
// verified factor: it must enroll an app authenticator before it can use Admin. Client users keep password sign-in
// unless they enrolled a factor themselves.
export type TwoStepState = "ok" | "verify" | "enroll";
export type Assurance = { currentLevel: string | null; nextLevel: string | null };

export function twoStepState(assurance: Assurance, hasLabRole: boolean): TwoStepState {
  if (assurance.currentLevel === "aal2") return "ok";
  if (assurance.nextLevel === "aal2") return "verify";
  return hasLabRole ? "enroll" : "ok";
}
