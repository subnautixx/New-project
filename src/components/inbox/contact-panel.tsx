"use client";

import { ExternalLink, Loader2, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusSelect } from "@/components/crm/status-select";
import { TransferDialog } from "@/components/crm/transfer-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Separator } from "@/components/ui/misc";
import { Textarea } from "@/components/ui/textarea";
import { fetchContactNotes, fetchStatusHistory } from "@/lib/data/queries";
import { STATUS_LABEL } from "@/lib/domain/lead";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ContactNote, ConversationListItem, StatusHistoryEntry, UserRef } from "@/lib/types/views";
import { formatCurrencyBRL, formatKm } from "@/lib/utils";

interface Props {
  conversation: ConversationListItem;
  users: UserRef[];
  isAdmin: boolean;
  currentUserId: string;
  onChanged: () => void;
}

export function ContactPanel({ conversation, users, isAdmin, currentUserId, onChanged }: Props) {
  const { contact, vehicle } = conversation;
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [history, setHistory] = useState<StatusHistoryEntry[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    setLoading(true);
    Promise.all([fetchContactNotes(supabase, contact.id), fetchStatusHistory(supabase, contact.id)])
      .then(([loadedNotes, loadedHistory]) => {
        if (cancelled) return;
        setNotes(loadedNotes);
        setHistory(loadedHistory);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  async function addNote() {
    const body = noteText.trim();
    if (!body || savingNote) return;

    setSavingNote(true);
    const supabase = createSupabaseBrowserClient();

    const { error } = await supabase
      .from("notes")
      .insert({ contact_id: contact.id, author_user_id: currentUserId, body });

    if (!error) {
      setNoteText("");
      setNotes(await fetchContactNotes(supabase, contact.id));
    }

    setSavingNote(false);
  }

  const vehicleTitle = [vehicle?.brand, vehicle?.model, vehicle?.version]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className="flex h-full w-full flex-col overflow-y-auto border-l border-border bg-surface">
      <div className="space-y-4 p-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">{contact.full_name}</h2>
          <p className="text-xs text-muted-foreground">{formatPhone(contact.phone_e164)}</p>
        </div>

        <StatusSelect
          contactId={contact.id}
          value={contact.status}
          onChanged={onChanged}
        />

        <Separator />

        <div className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Veículo
          </h3>

          {vehicle ? (
            <div className="space-y-3">
              <Field label="Modelo">{vehicleTitle || "—"}</Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ano">
                  {vehicle.year ? `${vehicle.year}${vehicle.model_year ? `/${vehicle.model_year}` : ""}` : "—"}
                </Field>
                <Field label="KM">{formatKm(vehicle.km)}</Field>
              </div>
              <Field label="Preço anunciado">{formatCurrencyBRL(vehicle.listed_price)}</Field>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Prospecção
          </h3>

          <Field label="Origem">
            {vehicle?.source_platform ?? contact.source_platform ?? "—"}
          </Field>

          <Field label="Anúncio">
            {vehicle?.listing_url ?? contact.listing_url ? (
              <a
                href={(vehicle?.listing_url ?? contact.listing_url) as string}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                Abrir anúncio
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              "—"
            )}
          </Field>

          <Field label="Responsável">
            <div className="flex items-center justify-between gap-2">
              <span>{conversation.assignee?.full_name ?? "—"}</span>
              {isAdmin ? (
                <TransferDialog
                  conversationId={conversation.id}
                  currentUserId={conversation.assigned_user_id}
                  users={users}
                  onTransferred={onChanged}
                />
              ) : null}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cadastrado em">{formatDate(contact.created_at)}</Field>
            <Field label="Última interação">{formatDate(contact.last_interaction_at)}</Field>
          </div>

          {contact.next_action_at ? (
            <Field label="Próxima ação">
              {formatDateTime(contact.next_action_at)}
              {contact.next_action_note ? ` · ${contact.next_action_note}` : ""}
            </Field>
          ) : null}

          {contact.notes ? <Field label="Observações">{contact.notes}</Field> : null}
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Notas
          </h3>

          <div className="flex items-end gap-2">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Anotar algo sobre este cliente…"
              rows={2}
              className="min-h-[56px] text-sm"
              aria-label="Nova nota"
            />
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => void addNote()}
              disabled={savingNote || noteText.trim().length === 0}
              title="Salvar nota"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="sr-only">Salvar nota</span>
            </Button>
          </div>

          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma nota ainda.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded-md bg-surface-muted p-2.5 text-xs">
                  <p className="whitespace-pre-wrap break-words text-foreground/90">{note.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {note.author?.full_name ?? "—"} · {formatDateTime(note.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {history.length > 0 ? (
          <>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Histórico de status
              </h3>
              <ul className="space-y-1.5">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {STATUS_LABEL[entry.to_status]}
                    </Badge>
                    <span className="truncate text-muted-foreground">
                      {formatDateTime(entry.created_at)}
                      {entry.changed_by ? ` · ${entry.changed_by.full_name}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
