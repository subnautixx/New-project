import { Clock } from "lucide-react";

/**
 * Mensagem que já saiu do campo mas ainda não voltou do servidor.
 *
 * Tem a forma do balão enviado, apagada e com o relógio no lugar do horário —
 * a diferença precisa ser visível, senão quem atende acha que já foi quando
 * ainda está indo. Se a chamada falhar, o balão some e o texto volta para o
 * campo.
 */
export function PendingBubble({ text }: { text: string }) {
  return (
    <div className="motion-enter flex w-full justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-emerald-800/20 px-3 py-2 text-[13px] leading-relaxed text-muted-foreground ring-1 ring-inset ring-emerald-600/15 sm:max-w-[68%]">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground/70">
          <Clock className="h-2.5 w-2.5" />
          enviando
        </span>
      </div>
    </div>
  );
}
