"use client";

import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { QuickReplyRow } from "@/lib/types/database";
import { cn } from "@/lib/utils";

/**
 * Respostas rápidas.
 *
 * O consignador explica como funciona a consignação dezenas de vezes por dia.
 * É a economia de tempo mais direta do sistema — e por isso mora dentro do
 * campo de mensagem, não numa tela de configuração.
 *
 * A lista traz as respostas da loja (sem dono) e as pessoais. A RLS decide.
 */
export function QuickReplies({
  currentUserId,
  isAdmin,
  currentText,
  onInsert,
  disabled,
}: {
  currentUserId: string;
  isAdmin: boolean;
  /** Texto já digitado, para virar resposta rápida com um clique. */
  currentText: string;
  onInsert: (body: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<QuickReplyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const { data } = await createSupabaseBrowserClient()
      .from("quick_replies")
      .select("*")
      .order("title");

    setReplies(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && replies.length === 0 && !loading) void load();
    // Abrir com texto digitado sugere salvá-lo como nova resposta.
    if (open && currentText.trim().length > 20 && replies.length > 0) setBody(currentText.trim());
  }, [open, load, replies.length, loading, currentText]);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? replies.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          r.body.toLowerCase().includes(term) ||
          (r.shortcut ?? "").toLowerCase().includes(term),
      )
    : replies;

  async function create() {
    if (!title.trim() || !body.trim() || saving) return;

    setSaving(true);

    const { error } = await createSupabaseBrowserClient().from("quick_replies").insert({
      // Consignador cria a própria; admin cria para a loja inteira.
      owner_user_id: isAdmin ? null : currentUserId,
      title: title.trim(),
      body: body.trim(),
      created_by: currentUserId,
    });

    if (!error) {
      setTitle("");
      setBody("");
      setCreating(false);
      await load();
    }

    setSaving(false);
  }

  async function remove(id: string) {
    await createSupabaseBrowserClient().from("quick_replies").delete().eq("id", id);
    setReplies((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          title="Respostas rápidas"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Zap className="h-4 w-4" />
          <span className="sr-only">Respostas rápidas</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[360px] p-0">
        {creating ? (
          <div className="space-y-3 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="qr-title">Título</Label>
              <Input
                id="qr-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Como funciona a consignação"
                maxLength={80}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qr-body">Mensagem</Label>
              <Textarea
                id="qr-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                maxLength={2000}
                className="text-sm"
              />
            </div>

            {isAdmin ? (
              <p className="text-[11px] text-muted-foreground">
                Como administrador, esta resposta fica disponível para toda a equipe.
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() => void create()}
                disabled={saving || !title.trim() || !body.trim()}
              >
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-border p-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar resposta…"
                className="h-8 border-transparent bg-surface-muted text-[13px]"
                autoFocus
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {replies.length === 0
                    ? "Nenhuma resposta salva ainda."
                    : "Nada encontrado."}
                </p>
              ) : (
                <ul className="p-1">
                  {filtered.map((reply) => (
                    <li key={reply.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          onInsert(reply.body);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "w-full rounded-md px-2.5 py-2 pr-8 text-left transition-colors",
                          "hover:bg-surface-muted",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{reply.title}</span>
                          {reply.owner_user_id === null ? (
                            <span className="shrink-0 rounded bg-secondary px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                              Loja
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {reply.body}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void remove(reply.id)}
                        title="Excluir"
                        className="absolute right-1.5 top-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span className="sr-only">Excluir resposta</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs"
                onClick={() => {
                  setBody(currentText.trim());
                  setCreating(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                {currentText.trim().length > 0
                  ? "Salvar o texto digitado como resposta"
                  : "Nova resposta rápida"}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
