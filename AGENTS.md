# Academy Manager engineering guardrails

These rules apply to every change in this repository, including work performed in later sessions or by delegated agents.

## Authorization and privacy

- Treat Supabase RLS, grants, triggers, and security-definer RPC checks as the authorization source of truth. Hiding a button or tab is only defense in depth.
- Never expose `students.phone`, `students.parent_phone`, guardian identity fields, or `students.checkin_pin` through a direct table `SELECT`. Student reads must use the secure student RPCs introduced in SQL 075.
- `canManageStudents` does not imply student-contact access. Only owners have contact access by default. Staff contact access must be an explicit individual grant using `canViewStudentContacts` or `canManageStudentContacts`.
- Consider student and guardian contact data purpose-limited to academy operations. Do not add exports, bulk copy, analytics payloads, logs, notifications, search indexes, AI prompts, files, or caches containing those values without an explicit owner-only authorization design and an audit review.
- A `SECURITY DEFINER` function must validate the authenticated caller, academy membership, target academy, target object, and the same effective permission/assignment rules used by RLS. Revoke execution from `public`; grant only the minimum role.
- Never trust caller-supplied roles, academy IDs, ownership fields, or target user IDs. Resolve them from active server records and validate academy relationships.
- High-risk permissions (staff permission management, staff removal, and student-contact access) may only be granted or revoked by the academy owner and must not be delegated transitively.
- Invitation recipients may accept only through the acceptance RPC. They must never receive direct update access to invitation role, job title, academy, inviter, or status fields.
- Developer workspace access must come from a server-side user-ID allowlist and be rechecked by every privileged RPC. Never hardcode a developer email or ship a service-role/Sentry admin token to the client.
- Developer dashboards must use aggregate or explicitly allowlisted support data. They must not expose student/guardian contacts, check-in PINs, or unrestricted academy impersonation. Any future support access requires owner consent, a short expiry, least privilege, and an immutable audit record.
- Every developer-side mutation must be recorded in `developer_action_logs` or an equivalent append-only audit trail.

## Navigation help

- Every top-level academy tab in `TAB_CONFIG` must have an entry in `src/features/academy/help/academyTabHelp.js` in the same change.
- When a tab's behavior, permission, destructive action, privacy rule, or pilot status changes, update its help entry before considering the task complete.
- Add contextual help for new nested workflows when a reasonable user could misunderstand data scope, permanence, billing effects, or who can see the result.
- Help text must describe the server-enforced behavior, not merely the visible UI.

## Schema and verification

- Add forward-only, idempotent SQL migrations; do not weaken an older migration without also adding a new migration that upgrades existing deployments.
- For permission changes, verify at least owner, manager, teacher, delegated staff, invitation recipient, inactive member, and unauthenticated cases. Include direct REST/RPC attempts, not only UI clicks.
- For student-contact changes, verify that unauthorized list/detail/direct-table requests cannot retrieve the values and unauthorized writes cannot alter them.
- For staff exit changes, verify membership/profile deactivation, future shift cancellation, recurring-rule shutdown, payroll preservation, owner/self protections, and orphaned class warnings.
- Run the production build and relevant automated tests after changes. If the environment cannot apply migrations or run role-based integration tests, state that explicitly in the handoff.
