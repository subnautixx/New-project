import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { TeamManager } from "@/components/admin/team-manager";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: profiles }, { data: accounts }, { data: permissions }] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("full_name"),
    supabase
      .from("whatsapp_accounts")
      .select("id, display_name, phone_e164, mode")
      .eq("is_active", true)
      .order("display_name"),
    supabase.from("user_whatsapp_permissions").select("user_id, whatsapp_account_id"),
  ]);

  return (
    <>
      <PageHeader title="Equipe" description={`${profiles?.length ?? 0} usuários`} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TeamManager
          profiles={profiles ?? []}
          accounts={accounts ?? []}
          permissions={permissions ?? []}
        />
      </div>
    </>
  );
}
