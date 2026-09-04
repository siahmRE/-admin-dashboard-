import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * DANGER: this client uses the SERVICE ROLE KEY and bypasses Row Level
 * Security entirely. It must:
 *   - Only ever be imported from files under app/api/** (server-only route
 *     handlers), never from a Server Component that renders user input,
 *     and never from anything reachable by "use client".
 *   - Only be used AFTER the caller has been verified as the admin via
 *     requireAdmin() (see lib/auth/require-admin.ts).
 *
 * It exists for exactly one class of operation RLS can't express: managing
 * entries in Supabase's auth.users table (creating a student's login,
 * setting a temporary password, disabling/deleting the auth account) via
 * the Auth Admin API.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "The service role key must never be exposed to the browser — set it " +
        "only in your server environment (e.g. Vercel project env vars)."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
