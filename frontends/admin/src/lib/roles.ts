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
  client_admin: "Reads their own client's orders and released datasets. The lab manages their client's people.",
  requester: "Reads their own client's orders and released datasets. The lab opens orders and registers samples for them.",
  viewer: "Reads their own client's orders and released datasets.",
};

// rule: the database check the row mirrors. A 0002 helper name (checked by the test), 'lab_owner' (the 0015 functions'
// Owner check, and set_release_policy's) or 'release_policy' (the signers the Owner chooses).
// rpcs: the admin functions the app calls for the action (the test checks each is guarded by the rule).
export type PermissionRule = "is_lab_staff" | "is_lab_writer" | "is_lab_manager" | "can_read_client" | "lab_owner" | "release_policy";
export type Permission = {
  key: string; area: "Lab work" | "Clients and people" | "Lab administration"; action: string; roles: readonly RoleKey[]; rule: PermissionRule;
  rpcs?: readonly string[]; note?: string;
};

export const permissions: readonly Permission[] = [
  { key: "read_client_data", area: "Lab work", action: "See a client's orders, samples and released datasets", roles: ["owner", "admin", "operator", "client_admin", "requester", "viewer"], rule: "can_read_client", note: "Client roles see their own client only; lab staff see every client." },
  { key: "submit", area: "Lab work", action: "Open orders, record shipments and register samples", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["create_order", "receive_shipment", "register_samples"], note: "Lab staff enter these for every client; client roles cannot yet." },
  { key: "run_lab", area: "Lab work", action: "Run the lab: batches, results files, name dictionary, dataset builds", roles: ["owner", "admin", "operator"], rule: "is_lab_writer", rpcs: ["accept_result_file", "build_dataset"] },
  { key: "sign_release", area: "Lab work", action: "Sign and release a dataset", roles: ["owner", "admin"], rule: "release_policy", note: "Any Owner or Admin by default; the Owner may name other lab staff. Always two different people." },
  { key: "read_audit", area: "Lab administration", action: "Read the audit log", roles: ["owner", "admin", "operator"], rule: "is_lab_staff" },
  { key: "manage_clients", area: "Clients and people", action: "Create, edit and archive clients", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["create_client", "update_client", "archive_client"] },
  { key: "invite_client", area: "Clients and people", action: "Invite client members, change or archive their client roles", roles: ["owner", "admin"], rule: "is_lab_manager", rpcs: ["create_invitation", "revoke_invitation", "set_client_member_role", "archive_member"] },
  { key: "invite_lab", area: "Clients and people", action: "Invite lab staff, change lab roles, archive lab staff", roles: ["owner"], rule: "lab_owner", rpcs: ["create_invitation", "set_lab_role", "archive_member"], note: "The lab always keeps at least one active Owner." },
  { key: "release_policy", area: "Lab administration", action: "Set the release policy (who signs, how many signatures)", roles: ["owner"], rule: "lab_owner", rpcs: ["set_release_policy"] },
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
