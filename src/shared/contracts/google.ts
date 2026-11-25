import type { Contact } from "../../utils/contacts";

export const GOOGLE_SIGNIN_SCOPES = ["openid", "email", "profile"] as const;
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";

export type GoogleOAuthMode = "signin" | "link" | "scopes";
export type GoogleSyncFeature = "calendar" | "contacts";
export type GoogleOAuthReturnMode = "popup" | "redirect";
export type GoogleInitialSyncChoice = "merge" | "discard";
export type GoogleEventColor = "blue" | "red" | "green" | "orange" | "purple";

export interface GoogleSyncedCalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  color: GoogleEventColor;
  calendarId?: string;
  location?: string;
  notes?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  googleEtag?: string;
  googleRecurringEventId?: string;
  googleSyncedUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface GoogleLinkedAccountPublic {
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  scopes: string[];
  hasCalendarScope: boolean;
  hasContactsScope: boolean;
  linkedAt: number;
  calendarLastSyncedAt: number | null;
  contactsLastSyncedAt: number | null;
}

export interface GoogleStatusResponse {
  configured: boolean;
  linked: boolean;
  hasPassword?: boolean;
  account: GoogleLinkedAccountPublic | null;
}

export interface GoogleOAuthStartRequest {
  mode: GoogleOAuthMode;
  features?: GoogleSyncFeature[];
  returnMode?: GoogleOAuthReturnMode;
}

export interface GoogleOAuthStartResponse {
  authUrl: string;
}

export interface GooglePendingProfile {
  email: string | null;
  name: string | null;
  picture: string | null;
}

export type GoogleOAuthPostMessage =
  | {
      type: "ryos:google-oauth-result";
      status: "authenticated";
      username: string;
      autoLinked?: boolean;
      account: GoogleLinkedAccountPublic;
    }
  | {
      type: "ryos:google-oauth-result";
      status: "needs_username";
      pendingToken: string;
      suggestedUsername: string;
      profile: GooglePendingProfile;
    }
  | {
      type: "ryos:google-oauth-result";
      status: "linked" | "scopes_granted";
      username: string;
      account: GoogleLinkedAccountPublic;
    }
  | {
      type: "ryos:google-oauth-result";
      status: "error";
      error: string;
    };

export interface GoogleCompleteSignupRequest {
  pendingToken: string;
  username: string;
}

export interface GoogleCompleteSignupResponse {
  user: {
    username: string;
  };
  account: GoogleLinkedAccountPublic;
}

export interface GoogleCalendarDeletionInput {
  localId: string;
  googleEventId: string;
  googleCalendarId?: string;
}

export interface GoogleCalendarSyncRequest {
  mode?: "incremental" | "reset_pull";
  timeZone?: string;
  upserts?: GoogleSyncedCalendarEvent[];
  deletions?: GoogleCalendarDeletionInput[];
}

export interface GoogleCalendarPushedItem {
  localId: string;
  event: GoogleSyncedCalendarEvent;
}

export interface GoogleCalendarSyncResponse {
  fullSync: boolean;
  pushed: GoogleCalendarPushedItem[];
  deletedLocalIds: string[];
  remoteUpserts: GoogleSyncedCalendarEvent[];
  remoteDeletedGoogleIds: string[];
  syncedAt: number;
}

export interface GoogleContactsDeletionInput {
  localId: string;
  googleResourceName: string;
}

export interface GoogleContactsSyncRequest {
  mode?: "incremental" | "reset_pull";
  upserts?: Contact[];
  deletions?: GoogleContactsDeletionInput[];
}

export interface GoogleContactsPushedItem {
  localId: string;
  contact: Contact;
}

export interface GoogleContactsSyncResponse {
  fullSync: boolean;
  pushed: GoogleContactsPushedItem[];
  deletedLocalIds: string[];
  remoteUpserts: Contact[];
  remoteDeletedResourceNames: string[];
  syncedAt: number;
}
