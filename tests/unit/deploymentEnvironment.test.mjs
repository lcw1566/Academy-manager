import test from "node:test";
import assert from "node:assert/strict";
import {
  DEPLOYMENT_TARGETS,
  validateDeploymentEnvironment,
} from "../../scripts/deployment-environment.mjs";

const key = "sb_publishable_synthetic";
const remote = (environment, patch = {}) => ({
  CI: "true",
  VITE_DEPLOY_ENV: environment,
  VITE_SUPABASE_URL: DEPLOYMENT_TARGETS[environment].supabaseOrigin,
  VITE_PUBLIC_APP_URL: DEPLOYMENT_TARGETS[environment].appOrigin,
  VITE_SUPABASE_ANON_KEY: key,
  ...patch,
});

test("accepts exact staging and production deployment pairs", () => {
  for (const environment of ["staging", "production"]) {
    assert.equal(
      validateDeploymentEnvironment(remote(environment)).environment,
      environment,
    );
  }
});

test("uses the canonical app URL when Vercel has no usable URL variable", () => {
  for (const publicUrl of [undefined, '', '<staging app URL>']) {
    const result = validateDeploymentEnvironment(remote('staging', { VITE_PUBLIC_APP_URL: publicUrl }));
    assert.equal(result.appOrigin, DEPLOYMENT_TARGETS.staging.appOrigin);
  }
});

test("rejects missing environment on remote builds", () => {
  assert.throws(
    () =>
      validateDeploymentEnvironment({
        CI: "true",
        VITE_SUPABASE_URL: DEPLOYMENT_TARGETS.production.supabaseOrigin,
        VITE_SUPABASE_ANON_KEY: key,
      }),
    /explicit VITE_DEPLOY_ENV/,
  );
});

test("rejects cross-connected app, Supabase and environment values", () => {
  assert.throws(
    () =>
      validateDeploymentEnvironment(
        remote("production", {
          VITE_SUPABASE_URL: DEPLOYMENT_TARGETS.staging.supabaseOrigin,
        }),
      ),
    /wrong Supabase/,
  );
  assert.throws(
    () =>
      validateDeploymentEnvironment(
        remote("staging", {
          VITE_PUBLIC_APP_URL: DEPLOYMENT_TARGETS.production.appOrigin,
        }),
      ),
    /wrong public app URL/,
  );
  assert.throws(
    () =>
      validateDeploymentEnvironment(
        remote("staging", {
          VITE_DEPLOY_ENV: "local",
        }),
      ),
    /local build cannot use a remote/,
  );
});

test("allows only loopback Supabase for local CI builds", () => {
  const result = validateDeploymentEnvironment({
    CI: "true",
    VITE_DEPLOY_ENV: "local",
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    VITE_SUPABASE_ANON_KEY: key,
  });
  assert.equal(result.environment, "local");
});
