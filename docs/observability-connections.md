# Codex observability connections

This repository uses project-scoped MCP connections for production diagnostics.
OAuth credentials are stored by Codex outside the repository; never put access
tokens, service-role keys, or Sentry auth tokens in this file or in Git.

## Supabase

The `supabase_prod` MCP entry in `.codex/config.toml` is pinned to this project's
Supabase project reference and has all three safeguards enabled:

- `read_only=true` prevents write queries at the server boundary.
- Only the `database`, `debugging`, and `docs` feature groups are enabled.
- `enabled_tools` exposes schema, migration, advisor, and log inspection only.

Authenticate with the minimum management API scopes:

```sh
codex mcp login supabase_prod \
  --scopes organizations:read,projects:read,database:read,analytics:read \
  --oauth-client-registration dcr
```

The Supabase CLI is installed as a pinned development dependency. Disable CLI
telemetry in CI or other non-interactive environments:

```sh
SUPABASE_TELEMETRY_DISABLED=1 npm run supabase:version
```

`npm run supabase:local:status` reports the local Docker stack only; it is not a
production health check.

### Production database migration history

The one-time baseline for the pre-CLI database was created on 2026-09-11 and is
tracked as `20260910163138_remote_schema_baseline`. Do not pull or repair that
baseline again. `20260910164500_advisor_performance` is the first forward CLI
migration after it.

For each later database change, create and review a timestamped migration, test
it against the local Docker database, preview the production change, and then
apply it:

```sh
npx supabase migration new <short_name>
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked --dry-run
SUPABASE_TELEMETRY_DISABLED=1 npx supabase db push --linked
```

Never use `migration repair` to register the old `001`–`083` SQL Editor scripts
as separate migrations. Never run `db reset --linked` against production.
Inspection-only tasks must not run `db push`, `migration up`, or write SQL.

## Sentry

The `sentry` MCP entry uses Sentry's official hosted OAuth endpoint and is scoped
to `student-n02/javascript-react`. The exposed tool allowlist is inspection-only
even though Sentry's hosted OAuth consent may request broader upstream scopes.
Every MCP call still requires approval.

Authenticate with:

```sh
codex mcp login sentry
```

If the Seenit Sentry project changes, temporarily use the unscoped endpoint and
restore the `find_organizations` and `find_projects` discovery tools to identify
the new slugs. Then update `.codex/config.toml` using:

```toml
url = "https://mcp.sentry.dev/mcp/<organization-slug>/<project-slug>"
```

Re-run `codex mcp login sentry` after changing that URL. This constrains Sentry
at the server session level as well as through the local tool allowlist.

## Privacy rules

- Never inspect, query, paste, or summarize student phone numbers, guardian
  identity/contact fields, or check-in PINs through either connection.
- Do not use unrestricted SQL as a shortcut around RLS or secure student RPCs.
- Keep Sentry payloads free of request bodies, cookies, authorization headers,
  student contacts, and check-in PINs.
- Prefer aggregate diagnostics and metadata. Ask for explicit authorization
  before any future write, issue mutation, or expanded tool access.

## Verification

Restart Codex after changing `.codex/config.toml`; MCP servers are discovered at
session startup. Then confirm both connections are enabled:

```sh
codex mcp list
```

For Supabase, start with `get_advisors` or `list_migrations`. For Sentry, use
`search_issues` against the configured Seenit project.
