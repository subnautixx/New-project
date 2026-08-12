import { cn } from "@/lib/utils";

/**
 * Marca 4FMOTORS: apenas tipografia. Sem ícone decorativo — a identidade vem
 * do peso da fonte e do acento no "4F".
 */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "select-none font-semibold tracking-[0.18em] text-foreground",
        compact ? "text-sm" : "text-base",
        className,
      )}
    >
      <span className="text-primary">4F</span>
      {compact ? "" : "MOTORS"}
    </span>
  );
}
