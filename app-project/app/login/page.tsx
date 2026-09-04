"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      // Supabase Auth doesn't know about our "disabled" status — it will
      // happily authenticate a disabled student. We check status right
      // after sign-in and immediately sign them back out if disabled,
      // so a disabled account can never reach real app data (also backed
      // by RLS via is_active_student() on every other table).
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", data.user.id)
      .single();

    if (!profile) {
      await supabase.auth.signOut();
      setError("No profile found for this account. Contact your teacher.");
      setLoading(false);
      return;
    }

    if (profile.status === "disabled") {
      await supabase.auth.signOut();
      setError("This account has been disabled. Contact your teacher.");
      setLoading(false);
      return;
    }

    router.push(profile.role === "admin" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-md bg-[var(--ink)] font-display text-[17px] font-semibold text-[var(--surface)]">
            A
          </span>
          <h1 className="font-display text-[22px] font-semibold text-[var(--ink)]">Sign in</h1>
          <p className="mt-1 text-[14px] text-[var(--ink-faint)]">Use the email and password your teacher gave you.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[var(--rule)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--rule)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
              placeholder="••••••••••"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-[13px] text-[var(--danger)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[var(--ink)] py-2.5 text-[14px] font-medium text-[var(--surface)] transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
