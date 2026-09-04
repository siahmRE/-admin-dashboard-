import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (user.user_metadata?.must_change_password) {
    redirect("/set-password");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status, full_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role === "admin") {
    redirect("/admin");
  }

  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/login");
  }

  // Best-effort activity heartbeat — never blocks rendering.
  try {
    await supabase.rpc("record_my_activity");
  } catch {
    // Non-critical — ignore.
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-4 text-center">
      <h1 className="font-display text-[22px] font-semibold text-[var(--ink)]">
        Welcome, {profile.full_name.split(" ")[0]}
      </h1>
      <p className="mt-2 max-w-sm text-[14px] text-[var(--ink-faint)]">
        Your student home page and chat with your teacher live here. This starter focuses on the
        admin side — wire up your own student experience against the same conversations/messages
        tables.
      </p>
    </div>
  );
}
