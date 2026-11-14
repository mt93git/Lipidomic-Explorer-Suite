// Who may do what in Admin, in plain lab words: what the app really allows. The one source for the /roles-permissions
// matrix and for the demo's people rules (src/lib/people.ts). Each row names the database rule it mirrors and the
// functions the app calls for that action; tests/roles.test.ts checks the rule against the role lists of
// db/admin/migrations/0002_helpers.sql and that it is the check guarding each of those functions.

export const labRoles = ["owner", "admin", "operator", "member"] as const;
export const clientRoles = ["client_admin", "requester", "viewer"] as const;
export type LabRoleKey = (typeof labRoles)[number];
export type ClientRoleKey = (typeof clientRoles)[number];
export type RoleKey = LabRoleKey | ClientRoleKey;

export const labRoleNames: Record<LabRoleKey, string> = { owner: "Owner", admin: "Admin", operator: "Operator", member: "Member" };
export const clientRoleNames: Record<ClientRoleKey, string> = { client_admin: "Client admin", requester: "Requester", viewer: "Viewer" };
export const roleDescriptions: Record<RoleKey, string> = {
  owner: "Runs the lab's back office: everything an Admin does, plus lab staff and the release policy.",
  admin: "Manages clients and their people and runs the lab's work.",
  operator: "Runs the lab's work: shipments, samples, batches, results and datasets.",
  member: "Belongs to the lab but is not staff: sees no client's data.",
  client_admin: "Reads their own client's orders and released datasets and requests orders for it. The lab manages their client's people.",
  requester: "Reads their own client's orders and released datasets and requests orders for it. The lab registers the samples.",
  viewer: "Reads their own client's orders and released datasets.",
};

// rule: the database check the row mirrors. A 0002 helper name (checked by the test), 'lab_owner' (the 0015 functions'
// Owner check, and set_release_policy's), 'release_policy' (the signers the Owner chooses) or 'client_requester' (a
// client admin or requester of that client, active: request_order in 0019) or 'signed_in' (anyone signed in, for
// themselves: set_my_notification_pref in 0028).
// rpcs: the admin functions the app calls for the action (the test checks each is guarded by the rule).
export type PermissionRule = "is_lab_staff" | "is_lab_writer" | "is_lab_manager" | "can_read_client" | "lab_owner" | "release_policy" | "client_requester" | "signed_in";
export type Permission = {
  key: string; area: "Lab work" | "Clients and people" | "Lab administration"; action: string; roles: readonly RoleKey[]; rule: PermissionRule;
  rpcs?: readonly string[]; note?: string;
};

export const permissions: readonly Permission[] = [
  { key: "read_client_data", area: "Lab work", action: "See a client's orders, samples and released datasets", roles: ["owner", "admin", "operator", "client_admin", "requester", "viewer"], rule: "can_read_client", note: "Client roles see their own client only; lab staff see every client." },
  { key: "submit", area: "Lab work", action: "Open orders, record shipments and register samples", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["create_order", "receive_shipment", "register_samples"], note: "Lab staff enter these for every client; client roles request orders instead." },
  { key: "request_order", area: "Lab work", action: "Request an order for their client", roles: ["client_admin", "requester"], rule: "client_requester", rpcs: ["request_order"], note: "Only for their own, active client. The request waits for the lab's answer." },
  { key: "answer_request", area: "Lab work", action: "Accept or decline a client's order request", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["accept_order", "decline_order"], note: "Declining needs a reason the client reads; the order is archived." },
  { key: "deliverables", area: "Lab work", action: "Add, show, hide or retire the files a client downloads for an order", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["add_deliverable", "set_deliverable_visibility", "retire_deliverable"], note: "PDF, PNG, JPEG, SVG, XLSX or CSV, 50 MB at most. A new file stays hidden until shown; a file is retired, never deleted." },
  { key: "storage", area: "Lab work", action: "Place, move and remove aliquots in storage boxes", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["place_aliquot", "move_aliquot", "remove_aliquot"], note: "One aliquot per position. A move keeps the old position in the history; removing needs a reason." },
  { key: "run_lab", area: "Lab work", action: "Run the lab: batches, results files, name dictionary, dataset builds", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["accept_result_file", "build_dataset"] },
  { key: "qc_review", area: "Lab work", action: "Exclude samples, withdraw exclusions and mark processed orders QC reviewed", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["add_exclusion", "withdraw_exclusion", "mark_qc_checked"], note: "Recorded decisions only: building the dataset keeps every sample's data, and the version's processing record lists the exclusions. QC reviewed is optional; Release also builds from Processed." },
  { key: "sign_release", area: "Lab work", action: "Sign and release a dataset", roles: ["owner", "admin"], rule: "release_policy", note: "Any Owner or Admin by default; the Owner may name other lab staff. Always two different people." },
  { key: "read_audit", area: "Lab administration", action: "Read the audit log", roles: ["owner", "admin", "operator"], rule: "is_lab_staff" },
  { key: "manage_clients", area: "Clients and people", action: "Create, edit and archive clients", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["create_client", "update_client", "archive_client"] },
  { key: "invite_client", area: "Clients and people", action: "Invite client members, change or archive their client roles", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["create_invitation", "revoke_invitation", "set_client_member_role", "archive_member"] },
  { key: "nexo_access", area: "Clients and people", action: "Turn a client's Nexo access on or off", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["set_client_nexo_access"], note: "Off by default. The client's people see Open in Nexo only when it is on and this environment lets clients open Nexo." },
  { key: "members_prepare", area: "Clients and people", action: "Let a client's members prepare datasets in Nexo", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["set_client_members_prepare"], note: "Needs Nexo access on; off by default." },
  { key: "answer_access", area: "Clients and people", action: "Approve or decline an access request from the public form", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["list_access_requests", "approve_access_request", "decline_access_request"], note: "Anyone may ask, without an account; approving creates the 7-day invitation link with the role you pick. A declined request's personal data is erased after 90 days." },
  { key: "invite_lab", area: "Clients and people", action: "Invite lab staff, change lab roles, archive lab staff", roles: ["owner"], rule: "lab_owner", rpcs: ["create_invitation", "set_lab_role", "archive_member"], note: "The lab always keeps at least one active Owner." },
  { key: "release_policy", area: "Lab administration", action: "Set the release policy (who signs, how many signatures)", roles: ["owner"], rule: "lab_owner", rpcs: ["set_release_policy"] },
  { key: "instruments_panels", area: "Lab administration", action: "Add, edit and archive instruments and panels", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["create_instrument", "update_instrument", "archive_instrument", "create_panel", "update_panel", "archive_panel"], note: "Lab staff read them. An instrument is archived only once no active panel uses it; a panel's dataset type is fixed once an order or a batch uses it." },
  { key: "notification_prefs", area: "Lab administration", action: "Turn their own email notifications on or off", roles: ["owner", "admin", "operator", "client_admin", "requester", "viewer"], rule: "signed_in", rpcs: ["set_my_notification_pref"], note: "Everyone changes only their own; each is on until turned off. Which events reach which people is the lab's Notifications matrix." },
  { key: "notification_rules", area: "Lab administration", action: "Choose who gets which email (the Notifications matrix)", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["set_notification_rule"], note: "One row per event; lab staff by role, the owner of the step, the client's admins and the requester. Lab staff read it." },
  { key: "notification_log", area: "Lab administration", action: "Read the email send log", roles: ["owner", "admin"], rule: "is_lab_manager", note: "Who was emailed, when, and whether it was sent, failed or skipped. Only the Admin server writes it." },
  { key: "shipping_instructions", area: "Lab administration", action: "Set the shipping instructions and the contact for clients", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["set_shipping_instructions", "set_client_contact"], note: "Everyone signed in reads them; the contact also shows on the public Request access page." },
];

export type PermissionKey = (typeof permissions)[number]["key"];

export function allows(key: string, role: string | null | undefined): boolean {
  const permission = permissions.find(item => item.key === key);
  if (!permission) throw new Error(`Unknown permission ${key}`);
  return !!role && (permission.roles as readonly string[]).includes(role);
}

// The session carries display labels ("Owner"); the rules use the database keys ("owner").
export function labRoleKey(label: string | null | undefined): LabRoleKey | null {
  const entry = Object.entries(labRoleNames).find(([, name]) => name === label);
  return entry ? entry[0] as LabRoleKey : null;
}
