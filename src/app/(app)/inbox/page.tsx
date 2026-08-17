import type { Metadata } from "next";
import { InboxShell } from "@/components/inbox/inbox-shell";
import { requireProfile } from "@/lib/auth/session";
import {
  fetchActiveUsers,
  fetchConversations,
  fetchFirstStepsState,
} from "@/lib/data/queries";
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

  // Só interessa quando não há conversa nenhuma — é aí que a inbox precisa
  // dizer o que fazer em vez de pedir para selecionar algo que não existe.
  const firstSteps = conversations.length === 0 ? await fetchFirstStepsState(supabase) : null;

  return (
    <InboxShell
      conversations={conversations}
      users={users}
      isAdmin={profile.role === "admin"}
      currentUserId={profile.id}
      initialConversationId={conversationParam ?? null}
      firstSteps={firstSteps}
    />
  );
}
