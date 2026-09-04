"use client";

import { useState, type FormEvent } from "react";
import Modal from "./Modal";

type CreatedSetup = {
  email: string;
  temporaryPassword: string;
  instructions: string;
};

export default function AddStudentModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [studentId, setStudentId] = useState("");
  const [notes, setNotes] = useState("");
  const [showOptional, setShowOptional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [setup, setSetup] = useState<CreatedSetup | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, phone, studentId, notes }),
    });

    const body = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(body?.error ?? "Could not add student.");
      return;
    }

    setSetup(body.setup);
    onCreated();
  }

  if (setup) {
    return (
      <Modal title="Student added successfully" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-[14px] text-[var(--ink-soft)]">
            Share this login with the student through a private channel (in person, or a message
            you already trust). They'll be asked to set their own password the first time they
            sign in.
          </p>
          <div className="space-y-2 rounded-lg border border-[var(--rule)] bg-[var(--bg)] p-4 font-mono-data text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-faint)]">Email</span>
              <span className="text-[var(--ink)]">{setup.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--ink-faint)]">Temporary password</span>
              <span className="text-[var(--ink)]">{setup.temporaryPassword}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(
                `Email: ${setup.email}\nTemporary password: ${setup.temporaryPassword}`
              );
              setCopied(true);
            }}
            className="w-full rounded-md border border-[var(--rule)] py-2 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--bg)]"
          >
            {copied ? "Copied ✓" : "Copy login details"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-[var(--ink)] py-2.5 text-[14px] font-medium text-[var(--surface)] transition hover:opacity-90"
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add New Student" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" required>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input"
            placeholder="e.g. Amina El Fassi"
            autoFocus
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="student@example.com"
          />
        </Field>

        <Field label="Phone (optional)">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            placeholder="For your records only — no SMS is sent"
          />
        </Field>

        {!showOptional ? (
          <button
            type="button"
            onClick={() => setShowOptional(true)}
            className="text-[13px] font-medium text-[var(--accent)] hover:underline"
          >
            + Add student ID or notes
          </button>
        ) : (
          <>
            <Field label="Student ID (optional)">
              <input value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input" />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input min-h-[70px] resize-y"
              />
            </Field>
          </>
        )}

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
          {loading ? "Creating…" : "Create Student"}
        </button>
      </form>

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
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">
        {label} {required && <span className="text-[var(--danger)]">*</span>}
      </span>
      {children}
    </label>
  );
}
