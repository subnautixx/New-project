"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Carregamento de binário vindo de rota autenticada.
 *
 * Existe porque `<img src="/api/...">`, `<audio src>`, `<video src>` e link não
 * passam por nenhum interceptador de `fetch`: o navegador dispara a requisição
 * sozinho e não anexa cabeçalho de autorização em nenhuma delas. Só manda
 * cookie. Onde a sessão não vive em cookie, tudo isso volta 401 e o elemento
 * fica vazio, sem erro visível.
 *
 * Buscando por `fetch`, a requisição carrega a sessão do mesmo jeito que
 * qualquer outra chamada de API, e o binário vira uma URL de objeto que as
 * tags conseguem consumir. Funciona com sessão em cookie ou em cabeçalho.
 */

/** Avisa quando o elemento chega perto da tela, para só então baixar. */
export function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;

    // Navegador sem suporte baixa logo: melhor cedo do que não mostrar.
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      // Começa a baixar um pouco antes de aparecer, para chegar pronto.
      { rootMargin: "400px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  return { ref, near };
}

/**
 * Baixa `url` e devolve um endereço local para as tags usarem.
 * `enabled` em `false` não busca nada — combina com `useNearViewport`.
 */
export function useAuthedObjectUrl(url: string | null, enabled: boolean) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !url) return;

    let active = true;
    let created: string | null = null;

    void (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));

        const blob = await response.blob();
        if (!active) return;

        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      } catch {
        if (active) setFailed(true);
      }
    })();

    return () => {
      active = false;
      // Sem isto, uma conversa longa com muitas fotos deixaria dezenas de
      // megabytes presos em URLs de objeto até recarregar a página.
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, enabled]);

  return { objectUrl, failed };
}
