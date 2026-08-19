import { cn } from "@/lib/utils";

/**
 * Marca 4FMOTORS: apenas tipografia. Sem ícone decorativo — a identidade vem
 * do desenho da fonte e do acento no "4F".
 *
 * Archivo em peso 700 com entrelinha apertada: a grotesca estreita é o que
 * letreiro de loja e placa de carro usam. Antes era Inter espaçada, que é o
 * recurso que todo mundo usa quando não escolheu fonte nenhuma.
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "select-none font-display font-bold uppercase tracking-[0.04em] text-foreground",
        compact ? "text-sm" : "text-base",
        className,
      )}
    >
      <span className="text-primary">4F</span>
      {compact ? "" : "MOTORS"}
    </span>
  );
}
