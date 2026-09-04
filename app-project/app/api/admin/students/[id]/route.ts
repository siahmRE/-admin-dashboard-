import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

type Params = { params: { id: string } };

/**
 * PATCH: change status only (disable / reactivate). Profile fields
 * (name/phone/notes) are edited via the student's own row through the
 * normal Supabase client from the profile page — this route is
 * specifically the privileged status-change action.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = params;

  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    throw err;
  }

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (!["disable", "reactivate"].includes(action)) {
    return NextResponse.json(
      { error: "Invalid action. Use 'disable' or 'reactivate'." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", id)
    .single();

  if (targetErr || !target) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (target.role !== "student") {
    return NextResponse.json({ error: "Only student accounts can be disabled or reactivated." }, { status: 400 });
  }

  const newStatus = action === "disable" ? "disabled" : "active";

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ status: newStatus })
    .eq("id", id);

  if (updateErr) {
    const isCap = updateErr.message.includes("ACTIVE_STUDENT_LIMIT_REACHED");
    return NextResponse.json(
      {
        error: isCap
          ? "Cannot reactivate: the 80 active-student limit has been reached."
          : "Could not update the student's status.",
        code: isCap ? "ACTIVE_STUDENT_LIMIT_REACHED" : undefined,
      },
      { status: isCap ? 409 : 500 }
    );
  }

  return NextResponse.json({ id, status: newStatus });
}

/**
 * DELETE: permanent deletion. Requires an explicit confirmation flag in the
 * request body so this can never be triggered by a single accidental click
 * on the client — the UI must show a typed/checked confirmation first.
 * This removes the auth user (cascades to profile -> conversations ->
 * messages via FK ON DELETE CASCADE) and any associated audio files.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = params;

  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    throw err;
  }

  const body = await req.json().catch(() => null);
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "Permanent deletion requires explicit confirmation." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", id)
    .single();

  if (targetErr || !target) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (target.role !== "student") {
    return NextResponse.json({ error: "Only student accounts can be deleted this way." }, { status: 400 });
  }
  if (target.status !== "disabled") {
    return NextResponse.json(
      { error: "Disable the student before permanently deleting them." },
      { status: 409 }
    );
  }

  // Best-effort: remove any audio files this student's conversation holds.
  const { data: convo } = await admin
    .from("conversations")
    .select("id")
    .eq("student_id", id)
    .maybeSingle();

  if (convo) {
    const { data: audioMessages } = await admin
      .from("messages")
      .select("audio_url")
      .eq("conversation_id", convo.id)
      .not("audio_url", "is", null);

    const paths = (audioMessages ?? [])
      .map((m) => m.audio_url)
      .filter((p): p is string => Boolean(p));

    if (paths.length > 0) {
      await admin.storage.from("audio-messages").remove(paths).catch(() => {});
    }
  }

  // Deleting the auth user cascades to profiles -> conversations -> messages
  // via the FKs declared with ON DELETE CASCADE in the migrations.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
  if (deleteErr) {
    return NextResponse.json({ error: "Could not delete the student's account." }, { status: 500 });
  }

  return NextResponse.json({ id, deleted: true });
}
