import "server-only";
import { createClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Verifies the current request is from the signed-in admin, by:
 *   1. Reading the session from the (httpOnly, signed) Supabase cookie.
 *   2. Asking Supabase Auth to validate it server-side (getUser(), not the
 *      locally-decoded getSession(), so a tampered/expired token is caught).
 *   3. Looking up that user's role in `profiles` via a query that itself
 *      goes through RLS (is_admin()) — i.e. the database, not the client,
 *      is the source of truth for "is this an admin".
 *
 * Every /api/admin/** route must call this before doing anything else.
 * Never accept a `role` or `isAdmin` field from the request body.
 */
export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new UnauthorizedError("Not signed in.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, status, full_name, email")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    throw new ForbiddenError("Admin access required.");
  }

  return { user, profile, supabase };
}
