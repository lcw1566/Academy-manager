const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};
const json = (body, status = 200) => Response.json(body, { status, headers });

// Hard stop even if the function and enabling flag are accidentally deployed to
// production. All target identities are additionally selected by server UUIDs.
export function isStagingLoginEnabled(url, flag) {
  return flag === "true" && url === "https://owitlzsgxxuthgbmweyt.supabase.co";
}

export function createTestLoginHandler({
  enabled,
  authenticate,
  admin,
  login,
}) {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (!enabled) return json({ error: "Test login unavailable" }, 404);
    if (!["GET", "POST"].includes(req.method))
      return json({ error: "Method not allowed" }, 405);
    try {
      const auth = req.headers.get("Authorization") || "";
      if (!/^Bearer \S+$/i.test(auth))
        return json({ error: "Unauthorized" }, 401);
      const user = await authenticate(auth.slice(7));
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (req.method === "GET") {
        const { data, error } = await admin.rpc("get_test_login_context", {
          p_actor_id: user.id,
        });
        if (error?.code === "42501") return json({ error: "Forbidden" }, 403);
        if (error) throw new Error("Context unavailable");
        return json(data);
      }
      let input;
      try {
        input = await req.json();
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
      if (!["owner", "manager", "teacher", "invited"].includes(input?.persona))
        return json({ error: "Invalid test persona" }, 400);
      const { data: target, error } = await admin.rpc("authorize_test_login", {
        p_actor_id: user.id,
        p_persona: input.persona,
      });
      if (error?.code === "42501") return json({ error: "Forbidden" }, 403);
      if (error?.code === "54000")
        return json({ error: "잠시 후 다시 전환해주세요." }, 429);
      if (error) throw new Error("Authorization unavailable");
      // Credentials are server-only. Never accept an email, password or user ID
      // from the browser, and never log the returned session.
      const session = await login(target.email);
      if (!session || session.user.id !== target.user_id)
        throw new Error("Unexpected identity");
      const { error: auditError } = await admin
        .from("developer_action_logs")
        .insert({
          actor_user_id: user.id,
          action: "staging_test_login_issued",
          target_type: "test_account",
          target_id: target.user_id,
          details: { academy_id: target.academy_id, persona: input.persona },
        });
      if (auditError) throw new Error("Audit unavailable");
      return json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        academy_id: target.academy_id,
      });
    } catch {
      // No auth/provider error objects: these may contain credentials or tokens.
      return json(
        { error: "테스트 계정 전환에 실패했어요. 잠시 후 다시 시도해주세요." },
        503,
      );
    }
  };
}
