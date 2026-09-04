"use client";

import { useState } from "react";
import Modal from "./Modal";

export default function ConfirmDeleteDialog({
  studentName,
  onClose,
  onConfirmed,
}: {
  studentName: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <Modal title="Permanently delete student" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-md bg-[var(--danger-soft)] p-3 text-[13px] text-[var(--danger)]">
          This will permanently remove <strong>{studentName}</strong>'s profile, conversations,
          messages, and any audio files. This cannot be undone.
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-soft)]">
            Type DELETE to confirm
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-md border border-[var(--rule)] bg-[var(--bg)] px-3 py-2 text-[14px] outline-none focus:border-[var(--danger)]"
          />
        </label>

        {error && <p className="text-[13px] text-[var(--danger)]">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-[var(--rule)] py-2 text-[13px] font-medium text-[var(--ink)] transition hover:bg-[var(--bg)]"
          >
            Cancel
          </button>
          <button
            disabled={!canDelete || loading}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                await onConfirmed();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not delete student.");
              } finally {
                setLoading(false);
              }
            }}
            className="flex-1 rounded-md bg-[var(--danger)] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
