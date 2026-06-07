/**
 * Shared contacts tool action contracts (client handlers + server executors).
 */

export const CONTACT_ACTIONS = ["list", "get", "create", "update", "delete"] as const;
export type ContactsAction = (typeof CONTACT_ACTIONS)[number];

export interface ContactsControlInput {
  action: ContactsAction;
  id?: string;
  query?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  organization?: string;
  title?: string;
  notes?: string;
  emails?: string[];
  phones?: string[];
  urls?: string[];
  addresses?: string[];
  birthday?: string | null;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
}

export interface ContactToolRecord {
  id: string;
  displayName: string;
  organization: string;
  title: string;
  emails: string[];
  phones: string[];
  urls: string[];
  addresses: string[];
  telegramUsername: string | null;
  telegramUserId: string | null;
  birthday: string | null;
  notes?: string | null;
  summary?: string | null;
}

export interface ContactsControlOutput {
  success: boolean;
  message: string;
  contacts?: ContactToolRecord[];
  contact?: ContactToolRecord | null;
}
