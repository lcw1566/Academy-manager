import { createClient } from "@supabase/supabase-js";

// Registers existing synthetic accounts only; never resets users, memberships,
// permissions or scenarios. No browser-bundled credentials or email authority.
const url = process.env.STAGING_SUPABASE_URL;
if (
  url !== "https://owitlzsgxxuthgbmweyt.supabase.co" ||
  process.env.STAGING_SUPABASE_PROJECT_REF !== "owitlzsgxxuthgbmweyt"
)
  throw new Error("Only the designated staging project is allowed");
const admin = createClient(url, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const users = [];
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 100,
  });
  if (error) throw new Error("Could not read staging identities");
  users.push(...data.users);
  if (data.users.length < 100) break;
}
const identities = ["owner", "manager", "teacher", "invited"].map((persona) => {
  const user = users.find(
    (user) => user.email === `staging-${persona}.e2e@example.test`,
  );
  if (!user) throw new Error(`Missing staging ${persona} identity`);
  return { user_id: user.id, persona };
});
const owner = identities[0].user_id;
const { data: lab, error } = await admin
  .from("developer_test_workspaces")
  .select("academy_id,active_persona")
  .eq("developer_user_id", owner)
  .single();
if (error || lab.active_persona !== "owner")
  throw new Error("Restore the registered test lab owner persona first");
for (const identity of identities) {
  const { data: members, error: memberError } = await admin
    .from("academy_members")
    .select("academy_id")
    .eq("user_id", identity.user_id);
  if (memberError || members.some((m) => m.academy_id !== lab.academy_id))
    throw new Error("Test identity is not isolated");
}
const { error: auditError } = await admin
  .from("developer_action_logs")
  .insert({
    actor_user_id: owner,
    action: "staging_test_login_registration_requested",
    target_type: "academy",
    target_id: lab.academy_id,
    details: { user_ids: identities.map((i) => i.user_id) },
  });
if (auditError) throw new Error("Registration audit failed");
const { error: writeError } = await admin
  .from("developer_test_login_accounts")
  .upsert(
    identities.map((i) => ({
      ...i,
      academy_id: lab.academy_id,
      enabled: true,
    })),
    { onConflict: "user_id" },
  );
if (writeError) throw new Error("Registration failed");
const { data: context, error: contextError } = await admin.rpc(
  "get_test_login_context",
  { p_actor_id: owner },
);
if (contextError || context.accounts.length !== 4)
  throw new Error(
    "Server isolation validation failed; unsafe identities cannot switch",
  );
console.log(
  "Registered four isolated staging test identities; existing test data preserved.",
);
