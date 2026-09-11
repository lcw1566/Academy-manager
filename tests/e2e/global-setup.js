import { assertLocalE2eEnvironment } from './support/supabase.js';
import { provisionRoleTestLab } from './support/provision.js';

export default async function globalSetup() {
  assertLocalE2eEnvironment();
  await provisionRoleTestLab();
}
