import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type DashboardStats = {
  total_students: number;
  active_students: number;
  disabled_students: number;
  max_active_students: number;
  unread_messages: number;
};

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const { data: stats } = (await supabase.rpc("admin_dashboard_stats").single()) as {
    data: DashboardStats | null;
  };
  const { data: recent } = await supabase
    .from("profiles")
    .select("id, full_name, email, status, last_activity_at, created_at")
    .eq("role", "student")
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(6);

  const total = stats?.total_students ?? 0;
  const active = stats?.active_students ?? 0;
  const disabled = stats?.disabled_students ?? 0;
  const cap = stats?.max_active_students ?? 80;
  const unread = stats?.unread_messages ?? 0;
  const pct = Math.min(100, Math.round((active / cap) * 100));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--ink)] sm:text-[26px]">Dashboard</h1>
          <p className="mt-1 text-[14px] text-[var(--ink-faint)]">Roster status and recent activity, at a glance.</p>
        </div>
        <Link
          href="/admin/students?add=1"
          className="rounded-md bg-[var(--ink)] px-4 py-2.5 text-center text-[14px] font-medium text-[var(--surface)] transition hover:opacity-90 sm:py-2"
        >
          + Add Student
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Signature element: a stamped capacity ring, ledger-style */}
        <div className="flex items-center gap-4 rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5 shadow-sm">
          <CapacityRing pct={pct} />
          <div>
            <p className="font-mono-data text-[22px] font-semibold text-[var(--ink)]">
              {active}
              <span className="text-[var(--ink-faint)]"> / {cap}</span>
            </p>
            <p className="text-[13px] text-[var(--ink-faint)]">active students</p>
          </div>
        </div>

        <StatCard label="Total students" value={total} />
        <StatCard label="Disabled" value={disabled} tone="warn" />
        <StatCard label="Unread messages" value={unread} tone={unread > 0 ? "accent" : undefined} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[17px] font-semibold text-[var(--ink)]">Recent activity</h2>
          <Link href="/admin/students" className="text-[13px] font-medium text-[var(--accent)] hover:underline">
            View all students →
          </Link>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--surface)] shadow-sm">
          {!recent || recent.length === 0 ? (
            <p className="p-6 text-center text-[14px] text-[var(--ink-faint)]">
              No students yet. Add your first student to get started.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {recent.map((s) => (
                <li key={s.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3.5">
                  <div className="min-w-0">
                    <Link href={`/admin/students/${s.id}`} className="text-[14px] font-medium text-[var(--ink)] hover:underline">
                      {s.full_name}
                    </Link>
                    <p className="truncate text-[13px] text-[var(--ink-faint)]">{s.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusPill status={s.status} />
                    <span className="font-mono-data text-[12px] text-[var(--ink-faint)]">
                      {s.last_activity_at
                        ? new Date(s.last_activity_at).toLocaleDateString()
                        : "no activity yet"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "accent";
}) {
  const toneColor =
    tone === "warn" ? "var(--warn)" : tone === "accent" ? "var(--accent)" : "var(--ink)";
  return (
    <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-5 shadow-sm">
      <p className="font-mono-data text-[26px] font-semibold" style={{ color: toneColor }}>
        {value}
      </p>
      <p className="text-[13px] text-[var(--ink-faint)]">{label}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide"
      style={{
        background: active ? "var(--accent-soft)" : "var(--warn-soft)",
        color: active ? "var(--accent)" : "var(--warn)",
      }}
    >
      {status}
    </span>
  );
}

function CapacityRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}
