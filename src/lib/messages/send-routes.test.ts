import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ send: vi.fn(), queries: [] as Array<{ data: unknown; error: unknown }>,
  filters: [] as Array<[string, unknown]> }));
vi.mock("@/lib/auth/api", () => ({ authorizeRequest: async () => ({
  ok: true, actor: { id: "user" }, supabase: {},
}) }));
vi.mock("@/lib/whatsapp/send-guard", () => ({ authorizeConversationSend: async () => ({
  ok: true, context: { contactPhone: "+5511900000000", contactStatus: "contatado",
    contactId: "contact", account: { account: { id: "account" }, credentials: {} } },
}) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/whatsapp/client", () => ({
  sendTextMessage: mocks.send, sendMediaMessage: mocks.send, sendTemplateMessage: mocks.send,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const q = {
        select: () => q, insert: () => q, update: () => q,
        eq: (field: string, value: unknown) => { mocks.filters.push([field, value]); return q; },
        maybeSingle: async () => mocks.queries.shift(),
        single: async () => mocks.queries.shift(),
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/video" }, error: null }) }) },
  }),
}));
import { POST as text } from "@/app/api/messages/send/route";
import { POST as media } from "@/app/api/messages/send-media/route";
import { POST as template } from "@/app/api/messages/send-template/route";
const conversationId = "11111111-1111-4111-8111-111111111111";
const clientRef = "22222222-2222-4222-8222-222222222222";
const queued = { id: "message", status: "queued", updated_at: "v1" };
const answer = (data: unknown, error: unknown = null) => ({ data, error });
beforeEach(() => {
  mocks.send.mockReset().mockResolvedValue({ ok: true, providerMessageId: "wamid.test" });
  mocks.queries.length = 0; mocks.filters.length = 0;
});
describe.each([
  ["text", text, { text: "Olá" }],
  ["media", media, { path: `outbound/${conversationId}/video.mp4`, mimeType: "video/mp4", filename: "video.mp4" }],
  ["template", template, { templateName: "approved", languageCode: "pt_BR", parameters: [] }],
] as const)("%s send lifecycle", (_name, post, extra) => {
  const request = () => new Request("https://example.test/api", {
    method: "POST", body: JSON.stringify({ conversationId, clientRef, ...extra }),
  });
  it("does not call Meta again for an existing queued attempt", async () => {
    mocks.queries.push(answer(queued));
    const response = await post(request());
    expect(response.status).toBe(202);
    expect((await response.json()).messageRecord).toEqual(queued);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.filters).toEqual(expect.arrayContaining([
      ["client_ref", clientRef], ["conversation_id", conversationId], ["sent_by_user_id", "user"],
    ]));
  });
  it("rereads a unique-key race without sending again", async () => {
    mocks.queries.push(answer(null), answer(null, { code: "23505" }), answer({ ...queued, status: "sent" }));
    const response = await post(request());
    expect(response.status).toBe(200);
    expect((await response.json()).deduplicated).toBe(true);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("a database lookup error prevents the external call", async () => {
    mocks.queries.push(answer(null, { message: "offline" }));
    expect((await post(request())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("failed persistence is uncertain instead of false success", async () => {
    mocks.queries.push(answer(null), answer(queued), answer(null, { message: "offline" }));
    const response = await post(request());
    expect(response.status).toBe(202);
    expect((await response.json()).error).toBe("persist_failed");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("final update is conditional on the inserted queued version", async () => {
    mocks.queries.push(answer(null), answer(queued), answer({ ...queued, status: "sent" }));
    expect((await post(request())).status).toBe(201);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.filters).toEqual(expect.arrayContaining([["status", "queued"], ["updated_at", "v1"]]));
  });
});
