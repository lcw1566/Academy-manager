# Academy Manager engineering guardrails

These rules apply to every change in this repository, including work performed in later sessions or by delegated agents.

## Brand assets

- Use `src/components/SeenitLogo.jsx` for the 씨닛 brand mark in product UI. Do not substitute an emoji or a generic icon.
- `docs/brand/icon-192.png.png` and `docs/brand/icon-512.png.png` are the source of truth. Keep the corresponding public PWA and maskable icons synchronized in the same change.

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

## Observability and secrets

- Use the repository-scoped, read-only Supabase and Sentry MCP connections in `.codex/config.toml` for inspection. Do not broaden their tool allowlists or perform external mutations during a diagnostic-only task.
- Keep `SENTRY_AUTH_TOKEN`, Supabase secret/service-role keys, database passwords, and OAuth credentials out of Git, client bundles, logs, screenshots, and chat. `SENTRY_AUTH_TOKEN` is a build-only Vercel secret and must never use a `VITE_` prefix. Keep `.env.sentry-build-plugin` ignored.
- Sentry events must keep `sendDefaultPii: false` and must not include request bodies, cookies, authorization headers, student/guardian contacts, guardian identity fields, or check-in PINs. Preserve the scrubbing in `src/main.jsx` when changing Sentry initialization.
- Upload browser source maps only from production builds to the `student-n02/javascript-react` Sentry project. Treat source maps as build artifacts; do not intentionally expose them as public application assets.
- A successful local source-map upload does not prove a Vercel deployment succeeded. Verify the deployment separately and use a new production error only when end-to-end symbolication must be tested.

## Navigation help

- Every top-level academy tab in `TAB_CONFIG` must have an entry in `src/features/academy/help/academyTabHelp.js` in the same change.
- When a tab's behavior, permission, destructive action, privacy rule, or pilot status changes, update its help entry before considering the task complete.
- Add contextual help for new nested workflows when a reasonable user could misunderstand data scope, permanence, billing effects, or who can see the result.
- Help text must describe the server-enforced behavior, not merely the visible UI.

## Interaction feedback

- Card-style and list-row buttons should use the shared `pressable-surface` interaction class so hover and press states have the same soft surface-color transition and restrained scale feedback as the attendance group buttons. Keep destructive buttons, selection controls, switches, and text-only actions on their purpose-specific feedback styles.
- Preserve `prefers-reduced-motion` behavior when adding or changing interaction motion. New press effects must remain theme-aware by using semantic Seenit color tokens rather than hard-coded light-only colors.
- Review every new or changed layout in both light and dark mode before considering it complete. Check text/background contrast, borders, disabled and selected states, overlays, shadows, and focus/hover/press feedback; do not pair semantic foreground tokens such as `text-seenit-ink` with backgrounds that can resolve to the same color in dark mode.
- When extending an existing flow, inspect and reuse its established animation, transition, loading, empty, and success-feedback patterns. Verify motion in both themes and with `prefers-reduced-motion` enabled so visual polish does not reduce readability or accessibility.
- Home dashboard operational metrics must use `src/components/HomeSummaryBar.jsx` so owner, manager, teacher, assistant, and private-mode homes keep the same compact single-row layout. Express role-specific differences through the component's `items`; do not recreate separate 2-column summary-card grids.

## Typography

- Use `Wanted Sans Variable` as the single product UI typeface through the shared `--seenit-font-sans` token. Load the official `wanted-sans` package's variable split webfont locally through the application bundle; do not add an external font CDN or another product UI font without an explicit brand-system decision.
- Keep `public/licenses/WantedSans-OFL.txt` synchronized with the installed Wanted Sans package whenever the font dependency changes so web, PWA, iOS, and Android distributions retain the required license notice.
- Use weight 400–500 for body and supporting text, 600 for controls and list titles, and 700 for headings and key values. Reserve 800–900 for rare, high-priority metrics or display moments; do not use extreme weight as the default way to establish hierarchy.
- Keep Korean letter spacing at the font default unless a reviewed component has a specific optical need. Use tabular numerals for aligned amounts, attendance counts, times, and other changing operational data.
- Keep system and Korean fallback fonts after Wanted Sans so content remains readable if a font asset cannot load. Content viewers may preserve a document-specific typeface when reproducing the source document requires it.

## Schema and verification

- The production CLI migration baseline is `20260910163138_remote_schema_baseline`; `20260910164500_advisor_performance` is the first forward migration after it. The numbered `supabase/sql/001`–`084` files are legacy SQL Editor history and review copies, not entries to register again.
- Put every future production schema change in a new timestamped file under `supabase/migrations/`. Add forward-only, idempotent SQL; do not edit the baseline, rewrite an applied migration, or weaken an older migration without a new upgrading migration.
- Create migrations with `npx supabase migration new <short_name>`. Before production, replay them against the local Docker database, run relevant role tests, and use `supabase db push --linked --dry-run` to confirm that only the intended files are pending.
- Run `supabase db push --linked` only for an explicitly authorized schema-change task. Never use it during inspection. Never run `supabase db reset --linked`, never include seed data in a production push, and never use `migration repair` to register the old `001`–`083` SQL Editor scripts.
- After a production migration, verify local/remote history, rerun Supabase security and performance Advisors, and inspect the immediate error/5xx log window. Treat newly created indexes reported as unused as informational until representative production traffic and stable statistics exist.
- For permission changes, verify at least owner, manager, teacher, delegated staff, invitation recipient, inactive member, and unauthenticated cases. Include direct REST/RPC attempts, not only UI clicks.
- For student-contact changes, verify that unauthorized list/detail/direct-table requests cannot retrieve the values and unauthorized writes cannot alter them.
- For staff exit changes, verify membership/profile deactivation, future shift cancellation, recurring-rule shutdown, payroll preservation, owner/self protections, and orphaned class warnings.
- Run the production build and relevant automated tests after changes. If the environment cannot apply migrations or run role-based integration tests, state that explicitly in the handoff.
