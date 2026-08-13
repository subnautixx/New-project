import type * as React from "react";

/** Cabeçalho padrão das telas fora da inbox. Mesma altura da barra da conversa. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/40 px-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[13px] font-semibold leading-5 tracking-tight">{title}</h1>
        {description ? (
          <p className="truncate text-[11px] leading-4 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
