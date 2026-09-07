// ============================================================================
// admin-actions
//
// Every privileged action the admin can take on a student account, in one
// function, routed by body.action. Called from the frontend with:
//   sb.functions.invoke('admin-actions', { body: { action: '...', ... } })
// supabase-js automatically attaches the signed-in admin's session token,
// which this function verifies before doing anything (requireAdmin below) —
// exactly like the original Next.js API routes, just hosted on Supabase
// instead of Vercel.
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_ACTIVE_STUDENTS = 80;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generatePassword(length = 12) {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) out += CHARS[bytes[i] % CHARS.length];
  return out;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client bound to the CALLER's own token — used only to verify identity
  // and role. Never used to perform the privileged action itself.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  const { data: { user }, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !user) return json({ error: "Not signed in." }, 401);

  const { data: callerProfile, error: callerProfileErr } = await callerClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (callerProfileErr || !callerProfile || callerProfile.role !== "admin") {
    return json({ error: "Admin access required." }, 403);
  }

  // Only now do we touch the service-role client — after confirming, via
  // the database itself (not a client-sent flag), that the caller is admin.
  const admin = createClient(supabaseUrl, serviceKey);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  switch (body?.action) {
    case "list": {
      // Uses the CALLER's own session (not the service-role client) so
      // the is_admin() check inside admin_list_students resolves against
      // auth.uid() correctly — a service-role call has no user context.
      const { data, error } = await callerClient.rpc("admin_list_students", { search: body.search ?? "" });
      if (error) return json({ error: "Could not load students." }, 500);
      return json({ students: data });
    }

    case "create": {
      const fullName = (body.fullName ?? "").trim();
      const email = (body.email ?? "").trim().toLowerCase();
      const phone = (body.phone ?? "").trim() || null;
      const studentId = (body.studentId ?? "").trim() || null;
      const notes = (body.notes ?? "").trim() || null;

      if (!fullName) return json({ error: "Full name is required." }, 400);
      if (!email || !isValidEmail(email)) return json({ error: "A valid email address is required." }, 400);

      const { data: existing } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
      if (existing) return json({ error: "A student with this email is already registered." }, 409);

      const { count: activeCount } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student")
        .eq("status", "active");

      if ((activeCount ?? 0) >= MAX_ACTIVE_STUDENTS) {
        return json(
          {
            error: `Maximum capacity reached: ${MAX_ACTIVE_STUDENTS} active students. Disable or delete an existing student before adding a new one.`,
            code: "ACTIVE_STUDENT_LIMIT_REACHED",
          },
          409
        );
      }

      const temporaryPassword = generatePassword();
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName, must_change_password: true },
      });

      if (createErr || !created?.user) {
        const message = createErr?.message ?? "Could not create the student's login.";
        return json({ error: message }, message.toLowerCase().includes("already") ? 409 : 500);
      }

      const { error: profileErr } = await admin.from("profiles").insert({
        id: created.user.id,
        full_name: fullName,
        email,
        phone,
        student_id: studentId,
        notes,
        role: "student",
        status: "active",
        created_by: user.id,
      });

      if (profileErr) {
        await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
        const isCap = profileErr.message.includes("ACTIVE_STUDENT_LIMIT_REACHED");
        return json(
          {
            error: isCap
              ? `Maximum capacity reached: ${MAX_ACTIVE_STUDENTS} active students.`
              : "Could not create the student profile.",
            code: isCap ? "ACTIVE_STUDENT_LIMIT_REACHED" : undefined,
          },
          isCap ? 409 : 500
        );
      }

      await admin.from("conversations").insert({ student_id: created.user.id }).select().maybeSingle();

      return json({
        student: { id: created.user.id, fullName, email, phone, studentId, notes, status: "active" },
        setup: {
          email,
          temporaryPassword,
          instructions:
            "Share this password with the student through a private channel. They'll set their own password on first login.",
        },
      });
    }

    case "status": {
      const { id, newStatus } = body;
      if (!id || !["active", "disabled"].includes(newStatus)) {
        return json({ error: "Invalid request." }, 400);
      }
      const { data: target } = await admin.from("profiles").select("id, role").eq("id", id).single();
      if (!target || target.role !== "student") return json({ error: "Student not found." }, 404);

      const { error } = await admin.from("profiles").update({ status: newStatus }).eq("id", id);
      if (error) {
        const isCap = error.message.includes("ACTIVE_STUDENT_LIMIT_REACHED");
        return json(
          { error: isCap ? "Cannot reactivate: the 80 active-student limit has been reached." : "Could not update status." },
          isCap ? 409 : 500
        );
      }
      return json({ id, status: newStatus });
    }

    case "reset_password": {
      const { id } = body;
      const { data: target } = await admin
        .from("profiles")
        .select("id, role, email, full_name")
        .eq("id", id)
        .single();
      if (!target || target.role !== "student") return json({ error: "Student not found." }, 404);

      const temporaryPassword = generatePassword();
      const { error } = await admin.auth.admin.updateUserById(id, {
        password: temporaryPassword,
        user_metadata: { must_change_password: true },
      });
      if (error) return json({ error: "Could not reset password." }, 500);

      return json({ email: target.email, fullName: target.full_name, temporaryPassword });
    }

    case "delete": {
      const { id, confirm } = body;
      if (confirm !== true) return json({ error: "Permanent deletion requires explicit confirmation." }, 400);

      const { data: target } = await admin.from("profiles").select("id, role, status").eq("id", id).single();
      if (!target || target.role !== "student") return json({ error: "Student not found." }, 404);
      if (target.status !== "disabled") {
        return json({ error: "Disable the student before permanently deleting them." }, 409);
      }

      const { data: convo } = await admin.from("conversations").select("id").eq("student_id", id).maybeSingle();
      if (convo) {
        const { data: audioMessages } = await admin
          .from("messages")
          .select("audio_url")
          .eq("conversation_id", convo.id)
          .not("audio_url", "is", null);
        const paths = (audioMessages ?? []).map((m: any) => m.audio_url).filter(Boolean);
        if (paths.length > 0) await admin.storage.from("audio-messages").remove(paths).catch(() => {});
      }

      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: "Could not delete the student's account." }, 500);

      return json({ id, deleted: true });
    }

    default:
      return json({ error: "Unknown action." }, 400);
  }
});
