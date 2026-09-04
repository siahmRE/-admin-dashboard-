"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError("Password must be at least 10 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Could not update password.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .single();

    router.push(profile?.role === "admin" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-[22px] font-semibold text-[var(--ink)]">Set your password</h1>
          <p className="mt-1 text-[14px] text-[var(--ink-faint)]">
            You signed in with a temporary password. Choose a new one only you know.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 shadow-sm">
          <div>
            <label htmlFor="newPassword" className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-[var(--rule)] bg-[var(--bg)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-md border border-[var(--rule)] bg-[var(--bg)] px-3 py-2 text-[14px] outline-none focus:border-[var(--accent)]"
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
            {loading ? "Saving…" : "Save password and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
