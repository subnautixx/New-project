/**
 * Helpers de template usados nos dois lados: o servidor monta o payload da
 * Meta, o navegador mostra a prévia preenchida. Ficam separados de `client.ts`
 * justamente porque aquele módulo é `server-only` — o token de acesso vive lá.
 */

/**
 * Conta as variáveis `{{1}}`, `{{2}}` de um corpo de template.
 * Usa o maior índice, não a quantidade de ocorrências: um template pode repetir
 * `{{1}}` e pular numeração, e o que a Meta espera é a lista posicional.
 */
export function countTemplateVariables(bodyText: string | null | undefined): number {
  if (!bodyText) return 0;

  let max = 0;
  for (const match of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const index = Number(match[1]);
    if (Number.isFinite(index) && index > max) max = index;
  }

  return max;
}

/** Substitui as variáveis para guardar no histórico o texto que o cliente viu. */
export function renderTemplateBody(
  bodyText: string | null | undefined,
  parameters: string[],
): string {
  if (!bodyText) return "";

  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (original, rawIndex: string) => {
    const value = parameters[Number(rawIndex) - 1];
    return value === undefined ? original : value;
  });
}
