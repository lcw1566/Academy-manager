import { createClient } from "npm:@supabase/supabase-js@2";
import { createTestLoginHandler, isStagingLoginEnabled } from "./handler.mjs";

const url = Deno.env.get("SUPABASE_URL") || "";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  options,
);
Deno.serve(
  createTestLoginHandler({
    enabled: isStagingLoginEnabled(
      url,
      Deno.env.get("SEENIT_ENABLE_TEST_LOGIN"),
    ),
    admin,
    authenticate: async (token: string) => {
      const { data, error } = await admin.auth.getUser(token);
      return error ? null : data.user;
    },
    login: async (email: string) => {
      const password = Deno.env.get("STAGING_TEST_ACCOUNT_PASSWORD");
      if (!password) return null;
      const client = createClient(
        url,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        options,
      );
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return null;
      return data.session;
    },
  }),
);
