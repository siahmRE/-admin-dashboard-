import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Source of truth for "is this an admin" — a DB read gated by RLS
  // (profiles_select policy), never a value trusted from the client.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    // A student who navigates to /admin lands here, not in the dashboard.
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--rule)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--ink)] text-[13px] font-semibold text-[var(--surface)]">
              A
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight text-[var(--ink)] sm:text-[17px]">
              Admin Dashboard
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="flex items-center gap-1 text-[13px] sm:text-[14px]">
              <Link
                href="/admin"
                className="rounded-md px-2 py-1.5 text-[var(--ink-soft)] transition hover:bg-[var(--bg)] hover:text-[var(--ink)] sm:px-3"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/students"
                className="rounded-md px-2 py-1.5 text-[var(--ink-soft)] transition hover:bg-[var(--bg)] hover:text-[var(--ink)] sm:px-3"
              >
                Students
              </Link>
            </nav>
            <div className="hidden h-5 w-px bg-[var(--rule)] sm:block" />
            <span className="hidden text-[13px] text-[var(--ink-faint)] sm:inline">{profile.full_name}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
