import "server-only";
import { sendActivationEmail, sendInvitationEmail, type ActivationDeps, type EmailOutcome } from "../activation";
import { getEnvironment } from "../environment";
import { DEMO_OFF_REASON } from "../notifications";
import { targetLabel, type PersonKind } from "../people";
import { labRoleKey } from "../roles";
import { requireWorkspace } from "../session";
import { createAdminClient } from "../supabase/server";
import { createServiceClient } from "../supabase/service";
import { mailDeps } from "./notifications";
import { DataError, demoActorOf, listPeople, previewInvitation } from "./people";

// The server side of the account emails (activation.ts, 0029). Both are sent while the action runs (Resend answers
// within 5 s or the send counts as failed), because People shows at once whether the email went. Live: Resend and the
// service role's log insert (mailDeps), GoTrue's generate_link with the service role, and the audit row with the
// sender's own token. The demo sends nothing and makes no link: it logs a skipped row to the browser's demo log.
const live = () => !getEnvironment().mock;
type Outcome = EmailOutcome & { email: string };

// Who sends, as the email names them, and their lab role: the signed-in person live, the chosen demo person in the demo.
async function sender(actorId?: string) {
  const session = await requireWorkspace("staff");
  if (!live()) {
    const person = demoActorOf(session, actorId);
    return { name: person.name, role: person.role as string };
  }
  // session-model.ts falls back to "Admin user" when the account has no name.
  return { name: session.displayName && session.displayName !== "Admin user" ? session.displayName : "The Libreros Lab", role: labRoleKey(session.role) as string | null };
}

// Right after create_invitation (or approve_access_request) returned the token: the welcome email with its link.
// Never throws; null when the invitation cannot be read back (the screen then says it was not emailed).
export async function emailInvitation(token: string, labStaff: boolean, actorId?: string): Promise<Outcome | null> {
  try {
    const invitation = await previewInvitation(token);
    if (!invitation) return null;
    const { name } = await sender(actorId);
    const outcome = await sendInvitationEmail({ inviter: name, target: invitation.target, labStaff, token, email: invitation.email, clientId: null }, mailDeps());
    return { ...outcome, email: invitation.email };
  } catch (error) {
    console.error(`[account email] invitation: not sent (${error instanceof Error ? error.message : error})`);
    return null;
  }
}

function liveActivationDeps(): ActivationDeps {
  return {
    ...mailDeps(),
    generateLink: async email => {
      const service = createServiceClient();
      if (!service) throw new Error("this server has no service key");
      // Admin generate_link only makes the link: GoTrue sends no email of its own.
      const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
      const hash = data?.properties?.hashed_token;
      if (error || !hash) throw new Error(`GoTrue answered ${error?.status ?? "without a link"}`);
      return hash;
    },
    audit: async userId => {
      const client = await createAdminClient();
      if (!client) throw new Error("no session");
      const { error } = await client.schema("admin").rpc("record_activation_email", { p_user_id: userId });
      if (error) throw new Error(`record_activation_email failed (${error.code ?? "no code"})`);
    },
  };
}
const demoActivationDeps = (): ActivationDeps => ({
  ...mailDeps(),
  generateLink: async () => { throw new Error(DEMO_OFF_REASON); },
  audit: async () => undefined,
});

// "Send activation email" on a People row (kind + id = the membership row).
export async function sendActivation(input: { kind: PersonKind; id: string; actorId?: string }): Promise<Outcome> {
  const who = await sender(input.actorId);
  const person = (await listPeople()).people.find(item => item.kind === input.kind && item.id === input.id);
  if (!person) throw new DataError("This person is no longer listed in People.");
  const target = person.kind === "lab_staff" ? targetLabel({ labRole: person.role, clientRole: null })
    : targetLabel({ labRole: null, clientRole: person.role, clientName: person.clientName });
  return sendActivationEmail({ senderRole: who.role, sender: who.name, person: { ...person, target } }, live() ? liveActivationDeps() : demoActivationDeps());
}
