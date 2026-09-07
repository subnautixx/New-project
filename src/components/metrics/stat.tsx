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
        "motion-enter min-w-0 rounded-xl border bg-surface px-3.5 py-3 transition-colors",
        emphasis ? "border-primary/25 bg-primary/[0.04]" : "border-border",
      )}
    >
      {/* No celular cabem duas colunas, e aí "Mensagens recebidas" não cabe numa
          linha só — cortar vira "MENSAGENS RECEBI…". Quebra em duas linhas; a
          grade iguala a altura dos cartões da mesma linha. A partir de sm o
          rótulo cabe inteiro e o corte volta a ser só uma proteção. */}
      <p className="text-[11px] font-medium uppercase leading-4 tracking-wide text-muted-foreground sm:truncate">
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
