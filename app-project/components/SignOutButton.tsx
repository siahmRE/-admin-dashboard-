"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--ink-soft)] transition hover:bg-[var(--bg)] hover:text-[var(--ink)]"
    >
      Sign out
    </button>
  );
}
