"use client";

import { Camera, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ACCEPTED_PHOTO_TYPES, contactPhotoUrl, validatePhoto } from "@/lib/contacts/photo";
import { cn, initials } from "@/lib/utils";

interface Props {
  /** Nome atual, para as iniciais enquanto não há foto. */
  name: string;
  /** Foto já salva, quando o cliente existe. */
  contactId?: string;
  photoPath?: string | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onRemoveExisting?: () => void;
}

/**
 * Seleção da foto do cliente.
 *
 * O arquivo escolhido só é enviado depois, pelo formulário: no cadastro o
 * cliente ainda não existe quando a foto é escolhida, e não há a quem
 * vinculá-la.
 */
export function PhotoPicker({
  name,
  contactId,
  photoPath,
  file,
  onFileChange,
  onRemoveExisting,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A URL de objeto precisa ser liberada, senão o blob fica na memória a cada
  // troca de foto.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const savedUrl = contactId ? contactPhotoUrl(contactId, photoPath ?? null) : null;
  const shown = preview ?? savedUrl;

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;

    const validation = validatePhoto(chosen.type, chosen.size);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setError(null);
    onFileChange(chosen);
  }

  function clear() {
    onFileChange(null);
    setError(null);
    if (savedUrl) onRemoveExisting?.();
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Escolher foto"
        className={cn(
          "group relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-1 ring-border",
          "transition-all duration-200 hover:ring-2 hover:ring-primary/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- prévia local ou rota autenticada
          <img src={shown} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-surface-muted text-sm font-semibold text-muted-foreground">
            {name.trim() ? initials(name) : <Camera className="h-5 w-5" />}
          </span>
        )}

        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 backdrop-blur-[1px]",
            "transition-opacity duration-200 group-hover:opacity-100",
          )}
        >
          <Camera className="h-4 w-4 text-white" />
        </span>
      </button>

      <div className="min-w-0 space-y-1">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_PHOTO_TYPES.join(",")}
          onChange={pick}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            {shown ? "Trocar foto" : "Adicionar foto"}
          </Button>

          {shown ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={clear}
              title="Remover foto"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Remover foto</span>
            </Button>
          ) : null}
        </div>

        <p className="text-[11px] leading-4 text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            "JPG, PNG ou WEBP, até 5 MB. Opcional."
          )}
        </p>
      </div>
    </div>
  );
}
