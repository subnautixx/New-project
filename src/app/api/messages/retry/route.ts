import { handleRetry } from "@/lib/messages/retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleRetry;
