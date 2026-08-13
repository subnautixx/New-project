import type { Metadata } from "next";
import { InboxShell } from "@/components/inbox/inbox-shell";
import { requireProfile } from "@/lib/auth/session";
import { fetchActiveUsers, fetchConversations } from "@/lib/data/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox" };

// A inbox reflete o estado agora; nada aqui pode vir de cache.
export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c: conversationParam } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createSupabaseServerClient();

  // A RLS já recorta: consignador recebe só as conversas dele.
  const [conversations, users] = await Promise.all([
    fetchConversations(supabase),
    fetchActiveUsers(supabase),
  ]);

  return (
    <InboxShell
      conversations={conversations}
      users={users}
      isAdmin={profile.role === "admin"}
      currentUserId={profile.id}
      initialConversationId={conversationParam ?? null}
    />
  );
}
