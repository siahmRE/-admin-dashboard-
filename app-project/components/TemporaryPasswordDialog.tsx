"use client";

import { useState } from "react";
import Modal from "./Modal";

export default function TemporaryPasswordDialog({
  email,
  fullName,
  temporaryPassword,
  onClose,
}: {
  email: string;
  fullName: string;
  temporaryPassword: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Password reset" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[14px] text-[var(--ink-soft)]">
          A new temporary password was generated for <strong>{fullName}</strong>. Share it through
          a private channel — it won't be shown again.
        </p>
        <div className="space-y-2 rounded-lg border border-[var(--rule)] bg-[var(--bg)] p-4 font-mono-data text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-faint)]">Email</span>
            <span>{email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--ink-faint)]">Temporary password</span>
            <span>{temporaryPassword}</span>
          </div>
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(`Email: ${email}\nTemporary password: ${temporaryPassword}`);
            setCopied(true);
          }}
          className="w-full rounded-md border border-[var(--rule)] py-2 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--bg)]"
        >
          {copied ? "Copied ✓" : "Copy login details"}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-md bg-[var(--ink)] py-2.5 text-[14px] font-medium text-[var(--surface)] transition hover:opacity-90"
        >
          Done
        </button>
      </div>
    </Modal>
  );
}
