"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AddStudentModal from "./AddStudentModal";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import TemporaryPasswordDialog from "./TemporaryPasswordDialog";

type Student = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: "active" | "disabled";
  created_at: string;
  last_activity_at: string | null;
  unread_count: number;
  conversation_id: string | null;
};

export default function StudentsClient({ initialCap }: { initialCap: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(searchParams.get("add") === "1");
  const [pendingDelete, setPendingDelete] = useState<Student | null>(null);
  const [resetResult, setResetResult] = useState<{
    email: string;
    fullName: string;
    temporaryPassword: string;
  } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/students?q=${encodeURIComponent(q)}`);
    const body = await res.json().catch(() => ({ students: [] }));
    setStudents(body.students ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => load(query), 250);
    return () => clearTimeout(timeout);
  }, [query, load]);

  const activeCount = students.filter((s) => s.status === "active").length;

  async function handleStatusChange(student: Student, action: "disable" | "reactivate") {
    setBusyId(student.id);
    const res = await fetch(`/api/admin/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setBanner(body?.error ?? "Could not update student status.");
      return;
    }
    setBanner(action === "disable" ? `${student.full_name} disabled.` : `${student.full_name} reactivated.`);
    load(query);
  }

  async function handleResetPassword(student: Student) {
    setBusyId(student.id);
    const res = await fetch(`/api/admin/students/${student.id}/reset-password`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setBanner(body?.error ?? "Could not reset password.");
      return;
    }
    setResetResult(body);
  }

  async function handleDeleteConfirmed(student: Student) {
    const res = await fetch(`/api/admin/students/${student.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.error ?? "Could not delete student.");
    }
    setPendingDelete(null);
    setBanner(`${student.full_name} was permanently deleted.`);
    load(query);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-[22px] font-semibold text-[var(--ink)] sm:text-[26px]">Students</h1>
          <p className="mt-1 font-mono-data text-[13px] text-[var(--ink-faint)]">
            {activeCount} / {initialCap} active
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-md bg-[var(--ink)] px-4 py-2.5 text-[14px] font-medium text-[var(--surface)] transition hover:opacity-90 sm:py-2"
        >
          + Add Student
        </button>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, email, or phone…"
        className="w-full rounded-md border border-[var(--rule)] bg-[var(--surface)] px-3 py-2.5 text-[16px] outline-none focus:border-[var(--accent)] sm:max-w-md sm:py-2 sm:text-[14px]"
      />

      {banner && (
        <div className="flex items-center justify-between rounded-md border border-[var(--rule)] bg-[var(--surface)] px-4 py-2.5 text-[13px] text-[var(--ink-soft)]">
          {banner}
          <button onClick={() => setBanner(null)} className="text-[var(--ink-faint)]">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] px-5 py-8 text-center text-[var(--ink-faint)] shadow-sm">
          Loading…
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] px-5 py-10 text-center text-[var(--ink-faint)] shadow-sm">
          {query ? "No students match your search." : "No students yet. Add your first student to get started."}
        </div>
      ) : (
        <>
          {/* Desktop / tablet: full table. Hidden below sm. */}
          <div className="hidden overflow-x-auto rounded-xl border border-[var(--rule)] bg-[var(--surface)] shadow-sm sm:block">
            <table className="w-full text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--rule)] text-[12px] uppercase tracking-wide text-[var(--ink-faint)]">
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Added</th>
                  <th className="px-5 py-3 font-medium">Last activity</th>
                  <th className="px-5 py-3 font-medium">Unread</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {students.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/students/${s.id}`} className="font-medium text-[var(--ink)] hover:underline">
                        {s.full_name}
                      </Link>
                      <p className="text-[13px] text-[var(--ink-faint)]">{s.email}</p>
                    </td>
                    <td className="px-5 py-3.5 font-mono-data text-[13px] text-[var(--ink-soft)]">
                      {s.phone || "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusPill status={s.status} />
                    </td>
                    <td className="px-5 py-3.5 font-mono-data text-[13px] text-[var(--ink-soft)]">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 font-mono-data text-[13px] text-[var(--ink-soft)]">
                      {s.last_activity_at ? new Date(s.last_activity_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3.5">
                      <UnreadBadge count={s.unread_count} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <RowActions
                          student={s}
                          busy={busyId === s.id}
                          onDisable={() => handleStatusChange(s, "disable")}
                          onReactivate={() => handleStatusChange(s, "reactivate")}
                          onResetPassword={() => handleResetPassword(s)}
                          onDelete={() => setPendingDelete(s)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: stacked cards. Hidden at sm and above. */}
          <ul className="space-y-3 sm:hidden">
            {students.map((s) => (
              <li key={s.id} className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/admin/students/${s.id}`} className="font-medium text-[var(--ink)] hover:underline">
                      {s.full_name}
                    </Link>
                    <p className="truncate text-[13px] text-[var(--ink-faint)]">{s.email}</p>
                    {s.phone && <p className="font-mono-data text-[12px] text-[var(--ink-faint)]">{s.phone}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusPill status={s.status} />
                    <UnreadBadge count={s.unread_count} />
                  </div>
                </div>

                <div className="mt-2.5 flex justify-between font-mono-data text-[11px] text-[var(--ink-faint)]">
                  <span>Added {new Date(s.created_at).toLocaleDateString()}</span>
                  <span>
                    Active {s.last_activity_at ? new Date(s.last_activity_at).toLocaleDateString() : "—"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--rule)] pt-3">
                  <RowActions
                    student={s}
                    busy={busyId === s.id}
                    onDisable={() => handleStatusChange(s, "disable")}
                    onReactivate={() => handleStatusChange(s, "reactivate")}
                    onResetPassword={() => handleResetPassword(s)}
                    onDelete={() => setPendingDelete(s)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {showAdd && (
        <AddStudentModal
          onClose={() => {
            setShowAdd(false);
            router.replace("/admin/students");
          }}
          onCreated={() => load(query)}
        />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          studentName={pendingDelete.full_name}
          onClose={() => setPendingDelete(null)}
          onConfirmed={() => handleDeleteConfirmed(pendingDelete)}
        />
      )}

      {resetResult && (
        <TemporaryPasswordDialog
          email={resetResult.email}
          fullName={resetResult.fullName}
          temporaryPassword={resetResult.temporaryPassword}
          onClose={() => setResetResult(null)}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "active" | "disabled" }) {
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

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return <span className="text-[var(--ink-faint)]">—</span>;
  return (
    <span className="rounded-full bg-[var(--danger)] px-2 py-0.5 text-[11px] font-semibold text-white">
      {count} unread
    </span>
  );
}

function RowActions({
  student,
  busy,
  onDisable,
  onReactivate,
  onResetPassword,
  onDelete,
}: {
  student: Student;
  busy: boolean;
  onDisable: () => void;
  onReactivate: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Link
        href={`/admin/students/${student.id}#chat`}
        className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
      >
        Chat
      </Link>
      <Link
        href={`/admin/students/${student.id}`}
        className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg)]"
      >
        Profile
      </Link>
      {student.status === "active" ? (
        <button
          disabled={busy}
          onClick={onDisable}
          className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--warn)] hover:bg-[var(--warn-soft)] disabled:opacity-40"
        >
          Disable
        </button>
      ) : (
        <button
          disabled={busy}
          onClick={onReactivate}
          className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40"
        >
          Reactivate
        </button>
      )}
      <button
        disabled={busy}
        onClick={onResetPassword}
        className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink-soft)] hover:bg-[var(--bg)] disabled:opacity-40"
      >
        Reset password
      </button>
      {student.status === "disabled" && (
        <button
          onClick={onDelete}
          className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
        >
          Delete
        </button>
      )}
    </>
  );
}
