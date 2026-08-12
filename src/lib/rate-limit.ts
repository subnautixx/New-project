/**
 * Rate limit simples, em memória, por janela deslizante.
 *
 * Limitação honesta: em serverless o estado é por instância, então o limite
 * efetivo é maior que o configurado quando há várias instâncias ativas. Para a
 * escala da 4FMOTORS (poucos usuários) isso já contém o abuso acidental —
 * disparo em loop, clique repetido, script mal feito. Se o volume crescer,
 * trocar o Map por Redis/Upstash sem mexer na interface desta função.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;

  // Evita crescimento indefinido do Map em processos de vida longa.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }

  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Apenas para testes. */
export function resetRateLimits(): void {
  buckets.clear();
}
