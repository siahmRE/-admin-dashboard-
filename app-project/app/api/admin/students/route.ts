import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTemporaryPassword } from "@/lib/utils/generate-password";

const MAX_ACTIVE_STUDENTS = 80;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  let adminUserId: string;
  try {
    const { user } = await requireAdmin();
    adminUserId = user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    throw err;
  }

  const body = await req.json().catch(() => null);
  const fullName = (body?.fullName ?? "").trim();
  const email = (body?.email ?? "").trim().toLowerCase();
  const phone = (body?.phone ?? "").trim() || null;
  const studentId = (body?.studentId ?? "").trim() || null;
  const notes = (body?.notes ?? "").trim() || null;

  if (!fullName) {
    return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const admin = createAdminClient();

  // ---- Check 1: email not already registered ------------------------------
  const { data: existing, error: existingErr } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: "Could not verify email uniqueness." }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(
      { error: "A student with this email is already registered." },
      { status: 409 }
    );
  }

  // ---- Check 2: 80 active-student cap (checked here for a fast, friendly
  // error message; enforced again — non-negotiably — by a DB trigger below
  // in case of a race between two admin tabs, or a future non-API caller). -
  const { count: activeCount, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "student")
    .eq("status", "active");

  if (countErr) {
    return NextResponse.json({ error: "Could not verify capacity." }, { status: 500 });
  }
  if ((activeCount ?? 0) >= MAX_ACTIVE_STUDENTS) {
    return NextResponse.json(
      {
        error: `Maximum capacity reached: ${MAX_ACTIVE_STUDENTS} active students. Disable or delete an existing student before adding a new one.`,
        code: "ACTIVE_STUDENT_LIMIT_REACHED",
      },
      { status: 409 }
    );
  }

  // ---- Create the auth user with a one-time temporary password -----------
  const temporaryPassword = generateTemporaryPassword();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true, // no email deliverability required — stays $0
    user_metadata: { full_name: fullName, must_change_password: true },
  });

  if (createErr || !created?.user) {
    const message = createErr?.message ?? "Could not create the student's login.";
    const status = message.toLowerCase().includes("already") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  // ---- Create the profile row ---------------------------------------------
  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    phone,
    student_id: studentId,
    notes,
    role: "student",
    status: "active",
    created_by: adminUserId,
  });

  if (profileErr) {
    // Roll back the orphaned auth user so retrying doesn't hit "email exists".
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    const isCap = profileErr.message.includes("ACTIVE_STUDENT_LIMIT_REACHED");
    return NextResponse.json(
      {
        error: isCap
          ? `Maximum capacity reached: ${MAX_ACTIVE_STUDENTS} active students.`
          : "Could not create the student profile.",
        code: isCap ? "ACTIVE_STUDENT_LIMIT_REACHED" : undefined,
      },
      { status: isCap ? 409 : 500 }
    );
  }

  // Create their empty conversation so "Open chat" always has a thread.
  await admin.from("conversations").insert({ student_id: created.user.id }).select().maybeSingle();

  return NextResponse.json({
    student: { id: created.user.id, fullName, email, phone, studentId, notes, status: "active" },
    // Shown to the admin ONCE. Not stored anywhere in plaintext.
    setup: {
      method: "temporary_password",
      email,
      temporaryPassword,
      instructions:
        "Share this password with the student through a private channel (in person, or a message you already trust). They'll be required to set their own password on first login.",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const search = req.nextUrl.searchParams.get("q") ?? "";

    const { data, error } = await supabase.rpc("admin_list_students", { search });
    if (error) throw error;

    return NextResponse.json({ students: data });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not load students." }, { status: 500 });
  }
}
