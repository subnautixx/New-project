/**
 * Normalização de telefone (foco Brasil).
 *
 * Detalhe que quebra integrações de WhatsApp no Brasil: a Meta às vezes
 * devolve o `wa_id` de celular SEM o nono dígito (formato antigo, 12 dígitos),
 * enquanto o número cadastrado tem 13. Guardamos sempre a forma canônica de
 * 13 dígitos e consultamos por variantes, senão a mesma pessoa vira dois
 * contatos e a conversa se parte em duas.
 */

const BR_CC = "55";

export function onlyDigits(input: string): string {
  return input.replace(/\D+/g, "");
}

/**
 * Converte entrada livre em E.164 (`+55...`).
 * Retorna null quando não dá para interpretar com segurança.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  let digits = onlyDigits(input);
  if (digits.length === 0) return null;

  // Já veio com código de país brasileiro.
  if (digits.startsWith(BR_CC) && (digits.length === 12 || digits.length === 13)) {
    return `+${toBrCanonical(digits)}`;
  }

  // Sem código de país: 10 (fixo) ou 11 (celular) dígitos com DDD.
  if (digits.length === 10 || digits.length === 11) {
    return `+${toBrCanonical(BR_CC + digits)}`;
  }

  // Outros países: aceita como está se tiver tamanho plausível.
  if (digits.length >= 8 && digits.length <= 15) {
    if (input.trim().startsWith("+")) return `+${digits}`;
    // Sem "+" e sem tamanho brasileiro reconhecível: não adivinhar.
    return null;
  }

  digits = "";
  return null;
}

/** Garante o nono dígito em celulares brasileiros. */
function toBrCanonical(digits: string): string {
  if (!digits.startsWith(BR_CC)) return digits;

  const national = digits.slice(2);

  // 10 dígitos = DDD + 8. Se o assinante começa em 6-9, é celular antigo.
  if (national.length === 10) {
    const ddd = national.slice(0, 2);
    const subscriber = national.slice(2);
    const firstDigit = subscriber[0];
    if (firstDigit && firstDigit >= "6" && firstDigit <= "9") {
      return `${BR_CC}${ddd}9${subscriber}`;
    }
  }

  return digits;
}

/**
 * Todas as formas em que este número pode chegar da Meta.
 * Usado para casar um `wa_id` com um contato já cadastrado.
 */
export function phoneVariants(e164: string): string[] {
  const digits = onlyDigits(e164);
  const variants = new Set<string>([`+${digits}`]);

  if (digits.startsWith(BR_CC)) {
    const national = digits.slice(2);

    // 13 dígitos (55 + DDD + 9 + 8) -> versão sem o nono dígito.
    if (national.length === 11 && national[2] === "9") {
      variants.add(`+${BR_CC}${national.slice(0, 2)}${national.slice(3)}`);
    }

    // 12 dígitos (55 + DDD + 8) -> versão com o nono dígito.
    if (national.length === 10) {
      const firstDigit = national[2];
      if (firstDigit && firstDigit >= "6" && firstDigit <= "9") {
        variants.add(`+${BR_CC}${national.slice(0, 2)}9${national.slice(2)}`);
      }
    }
  }

  return [...variants];
}

/** Exibição amigável: +55 (11) 98765-4321 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";

  const digits = onlyDigits(e164);

  if (digits.startsWith(BR_CC) && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.slice(2, 4);
    const subscriber = digits.slice(4);
    const split = subscriber.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${subscriber.slice(0, split)}-${subscriber.slice(split)}`;
  }

  return e164.startsWith("+") ? e164 : `+${digits}`;
}

/** Formato aceito pela Cloud API: dígitos, sem "+". */
export function toWhatsappRecipient(e164: string): string {
  return onlyDigits(e164);
}
