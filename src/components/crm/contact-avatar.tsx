"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { contactPhotoUrl } from "@/lib/contacts/photo";
import { cn, initials } from "@/lib/utils";

/**
 * Avatar do cliente: foto quando existe, iniciais quando não.
 *
 * A imagem só é pedida quando há `photoPath`. Deixar o navegador tentar e
 * receber 404 encheria a lista de requisições inúteis — com 200 conversas na
 * inbox, seriam 200 respostas de erro a cada carregamento.
 */
export function ContactAvatar({
  contactId,
  name,
  photoPath,
  className,
  highlighted = false,
}: {
  contactId: string;
  name: string;
  photoPath: string | null;
  className?: string;
  /** Realça as iniciais quando a conversa tem mensagem não lida. */
  highlighted?: boolean;
}) {
  const src = contactPhotoUrl(contactId, photoPath);

  return (
    <Avatar className={cn("h-9 w-9 shrink-0", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- rota autenticada, sem otimização do Next
        <img
          src={src}
          alt={name}
          loading="lazy"
          className="h-full w-full animate-in fade-in object-cover duration-300"
        />
      ) : null}

      <AvatarFallback
        className={cn(
          "text-[11px] font-semibold",
          highlighted ? "bg-primary/15 text-primary" : "bg-surface-muted text-muted-foreground",
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
