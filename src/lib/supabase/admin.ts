import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Cliente com service_role: IGNORA RLS.
 *
 * Use apenas onde não existe usuário logado (webhook da Meta) ou onde a
 * permissão já foi verificada explicitamente no código da rota.
 * O import de `server-only` faz o build falhar se isto vazar para o cliente.
 */
export function createSupabaseAdminClient() {
  if (cached) return cached;

  cached = createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  return cached;
}
