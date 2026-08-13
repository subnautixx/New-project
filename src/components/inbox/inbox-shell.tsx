"use client";

import { MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/misc";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, UserRef } from "@/lib/types/views";
import { cn } from "@/lib/utils";
import { ContactPanel } from "./contact-panel";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

interface Props {
  conversations: ConversationListItem[];
  users: UserRef[];
  isAdmin: boolean;
  currentUserId: string;
  /** Conversa vinda de `?c=` — permite linkar direto de Clientes para o atendimento. */
  initialConversationId?: string | null;
}

/** Espera antes de recarregar a lista: numa rajada de mensagens, uma ida só. */
const REFRESH_DEBOUNCE_MS = 400;

export function InboxShell({
  conversations,
  users,
  isAdmin,
  currentUserId,
  initialConversationId,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // Só respeita o parâmetro se a conversa estiver realmente visível para
    // este usuário — a RLS já filtrou a lista, então basta procurar nela.
    if (initialConversationId && conversations.some((c) => c.id === initialConversationId)) {
      return initialConversationId;
    }
    return conversations[0]?.id ?? null;
  });
  const [showDetails, setShowDetails] = useState(false);
  const [threadToken, setThreadToken] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
  }, [router]);

  // Realtime: o Supabase aplica as mesmas policies de SELECT, então cada
  // consignador só é notificado das conversas que já poderia ler.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    const channel = supabase
      .channel("inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const record = (payload.new ?? payload.old) as { conversation_id?: string } | null;

          if (record?.conversation_id === selectedIdRef.current) {
            setThreadToken((t) => t + 1);
          }
          scheduleRefresh();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        scheduleRefresh();
      })
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [scheduleRefresh]);

  // A conversa aberta pode sumir da lista (transferida para outro consignador).
  useEffect(() => {
    if (selectedId && !conversations.some((c) => c.id === selectedId)) {
      setSelectedId(conversations[0]?.id ?? null);
    }
  }, [conversations, selectedId]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setShowDetails(false);

    // Mantém a URL compartilhável e o botão voltar coerente, sem recarregar.
    window.history.replaceState(null, "", `/inbox?c=${id}`);
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Coluna esquerda: no celular ocupa a tela toda até abrir uma conversa. */}
      <div
        className={cn(
          "w-full shrink-0 border-r border-border bg-surface md:w-[320px] lg:w-[360px]",
          selected ? "hidden md:block" : "block",
        )}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={handleSelect}
          users={users}
          isAdmin={isAdmin}
        />
      </div>

      <div className={cn("min-w-0 flex-1", selected ? "block" : "hidden md:block")}>
        {selected ? (
          <MessageThread
            key={selected.id}
            conversation={selected}
            users={users}
            isAdmin={isAdmin}
            onBack={() => setSelectedId(null)}
            onToggleDetails={() => setShowDetails((v) => !v)}
            refreshToken={threadToken}
          />
        ) : (
          <EmptyState
            icon={<MessagesSquare className="h-8 w-8" />}
            title="Selecione uma conversa"
            description="Escolha um cliente na lista ao lado para ver o histórico e responder."
          />
        )}
      </div>

      {/* Ficha do cliente: fixa em telas largas, alternável nas demais. */}
      {selected ? (
        <div
          className={cn(
            "w-full shrink-0 md:w-[320px] xl:block xl:w-[340px]",
            showDetails ? "absolute inset-0 z-20 bg-background md:static" : "hidden",
          )}
        >
          <ContactPanel
            key={selected.id}
            conversation={selected}
            users={users}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onChanged={() => router.refresh()}
          />
        </div>
      ) : null}
    </div>
  );
}
