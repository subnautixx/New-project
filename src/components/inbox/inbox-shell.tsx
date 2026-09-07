"use client";

import { MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FirstSteps, type FirstStepsState } from "@/components/onboarding/first-steps";
import { EmptyState } from "@/components/ui/misc";
import { showMessageNotification, shouldNotify } from "@/lib/notifications";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, UserRef } from "@/lib/types/views";
import { cn } from "@/lib/utils";
import { ContactPanel } from "./contact-panel";
import { NotificationPrompt } from "./notification-prompt";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";

interface Props {
  conversations: ConversationListItem[];
  users: UserRef[];
  isAdmin: boolean;
  currentUserId: string;
  /** Conversa vinda de `?c=` — permite linkar direto de Clientes para o atendimento. */
  initialConversationId?: string | null;
  /** Só vem preenchido quando não há conversa nenhuma: o que falta configurar. */
  firstSteps?: FirstStepsState | null;
}

/** Espera antes de recarregar a lista: numa rajada de mensagens, uma ida só. */
const REFRESH_DEBOUNCE_MS = 400;

export function InboxShell({
  conversations,
  users,
  isAdmin,
  currentUserId,
  initialConversationId,
  firstSteps,
}: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // Só respeita o parâmetro se a conversa estiver realmente visível para
    // este usuário — a RLS já filtrou a lista, então basta procurar nela.
    if (initialConversationId && conversations.some((c) => c.id === initialConversationId)) {
      return initialConversationId;
    }
    // Sem `?c=`, nada é aberto neste primeiro render. Em tela larga o efeito
    // abaixo abre a primeira conversa logo depois de montar; no celular não.
    return null;
  });
  const [showDetails, setShowDetails] = useState(false);
  const [threadToken, setThreadToken] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  // O canal do realtime é assinado uma vez só. Sem estas referências, o
  // handler ficaria preso à primeira lista de conversas e ao primeiro
  // handleSelect — e notificaria com nome errado.
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const handleSelectRef = useRef<(id: string) => void>(() => {});

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
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const record = payload.new as {
            conversation_id?: string;
            direction?: "inbound" | "outbound";
            content?: string | null;
          } | null;

          if (!record?.conversation_id) return;

          const decision = shouldNotify({
            direction: record.direction ?? "outbound",
            conversationId: record.conversation_id,
            openConversationId: selectedIdRef.current,
            documentHidden: document.hidden,
          });

          if (decision.notify) {
            // O nome do contato vem da lista já carregada; a RLS garante que
            // só está aqui o que este usuário pode ver.
            const conversa = conversationsRef.current.find(
              (c) => c.id === record.conversation_id,
            );

            showMessageNotification({
              contactName: conversa?.contact.full_name ?? "Nova mensagem",
              preview: record.content ?? "",
              conversationId: record.conversation_id,
              onClick: () => handleSelectRef.current(record.conversation_id as string),
            });
          }

          if (record.conversation_id === selectedIdRef.current) {
            setThreadToken((t) => t + 1);
          }
          scheduleRefresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const record = payload.new as { conversation_id?: string } | null;
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

  /**
   * Em tela larga, abre a primeira conversa sozinho — senão a área principal,
   * que ocupa dois terços da tela, ficaria vazia à toa.
   *
   * No celular não. Lá a lista e a conversa dividem a mesma tela: abrir a
   * primeira automaticamente escondia a lista, e quem entrava na inbox caía
   * dentro de uma conversa que não escolheu, tendo que voltar para achar a
   * certa.
   *
   * Só na montagem, e só quando nada foi escolhido — depois disso quem manda
   * é o clique. Fica fora do render para não divergir entre servidor e
   * navegador, que é onde a hidratação quebraria.
   */
  useEffect(() => {
    setSelectedId((current) => {
      if (current !== null) return current;
      if (!window.matchMedia("(min-width: 768px)").matches) return null;
      return conversationsRef.current[0]?.id ?? null;
    });
    // Só na montagem: reabrir a primeira conversa a cada atualização da lista
    // arrancaria a pessoa de onde ela está.
  }, []);

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

  handleSelectRef.current = handleSelect;

  return (
    <div className="flex h-full min-h-0">
      {/* Coluna esquerda: no celular ocupa a tela toda até abrir uma conversa. */}
      <div
        className={cn(
          // Coluna em flex: o convite ocupa o que precisa e a lista fica com o
          // resto. Sem isto, a lista continuaria pedindo 100% da altura e a
          // coluna estouraria.
          "w-full shrink-0 flex-col border-r border-border bg-surface md:w-[320px] lg:w-[360px]",
          selected ? "hidden md:flex" : "flex",
        )}
      >
        <NotificationPrompt onGranted={() => router.refresh()} />

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
            currentUserId={currentUserId}
            onBack={() => {
              setSelectedId(null);
              // Tira o `?c=` junto: senão recarregar a página no celular jogava
              // de volta para dentro da conversa que a pessoa acabou de fechar.
              window.history.replaceState(null, "", "/inbox");
            }}
            onToggleDetails={() => setShowDetails((v) => !v)}
            refreshToken={threadToken}
          />
        ) : firstSteps ? (
          // Loja recém instalada: pedir para "selecionar uma conversa" quando não
          // existe nenhuma é um beco sem saída.
          <FirstSteps state={firstSteps} isAdmin={isAdmin} />
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
