"use client";
/* eslint-disable @next/next/no-img-element -- Miniaturas usam URLs blob locais, sem otimização no servidor. */

import { AlertTriangle, FileText, Loader2, Paperclip, SendHorizonal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { describeServiceWindow, requiresApprovedTemplate } from "@/lib/domain/service-window";
import { clearDraftIf, readDraft, writeDraft } from "@/lib/inbox/drafts";
import { compressIfNeeded } from "@/lib/media/compress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ConversationListItem, ThreadMessage, UserRef } from "@/lib/types/views";
import { cn } from "@/lib/utils";
import { ACCEPTED_MIME_TYPES, validateMedia } from "@/lib/whatsapp/media";
import { AudioRecorder } from "./audio-recorder";
import { QuickReplies } from "./quick-replies";
import { TemplateDialog } from "./template-dialog";

const MAX_LENGTH = 4096;

/** Teto por envio. Acima disso a fila demora e a janela de 24h corre. */
const MAX_FILES = 10;

interface Props {
  conversation: ConversationListItem;
  isAdmin: boolean;
  users: UserRef[];
  currentUserId: string;
  onSent: (message: ThreadMessage) => void;
  /** Texto entregue à thread antes da ida ao servidor, para aparecer na hora. */
  onPending: (clientRef: string, text: string) => void;
  /** Fim da tentativa, com ou sem sucesso: o balão provisório sai. */
  onPendingDone: (clientRef: string) => void;
}

interface SendResponse {
  message?: ThreadMessage | string;
  error?: string;
}

export function Composer({
  conversation,
  isAdmin,
  currentUserId,
  onSent,
  onPending,
  onPendingDone,
}: Props) {
  const conversationId = conversation.id;

  // Leitura inicial segura no servidor: `readDraft` devolve "" quando não há
  // `sessionStorage`, então o primeiro render combina com a hidratação.
  const [text, setTextState] = useState("");
  const [files, setFilesState] = useState<File[]>([]);
  /** Quando manda vários: "enviando 2 de 5". */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sending, setSending] = useState(false);
  /** Comprimindo/validando o que acabou de entrar — segura uma segunda leva. */
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Espelhos síncronos do estado.
   *
   * O React aplica `setState` quando quer; aqui há decisões que precisam valer
   * NO MESMO instante — o teto de 10 arquivos, o bloqueio de duas levas no
   * mesmo tique e o rascunho, que tem de estar gravado mesmo se o componente
   * desmontar no meio de um envio.
   */
  const filesRef = useRef<File[]>([]);
  const processingRef = useRef(false);
  const sendingRef = useRef(false);
  const textRef = useRef(text);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  /**
   * Conversa/usuário do render ATUAL. Um envio lento carrega no fecho a
   * conversa de onde saiu; escrever no rascunho por esse valor gravaria o texto
   * da conversa nova na chave da antiga.
   */
  const abertaRef = useRef({ userId: currentUserId, conversationId });
  abertaRef.current = { userId: currentUserId, conversationId };

  /** Toda escrita de texto grava o rascunho na hora, sem depender de efeito. */
  function setText(next: string | ((current: string) => string)) {
    const value = typeof next === "function" ? next(textRef.current) : next;
    const alvo = abertaRef.current;
    textRef.current = value;
    writeDraft(alvo.userId, alvo.conversationId, value);
    setTextState(value);
  }

  function setFiles(next: File[]) {
    filesRef.current = next;
    setFilesState(next);
  }

  // Trocar de conversa: carrega o rascunho DAQUELA conversa. A escrita não
  // acontece mais em efeito — era isso que fazia o texto da conversa anterior
  // ser gravado na nova logo depois da troca.
  useEffect(() => {
    const guardado = readDraft(currentUserId, conversationId);
    textRef.current = guardado;
    setTextState(guardado);
    filesRef.current = [];
    setFilesState([]);
    setError(null);
    setProgress(null);
  }, [currentUserId, conversationId]);

  const windowExpiresAt = conversation.service_window_expires_at;
  // Recalcula a cada minuto: um aviso de "faltam 40 min" congelado na tela é
  // pior que nenhum aviso.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const janela = describeServiceWindow(windowExpiresAt, agora);
  // Janela fechada e cliente que nunca escreveu caem no mesmo lugar: só modelo
  // aprovado sai. O texto explica qual dos dois é, porque a saída é a mesma mas
  // o motivo não.
  const precisaModelo = requiresApprovedTemplate(janela.state);
  const nuncaEscreveu = janela.state === "sem-janela";

  /** A janela pode fechar entre o render e o clique — conferimos no handler. */
  const janelaFechadaAgora = () =>
    requiresApprovedTemplate(describeServiceWindow(windowExpiresAt, new Date()).state);

  /**
   * Caminho único de entrada de arquivo: botão de anexo, colar e arrastar.
   * Todos passam pela mesma compressão, pela mesma validação de tipo/tamanho e
   * pelo mesmo teto de 10 arquivos.
   */
  async function addFiles(chosen: File[]) {
    if (chosen.length === 0) return;
    // Trava síncrona: dois `drop` no mesmo tique não passam os dois. Um
    // `if (processing)` sobre o estado deixaria ambos entrarem.
    if (processingRef.current || sendingRef.current) return;
    if (janelaFechadaAgora()) {
      setError("A janela de 24 horas fechou. Reabra a conversa com um modelo aprovado.");
      return;
    }

    processingRef.current = true;
    setProcessing(true);
    setError(null);

    const aceitos: File[] = [];
    const recusados: { nome: string; motivo: string }[] = [];

    try {
      for (const original of chosen) {
        let preparado = original;

        try {
          // Foto acima do limite é encolhida em vez de recusada — o limite é da
          // Meta e não dá para aumentar, mas quase toda foto cabe depois de
          // reduzida. Vídeo e documento não dá para encolher aqui.
          const resultado = await compressIfNeeded(original);
          preparado = resultado.file;
        } catch {
          recusados.push({
            nome: original.name,
            motivo: "Não foi possível preparar este arquivo para envio.",
          });
          continue;
        }

        const validation = validateMedia(preparado.type, preparado.size);

        if (validation.ok) {
          aceitos.push(preparado);
        } else {
          // A validação já sabe o motivo exato — "acima do limite de 16 MB para
          // vídeo" é acionável, "formato ou tamanho fora do aceito" não é.
          recusados.push({
            nome: original.name,
            motivo: validation.error ?? "Formato não aceito pelo WhatsApp.",
          });
        }
      }
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }

    // Cálculo puro, fora de qualquer atualizador: o espaço vem do espelho
    // síncrono, que já refletiu qualquer remoção feita durante a compressão —
    // arquivo removido no meio não volta.
    const espaco = Math.max(0, MAX_FILES - filesRef.current.length);
    const entram = aceitos.slice(0, espaco);
    const excedente = aceitos.length - entram.length;

    if (entram.length > 0) setFiles([...filesRef.current, ...entram]);

    const avisos: string[] = [];
    const primeiro = recusados[0];
    if (primeiro) {
      avisos.push(
        recusados.length === 1
          ? `${primeiro.nome} — ${primeiro.motivo}`
          : `${recusados.length} arquivos não foram aceitos. ${primeiro.nome} — ${primeiro.motivo}`,
      );
    }

    // Passar do teto avisa em vez de sumir com os arquivos em silêncio.
    if (excedente > 0) {
      avisos.push(
        `Só é possível anexar ${MAX_FILES} arquivos por vez. ${excedente} ${
          excedente === 1 ? "arquivo ficou de fora" : "arquivos ficaram de fora"
        }.`,
      );
    }

    if (avisos.length > 0) setError(avisos.join(" "));
  }

  async function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = ""; // permite escolher o mesmo arquivo de novo
    await addFiles(chosen);
  }

  /** Colar: só intercepta quando vêm arquivos — texto normal continua colando. */
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = Array.from(event.clipboardData?.files ?? []);
    if (pasted.length === 0) return;
    event.preventDefault();
    void addFiles(pasted);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    void addFiles(dropped);
  }

  function removeFile(index: number) {
    setFiles(filesRef.current.filter((_, i) => i !== index));
  }

  async function uploadAndSend(chosen: File, caption: string): Promise<boolean> {
    const clientRef = crypto.randomUUID();

    const urlResponse = await fetch("/api/messages/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        filename: chosen.name,
        mimeType: chosen.type,
        sizeBytes: chosen.size,
      }),
    });

    if (!urlResponse.ok) {
      const payload = (await urlResponse.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? "Não foi possível preparar o envio do arquivo.");
      return false;
    }

    const { path, token, bucket } = (await urlResponse.json()) as {
      path: string;
      token: string;
      bucket: string;
    };

    // O arquivo vai direto do navegador para o Storage: não passa pela função
    // serverless, que aceita poucos megabytes por requisição.
    const { error: uploadError } = await createSupabaseBrowserClient()
      .storage.from(bucket)
      .uploadToSignedUrl(path, token, chosen, { contentType: chosen.type });

    if (uploadError) {
      setError("Falha ao enviar o arquivo. Verifique sua conexão.");
      return false;
    }

    const sendResponse = await fetch("/api/messages/send-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        path,
        mimeType: chosen.type,
        filename: chosen.name,
        caption: caption || undefined,
        clientRef,
      }),
    });

    const payload = (await sendResponse.json().catch(() => null)) as SendResponse | null;

    if (!sendResponse.ok) {
      setError(
        typeof payload?.message === "string"
          ? payload.message
          : "Não foi possível enviar o arquivo.",
      );
      return false;
    }

    if (payload?.message && typeof payload.message !== "string") onSent(payload.message);
    return true;
  }

  async function sendText(body: string, clientRef: string): Promise<boolean> {
    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text: body, clientRef }),
    });

    // Em sucesso `message` é o registro salvo; em erro, o texto do motivo.
    const payload = (await response.json().catch(() => null)) as SendResponse | null;

    if (!response.ok) {
      setError(
        typeof payload?.message === "string"
          ? payload.message
          : "Não foi possível enviar. Tente novamente.",
      );
      return false;
    }

    if (payload?.message && typeof payload.message !== "string") onSent(payload.message);
    return true;
  }

  /**
   * Limpa o campo e o rascunho SÓ se o texto ainda for a revisão que saiu.
   *
   * Enquanto a mensagem viaja, a pessoa continua digitando; e pode até trocar
   * de conversa e voltar, desmontando o componente. Comparar antes de apagar é
   * o que impede o envio de levar embora o que veio depois.
   */
  function limparSeIntacto(enviadoUserId: string, enviadaConversa: string, revisao: string) {
    // O rascunho é comparado e limpo mesmo se a pessoa já estiver em outra
    // conversa (ou se o componente tiver desmontado no meio do envio).
    clearDraftIf(enviadoUserId, enviadaConversa, revisao);

    const aberta = abertaRef.current;
    if (aberta.conversationId !== enviadaConversa || aberta.userId !== enviadoUserId) return;
    // A instância desmontada não pode gravar seu texto antigo por cima de um
    // rascunho criado por uma nova instância da mesma conversa.
    if (!mountedRef.current) return;
    if (textRef.current === revisao) {
      textRef.current = "";
      setTextState("");
    }
  }

  async function send() {
    const revisao = textRef.current;
    const body = revisao.trim();
    // Processando anexo ainda é envio pela metade: esperar evita mandar sem o
    // arquivo que a pessoa acabou de soltar.
    if ((!body && filesRef.current.length === 0) || sendingRef.current || processingRef.current) {
      return;
    }
    if (janelaFechadaAgora()) {
      setError("A janela de 24 horas fechou. Reabra a conversa com um modelo aprovado.");
      return;
    }

    const daConversa = conversationId;
    const doUsuario = currentUserId;

    sendingRef.current = true;
    setSending(true);
    setError(null);

    // Anexo continua esperando a resposta: o upload tem estado próprio na tela,
    // e um balão provisório sem a mídia carregada só confundiria.
    if (filesRef.current.length > 0) {
      const aEnviar = [...filesRef.current];
      const total = aEnviar.length;
      setProgress({ done: 0, total });

      let legendaJaFoi = false;

      try {
        // Um arquivo por mensagem — a Cloud API não aceita várias mídias na
        // mesma. A legenda vai só na primeira, como no WhatsApp.
        for (const [index, item] of aEnviar.entries()) {
          const legenda = legendaJaFoi ? "" : body;
          const ok = await uploadAndSend(item, legenda);

          // Para na primeira falha e mantém o que ainda não foi: reenviar o
          // que já chegou duplicaria mensagem para o cliente.
          if (!ok) return;

          // Confirmado: sai da fila na hora. Se o PRÓXIMO estourar uma
          // exceção, este não volta a aparecer nem é reenviado.
          setFiles(filesRef.current.filter((f) => f !== item));

          if (legenda) {
            // A legenda foi junto do primeiro arquivo; do segundo em diante ela
            // não pode se repetir, nem mesmo se algo falhar no meio.
            legendaJaFoi = true;
            limparSeIntacto(doUsuario, daConversa, revisao);
          }

          setProgress({ done: index + 1, total });
        }

        textareaRef.current?.focus();
      } catch {
        setError("Sem conexão com o servidor.");
      } finally {
        setProgress(null);
        sendingRef.current = false;
        setSending(false);
      }
      return;
    }

    // Gerado aqui: se a resposta se perder e o usuário reenviar, o backend
    // reconhece a mesma tentativa em vez de mandar duas mensagens ao cliente.
    const clientRef = crypto.randomUUID();

    // O balão provisório aparece na hora, mas o texto FICA no campo até o
    // servidor confirmar: trocar de conversa ou recarregar no meio do envio
    // não pode apagar o que a pessoa escreveu.
    onPending(clientRef, body);

    let ok = false;
    try {
      ok = await sendText(body, clientRef);
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      onPendingDone(clientRef);
      sendingRef.current = false;
      setSending(false);
    }

    if (ok) {
      limparSeIntacto(doUsuario, daConversa, revisao);
      textareaRef.current?.focus();
    }
  }

  /** Áudio gravado vai direto, como no WhatsApp — sem passo de confirmação. */
  async function sendRecording(recorded: File) {
    // Gravar enquanto uma leva de anexos é comprimida atropelaria a fila.
    if (sendingRef.current || processingRef.current) return;
    if (janelaFechadaAgora()) {
      setError("A janela de 24 horas fechou. Reabra a conversa com um modelo aprovado.");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError(null);

    try {
      await uploadAndSend(recorded, "");
    } catch {
      setError("Sem conexão com o servidor.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia, Shift+Enter quebra linha — como no WhatsApp Web.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  if (precisaModelo) {
    return (
      <div className="shrink-0 space-y-2.5 border-t border-border bg-surface px-3 py-3">
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-amber-200/90 ring-1 ring-inset ring-amber-500/20">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-400" />
          {nuncaEscreveu ? (
            <p>
              Este cliente ainda não enviou nenhuma mensagem. Pelas regras da Meta, o primeiro
              contato precisa ser um modelo aprovado — depois que ele responder, a conversa fica
              livre por 24 horas.
            </p>
          ) : (
            <p>
              A janela de 24 horas expirou. Pelas regras da Meta, só é possível reabrir esta conversa
              com um modelo aprovado — ou aguardar o cliente enviar uma nova mensagem.
            </p>
          )}
        </div>

        <TemplateDialog
          conversationId={conversationId}
          accountId={conversation.whatsapp_account_id}
          onSent={onSent}
        />
      </div>
    );
  }

  return (
    <div
      onDragOver={(event) => {
        // Só reage a arquivo: arrastar texto selecionado não vira anexo.
        if (!event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={handleDrop}
      className={cn(
        "relative shrink-0 border-t border-border bg-surface px-3 py-2.5",
        dragging && "ring-2 ring-inset ring-amber-400/70",
      )}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/90 text-xs font-medium text-amber-200">
          Solte para anexar (até {MAX_FILES} arquivos)
        </div>
      ) : null}
      {janela.state === "acabando" ? (
        <p className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/[0.08] px-2.5 py-2 text-xs text-amber-200/90 ring-1 ring-inset ring-amber-500/20">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>
            <strong className="font-semibold">{janela.label}.</strong> Depois disso, só com um
            modelo aprovado.
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-2 px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="mb-2 space-y-1">
          <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
            <span>
              {files.length === 1 ? "1 arquivo" : `${files.length} arquivos`}
              {files.length > 1 ? " · vão como mensagens separadas" : ""}
            </span>
            {progress ? (
              <span className="tabular-nums text-primary">
                enviando {progress.done + 1} de {progress.total}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setFiles([])}
                disabled={sending}
                className="transition-colors hover:text-foreground"
              >
                Remover todos
              </button>
            )}
          </div>

          <ul className="max-h-44 space-y-1 overflow-y-auto">
            {files.map((item, index) => (
              <li
                key={`${item.name}-${item.size}-${index}`}
                className="flex items-center gap-2 rounded-lg bg-surface-muted px-2 py-1.5 text-xs ring-1 ring-inset ring-border"
              >
                <Thumb file={item} />
                <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {(item.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  disabled={sending}
                  className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="sr-only">Remover {item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPTED_MIME_TYPES.join(",")}
          onChange={(e) => void pickFile(e)}
          aria-label="Anexar arquivo"
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={sending || processing}
          title="Anexar arquivo (ou cole/arraste aqui)"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
          <span className="sr-only">Anexar arquivo</span>
        </Button>

        <QuickReplies
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          currentText={text}
          disabled={sending}
          onInsert={(body) => {
            // Acrescenta ao que já foi digitado em vez de substituir: o
            // consignador costuma escrever "Oi João!" antes de colar o padrão.
            setText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${body}` : body));
            textareaRef.current?.focus();
          }}
        />

        <AudioRecorder
          disabled={sending || processing}
          onRecorded={(f) => void sendRecording(f)}
        />

        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          // Texto curto de propósito: no celular sobram ~165px depois dos
          // quatro botões, e "Escreva uma mensagem…" quebrava em duas linhas
          // dentro de um campo de uma linha só — a segunda ficava cortada.
          placeholder={files.length > 0 ? "Legenda (opcional)…" : "Mensagem…"}
          rows={1}
          aria-label="Mensagem"
          className="max-h-40 min-h-[38px] min-w-0 resize-none rounded-xl py-2"
        />

        <Button
          onClick={() => void send()}
          disabled={sending || processing || (text.trim().length === 0 && files.length === 0)}
          size="icon"
          title="Enviar (Enter)"
          className="shrink-0 rounded-full"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
          <span className="sr-only">Enviar</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Miniatura do anexo antes de enviar. A URL de objeto nasce e morre junto do
 * item: remover um arquivo libera a memória dele na hora, sem esperar recarga.
 */
function Thumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const created = URL.createObjectURL(file);
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [file]);

  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-inset ring-border"
      />
    );
  }

  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-secondary text-muted-foreground">
      {file.type.startsWith("video/") || file.type.startsWith("audio/") ? (
        <Paperclip className="h-4 w-4" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
    </span>
  );
}
