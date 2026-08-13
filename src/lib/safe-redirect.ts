/**
 * Valida o destino pós-login vindo da URL.
 *
 * `next` é controlado por quem monta o link. Checar apenas se começa com "/"
 * não basta: `//site-externo.com` e `/\site-externo.com` também passam, e o
 * navegador trata os dois como endereço absoluto — bastaria mandar esse link
 * para um consignador para levá-lo a uma página de login falsa depois de
 * autenticar de verdade.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/inbox"): string {
  if (!value) return fallback;

  const path = value.trim();

  // Precisa ser caminho absoluto do próprio site.
  if (!path.startsWith("/")) return fallback;

  // Barra dupla ou barra invertida = endereço protocolo-relativo.
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;

  // Um "\" logo após a primeira barra é normalizado para "/" por alguns
  // navegadores, virando o mesmo problema.
  if (/^\/[\\/]/.test(path)) return fallback;

  // Controles e espaços podem burlar as checagens acima depois que o
  // navegador normaliza a URL (ex.: "/\t/site-externo.com").
  for (const char of path) {
    if (char.codePointAt(0)! <= 0x20) return fallback;
  }

  return path;
}
