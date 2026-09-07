// ============================================================================
// bootstrap-admin
//
// Creates the ONE teacher/admin account. Run this exactly once, via the
// Supabase Dashboard: Edge Functions → bootstrap-admin → "Test" / "Invoke"
// panel, with a JSON body like:
//   { "email": "teacher@example.com", "fullName": "Ms. Rivera" }
//
// It refuses to run again once an admin exists (checked here AND enforced
// by the trg_enforce_single_admin database trigger as a backstop).
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 14) {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += CHARS[bytes[i] % CHARS.length];
  return out;
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { email, fullName } = await req.json();
    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: "An admin account already exists. Refusing to create a second one." }),
        { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }

    const password = generatePassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || "Teacher", must_change_password: true },
    });

    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Could not create admin auth user." }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      full_name: fullName || "Teacher",
      email: email.toLowerCase().trim(),
      role: "admin",
      status: "active",
    });

    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        message: "Admin account created. Sign in and set your own password immediately — it's shown only once.",
        email: email.toLowerCase().trim(),
        temporaryPassword: password,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
