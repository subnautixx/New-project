import type { Metadata } from "next";
import Link from "next/link";
import { ContactsTable } from "@/components/crm/contacts-table";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/session";
import { fetchActiveUsers, fetchContacts } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  const [contacts, users] = await Promise.all([
    fetchContacts(supabase),
    fetchActiveUsers(supabase),
  ]);

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${contacts.length} ${contacts.length === 1 ? "cadastro" : "cadastros"}`}
        action={
          <Button asChild size="sm">
            <Link href="/clientes/novo">Novo prospect</Link>
          </Button>
        }
      />

      <ContactsTable contacts={contacts} users={users} isAdmin={profile.role === "admin"} />
    </>
  );
}
