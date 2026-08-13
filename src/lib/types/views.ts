import type {
  ContactRow,
  ConversationRow,
  LeadStatus,
  MessageRow,
  VehicleRow,
  WaAccountMode,
} from "./database";

/** Resumo do veículo exibido junto do cliente. */
export type VehicleSummary = Pick<
  VehicleRow,
  | "id"
  | "brand"
  | "model"
  | "version"
  | "year"
  | "model_year"
  | "km"
  | "listed_price"
  | "listing_url"
  | "source_platform"
>;

export interface UserRef {
  id: string;
  full_name: string;
}

export interface AccountRef {
  id: string;
  display_name: string;
  phone_e164: string;
  mode: WaAccountMode;
}

export type ContactSummary = Pick<
  ContactRow,
  | "id"
  | "full_name"
  | "phone_e164"
  | "status"
  | "source_platform"
  | "listing_url"
  | "notes"
  | "next_action_at"
  | "next_action_note"
  | "last_interaction_at"
  | "photo_path"
  | "owner_user_id"
  | "created_at"
>;

/** Linha da lista de conversas (coluna esquerda da inbox). */
export interface ConversationListItem
  extends Pick<
    ConversationRow,
    | "id"
    | "last_message_at"
    | "last_message_preview"
    | "unread_count"
    | "assigned_user_id"
    | "whatsapp_account_id"
    | "service_window_expires_at"
  > {
  contact: ContactSummary;
  vehicle: VehicleSummary | null;
  assignee: UserRef | null;
  account: AccountRef | null;
}

export type ThreadMessage = Pick<
  MessageRow,
  | "id"
  | "direction"
  | "message_type"
  | "content"
  | "media_id"
  | "media_mime_type"
  | "media_filename"
  | "status"
  | "error_message"
  | "sent_by_user_id"
  | "wa_timestamp"
  | "created_at"
>;

/** Cliente com tudo que a lista e a ficha precisam. */
export interface ContactListItem extends ContactSummary {
  vehicle: VehicleSummary | null;
  owner: UserRef | null;
  conversation_id: string | null;
}

export interface ContactNote {
  id: string;
  body: string;
  created_at: string;
  author: UserRef | null;
}

export interface StatusHistoryEntry {
  id: string;
  from_status: LeadStatus | null;
  to_status: LeadStatus;
  created_at: string;
  changed_by: UserRef | null;
}
