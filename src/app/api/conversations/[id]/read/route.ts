import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeRequest } from "@/lib/auth/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().uuid() });

/** Zera o contador de não lidas. A RLS garante que só o dono da conversa consegue. */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeRequest();
  if (!auth.ok) return auth.response;

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", parsed.data.id);

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
