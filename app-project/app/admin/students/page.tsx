import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import StudentsClient from "@/components/StudentsClient";

export default async function StudentsPage() {
  const supabase = await createClient();
  const { data: stats } = (await supabase.rpc("admin_dashboard_stats").single()) as {
    data: { max_active_students: number } | null;
  };

  return (
    <Suspense>
      <StudentsClient initialCap={stats?.max_active_students ?? 80} />
    </Suspense>
  );
}
