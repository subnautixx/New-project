"use client";

import { usePathname } from "next/navigation";

/**
 * Suaviza a troca de tela.
 *
 * A chave é o caminho, não a URL inteira: `/inbox?c=<id>` seleciona uma
 * conversa sem trocar de tela, e reanimar ali faria a inbox piscar a cada
 * clique na lista.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="motion-fade flex min-w-0 flex-1 flex-col">
      {children}
    </div>
  );
}
