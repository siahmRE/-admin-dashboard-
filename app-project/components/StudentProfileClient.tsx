"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmDeleteDialog from "./ConfirmDeleteDialog";
import TemporaryPasswordDialog from "./TemporaryPasswordDialog";

type Student = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  student_id: string | null;
  notes: string | null;
  status: "active" | "disabled";
  created_at: string;
  last_activity_at: string | null;
};

type Message = {
  id: string;
  sender_role: "admin" | "student";
  body: string | null;
  audio_url: string | null;
  created_at: string;
  read_at: string | null;
};

export default function StudentProfileClient({
  student,
  conversationId,
  initialMessages,
}: {
  student: Student;
  conversationId: string | null;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState(student.full_name);
  const [phone, setPhone] = useState(student.phone ?? "");
  const [notes, setNotes] = useState(student.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resetResult, setResetResult] = useState<{
    email: string;
    fullName: string;
    temporaryPassword: string;
  } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName, phone: phone || null, notes: notes || null })
      .eq("id", student.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } else {
      setBanner("Could not save changes.");
    }
  }

  async function handleStatusChange(action: "disable" | "reactivate") {
    const res = await fetch(`/api/admin/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBanner(body?.error ?? "Could not update status.");
      return;
    }
    router.refresh();
  }

  async function handleResetPassword() {
    const res = await fetch(`/api/admin/students/${student.id}/reset-password`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBanner(body?.error ?? "Could not reset password.");
      return;
    }
    setResetResult(body);
  }

  async function handleDeleteConfirmed() {
    const res = await fetch(`/api/admin/students/${student.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? "Could not delete student.");
    router.push("/admin/students");
  }

  async function handleSend() {
    if (!draft.trim() || !conversationId) return;
    setSending(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userData.user?.id,
        sender_role: "admin",
        body: draft.trim(),
      })
      .select()
      .single();
    setSending(false);
    if (!error && data) {
      setMessages((prev) => [...prev, data as Message]);
      setDraft("");
    }
  }

  const currentStatus = student.status;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="font-display text-[20px] font-semibold text-[var(--ink)]">{student.full_name}</h1>
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide"
              style={{
                background: currentStatus === "active" ? "var(--accent-soft)" : "var(--warn-soft)",
                color: currentStatus === "active" ? "var(--accent)" : "var(--warn)",
              }}
            >
              {currentStatus}
            </span>
          </div>

          {banner && <p className="mb-3 text-[13px] text-[var(--danger)]">{banner}</p>}

          <div className="space-y-3">
            <Field label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
            </Field>
            <Field label="Email (login — cannot be changed here)">
              <input value={student.email} disabled className="input opacity-60" />
            </Field>
            <Field label="Phone">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
            </Field>
            {student.student_id && (
              <Field label="Student ID">
                <input value={student.student_id} disabled className="input opacity-60" />
              </Field>
            )}
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input min-h-[80px] resize-y" />
            </Field>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-4 rounded-md bg-[var(--ink)] px-4 py-2 text-[13px] font-medium text-[var(--surface)] transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
          </button>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--rule)] pt-3 text-[12px] text-[var(--ink-faint)]">
            <span>Added {new Date(student.created_at).toLocaleDateString()}</span>
            <span>
              Last activity{" "}
              {student.last_activity_at ? new Date(student.last_activity_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--rule)] bg-[var(--surface)] p-6 shadow-sm">
          <h2 className="mb-3 font-display text-[16px] font-semibold text-[var(--ink)]">Account actions</h2>
          <div className="flex flex-wrap gap-2">
            {currentStatus === "active" ? (
              <ActionButton tone="warn" onClick={() => handleStatusChange("disable")}>
                Disable account
              </ActionButton>
            ) : (
              <ActionButton tone="accent" onClick={() => handleStatusChange("reactivate")}>
                Reactivate account
              </ActionButton>
            )}
            <ActionButton tone="neutral" onClick={handleResetPassword}>
              Reset password
            </ActionButton>
            {currentStatus === "disabled" && (
              <ActionButton tone="danger" onClick={() => setShowDelete(true)}>
                Delete permanently
              </ActionButton>
            )}
          </div>
          {currentStatus === "active" && (
            <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
              Permanent deletion is only available once an account is disabled.
            </p>
          )}
        </div>
      </div>

      <div id="chat" className="flex h-[560px] flex-col rounded-xl border border-[var(--rule)] bg-[var(--surface)] shadow-sm">
        <div className="border-b border-[var(--rule)] px-5 py-3.5">
          <h2 className="font-display text-[16px] font-semibold text-[var(--ink)]">Chat</h2>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <p className="text-center text-[13px] text-[var(--ink-faint)]">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[75%] rounded-lg px-3 py-2 text-[13px]"
                  style={{
                    background: m.sender_role === "admin" ? "var(--ink)" : "var(--bg)",
                    color: m.sender_role === "admin" ? "var(--surface)" : "var(--ink)",
                  }}
                >
                  {m.body ? <p>{m.body}</p> : m.audio_url ? <p className="italic">Voice message</p> : null}
                  <p className="mt-1 text-[10px] opacity-60">{new Date(m.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {currentStatus === "disabled" ? (
          <p className="border-t border-[var(--rule)] px-5 py-3 text-[12px] text-[var(--ink-faint)]">
            This account is disabled. Reactivate it to send messages.
          </p>
        ) : (
          <div className="flex gap-2 border-t border-[var(--rule)] p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Write a message…"
              className="input flex-1"
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-md bg-[var(--ink)] px-4 text-[13px] font-medium text-[var(--surface)] disabled:opacity-40"
            >
              Send
            </button>
          </div>
        )}
      </div>

      {showDelete && (
        <ConfirmDeleteDialog
          studentName={student.full_name}
          onClose={() => setShowDelete(false)}
          onConfirmed={handleDeleteConfirmed}
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

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid var(--rule);
          background: var(--bg);
          padding: 0.5rem 0.75rem;
          font-size: 14px;
          color: var(--ink);
          outline: none;
        }
        .input:focus {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({
  tone,
  onClick,
  children,
}: {
  tone: "accent" | "warn" | "danger" | "neutral";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    accent: "text-[var(--accent)] hover:bg-[var(--accent-soft)]",
    warn: "text-[var(--warn)] hover:bg-[var(--warn-soft)]",
    danger: "text-[var(--danger)] hover:bg-[var(--danger-soft)]",
    neutral: "text-[var(--ink-soft)] hover:bg-[var(--bg)]",
  };
  return (
    <button onClick={onClick} className={`rounded-md border border-[var(--rule)] px-3 py-1.5 text-[13px] font-medium transition ${styles[tone]}`}>
      {children}
    </button>
  );
}
