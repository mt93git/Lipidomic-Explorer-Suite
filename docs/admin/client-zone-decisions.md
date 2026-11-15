# Client zone: decisions (2026-11-10)

Proposal: `docs/admin/client-zone-proposal/proposal.html` (Spanish, with screenshots). Phases: F0 close direct client writes (done, 0018), F1 read-only client portal, F2 request an order (0019), F3 request access (0020).

Answers to the proposal's open questions (Gerardo, 2026-11-10):

1. **Nexo for clients:** the lab decides per client (a per-client switch, off by default), not a single global setting. Until that switch exists, the current environment gate for "Open in Nexo" stays.
2. **Who accepts a requested order:** lab Owner, Admin and Operator (any lab writer).
3. **Role of a new client's first person:** the lab picks it in the approve dialog.
4. **Forgotten password:** automatic email reset link (Supabase); needs SMTP configured first.
5. **Shipping instructions:** one fixed lab text, editable in a setting, shown to every client.
6. **Declined access requests:** kept 90 days, then their personal data is deleted.
