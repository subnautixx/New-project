import { cn } from "@/lib/utils";

/**
 * Bloco cinza que ocupa o lugar do conteúdo enquanto o servidor responde.
 *
 * O esqueleto imita o layout que vai chegar — alturas e larguras próximas das
 * reais. Um spinner genérico no meio da tela diz "espere"; um esqueleto diz
 * "é isto que vem", e a troca não desloca nada.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-muted", className)} />;
}

/** Cabeçalho das telas internas, na mesma altura do PageHeader real. */
export function SkeletonPageHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/40 px-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-52" />
      </div>
    </header>
  );
}

/** Linhas de uma tabela, com a mesma altura de linha das listas reais. */
export function SkeletonRows({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-px", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-[38%]" />
            <Skeleton className="h-2.5 w-[24%]" />
          </div>
          <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
          <Skeleton className="hidden h-2.5 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}
