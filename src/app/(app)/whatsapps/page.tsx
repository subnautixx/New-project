import type { Metadata } from "next";
import { WhatsappManager } from "@/components/admin/whatsapp-manager";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "WhatsApps" };
export const dynamic = "force-dynamic";

export default async function WhatsappSettingsPage() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: accounts }, { data: profiles }, { data: permissions }] = await Promise.all([
    supabase.from("whatsapp_accounts").select("*").order("display_name"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.from("user_whatsapp_permissions").select("user_id, whatsapp_account_id"),
  ]);

  return (
    <>
      <PageHeader
        title="WhatsApps"
        description="Números conectados à Cloud API oficial da Meta"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WhatsappManager
          accounts={accounts ?? []}
          users={profiles ?? []}
          permissions={permissions ?? []}
        />
      </div>
    </>
  );
}
