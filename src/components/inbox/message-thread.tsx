"use client";

import { ArrowLeft, Info, Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ContactAvatar } from "@/components/crm/contact-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { STATUS_DOT, STATUS_LABEL } from "@/lib/domain/lead";
import { dayKey, formatDayDivider } from "@/lib/format";
import { mergeMessages, oldestCursor, olderThanFilter } from "@/lib/inbox/history";
import { MESSAGE_SELECT } from "@/lib/messages/outcome";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, ThreadMessage, UserRef } from "@/lib/types/views";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { ImageViewer } from "./image-viewer";
import { MessageBubble } from "./message-bubble";
import { PendingBubble } from "./pending-bubble";

/** Primeira carga: o suficiente para a conversa recente caber de uma vez. */
const PAGE_SIZE = 50;
/** Cada "carregar anteriores" traz mais um pedaço do mesmo tamanho. */
const OLDER_PAGE_SIZE = 50;
/**
 * Tamanho de cada lote de reconferência de status. Todas as mensagens já
 * visíveis são reconferidas, em lotes deste tamanho: é assim que o "lido" de
 * uma mensagem de várias páginas atrás chega à tela.
 */
const STATUS_WINDOW = 300;

const SELECT_COLUMNS = MESSAGE_SELECT;

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
  /** Falha da primeira carga: não há nada na tela, então ocupa a tela. */
  const [error, setError] = useState<string | null>(null);
  /** Falha de atualização: o histórico continua visível, o aviso é discreto. */
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  /** A foto aberta é guardada por id: prepend e realtime mudam o índice. */
  const [viewerId, setViewerId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** O conteúdo, não o painel: é a altura dele que muda quando chega página. */
  const contentRef = useRef<HTMLDivElement>(null);
  /** Sobe a cada troca de conversa; invalida buscas de "anteriores" em voo. */
  const conversationGeneration = useRef(0);
  const olderLock = useRef(false);
  const retryLocks = useRef(new Set<string>());

  const conversationId = conversation.id;

  /**
   * Resposta atrasada não pode escrever na tela.
   *
   * Duas guardas, porque são dois problemas diferentes: `openConversation`
   * pega a troca de conversa (inclusive A→B→A, porque a sequência também
   * muda) e `requestSeq` pega duas buscas da MESMA conversa que voltam fora de
   * ordem — a mais velha é descartada.
   */
  const openConversation = useRef(conversationId);
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  const messagesRef = useRef<ThreadMessage[]>([]);
  messagesRef.current = messages;
  /** Uma vez visto o começo da conversa, não há mais "anteriores". */
  const reachedStart = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const vivo = (pedida: string, seq: number) =>
    mounted.current && openConversation.current === pedida && requestSeq.current === seq;

  const load = useCallback(async () => {
    const pedida = conversationId;
    const seq = ++requestSeq.current;
    const supabase = createSupabaseBrowserClient();
    const conhecidas = messagesRef.current;

    const recentes = supabase
      .from("messages")
      .select(SELECT_COLUMNS)
      .eq("conversation_id", pedida)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);

    // As já visíveis são reconferidas por id: é assim que "entregue" vira
    // "lida" numa mensagem que está longe do fim da conversa.
    const visiveis = conhecidas.map((m) => m.id);
    const batches = [];
    for (let offset = 0; offset < visiveis.length; offset += STATUS_WINDOW) {
      batches.push(
        supabase
          .from("messages")
          .select(SELECT_COLUMNS)
          .eq("conversation_id", pedida)
          .in("id", visiveis.slice(offset, offset + STATUS_WINDOW)),
      );
    }
    const reconferir = Promise.all(batches);

    const [pagina, estados] = await Promise.all([recentes, reconferir]);

    if (!vivo(pedida, seq)) return;

    if (pagina.error) {
      // Atualização que falha não pode esconder o que já está na tela.
      if (conhecidas.length > 0) setRefreshError("Não foi possível atualizar agora.");
      else setError("Não foi possível carregar as mensagens.");
      setLoading(false);
      return;
    }

    let recebidas = (pagina.data ?? []) as ThreadMessage[];

    // Rajada maior que uma página deixaria um buraco entre o que já estava na
    // tela e o novo bloco. Continuamos puxando para trás até encostar no que
    // já conhecíamos.
    const maisNova = conhecidas[conhecidas.length - 1];
    // Compara pelo par (created_at, id) — só o horário deixaria passar buraco
    // entre mensagens gravadas no mesmo instante.
    const depoisDaConhecida = (m: ThreadMessage) =>
      m.created_at > maisNova!.created_at ||
      (m.created_at === maisNova!.created_at && m.id > maisNova!.id);

    while (
      maisNova &&
      recebidas.length >= PAGE_SIZE &&
      depoisDaConhecida(recebidas[recebidas.length - 1] as ThreadMessage)
    ) {
      const ultima = recebidas[recebidas.length - 1] as ThreadMessage;
      const { data: extra, error: extraError } = await supabase
        .from("messages")
        .select(SELECT_COLUMNS)
        .eq("conversation_id", pedida)
        .or(olderThanFilter({ createdAt: ultima.created_at, id: ultima.id }))
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);

      if (!vivo(pedida, seq)) return;
      if (extraError) {
        // Parar em silêncio deixaria um buraco invisível no histórico.
        setRefreshError("Não foi possível atualizar agora. Tente novamente.");
        setLoading(false);
        return;
      }
      if (!extra || extra.length === 0) break;

      recebidas = [...recebidas, ...(extra as ThreadMessage[])];
      if (extra.length < PAGE_SIZE) break;
    }

    const atualizadas = estados.flatMap((batch) => batch.data ?? []) as ThreadMessage[];

    // Recarregar a mesma conversa mescla por id: as páginas antigas que já
    // estavam na tela continuam lá, e status atualizado substitui a versão
    // velha sem duplicar nada.
    setMessages((prev) => mergeMessages(prev, [...recebidas, ...atualizadas]));

    if (reachedStart.current) {
      // Já vimos o começo: nenhuma atualização pode ressuscitar o botão.
      setHasMore(false);
    } else if (conhecidas.length === 0) {
      const temMais = recebidas.length >= PAGE_SIZE;
      setHasMore(temMais);
      if (!temMais) reachedStart.current = true;
    }

    setError(null);
    setRefreshError(
      estados.some((batch) => batch.error) ? "Não foi possível atualizar alguns status." : null,
    );
    setLoading(false);
  }, [conversationId]);

  /**
   * Âncora da rolagem: qual mensagem estava visível e a que distância do topo
   * do painel. Capturada no instante ANTES de aplicar a página nova — medir
   * altura antes da busca deixava o realtime consumir a medida no meio.
   */
  const anchor = useRef<{ id: string; offset: number } | null>(null);

  function capturarAncora() {
    const el = scrollRef.current;
    if (!el) return;
    // A primeira mensagem VISÍVEL, não a primeira da lista: é a que está sob os
    // olhos que precisa voltar para o mesmo lugar.
    const top = el.getBoundingClientRect().top;
    const node = Array.from(el.querySelectorAll<HTMLElement>("[data-mid]")).find(
      (candidate) => candidate.getBoundingClientRect().bottom > top,
    );
    if (!node) return;
    anchor.current = {
      id: node.dataset.mid!,
      offset: node.getBoundingClientRect().top - top,
    };
  }

  function restaurarAncora() {
    const alvo = anchor.current;
    const el = scrollRef.current;
    if (!alvo || !el) return;
    const node = el.querySelector<HTMLElement>(`[data-mid="${cssEscape(alvo.id)}"]`);
    if (!node) return;
    const atual = node.getBoundingClientRect().top - el.getBoundingClientRect().top;
    el.scrollTop += atual - alvo.offset;
  }

  const loadOlder = useCallback(async () => {
    const pedida = conversationId;
    const cursor = oldestCursor(messagesRef.current);
    // Trava síncrona: dois cliques no mesmo tique não disparam duas buscas.
    if (!cursor || olderLock.current) return;
    olderLock.current = true;
    const generation = conversationGeneration.current;

    setLoadingOlder(true);
    setOlderError(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error: queryError } = await supabase
      .from("messages")
      .select(SELECT_COLUMNS)
      .eq("conversation_id", pedida)
      .or(olderThanFilter(cursor))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(OLDER_PAGE_SIZE);

    if (!mounted.current) return;
    if (openConversation.current !== pedida || conversationGeneration.current !== generation) {
      // Trocou de conversa no meio: o efeito de troca já zera o carregando.
      return;
    }

    olderLock.current = false;

    if (queryError) {
      setOlderError("Não foi possível carregar as mensagens anteriores.");
      setLoadingOlder(false);
      return;
    }

    const page = (data ?? []) as ThreadMessage[];

    // Medida tirada aqui, colada na aplicação: entre uma linha e outra nada
    // mais pode mexer na altura.
    capturarAncora();
    setMessages((prev) => mergeMessages(prev, page));

    if (page.length < OLDER_PAGE_SIZE) {
      reachedStart.current = true;
      setHasMore(false);
    }
    setLoadingOlder(false);
  }, [conversationId]);

  useEffect(() => {
    // Trocar de conversa mostra o spinner. Recarregar a MESMA conversa não:
    // o conteúdo é trocado por baixo, sem piscar.
    if (openConversation.current !== conversationId) {
      openConversation.current = conversationId;
      conversationGeneration.current += 1;
      olderLock.current = false;
      messagesRef.current = [];
      setMessages([]);
      setLoading(true);
      setHasMore(false);
      setLoadingOlder(false);
      setOlderError(null);
      setRefreshError(null);
      setError(null);
      setViewerId(null);
      setRetrying({});
      setRetryErrors({});
      reachedStart.current = false;
      anchor.current = null;
      stickToBottom.current = true;
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

  // Página antiga entrou no começo: a mensagem que estava sob os olhos volta
  // exatamente para onde estava.
  useLayoutEffect(() => {
    if (anchor.current) restaurarAncora();
  }, [messages]);

  // Mídia que só termina de carregar depois empurra o texto para baixo.
  // Observamos o CONTEÚDO, não o painel: o painel tem altura fixa e nunca
  // dispararia. A âncora só sai quando a pessoa mexe na rolagem ou envia algo.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!anchor.current) return;
      restaurarAncora();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [messages.length]);

  useEffect(() => {
    // Paginando para trás não se salta para o fim.
    if (anchor.current) return;
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending.length]);

  /** Reenvio manual: uma mensagem por vez, com erro local no próprio balão. */
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  const retryMessage = useCallback(async (message: ThreadMessage) => {
    const id = message.id;
    // Trava por id: dois cliques rápidos não viram duas requisições. O claim
    // no servidor ainda protege o caso de duas abas.
    if (retryLocks.current.has(id)) return;
    retryLocks.current.add(id);
    const generation = conversationGeneration.current;
    const active = () => mounted.current && generation === conversationGeneration.current;
    setRetrying((prev) => ({ ...prev, [id]: true }));

    setRetryErrors((prev) => {
      const { [id]: _removido, ...resto } = prev;
      return resto;
    });

    try {
      const response = await fetch("/api/messages/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: id, expectedUpdatedAt: message.updated_at }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: ThreadMessage | string;
        messageRecord?: ThreadMessage | null;
      } | null;

      // Qualquer resposta pode trazer o estado atual da linha — inclusive a
      // recusa por versão antiga. Mesclamos por id em vez de recarregar tudo.
      const registro =
        payload?.messageRecord ??
        (payload?.message && typeof payload.message !== "string" ? payload.message : null);

      if (!active()) return;
      if (registro) setMessages((prev) => mergeMessages(prev, [registro]));

      if (!response.ok) {
        const texto = typeof payload?.message === "string" ? payload.message : null;
        setRetryErrors((prev) => ({
          ...prev,
          [id]: texto ?? "Não foi possível reenviar agora.",
        }));
      }
    } catch {
      if (active()) {
        setRetryErrors((prev) => ({ ...prev, [id]: "Sem conexão com o servidor." }));
      }
    } finally {
      retryLocks.current.delete(id);
      if (active()) {
        setRetrying((prev) => {
          const { [id]: _saiu, ...resto } = prev;
          return resto;
        });
      }
    }
  }, []);

  const senderName = useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      return users.find((u) => u.id === userId)?.full_name ?? null;
    },
    [users],
  );

  // O visualizador navega entre as fotos DESTA conversa já carregadas.
  const images = useMemo(
    () => messages.filter((m) => m.message_type === "image" || m.message_type === "sticker"),
    [messages],
  );
  const viewerIndex = viewerId ? images.findIndex((img) => img.id === viewerId) : -1;

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
        // Qualquer gesto de rolagem encerra a âncora: a partir daí quem manda
        // na posição é a pessoa, não o reposicionamento automático.
        onWheel={() => {
          anchor.current = null;
        }}
        onTouchStart={() => {
          anchor.current = null;
        }}
        onPointerDown={() => {
          anchor.current = null;
        }}
        onKeyDown={() => {
          anchor.current = null;
        }}
        className="chat-canvas min-h-0 flex-1 overflow-y-auto px-3 py-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <EmptyState title="Erro ao carregar" description={error} />
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Tentar de novo
            </Button>
          </div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <EmptyState
            title="Nenhuma mensagem ainda"
            description="Envie a primeira mensagem para iniciar o atendimento."
          />
        ) : (
          <div ref={contentRef} className="mx-auto flex max-w-3xl flex-col gap-1.5">
            <div className="mb-1 flex flex-col items-center gap-1.5">
              {olderError ? (
                <p role="alert" className="text-[11px] text-destructive">
                  {olderError}
                </p>
              ) : null}

              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {loadingOlder ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {loadingOlder
                    ? "Carregando…"
                    : olderError
                      ? "Tentar de novo"
                      : "Carregar mensagens anteriores"}
                </button>
              ) : (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Início da conversa
                </span>
              )}
            </div>

            {refreshError ? (
              <p role="status" className="mb-1 text-center text-[11px] text-amber-300/90">
                {refreshError}
              </p>
            ) : null}

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
                    onOpenImage={() => setViewerId(message.id)}
                    onRetry={() => void retryMessage(message)}
                    retrying={Boolean(retrying[message.id])}
                    retryError={retryErrors[message.id] ?? null}
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

      {viewerIndex >= 0 ? (
        <ImageViewer
          images={images}
          index={viewerIndex}
          onIndexChange={(next) => setViewerId(images[next]?.id ?? null)}
          onClose={() => setViewerId(null)}
        />
      ) : null}

      <Composer
        key={`${currentUserId}:${conversationId}`}
        conversation={conversation}
        isAdmin={isAdmin}
        users={users}
        currentUserId={currentUserId}
        // O que a própria pessoa acabou de enviar sempre volta para o fim da
        // conversa, mesmo que ela estivesse lendo o histórico.
        onSent={(message) => {
          if (!mounted.current || openConversation.current !== conversationId) return;
          anchor.current = null;
          stickToBottom.current = true;
          setMessages((prev) => mergeMessages(prev, [message]));
        }}
        onPending={(clientRef, text) => {
          anchor.current = null;
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

/** `CSS.escape` não existe em todo lugar; o id é um uuid, então basta o básico. */
function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
