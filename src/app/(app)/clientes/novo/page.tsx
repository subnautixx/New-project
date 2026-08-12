import type { Metadata } from "next";
import { NewContactForm } from "@/components/crm/new-contact-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireProfile } from "@/lib/auth/session";
import { fetchAccessibleAccounts } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Novo prospect" };
export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  // A RLS entrega apenas os números que este usuário pode usar.
  const accounts = await fetchAccessibleAccounts(supabase);

  return (
    <>
      <PageHeader
        title="Novo prospect"
        description="Cadastre o proprietário encontrado em um anúncio"
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <NewContactForm accounts={accounts} currentUserId={profile.id} />
      </div>
    </>
  );
}
