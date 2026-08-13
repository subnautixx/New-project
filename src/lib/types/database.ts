/**
 * Tipos do banco, escritos à mão e mantidos em sincronia com
 * `supabase/migrations`. Podem ser substituídos por
 * `supabase gen types typescript` sem alterar o restante do código.
 */

export type UserRole = "admin" | "consignador";

export type WaAccountMode = "shared" | "individual";

export type WaAccountStatus = "pending" | "connected" | "disconnected" | "error";

export type LeadStatus =
  | "novo"
  | "contatado"
  | "respondeu"
  | "interessado"
  | "negociacao"
  | "consignado"
  | "perdido"
  | "sem_resposta";

export type MessageDirection = "inbound" | "outbound";

export type MessageType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "template"
  | "system"
  | "unsupported";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received"
  | "deleted";

export type ActivityType =
  | "message_sent"
  | "message_received"
  | "contact_created"
  | "contact_status_changed"
  | "conversation_assigned"
  | "note_added";

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ProfileRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WhatsappAccountRow = {
  id: string;
  display_name: string;
  phone_e164: string;
  phone_number_id: string | null;
  waba_id: string | null;
  mode: WaAccountMode;
  status: WaAccountStatus;
  coexistence_enabled: boolean;
  default_owner_user_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WhatsappAccountSecretRow = {
  whatsapp_account_id: string;
  access_token: string;
  app_secret: string | null;
  verify_token: string | null;
  updated_at: string;
}

export type UserWhatsappPermissionRow = {
  id: string;
  user_id: string;
  whatsapp_account_id: string;
  can_send: boolean;
  created_at: string;
}

export type ContactRow = {
  id: string;
  full_name: string;
  phone_e164: string;
  phone_raw: string | null;
  owner_user_id: string;
  status: LeadStatus;
  source_platform: string | null;
  listing_url: string | null;
  notes: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  last_interaction_at: string | null;
  photo_path: string | null;
  opt_in_at: string | null;
  opt_in_source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type VehicleRow = {
  id: string;
  contact_id: string;
  brand: string | null;
  model: string | null;
  version: string | null;
  year: number | null;
  model_year: number | null;
  km: number | null;
  color: string | null;
  plate: string | null;
  listed_price: number | null;
  listing_url: string | null;
  source_platform: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationRow = {
  id: string;
  contact_id: string;
  whatsapp_account_id: string;
  assigned_user_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  unread_count: number;
  is_archived: boolean;
  service_window_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationAssignmentRow = {
  id: string;
  conversation_id: string;
  from_user_id: string | null;
  to_user_id: string;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export type MessageRow = {
  id: string;
  provider_message_id: string | null;
  conversation_id: string;
  whatsapp_account_id: string;
  contact_id: string;
  direction: MessageDirection;
  message_type: MessageType;
  content: string | null;
  media_id: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  sent_by_user_id: string | null;
  status: MessageStatus;
  error_code: string | null;
  error_message: string | null;
  client_ref: string | null;
  wa_timestamp: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageEventRow = {
  id: string;
  message_id: string;
  status: MessageStatus;
  occurred_at: string;
  raw: Json | null;
  created_at: string;
}

export type NoteRow = {
  id: string;
  contact_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

export type LeadStatusHistoryRow = {
  id: string;
  contact_id: string;
  from_status: LeadStatus | null;
  to_status: LeadStatus;
  changed_by: string | null;
  created_at: string;
}

export type ActivityEventRow = {
  id: string;
  user_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  type: ActivityType;
  occurred_at: string;
  metadata: Json;
}

export type WebhookEventRow = {
  id: string;
  provider: string;
  event_key: string;
  payload: Json;
  signature_valid: boolean;
  processed_at: string | null;
  error: string | null;
  created_at: string;
}

export type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Json;
  ip: string | null;
  created_at: string;
}

export type QuickReplyRow = {
  id: string;
  owner_user_id: string | null;
  title: string;
  body: string;
  shortcut: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MetricsSummaryRow = {
  user_id: string;
  full_name: string | null;
  messages_sent: number;
  messages_received: number;
  contacts_approached: number;
  contacts_replied: number;
  response_rate: number;
  interested_count: number;
  negotiating_count: number;
  consigned_count: number;
  lost_count: number;
  first_activity_at: string | null;
  last_activity_at: string | null;
}

export type MetricsVolumeRow = {
  bucket: string;
  sent: number;
  received: number;
}

/** Row + Insert + Update no formato esperado pelo supabase-js. */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<ProfileRow, Partial<ProfileRow> & { id: string; full_name: string }>;
      whatsapp_accounts: Table<
        WhatsappAccountRow,
        Partial<WhatsappAccountRow> & { display_name: string; phone_e164: string }
      >;
      whatsapp_account_secrets: Table<
        WhatsappAccountSecretRow,
        Partial<WhatsappAccountSecretRow> & { whatsapp_account_id: string; access_token: string }
      >;
      user_whatsapp_permissions: Table<
        UserWhatsappPermissionRow,
        Partial<UserWhatsappPermissionRow> & { user_id: string; whatsapp_account_id: string }
      >;
      contacts: Table<
        ContactRow,
        Partial<ContactRow> & { full_name: string; phone_e164: string; owner_user_id: string }
      >;
      vehicles: Table<VehicleRow, Partial<VehicleRow> & { contact_id: string }>;
      conversations: Table<
        ConversationRow,
        Partial<ConversationRow> & {
          contact_id: string;
          whatsapp_account_id: string;
          assigned_user_id: string;
        }
      >;
      conversation_assignments: Table<
        ConversationAssignmentRow,
        Partial<ConversationAssignmentRow> & { conversation_id: string; to_user_id: string }
      >;
      messages: Table<
        MessageRow,
        Partial<MessageRow> & {
          conversation_id: string;
          whatsapp_account_id: string;
          contact_id: string;
          direction: MessageDirection;
        }
      >;
      message_events: Table<
        MessageEventRow,
        Partial<MessageEventRow> & { message_id: string; status: MessageStatus }
      >;
      notes: Table<
        NoteRow,
        Partial<NoteRow> & { contact_id: string; author_user_id: string; body: string }
      >;
      lead_status_history: Table<
        LeadStatusHistoryRow,
        Partial<LeadStatusHistoryRow> & { contact_id: string; to_status: LeadStatus }
      >;
      activity_events: Table<
        ActivityEventRow,
        Partial<ActivityEventRow> & { type: ActivityType }
      >;
      webhook_events: Table<
        WebhookEventRow,
        Partial<WebhookEventRow> & { event_key: string; payload: Json }
      >;
      audit_logs: Table<AuditLogRow, Partial<AuditLogRow> & { action: string }>;
      quick_replies: Table<
        QuickReplyRow,
        Partial<QuickReplyRow> & { title: string; body: string }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      metrics_user_summary: {
        Args: { p_user_id?: string | null; p_from?: string; p_to?: string };
        Returns: MetricsSummaryRow[];
      };
      metrics_team_summary: {
        Args: { p_from?: string; p_to?: string };
        Returns: MetricsSummaryRow[];
      };
      metrics_volume: {
        Args: {
          p_user_id?: string | null;
          p_from?: string;
          p_to?: string;
          p_bucket?: "hour" | "day";
          p_timezone?: string;
        };
        Returns: MetricsVolumeRow[];
      };
    };
    Enums: {
      user_role: UserRole;
      wa_account_mode: WaAccountMode;
      wa_account_status: WaAccountStatus;
      lead_status: LeadStatus;
      message_direction: MessageDirection;
      message_type: MessageType;
      message_status: MessageStatus;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<never, never>;
  };
}
