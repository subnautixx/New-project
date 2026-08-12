"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Cliente do navegador. Só enxerga o que a RLS permitir. */
export function createSupabaseBrowserClient() {
  if (cached) return cached;

  cached = createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return cached;
}
