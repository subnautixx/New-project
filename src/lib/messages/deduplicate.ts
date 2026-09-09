import "server-only";
import { NextResponse } from "next/server";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { MESSAGE_SELECT, UNCERTAIN_MESSAGE } from "./outcome";

/** Every replay returns the existing row; it never calls the provider again. */
export async function existingAttempt(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  clientRef: string,
  conversationId: string,
  userId: string,
): Promise<Response | null> {
  const { data, error } = await admin.from("messages")
    .select(MESSAGE_SELECT)
    .eq("client_ref", clientRef)
    .eq("conversation_id", conversationId)
    .eq("sent_by_user_id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 503 });
  if (!data) return null;
  if (data.status === "queued") {
    return NextResponse.json({ error: "send_uncertain", message: UNCERTAIN_MESSAGE,
      messageRecord: data, deduplicated: true }, { status: 202 });
  }
  if (data.status === "failed") {
    return NextResponse.json({ error: "send_failed", message: data.error_message,
      messageRecord: data, deduplicated: true }, { status: 502 });
  }
  return NextResponse.json({ message: data, deduplicated: true });
}
