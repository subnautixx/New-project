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
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-surface px-3.5 py-3 transition-colors",
        emphasis ? "border-primary/25 bg-primary/[0.04]" : "border-border",
      )}
    >
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold leading-none tracking-tight tabular-nums",
          emphasis ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1.5 truncate text-[11px] leading-4 text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
