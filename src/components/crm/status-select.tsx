"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_STATUSES, STATUS_LABEL } from "@/lib/domain/lead";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LeadStatus } from "@/lib/types/database";

/**
 * Troca o status do lead. A escrita vai direto pelo cliente do Supabase — a
 * RLS já garante que só o responsável (ou o admin) consegue alterar, e o
 * trigger grava o histórico.
 */
export function StatusSelect({
  contactId,
  value,
  onChanged,
  className,
}: {
  contactId: string;
  value: LeadStatus;
  onChanged?: () => void;
  className?: string;
}) {
  const [status, setStatus] = useState<LeadStatus>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(next: string) {
    const nextStatus = next as LeadStatus;
    const previous = status;

    setStatus(nextStatus);
    setSaving(true);
    setError(false);

    const { error: updateError } = await createSupabaseBrowserClient()
      .from("contacts")
      .update({ status: nextStatus })
      .eq("id", contactId);

    if (updateError) {
      setStatus(previous);
      setError(true);
    } else {
      onChanged?.();
    }

    setSaving(false);
  }

  return (
    <div className={className}>
      <Select value={status} onValueChange={handleChange} disabled={saving}>
        <SelectTrigger aria-label="Status do cliente">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ALL_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="mt-1 text-xs text-destructive">Não foi possível salvar.</p> : null}
    </div>
  );
}
