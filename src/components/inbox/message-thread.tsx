"use client";

import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { dayKey, formatDayDivider } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, ThreadMessage, UserRef } from "@/lib/types/views";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";

const PAGE_SIZE = 200;

interface Props {
  conversation: ConversationListItem;
  users: UserRef[];
  isAdmin: boolean;
  onBack: () => void;
  onToggleDetails: () => void;
  /** Incrementa quando o realtime avisa que esta conversa mudou. */
  refreshToken: number;
}

export function MessageThread({
  conversation,
  users,
  isAdmin,
  onBack,
  onToggleDetails,
  refreshToken,
}: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversationId = conversation.id;

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();

    const { data, error: queryError } = await supabase
      .from("messages")
      .select(
        "id, direction, message_type, content, media_id, media_mime_type, media_filename, status, error_message, sent_by_user_id, wa_timestamp, created_at",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (queryError) {
      setError("Não foi possível carregar as mensagens.");
      setLoading(false);
      return;
    }

    // Buscamos as mais recentes e invertemos: a conversa é lida de cima para baixo.
    setMessages((data ?? []).slice().reverse());
    setError(null);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshToken]);

  // Zera o contador de não lidas ao abrir a conversa.
  useEffect(() => {
    if (conversation.unread_count === 0) return;
    void fetch(`/api/conversations/${conversationId}/read`, { method: "POST" });
  }, [conversationId, conversation.unread_count]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const senderName = useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      return users.find((u) => u.id === userId)?.full_name ?? null;
    },
    [users],
  );

  // No número compartilhado, cada balão precisa dizer quem enviou.
  const showSender = conversation.account?.mode === "shared";

  return (
    <section className="flex h-full min-w-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack} className="md:hidden">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Voltar</span>
        </Button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{conversation.contact.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.account
              ? `${conversation.account.display_name}${
                  conversation.account.mode === "shared" ? " · compartilhado" : ""
                }`
              : "Sem número associado"}
          </p>
        </div>

        <Button variant="ghost" size="icon-sm" onClick={onToggleDetails} className="xl:hidden">
          <Info className="h-4 w-4" />
          <span className="sr-only">Ficha do cliente</span>
        </Button>
      </header>

      <div className="chat-canvas min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <EmptyState title="Erro ao carregar" description={error} />
        ) : messages.length === 0 ? (
          <EmptyState
            title="Nenhuma mensagem ainda"
            description="Envie a primeira mensagem para iniciar o atendimento."
          />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const currentDay = dayKey(message.wa_timestamp ?? message.created_at);
              const previousDay = previous
                ? dayKey(previous.wa_timestamp ?? previous.created_at)
                : null;

              return (
                <div key={message.id} className="contents">
                  {currentDay !== previousDay ? (
                    <div className="my-2 flex justify-center">
                      <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">
                        {formatDayDivider(message.wa_timestamp ?? message.created_at)}
                      </span>
                    </div>
                  ) : null}

                  <MessageBubble
                    message={message}
                    senderName={senderName(message.sent_by_user_id)}
                    showSender={showSender}
                  />
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Composer
        conversation={conversation}
        isAdmin={isAdmin}
        users={users}
        onSent={(message) => setMessages((prev) => [...prev, message])}
      />
    </section>
  );
}
