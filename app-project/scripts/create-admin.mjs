/**
 * One-time bootstrap: creates the single teacher/admin account.
 *
 * Run this once, locally, after applying the migrations:
 *
 *   SUPABASE_URL=https://xxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
 *   ADMIN_EMAIL=teacher@example.com \
 *   ADMIN_NAME="Ms. Rivera" \
 *   node scripts/create-admin.mjs
 *
 * It prints a one-time temporary password — sign in with it and change it
 * immediately from your own account settings. This script refuses to run
 * a second time (enforced both here and by the trg_enforce_single_admin
 * database trigger).
 */
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const fullName = process.env.ADMIN_NAME || "Teacher";

if (!url || !serviceRoleKey || !email) {
  console.error(
    "Missing required env vars. Provide SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_EMAIL."
  );
  process.exit(1);
}

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 14) {
  let out = "";
  for (let i = 0; i < length; i++) out += CHARS[randomInt(0, CHARS.length)];
  return out;
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { count: existingAdmins } = await supabase
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "admin");

if ((existingAdmins ?? 0) > 0) {
  console.error("An admin account already exists. Refusing to create a second one.");
  process.exit(1);
}

const password = generatePassword();

const { data: created, error: createErr } = await supabase.auth.admin.createUser({
  email: email.toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, must_change_password: true },
});

if (createErr || !created?.user) {
  console.error("Could not create the admin auth user:", createErr?.message);
  process.exit(1);
}

const { error: profileErr } = await supabase.from("profiles").insert({
  id: created.user.id,
  full_name: fullName,
  email: email.toLowerCase(),
  role: "admin",
  status: "active",
});

if (profileErr) {
  console.error("Could not create the admin profile:", profileErr.message);
  await supabase.auth.admin.deleteUser(created.user.id).catch(() => {});
  process.exit(1);
}

console.log("Admin account created.");
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log("Sign in and set your own password immediately — this one is shown only once.");
