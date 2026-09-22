import { DEPLOYMENT_TARGETS } from '../src/config/deploymentTargets.js';

export { DEPLOYMENT_TARGETS };

function origin(value, label) {
  try {
    return new URL(String(value || "")).origin;
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
}

export function validateDeploymentEnvironment(env, { command = "build" } = {}) {
  if (command !== "build")
    return { environment: env.VITE_DEPLOY_ENV || "local" };
  const supabaseOrigin = origin(env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL");
  const explicitEnvironment = String(env.VITE_DEPLOY_ENV || "").trim();
  const isRemoteBuild = env.VERCEL === "1" || env.CI === "true";
  let environment = explicitEnvironment;

  if (!environment && !isRemoteBuild) {
    environment =
      Object.entries(DEPLOYMENT_TARGETS).find(
        ([, target]) => target.supabaseOrigin === supabaseOrigin,
      )?.[0] || "local";
  }
  if (isRemoteBuild && !explicitEnvironment) {
    throw new Error("Remote builds require an explicit VITE_DEPLOY_ENV");
  }
  if (!["local", "staging", "production"].includes(environment)) {
    throw new Error("VITE_DEPLOY_ENV must be local, staging or production");
  }
  if (!env.VITE_SUPABASE_ANON_KEY)
    throw new Error("VITE_SUPABASE_ANON_KEY is required");

  if (environment === "local") {
    const hostname = new URL(supabaseOrigin).hostname;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
      throw new Error("A local build cannot use a remote Supabase project");
    }
    return { environment, supabaseOrigin, appOrigin: null };
  }

  const target = DEPLOYMENT_TARGETS[environment];
  if (supabaseOrigin !== target.supabaseOrigin) {
    throw new Error(
      `${environment} build is connected to the wrong Supabase project`,
    );
  }
  // The canonical URL is versioned with the matching Supabase project. An
  // absent or malformed legacy Vercel variable must not block a safe build.
  // A valid, conflicting URL is still rejected instead of silently ignored.
  let configuredAppOrigin = null;
  if (env.VITE_PUBLIC_APP_URL) {
    try {
      configuredAppOrigin = origin(env.VITE_PUBLIC_APP_URL, "VITE_PUBLIC_APP_URL");
    } catch {
      // The client uses target.appOrigin below, not this malformed value.
    }
  }
  if (configuredAppOrigin && configuredAppOrigin !== target.appOrigin) {
    throw new Error(`${environment} build has the wrong public app URL`);
  }
  return { environment, supabaseOrigin, appOrigin: target.appOrigin };
}
