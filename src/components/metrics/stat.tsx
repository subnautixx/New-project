import { cn } from "@/lib/utils";

/**
 * Número em destaque com rótulo. Sem card decorado, sem ícone, sem cor por
 * padrão — a leitura tem que ser instantânea numa linha de seis indicadores.
 */
export function Stat({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold leading-none",
          emphasis ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
