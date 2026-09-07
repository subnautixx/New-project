"use client";

import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactAvatar } from "@/components/crm/contact-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { STATUS_DOT, STATUS_LABEL } from "@/lib/domain/lead";
import { dayKey, formatDayDivider } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, ThreadMessage, UserRef } from "@/lib/types/views";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { PendingBubble } from "./pending-bubble";

const PAGE_SIZE = 200;

interface Props {
  conversation: ConversationListItem;
  users: UserRef[];
  isAdmin: boolean;
  currentUserId: string;
  onBack: () => void;
  onToggleDetails: () => void;
  /** Incrementa quando o realtime avisa que esta conversa mudou. */
  refreshToken: number;
}

export function MessageThread({
  conversation,
  users,
  isAdmin,
  currentUserId,
  onBack,
  onToggleDetails,
  refreshToken,
}: Props) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  /** Mensagens já escritas que ainda estão indo para o servidor. */
  const [pending, setPending] = useState<{ clientRef: string; text: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  /** Qual conversa já está na tela — não confundir troca com recarga. */
  const shownConversation = useRef(conversationId);

  useEffect(() => {
    // Trocar de conversa mostra o spinner. Recarregar a MESMA conversa não:
    // o conteúdo é trocado por baixo, sem piscar.
    //
    // Antes o spinner subia nas duas situações. Como o realtime avisa a cada
    // mensagem — inclusive as que a própria loja envia —, toda vez que alguém
    // enviava algo a conversa inteira sumia por um instante e voltava com o
    // scroll fora do lugar.
    if (shownConversation.current !== conversationId) {
      shownConversation.current = conversationId;
      setMessages([]);
      setLoading(true);
    }

    void load();
  }, [load, conversationId, refreshToken]);

  // Trocar de conversa não pode levar junto um balão provisório da anterior.
  useEffect(() => setPending([]), [conversationId]);

  // Zera o contador de não lidas ao abrir a conversa.
  useEffect(() => {
    if (conversation.unread_count === 0) return;
    void fetch(`/api/conversations/${conversationId}/read`, { method: "POST" });
  }, [conversationId, conversation.unread_count]);

  /**
   * Só acompanha o fim da conversa quem já estava no fim.
   *
   * Sem isto, uma mensagem chegando enquanto alguém lê o histórico arranca a
   * tela de volta para baixo no meio da leitura.
   */
  const stickToBottom = useRef(true);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // Folga de 80px: quem está "no fim" quase nunca está no pixel exato.
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending.length]);

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
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-surface/50 px-3 backdrop-blur">
        <Button variant="ghost" size="icon-sm" onClick={onBack} className="md:hidden">
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Voltar</span>
        </Button>

        <ContactAvatar
          contactId={conversation.contact.id}
          name={conversation.contact.full_name}
          photoPath={conversation.contact.photo_path}
          className="h-8 w-8"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-5">
            {conversation.contact.full_name}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] leading-4 text-muted-foreground">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[conversation.contact.status])}
            />
            {STATUS_LABEL[conversation.contact.status]}
            {conversation.account ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate">
                  {conversation.account.display_name}
                  {conversation.account.mode === "shared" ? " (compartilhado)" : ""}
                </span>
              </>
            ) : null}
          </p>
        </div>

        <Button variant="ghost" size="icon-sm" onClick={onToggleDetails} className="xl:hidden">
          <Info className="h-4 w-4" />
          <span className="sr-only">Ficha do cliente</span>
        </Button>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-canvas min-h-0 flex-1 overflow-y-auto px-3 py-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <EmptyState title="Erro ao carregar" description={error} />
        ) : messages.length === 0 && pending.length === 0 ? (
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
                      <span className="rounded-full bg-surface/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border backdrop-blur">
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

            {pending.map((item) => (
              <PendingBubble key={item.clientRef} text={item.text} />
            ))}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <Composer
        conversation={conversation}
        isAdmin={isAdmin}
        users={users}
        currentUserId={currentUserId}
        // O que a própria pessoa acabou de enviar sempre volta para o fim da
        // conversa, mesmo que ela estivesse lendo o histórico.
        onSent={(message) => {
          stickToBottom.current = true;
          setMessages((prev) => [...prev, message]);
        }}
        onPending={(clientRef, text) => {
          stickToBottom.current = true;
          setPending((prev) => [...prev, { clientRef, text }]);
        }}
        onPendingDone={(clientRef) =>
          setPending((prev) => prev.filter((p) => p.clientRef !== clientRef))
        }
      />
    </section>
  );
}

