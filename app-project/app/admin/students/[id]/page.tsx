import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StudentProfileClient from "@/components/StudentProfileClient";

type Params = { params: { id: string } };

export default async function StudentProfilePage({ params }: Params) {
  const { id } = params;
  const supabase = await createClient();

  const { data: student, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, student_id, notes, status, created_at, last_activity_at")
    .eq("id", id)
    .eq("role", "student")
    .single();

  if (error || !student) {
    notFound();
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("student_id", id)
    .maybeSingle();

  const { data: messages } = conversation
    ? await supabase
        .from("messages")
        .select("id, sender_role, body, audio_url, created_at, read_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <div className="space-y-6">
      <Link href="/admin/students" className="text-[13px] font-medium text-[var(--accent)] hover:underline">
        ← Back to students
      </Link>
      <StudentProfileClient student={student} conversationId={conversation?.id ?? null} initialMessages={messages ?? []} />
    </div>
  );
}
