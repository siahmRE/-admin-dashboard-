import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTemporaryPassword } from "@/lib/utils/generate-password";

type Params = { params: { id: string } };

/**
 * Secure, $0 account-recovery workflow: instead of an emailed reset link
 * (rate-limited / not guaranteed free at scale), the admin generates a new
 * one-time temporary password server-side and relays it to the student
 * directly. The student is required to set their own password on next
 * login (see /api/auth/set-password).
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = params;

  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    throw err;
  }

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, role, status, email, full_name")
    .eq("id", id)
    .single();

  if (targetErr || !target) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (target.role !== "student") {
    return NextResponse.json({ error: "Password reset is only available for student accounts." }, { status: 400 });
  }

  const temporaryPassword = generateTemporaryPassword();

  const { error: updateErr } = await admin.auth.admin.updateUserById(id, {
    password: temporaryPassword,
    user_metadata: { must_change_password: true },
  });

  if (updateErr) {
    return NextResponse.json({ error: "Could not reset the password." }, { status: 500 });
  }

  return NextResponse.json({
    email: target.email,
    fullName: target.full_name,
    temporaryPassword,
    instructions:
      "Share this password with the student through a private channel. They'll be required to set a new password on next login.",
  });
}
