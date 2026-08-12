"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchContactNotes } from "@/lib/data/queries";
import { formatDateTime } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ContactNote } from "@/lib/types/views";

export function ContactNotes({
  contactId,
  initialNotes,
  currentUserId,
}: {
  contactId: string;
  initialNotes: ContactNote[];
  currentUserId: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = body.trim();
    if (!text || pending) return;

    setPending(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: insertError } = await supabase
      .from("notes")
      .insert({ contact_id: contactId, author_user_id: currentUserId, body: text });

    if (insertError) {
      setError("Não foi possível salvar a nota.");
    } else {
      setBody("");
      setNotes(await fetchContactNotes(supabase, contactId));
    }

    setPending(false);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="O que aconteceu neste atendimento?"
          rows={3}
          maxLength={2000}
          aria-label="Nova nota"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => void submit()} disabled={pending || !body.trim()}>
            {pending ? "Salvando…" : "Adicionar nota"}
          </Button>
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md bg-surface-muted p-3 text-sm">
              <p className="whitespace-pre-wrap break-words">{note.body}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {note.author?.full_name ?? "—"} · {formatDateTime(note.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
